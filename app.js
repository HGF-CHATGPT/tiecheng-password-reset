'use strict';

const SUPABASE_URL = 'https://numuklpdlzkzkkxwhlqe.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_7JonBxGK2un-23DVW5b2pw_uw8UQ3on';
const messageEl = document.getElementById('message');
const loadingEl = document.getElementById('loading');
const formEl = document.getElementById('resetForm');
const doneEl = document.getElementById('doneMessage');
const submitBtn = document.getElementById('submitBtn');

let authClient = null;
let recoveryReady = false;

function showMessage(text, type = 'error') {
    messageEl.textContent = text;
    messageEl.className = `message ${type}`;
}

function hideMessage() {
    messageEl.textContent = '';
    messageEl.className = 'message';
}

function finishLoading() {
    loadingEl.classList.add('hidden');
}

function showResetForm() {
    recoveryReady = true;
    finishLoading();
    hideMessage();
    formEl.classList.remove('hidden');
    document.getElementById('newPassword').focus();
    window.history.replaceState({}, document.title, window.location.pathname);
}

function friendlyError(error) {
    const detail = String(error && error.message ? error.message : error || '').toLowerCase();
    if (detail.includes('expired') || detail.includes('invalid') || detail.includes('otp')) {
        return '重置链接已失效或已过期，请返回工具重新申请密码重置邮件。';
    }
    if (detail.includes('pkce') || detail.includes('code verifier')) {
        return '当前恢复链接无法在此浏览器完成验证，请返回工具重新申请密码重置邮件。';
    }
    return '重置链接验证失败，请返回工具重新申请密码重置邮件。';
}

async function establishRecoverySession() {
    const query = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const providerError = query.get('error_description') || hash.get('error_description');
    if (providerError) {
        throw new Error(providerError);
    }

    const recoveryType = query.get('type') || hash.get('type');
    if (recoveryType && recoveryType !== 'recovery') {
        throw new Error('invalid recovery type');
    }

    const accessToken = hash.get('access_token');
    const refreshToken = hash.get('refresh_token');
    if (accessToken && refreshToken) {
        const { data, error } = await authClient.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken
        });
        if (error) throw error;
        return data.session;
    }

    const tokenHash = query.get('token_hash');
    if (tokenHash) {
        const { data, error } = await authClient.auth.verifyOtp({
            token_hash: tokenHash,
            type: 'recovery'
        });
        if (error) throw error;
        return data.session;
    }

    const code = query.get('code');
    if (code) {
        const { data, error } = await authClient.auth.exchangeCodeForSession(code);
        if (error) throw error;
        return data.session;
    }

    const { data, error } = await authClient.auth.getSession();
    if (error) throw error;
    return data.session;
}

async function init() {
    try {
        if (!window.supabase || !window.supabase.createClient) {
            throw new Error('页面组件加载失败');
        }
        if (!SUPABASE_ANON_KEY || !SUPABASE_ANON_KEY.startsWith('sb_publishable_')) {
            finishLoading();
            showMessage('密码重置页面尚未完成管理员配置，请联系管理员。');
            return;
        }
        authClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            auth: { detectSessionInUrl: false, persistSession: false, autoRefreshToken: false }
        });
        const session = await establishRecoverySession();
        if (!session) {
            throw new Error('invalid recovery session');
        }
        showResetForm();
    } catch (error) {
        finishLoading();
        showMessage(friendlyError(error));
    }
}

formEl.addEventListener('submit', async (event) => {
    event.preventDefault();
    hideMessage();
    if (!recoveryReady || !authClient) {
        showMessage('重置会话尚未就绪，请重新打开邮件中的链接。');
        return;
    }

    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    if (newPassword !== confirmPassword) {
        showMessage('两次输入的密码不一致，请重新输入。');
        return;
    }
    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/.test(newPassword)) {
        showMessage('新密码至少 8 位，并需同时包含大写字母、小写字母、数字和特殊字符。');
        return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = '正在提交……';
    try {
        const { error } = await authClient.auth.updateUser({ password: newPassword });
        if (error) throw error;
        await authClient.auth.signOut({ scope: 'local' });
        formEl.classList.add('hidden');
        doneEl.classList.remove('hidden');
        window.history.replaceState({}, document.title, window.location.pathname);
    } catch (error) {
        submitBtn.disabled = false;
        submitBtn.textContent = '确认重置';
        showMessage(`密码重置失败：${error && error.message ? error.message : '请稍后重试。'}`);
    }
});

init();
