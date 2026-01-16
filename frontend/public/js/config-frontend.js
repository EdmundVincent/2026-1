// フロント側設定（サーバーから動的に取得）
// 機密情報は含まず、必要最低限の設定のみ
var translationConfig = {
  RAG_SEARCH_SIZE: 5  // デフォルト値、サーバーから更新される
};

// バックエンドのベースURL（グローバル変数から取得）
const getBackendUrl = () => {
  return window.BACKEND_URL || 'http://localhost:8000';
};

// サーバーから設定を取得
async function loadConfig() {
  try {
    const backendUrl = getBackendUrl();
    const token = localStorage.getItem('internal_access_token');
    const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
    const response = await fetch(`${backendUrl}/api/config`, { headers });
    if (response.ok) {
      const data = await response.json();
      // サーバーから取得した設定でtranslationConfigを更新
      Object.assign(translationConfig, data.frontend_config);
    } else {
      console.warn('設定の取得に失敗しました。デフォルト値を使用します。');
    }
  } catch (error) {
    console.warn('設定の取得中にエラーが発生しました。デフォルト値を使用します。', error);
  }
}

// 初期化時に設定を読み込み
loadConfig();
