from passlib.context import CryptContext
from jose import jwt
from datetime import datetime, timedelta
import os

# 1. 密码加密工具
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# 2. JWT 配置
SECRET_KEY = os.getenv("SECRET_KEY", "changeme")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

# 工具函数：验证密码
def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

# 工具函数：加密密码
def get_password_hash(password):
    return pwd_context.hash(password)

# 工具函数：生成 JWT
def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt