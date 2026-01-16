const express = require('express');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
// 👇 1. 引入代理库
const { createProxyMiddleware } = require('http-proxy-middleware'); 
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
// 👇 2. 定义后端地址
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';

// 安全配置
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "blob:", "https://cdnjs.cloudflare.com", "https://unpkg.com"],
            workerSrc: ["'self'", "blob:", "data:", "https://cdnjs.cloudflare.com"],
            childSrc: ["'self'", "blob:", "data:", "https://cdnjs.cloudflare.com"],
            imgSrc: ["'self'", "data:", "blob:"],
            // 👇 3. 允许连接到后端
            connectSrc: ["'self'", BACKEND_URL, "https://*.azurewebsites.net", "https://unpkg.com"],
            fontSrc: ["'self'", "data:"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"],
        },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    message: 'Too many requests from this IP, please try again later.'
});
app.use(limiter);

app.use(cors({
    origin: process.env.CORS_ORIGIN || true,
    credentials: true
}));

// --------------------------------------------------------------------------
// 👇 4. 关键：配置代理 (Proxy)
// 这段代码负责把 /api, /oauth, /idp 的请求转发给后端，必须加！
// --------------------------------------------------------------------------
app.use(
    ['/api', '/oauth', '/idp'], 
    createProxyMiddleware({
        target: BACKEND_URL,
        changeOrigin: true,
        logLevel: 'debug' // 方便在 Docker 日志里看转发情况
    })
);
// --------------------------------------------------------------------------

// 静态文件与 SPA 回退
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

app.get('*', (req, res) => {
    const fs = require('fs');
    let html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
    html = html.replace('BACKEND_URL_PLACEHOLDER', BACKEND_URL);
    res.send(html);
});

app.listen(PORT, () => {
    console.log(`Frontend server is running on port ${PORT}`);
    console.log(`Proxying requests to Backend: ${BACKEND_URL}`);
});