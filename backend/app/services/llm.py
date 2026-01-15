"""
LLM翻訳サービス
===============

SoftBank生成AIパッケージWebAPIsを使用した翻訳機能を提供。
レート制限対応、キャッシュ機能、エラーハンドリングを含む。

主要機能：
- 航空機整備特化の翻訳プロンプト
- 翻訳結果のキャッシュ管理
- 並列処理とレート制限対応
- 自動リトライ機能
"""

import hashlib
import time
import asyncio
import random
from typing import Optional, Dict
from asyncio import Semaphore
from functools import lru_cache
import logging
import httpx
from tenacity import retry, wait_exponential, stop_after_attempt, retry_if_exception_type

from .config import config
from .http_client import http_client_manager

logger = logging.getLogger(__name__)

# 航空機整備特化翻訳プロンプトテンプレート
DEFAULT_PROMPT = """# 指示

以下の日本語テキストを英語に翻訳してください。
翻訳にあたっては、特に航空機整備や技術的な用語に対する正確性を重視してください。
翻訳の参考として、過去の翻訳サンプルを以下に示しています。
これらのサンプルを考慮し、整合性のある翻訳を行ってください。

# 翻訳対象のテキスト

`${targetText}`

# 参考翻訳サンプル

1. 日本語: `${samples.sample1_ja}`
   英語: `${samples.sample1_en}`
2. 日本語: `${samples.sample2_ja}`
   英語: `${samples.sample2_en}`
3. 日本語: `${samples.sample3_ja}`
   英語: `${samples.sample3_en}`
4. 日本語: `${samples.sample4_ja}`
   英語: `${samples.sample4_en}`
5. 日本語: `${samples.sample5_ja}`
   英語: `${samples.sample5_en}`

# 注意点
- 用語の一貫性を保ち、正確に翻訳すること。
- 原文の意味を忠実に反映すること。
- 航空機整備に関する技術用語は適切に訳すこと。
- 翻訳対象のテキストはOCRにより取得したものである。OCRのミスと考えられる部分はサンプルを参照して合理的な範囲内で適宜修正すること。
- 出力する翻訳結果はバッククオート等の記号で囲わず、テキスト本文のみを出力すること。

# 翻訳結果：
"""

class TranslationCache:
    """翻訳結果のインメモリキャッシュ"""
    def __init__(self, max_size: int = 1000, ttl: int = 3600):
        self.cache: Dict[str, tuple] = {}
        self.max_size = max_size
        self.ttl = ttl
    
    def _generate_cache_key(self, text: str) -> str:
        """テキストからキャッシュキーを生成"""
        return hashlib.md5(text.encode('utf-8')).hexdigest()
    
    def get(self, text: str) -> Optional[str]:
        """キャッシュから翻訳結果を取得"""
        cache_key = self._generate_cache_key(text)
        if cache_key in self.cache:
            result, timestamp = self.cache[cache_key]
            if time.time() - timestamp < self.ttl:
                logger.debug(f"キャッシュヒット: {text[:50]}...")
                return result
            else:
                # 期限切れのアイテムを削除
                del self.cache[cache_key]
        return None
    
    def set(self, text: str, translation: str):
        """翻訳結果をキャッシュに保存"""
        cache_key = self._generate_cache_key(text)
        
        # キャッシュサイズ制限
        if len(self.cache) >= self.max_size:
            # 最も古いアイテムを削除
            oldest_key = min(self.cache.keys(), 
                           key=lambda k: self.cache[k][1])
            del self.cache[oldest_key]
        
        self.cache[cache_key] = (translation, time.time())
        logger.debug(f"キャッシュ保存: {text[:50]}...")

