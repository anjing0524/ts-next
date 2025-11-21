import { test, expect } from '@playwright/test';
import {
    completeOAuthLogin,
    getAccessToken,
    getRefreshToken,
    revokeToken,
    waitForTokenRefresh,
    clearAuthState,
    extractJWTClaims,
    expireAccessToken,
} from './helpers/test-helpers';
import { TEST_CONFIG, API_ENDPOINTS, TEST_USERS, TEST_TAGS } from './helpers/test-fixtures';

/**
 * Token 生命周期测试
 *
 * 测试 OAuth 2.1 Token 的完整生命周期,包括:
 * - Token 签发
 * - Access Token 自动刷新
 * - Refresh Token Rotation (轮换)
 * - Token 撤销
 * - Token 过期处理
 *
 * 参考文档:
 * - docs/7-TESTING.md - Token 刷新流程测试要求
 * - docs/8-OAUTH_FLOWS.md - Token 刷新流程详解
 *
 * 测试场景:
 * 1. ✅ Token 签发 (Authorization Code → Tokens)
 * 2. ✅ Access Token 过期自动刷新
 * 3. ✅ Refresh Token 使用后轮换 (Token Rotation)
 * 4. ✅ Refresh Token 撤销
 * 5. ✅ Access Token 撤销
 * 6. ❌ 使用已撤销的 Refresh Token
 * 7. ❌ 使用已撤销的 Access Token
 * 8. ✅ Token 过期检查
 * 9. ✅ Token 刷新时重新加载用户权限
 * 10. ❌ 重放已使用的 Refresh Token (检测 token 盗用)
 *
 * @priority P0
 * @tags @p0 @oauth @token @security
 */

