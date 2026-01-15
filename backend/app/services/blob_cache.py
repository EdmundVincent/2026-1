"""
Azure Blob Storage OCRキャッシュサービス
PDFファイルとOCR結果をユーザー別にBlob Storageに保存・取得
"""

import hashlib
import json
import logging
from datetime import datetime
from typing import Optional, Dict, Any
from azure.storage.blob import BlobServiceClient, BlobClient, ContentSettings
from azure.identity import DefaultAzureCredential
from azure.core.exceptions import ResourceNotFoundError
from app.services.config import config

logger = logging.getLogger(__name__)


class BlobCacheService:
    def __init__(self):
        """Azure Blob Storage クライアントを初期化"""
        self.account_url = config.AZURE_STORAGE_ACCOUNT_URL
        self.container_name = config.AZURE_STORAGE_CONTAINER_NAME
        
        # Managed Identity または環境変数による認証
        if config.AZURE_STORAGE_CONNECTION_STRING:
            self.blob_service_client = BlobServiceClient.from_connection_string(
                config.AZURE_STORAGE_CONNECTION_STRING
            )
        else:
            # Managed Identity使用
            credential = DefaultAzureCredential()
            self.blob_service_client = BlobServiceClient(
                account_url=self.account_url,
                credential=credential
            )

    def calculate_file_hash(self, file_content: bytes) -> str:
        """ファイル内容からMD5ハッシュを計算（高速キャッシュ用）"""
        return hashlib.md5(file_content).hexdigest()

    def get_user_prefix(self, user_id: str) -> str:
        """ユーザー別のBlob prefixを生成"""
        # ユーザーIDをハッシュ化してプライバシー保護（MD5で高速化）
        user_hash = hashlib.md5(user_id.encode()).hexdigest()[:16]
        return f"users/{user_hash}"

    def get_pdf_blob_name(self, user_id: str, file_hash: str, filename: str) -> str:
        """PDFファイルのBlob名を生成（グローバル共有）"""
        # ユーザー分離なし - 効率的なキャッシュ共有
        return f"pdf/{file_hash}_{filename}"

    def get_ocr_blob_name(self, user_id: str, file_hash: str) -> str:
        """OCR結果のBlob名を生成（グローバル共有）"""
        # ユーザー分離なし - 効率的なキャッシュ共有
        return f"json/{file_hash}.json"

    def save_pdf_file(self, user_id: str, file_content: bytes, filename: str) -> str:
        """PDFファイルをBlob Storageに保存"""
        try:
            file_hash = self.calculate_file_hash(file_content)
            blob_name = self.get_pdf_blob_name(user_id, file_hash, filename)
            
            blob_client = self.blob_service_client.get_blob_client(
                container=self.container_name,
                blob=blob_name
            )
            
            # メタデータ設定
            metadata = {
                "user_id": user_id,
                "original_filename": filename,
                "file_hash": file_hash,
                "upload_time": datetime.utcnow().isoformat(),
                "content_type": "application/pdf"
            }
            
            # ファイルが存在しない場合のみアップロード
            try:
                blob_client.get_blob_properties()
                logger.info(f"PDF already exists in blob storage: {blob_name}")
            except ResourceNotFoundError:
                blob_client.upload_blob(
                    file_content,
                    metadata=metadata,
                    overwrite=False,
                    content_settings=ContentSettings(content_type='application/pdf')
                )
                logger.info(f"PDF saved to blob storage: {blob_name}")
            
            return file_hash
            
        except Exception as e:
            logger.error(f"PDFファイル保存エラー: {e}")
            raise

    def get_cached_ocr(self, user_id: str, file_hash: str) -> Optional[Dict[str, Any]]:
        """キャッシュされたOCR結果を取得"""
        try:
            blob_name = self.get_ocr_blob_name(user_id, file_hash)
            blob_client = self.blob_service_client.get_blob_client(
                container=self.container_name,
                blob=blob_name
            )
            
            # Blobの存在確認
            blob_properties = blob_client.get_blob_properties()
            logger.info(f"OCRキャッシュが見つかりました: {blob_name}, サイズ: {blob_properties.size}")
            
            # OCRデータをダウンロード
            blob_data = blob_client.download_blob()
            content = blob_data.readall()
            ocr_data = json.loads(content.decode('utf-8'))
            
            logger.info(f"OCRキャッシュを取得しました: {file_hash}")
            return ocr_data
            
        except ResourceNotFoundError:
            logger.info(f"OCRキャッシュが見つかりません: {file_hash}")
            return None
        except Exception as e:
            logger.error(f"OCRキャッシュ取得エラー: {e}")
            return None

    def save_ocr_result(self, user_id: str, file_hash: str, ocr_data: Dict[str, Any]) -> bool:
        """OCR結果をBlob Storageに保存"""
        try:
            blob_name = self.get_ocr_blob_name(user_id, file_hash)
            blob_client = self.blob_service_client.get_blob_client(
                container=self.container_name,
                blob=blob_name
            )
            
            # OCRデータをJSON文字列に変換
            ocr_json = json.dumps(ocr_data, ensure_ascii=False, indent=2)
            
            # メタデータ設定
            metadata = {
                "user_id": user_id,
                "file_hash": file_hash,
                "created_time": datetime.utcnow().isoformat(),
                "data_size": str(len(ocr_json)),
                "content_type": "application/json"
            }
            
            # OCR結果をアップロード
            blob_client.upload_blob(
                ocr_json.encode('utf-8'),
                metadata=metadata,
                overwrite=True,
                content_settings=ContentSettings(content_type='application/json')
            )
            
            logger.info(f"OCR結果を保存しました: {blob_name}, サイズ: {len(ocr_json)} bytes")
            return True
            
        except Exception as e:
            logger.error(f"OCR結果保存エラー: {e}")
            return False

    def list_user_files(self, user_id: str, limit: int = 100) -> list:
        """ユーザーのファイル一覧を取得"""
        try:
            user_prefix = self.get_user_prefix(user_id)
            pdf_prefix = f"{user_prefix}/pdfs/"
            
            blob_list = self.blob_service_client.get_container_client(
                self.container_name
            ).list_blobs(name_starts_with=pdf_prefix)
            
            files = []
            count = 0
            for blob in blob_list:
                if count >= limit:
                    break
                    
                files.append({
                    "name": blob.name,
                    "size": blob.size,
                    "last_modified": blob.last_modified.isoformat() if blob.last_modified else None,
                    "metadata": blob.metadata or {}
                })
                count += 1
            
            return files
            
        except Exception as e:
            logger.error(f"ファイル一覧取得エラー: {e}")
            return []

    def list_user_files(self, user_id: str, limit: int = 100) -> list:
        """ユーザーのファイル一覧を取得"""
        try:
            user_prefix = self.get_user_prefix(user_id)
            pdf_prefix = f"{user_prefix}/pdfs/"
            
            blob_list = self.blob_service_client.get_container_client(
                self.container_name
            ).list_blobs(name_starts_with=pdf_prefix)
            
            files = []
            count = 0
            for blob in blob_list:
                if count >= limit:
                    break
                    
                files.append({
                    "name": blob.name,
                    "size": blob.size,
                    "last_modified": blob.last_modified.isoformat() if blob.last_modified else None,
                    "metadata": blob.metadata or {}
                })
                count += 1
            
            return files
            
        except Exception as e:
            logger.error(f"ファイル一覧取得エラー: {e}")
            return []

    def cleanup_old_files(self, user_id: str, days_old: int = 90) -> int:
        """古いファイルを削除（オプション機能）"""
        try:
            user_prefix = self.get_user_prefix(user_id)
            container_client = self.blob_service_client.get_container_client(self.container_name)
            
            from datetime import timedelta
            cutoff_date = datetime.utcnow() - timedelta(days=days_old)
            
            deleted_count = 0
            blob_list = container_client.list_blobs(name_starts_with=user_prefix)
            
            for blob in blob_list:
                if blob.last_modified and blob.last_modified < cutoff_date:
                    blob_client = container_client.get_blob_client(blob.name)
                    blob_client.delete_blob()
                    deleted_count += 1
                    logger.info(f"古いファイルを削除: {blob.name}")
            
            return deleted_count
            
        except Exception as e:
            logger.error(f"ファイル削除エラー: {e}")
            return 0
