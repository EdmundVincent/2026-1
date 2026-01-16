from fastapi import APIRouter, Request, Response, HTTPException, Header, Form, Query
from fastapi.responses import RedirectResponse, HTMLResponse
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
SESSION_TTL = 3600
CODE_TTL = 300
TOKEN_TTL = 1800
PASSWORD_SALT = "salt"
ISSUER = "http://localhost:4180"

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

init_db()

def hash_password(pw: str) -> str:
    return hashlib.sha256((PASSWORD_SALT + pw).encode()).hexdigest()

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
        if s != sig: return None
        payload = json.loads(base64.urlsafe_b64decode((p + "==").encode()))
        if int(payload.get("exp", 0)) < int(time.time()): return None
        return payload
    except: return None

# --- 登录页面 (GET) ---
@router.get("/idp/login", response_class=HTMLResponse)
def login_page(next: str | None = "/"):
    return f"""
    <html>
        <head>
            <title>ANA Login</title>
            <style>
                body {{ display:flex; justify-content:center; align-items:center; height:100vh; background:#f0f2f5; font-family:sans-serif; }}
                .card {{ background:white; padding:2rem; border-radius:8px; box-shadow:0 2px 4px rgba(0,0,0,0.1); width:300px; }}
                h2 {{ text-align:center; color: #333; }}
                input {{ width:100%; padding:10px; margin:10px 0; border:1px solid #ccc; border-radius:4px; box-sizing:border-box; }}
                button {{ width:100%; padding:10px; background:#0078d4; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:bold; }}
                button:hover {{ background:#005a9e; }}
                .error {{ color: red; text-align: center; margin-bottom: 10px; font-size: 0.9em; }}
            </style>
        </head>
        <body>
            <div class="card">
                <h2>ANA Login</h2>
                <form action="/idp/login?next={urllib.parse.quote(next)}" method="post">
                    <input type="text" name="username" required placeholder="Username">
                    <input type="password" name="password" required placeholder="Password">
                    <button type="submit">Sign In</button>
                </form>
            </div>
        </body>
    </html>
    """

# --- 处理登录 (POST Form) ---
@router.post("/idp/login")
def idp_login(response: Response, username: str = Form(...), password: str = Form(...), next: str | None = Query("/")):
    conn = connect()
    cur = conn.cursor()
    cur.execute("select id, password_hash from users where username=?", (username,))
    row = cur.fetchone()
    
    # 验证失败返回 HTML 错误页
    if not row or row["password_hash"] != hash_password(password):
        conn.close()
        return HTMLResponse(f"""
            <html><body style="display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;">
            <div style="text-align:center;">
                <h3 style="color:red;">Login Failed</h3>
                <p>Invalid username or password.</p>
                <a href='/idp/login?next={next}'>Try Again</a>
            </div>
            </body></html>
        """, status_code=401)
    
    sid = uuid.uuid4().hex
    exp = int(time.time()) + SESSION_TTL
    cur.execute("insert into sessions(session_id, user_id, expires_at) values(?,?,?)", (sid, row["id"], exp))
    conn.commit()
    conn.close()
    
    response.set_cookie("session_id", sid, httponly=True, max_age=SESSION_TTL)
    return RedirectResponse(url=next, status_code=302)

def get_current_user(request: Request):
    sid = request.cookies.get("session_id")
    if not sid: return None
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

# --- OAuth Authorize ---
@router.get("/oauth/authorize")
def oauth_authorize(request: Request, client_id: str, redirect_uri: str, response_type: str = "code", state: str | None = None):
    user = get_current_user(request)
    if not user:
        # 未登录 -> 跳去登录页
        current_url = str(request.url)
        return RedirectResponse(f"/idp/login?next={urllib.parse.quote(current_url)}")
    
    conn = connect()
    cur = conn.cursor()
    cur.execute("select * from clients where client_id=?", (client_id,))
    if not cur.fetchone():
        conn.close()
        raise HTTPException(400, "Invalid client")
        
    code = uuid.uuid4().hex
    exp = int(time.time()) + CODE_TTL
    cur.execute("insert into auth_codes(code, user_id, client_id, redirect_uri, expires_at) values(?,?,?,?,?)", (code, user["id"], client_id, redirect_uri, exp))
    conn.commit()
    conn.close()
    
    return RedirectResponse(f"{redirect_uri}?code={code}&state={state or ''}")

@router.post("/oauth/token")
def oauth_token(grant_type: str = Form(...), code: str = Form(...), client_id: str = Form(...), client_secret: str = Form(...), redirect_uri: str = Form(...)):
    conn = connect()
    cur = conn.cursor()
    cur.execute("select * from auth_codes where code=?", (code,))
    auth_code = cur.fetchone()
    if not auth_code or auth_code["client_id"] != client_id:
        conn.close()
        raise HTTPException(400, "Invalid code")
        
    cur.execute("select id, username, email, name from users where id=?", (auth_code["user_id"],))
    u = cur.fetchone()
    cur.execute("delete from auth_codes where code=?", (code,))
    conn.commit()
    conn.close()
    
    now = int(time.time())
    payload = {"sub": str(u["id"]), "name": u["name"], "email": u["email"], "iat": now, "exp": now + TOKEN_TTL}
    return {"access_token": sign_jwt(payload), "token_type": "Bearer"}

@router.get("/oauth/userinfo")
def userinfo(authorization: str = Header(...)):
    token = authorization.split(" ")[1]
    payload = verify_jwt(token)
    if not payload: raise HTTPException(401)
    return payload

# --- 贾维斯特别修正：强力数据预埋 ---
def seed():
    conn = connect()
    cur = conn.cursor()
    print("[IDP Init] Checking Seed Data...")

    # 1. 确保 Client 存在
    cur.execute("select * from clients where client_id='frontend-app'")
    if not cur.fetchone():
        print("[IDP Init] Creating Client: frontend-app")
        cur.execute("insert into clients(client_id, client_secret, redirect_uri) values(?,?,?)", ("frontend-app", "frontend-secret", "http://localhost:3000"))
    
    # 2. 确保 Admin 存在 (并且强制更新密码!)
    TARGET_USER = "admin"
    TARGET_PASS = "password"
    NEW_HASH = hash_password(TARGET_PASS)
    
    cur.execute("select id from users where username=?", (TARGET_USER,))
    row = cur.fetchone()
    
    if not row:
        print(f"[IDP Init] Creating User: {TARGET_USER}")
        cur.execute("insert into users(username, password_hash, email, name, created_at) values(?,?,?,?,?)", (TARGET_USER, NEW_HASH, "admin@test.com", "Admin User", int(time.time())))
    else:
        # 关键修正：如果用户已存在，强制更新密码哈希，防止死锁
        print(f"[IDP Init] Updating Password for User: {TARGET_USER}")
        cur.execute("update users set password_hash=? where username=?", (NEW_HASH, TARGET_USER))
        
    conn.commit()
    conn.close()

seed()