import { Page, expect } from '@playwright/test';
import * as crypto from 'crypto';

/**
 * E2E 测试辅助函数
 *
 * 提供通用的测试辅助功能,包括:
 * - OAuth 认证流程 (直接API调用版本 - 更可靠)
 * - Token 管理
 * - PKCE 参数生成
 * - JWT 解析
 */

// Pingora 代理地址（6188）路由所有流量：
// - /api/v2/* → OAuth Service (3001)
// - 其他请求 → Admin Portal (3000) [生产模式的Next.js默认端口]
const baseUrl = process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:6188';
const defaultUsername = process.env.TEST_ADMIN_USERNAME || 'admin';
const defaultPassword = process.env.TEST_ADMIN_PASSWORD || 'admin123';

/**
 * 完成OAuth登录 - 真实OAuth流程版本
 * 通过实际的OAuth 2.1授权码流程登录：
 * 1. 访问受保护资源 → 触发重定向到登录
 * 2. 在登录页面填写凭证 → 提交表单
 * 3. OAuth授权流程 → 获取授权码 → 交换token
 * 4. (可选)处理权限同意页面
 * 5. 重定向回受保护资源
 *
 * 此方法确保：
 * - 所有API调用都通过Admin Portal代理
 * - 获得有效的session_token cookie
 * - 测试真实的用户OAuth流程
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
    console.log(`[Auth] 开始真实OAuth登录流程，用户: ${username}，目标资源: ${protectedResource}`);

    try {
        // 步骤 1: 访问受保护资源，触发OAuth重定向
        console.log(`[Auth] 步骤1: 访问受保护资源 ${baseUrl}${protectedResource}`);
        await page.goto(`${baseUrl}${protectedResource}`, {
            waitUntil: 'domcontentloaded',
            timeout: 10000
        });

        // 步骤 2: 应该被重定向到登录页面
        console.log('[Auth] 步骤2: 等待重定向到登录页面...');
        await page.waitForURL(/\/login/, { timeout: 8000 });
        const loginPageUrl = page.url();
        console.log(`[Auth] 已重定向到登录页面: ${loginPageUrl}`);

        // 步骤 3: 等待登录表单加载
        console.log('[Auth] 步骤3: 等待登录表单加载...');
        await page.waitForSelector('form', { timeout: 5000 });

        // 步骤 4: 填写登录凭证
        console.log(`[Auth] 步骤4: 填写登录凭证 (用户: ${username})`);

        // 等待用户名输入框可见
        const usernameInput = page.getByTestId('username-input');
        await usernameInput.waitFor({ state: 'visible', timeout: 5000 });
        await usernameInput.fill(username);

        // 等待密码输入框可见
        const passwordInput = page.getByTestId('password-input');
        await passwordInput.waitFor({ state: 'visible', timeout: 5000 });
        await passwordInput.fill(password);

        // 步骤 5: 点击登录按钮
        console.log('[Auth] 步骤5: 点击登录按钮');
        const loginButton = page.getByTestId('login-button');
        await loginButton.click();

        // 步骤 6: 等待OAuth流程完成
        // 可能的流程路径：
        // - 直接重定向回受保护资源 (无权限同意)
        // - 重定向到权限同意页面 (需要用户批准)
        console.log('[Auth] 步骤6: 等待OAuth流程完成...');
        await page.waitForURL((url) => {
            const pathname = url.pathname;
            return pathname === protectedResource || pathname === '/oauth/consent';
        }, { timeout: 15000 });

        const currentUrl = page.url();
        console.log(`[Auth] 当前URL: ${currentUrl}`);

        // 步骤 7: 如果重定向到权限同意页面，需要批准
        if (page.url().includes('/oauth/consent')) {
            console.log('[Auth] 步骤7: 处理权限同意页面...');

            // 等待同意页面加载
            await page.waitForSelector('button', { timeout: 5000 });

            // 查找并点击"允许"或"Allow"按钮
            const allowButton = page.getByRole('button', { name: /允许|Allow|同意|Agree/i });
            const isVisible = await allowButton.isVisible({ timeout: 2000 }).catch(() => false);

            if (isVisible) {
                console.log('[Auth] 点击允许按钮');
                await allowButton.click();

                // 等待重定向回受保护资源
                console.log('[Auth] 等待重定向回受保护资源...');
                await page.waitForURL(new RegExp(protectedResource.replace(/\//g, '\\/')), {
                    timeout: 10000
                });
            }
        }

        // 步骤 8: 验证登录成功
        console.log('[Auth] 步骤8: 验证登录成功...');
        const token = await page.evaluate(() =>
            localStorage.getItem('access_token')
        );

        if (!token) {
            throw new Error('登录成功但localStorage中未找到access_token');
        }

        console.log('[Auth] OAuth登录流程完成，获得access_token');
        return token;

    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error('[Auth] OAuth登录失败:', errorMsg);
        console.error('[Auth] 当前页面URL:', page.url());
        throw error;
    }
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
 * 撤销 token (通过Admin Portal代理调用)
 *
 * @param page - Playwright Page 对象
 * @param token - 要撤销的 token
 * @param tokenTypeHint - token 类型提示 ('access_token' | 'refresh_token')
 */
