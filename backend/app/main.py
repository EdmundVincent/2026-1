from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes import api, auth # 👈 引入新的 auth 路由
from app import models
from app.database import engine, Base
import os

# 创建数据库表
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="ANA 整備ドキュメント翻訳アプリ API",
    description="Internal Auth Version",
    version="2.0.0"
)

# CORS 设置 (允许前端跨域)
origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    os.getenv("FRONTEND_URL", "")
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(auth.router, prefix="/api") # 👈 注册认证路由 (优先级高)
app.include_router(api.router, prefix="/api")  # 注册业务路由

@app.get("/")
def root():
    return {"status": "ok", "message": "ANA Translation API (Auth Ready)"}

@app.get("/health")
def health_check():
    return {"status": "healthy"}