from fastapi import APIRouter, Request, Response, HTTPException, Header, Form, Query
from fastapi.responses import RedirectResponse, HTMLResponse
from pydantic import BaseModel
import os
import time
import hmac
import hashlib
import base64
import json
import uuid
import sqlite3
import urllib.parse

router = APIRouter()

DB_PATH = os.environ.get("IDP_DB_PATH", os.path.join(os.path.dirname(__file__), "..", "idp.db"))
SECRET = os.environ.get("INTERNAL_JWT_SECRET", "change_this")
SESSION_TTL = int(os.environ.get("IDP_SESSION_TTL", "3600"))
CODE_TTL = int(os.environ.get("IDP_CODE_TTL", "300"))
TOKEN_TTL = int(os.environ.get("JWT_EXPIRE_SECONDS", "1800"))
PASSWORD_SALT = os.environ.get("IDP_PASSWORD_SALT", "salt")
ISSUER = os.environ.get("IDP_ISSUER", "http://localhost:4180")

# --- 辅助函数 ---
def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()

def sign_jwt(payload: dict) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    h = b64url(json.dumps(header, separators=(",", ":")).encode())
    p = b64url(json.dumps(payload, separators=(",", ":")).encode())
    msg = f"{h}.{p}".encode()
    sig = b64url(hmac.new(SECRET.encode(), msg, hashlib.sha256).digest())
    return f"{h}.{p}.{sig}"

def verify_jwt(token: str):
    try:
        h, p, s = token.split(".")
        msg = f"{h}.{p}".encode()
        sig = b64url(hmac.new(SECRET.encode(), msg, hashlib.sha256).digest())
        if s != sig:
            return None
        payload = json.loads(base64.urlsafe_b64decode((p + "==").encode()))
        exp = int(payload.get("exp", 0))
        if exp and exp < int(time.time()):
            return None
        return payload
    except Exception:
        return None

def connect():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = connect()
    cur = conn.cursor()
    cur.execute("create table if not exists users(id integer primary key autoincrement, username text unique, password_hash text, email text, name text, created_at integer)")
    cur.execute("create table if not exists clients(id integer primary key autoincrement, client_id text unique, client_secret text, redirect_uri text)")
    cur.execute("create table if not exists auth_codes(code text primary key, user_id integer, client_id text, redirect_uri text, expires_at integer)")
    cur.execute("create table if not exists sessions(session_id text primary key, user_id integer, expires_at integer)")
    conn.commit()
    conn.close()

def hash_password(pw: str) -> str:
    return hashlib.sha256((PASSWORD_SALT + pw).encode()).hexdigest()

init_db()

# --- 登录页面 UI (修复点 1) ---
@router.get("/idp/login", response_class=HTMLResponse)
def login_page(next: str | None = None):
    # 如果没有 next 参数，默认跳回首页，但通常应该有
    next_url = next if next else "/"
    return f"""
    <html>
        <head>
            <title>ANA Internal Login</title>
            <meta charset="utf-8">
            <style>
                body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; background-color: #f0f2f5; margin: 0; }}
                .card {{ background: white; padding: 2.5rem; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); width: 350px; }}
                .logo {{ text-align: center; margin-bottom: 20px; font-weight: bold; font-size: 24px; color: #1a1a1a; }}
                input {{ width: 100%; padding: 12px; margin: 8px 0 20px 0; border: 1px solid #ddd; border-radius: 6px; box-sizing: border-box; font-size: 16px; }}
                input:focus {{ border-color: #0078d4; outline: none; }}
                label {{ display: block; font-weight: 500; color: #666; margin-bottom: 5px; }}
                button {{ width: 100%; padding: 12px; background-color: #0078d4; color: white; border: none; border-radius: 6px; font-size: 16px; font-weight: bold; cursor: pointer; transition: background 0.2s; }}
                button:hover {{ background-color: #0060aa; }}
                .hint {{ text-align: center; margin-top: 15px; color: #888; font-size: 12px; }}
            </style>
        </head>
        <body>
            <div class="card">
                <div class="logo">ANA 整備翻訳 Login</div>
                <form action="/idp/login?next={urllib.parse.quote(next_url)}" method="post">
                    <label>Username</label>
                    <input type="text" name="username" required placeholder="admin">
                    <label>Password</label>
                    <input type="password" name="password" required placeholder="password">
                    <button type="submit">Sign In</button>
                </form>
                <div class="hint">Default: admin / password</div>
            </div>
        </body>
    </html>
    """

# --- 处理登录提交 (修复点 2: 改为 Form 表单提交) ---
@router.post("/idp/login")
def idp_login(response: Response, username: str = Form(...), password: str = Form(...), next: str | None = Query(None)):
    conn = connect()
    cur = conn.cursor()
    cur.execute("select id, password_hash, email, name from users where username=?", (username,))
    row = cur.fetchone()
    
    # 验证失败
    if not row or row["password_hash"] != hash_password(password):
        conn.close()
        # 返回 HTML 报错页面 (简化处理)
        return HTMLResponse(content="<h3>Invalid credentials. <a href='/idp/login'>Try again</a></h3>", status_code=401)
        
    # 验证成功
    sid = uuid.uuid4().hex
    exp = int(time.time()) + SESSION_TTL
    cur.execute("insert into sessions(session_id, user_id, expires_at) values(?,?,?)", (sid, row["id"], exp))
    conn.commit()
    conn.close()
    
    # 设置 Cookie 并跳转
    response.set_cookie("session_id", sid, httponly=True, max_age=SESSION_TTL)
    
    # 如果有下一步地址，则跳转；否则返回 JSON ok
    if next:
        return RedirectResponse(url=next, status_code=302)
    return {"ok": True}