class OptimizedLLMService:
    def __init__(self):
        # レートリミット制御
        self.semaphore = Semaphore(int(getattr(config, 'LLM_MAX_CONCURRENT', 3)))
        self.request_delay = float(getattr(config, 'LLM_REQUEST_DELAY', 1.5))
        
        # キャッシュ
        self.cache = TranslationCache(
            max_size=int(getattr(config, 'CACHE_MAX_SIZE', 1000)),
            ttl=int(getattr(config, 'CACHE_TTL', 3600))
        )
        
        logger.info(f"ソフトバンク生成AIパッケージLLMサービスを初期化: 同時実行数={self.semaphore._value}, 遅延={self.request_delay}秒")
    
    def _message_send_url(self) -> str:
        """メッセージ送信API URL"""
        base_url = config.SOFTBANK_API_BASE_URL.rstrip('/')
        if not base_url.startswith(('http://', 'https://')):
            base_url = f"https://{base_url}"
        return f"{base_url}/api/message"
    
    def _message_get_url(self) -> str:
        """メッセージ生成API URL - ドキュメント取得用"""
        base_url = config.SOFTBANK_API_BASE_URL.rstrip('/')
        if not base_url.startswith(('http://', 'https://')):
            base_url = f"https://{base_url}"
        return f"{base_url}/api/message/document/list"

    def _headers(self) -> dict:
        return {
            "Content-Type": "application/json",
            "thirdai-openai-api-key": config.SOFTBANK_API_KEY,
        }

    def build_prompt(self, target_text: str, samples: dict) -> str:
        base = config.CUSTOM_PROMPT or DEFAULT_PROMPT
        
        # 添付ファイル形式のプレースホルダーを直接置換
        result = base.replace('${targetText}', target_text)
        
        # サンプルデータの置換
        for i in range(1, 6):
            sample_ja = samples.get(f"sample{i}_ja", "")
            sample_en = samples.get(f"sample{i}_en", "")
            result = result.replace(f'${{samples.sample{i}_ja}}', sample_ja)
            result = result.replace(f'${{samples.sample{i}_en}}', sample_en)
        
        return result

    def clean_translation_result(self, text: str) -> str:
        """翻訳結果から不要な参考文献番号や記号を除去"""
        if not text:
            return text
        
        import re
        # [1], [2]などの数字の参考文献番号を除去
        text = re.sub(r'\[\d+\]', '', text)
        # [なし], [None], [N/A]などの日本語・英語のパターンを除去
        text = re.sub(r'\[なし\]', '', text)
        text = re.sub(r'\[None\]', '', text, flags=re.IGNORECASE)
        text = re.sub(r'\[N/A\]', '', text, flags=re.IGNORECASE)
        text = re.sub(r'\[該当なし\]', '', text)
        text = re.sub(r'\[不明\]', '', text)
        # より一般的なパターン: [任意の文字]を除去（ただし慎重に）
        text = re.sub(r'\[(?:なし|None|N/A|該当なし|不明|無し|ない)\]', '', text, flags=re.IGNORECASE)
        # 末尾の不要な記号や空白を除去
        text = text.strip()
        return text

    @retry(
        wait=wait_exponential(multiplier=1, min=2, max=60),
        stop=stop_after_attempt(3),
        retry=retry_if_exception_type((httpx.HTTPStatusError, httpx.TimeoutException))
    )
    async def _translate_with_retry(self, prompt: str) -> Optional[str]:
        """ソフトバンク生成AIパッケージAPIを使用したリトライ機構付き翻訳実行"""
        client = await http_client_manager.get_client()
        
        # Step 1: メッセージ送信
        send_payload = {
            "messages": [{"role": "user", "content": prompt}],
            "model": config.SOFTBANK_GPT_MODEL_KEY,
            "temperature": config.TEMPERATURE,
            "top_p": config.TOP_P,
            "language": "ja"
        }
        
        # plugin_keyが設定されている場合は追加
        if config.SOFTBANK_PLUGIN_KEY:
            send_payload["plugin_id"] = config.SOFTBANK_PLUGIN_KEY
        
        try:
            # メッセージ送信API呼び出し
            send_resp = await client.post(
                self._message_send_url(), 
                headers=self._headers(), 
                json=send_payload
            )
            
            # レートリミット検出・対応
            if send_resp.status_code == 429:
                retry_after = int(send_resp.headers.get("retry-after", 60))
                jitter = random.uniform(1, 5)  # ジッター追加
                wait_time = retry_after + jitter
                logger.warning(f"レートリミット検出: {wait_time:.1f}秒待機")
                await asyncio.sleep(wait_time)
                raise httpx.HTTPStatusError("Rate limit exceeded", request=send_resp.request, response=send_resp)
            
            # その他のHTTPエラー対応
            if send_resp.status_code == 503:
                logger.warning("サービス一時利用不可: 10秒待機後リトライ")
                await asyncio.sleep(10 + random.uniform(1, 3))
                raise httpx.HTTPStatusError("Service unavailable", request=send_resp.request, response=send_resp)
                
            if send_resp.status_code != 200:
                logger.error(f"メッセージ送信API呼び出しエラー: {send_resp.status_code}")
                logger.error(f"レスポンス: {send_resp.text}")
                raise httpx.HTTPStatusError(f"HTTP {send_resp.status_code}", request=send_resp.request, response=send_resp)
            
            send_data = send_resp.json()
            # OpenAI準拠のレスポンス形式に対応
            message_id = send_data.get("message_id")
            
            if not message_id:
                logger.error("メッセージIDが取得できませんでした")
                logger.error(f"レスポンス: {send_data}")
                return None
            
            # OpenAI準拠の場合、即座に結果が返される可能性がある
            choices = send_data.get("choices", [])
            if choices and len(choices) > 0:
                message_content = choices[0].get("message", {}).get("content")
                if message_content:
                    logger.info("翻訳完了（即座にレスポンス取得）")
                    return message_content
            
            # Step 2: 非同期処理の場合、ドキュメント取得APIでポーリング
            # 注意: 最新仕様では翻訳処理は通常即座に完了するため、この部分は念のため残す
            max_attempts = 30  # 最大30回試行（約30秒）
            for attempt in range(max_attempts):
                await asyncio.sleep(1)  # 1秒待機
                
                # ドキュメント取得APIは検索結果用なので、翻訳結果は直接取得できない
                # 翻訳処理の場合は通常即座に完了するため、この部分に到達することはない
                logger.warning(f"翻訳処理で非同期応答が発生しました（試行 {attempt + 1}）")
            
            logger.error("翻訳処理がタイムアウトしました")
            return None
            
        except Exception as e:
            logger.error(f"ソフトバンク生成AIパッケージAPI呼び出しでエラー: {e}")
            raise

    async def translate(self, prompt: str, use_cache: bool = True) -> Optional[str]:
        """レートリミット対応の安全な翻訳"""
        # キャッシュチェック
        if use_cache:
            cached_result = self.cache.get(prompt)
            if cached_result:
                return cached_result
        
        async with self.semaphore:
            try:
                result = await self._translate_with_retry(prompt)
                
                # 翻訳結果のクリーンアップ
                if result:
                    result = self.clean_translation_result(result)
                
                # キャッシュに保存
                if result and use_cache:
                    self.cache.set(prompt, result)
                
                # レート制限遵守
                await asyncio.sleep(self.request_delay)
                
                logger.info("翻訳完了")
                return result
                
            except Exception as e:
                logger.error(f"翻訳失敗: {e}")
                return None

    async def translate_batch(self, prompts: list[str], use_cache: bool = True) -> list[Optional[str]]:
        """バッチ翻訳（レートリミット対応）"""
        logger.info(f"バッチ翻訳開始: {len(prompts)}件")
        
        # 並列実行
        tasks = [self.translate(prompt, use_cache) for prompt in prompts]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # 例外を処理
        processed_results = []
        for result in results:
            if isinstance(result, Exception):
                logger.error(f"バッチ翻訳エラー: {result}")
                processed_results.append(None)
            else:
                processed_results.append(result)
        
        logger.info(f"バッチ翻訳完了: 成功{sum(1 for r in processed_results if r is not None)}件")
        return processed_results
