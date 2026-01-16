/**
 * Internal IDP Authentication Manager
 * 适配 idp.py 的 OAuth2 流程
 */
class AuthManager {
    constructor() {
        this.userInfo = null;
        this.token = localStorage.getItem('access_token');
        // 配置项：必须与数据库(clients表)里的设置一致
        this.config = {
            clientId: "frontend-app", 
            authUrl: "/oauth/authorize",
            tokenUrl: "/oauth/token",
            userInfoUrl: "/oauth/userinfo"
        };
        
        // 启动时自动检查状态
        this.initializeAuth();
    }

    /**
     * 初始化认证状态
     */
    async initializeAuth() {
        // 1. 检查 URL 是否包含回调的 Code
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');

        if (code) {
            // 如果有 code，说明刚从登录页跳回来，去换 Token
            await this.handleCallback(code);
        } else if (this.token) {
            // 如果本地有 token，尝试获取用户信息验证有效性
            await this.fetchUserInfo();
        } else {
            // 既没 token 也没 code，执行登录跳转
            console.log("未登录，跳转至登录页...");
            this.login();
        }
    }

    /**
     * 登录：跳转到后端 /oauth/authorize
     */
    login() {
        // 生成随机 state 防止 CSRF (简化版)
        const state = Math.random().toString(36).substring(7);
        localStorage.setItem('oauth_state', state);

        const params = new URLSearchParams({
            client_id: this.config.clientId,
            redirect_uri: window.location.origin, // 回调到当前首页
            response_type: "code",
            state: state
        });

        // 这里的路径会经过 server.js 的代理转发到 backend/idp.py
        window.location.href = `${this.config.authUrl}?${params.toString()}`;
    }

    /**
     * 处理回调：Code 换 Token
     */
    async handleCallback(code) {
        // 清除 URL 里的 code，看着干净点
        window.history.replaceState({}, document.title, window.location.pathname);

        try {
            const formData = new URLSearchParams();
            formData.append('grant_type', 'authorization_code');
            formData.append('code', code);
            formData.append('client_id', this.config.clientId);
            formData.append('client_secret', 'frontend-secret'); 
            formData.append('redirect_uri', window.location.origin);

            const response = await fetch(this.config.tokenUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: formData
            });

            if (!response.ok) throw new Error('Token exchange failed');

            const data = await response.json();
            if (data.access_token) {
                this.token = data.access_token;
                localStorage.setItem('access_token', this.token);
                await this.fetchUserInfo(); // 拿到 Token 后立即拉取用户信息
            }
        } catch (error) {
            console.error('登录回调处理失败:', error);
            alert('登录失败，请重试');
            this.login(); // 失败后重试登录
        }
    }

    /**
     * 用 Token 获取用户信息
     */
    async fetchUserInfo() {
        if (!this.token) return;

        try {
            const response = await fetch(this.config.userInfoUrl, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });

            if (response.ok) {
                this.userInfo = await response.json();
                this.displayUserInfo();
            } else {
                // Token 可能过期了，清除并重新登录
                this.logout(); 
            }
        } catch (error) {
            console.error('获取用户信息失败:', error);
            this.logout();
        }
    }

    /**
     * 登出
     */
    logout() {
        this.token = null;
        this.userInfo = null;
        localStorage.removeItem('access_token');
        this.displayUserInfo();
        this.login(); // 登出后直接跳回登录页
    }

    /**
     * 界面更新逻辑
     */
    displayUserInfo() {
        const userWelcomeElement = document.getElementById('userWelcome');
        const logoutButton = document.getElementById('logoutButton');
        const loginButton = document.getElementById('loginButton'); 

        if (this.userInfo) {
            // 已登录
            if (userWelcomeElement) {
                userWelcomeElement.textContent = `你好, ${this.userInfo.name || this.userInfo.sub}`;
                userWelcomeElement.style.display = 'block';
            }
            if (logoutButton) {
                logoutButton.style.display = 'block';
                // 重新绑定登出事件
                logoutButton.onclick = (e) => {
                    e.preventDefault();
                    this.logout();
                };
            }
            if (loginButton) loginButton.style.display = 'none';
        } else {
            // 未登录
            if (userWelcomeElement) userWelcomeElement.textContent = '';
            if (logoutButton) logoutButton.style.display = 'none';
        }
    }

    // 给其他模块调用的接口
    getCurrentUser() {
        return this.userInfo;
    }
    
    getAccessToken() {
        return this.token;
    }
}

// 初始化
window.authManager = new AuthManager();