"""
APIルーター
===========

フロントエンドからのHTTPリクエストを処理するFastAPIルーター。
主要機能：翻訳、OCR、RAG検索、ファイル管理

エンドポイント一覧：
- /translate: 単一テキスト翻訳
- /translate_batch: バッチ翻訳（複数テキスト一括処理）
- /rag: RAG検索
- /normalize: テキスト正規化
- /ocr: PDF OCR処理
- /config: フロントエンド用設定取得
- /my-files: アップロードファイル履歴
- /cleanup-old-files: 古いファイル削除
"""

from fastapi import APIRouter, HTTPException, UploadFile, File, Depends, Header
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from app.services.llm import OptimizedLLMService
from app.services.rag import OptimizedRAGService
from app.services.normalize import NormalizeService
from app.services.dx_suite_ocr import DXSuiteOCRService
from app.services.blob_cache import BlobCacheService
from app.services.config import config
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

# Pydanticモデル定義（リクエスト・レスポンスの型定義）

class TranslateRequest(BaseModel):
    """単一テキスト翻訳リクエスト"""
    text: str
    prompt: Optional[str] = None      # カスタムプロンプト（任意）
    force_refresh: bool = False       # キャッシュ無視フラグ

class TranslateBatchRequest(BaseModel):
    """バッチ翻訳リクエスト（複数テキスト一括処理）"""
    texts: List[str]
    force_refresh: bool = False

class TranslateResponse(BaseModel):
    """翻訳レスポンス"""
    translation: str

class TranslateBatchResponse(BaseModel):
    """バッチ翻訳レスポンス"""
    translations: List[str]

class RAGRequest(BaseModel):
    """RAG検索リクエスト"""
    text: str

class RAGResponse(BaseModel):
    """RAG検索レスポンス"""
    result: list

class NormalizeRequest(BaseModel):
    """テキスト正規化リクエスト"""
    text: str

class NormalizeResponse(BaseModel):
    """テキスト正規化レスポンス"""
    normalized: str

class ConfigResponse(BaseModel):
    """フロントエンド設定レスポンス"""
    frontend_config: Dict[str, Any]

class OCRResponse(BaseModel):
    """OCR処理レスポンス"""
    ocr_data: List[Dict[str, Any]]
    cache_hit: bool = False           # キャッシュヒットフラグ
    message: str = ""                 # 処理メッセージ
    processing_time_ms: Optional[float] = None  # 処理時間（ミリ秒）

@router.get("/config", response_model=ConfigResponse)
async def get_frontend_config():
    """フロントエンド用の設定を提供（機密情報は除く）"""
    frontend_config = {
        # 必要に応じて他の非機密設定を追加
        # "TEMPERATURE": config.TEMPERATURE,
        # "TOP_P": config.TOP_P,
        # "MAX_TOKENS": config.MAX_TOKENS,
    }
    return ConfigResponse(frontend_config=frontend_config)

@router.post("/translate", response_model=TranslateResponse)
async def translate(req: TranslateRequest):
    llm = OptimizedLLMService()
    rag = OptimizedRAGService()

    # RAG 検索
    rag_result = await rag.search(req.text)
    samples = rag.extract_samples(rag_result)

    # フロントからpromptが来ていればそれを優先、なければ既定の組み立てを使用
    prompt = req.prompt or llm.build_prompt(req.text, samples)
    translation = await llm.translate(prompt)
    if not translation:
        # 失敗時は原文返却（JS版仕様に合わせる）
        translation = req.text
    return TranslateResponse(translation=translation)

