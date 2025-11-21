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

const baseUrl = process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:6188';
const defaultUsername = process.env.TEST_ADMIN_USERNAME || 'admin';
const defaultPassword = process.env.TEST_ADMIN_PASSWORD || 'admin123';

/**
 * 完成完整的 OAuth 登录流程
 *
 * @param page - Playwright Page 对象
 * @param username - 用户名 (默认: admin)
 * @param password - 密码 (默认: admin123)
 * @returns Promise<string> - 返回 access_token
 */
export async function completeOAuthLogin(
    page: Page,
    username: string = defaultUsername,
    password: string = defaultPassword
): Promise<string> {
    // 1. 访问受保护的路由,触发 OAuth 流程
    await page.goto(`${baseUrl}/admin`);
    await page.waitForURL(/.*/, { timeout: 5000 });

    // 2. 如果重定向到登录页,完成登录
    if (page.url().includes('/login')) {
        await page.getByTestId('username-input').fill(username);
        await page.getByTestId('password-input').fill(password);

        // 等待登录 API 响应
        const loginResponsePromise = page.waitForResponse(
            (response) => response.url().includes('/api/v2/auth/login') && response.request().method() === 'POST',
            { timeout: 10000 }
        );

        await page.getByTestId('login-button').click();

        // 等待登录响应
        const loginResponse = await loginResponsePromise;
        expect(loginResponse.status()).toBe(200);

        // 等待 OAuth 回调完成
        await page.waitForURL(/.*/, { timeout: 10000 });
    }

    // 3. 处理同意页面 (如果需要)
    if (page.url().includes('/oauth/consent')) {
        const approveButton =
            page.getByTestId('consent-approve-button') ||
            page.getByRole('button', { name: /allow|approve|授权|允许/i });

        if (await approveButton.isVisible()) {
            await approveButton.click();
            await page.waitForURL(/.*/, { timeout: 5000 });
        }
    }

    // 4. 等待重定向到受保护路由
    await page.waitForURL(/.*\/admin.*/, { timeout: 10000 });

    // 5. 从存储中获取 access_token
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
        await page.getByTestId('username-input').fill(username);
        await page.getByTestId('password-input').fill(password);

        await page.getByTestId('login-button').click();

        // 等待登录完成
        await page.waitForResponse(
            (response) => response.url().includes('/api/v2/auth/login') && response.request().method() === 'POST',
            { timeout: 10000 }
        );
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
