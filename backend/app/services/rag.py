"""
RAG（Retrieval-Augmented Generation）検索サービス
===============================================

SoftBank生成AIパッケージのベクターデータベースを使用して
文書の類似度検索を実行し、翻訳精度向上のための関連情報を提供する。

主要機能：
- ベクター類似度検索
- 検索結果キャッシュ管理
- 並列処理とレート制限対応
- 自動リトライ機能
- 航空機整備文書特化の検索
"""

import hashlib
import time
import asyncio
from typing import Optional, Dict
from asyncio import Semaphore
import logging
import httpx

from .config import config
from .http_client import http_client_manager

logger = logging.getLogger(__name__)

class RAGCache:
    """RAG検索結果のキャッシュ"""
    def __init__(self, max_size: int = 500, ttl: int = 1800):  # 30分
        self.cache: Dict[str, tuple] = {}
        self.max_size = max_size
        self.ttl = ttl
    
    def _generate_cache_key(self, text: str) -> str:
        return hashlib.md5(text.encode('utf-8')).hexdigest()
    
    def get(self, text: str) -> Optional[dict]:
        cache_key = self._generate_cache_key(text)
        if cache_key in self.cache:
            result, timestamp = self.cache[cache_key]
            if time.time() - timestamp < self.ttl:
                logger.debug(f"RAGキャッシュヒット: {text[:50]}...")
                return result
            else:
                del self.cache[cache_key]
        return None
    
    def set(self, text: str, result: dict):
        cache_key = self._generate_cache_key(text)
        
        if len(self.cache) >= self.max_size:
            oldest_key = min(self.cache.keys(), 
                           key=lambda k: self.cache[k][1])
            del self.cache[oldest_key]
        
        self.cache[cache_key] = (result, time.time())
        logger.debug(f"RAGキャッシュ保存: {text[:50]}...")