@router.post("/translate_batch", response_model=TranslateBatchResponse)
async def translate_batch(req: TranslateBatchRequest):
    """性能とレート制限のバランス調整済みバッチ翻訳API"""
    import asyncio
    from asyncio import Semaphore
    
    llm = OptimizedLLMService()
    rag = OptimizedRAGService()
    
    # バランス調整済みセマフォ（保守的すぎず、攻撃的すぎず）
    batch_semaphore = Semaphore(3)  # 2→3に調整
    
    async def translate_single_safe(text: str) -> str:
        async with batch_semaphore:
            try:
                # 軽微な遅延でレート制限回避
                await asyncio.sleep(0.05)  # 0.1→0.05に短縮
                
                # RAG 検索
                rag_result = await rag.search(text)
                samples = rag.extract_samples(rag_result)
                
                # プロンプト生成と翻訳
                prompt = llm.build_prompt(text, samples)
                translation = await llm.translate(prompt)
                return translation or text
            except Exception as e:
                logger.warning(f"バッチ翻訳での個別エラー（フォールバック）: {e}")
                return text
    
    # 効率化された並列翻訳実行
    try:
        if len(req.texts) > 15:  # 10→15に調整（より大きなチャンクサイズ）
            # 大量テキストの場合はチャンク分割
            chunk_size = 8  # 5→8に調整（効率化）
            chunks = [req.texts[i:i + chunk_size] for i in range(0, len(req.texts), chunk_size)]
            all_translations = []
            
            for chunk in chunks:
                chunk_translations = await asyncio.gather(*[translate_single_safe(text) for text in chunk])
                all_translations.extend(chunk_translations)
                # チャンク間待機を短縮
                await asyncio.sleep(0.3)  # 0.5→0.3に短縮
            
            return TranslateBatchResponse(translations=all_translations)
        else:
            # 少量テキストの場合は通常処理
            translations = await asyncio.gather(*[translate_single_safe(text) for text in req.texts])
            return TranslateBatchResponse(translations=translations)
            
    except Exception as e:
        logger.error(f"バッチ翻訳エラー: {e}")
        # エラー時は元のテキストを返す
        return TranslateBatchResponse(translations=req.texts)

def parse_content_fields(content: str) -> tuple[str, str]:
    """
    contentフィールドからtext_jaとtext_enを抽出
    
    Args:
        content: "text_ja: 日本語テキスト\n\ntext_en: 英語テキスト\n..." 形式の文字列
                 （必ずtext_jaとtext_enの両方が含まれている前提）
    
    Returns:
        tuple: (text_ja部分, text_en部分)
               text_en部分は文字列末尾まで抽出される
    """
    text_ja = ""
    text_en = ""
    
    try:
        # text_ja部分を抽出（text_en:まで）
        ja_start = content.find("text_ja:") + len("text_ja:")
        ja_end = content.find("text_en:")
        if ja_start > len("text_ja:") - 1 and ja_end > -1:
            text_ja = content[ja_start:ja_end].strip()
        
        # text_en部分を抽出（末尾まで）
        en_start = content.find("text_en:") + len("text_en:")
        if en_start > len("text_en:") - 1:
            text_en = content[en_start:].strip()
    
    except Exception as e:
        logger.warning(f"content解析エラー: {e}, content: {content[:100]}...")
    
    return text_ja, text_en

@router.post("/rag", response_model=RAGResponse)
async def rag(req: RAGRequest):
    rag = OptimizedRAGService()
    result = await rag.search(req.text)
    if result is None:
        raise HTTPException(status_code=502, detail="RAG search failed")
    
    # ソフトバンクAPIのレスポンス形式をフロントエンド期待形式に変換
    search_results = result.get("result", {}).get("search_result", {})
    result_list = []
    if isinstance(search_results, dict):
        for key, value in search_results.items():
            if isinstance(value, dict):
                # ソフトバンクAPIの複数のスコアフィールドを確認
                score = (value.get("search_score") or 
                        value.get("reranker_score") or 
                        value.get("score") or 
                        0.0)
                
                # contentフィールドからtext_jaとtext_enを抽出
                content = value.get("content", "")
                text_ja, text_en = parse_content_fields(content)
                
                # フロントエンドが期待する構造に変換
                formatted_result = {
                    "body": {
                        "text": text_ja,           # contentのtext_ja部分 → body.text
                        "data_source": text_en     # contentのtext_en部分 → body.data_source
                    },
                    "_score": score  # search_score、reranker_score、または score を使用
                }
                result_list.append(formatted_result)
    
    return RAGResponse(result=result_list)

@router.post("/normalize", response_model=NormalizeResponse)
async def normalize(req: NormalizeRequest):
    svc = NormalizeService()
    normalized = await svc.normalize(req.text)
    if not normalized:
        normalized = req.text
    return NormalizeResponse(normalized=normalized)

