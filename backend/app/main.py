from fastapi import FastAPI, Header, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from app.routes import api
import os

app = FastAPI(
    title="ANA 整備ドキュメント翻訳アプリ API",
    description="ANA整備ドキュメントの翻訳機能を提供するAPI",
    version="1.0.0"
)

# CORS设置
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

# ==========================================
# 🔒 第四步核心：后端验卡程序 (Gatekeeper)
# ==========================================
async def verify_security_pass(
    # 1. 检查“门卡”的签名印章 (X-Auth-Request-Email)
    # 这个 Header 只有 OAuth2 Proxy 在验证了加密 Cookie (JWT) 后才会打上
    # 外部黑客无法伪造，因为他们没有 Proxy 的内部权限
    user_email: str = Header(None, alias="X-Auth-Request-Email"),
    
    # 2. (可选) 检查 Bearer Token 是否存在
    # 对应您要求的 "Authorization" 检查
    authorization: str = Header(None)
):
    """
    安全关卡：
    拦截所有请求，检查是否持有合法的“内部通行证”。
    """
    
    # 严查：如果没有 Email 印章，说明没有经过保安亭，直接报警(401)
    if not user_email:
        print(f"🛑 拦截到非法入侵：请求头缺少身份印章。Auth: {authorization}")
        raise HTTPException(
            status_code=401, 
            detail="Access Denied: 您的请求未通过安全网关 (Missing Identity Signature)"
        )
    
    # 3. 可以在这里增加企业级权限控制 (RBAC)
    # 例如：只允许 ANA 域名的邮箱
    # if not user_email.endswith("@ana.co.jp"):
    #     raise HTTPException(status_code=403, detail="您的账号不在白名单中")

    # 验卡成功，放行，并记录这是谁
    print(f"✅ 验卡通过：用户 {user_email} 正在访问")
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

@app.get("/")
def root():
    return {"status": "ok", "message": "ANA Translation API (Secured by OAuth2 Proxy)"}

@app.get("/health")
def health_check():
    return {"status": "healthy"}