const express = require('express');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware'); // 👈 追加1: ライブラリのインポート
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
// 👈 追加2: バックエンドのURLを変数として定義 (Dockerでは 'http://backend:8000' が入ります)
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'; 

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
                BACKEND_URL,      // 👈 変更: 定数を使用
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

// --------------------------------------------------------------------------
// 👇 追加3: プロキシ設定 (ここが一番重要です)
// API(/api), 認証(/oauth), IDP画面(/idp) へのリクエストをバックエンドへ転送します
// --------------------------------------------------------------------------
app.use(
    ['/api', '/oauth', '/idp'], 
    createProxyMiddleware({
        target: BACKEND_URL,
        changeOrigin: true,
        logLevel: 'debug' // 転送ログが出ます
    })
);
// --------------------------------------------------------------------------

// HTMLファイルの動的配信（置換処理）
app.get('/', (req, res) => {
    const fs = require('fs');
    const path = require('path');
    
    // index.htmlを読み込み、BACKEND_URLを置換
    let html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
    // 定数 BACKEND_URL を使用
    html = html.replace('BACKEND_URL_PLACEHOLDER', BACKEND_URL);
    
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
    // 定数 BACKEND_URL を使用
    html = html.replace('BACKEND_URL_PLACEHOLDER', BACKEND_URL);
    
    res.send(html);
});

app.listen(PORT, () => {
    console.log(`Frontend server is running on port ${PORT}`);
    console.log(`Proxying requests to Backend: ${BACKEND_URL}`);
});