export async function revokeToken(
    page: Page,
    token: string,
    tokenTypeHint: 'access_token' | 'refresh_token' = 'access_token'
): Promise<void> {
    await page.evaluate(async (params: any) => {
        // 使用相对路径通过Admin Portal代理
        const response = await fetch(params.baseUrl + '/api/v2/oauth/revoke', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                token: params.token,
                token_type_hint: params.tokenTypeHint
            }),
            credentials: 'include'
        });

        if (!response.ok) {
            throw new Error(`Token revoke failed with status ${response.status}`);
        }
    }, { baseUrl, token, tokenTypeHint });
}

/**
 * 清除认证状态
 *
 * @param page - Playwright Page 对象
 */
export async function clearAuthState(page: Page): Promise<void> {
    // 清除 storage
    await page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
    }).catch(() => {
        // 如果页面已销毁，忽略错误
    });
}

/**
 * 生成PKCE参数 (Code Challenge and Code Verifier)
 *
 * @returns Object { codeChallenge, codeVerifier }
 */
export function generatePKCEPair(): { codeChallenge: string; codeVerifier: string } {
    const codeVerifier = base64UrlEncode(
        crypto.randomBytes(32)
    );

    const codeChallenge = base64UrlEncode(
        crypto
            .createHash('sha256')
            .update(codeVerifier)
            .digest()
    );

    return { codeChallenge, codeVerifier };
}

/**
 * Base64 URL编码
 *
 * @param buffer - 要编码的缓冲区
 * @returns string - Base64 URL编码字符串
 */
function base64UrlEncode(buffer: Buffer): string {
    return buffer
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}

/**
 * 解析JWT token的payload部分
 *
 * @param token - JWT token
 * @returns Object - Decoded payload
 */
export function parseJWT(token: string): Record<string, any> {
    const parts = token.split('.');
    if (parts.length !== 3) {
        throw new Error('Invalid JWT token');
    }

    const payload = Buffer.from(parts[1], 'base64').toString('utf-8');
    return JSON.parse(payload);
}

/**
 * 验证JWT token的有效性
 *
 * @param token - JWT token
 * @returns boolean - 是否有效
 */
export function isValidJWT(token: string): boolean {
    try {
        const payload = parseJWT(token);
        const now = Math.floor(Date.now() / 1000);
        return payload.exp > now;
    } catch {
        return false;
    }
}

/**
 * 等待元素可见
 *
 * @param page - Playwright Page 对象
 * @param selector - 元素选择器
 * @param timeout - 超时时间(毫秒)
 */
export async function waitForElement(
    page: Page,
    selector: string,
    timeout: number = 5000
): Promise<void> {
    await page.waitForSelector(selector, { timeout });
}

/**
 * 获取页面中的所有请求URL
 *
 * @param page - Playwright Page 对象
 * @returns string[] - 请求URL列表
 */
export async function captureRequests(page: Page): Promise<string[]> {
    const requests: string[] = [];

    page.on('request', (request) => {
        requests.push(request.url());
    });

    return requests;
}

