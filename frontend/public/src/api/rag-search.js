/**
 * RagSearch - RAG検索APIクライアントクラス
 */
export class RagSearch {
  constructor(options={}){ this.globalState = options.globalState; }
  
  getBackendUrl() {
    return window.BACKEND_URL || 'http://localhost:8000';
  }
  
  async performRAGSearch(text){
    const backendUrl = this.getBackendUrl();
    
    // 👇 修复：使用 window.authManager.fetchWithAuth 发送请求
    try {
        const resp = await window.authManager.fetchWithAuth(`${backendUrl}/api/rag`, {
            method: 'POST', 
            body: JSON.stringify({ text })
        });

        if (!resp.ok) return null;
        return await resp.json();
    } catch (e) {
        console.error("RAG search failed:", e);
        return null;
    }
  }
}