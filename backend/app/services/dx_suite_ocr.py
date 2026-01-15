"""
DX Suite OCR API連携サービス
PDFファイルをDX Suite APIに送信してOCR結果を取得
全文読取APIを使用
"""

import aiohttp
import asyncio
import base64
import time
import logging
from typing import Optional, Dict, Any
from app.services.config import config

logger = logging.getLogger(__name__)


class DXSuiteOCRService:
    def __init__(self):
        self.api_url = config.DX_SUITE_API_URL
        self.api_key = config.DX_SUITE_API_KEY

    async def process_pdf(self, pdf_content: bytes, filename: str) -> Optional[Dict[str, Any]]:
        """
        PDFをDX Suite 全文読取APIに送信してOCR処理を実行し、結果を取得
        
        Args:
            pdf_content: PDFファイルのバイト内容
            filename: ファイル名
            
        Returns:
            OCR結果のJSONデータ、エラー時はNone
        """
        try:
            # 全文読取処理を開始
            job_id = await self._start_fullocr_job(pdf_content, filename)
            if not job_id:
                return None
            
            # 処理完了まで待機
            result = await self._wait_for_completion(job_id)
            return result
            
        except Exception as e:
            logger.error(f"DX Suite OCR処理エラー: {e}")
            return None

    async def _start_fullocr_job(self, pdf_content: bytes, filename: str) -> Optional[str]:
        """
        全文読取処理ジョブを開始
        
        Args:
            pdf_content: PDFファイルのバイナリデータ
            filename: ファイル名
            
        Returns:
            ジョブID、エラー時はNone
        """
        try:
            # FormDataを作成
            data = aiohttp.FormData()
            data.add_field('file', pdf_content, filename=filename, content_type='application/pdf')
            data.add_field('concatenate', '0')  # 結合オプション OFF
            data.add_field('characterExtraction', '1')  # 文字抽出オプション ON  
            data.add_field('tableExtraction', '1')  # 表抽出オプション ON
            
            headers = {
                "apikey": self.api_key
            }
            
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{self.api_url}/wf/api/fullocr/v2/register",
                    headers=headers,
                    data=data
                ) as response:
                    if response.status == 200:
                        data = await response.json()
                        return data.get("id")
                    else:
                        error_text = await response.text()
                        logger.error(f"全文読取開始エラー (HTTP {response.status}): {error_text}")
                        return None
                        
        except Exception as e:
            logger.error(f"全文読取開始リクエストエラー: {e}")
            return None

    async def _wait_for_completion(self, job_id: str, max_wait_time: int = 300) -> Optional[Dict[str, Any]]:
        """
        全文読取処理完了まで待機し、結果を取得
        
        Args:
            job_id: ジョブID
            max_wait_time: 最大待機時間（秒）
            
        Returns:
            OCR結果、エラー時はNone
        """
        start_time = time.time()
        polling_interval = 5  # 5秒間隔でポーリング
        
        try:
            headers = {
                "apikey": self.api_key
            }
            
            async with aiohttp.ClientSession() as session:
                while time.time() - start_time < max_wait_time:
                    # 結果を取得
                    async with session.get(
                        f"{self.api_url}/wf/api/fullocr/v2/getOcrResult",
                        headers=headers,
                        params={"id": job_id}
                    ) as response:
                        if response.status == 200:
                            data = await response.json()
                            status = data.get("status")
                            
                            if status == "done":
                                # 処理完了、結果を返す
                                return data.get("results", [])
                            elif status == "error":
                                logger.error(f"全文読取処理失敗: {data}")
                                return None
                            elif status == "inprogress":
                                # 処理中、待機継続
                                await asyncio.sleep(polling_interval)
                                continue
                            else:
                                logger.warning(f"不明なステータス: {status}")
                                return None
                        else:
                            error_text = await response.text()
                            logger.error(f"結果取得エラー (HTTP {response.status}): {error_text}")
                            return None
                
                logger.warning(f"タイムアウト: 全文読取処理が{max_wait_time}秒以内に完了しませんでした")
                return None
                
        except Exception as e:
            logger.error(f"全文読取処理待機エラー: {e}")
            return None
