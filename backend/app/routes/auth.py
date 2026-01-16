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
            clientId: "frontend-app", // 下一步我们会把这个ID写入数据库
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
            // 既没 token 也没 code，显示未登录状态
            console.log("未登录");
            this.displayUserInfo(); // 更新 UI 为未登录状态
        }

        this.setupLogoutButton();
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
            formData.append('client_secret', 'frontend-secret'); // 前端应用通常不存 secret，但您的 idp.py 目前做了校验，所以暂时硬编码
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
            this.showErrorMessage('登录失败，请重试');
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
                // Token 可能过期了
                this.logout(); 
            }
        } catch (error) {
            console.error('获取用户信息失败:', error);
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
        // 可选：跳回首页或刷新
        window.location.href = "/";
    }

    /**
     * 界面更新逻辑 (保留您原有的 DOM 操作逻辑)
     */
    displayUserInfo() {
        const userWelcomeElement = document.getElementById('userWelcome');
        const logoutButton = document.getElementById('logoutButton');
        const loginButton = document.getElementById('loginButton'); // 假设您有个登录按钮

        if (this.userInfo) {
            // 已登录
            if (userWelcomeElement) {
                userWelcomeElement.textContent = `你好, ${this.userInfo.name || this.userInfo.sub}`;
                userWelcomeElement.style.display = 'block';
            }
            if (logoutButton) logoutButton.style.display = 'block';
            if (loginButton) loginButton.style.display = 'none';
        } else {
            // 未登录
            if (userWelcomeElement) userWelcomeElement.textContent = '';
            if (logoutButton) logoutButton.style.display = 'none';
            // 如果界面上有登录按钮，需要绑定事件
            if (loginButton) {
                loginButton.style.display = 'block';
                loginButton.onclick = () => this.login();
            } else {
                // 如果没有登录按钮，可能需要自动跳转去登录？
                // this.login(); 
            }
        }
    }

    setupLogoutButton() {
        const logoutButton = document.getElementById('logoutButton');
        if (logoutButton) {
            // 移除旧的监听器比较麻烦，这里简单粗暴覆盖 onclick
            logoutButton.onclick = () => this.logout();
        }
    }

    showErrorMessage(msg) {
        console.error(msg);
        alert(msg);
    }

    // 给其他模块调用的接口
    getCurrentUser() {
        return this.userInfo;
    }
    
    // 获取 Token 给其他 API 请求使用
    getAccessToken() {
        return this.token;
    }
}

// 初始化
window.authManager = new AuthManager();