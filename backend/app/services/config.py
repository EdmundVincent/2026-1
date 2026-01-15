"""
アプリケーション設定
==================

環境変数から設定値を読み込み、デフォルト値を提供する。
すべての設定値はdataclassで型安全に管理される。

主要設定カテゴリ：
- 外部API設定（SoftBank、DX Suite）
- 翻訳パラメータ
- パフォーマンス設定
- Azure連携設定
"""

from dataclasses import dataclass
import os
from dotenv import load_dotenv

load_dotenv()

@dataclass
class AppConfig:
    # DX Suite API設定（OCR処理用）
    DX_SUITE_API_URL: str = os.getenv("DX_SUITE_API_URL", "https://api.inside.ai/v1")
    DX_SUITE_API_KEY: str = os.getenv("DX_SUITE_API_KEY", "")

    # ソフトバンク生成AIパッケージ WebAPIs設定
    SOFTBANK_API_BASE_URL: str = os.getenv("SOFTBANK_API_BASE_URL", "")  # APIベースURL
    SOFTBANK_API_KEY: str = os.getenv("SOFTBANK_API_KEY", "")  # thirdai-openai-api-key
    SOFTBANK_GPT_MODEL_KEY: str = os.getenv("SOFTBANK_GPT_MODEL_KEY", "1")  # 使用モデル（通常"1"）
    SOFTBANK_PLUGIN_KEY: str = os.getenv("SOFTBANK_PLUGIN_KEY", "")  # RAG検索プラグインキー（任意）

    # 翻訳パラメータ（OpenAI互換）
    TEMPERATURE: float = float(os.getenv("TEMPERATURE", "0.7"))  # 創造性調整（0.0-1.0）
    TOP_P: float = float(os.getenv("TOP_P", "0.95"))  # トークン選択範囲（0.0-1.0）
    MAX_TOKENS: int = int(os.getenv("MAX_TOKENS", "800"))  # 最大出力トークン数

    # カスタムプロンプト設定（任意上書き）
    CUSTOM_PROMPT: str = os.getenv("CUSTOM_PROMPT", "")  # 翻訳用カスタムプロンプト
    CUSTOM_NORMALIZE_PROMPT: str = os.getenv("CUSTOM_NORMALIZE_PROMPT", "")  # 正規化用プロンプト

    # パフォーマンス設定 - LLM翻訳（レート制限とスループットのバランス調整）
    LLM_MAX_CONCURRENT: int = int(os.getenv("LLM_MAX_CONCURRENT", "6"))  # 同時実行数（4→6に向上）
    LLM_REQUEST_DELAY: float = float(os.getenv("LLM_REQUEST_DELAY", "0.6"))  # リクエスト間遅延（1.0→0.6秒に短縮）
    CACHE_MAX_SIZE: int = int(os.getenv("CACHE_MAX_SIZE", "1000"))  # 翻訳キャッシュサイズ
    CACHE_TTL: int = int(os.getenv("CACHE_TTL", "3600"))  # キャッシュ有効期間（秒）

    # パフォーマンス設定 - RAG検索（検索系は翻訳より高頻度実行可能）
    RAG_MAX_CONCURRENT: int = int(os.getenv("RAG_MAX_CONCURRENT", "6"))  # RAG同時実行数
    RAG_REQUEST_DELAY: float = float(os.getenv("RAG_REQUEST_DELAY", "0.4"))  # RAG遅延（翻訳より短縮）
    RAG_CACHE_MAX_SIZE: int = int(os.getenv("RAG_CACHE_MAX_SIZE", "500"))  # RAGキャッシュサイズ
    RAG_CACHE_TTL: int = int(os.getenv("RAG_CACHE_TTL", "1800"))  # RAGキャッシュ期間（30分）

    # Azure Blob Storage設定（OCR結果キャッシュ用）
    AZURE_STORAGE_ACCOUNT_URL: str = os.getenv("AZURE_STORAGE_ACCOUNT_URL", "")  # Managed Identity用
    AZURE_STORAGE_CONNECTION_STRING: str = os.getenv("AZURE_STORAGE_CONNECTION_STRING", "")  # 接続文字列用
    AZURE_STORAGE_CONTAINER_NAME: str = os.getenv("AZURE_STORAGE_CONTAINER_NAME", "ocr-cache")  # コンテナ名

# グローバル設定インスタンス
config = AppConfig()