class OptimizedRAGService:
    def __init__(self):
        # レートリミット制御（RAGサービス用）
        self.semaphore = Semaphore(int(getattr(config, 'RAG_MAX_CONCURRENT', 5)))
        self.request_delay = float(getattr(config, 'RAG_REQUEST_DELAY', 0.5))
        
        # キャッシュ
        self.cache = RAGCache(
            max_size=int(getattr(config, 'RAG_CACHE_MAX_SIZE', 500)),
            ttl=int(getattr(config, 'RAG_CACHE_TTL', 1800))
        )
        
        logger.info(f"ソフトバンク生成AIパッケージRAGサービスを初期化: 同時実行数={self.semaphore._value}, 遅延={self.request_delay}秒")
    
    def _message_send_url(self) -> str:
        """メッセージ送信API URL"""
        base_url = config.SOFTBANK_API_BASE_URL.rstrip('/')
        if not base_url.startswith(('http://', 'https://')):
            base_url = f"https://{base_url}"
        return f"{base_url}/api/message"
    
    def _document_list_url(self) -> str:
        """検索結果取得API URL"""
        base_url = config.SOFTBANK_API_BASE_URL.rstrip('/')
        if not base_url.startswith(('http://', 'https://')):
            base_url = f"https://{base_url}"
        return f"{base_url}/api/message/document/list"

    def _headers(self) -> dict:
        return {
            "Content-Type": "application/json",
            "thirdai-openai-api-key": config.SOFTBANK_API_KEY,
        }

    async def search(self, text: str, use_cache: bool = True) -> dict | None:
        # キャッシュチェック
        if use_cache:
            cached_result = self.cache.get(text)
            if cached_result:
                return cached_result
        
        async with self.semaphore:
            try:
                client = await http_client_manager.get_client()
                
                # プラグインキーが設定されていない場合はRAG検索をスキップ
                if not config.SOFTBANK_PLUGIN_KEY or config.SOFTBANK_PLUGIN_KEY == "":
                    logger.warning("プラグインキーが設定されていないため、RAG検索をスキップします")
                    return {"result": {"search_result": {}}}
                
                plugin_id = config.SOFTBANK_PLUGIN_KEY
                logger.info(f"プラグインIDを使用: {plugin_id}")
                
                # Step 1: メッセージ送信（プラグイン付き）
                send_payload = {
                    "messages": [{"role": "user", "content": text}],
                    "model": config.SOFTBANK_GPT_MODEL_KEY,
                    "plugin_id": plugin_id,
                    "language": "ja",
                    "save_result": True
                }
                
                logger.info(f"RAG検索リクエスト送信: {text[:50]}...")
                logger.info(f"使用するAPI URL: {self._message_send_url()}")
                logger.info(f"GPTモデルキー: {config.SOFTBANK_GPT_MODEL_KEY}")
                logger.info(f"プラグインID: {plugin_id}")
                logger.info(f"APIキー（先頭10文字）: {config.SOFTBANK_API_KEY[:10]}...")
                logger.info(f"送信ヘッダー: {self._headers()}")
                logger.info(f"送信ペイロード: {send_payload}")
                
                send_resp = await client.post(
                    self._message_send_url(), 
                    headers=self._headers(), 
                    json=send_payload
                )
                
                logger.info(f"レスポンス状態コード: {send_resp.status_code}")
                logger.info(f"レスポンスヘッダー: {dict(send_resp.headers)}")
                logger.info(f"レスポンス内容（RAW）: {send_resp.text}")
                
                if send_resp.status_code == 429:
                    retry_after = int(send_resp.headers.get("retry-after", 30))
                    logger.warning(f"RAG レートリミット検出: {retry_after}秒待機")
                    await asyncio.sleep(retry_after)
                    return None
                
                if send_resp.status_code != 200:
                    logger.error(f"RAG メッセージ送信API呼び出しエラー: {send_resp.status_code}")
                    logger.error(f"レスポンス内容: {send_resp.text}")
                    return None
                
                send_data = send_resp.json()
                message_id = send_data.get("message_id")
                
                if not message_id:
                    logger.error("RAG検索用メッセージIDが取得できませんでした")
                    logger.error(f"レスポンス内容: {send_data}")
                    return None
                
                logger.info(f"RAG検索メッセージID取得: {message_id}")
                
                # Step 2: 検索結果取得
                doc_resp = await client.get(
                    self._document_list_url(),
                    headers=self._headers(),
                    params={"message_id": message_id}
                )
                
                logger.info(f"検索結果取得API レスポンス状態コード: {doc_resp.status_code}")
                logger.info(f"検索結果取得API レスポンス内容: {doc_resp.text}")
                
                if doc_resp.status_code == 400:
                    # 400エラーの場合、検索結果が存在しないとして空の結果を返す
                    error_response = doc_resp.json()
                    error_code = error_response.get("error", {}).get("error_code", "")
                    error_message = error_response.get("error", {}).get("message", "")
                    
                    logger.warning(f"RAG検索結果なし - error_code: {error_code}, message: {error_message}")
                    
                    # 空の検索結果を返す
                    result = {"result": {"search_result": {}}}
                    
                elif doc_resp.status_code != 200:
                    logger.error(f"RAG 検索結果取得API呼び出しエラー: {doc_resp.status_code}")
                    logger.error(f"レスポンス内容: {doc_resp.text}")
                    return None
                else:
                    result = doc_resp.json()
                
                # デバッグ: レスポンス構造をログ出力
                logger.info(f"RAG検索レスポンス構造: {result}")
                
                # キャッシュに保存
                if result and use_cache:
                    self.cache.set(text, result)
                
                # レート制限遵守
                await asyncio.sleep(self.request_delay)
                
                logger.info("RAG検索完了")
                return result
                
            except Exception as e:
                logger.error(f"RAG検索エラー: {str(e)}", exc_info=True)
                return None

    def _parse_content_fields(self, content: str) -> tuple[str, str]:
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

    def extract_samples(self, search_result: dict | None) -> dict:
        samples: dict[str, str] = {}
        # ソフトバンク生成AIパッケージのレスポンス形式に対応
        search_results = (search_result or {}).get("result", {}).get("search_result", {})
        
        # デバッグ: 検索結果の構造をログ出力
        logger.info(f"extract_samples: search_results = {search_results}")
        
        # 検索結果を最大5件まで処理
        count = 0
        for key, result_data in search_results.items():
            if count >= 5:  # 最大5件
                break
            
            logger.info(f"extract_samples: processing item {key}: {result_data}")
            
            content = result_data.get("content", "")
            
            # contentからtext_jaとtext_enを抽出
            text_ja, text_en = self._parse_content_fields(content)
            
            # 抽出した日本語と英語をサンプルとして格納
            samples[f"sample{count+1}_ja"] = text_ja
            samples[f"sample{count+1}_en"] = text_en
            count += 1
        
        logger.info(f"extract_samples: final samples = {samples}")
        return samples

    async def search_batch(self, texts: list[str], use_cache: bool = True) -> list[dict | None]:
        """バッチ検索（レートリミット対応）"""
        logger.info(f"RAGバッチ検索開始: {len(texts)}件")
        
        tasks = [self.search(text, use_cache) for text in texts]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # 例外を処理
        processed_results = []
        for result in results:
            if isinstance(result, Exception):
                logger.error(f"RAGバッチ検索エラー: {result}")
                processed_results.append(None)
            else:
                processed_results.append(result)
        
        logger.info(f"RAGバッチ検索完了: 成功{sum(1 for r in processed_results if r is not None)}件")
        return processed_results