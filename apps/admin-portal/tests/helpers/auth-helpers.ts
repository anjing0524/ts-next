import { Page, expect } from '@playwright/test';
import { OAuthConfig } from '@repo/lib';

/**
 * 认证测试辅助函数
 * 提供OAuth2认证流程的通用测试方法
 */
export class AuthHelpers {
  /**
   * Logs in a user with specific credentials directly on the login form.
   * @param page - Playwright Page object.
   * @param username - The username to log in with.
   * @param password - The password to log in with.
   */
  static async loginAsUser(page: Page, username: string, password: string) {
    await page.goto('/login');
    
    // Wait for the main login button to be visible, which is more reliable
    const loginButton = page.locator('[data-testid="login-oauth-button"]');
    await expect(loginButton).toBeVisible({ timeout: 15000 });
    await loginButton.click();

    // The rest of the flow (consent page, etc.) remains the same.
    // This part needs to be adapted based on the actual flow of the oauth-service pages.
    // For now, we assume a direct redirect and callback.
    await page.waitForURL('**/auth/callback**', { timeout: 20000 });
    await page.waitForURL('**/admin', { timeout: 10000 });
    await this.expectLoggedIn(page);
  }

  /**
   * 登出用户
   * @param page - Playwright页面对象
   */
  static async logout(page: Page) {
    // 找到用户头像或菜单按钮
    const userMenu = page.locator('[data-testid="user-menu"], .user-avatar, .user-dropdown');

    if (await userMenu.isVisible()) {
      await userMenu.click();

      // 等待下拉菜单出现
      await page.waitForSelector('text=登出, text=Logout, text=Sign Out', { timeout: 5000 });
      await page.click('text=登出, text=Logout, text=Sign Out');
    } else {
      // 如果没有用户菜单，尝试直接访问登出接口
      await page.goto('/oauth/revoke');
    }

    // 等待重定向到登录页面
    await page.waitForURL('**/login');
    await this.expectLoggedOut(page);
  }

  /**
   * 验证用户已登录
   * @param page - Playwright页面对象
   */
  static async expectLoggedIn(page: Page) {
    // 检查是否存在用户头像、菜单或仪表板元素
    const loggedInIndicators = [
      '.user-avatar',
      '[data-testid="user-menu"]',
      'text=仪表板',
      'text=Dashboard',
      'text=管理中心',
      'text=Admin Center',
    ];

    let found = false;
    for (const selector of loggedInIndicators) {
      try {
        await expect(page.locator(selector)).toBeVisible({ timeout: 5000 });
        found = true;
        break;
      } catch {
        // 继续尝试下一个选择器
      }
    }

    if (!found) {
      throw new Error('无法确认用户已登录：未找到登录状态指示器');
    }
  }

  /**
   * 验证用户已登出
   * @param page - Playwright页面对象
   */
  static async expectLoggedOut(page: Page) {
    // 检查是否在登录页面或显示登录相关元素
    const loggedOutIndicators = [
      'text=Sign In with OAuth 2.0',
      'text=Admin Center Login',
      'text=登录',
      'button:has-text("Sign In")',
    ];

    let found = false;
    for (const selector of loggedOutIndicators) {
      try {
        await expect(page.locator(selector)).toBeVisible({ timeout: 5000 });
        found = true;
        break;
      } catch {
        // 继续尝试下一个选择器
      }
    }

    if (!found) {
      throw new Error('无法确认用户已登出：未找到登出状态指示器');
    }
  }

  /**
   * 等待页面加载完成
   * @param page - Playwright页面对象
   */
  static async waitForPageLoad(page: Page) {
    await page.waitForLoadState('networkidle');
    await page.waitForLoadState('domcontentloaded');
  }

  /**
   * 清理浏览器存储
   * @param page - Playwright页面对象
   */
  static async clearStorage(page: Page) {
    await page.evaluate(() => {
      try {
        // 安全地清理localStorage
        if (typeof localStorage !== 'undefined') {
          localStorage.clear();
        }
      } catch (error) {
        console.warn('Failed to clear localStorage:', error);
      }

      try {
        // 安全地清理sessionStorage
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.clear();
        }
      } catch (error) {
        console.warn('Failed to clear sessionStorage:', error);
      }

      try {
        // 清除所有cookies
        if (typeof document !== 'undefined' && document.cookie) {
          document.cookie.split(';').forEach((c) => {
            const eqPos = c.indexOf('=');
            const name = eqPos > -1 ? c.substr(0, eqPos) : c;
            document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
          });
        }
      } catch (error) {
        console.warn('Failed to clear cookies:', error);
      }
    });
  }

  /**
   * 设置测试环境的认证状态
   * @param page - Playwright页面对象
   * @param accessToken - 访问令牌
   * @param refreshToken - 刷新令牌
   */
  static async setAuthTokens(page: Page, accessToken: string, refreshToken?: string) {
    await page.evaluate(
      ({ accessToken, refreshToken }) => {
        // 设置Cookie形式的访问令牌
        document.cookie = `auth_token=${accessToken}; path=/; SameSite=Lax;`;

        // 设置sessionStorage中的刷新令牌
        if (refreshToken) {
          sessionStorage.setItem('refresh_token', refreshToken);
        }
      },
      { accessToken, refreshToken }
    );
  }

  /**
   * 获取当前页面的认证令牌
   * @param page - Playwright页面对象
   * @returns 认证令牌对象
   */
  static async getAuthTokens(
    page: Page
  ): Promise<{ accessToken: string | null; refreshToken: string | null }> {
    return await page.evaluate(() => {
      // 从Cookie获取访问令牌
      const cookies = document.cookie.split(';');
      let accessToken = null;
      for (const cookie of cookies) {
        const [name, value] = cookie.trim().split('=');
        if (name === 'auth_token') {
          accessToken = value;
          break;
        }
      }

      // 从sessionStorage获取刷新令牌
      const refreshToken = sessionStorage.getItem('refresh_token');

      return { accessToken: accessToken || null, refreshToken };
    });
  }

  /**
   * 模拟OAuth2授权码流程
   * @param page - Playwright页面对象
   * @param scopes - 请求的权限范围
   */
  static async simulateOAuthFlow(
    page: Page,
    scopes: string[] = ['openid', 'profile', 'admin:full_access']
  ) {
    const config = OAuthConfig.getClientConfig();

    // 构建授权URL
    const authUrl = new URL(OAuthConfig.getAuthorizeUrl());
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', config.clientId);
    authUrl.searchParams.set('redirect_uri', config.redirectUri);
    authUrl.searchParams.set('scope', scopes.join(' '));
    authUrl.searchParams.set('state', 'test-state');
    authUrl.searchParams.set('code_challenge', 'test-challenge');
    authUrl.searchParams.set('code_challenge_method', 'S256');

    // 访问授权URL
    await page.goto(authUrl.toString());
  }
}