def get_current_user(request: Request):
    sid = request.cookies.get("session_id")
    if not sid:
        return None
    conn = connect()
    cur = conn.cursor()
    cur.execute("select user_id, expires_at from sessions where session_id=?", (sid,))
    s = cur.fetchone()
    if not s or s["expires_at"] < int(time.time()):
        conn.close()
        return None
    cur.execute("select id, username, email, name from users where id=?", (s["user_id"],))
    u = cur.fetchone()
    conn.close()
    return u

# --- OAuth Authorize (修复点 3: 没登录时跳到登录页) ---
@router.get("/oauth/authorize")
def oauth_authorize(request: Request, client_id: str, redirect_uri: str, response_type: str = "code", state: str | None = None):
    user = get_current_user(request)
    if not user:
        # 关键修复：没登录不是报错，而是带着当前 URL 跳去登录页
        current_url = str(request.url)
        return RedirectResponse(f"/idp/login?next={urllib.parse.quote(current_url)}")

    if response_type != "code":
        raise HTTPException(status_code=400, detail="unsupported response_type")
    
    conn = connect()
    cur = conn.cursor()
    cur.execute("select client_id, client_secret, redirect_uri from clients where client_id=?", (client_id,))
    c = cur.fetchone()
    # 简单的 Redirect URI 校验 (startsWith 逻辑，方便本地调试)
    if not c or not redirect_uri.startswith(c["redirect_uri"]):
        conn.close()
        # 这里的报错也可以美化，但暂时先这样
        raise HTTPException(status_code=400, detail=f"invalid client or redirect_uri mismatch. Expected start with {c['redirect_uri'] if c else 'unknown'}")
        
    code = uuid.uuid4().hex
    exp = int(time.time()) + CODE_TTL
    cur.execute("insert into auth_codes(code, user_id, client_id, redirect_uri, expires_at) values(?,?,?,?,?)", (code, user["id"], client_id, redirect_uri, exp))
    conn.commit()
    conn.close()
    
    url = f"{redirect_uri}?code={code}"
    if state:
        url += f"&state={state}"
    return RedirectResponse(url)

@router.post("/oauth/token")
def oauth_token(grant_type: str = Form(...), code: str = Form(...), client_id: str = Form(...), client_secret: str = Form(...), redirect_uri: str = Form(...)):
    if grant_type != "authorization_code":
        raise HTTPException(status_code=400, detail="unsupported grant_type")
    conn = connect()
    cur = conn.cursor()
    cur.execute("select client_id, client_secret, redirect_uri from clients where client_id=?", (client_id,))
    c = cur.fetchone()
    if not c or c["client_secret"] != client_secret: # 去掉了 redirect_uri 强校验，防止 http/https 混淆
        conn.close()
        raise HTTPException(status_code=401, detail="invalid client")
        
    cur.execute("select code, user_id, client_id, redirect_uri, expires_at from auth_codes where code=?", (code,))
    a = cur.fetchone()
    if not a or a["client_id"] != client_id or a["expires_at"] < int(time.time()):
        conn.close()
        raise HTTPException(status_code=400, detail="invalid code")
        
    cur.execute("select id, username, email, name from users where id=?", (a["user_id"],))
    u = cur.fetchone()
    cur.execute("delete from auth_codes where code=?", (code,))
    conn.commit()
    conn.close()
    
    now = int(time.time())
    payload = {"iss": ISSUER, "sub": str(u["id"]), "email": u["email"], "name": u["name"], "aud": client_id, "iat": now, "exp": now + TOKEN_TTL}
    access_token = sign_jwt(payload)
    return {"access_token": access_token, "token_type": "Bearer", "expires_in": TOKEN_TTL}

@router.get("/oauth/userinfo")
def oauth_userinfo(authorization: str | None = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="missing token")
    token = authorization.split(" ", 1)[1]
    payload = verify_jwt(token)
    if not payload:
        raise HTTPException(status_code=401, detail="invalid token")
    return {"sub": payload.get("sub"), "email": payload.get("email"), "name": payload.get("name")}

# --- 数据预埋 (保持您之前的逻辑) ---
def seed_data():
    conn = connect()
    cur = conn.cursor()
    TARGET_CLIENT_ID = "frontend-app"
    TARGET_CLIENT_SECRET = "frontend-secret"
    TARGET_REDIRECT_URI = "http://localhost:3000"
    
    cur.execute("select id from clients where client_id=?", (TARGET_CLIENT_ID,))
    if not cur.fetchone():
        print(f"[IDP Init] Seeding Client: {TARGET_CLIENT_ID}")
        cur.execute("insert into clients(client_id, client_secret, redirect_uri) values(?,?,?)", (TARGET_CLIENT_ID, TARGET_CLIENT_SECRET, TARGET_REDIRECT_URI))
    
    TARGET_USERNAME = "admin"
    TARGET_PASSWORD = "password"
    cur.execute("select id from users where username=?", (TARGET_USERNAME,))
    if not cur.fetchone():
        print(f"[IDP Init] Seeding User: {TARGET_USERNAME}")
        pw_hash = hash_password(TARGET_PASSWORD)
        cur.execute("insert into users(username, password_hash, email, name, created_at) values(?,?,?,?,?)", (TARGET_USERNAME, pw_hash, "admin@example.com", "System Admin", int(time.time())))
    conn.commit()
    conn.close()

seed_data()