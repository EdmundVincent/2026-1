const express = require('express');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// セキュリティミドルウェア（PDF.js Worker対応版 - Linux最適化）
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: [
                "'self'", 
                "'unsafe-inline'",
                "'unsafe-eval'",  // PDF.js用
                "blob:",          // PDF.js Worker用
                "https://cdnjs.cloudflare.com",
                "https://unpkg.com"
            ],
            workerSrc: [
                "'self'", 
                "blob:", 
                "data:",
                "https://cdnjs.cloudflare.com"  // CDN Worker用
            ],
            childSrc: [
                "'self'", 
                "blob:", 
                "data:",
                "https://cdnjs.cloudflare.com"  // フォールバック
            ],
            imgSrc: ["'self'", "data:", "blob:"],
            connectSrc: [
                "'self'", 
                process.env.BACKEND_URL || "http://localhost:8000",
                "https://*.azurewebsites.net",  // Azure内部通信用
                "https://unpkg.com"  // PDF-lib ソースマップ用
            ],
            fontSrc: ["'self'", "data:"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"],
        },
    },
    // Linux版でのパフォーマンス最適化
    crossOriginEmbedderPolicy: false,  // PDF.js互換性のため無効化
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// レート制限（PDF処理対応）
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15分
    max: 500, // PDF処理で大量リクエストが発生するため緩和
    message: 'Too many requests from this IP, please try again later.'
});
app.use(limiter);

// CORS設定
app.use(cors({
    origin: process.env.CORS_ORIGIN || true,
    credentials: true
}));

// HTMLファイルの動的配信（置換処理）
app.get('/', (req, res) => {
    const fs = require('fs');
    const path = require('path');
    
    // index.htmlを読み込み、BACKEND_URLを置換
    let html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:8000';
    html = html.replace('BACKEND_URL_PLACEHOLDER', backendUrl);
    
    res.send(html);
});

// 静的ファイルの提供（HTML以外）
app.use(express.static(path.join(__dirname, 'public'), {
    index: false  // index.htmlの自動配信を無効化
}));

// SPA用のフォールバック（その他のルートもHTMLを返す）
app.get('*', (req, res) => {
    const fs = require('fs');
    const path = require('path');
    
    // index.htmlを読み込み、BACKEND_URLを置換
    let html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:8000';
    html = html.replace('BACKEND_URL_PLACEHOLDER', backendUrl);
    
    res.send(html);
});

app.listen(PORT, () => {
    console.log(`Frontend server is running on port ${PORT}`);
    console.log(`Backend URL: ${process.env.BACKEND_URL || 'http://localhost:8000'}`);
});
