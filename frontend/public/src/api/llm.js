/**
 * Llm - 大規模言語モデル API クライアントクラス
 */
export class Llm {
  constructor(options={}){ this.globalState = options.globalState; }
  
  getBackendUrl() {
    return window.BACKEND_URL || 'http://localhost:8000';
  }
  
  async requestTranslation(prompt, targetText='') {
    const backendUrl = this.getBackendUrl();
    
    // 👇 修复：使用 window.authManager.fetchWithAuth 发送请求
    try {
        const resp = await window.authManager.fetchWithAuth(`${backendUrl}/api/translate`, { 
            method: 'POST', 
            body: JSON.stringify({ text: targetText, prompt }) 
        });
        
        if (!resp.ok) return null;
        const data = await resp.json();
        return data.translation || null;
    } catch (e) {
        console.error("Translation request failed:", e);
        return null;
    }
  }
}