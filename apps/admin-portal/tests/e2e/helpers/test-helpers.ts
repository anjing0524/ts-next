import { Page, expect } from '@playwright/test';
import crypto from 'crypto';

/**
 * E2E 测试辅助函数
 *
 * 提供通用的测试辅助功能,包括:
 * - OAuth 认证流程
 * - Token 管理
 * - PKCE 参数生成
 * - JWT 解析
 */

const baseUrl = process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:3002';
const defaultUsername = process.env.TEST_ADMIN_USERNAME || 'admin';
const defaultPassword = process.env.TEST_ADMIN_PASSWORD || 'admin123';

/**
 * 完成完整的 OAuth 登录流程 - 遵循标准 OAuth 2.1 认证流程
 *
 * 步骤：
 * 1. 访问受保护资源 (例如 /admin)
 * 2. PermissionGuard 检查权限，未认证则重定向到 /login?redirect=/admin
 * 3. 在登录页面填充凭证并提交
 * 4. OAuth Service 认证用户并重定向回原始资源 (/admin)
 * 5. 如果需要，处理同意页面
 * 6. 最终回到受保护资源
 *
 * @param page - Playwright Page 对象
 * @param username - 用户名 (默认: admin)
 * @param password - 密码 (默认: admin123)
 * @param protectedResource - 受保护的资源路径 (默认: /admin)
 * @returns Promise<string> - 返回 access_token
 */
