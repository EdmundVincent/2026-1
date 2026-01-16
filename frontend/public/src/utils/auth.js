class AuthManager {
    constructor() {
        this.userInfo = null;
        this.backendUrl = window.BACKEND_URL || 'http://localhost:8000';
        this.clientId = 'demo-app';
        this.clientSecret = 'demo-secret';
        this.redirectUri = `${window.location.origin}/callback`;
        this.stateKey = 'oauth_state';
        this.tokenKey = 'internal_access_token';
        this.initializeAuth();
    }
    async initializeAuth() {
        const token = this.getToken();
        const code = this.getCodeFromUrl();
        if (code) {
            await this.exchangeCodeForToken(code);
            this.clearCodeFromUrl();
        }
        const ok = await this.fetchUserInfoWithToken();
        if (ok) {
            this.setupLogoutButton();
            return;
        }
        await this.loginFlow();
    }
    getToken() {
        try { return localStorage.getItem(this.tokenKey) || null; } catch { return null; }
    }
    setToken(token) {
        try { localStorage.setItem(this.tokenKey, token); } catch {}
    }
    getCodeFromUrl() {
        const params = new URLSearchParams(window.location.search);
        return params.get('code');
    }
    clearCodeFromUrl() {
        const url = new URL(window.location.href);
        url.searchParams.delete('code');
        url.searchParams.delete('state');
        window.history.replaceState({}, document.title, url.toString());
    }
    async exchangeCodeForToken(code) {
        const form = new URLSearchParams();
        form.set('grant_type', 'authorization_code');
        form.set('code', code);
        form.set('client_id', this.clientId);
        form.set('client_secret', this.clientSecret);
        form.set('redirect_uri', this.redirectUri);
        const resp = await fetch(`${this.backendUrl}/oauth/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: form.toString()
        });
        if (!resp.ok) { this.showErrorMessage('トークン取得に失敗しました'); return false; }
        const data = await resp.json();
        if (data && data.access_token) {
            this.setToken(data.access_token);
            return true;
        }
        return false;
    }
    async fetchUserInfoWithToken() {
        const token = this.getToken();
        if (!token) return false;
        const resp = await fetch(`${this.backendUrl}/api/me`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!resp.ok) return false;
        const data = await resp.json();
        this.userInfo = { name: data.name || null, email: data.email || null };
        this.displayUserInfo();
        this.setupLogoutButton();
        return true;
    }
    async loginFlow() {
        const username = window.prompt('ユーザー名を入力してください');
        const password = window.prompt('パスワードを入力してください');
        if (!username || !password) { this.showErrorMessage('ログインが必要です'); return; }
        const resp = await fetch(`${this.backendUrl}/idp/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
            credentials: 'include'
        });
        if (!resp.ok) { this.showErrorMessage('ログインに失敗しました'); return; }
        const state = Math.random().toString(36).slice(2);
        try { localStorage.setItem(this.stateKey, state); } catch {}
        const authUrl = `${this.backendUrl}/oauth/authorize?client_id=${encodeURIComponent(this.clientId)}&redirect_uri=${encodeURIComponent(this.redirectUri)}&response_type=code&state=${encodeURIComponent(state)}`;
        window.location.href = authUrl;
    }
    displayUserInfo() {
        const el = document.getElementById('userWelcome');
        if (el && this.userInfo) {
            const name = this.userInfo.name || this.userInfo.email || 'ユーザー';
            el.textContent = `ユーザ名: ${name}`;
        }
    }
    setupLogoutButton() {
        const logoutButton = document.getElementById('logoutButton');
        if (logoutButton) {
            logoutButton.addEventListener('click', () => {
                this.logout();
            });
        }
    }
    logout() {
        try { localStorage.removeItem(this.tokenKey); } catch {}
        alert('ログアウトしました');
        window.location.reload();
    }
    showErrorMessage(message) {
        const el = document.getElementById('userWelcome');
        if (el) {
            el.textContent = message;
            el.style.color = '#dc3545';
        }
    }
    getCurrentUser() {
        return this.userInfo;
    }
}
window.authManager = new AuthManager();
