import httpx
import asyncio
import logging
from .config import config
from .http_client import http_client_manager

logger = logging.getLogger(__name__)

DEFAULT_NORMALIZE_PROMPT = (
    "以下の文章のカタカナをひらがなと漢字に置き換えてください。英語はそのままにしてください。\n\n{targetText}"
)

class NormalizeService:
    def _message_send_url(self) -> str:
        """メッセージ送信API URL"""
        return f"https://{config.SOFTBANK_API_BASE_URL}/api/message"
    
    def _message_get_url(self) -> str:
        """メッセージ生成API URL"""
        return f"https://{config.SOFTBANK_API_BASE_URL}/api/message/document/list"

    def _headers(self) -> dict:
        return {
            "Content-Type": "application/json",
            "thirdai-openai-api-key": config.SOFTBANK_API_KEY,
        }

    async def normalize(self, text: str) -> str | None:
        """ソフトバンクAPIを使用したテキスト正規化"""
        prompt = (config.CUSTOM_NORMALIZE_PROMPT or DEFAULT_NORMALIZE_PROMPT).format(targetText=text)
        
        try:
            client = await http_client_manager.get_client()
            
            # Step 1: メッセージ送信
            send_payload = {
                "messages": [{"role": "user", "content": prompt}],
                "model": config.SOFTBANK_GPT_MODEL_KEY,
                "temperature": config.TEMPERATURE,
                "top_p": config.TOP_P,
                "language": "ja"
                # 正規化処理にはRAGは不要なので plugin_id は含めない
            }
            
            # メッセージ送信API呼び出し
            send_resp = await client.post(
                self._message_send_url(), 
                headers=self._headers(), 
                json=send_payload
            )
            
            if send_resp.status_code != 200:
                logger.error(f"正規化メッセージ送信API呼び出しエラー: {send_resp.status_code}")
                return None
            
            send_data = send_resp.json()
            
            # OpenAI準拠のレスポンス形式に対応
            # 即座に結果が返される場合をチェック
            choices = send_data.get("choices", [])
            if choices and len(choices) > 0:
                message_content = choices[0].get("message", {}).get("content")
                if message_content:
                    logger.info("正規化処理完了（即座にレスポンス取得）")
                    return message_content.strip()
            
            message_id = send_data.get("message_id")
            
            if not message_id:
                logger.error("正規化メッセージIDが取得できませんでした")
                logger.error(f"レスポンス: {send_data}")
                return None
            
            # Step 2: 非同期処理の場合のポーリング（通常は不要）
            # 注意: 正規化処理は通常即座に完了するため、この部分は念のため残す
            max_attempts = 30  # 最大30回試行（約30秒）
            for attempt in range(max_attempts):
                await asyncio.sleep(1)  # 1秒待機
                
                # 正規化処理では通常ドキュメント取得APIは使用しないため、警告出力
                logger.warning(f"正規化処理で非同期応答が発生しました（試行 {attempt + 1}）")
            
            logger.error("正規化処理がタイムアウトしました")
            return None
            
        except Exception as e:
            logger.error(f"正規化処理でエラー: {str(e)}")
            return None