export async function completeOAuthLogin(
    page: Page,
    username: string = defaultUsername,
    password: string = defaultPassword,
    protectedResource: string = '/admin'
): Promise<string> {
    // 1. 首先直接导航到登录页面（避免复杂的重定向链）
    console.log('Navigating directly to login page...');
    try {
        await page.goto(`${baseUrl}/login`, {
            waitUntil: 'load',
            timeout: 15000
        });
    } catch (err) {
        console.warn(`Login page load error: ${err.message}`);
        throw new Error(`Failed to load login page: ${err.message}`);
    }

    // 2. 检查是否成功加载登录页面
    const currentUrl = page.url();
    console.log('Current URL after login page load:', currentUrl);

    if (!currentUrl.includes('/login')) {
        // 如果没有在登录页面上，则页面出错
        throw new Error(`Failed to load login page. Current URL: ${currentUrl}`);
    }

    // 3. 等待登录表单加载
    await page.waitForTimeout(500);

    // 等待页面网络空闲
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {
        console.log('networkidle timeout (okay for SPA)');
    });

    // 等待表单内容加载 - 先等待特定的文本出现，然后等待输入字段
    try {
        console.log('Waiting for login form text content...');
        // 等待"登录"或"用户名"文本出现，表示表单已加载
        await page.getByText(/登录|用户名|密码/).first().waitFor({ timeout: 15000 });

        console.log('Waiting for username input field...');
        // 然后等待表单输入字段
        await page.waitForSelector('input[data-testid="username-input"]', { timeout: 10000 });
    } catch (err) {
        // 诊断：检查页面上的实际内容
        const pageUrl = page.url();
        const bodyText = await page.innerText('body').catch(() => 'N/A');
        const inputCount = await page.locator('input').count();
        console.error(`Form load failed. URL: ${pageUrl}`);
        console.error('Body text preview:', bodyText.substring(0, 500));
        console.error('Inputs on page:', inputCount);
        throw new Error(`Login form failed to load: ${err.message}`);
    }

    // 4. 填充登录表单
    console.log('Filling login form with username:', username);
    const usernameField = page.getByTestId('username-input');
    await usernameField.fill(username);

    const passwordField = page.getByTestId('password-input');
    await passwordField.fill(password);

    // 5. 使用浏览器 API 直接执行登录（避免 Playwright 点击事件的竞态条件）
    console.log('Executing login via browser script...');

    // 在执行脚本前设置导航监听器，准备捕获登录后的重定向
    const navigationPromise = page.waitForNavigation({
        url: /.*/,
        timeout: 25000
    }).catch((err) => {
        console.warn('Navigation wait error:', err.message);
        return null;
    });

    // 在 Playwright 执行上下文中直接执行登录提交
    // 在脚本中实现完整的表单提交逻辑，以避免竞态条件
    let loginResult = null;
    try {
        loginResult = await page.evaluate(async (args: { username: string; password: string }) => {
            const usernameInput = document.querySelector('input[data-testid="username-input"]') as HTMLInputElement;
            const passwordInput = document.querySelector('input[data-testid="password-input"]') as HTMLInputElement;
            const loginButton = document.querySelector('button[data-testid="login-button"]') as HTMLButtonElement;

            if (!loginButton || !usernameInput || !passwordInput) {
                return { success: false, error: 'Form elements not found' };
            }

            try {
                // 获取表单的 action 属性或构造默认URL
                const form = loginButton.closest('form') as HTMLFormElement;
                let actionUrl = form?.action || '/api/v2/auth/login';

                // 确保是绝对 URL
                if (!actionUrl.startsWith('http')) {
                    const protocol = window.location.protocol;
                    const host = window.location.host;
                    actionUrl = `${protocol}//${host}${actionUrl}`;
                }

                console.log(`[Script] Attempting POST to ${actionUrl}`);

                // 执行登录 POST 请求
                const response = await fetch(actionUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        username: args.username,
                        password: args.password,
                        redirect: new URLSearchParams(window.location.search).get('redirect') || '/admin'
                    }),
                    credentials: 'include'
                });

                console.log(`[Script] POST to ${actionUrl} returned status ${response.status}`);

                if (!response.ok) {
                    const errorText = await response.text();
                    console.log(`[Script] Error response: ${errorText.substring(0, 500)}`);
                    return { success: false, error: `POST failed with ${response.status}: ${errorText.substring(0, 200)}` };
                }

                const data = await response.json();
                console.log(`[Script] Response data keys: ${Object.keys(data).join(', ')}`);
                console.log(`[Script] Response data: ${JSON.stringify(data).substring(0, 500)}`);

                if (data.redirect_url) {
                    console.log(`[Script] Got redirect_url: ${data.redirect_url}`);
                    // 执行重定向
                    window.location.href = data.redirect_url;
                    // 这会导致页面导航和脚本上下文销毁
                    return { success: true, message: 'Redirecting...' };
                } else if (data.error) {
                    return { success: false, error: `API error: ${data.error}` };
                } else {
                    return { success: false, error: `Unexpected response structure: ${JSON.stringify(data).substring(0, 200)}` };
                }
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                console.log(`[Script] Exception: ${errorMsg}`);
                return { success: false, error: `Script exception: ${errorMsg}` };
            }
        }, { username, password });

        console.log('[Test] Login script result:', loginResult);
    } catch (err) {
        // 这里可能会出现 "Execution context was destroyed" 错误，但这是预期的
        // 表示脚本成功触发了重定向
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.log('[Test] Script execution status:', errorMsg);

        // 如果是 "Execution context was destroyed", 这是正常的（脚本触发了重定向）
        if (!errorMsg.includes('Execution context was destroyed')) {
            console.warn('[Test] Unexpected error during script execution:', errorMsg);
        }
    }

    // 等待导航完成
    console.log('Waiting for post-login navigation to complete...');
    await navigationPromise;

    // 6. 等待导航和页面加载完成
    console.log('Waiting for page navigation to complete...');
    await page.waitForLoadState('load', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1000);

    // 8. 检查当前页面
    const pageUrl = page.url();
    console.log('URL after login attempt:', pageUrl);

    // 8.5 如果仍在登录页面且有错误消息，则登录失败
    if (pageUrl.includes('/login')) {
        const errorElement = page.locator('[role="alert"]');
        const errorText = await errorElement.textContent().catch(() => '');
        if (errorText) {
            throw new Error(`Login failed with error: ${errorText}`);
        }
        // 等待页面稳定，可能正在处理
        await page.waitForTimeout(1000);
    }

    // 9. 处理同意页面 (如果出现)
    const finalUrl = page.url();
    console.log('Final URL before consent check:', finalUrl);

    if (finalUrl.includes('/oauth/consent')) {
        console.log('Consent page detected, clicking approve...');
        // 需要授权
        const consentNavPromise = page.waitForNavigation({ timeout: 20000 }).catch((err) => {
            console.warn('Consent navigation error:', err.message);
        });

        const approveButton =
            page.getByTestId('consent-approve-button') ||
            page.getByRole('button', { name: /allow|approve|授权|允许/i }).first();

        try {
            await approveButton.click();
            await consentNavPromise;
            await page.waitForLoadState('load', { timeout: 10000 }).catch(() => {});
        } catch (err) {
            console.error('Consent approval failed:', err.message);
        }
    }

    // 9. 最终等待页面稳定
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(300);

    console.log('Final URL:', page.url());
    return await getAccessToken(page);
}

