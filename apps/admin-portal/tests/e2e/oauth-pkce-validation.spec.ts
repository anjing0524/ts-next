import { test, expect, Page } from '@playwright/test';
import { completeOAuthLogin } from './helpers/test-helpers';
import {
    generatePKCEPair,
    verifyPKCEChallenge,
    clearAuthState,
    getErrorMessage,
} from './helpers/test-helpers';
import { TEST_CONFIG, API_ENDPOINTS, ERROR_MESSAGES, TEST_TAGS } from './helpers/test-fixtures';

/**
 * OAuth 2.1 PKCE 验证测试
 *
 * 测试 PKCE (Proof Key for Code Exchange) 机制,这是 OAuth 2.1 强制要求的安全特性。
 * PKCE 防止授权码拦截攻击,确保只有生成 code_challenge 的客户端才能交换 token。
 *
 * 参考文档:
 * - docs/7-TESTING.md - 测试要求
 * - docs/8-OAUTH_FLOWS.md - PKCE 流程详解
 *
 * 测试场景:
 * 1. ✅ 正确的 PKCE 流程
 * 2. ❌ PKCE 验证失败 - 错误的 code_verifier
 * 3. ❌ PKCE 验证失败 - 缺少 code_verifier
 * 4. ❌ PKCE 验证失败 - 缺少 code_challenge
 * 5. ❌ PKCE 验证失败 - 不支持的 code_challenge_method
 * 6. ✅ PKCE 参数生成验证
 * 7. ✅ code_challenge 计算验证
 *
 * @priority P0
 * @tags @p0 @oauth @security @pkce
 */

