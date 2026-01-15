# 使用 Python 3.10 轻量版作为基础镜像
FROM python:3.10-slim

# 设置容器内部的工作目录
WORKDIR /app

# 先把依赖清单复制进去
COPY requirements.txt .

# 安装后端运行所需的 Python 插件
RUN pip install --no-cache-dir -r requirements.txt

# 复制后端的所有代码到容器中
COPY . .

# 启动命令：使用 uvicorn 运行 FastAPI
# --host 0.0.0.0 是为了让容器外的我们能访问它
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]