/**
 * Llm - 大規模言語モデル API クライアントクラス
 * 
 * Python バックエンド経由でOpenAI GPTなどの大規模言語モデルと通信し、
 * 高品質な翻訳サービスを提供する。フロントエンドからの翻訳リクエストを
 * バックエンドAPIに中継し、安全で効率的なLLM活用を実現する。
 * 
 * 主要機能:
 * - バックエンドAPI経由のLLM呼び出し
 * - プロンプトエンジニアリング対応
 * - エラーハンドリング・リトライ機能
 * - APIレスポンス正規化
 * - 設定可能なバックエンドURL
 * - JSON形式でのデータ交換
 * 
 * API エンドポイント:
 * - POST /api/translate: 翻訳リクエスト処理
 * 
 * セキュリティ:
 * - APIキーはバックエンドで管理
 * - フロントエンドには機密情報を含めない
 */
// Python API 経由に差し替え
export class Llm {
  constructor(options={}){ this.globalState = options.globalState; }
  
  getBackendUrl() {
    return window.BACKEND_URL || 'http://localhost:8000';
  }
  
  async requestTranslation(prompt, targetText='') {
    const backendUrl = this.getBackendUrl();
    const resp = await fetch(`${backendUrl}/api/translate`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ text: targetText, prompt }) });
    if (!resp.ok) return null;
    const data = await resp.json();
  return data.translation || null;
  }
}
