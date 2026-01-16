from fastapi import APIRouter, Request, Response, HTTPException, Header, Form
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
import os
import time
import hmac
import hashlib
import base64
import json
import uuid
import sqlite3

router = APIRouter()

DB_PATH = os.environ.get("IDP_DB_PATH", os.path.join(os.path.dirname(__file__), "..", "idp.db"))
SECRET = os.environ.get("INTERNAL_JWT_SECRET", "change_this")
SESSION_TTL = int(os.environ.get("IDP_SESSION_TTL", "3600"))
CODE_TTL = int(os.environ.get("IDP_CODE_TTL", "300"))
TOKEN_TTL = int(os.environ.get("JWT_EXPIRE_SECONDS", "1800"))
PASSWORD_SALT = os.environ.get("IDP_PASSWORD_SALT", "salt")
ISSUER = os.environ.get("IDP_ISSUER", "http://localhost:4180")

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

class LoginBody(BaseModel):
    username: str
    password: str

@router.post("/idp/login")
def idp_login(body: LoginBody, response: Response):
    conn = connect()
    cur = conn.cursor()
    cur.execute("select id, password_hash, email, name from users where username=?", (body.username,))
    row = cur.fetchone()
    if not row or row["password_hash"] != hash_password(body.password):
        conn.close()
        raise HTTPException(status_code=401, detail="invalid credentials")
    sid = uuid.uuid4().hex
    exp = int(time.time()) + SESSION_TTL
    cur.execute("insert into sessions(session_id, user_id, expires_at) values(?,?,?)", (sid, row["id"], exp))
    conn.commit()
    conn.close()
    response.set_cookie("session_id", sid, httponly=True, max_age=SESSION_TTL)
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

@router.get("/oauth/authorize")
def oauth_authorize(request: Request, client_id: str, redirect_uri: str, response_type: str = "code", state: str | None = None):
    if response_type != "code":
        raise HTTPException(status_code=400, detail="unsupported response_type")
    user = get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="not authenticated")
    conn = connect()
    cur = conn.cursor()
    cur.execute("select client_id, client_secret, redirect_uri from clients where client_id=?", (client_id,))
    c = cur.fetchone()
    if not c or c["redirect_uri"] != redirect_uri:
        conn.close()
        raise HTTPException(status_code=400, detail="invalid client or redirect_uri")
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
    if not c or c["client_secret"] != client_secret or c["redirect_uri"] != redirect_uri:
        conn.close()
        raise HTTPException(status_code=401, detail="invalid client")
    cur.execute("select code, user_id, client_id, redirect_uri, expires_at from auth_codes where code=?", (code,))
    a = cur.fetchone()
    if not a or a["client_id"] != client_id or a["redirect_uri"] != redirect_uri or a["expires_at"] < int(time.time()):
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

class RegisterUserBody(BaseModel):
    username: str
    password: str
    email: str | None = None
    name: str | None = None

@router.post("/idp/register_user")
def register_user(body: RegisterUserBody, x_admin_token: str | None = Header(None, alias="X-Admin-Token")):
    admin_token = os.environ.get("IDP_ADMIN_TOKEN", "")
    if not admin_token or x_admin_token != admin_token:
        raise HTTPException(status_code=403, detail="forbidden")
    conn = connect()
    cur = conn.cursor()
    cur.execute("insert into users(username, password_hash, email, name, created_at) values(?,?,?,?,?)", (body.username, hash_password(body.password), body.email or "", body.name or "", int(time.time())))
    conn.commit()
    conn.close()
    return {"ok": True}

@router.post("/idp/register_client")
def register_client(client_id: str = Form(...), client_secret: str = Form(...), redirect_uri: str = Form(...), x_admin_token: str | None = Header(None, alias="X-Admin-Token")):
    admin_token = os.environ.get("IDP_ADMIN_TOKEN", "")
    if not admin_token or x_admin_token != admin_token:
        raise HTTPException(status_code=403, detail="forbidden")
    conn = connect()
    cur = conn.cursor()
    cur.execute("insert or replace into clients(client_id, client_secret, redirect_uri) values(?,?,?)", (client_id, client_secret, redirect_uri))
    conn.commit()
    conn.close()
    return {"ok": True}

