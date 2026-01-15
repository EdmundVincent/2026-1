FROM node:22-slim
WORKDIR /app
# 安装依赖
COPY package.json .
RUN npm install
# 复制前端代码
COPY . .
# 启动命令
CMD ["node", "server.js"]