/**
 * 从 localStorage 获取 access_token
 *
 * @param page - Playwright Page 对象
 * @returns Promise<string> - access_token
 */
export async function getAccessToken(page: Page): Promise<string> {
    const token = await page.evaluate(() => {
        return localStorage.getItem('access_token') || sessionStorage.getItem('access_token') || '';
    });

    if (!token) {
        throw new Error('Access token not found in storage');
    }

    return token;
}

/**
 * 从存储中获取 refresh_token
 *
 * @param page - Playwright Page 对象
 * @returns Promise<string> - refresh_token
 */
export async function getRefreshToken(page: Page): Promise<string> {
    const token = await page.evaluate(() => {
        return localStorage.getItem('refresh_token') || sessionStorage.getItem('refresh_token') || '';
    });

    if (!token) {
        throw new Error('Refresh token not found in storage');
    }

    return token;
}

/**
 * 撤销 token (调用 OAuth Service 的 revoke 端点)
 *
 * @param page - Playwright Page 对象
 * @param token - 要撤销的 token
 * @param tokenTypeHint - token 类型提示 ('access_token' | 'refresh_token')
 */
export async function revokeToken(
    page: Page,
    token: string,
    tokenTypeHint: 'access_token' | 'refresh_token' = 'refresh_token'
): Promise<void> {
    const response = await page.request.post(`${baseUrl}/api/v2/oauth/revoke`, {
        form: {
            token,
            token_type_hint: tokenTypeHint,
        },
    });

    // RFC 7009: revoke 端点即使失败也返回 200
    expect(response.status()).toBe(200);
}

/**
 * 等待 token 刷新
 *
 * 监听 token 端点的请求,等待 refresh_token grant_type
 *
 * @param page - Playwright Page 对象
 * @returns Promise<void>
 */
export async function waitForTokenRefresh(page: Page): Promise<void> {
    await page.waitForResponse(
        (response) => {
            const isTokenEndpoint = response.url().includes('/api/v2/oauth/token');
            const isPost = response.request().method() === 'POST';

            if (isTokenEndpoint && isPost) {
                // 检查请求体是否包含 refresh_token grant_type
                const postData = response.request().postData();
                return postData?.includes('grant_type=refresh_token') || false;
            }

            return false;
        },
        { timeout: 10000 }
    );
}

/**
 * 清除所有认证状态
 *
 * 清除 localStorage, sessionStorage 和 cookies
 *
 * @param page - Playwright Page 对象
 */
export async function clearAuthState(page: Page): Promise<void> {
    // 清除 storage
    await page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
    });

    // 清除 cookies
    await page.context().clearCookies();
}

/**
 * 解析 JWT token 的 payload
 *
 * @param token - JWT token 字符串
 * @returns any - Token claims
 */
