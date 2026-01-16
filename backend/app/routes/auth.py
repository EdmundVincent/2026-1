from fastapi import APIRouter, Depends, HTTPException, status, Form, Request
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User
from app.auth_utils import verify_password, create_access_token, get_password_hash
import uuid

router = APIRouter()

# 临时存放 Authorization Code 的地方 (为了简化，先存在内存里)
# 格式: { "code_123": "user_email" }
AUTH_CODES = {}

# ---------------------------------------------------------
# 1. Endpoint A: /authorize (领导要求的第一个接口)
# ---------------------------------------------------------
@router.get("/authorize", response_class=HTMLResponse)
async def login_page(request: Request):
    """
    如果用户没登录，前端会跳到这里。
    我们直接返回一个简单的 HTML 登录界面。
    """
    return """
    <html>
        <head>
            <title>Internal Login</title>
            <style>
                body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; background-color: #f0f2f5; }
                .card { background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); width: 300px; }
                input { width: 100%; padding: 8px; margin: 10px 0; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; }
                button { width: 100%; padding: 10px; background-color: #0078d4; color: white; border: none; border-radius: 4px; cursor: pointer; }
                button:hover { background-color: #005a9e; }
            </style>
        </head>
        <body>
            <div class="card">
                <h2 style="text-align: center;">ANA Login</h2>
                <form action="/api/authorize" method="post">
                    <label>Username</label>
                    <input type="text" name="username" required>
                    <label>Password</label>
                    <input type="password" name="password" required>
                    <button type="submit">Sign In</button>
                </form>
            </div>
        </body>
    </html>
    """

@router.post("/authorize")
async def login_submit(
    username: str = Form(...),
    password: str = Form(...),
    db: Session = Depends(get_db)
):
    """
    处理登录表单提交：
    1. 验证账号密码
    2. 生成 Code
    3. 302 重定向回前端 (带上 Code)
    """
    # 1. 找用户
    user = db.query(User).filter(User.username == username).first()
    
    # 贾维斯特别设计：如果是第一次运行且数据库为空，自动注册 admin/admin
    if not user and username == "admin" and password == "admin":
        user = User(username="admin", hashed_password=get_password_hash("admin"), role="admin")
        db.add(user)
        db.commit()
        db.refresh(user)
    
    # 2. 验证
    if not user or not verify_password(password, user.hashed_password):
        return HTMLResponse(content="<h3>Incorrect username or password</h3>", status_code=400)

    # 3. 生成一次性 Code
    auth_code = str(uuid.uuid4())
    AUTH_CODES[auth_code] = user.username

    # 4. 关键：302 跳转回前端的回调页面，把 code 传过去
    # 注意：这里假设前端的回调地址是 /callback
    frontend_callback_url = f"http://localhost:3000/callback?code={auth_code}"
    return RedirectResponse(url=frontend_callback_url, status_code=302)


# ---------------------------------------------------------
# 2. Endpoint B: /token (领导要求的第二个接口)
# ---------------------------------------------------------
@router.post("/token")
async def exchange_token(code: str = Form(...)):
    """
    前端拿着 Code 来换 JWT
    """
    # 1. 验证 Code 是否有效
    username = AUTH_CODES.get(code)
    if not username:
        raise HTTPException(status_code=400, detail="Invalid or expired code")

    # 2. 用完即焚 (安全)
    del AUTH_CODES[code]

    # 3. 生成内部 JWT
    access_token = create_access_token(data={"sub": username})
    
    return {"access_token": access_token, "token_type": "bearer"}