/**
 * 监听页面错误
 *
 * @param page - Playwright Page 对象
 * @returns string[] - 错误消息列表
 */
export async function captureErrors(page: Page): Promise<string[]> {
    const errors: string[] = [];

    page.on('pageerror', (error) => {
        errors.push(error.message);
    });

    return errors;
}

/**
 * 从JWT Token中提取声明信息 Claims
 * 解析JWT的payload部分并返回声明对象
 *
 * @param token - JWT token 字符串
 * @returns Record<string, any> - Token的声明对象 (sub, client_id, scope, exp等)
 * @throws Error - 如果Token无效或解析失败
 */
export async function extractJWTClaims(token: string): Promise<Record<string, any>> {
    try {
        return parseJWT(token);
    } catch (error) {
        throw new Error(`Failed to extract JWT claims: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * 等待并捕获Token刷新事件 Token Refresh
 * 监听localStorage变化，当新的access_token被设置时返回
 *
 * @param page - Playwright Page 对象
 * @param timeout - 最大等待时间(毫秒，默认15000)
 * @returns Promise<string> - 新的access_token
 * @throws Error - 如果超时或Token未被刷新
 */
export async function waitForTokenRefresh(page: Page, timeout: number = 15000): Promise<string> {
    return new Promise(async (resolve, reject) => {
        const startTime = Date.now();
        const checkInterval = 500; // 每500ms检查一次

        // 初始token值
        const initialToken = await page.evaluate(() => {
            return localStorage.getItem('access_token') || '';
        });

        const checkToken = async () => {
            try {
                const currentToken = await page.evaluate(() => {
                    return localStorage.getItem('access_token') || '';
                });

                // 如果token发生变化，说明刷新成功
                if (currentToken && currentToken !== initialToken) {
                    console.log('[TokenRefresh] New access token detected');
                    resolve(currentToken);
                    return;
                }

                // 检查是否超时
                if (Date.now() - startTime > timeout) {
                    reject(new Error(`Token refresh timeout after ${timeout}ms`));
                    return;
                }

                // 继续监听
                setTimeout(checkToken, checkInterval);
            } catch (error) {
                reject(error);
            }
        };

        // 启动检查
        checkToken();
    });
}

/**
 * 过期当前Access Token
 * 通过调用OAuth Service的token endpoint获取新token，
 * 然后修改localStorage中的过期时间来模拟Token过期
 *
 * @param page - Playwright Page 对象
 * @throws Error - 如果操作失败
 */
export async function expireAccessToken(page: Page): Promise<void> {
    try {
        await page.evaluate(() => {
            // 获取当前token
            const token = localStorage.getItem('access_token');
            if (!token) {
                throw new Error('No access token found');
            }

            // 解析JWT payload
            const parts = token.split('.');
            if (parts.length !== 3) {
                throw new Error('Invalid JWT token format');
            }

            // 解码payload
            const payload = JSON.parse(
                Buffer.from(parts[1], 'base64').toString('utf-8')
            );

            // 将exp设置为过去的时间（当前时间减去1小时）
            const expiredPayload = {
                ...payload,
                exp: Math.floor(Date.now() / 1000) - 3600 // 1小时前
            };

            // 重新编码payload（注：这在真实场景中会导致签名无效，但对测试来说足够了）
            const encodedPayload = Buffer.from(JSON.stringify(expiredPayload)).toString('base64')
                .replace(/\+/g, '-')
                .replace(/\//g, '_')
                .replace(/=/g, '');

            // 更新localStorage中的token（模拟过期）
            const expiredToken = `${parts[0]}.${encodedPayload}.${parts[2]}`;
            localStorage.setItem('access_token', expiredToken);

            console.log('[ExpireToken] Token marked as expired');
        });
    } catch (error) {
        throw new Error(`Failed to expire access token: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * 获取授权码 Authorization Code
 * 通过模拟用户授权流程来获取一个有效的授权码
 *
 * @param page - Playwright Page 对象
 * @param pkce - PKCE参数对象 { codeChallenge, codeVerifier }
 * @param username - 用户名(可选)
 * @param password - 密码(可选)
 * @param nonce - OIDC nonce参数(可选)
 * @returns Promise<string> - 授权码
 * @throws Error - 如果获取授权码失败
 */
export async function getAuthorizationCode(
    page: Page,
    pkce: { codeChallenge: string; codeVerifier: string },
    username?: string,
    password?: string,
    nonce?: string
): Promise<string> {
    try {
        // Pingora 代理地址（6188）路由所有流量：
        // - /api/v2/* → OAuth Service (3001)
        // - 其他请求 → Admin Portal (3002)
        const baseUrl = process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:6188';
        // ✅ 使用Pingora代理的基础URL替代直接调用OAuth Service
        // 所有请求都通过Pingora正确路由

        // 生成state参数(CSRF保护)
        const state = base64UrlEncode(crypto.randomBytes(32));

        // 步骤1: 构建授权请求URL (通过Admin Portal)
        const authorizeUrl = new URL(`${baseUrl}/api/v2/oauth/authorize`);
        authorizeUrl.searchParams.set('client_id', 'admin-portal-client');
        authorizeUrl.searchParams.set('response_type', 'code');
        authorizeUrl.searchParams.set('redirect_uri', `${baseUrl}/auth/callback`);
        authorizeUrl.searchParams.set('code_challenge', pkce.codeChallenge);
        authorizeUrl.searchParams.set('code_challenge_method', 'S256');
        authorizeUrl.searchParams.set('state', state);
        authorizeUrl.searchParams.set('scope', 'openid profile email');

        if (nonce) {
            authorizeUrl.searchParams.set('nonce', nonce);
        }

        // 步骤2: 导航到授权页面
        console.log('[AuthCode] Navigating to authorization endpoint');
        await page.goto(authorizeUrl.toString(), {
            waitUntil: 'domcontentloaded',
            timeout: 10000
        });

        // 步骤3: 如果需要登录，执行登录操作
        const currentUrl = page.url();
        if (currentUrl.includes('/login')) {
            console.log('[AuthCode] Need to login, submitting credentials');

            const user = username || process.env.TEST_ADMIN_USERNAME || 'admin';
            const pass = password || process.env.TEST_ADMIN_PASSWORD || 'admin123';

            // 等待登录表单
            await page.waitForSelector('input[type="text"], input[name*="user"], [data-testid*="username"]', {
                timeout: 5000
            }).catch(() => { });

            // 尝试填充用户名
            try {
                await page.fill('input[type="text"]', user);
            } catch {
                try {
                    await page.fill('input[name*="user"]', user);
                } catch {
                    await page.fill('[data-testid*="username"]', user);
                }
            }

            // 尝试填充密码
            try {
                await page.fill('input[type="password"]', pass);
            } catch {
                await page.fill('input[name*="pass"]', pass);
            }

            // 提交表单
            const submitButton = page.locator('button[type="submit"]').first();
            await submitButton.click();

            // 等待登录完成
            await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => { });
        }

        // 步骤4: 如果显示同意页面，点击允许
        const consentUrlStr = page.url();
        if (consentUrlStr.includes('/consent') || consentUrlStr.includes('authorize')) {
            console.log('[AuthCode] Checking for consent page');

            // 尝试找到并点击"允许"按钮
            try {
                const allowButton = page.locator('button')
                    .filter({ hasText: /允许|Allow|Approve|同意/i })
                    .first();
                await allowButton.click({ timeout: 5000 });
                await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => { });
            } catch {
                console.log('[AuthCode] No explicit consent button found, continuing...');
            }
        }

        // 步骤5: 从重定向URL中提取授权码
        await page.waitForURL((url: URL) => url.href.includes('/auth/callback') || url.href.includes('code='), {
            timeout: 10000
        }).catch(() => { });

        const finalUrl = new URL(page.url());
        const code = finalUrl.searchParams.get('code');

        if (!code) {
            throw new Error('No authorization code found in callback URL');
        }

        console.log('[AuthCode] Authorization code obtained successfully');
        return code;
    } catch (error) {
        throw new Error(`Failed to get authorization code: ${error instanceof Error ? error.message : String(error)}`);
    }
}