export function extractJWTClaims(token: string): any {
    const parts = token.split('.');
    if (parts.length !== 3) {
        throw new Error('Invalid JWT format');
    }

    // Base64URL decode
    const payload = parts[1];
    const decoded = Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');

    return JSON.parse(decoded);
}

/**
 * 生成 PKCE 参数对
 *
 * @returns Promise<{ verifier: string, challenge: string }>
 */
export async function generatePKCEPair(): Promise<{ verifier: string; challenge: string }> {
    // 生成 code_verifier (43-128 字符的随机字符串)
    const verifier = base64URLEncode(crypto.randomBytes(32));

    // 计算 code_challenge (SHA256 hash of verifier)
    const challenge = base64URLEncode(crypto.createHash('sha256').update(verifier).digest());

    return { verifier, challenge };
}

/**
 * Base64URL 编码
 *
 * @param buffer - Buffer 对象
 * @returns string - Base64URL 编码的字符串
 */
function base64URLEncode(buffer: Buffer): string {
    return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * 验证 PKCE challenge
 *
 * @param verifier - code_verifier
 * @param challenge - code_challenge
 * @returns boolean - 是否匹配
 */
export async function verifyPKCEChallenge(verifier: string, challenge: string): Promise<boolean> {
    const computedChallenge = base64URLEncode(crypto.createHash('sha256').update(verifier).digest());
    return computedChallenge === challenge;
}

/**
 * 等待特定的网络请求
 *
 * @param page - Playwright Page 对象
 * @param urlPattern - URL 匹配模式
 * @param method - HTTP 方法
 * @returns Promise<Response>
 */
export async function waitForRequest(page: Page, urlPattern: string | RegExp, method: string = 'GET'): Promise<any> {
    return await page.waitForResponse(
        (response) => {
            const url = response.url();
            const matches = typeof urlPattern === 'string' ? url.includes(urlPattern) : urlPattern.test(url);
            return matches && response.request().method() === method;
        },
        { timeout: 10000 }
    );
}

/**
 * 模拟 token 过期
 *
 * 通过修改 localStorage 中的 token 过期时间
 *
 * @param page - Playwright Page 对象
 */
export async function expireAccessToken(page: Page): Promise<void> {
    await page.evaluate(() => {
        // 将 token 过期时间设置为过去
        localStorage.setItem('token_expires_at', String(Date.now() / 1000 - 3600));
    });
}

/**
 * 获取用户权限列表
 *
 * 从 access_token 的 claims 中提取权限
 *
 * @param page - Playwright Page 对象
 * @returns Promise<string[]> - 权限列表
 */
export async function getUserPermissions(page: Page): Promise<string[]> {
    const token = await getAccessToken(page);
    const claims = await extractJWTClaims(token);
    return claims.permissions || [];
}

/**
 * 检查用户是否有特定权限
 *
 * @param page - Playwright Page 对象
 * @param permission - 权限名称 (例如 'users:create')
 * @returns Promise<boolean>
 */
export async function hasPermission(page: Page, permission: string): Promise<boolean> {
    const permissions = await getUserPermissions(page);
    return permissions.includes(permission) || permissions.includes('*');
}

/**
 * 等待页面完全加载
 *
 * @param page - Playwright Page 对象
 */
export async function waitForPageReady(page: Page): Promise<void> {
    await page.waitForLoadState('domcontentloaded');
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {
        // networkidle 超时是可接受的
    });
}

/**
 * 获取 API 错误信息
 *
 * @param response - Response 对象
 * @returns Promise<string> - 错误信息
 */
export async function getErrorMessage(response: any): Promise<string> {
    try {
        const body = await response.json();
        return body.error || body.message || 'Unknown error';
    } catch {
        return await response.text();
    }
}

/**
 * 获取有效的授权码
 *
 * 完成完整的 OAuth 流程直到获得授权码,但不交换 token
 * 这用于测试 PKCE 验证和 token 交换逻辑
 *
 * @param page - Playwright Page 对象
 * @param pkce - PKCE 参数对
 * @param username - 用户名 (默认: admin)
 * @param password - 密码 (默认: admin123)
 * @param customNonce - 自定义 nonce (可选,用于 OIDC 测试)
 * @returns Promise<string> - 授权码
 */