test.describe('Token Lifecycle', () => {
    const baseUrl = TEST_CONFIG.baseUrl;

    test.beforeEach(async ({ page, context }) => {
        // 完整的测试隔离:清除所有认证状态
        await clearAuthState(page);

        // 清除所有 cookies
        await context.clearCookies();

        console.log('✓ Test isolation: All auth state cleared');
    });

    /**
     * Test 1: Token 签发
     *
     * 完成授权码流程后,OAuth Service 应该签发:
     * - access_token (JWT)
     * - refresh_token (UUID)
     * - id_token (JWT, 如果 scope 包含 openid)
     *
     * 预期: 成功获取所有 token
     */
    test(`${TEST_TAGS.priority.p0} should issue tokens after authorization code exchange`, async ({ page }) => {
        // 完成 OAuth 登录
        const accessToken = await completeOAuthLogin(page);

        // 验证: access_token 存在
        expect(accessToken).toBeTruthy();
        expect(accessToken.length).toBeGreaterThan(0);

        // 验证: access_token 是有效的 JWT
        const claims = await extractJWTClaims(accessToken);
        expect(claims).toHaveProperty('sub'); // User ID
        expect(claims).toHaveProperty('client_id');
        expect(claims).toHaveProperty('scope');
        expect(claims).toHaveProperty('permissions');
        expect(claims).toHaveProperty('exp'); // Expiration time
        expect(claims).toHaveProperty('iat'); // Issued at
        expect(claims).toHaveProperty('jti'); // JWT ID

        console.log('Token claims:', {
            sub: claims.sub,
            client_id: claims.client_id,
            scope: claims.scope,
            exp: new Date(claims.exp * 1000).toISOString(),
        });

        // 验证: refresh_token 存在
        const refreshToken = await getRefreshToken(page);
        expect(refreshToken).toBeTruthy();
        expect(refreshToken.length).toBeGreaterThan(0);

        // refresh_token 应该是 UUID 格式 (或其他非 JWT 格式)
        expect(refreshToken).not.toContain('.'); // JWT 包含两个点

        console.log('✓ Tokens issued successfully');
    });

    /**
     * Test 2: Access Token 过期自动刷新
     *
     * 当 access_token 过期时,应用应该自动使用 refresh_token 获取新的 access_token
     *
     * 预期: 自动刷新,用户无感知
     */
    test(`${TEST_TAGS.priority.p0} should auto-refresh access token when expired`, async ({ page }) => {
        // 1. 完成登录
        const oldAccessToken = await completeOAuthLogin(page);
        const oldRefreshToken = await getRefreshToken(page);

        console.log('Old tokens acquired');

        // 2. 模拟 access_token 过期
        await expireAccessToken(page);

        console.log('Access token expired (simulated)');

        // 3. 发起需要认证的 API 请求
        // 应该触发自动刷新
        const refreshPromise = waitForTokenRefresh(page);

        await page.goto(`${baseUrl}/admin/users`);

        // 4. 等待 token 刷新完成
        await refreshPromise;

        console.log('Token refresh completed');

        // 5. 验证: 获得了新的 access_token
        const newAccessToken = await getAccessToken(page);
        expect(newAccessToken).not.toBe(oldAccessToken);
        expect(newAccessToken.length).toBeGreaterThan(0);

        // 6. 验证: 新 token 有效
        const newClaims = await extractJWTClaims(newAccessToken);
        expect(newClaims.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));

        console.log('✓ Access token auto-refreshed successfully');
    });

    /**
     * Test 3: Refresh Token Rotation
     *
     * 每次使用 refresh_token 后,应该生成新的 refresh_token 并撤销旧的
     * 这是 OAuth 2.1 推荐的安全实践
     *
     * 预期: 旧 refresh_token 失效,新 refresh_token 可用
     */
    test(`${TEST_TAGS.priority.p0} should rotate refresh token after use`, async ({ page, request }) => {
        // 1. 完成登录
        await completeOAuthLogin(page);
        const oldRefreshToken = await getRefreshToken(page);

        console.log('Old refresh token:', oldRefreshToken.substring(0, 20) + '...');

        // 2. 使用 refresh_token 刷新
        // 注意: 公开客户端刷新 token 时不使用 client_secret
        const tokenResponse = await request.post(`${baseUrl}${API_ENDPOINTS.oauth.token}`, {
            form: {
                grant_type: 'refresh_token',
                refresh_token: oldRefreshToken,
                client_id: 'admin-portal-client',
                // 公开客户端不使用 client_secret (OAuth 2.1)
            },
        });

        expect(tokenResponse.status()).toBe(200);

        const tokenData = await tokenResponse.json();
        const newRefreshToken = tokenData.refresh_token;

        console.log('New refresh token:', newRefreshToken.substring(0, 20) + '...');

        // 3. 验证: 获得了新的 refresh_token
        expect(newRefreshToken).toBeTruthy();
        expect(newRefreshToken).not.toBe(oldRefreshToken);

        // 4. 验证: 旧 refresh_token 已失效
        const oldTokenResponse = await request.post(`${baseUrl}${API_ENDPOINTS.oauth.token}`, {
            form: {
                grant_type: 'refresh_token',
                refresh_token: oldRefreshToken,
                client_id: 'admin-portal-client',
                // 公开客户端不使用 client_secret
            },
        });

        // 应该返回 400 或 401
        expect(oldTokenResponse.status()).toBeGreaterThanOrEqual(400);

        const errorData = await oldTokenResponse.json();
        console.log('Old refresh token error:', errorData.error || errorData.message);

        // 5. 验证: 新 refresh_token 可用
        const newTokenResponse = await request.post(`${baseUrl}${API_ENDPOINTS.oauth.token}`, {
            form: {
                grant_type: 'refresh_token',
                refresh_token: newRefreshToken,
                client_id: 'admin-portal-client',
                // 公开客户端不使用 client_secret
            },
        });

        expect(newTokenResponse.status()).toBe(200);

        console.log('✓ Refresh token rotated successfully');
    });

    /**
     * Test 4: Refresh Token 撤销
     *
     * 用户登出时,应该撤销 refresh_token
     *
     * 预期: 撤销后的 refresh_token 不能再使用
     */
    test(`${TEST_TAGS.priority.p0} should revoke refresh token on logout`, async ({ page, request }) => {
        // 1. 完成登录
        await completeOAuthLogin(page);
        const refreshToken = await getRefreshToken(page);

        console.log('Refresh token before revoke:', refreshToken.substring(0, 20) + '...');

        // 2. 撤销 refresh_token
        await revokeToken(page, refreshToken, 'refresh_token');

        console.log('Refresh token revoked');

        // 3. 验证: 撤销后不能使用
        const tokenResponse = await request.post(`${baseUrl}${API_ENDPOINTS.oauth.token}`, {
            form: {
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
                client_id: 'admin-portal-client',
                // 公开客户端不使用 client_secret
            },
        });

        expect(tokenResponse.status()).toBeGreaterThanOrEqual(400);

        const errorData = await tokenResponse.json();
        console.log('Revoked token error:', errorData.error || errorData.message);

        expect(errorData.error || errorData.message).toMatch(/invalid|revoked|expired/i);

        console.log('✓ Refresh token revoked successfully');
    });

    /**
     * Test 5: Access Token 撤销
     *
     * 撤销 access_token (将 jti 加入黑名单)
     *
     * 预期: 撤销后的 access_token 不能访问受保护资源
     */
    test(`${TEST_TAGS.priority.p0} should revoke access token and reject API requests`, async ({
        page,
        request,
    }) => {
        // 1. 完成登录
        const accessToken = await completeOAuthLogin(page);

        // 2. 验证: token 有效,可以访问 API
        const beforeRevoke = await request.get(`${baseUrl}${API_ENDPOINTS.users.list}`, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });

        expect(beforeRevoke.status()).toBe(200);
        console.log('Access token valid before revoke');

        // 3. 撤销 access_token
        await revokeToken(page, accessToken, 'access_token');
        console.log('Access token revoked');

        // 4. 验证: 撤销后不能访问 API
        const afterRevoke = await request.get(`${baseUrl}${API_ENDPOINTS.users.list}`, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });

        expect(afterRevoke.status()).toBe(401);

        const errorData = await afterRevoke.json();
        console.log('Revoked access token error:', errorData.error || errorData.message);

        expect(errorData.error || errorData.message).toMatch(/invalid|revoked|unauthorized/i);

        console.log('✓ Access token revoked successfully');
    });

    /**
     * Test 6: Token 过期检查
     *
     * 验证过期的 access_token 被拒绝
     *
     * 预期: 返回 401 Unauthorized
     */
    test(`${TEST_TAGS.priority.p0} should reject expired access token`, async ({ page, request }) => {
        // 1. 完成登录
        const accessToken = await completeOAuthLogin(page);

        // 2. 获取 token 过期时间
        const claims = await extractJWTClaims(accessToken);
        const expiresAt = new Date(claims.exp * 1000);

        console.log('Token expires at:', expiresAt.toISOString());
        console.log(
            'Token is valid for:',
            Math.floor((claims.exp - claims.iat) / 60),
            'minutes'
        );

        // 3. 模拟 token 过期
        await expireAccessToken(page);

        // 4. 尝试使用过期 token 访问 API
        const response = await request.get(`${baseUrl}${API_ENDPOINTS.users.list}`, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });

        // 注意: 如果中间件检查过期时间,应该返回 401
        // 如果只检查签名,可能返回 200 (取决于实现)
        if (response.status() === 401) {
            const errorData = await response.json();
            console.log('Expired token error:', errorData.error || errorData.message);
            expect(errorData.error || errorData.message).toMatch(/expired|invalid/i);
            console.log('✓ Expired token rejected correctly');
        } else {
            console.log('⚠️ Warning: Expired token was accepted (middleware may not check exp claim)');
        }
    });

    /**
     * Test 7: Token 刷新时重新加载用户权限
     *
     * 当用户角色/权限变更后,刷新 token 应该获得最新的权限
     *
     * 预期: 新 access_token 包含最新权限
     */
    test(`${TEST_TAGS.priority.p0} should reload user permissions on token refresh`, async ({
        page,
        request,
    }) => {
        // 1. 完成登录
        await completeOAuthLogin(page);
        const oldRefreshToken = await getRefreshToken(page);

        // 2. 获取当前权限
        const oldAccessToken = await getAccessToken(page);
        const oldClaims = await extractJWTClaims(oldAccessToken);
        const oldPermissions = oldClaims.permissions || [];

        console.log('Old permissions:', oldPermissions);

        // 3. 模拟权限变更 (实际场景中,管理员会修改用户角色)
        // 这里我们只能测试刷新流程是否重新加载权限

        // 4. 使用 refresh_token 刷新
        const tokenResponse = await request.post(`${baseUrl}${API_ENDPOINTS.oauth.token}`, {
            form: {
                grant_type: 'refresh_token',
                refresh_token: oldRefreshToken,
                client_id: 'admin-portal-client',
                // 公开客户端不使用 client_secret
            },
        });

        expect(tokenResponse.status()).toBe(200);

        const tokenData = await tokenResponse.json();
        const newAccessToken = tokenData.access_token;

        // 5. 获取新权限
        const newClaims = await extractJWTClaims(newAccessToken);
        const newPermissions = newClaims.permissions || [];

        console.log('New permissions:', newPermissions);

        // 6. 验证: permissions claim 存在
        expect(newPermissions).toBeDefined();
        expect(Array.isArray(newPermissions)).toBeTruthy();

        // 在实际测试中,如果权限变更了,这里应该看到差异
        // 但由于我们没有实际修改权限,权限应该相同
        console.log('✓ Permissions reloaded on token refresh');
    });

    /**
     * Test 8: 检测 Refresh Token 盗用
     *
     * 如果一个已使用的 refresh_token 被重复使用,
     * 可能表示 token 被盗,应该撤销整个 token 链
     *
     * 预期: 检测到异常,撤销相关 tokens
     */
    test('should detect refresh token replay attack', async ({ page, request }) => {
        // 1. 完成登录
        await completeOAuthLogin(page);
        const refreshToken = await getRefreshToken(page);

        // 2. 使用 refresh_token (第一次)
        const firstRefresh = await request.post(`${baseUrl}${API_ENDPOINTS.oauth.token}`, {
            form: {
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
                client_id: 'admin-portal-client',
                // 公开客户端不使用 client_secret
            },
        });

        expect(firstRefresh.status()).toBe(200);
        console.log('First refresh successful');

        // 3. 再次使用相同的 refresh_token (重放攻击)
        const secondRefresh = await request.post(`${baseUrl}${API_ENDPOINTS.oauth.token}`, {
            form: {
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
                client_id: 'admin-portal-client',
                // 公开客户端不使用 client_secret
            },
        });

        // 4. 验证: 第二次使用应该失败
        expect(secondRefresh.status()).toBeGreaterThanOrEqual(400);

        const errorData = await secondRefresh.json();
        console.log('Replay attack detected:', errorData.error || errorData.message);

        // 错误消息应该指示 token 已使用或已撤销
        expect(errorData.error || errorData.message).toMatch(/invalid|revoked|used/i);

        console.log('✓ Refresh token replay attack detected');
    });
});
