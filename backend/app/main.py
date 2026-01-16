from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
# 1. 修改引用：移除 auth，导入 idp
from app.routes import api, idp 
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

# CORS 设置
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

# 2. 注册路由：移除旧的 auth.router
# 注意：idp.py 内部的路由已经包含了 /idp 和 /oauth 前缀，
# 所以这里通常不需要再加 prefix="/api"，或者您可以根据前端需求决定是否加 /api
# 这里建议先挂载在根路径下，保持 idp.py 原汁原味的路径结构
app.include_router(idp.router) 

# 注册业务路由 (保持不变)
app.include_router(api.router, prefix="/api")

@app.get("/")
def root():
    # 更新欢迎语
    return {"status": "ok", "message": "ANA Translation API (IDP System Active)"}

@app.get("/health")
def health_check():
    return {"status": "healthy"}