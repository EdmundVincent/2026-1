import httpx
import asyncio
from typing import Optional
import logging

logger = logging.getLogger(__name__)

class HTTPClientManager:
    """シングルトンHTTPクライアント管理クラス"""
    _instance: Optional['HTTPClientManager'] = None
    _client: Optional[httpx.AsyncClient] = None
    _lock = asyncio.Lock()
    
    def __new__(cls) -> 'HTTPClientManager':
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    async def get_client(self) -> httpx.AsyncClient:
        """HTTPクライアントを取得（シングルトン）"""
        if self._client is None:
            async with self._lock:
                if self._client is None:
                    self._client = httpx.AsyncClient(
                        timeout=httpx.Timeout(60.0, connect=10.0),
                        limits=httpx.Limits(
                            max_connections=20,  # API制限を考慮して元の値に戻す
                            max_keepalive_connections=10  # Keep-alive接続数も適切に
                        ),
                        follow_redirects=True
                    )
                    logger.info("HTTPクライアントプールを初期化しました")
        return self._client
    
    async def close(self):
        """HTTPクライアントを閉じる"""
        if self._client is not None:
            async with self._lock:
                if self._client is not None:
                    await self._client.aclose()
                    self._client = None
                    logger.info("HTTPクライアントプールを閉じました")

# グローバルインスタンス
http_client_manager = HTTPClientManager()
