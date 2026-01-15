"""
ANA 整備ドキュメント翻訳アプリ - バックエンドAPI
===============================================

FastAPIを使用したREST APIサーバー。
以下の機能を提供：
- PDF OCR処理
- 多言語翻訳
- RAG検索
- Azure Blob Storage連携

フロントエンドのSPAからCORS経由でアクセスされる。
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes import api
import os

app = FastAPI(
    title="ANA 整備ドキュメント翻訳アプリ API",
    description="ANA整備ドキュメントの翻訳機能を提供するAPI",
    version="1.0.0"
)

# CORS設定（フロントエンドからのSPA形式のAPI呼び出しを許可）
allowed_origins = []
if os.getenv("FRONTEND_URL"):
    allowed_origins.append(os.getenv("FRONTEND_URL"))
if os.getenv("CORS_ALLOW_ALL", "false").lower() == "true":
    allowed_origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"]
)

# API ルーター（全てのAPIエンドポイントを /api プレフィックスで提供）
app.include_router(api.router, prefix="/api")

@app.get("/")
def root():
    """
    APIルートエンドポイント
    アプリケーションの基本情報を返す（ヘルスチェック用）
    """
    return {
        "status": "ok", 
        "message": "ANA 整備ドキュメント翻訳アプリ API",
        "version": "1.0.0"
    }

@app.get("/health")
def health_check():
    """
    ヘルスチェックエンドポイント
    アプリケーションの健全性を確認
    """
    return {"status": "healthy"}