export async function getAuthorizationCode(
    page: Page,
    pkce: { verifier: string; challenge: string },
    username: string = defaultUsername,
    password: string = defaultPassword,
    customNonce?: string
): Promise<string> {
    // 1. 清除之前的状态
    await clearAuthState(page);

    // 2. 存储 PKCE 参数 (模拟客户端行为)
    await page.evaluate(
        (params) => {
            sessionStorage.setItem('pkce_code_verifier', params.verifier);
            sessionStorage.setItem('pkce_code_challenge', params.challenge);
        },
        pkce
    );

    // 3. 生成 state 和 nonce (如果没有自定义提供)
    const state = generateRandomString(32);
    const nonce = customNonce || generateRandomString(32);

    await page.evaluate(
        (params) => {
            sessionStorage.setItem('oauth_state', params.state);
            sessionStorage.setItem('oauth_nonce', params.nonce);
        },
        { state, nonce }
    );

    // 4. 构建授权请求 URL
    const authorizeUrl = new URL(`${baseUrl}/api/v2/oauth/authorize`);
    authorizeUrl.searchParams.set('client_id', 'admin-portal-client');
    authorizeUrl.searchParams.set('redirect_uri', `${baseUrl}/auth/callback`);
    authorizeUrl.searchParams.set('response_type', 'code');
    authorizeUrl.searchParams.set('scope', 'openid profile email');
    authorizeUrl.searchParams.set('code_challenge', pkce.challenge);
    authorizeUrl.searchParams.set('code_challenge_method', 'S256');
    authorizeUrl.searchParams.set('state', state);
    authorizeUrl.searchParams.set('nonce', nonce);

    // 5. 导航到授权端点
    await page.goto(authorizeUrl.toString());
    await page.waitForURL(/.*/, { timeout: 5000 });

    // 6. 如果重定向到登录页,完成登录
    if (page.url().includes('/login')) {
        // 等待表单加载
        await page.waitForSelector('form', { timeout: 5000 });

        // 等待输入框可见
        const usernameField = page.getByTestId('username-input');
        await usernameField.waitFor({ state: 'visible', timeout: 5000 });
        await usernameField.fill(username);

        const passwordField = page.getByTestId('password-input');
        await passwordField.waitFor({ state: 'visible', timeout: 5000 });
        await passwordField.fill(password);

        // 等待登录响应
        const loginResponsePromise = page.waitForResponse(
            (response) => response.url().includes('/api/v2/auth/login') && response.request().method() === 'POST',
            { timeout: 10000 }
        );

        await page.getByTestId('login-button').click();

        // 验证登录响应
        const loginResponse = await loginResponsePromise;
        expect(loginResponse.status()).toBe(200);

        await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {
            // 网络空闲超时是可接受的
        });
    }

    // 7. 处理同意页面 (如果有)
    if (page.url().includes('/oauth/consent')) {
        const approveButton =
            page.getByTestId('consent-approve-button') || page.getByRole('button', { name: /allow|approve|授权|允许/i });

        if (await approveButton.isVisible()) {
            await approveButton.click();
        }
    }

    // 8. 等待重定向到回调 URL (包含授权码)
    await page.waitForURL(/.*\/auth\/callback\?code=.*/, { timeout: 10000 });

    // 9. 提取授权码
    const url = new URL(page.url());
    const code = url.searchParams.get('code');

    if (!code) {
        throw new Error('No authorization code received in callback URL');
    }

    console.log('✓ Authorization code obtained:', code.substring(0, 20) + '...');

    return code;
}

/**
 * 生成随机字符串 (用于 state 和 nonce)
 *
 * @param length - 字符串长度
 * @returns string - 随机字符串
 */
export function generateRandomString(length: number): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}
