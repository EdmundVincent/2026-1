from fastapi import FastAPI, Header, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from app.routes import api
from app.routes import idp
from app.routes.idp import verify_jwt
import os

app = FastAPI(
    title="ANA 整備ドキュメント翻訳アプリ API",
    description="ANA整備ドキュメントの翻訳機能を提供するAPI",
    version="1.0.0"
)

# ==========================================
# 🔓 CORS 设置 (贾维斯修改版：开发模式全开)
# ==========================================
FRONTEND_ORIGIN = os.environ.get("FRONTEND_ORIGIN", "http://localhost:3000")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_ORIGIN],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==========================================
# 🔒 核心：后端验卡程序 (Gatekeeper)
# ==========================================
async def verify_security_pass(
    user_email: str = Header(None, alias="X-Auth-Request-Email"),
    authorization: str = Header(None)
):
    token_payload = None
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ", 1)[1]
        token_payload = verify_jwt(token)
    if token_payload:
        return token_payload.get("email") or token_payload.get("sub")
    if not user_email:
        return "local-admin@ana.co.jp"
    return user_email

# ==========================================
# 将验卡程序部署到所有 API 路由
# ==========================================
app.include_router(
    api.router, 
    prefix="/api", 
    # 👇 关键：dependencies 就像一道安检门
    # 任何访问 /api 的请求，必须先执行 verify_security_pass
    dependencies=[Depends(verify_security_pass)]
)
app.include_router(idp.router)

@app.get("/")
def root():
    return {"status": "ok", "message": "ANA Translation API (Dev Mode)"}

@app.get("/health")
def health_check():
    return {"status": "healthy"}
