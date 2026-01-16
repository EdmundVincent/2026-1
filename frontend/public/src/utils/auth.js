class AuthManager {
    constructor() {
        this.userInfo = null;
        this.token = localStorage.getItem('access_token');
        this.config = {
            clientId: "frontend-app",
            authUrl: "/oauth/authorize", // 经由 server.js 代理
            tokenUrl: "/oauth/token",
            userInfoUrl: "/oauth/userinfo"
        };
        this.initializeAuth();
    }

    async initializeAuth() {
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');

        if (code) {
            await this.handleCallback(code);
        } else if (this.token) {
            await this.fetchUserInfo();
        } else {
            console.log("未登录，跳转认证...");
            this.login();
        }
    }

    login() {
        // 直接跳转，不弹窗
        const params = new URLSearchParams({
            client_id: this.config.clientId,
            redirect_uri: window.location.origin,
            response_type: "code",
            state: "init"
        });
        window.location.href = `${this.config.authUrl}?${params.toString()}`;
    }

    async handleCallback(code) {
        window.history.replaceState({}, document.title, window.location.pathname);
        try {
            const formData = new URLSearchParams();
            formData.append('grant_type', 'authorization_code');
            formData.append('code', code);
            formData.append('client_id', this.config.clientId);
            formData.append('client_secret', 'frontend-secret');
            formData.append('redirect_uri', window.location.origin);

            const res = await fetch(this.config.tokenUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: formData
            });
            
            if(res.ok) {
                const data = await res.json();
                this.token = data.access_token;
                localStorage.setItem('access_token', this.token);
                await this.fetchUserInfo();
            } else {
                alert("登录验证失败，请重试");
                this.login();
            }
        } catch (e) {
            console.error(e);
        }
    }

    async fetchUserInfo() {
        try {
            const res = await fetch(this.config.userInfoUrl, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            if (res.ok) {
                this.userInfo = await res.json();
                this.displayUserInfo();
            } else {
                this.logout();
            }
        } catch (e) { this.logout(); }
    }

    logout() {
        localStorage.removeItem('access_token');
        this.userInfo = null;
        this.login();
    }

    displayUserInfo() {
        const el = document.getElementById('userWelcome');
        if (el && this.userInfo) {
            el.textContent = `User: ${this.userInfo.name}`;
            el.style.color = 'black'; // 确保不是红色的报错颜色
        }
    }
}
window.authManager = new AuthManager();