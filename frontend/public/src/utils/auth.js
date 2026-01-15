/**
 * WebApp EasyAuth機能を使用した認証管理
 */
class AuthManager {
    constructor() {
        this.userInfo = null;
        this.initializeAuth();
    }

    /**
     * 認証機能を初期化
     */
    async initializeAuth() {
        try {
            await this.getUserInfo();
            this.setupLogoutButton();
        } catch (error) {
            console.error('認証初期化エラー:', error);
            this.showErrorMessage('認証情報の取得に失敗しました');
        }
    }

    /**
     * EasyAuthからユーザー情報を取得
     */
    async getUserInfo() {
        try {
            const response = await fetch('/.auth/me');
            
            if (!response.ok) {
                throw new Error(`認証情報の取得に失敗: ${response.status}`);
            }

            const authData = await response.json();
            
            if (authData && authData.length > 0 && authData[0].user_claims) {
                this.userInfo = this.extractUserInfo(authData[0]);
                this.displayUserInfo();
            } else {
                throw new Error('認証情報が見つかりません');
            }
        } catch (error) {
            console.error('ユーザー情報取得エラー:', error);
            // 開発環境用のフォールバック
            if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                this.userInfo = {
                    name: 'Test User',
                    email: 'test@example.com'
                };
                this.displayUserInfo();
            } else {
                throw error;
            }
        }
    }

    /**
     * EasyAuthのユーザークレームからユーザー情報を抽出
     */
    extractUserInfo(authInfo) {
        const claims = authInfo.user_claims || [];
        const userInfo = {
            name: null,
            email: null
        };

        // 一般的なクレームタイプからユーザー情報を抽出
        claims.forEach(claim => {
            switch (claim.typ) {
                case 'name':
                case 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name':
                    userInfo.name = claim.val;
                    break;
                case 'email':
                case 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress':
                    userInfo.email = claim.val;
                    break;
                case 'preferred_username':
                    if (!userInfo.name) {
                        userInfo.name = claim.val;
                    }
                    break;
            }
        });

        // 名前が取得できない場合はemailから抽出
        if (!userInfo.name && userInfo.email) {
            userInfo.name = userInfo.email.split('@')[0];
        }

        return userInfo;
    }

    /**
     * ユーザー情報をUIに表示
     */
    displayUserInfo() {
        const userWelcomeElement = document.getElementById('userWelcome');
        if (userWelcomeElement && this.userInfo) {
            const displayName = this.userInfo.name || this.userInfo.email || 'ユーザー';
            userWelcomeElement.textContent = `ユーザ名: ${displayName}`;
        }
    }

    /**
     * ログアウトボタンのイベントを設定
     */
    setupLogoutButton() {
        const logoutButton = document.getElementById('logoutButton');
        if (logoutButton) {
            logoutButton.addEventListener('click', () => {
                this.logout();
            });
        }
    }

    /**
     * ログアウト処理
     */
    logout() {
        // EasyAuthのログアウトエンドポイントにリダイレクト
        // 本番環境では/.auth/logout?post_logout_redirect_uri=を使用
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            // 開発環境用の模擬ログアウト
            alert('ログアウトしました（開発環境）');
            window.location.reload();
        } else {
            // 本番環境のEasyAuthログアウト
            const logoutUrl = `/.auth/logout?post_logout_redirect_uri=${encodeURIComponent(window.location.origin)}`;
            window.location.href = logoutUrl;
        }
    }

    /**
     * エラーメッセージを表示
     */
    showErrorMessage(message) {
        const userWelcomeElement = document.getElementById('userWelcome');
        if (userWelcomeElement) {
            userWelcomeElement.textContent = message;
            userWelcomeElement.style.color = '#dc3545';
        }
    }

    /**
     * 現在のユーザー情報を取得
     */
    getCurrentUser() {
        return this.userInfo;
    }
}

// グローバルインスタンスとして認証マネージャーを作成
window.authManager = new AuthManager();
