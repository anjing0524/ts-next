import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/login-page';
import { DashboardPage } from '../pages/dashboard-page';
import { TestUsers } from '../helpers/test-data';

/**
 * OAuth 2.1 集成测试套件
 * 验证admin-portal与oauth-service的完整集成
 */
test.describe('OAuth 2.1 Integration Tests', () => {
  let loginPage: LoginPage;
  let dashboardPage: DashboardPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    dashboardPage = new DashboardPage(page);
    await loginPage.goto();
  });

  test.describe('Username/Password Login Flow', () => {
    test('should login successfully with valid credentials', async ({ page }) => {
      await test.step('输入有效的管理员凭据', async () => {
        await loginPage.fillUsername(TestUsers.admin.username);
        await loginPage.fillPassword(TestUsers.admin.password);
      });

      await test.step('提交登录表单', async () => {
        await loginPage.clickLoginButton();
      });

      await test.step('验证成功登录并重定向到仪表盘', async () => {
        await expect(page).toHaveURL(/.*\/dashboard/);
        await expect(dashboardPage.welcomeMessage).toBeVisible();
        await expect(dashboardPage.welcomeMessage).toContainText(TestUsers.admin.displayName);
      });

      await test.step('验证用户会话已建立', async () => {
        await expect(dashboardPage.userMenu).toBeVisible();
        await expect(dashboardPage.logoutButton).toBeVisible();
      });
    });

    test('should handle invalid credentials gracefully', async ({ page }) => {
      await test.step('输入无效的用户名', async () => {
        await loginPage.fillUsername('invaliduser');
        await loginPage.fillPassword('wrongpassword');
      });

      await test.step('提交登录表单', async () => {
        await loginPage.clickLoginButton();
      });

      await test.step('验证错误提示显示', async () => {
        await expect(loginPage.errorMessage).toBeVisible();
        await expect(loginPage.errorMessage).toContainText('用户名或密码错误');
      });

      await test.step('验证保持在登录页面', async () => {
        await expect(page).toHaveURL(/.*\/login/);
      });
    });

    test('should validate required fields', async ({ page }) => {
      await test.step('尝试提交空表单', async () => {
        await loginPage.clickLoginButton();
      });

      await test.step('验证表单验证错误', async () => {
        await expect(loginPage.usernameValidation).toBeVisible();
        await expect(loginPage.passwordValidation).toBeVisible();
      });
    });

    test('should show loading state during login', async ({ page }) => {
      await test.step('输入有效凭据', async () => {
        await loginPage.fillUsername(TestUsers.admin.username);
        await loginPage.fillPassword(TestUsers.admin.password);
      });

      await test.step('验证加载状态显示', async () => {
        await loginPage.clickLoginButton();
        await expect(loginPage.loadingSpinner).toBeVisible();
      });
    });
  });

  test.describe('OAuth Button Flow', () => {
    test('should redirect to OAuth authorization page', async ({ page }) => {
      await test.step('点击OAuth登录按钮', async () => {
        await loginPage.clickOAuthButton();
      });

      await test.step('验证重定向到OAuth服务', async () => {
        await expect(page).toHaveURL(/.*localhost:3001\/api\/v2\/oauth\/authorize/);
        await expect(page.locator('h1')).toContainText('授权');
      });
    });

    test('should complete OAuth flow successfully', async ({ page }) => {
      await test.step('启动OAuth流程', async () => {
        await loginPage.clickOAuthButton();
      });

      await test.step('在OAuth服务上登录', async () => {
        await page.fill('input[name="username"]', TestUsers.admin.username);
        await page.fill('input[name="password"]', TestUsers.admin.password);
        await page.click('button[type="submit"]');
      });

      await test.step('同意授权（如果需要）', async () => {
        const consentButton = page.locator('button:has-text("同意")');
        if (await consentButton.isVisible()) {
          await consentButton.click();
        }
      });

      await test.step('验证重定向回admin-portal', async () => {
        await expect(page).toHaveURL(/.*localhost:3002\/auth\/callback/);
      });

      await test.step('验证成功登录', async () => {
        await expect(page).toHaveURL(/.*\/dashboard/);
        await expect(dashboardPage.welcomeMessage).toBeVisible();
      });
    });
  });

  test.describe('Token Exchange and Session Management', () => {
    test('should store tokens in sessionStorage', async ({ page }) => {
      await test.step('完成登录流程', async () => {
        await loginPage.login(TestUsers.admin);
      });

      await test.step('验证令牌已存储', async () => {
        const accessToken = await page.evaluate(() => sessionStorage.getItem('access_token'));
        const refreshToken = await page.evaluate(() => sessionStorage.getItem('refresh_token'));
        
        expect(accessToken).toBeTruthy();
        expect(refreshToken).toBeTruthy();
      });
    });

    test('should redirect to login when accessing protected routes unauthenticated', async ({ page }) => {
      await test.step('尝试直接访问受保护的路由', async () => {
        await page.goto('/dashboard');
      });

      await test.step('验证重定向到登录页面', async () => {
        await expect(page).toHaveURL(/.*\/login/);
      });
    });

    test('should maintain session after page refresh', async ({ page }) => {
      await test.step('完成登录', async () => {
        await loginPage.login(TestUsers.admin);
      });

      await test.step('刷新页面', async () => {
        await page.reload();
      });

      await test.step('验证会话仍然有效', async () => {
        await expect(dashboardPage.welcomeMessage).toBeVisible();
        await expect(dashboardPage.userMenu).toBeVisible();
      });
    });

    test('should handle logout correctly', async ({ page }) => {
      await test.step('完成登录', async () => {
        await loginPage.login(TestUsers.admin);
      });

      await test.step('执行登出', async () => {
        await dashboardPage.clickUserMenu();
        await dashboardPage.clickLogoutButton();
      });

      await test.step('验证重定向到登录页面', async () => {
        await expect(page).toHaveURL(/.*\/login/);
      });

      await test.step('验证令牌已清除', async () => {
        const accessToken = await page.evaluate(() => sessionStorage.getItem('access_token'));
        expect(accessToken).toBeNull();
      });
    });
  });

  test.describe('Error Handling', () => {
    test('should handle network errors gracefully', async ({ page }) => {
      await test.step('模拟网络错误', async () => {
        await page.route('**/api/v2/auth/login', route => route.abort());
      });

      await test.step('尝试登录', async () => {
        await loginPage.fillUsername(TestUsers.admin.username);
        await loginPage.fillPassword(TestUsers.admin.password);
        await loginPage.clickLoginButton();
      });

      await test.step('验证错误处理', async () => {
        await expect(loginPage.errorMessage).toBeVisible();
        await expect(loginPage.errorMessage).toContainText('网络错误');
      });
    });

    test('should handle server errors gracefully', async ({ page }) => {
      await test.step('模拟服务器错误', async () => {
        await page.route('**/api/v2/auth/login', route => 
          route.fulfill({
            status: 500,
            body: JSON.stringify({ message: '服务器内部错误' })
          })
        );
      });

      await test.step('尝试登录', async () => {
        await loginPage.fillUsername(TestUsers.admin.username);
        await loginPage.fillPassword(TestUsers.admin.password);
        await loginPage.clickLoginButton();
      });

      await test.step('验证错误处理', async () => {
        await expect(loginPage.errorMessage).toBeVisible();
        await expect(loginPage.errorMessage).toContainText('服务器错误');
      });
    });
  });

  test.describe('PKCE Implementation', () => {
    test('should generate PKCE parameters correctly', async ({ page }) => {
      await test.step('检查PKCE参数生成', async () => {
        await loginPage.fillUsername(TestUsers.admin.username);
        await loginPage.fillPassword(TestUsers.admin.password);
        
        const codeVerifier = await page.evaluate(() => sessionStorage.getItem('oauth_code_verifier'));
        const state = await page.evaluate(() => sessionStorage.getItem('oauth_state'));
        
        expect(codeVerifier).toBeTruthy();
        expect(state).toBeTruthy();
        expect(codeVerifier?.length).toBeGreaterThan(40);
        expect(state?.length).toBeGreaterThan(20);
      });
    });
  });
});