import { Page, expect } from '@playwright/test';
import crypto from 'crypto';

/**
 * E2E 测试辅助函数
 *
 * 提供通用的测试辅助功能,包括:
 * - OAuth 认证流程 (直接API调用版本 - 更可靠)
 * - Token 管理
 * - PKCE 参数生成
 * - JWT 解析
 */

const baseUrl = process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:3002';
const apiBaseUrl = process.env.TEST_API_BASE_URL || 'http://localhost:3001'; // OAuth Service API
const defaultUsername = process.env.TEST_ADMIN_USERNAME || 'admin';
const defaultPassword = process.env.TEST_ADMIN_PASSWORD || 'admin123';

/**
 * 完成OAuth登录 - 简化版本
 * 直接调用登录API而不是通过UI，以提高可靠性和速度
 * 包含重试逻辑处理API速率限制
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
    console.log(`[Auth] 开始OAuth登录流程，用户: ${username}`);

    // 在登录前等待一个小的随机时间以避免率限制
    const delay = Math.random() * 300 + 100; // 100-400ms 随机延迟
    await new Promise(resolve => setTimeout(resolve, delay));

    try {
        // 步骤 1: 直接调用登录API (包含重试逻辑)
        console.log(`[Auth] 调用登录API: ${apiBaseUrl}/api/v2/auth/login`);

        let loginResponse: Response;
        let retries = 0;
        const maxRetries = 3;

        while (retries < maxRetries) {
            loginResponse = await fetch(`${apiBaseUrl}/api/v2/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username,
                    password,
                    redirect: protectedResource
                })
            });

            // 如果是速率限制错误，等待后重试
            if (loginResponse.status === 429) {
                retries++;
                if (retries < maxRetries) {
                    const retryDelay = Math.pow(2, retries) * 2000; // 指数退避: 2s, 4s, 8s
                    console.log(`[Auth] 遇到速率限制 (429)，${retryDelay}ms 后重试 (${retries}/${maxRetries})`);
                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                    continue;
                }
            }

            break;
        }

        if (!loginResponse!.ok) {
            const errorText = await loginResponse!.text();
            throw new Error(`登录API失败 ${loginResponse!.status}: ${errorText.substring(0, 200)}`);
        }

        const loginData = await loginResponse!.json();
        console.log('[Auth] 登录API响应成功', {
            hasAccessToken: !!loginData.access_token,
            hasRefreshToken: !!loginData.refresh_token,
            hasRedirectUrl: !!loginData.redirect_url
        });

        // 步骤 2: 导航到基础URL以初始化页面上下文
        console.log('[Auth] 导航到应用程序以初始化上下文...');
        try {
            await page.goto(baseUrl, {
                waitUntil: 'domcontentloaded',
                timeout: 10000
            });
        } catch (err) {
            console.log('[Auth] 导航错误(继续):', (err as Error).message);
        }

        // 短暂延迟确保页面上下文稳定
        await new Promise(resolve => setTimeout(resolve, 500));

        // 步骤 3: 在localStorage中设置tokens
        console.log('[Auth] 在localStorage中设置tokens...');
        let setTokensResult;
        try {
            setTokensResult = await page.evaluate((data: any) => {
                if (data.access_token) {
                    localStorage.setItem('access_token', data.access_token);
                }
                if (data.refresh_token) {
                    localStorage.setItem('refresh_token', data.refresh_token);
                }
                if (data.user) {
                    localStorage.setItem('user', JSON.stringify(data.user));
                }
                return {
                    success: true,
                    hasAccessToken: !!localStorage.getItem('access_token'),
                    hasRefreshToken: !!localStorage.getItem('refresh_token')
                };
            }, loginData);
        } catch (e) {
            console.error('[Auth] localStorage设置异常:', e);
            setTokensResult = { success: false, error: String(e) };
        }

        console.log('[Auth] Token设置结果:', setTokensResult);

        if (!setTokensResult || !setTokensResult.success) {
            throw new Error(`无法在localStorage中设置tokens: ${setTokensResult?.error || 'unknown error'}`);
        }

        // 步骤 4: 导航到受保护路由
        console.log(`[Auth] 导航到受保护路由: ${protectedResource}`);
        await page.goto(`${baseUrl}${protectedResource}`, {
            waitUntil: 'load',
            timeout: 15000
        });

        const finalUrl = page.url();
        console.log(`[Auth] 最终URL: ${finalUrl}`);

        console.log('[Auth] OAuth登录成功');
        return loginData.access_token;

    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error('[Auth] OAuth登录失败:', errorMsg);
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
 * 撤销 token (调用 OAuth Service 的 revoke 端点)
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
        const response = await fetch(params.apiUrl + '/api/v2/oauth/revoke', {
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
    }, { apiUrl: apiBaseUrl, token, tokenTypeHint });
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