def get_user_id(x_ms_client_principal: Optional[str] = Header(None)) -> str:
    """
    認証ヘッダーの取得（現在は使用していません）
    ユーザー分離なしの共有キャッシュを使用中
    """
    # 共有キャッシュ用の固定ID
    return "shared"

@router.post("/upload-pdf", response_model=OCRResponse)
async def upload_pdf(file: UploadFile = File(...)):
    """
    PDFファイルをアップロードしてOCR処理を実行
    Blob Storageキャッシュを使用して重複処理を回避
    """
    import time
    start_time = time.time()
    
    # ファイル形式チェック
    if not file.content_type == "application/pdf":
        raise HTTPException(status_code=400, detail="PDFファイルのみアップロード可能です")
    
    try:
        # PDFファイル内容を読み取り
        pdf_content = await file.read()
        
        # Blob キャッシュサービス初期化
        blob_cache = BlobCacheService()
        
        # ファイルハッシュを計算
        file_hash = blob_cache.calculate_file_hash(pdf_content)
        logger.info(f"PDF処理開始: {file.filename}, ハッシュ: {file_hash}")
        
        # キャッシュされたOCR結果を確認（ユーザーIDは固定値でOK）
        cached_ocr = blob_cache.get_cached_ocr("shared", file_hash)
        if cached_ocr:
            processing_time = (time.time() - start_time) * 1000
            logger.info(f"OCRキャッシュを使用: {file_hash} ({processing_time:.1f}ms)")
            return OCRResponse(
                ocr_data=cached_ocr.get("results", []),
                cache_hit=True,
                message=f"キャッシュヒット！ 高速処理完了 ({processing_time:.1f}ms)",
                processing_time_ms=processing_time
            )
        
        # PDFファイルをBlob Storageに保存
        blob_cache.save_pdf_file("shared", pdf_content, file.filename or "uploaded.pdf")
        
        # DX Suite OCRサービスでOCR処理
        logger.info(f"DX Suite OCR処理を実行: {file_hash}")
        ocr_service = DXSuiteOCRService()
        ocr_result = await ocr_service.process_pdf(pdf_content, file.filename)
        
        if ocr_result is None:
            raise HTTPException(status_code=502, detail="OCR処理に失敗しました")
        
        # OCR結果をキャッシュに保存
        cache_data = {"results": ocr_result, "file_hash": file_hash, "filename": file.filename}
        blob_cache.save_ocr_result("shared", file_hash, cache_data)
        
        processing_time = (time.time() - start_time) * 1000
        logger.info(f"OCR結果をキャッシュに保存: {file_hash} ({processing_time:.1f}ms)")
        
        return OCRResponse(
            ocr_data=ocr_result,
            cache_hit=False,
            message=f"新規OCR処理完了 ({processing_time:.1f}ms) - 次回は高速キャッシュ利用",
            processing_time_ms=processing_time
        )
        
    except Exception as e:
        logger.error(f"PDF処理エラー: {e}")
        raise HTTPException(status_code=500, detail=f"PDF処理中にエラーが発生しました: {str(e)}")

@router.get("/my-files")
def get_my_files():
    """
    アップロードされたファイル一覧を取得
    """
    try:
        blob_cache = BlobCacheService()
        files = blob_cache.list_user_files("shared", limit=50)
        return {"files": files}
        
    except Exception as e:
        logger.error(f"ファイル一覧取得エラー: {e}")
        raise HTTPException(status_code=500, detail="ファイル一覧の取得に失敗しました")

@router.delete("/cleanup-old-files")
def cleanup_old_files(days_old: int = 90):
    """
    古いキャッシュファイルを削除（管理用）
    """
    try:
        blob_cache = BlobCacheService()
        deleted_count = blob_cache.cleanup_old_files("shared", days_old)
        return {"deleted_count": deleted_count, "message": f"{days_old}日以上前のファイルを{deleted_count}個削除しました"}
        
    except Exception as e:
        logger.error(f"ファイル削除エラー: {e}")
        raise HTTPException(status_code=500, detail="ファイル削除に失敗しました")