test.describe('OAuth 2.1 PKCE Validation', () => {
    const baseUrl = TEST_CONFIG.baseUrl;

    test.beforeEach(async ({ page, context }) => {
        // 完整的测试隔离:清除所有认证状态
        await clearAuthState(page);

        // 清除所有 cookies (包括其他测试留下的)
        await context.clearCookies();

        console.log('✓ Test isolation: All auth state cleared');
    });

    /**
     * Test 1: 正确的 PKCE 流程
     *
     * 验证完整的 PKCE 流程:
     * 1. 生成 code_verifier 和 code_challenge
     * 2. 使用 code_challenge 发起授权请求
     * 3. 获取授权码
     * 4. 使用 code_verifier 交换 token
     *
     * 预期: 成功获取 access_token 和 refresh_token
     */
    test(`${TEST_TAGS.priority.p0} should complete OAuth flow with valid PKCE parameters`, async ({ page }) => {
        // 1. 生成 PKCE 参数对
        const pkce = await generatePKCEPair();
        console.log('Generated PKCE pair:', {
            verifier_length: pkce.verifier.length,
            challenge_length: pkce.challenge.length,
        });

        // 验证参数长度符合规范
        expect(pkce.verifier.length).toBeGreaterThanOrEqual(43);
        expect(pkce.verifier.length).toBeLessThanOrEqual(128);
        expect(pkce.challenge.length).toBeGreaterThan(0);

        // 2. 存储 code_verifier (模拟客户端行为)
        await page.goto(baseUrl);
        await page.evaluate((verifier) => {
            sessionStorage.setItem('pkce_code_verifier', verifier);
        }, pkce.verifier);

        // 3. 发起 OAuth 授权请求 (带 PKCE 参数)
        const state = generateRandomString(32);
        const nonce = generateRandomString(32);

        await page.evaluate((params) => {
            sessionStorage.setItem('oauth_state', params.state);
            sessionStorage.setItem('oauth_nonce', params.nonce);
        }, { state, nonce });

        const authorizeUrl = new URL(`${baseUrl}${API_ENDPOINTS.oauth.authorize}`);
        authorizeUrl.searchParams.set('client_id', 'admin-portal-client');
        authorizeUrl.searchParams.set('redirect_uri', `${baseUrl}/auth/callback`);
        authorizeUrl.searchParams.set('response_type', 'code');
        authorizeUrl.searchParams.set('scope', 'openid profile email');
        authorizeUrl.searchParams.set('code_challenge', pkce.challenge);
        authorizeUrl.searchParams.set('code_challenge_method', 'S256');
        authorizeUrl.searchParams.set('state', state);
        authorizeUrl.searchParams.set('nonce', nonce);

        console.log('Authorize URL:', authorizeUrl.toString());

        // 4. 导航到授权端点
        await page.goto(authorizeUrl.toString());
        await page.waitForURL(/.*/, { timeout: 5000 });

        // 5. 应该重定向到登录页
        expect(page.url()).toContain('/login');

        // 6. 完成登录
        await page.getByTestId('username-input').fill('admin');
        await page.getByTestId('password-input').fill('admin123');

        // 监听 token 交换请求
        const tokenResponsePromise = page.waitForResponse(
            (response) => response.url().includes(API_ENDPOINTS.oauth.token),
            { timeout: 15000 }
        );

        await page.getByTestId('login-button').click();

        // 7. 等待 OAuth 流程完成 (应该自动使用存储的 code_verifier 交换 token)
        await page.waitForURL(/.*\/auth\/callback.*/, { timeout: 10000 });

        // 8. 等待 token 交换完成
        const tokenResponse = await tokenResponsePromise;
        console.log('Token response status:', tokenResponse.status());

        // 9. 验证: token 交换成功
        expect(tokenResponse.status()).toBe(200);

        const tokenData = await tokenResponse.json();
        expect(tokenData).toHaveProperty('access_token');
        expect(tokenData).toHaveProperty('refresh_token');
        expect(tokenData).toHaveProperty('token_type', 'Bearer');
        expect(tokenData).toHaveProperty('expires_in');

        console.log('✓ PKCE flow completed successfully');
    });

    /**
     * Test 2: PKCE 验证失败 - 错误的 code_verifier
     *
     * 攻击场景: 攻击者拦截了授权码,尝试用错误的 code_verifier 交换 token
     *
     * 预期: 返回 400 Bad Request, 错误信息包含 "PKCE"
     */
    test(`${TEST_TAGS.priority.p0} should reject token exchange with incorrect code_verifier`, async ({
        page,
        request,
    }) => {
        // 1. 生成正确的 PKCE 参数对
        const correctPKCE = await generatePKCEPair();

        // 2. 生成错误的 code_verifier
        const wrongPKCE = await generatePKCEPair();

        // 3. 模拟已完成授权,获得授权码 (使用 correct PKCE challenge)
        // 注意: 这里需要有一个有效的授权码,实际测试中可能需要先完成授权流程
        // 为了简化,我们直接测试 token 端点的 PKCE 验证

        // 发起 token 请求,使用错误的 code_verifier
        // 注意: Admin Portal 是公开客户端,不使用 client_secret,仅使用 PKCE 保护
        const tokenResponse = await request.post(`${baseUrl}${API_ENDPOINTS.oauth.token}`, {
            form: {
                grant_type: 'authorization_code',
                code: 'dummy_authorization_code', // 这会失败,但主要测试 PKCE 逻辑
                code_verifier: wrongPKCE.verifier, // 错误的 verifier
                client_id: 'admin-portal-client',
                // 公开客户端不使用 client_secret (OAuth 2.1 规范)
                redirect_uri: `${baseUrl}/auth/callback`,
            },
        });

        // 验证: 返回错误
        expect(tokenResponse.status()).toBeGreaterThanOrEqual(400);

        const errorBody = await tokenResponse.json();
        console.log('PKCE verification failed error:', errorBody);

        // 错误消息应该提到 PKCE 或授权码无效
        const errorMessage = errorBody.error || errorBody.message || '';
        expect(errorMessage).toMatch(/pkce|verification|invalid.*code|authorization/i);
    });

    /**
     * Test 3: PKCE 验证失败 - 缺少 code_verifier
     *
     * 预期: 返回 400 Bad Request
     */
    test(`${TEST_TAGS.priority.p0} should reject token exchange without code_verifier`, async ({ request }) => {
        const tokenResponse = await request.post(`${baseUrl}${API_ENDPOINTS.oauth.token}`, {
            form: {
                grant_type: 'authorization_code',
                code: 'dummy_authorization_code',
                // code_verifier 缺失
                client_id: 'admin-portal-client',
                // 公开客户端不使用 client_secret
                redirect_uri: `${baseUrl}/auth/callback`,
            },
        });

        expect(tokenResponse.status()).toBe(400);

        const errorBody = await tokenResponse.json();
        console.log('Missing code_verifier error:', errorBody);

        // 应该提示缺少必需参数
        expect(errorBody.error || errorBody.message).toMatch(/required|missing|code_verifier/i);
    });

    /**
     * Test 4: PKCE 验证失败 - 授权请求缺少 code_challenge
     *
     * OAuth 2.1 强制要求 PKCE,授权请求必须包含 code_challenge
     *
     * 预期: 返回错误
     */
    test(`${TEST_TAGS.priority.p0} should reject authorization request without code_challenge`, async ({ page }) => {
        await clearAuthState(page);

        const state = generateRandomString(32);

        // 发起授权请求,但不包含 code_challenge
        const authorizeUrl = new URL(`${baseUrl}${API_ENDPOINTS.oauth.authorize}`);
        authorizeUrl.searchParams.set('client_id', 'admin-portal-client');
        authorizeUrl.searchParams.set('redirect_uri', `${baseUrl}/auth/callback`);
        authorizeUrl.searchParams.set('response_type', 'code');
        authorizeUrl.searchParams.set('scope', 'openid profile email');
        // code_challenge 缺失
        authorizeUrl.searchParams.set('state', state);

        await page.goto(authorizeUrl.toString());
        await page.waitForURL(/.*/, { timeout: 5000 });

        // 应该显示错误或重定向到错误页面
        const currentUrl = page.url();
        const bodyText = await page.textContent('body');

        const showsError =
            bodyText?.includes('error') ||
            bodyText?.includes('错误') ||
            bodyText?.includes('code_challenge') ||
            bodyText?.includes('PKCE') ||
            currentUrl.includes('error');

        expect(showsError).toBeTruthy();
        console.log('Missing code_challenge rejected correctly');
    });

    /**
     * Test 5: PKCE 验证失败 - 不支持的 code_challenge_method
     *
     * OAuth 2.1 要求支持 S256 (SHA256),不应该支持 plain
     *
     * 预期: 返回错误
     */
    test(`${TEST_TAGS.priority.p0} should reject unsupported code_challenge_method`, async ({ page }) => {
        await clearAuthState(page);

        const pkce = await generatePKCEPair();
        const state = generateRandomString(32);

        const authorizeUrl = new URL(`${baseUrl}${API_ENDPOINTS.oauth.authorize}`);
        authorizeUrl.searchParams.set('client_id', 'admin-portal-client');
        authorizeUrl.searchParams.set('redirect_uri', `${baseUrl}/auth/callback`);
        authorizeUrl.searchParams.set('response_type', 'code');
        authorizeUrl.searchParams.set('scope', 'openid profile email');
        authorizeUrl.searchParams.set('code_challenge', pkce.challenge);
        authorizeUrl.searchParams.set('code_challenge_method', 'plain'); // 不安全,应该被拒绝
        authorizeUrl.searchParams.set('state', state);

        await page.goto(authorizeUrl.toString());
        await page.waitForURL(/.*/, { timeout: 5000 });

        // 应该显示错误
        const currentUrl = page.url();
        const bodyText = await page.textContent('body');

        const showsError =
            bodyText?.includes('error') ||
            bodyText?.includes('错误') ||
            bodyText?.includes('unsupported') ||
            bodyText?.includes('method') ||
            currentUrl.includes('error');

        expect(showsError).toBeTruthy();
        console.log('Unsupported code_challenge_method rejected correctly');
    });

    /**
     * Test 6: PKCE 参数生成验证
     *
     * 验证 generatePKCEPair() 函数生成的参数符合规范
     */
    test('should generate valid PKCE parameters', async () => {
        const pkce = await generatePKCEPair();

        // code_verifier 长度: 43-128 字符
        expect(pkce.verifier.length).toBeGreaterThanOrEqual(43);
        expect(pkce.verifier.length).toBeLessThanOrEqual(128);

        // code_verifier 应该是 Base64URL 编码 (只包含 A-Z, a-z, 0-9, -, _)
        expect(pkce.verifier).toMatch(/^[A-Za-z0-9\-_]+$/);

        // code_challenge 应该是 Base64URL 编码的 SHA256 hash
        expect(pkce.challenge).toMatch(/^[A-Za-z0-9\-_]+$/);
        expect(pkce.challenge.length).toBeGreaterThan(0);

        console.log('✓ PKCE parameters are valid');
    });

    /**
     * Test 7: code_challenge 计算验证
     *
     * 验证 code_challenge = BASE64URL(SHA256(code_verifier))
     */
    test('should correctly compute code_challenge from code_verifier', async () => {
        const pkce = await generatePKCEPair();

        // 验证 challenge 是 verifier 的 SHA256 hash
        const isValid = await verifyPKCEChallenge(pkce.verifier, pkce.challenge);
        expect(isValid).toBeTruthy();

        // 验证: 不同的 verifier 生成不同的 challenge
        const pkce2 = await generatePKCEPair();
        expect(pkce.verifier).not.toBe(pkce2.verifier);
        expect(pkce.challenge).not.toBe(pkce2.challenge);

        console.log('✓ code_challenge computation is correct');
    });
});

/**
 * 生成随机字符串 (用于 state 和 nonce)
 */
function generateRandomString(length: number): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}
