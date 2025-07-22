import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/login-page';
import { DashboardPage } from '../pages/dashboard-page';
import { TestHelpers, TEST_USERS, TEST_PERMISSIONS } from '../utils/test-helpers';

test.describe('登录认证功能', () => {
  let loginPage: LoginPage;
  let dashboardPage: DashboardPage;
  
  const validUser = {
    username: 'admin@example.com',
    password: 'password123',
    ...TEST_USERS.ADMIN
  };
  
  const userWith2FA = {
    username: '2fa@example.com',
    password: 'password123',
    twoFactorEnabled: true,
    ...TEST_USERS.ADMIN
  };
  
  const lockedUser = {
    username: 'locked@example.com',
    password: 'password123',
    status: 'locked',
    ...TEST_USERS.ADMIN
  };
  
  const inactiveUser = {
    username: 'inactive@example.com',
    password: 'password123',
    status: 'inactive',
    ...TEST_USERS.ADMIN
  };

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    dashboardPage = new DashboardPage(page);
    
    // 清除认证状态
    await TestHelpers.clearAuthState(page);
  });

  test('成功登录', async ({ page }) => {
    // 模拟登录API
    await TestHelpers.mockApiResponse(
      page,
      '**/api/auth/login',
      {
        success: true,
        data: {
          user: validUser,
          token: TestHelpers.generateJwtToken(validUser),
          refreshToken: 'refresh_token_123',
          expiresIn: 3600
        }
      }
    );
    
    await loginPage.goto();
    await loginPage.verifyPageLoaded();
    
    // 执行登录
    await loginPage.login(validUser.username, validUser.password);
    
    // 验证登录成功
    await loginPage.verifyLoginSuccess();
    
    // 验证重定向到仪表盘
    await page.waitForURL('**/dashboard');
    await dashboardPage.verifyPageLoaded();
    await dashboardPage.verifyUserLoggedIn(validUser);
    
    // 验证API调用
    await TestHelpers.verifyApiCall(page, '/api/auth/login', 'POST', {
      username: validUser.username,
      password: validUser.password
    });
  });

  test('用户名或密码错误', async ({ page }) => {
    // 模拟登录失败API
    await TestHelpers.mockApiError(
      page,
      '**/api/auth/login',
      { code: 'invalid_credentials', message: '用户名或密码错误' },
      401
    );
    
    await loginPage.goto();
    await loginPage.verifyPageLoaded();
    
    await loginPage.login('wrong@example.com', 'wrongpassword');
    
    // 验证登录失败
    await loginPage.verifyLoginFailure('用户名或密码错误');
    
    // 验证仍在登录页面
    await expect(page).toHaveURL(/.*\/login/);
  });

  test('账户被锁定', async ({ page }) => {
    // 模拟账户锁定API
    await TestHelpers.mockApiError(
      page,
      '**/api/auth/login',
      { code: 'account_locked', message: '账户已被锁定，请联系管理员' },
      423
    );
    
    await loginPage.goto();
    await loginPage.verifyPageLoaded();
    
    await loginPage.login(lockedUser.username, lockedUser.password);
    
    // 验证锁定提示
    await loginPage.verifyLoginFailure('账户已被锁定，请联系管理员');
  });

  test('账户未激活', async ({ page }) => {
    // 模拟账户未激活API
    await TestHelpers.mockApiError(
      page,
      '**/api/auth/login',
      { code: 'account_inactive', message: '账户未激活，请检查邮箱激活链接' },
      403
    );
    
    await loginPage.goto();
    await loginPage.verifyPageLoaded();
    
    await loginPage.login(inactiveUser.username, inactiveUser.password);
    
    // 验证未激活提示
    await loginPage.verifyLoginFailure('账户未激活，请检查邮箱激活链接');
  });

  test('双因素认证登录', async ({ page }) => {
    // 模拟第一步登录API（需要2FA）
    await TestHelpers.mockApiResponse(
      page,
      '**/api/auth/login',
      {
        success: false,
        requiresTwoFactor: true,
        tempToken: 'temp_token_123'
      }
    );
    
    // 模拟2FA验证API
    await TestHelpers.mockApiResponse(
      page,
      '**/api/auth/verify-2fa',
      {
        success: true,
        data: {
          user: userWith2FA,
          token: TestHelpers.generateJwtToken(userWith2FA),
          refreshToken: 'refresh_token_123',
          expiresIn: 3600
        }
      }
    );
    
    await loginPage.goto();
    await loginPage.verifyPageLoaded();
    
    // 第一步：用户名密码登录
    await loginPage.login(userWith2FA.username, userWith2FA.password);
    
    // 验证进入2FA验证页面
    await loginPage.verifyTwoFactorRequired();
    
    // 第二步：输入2FA验证码
    const verificationCode = '123456';
    await loginPage.enterTwoFactorCode(verificationCode);
    await loginPage.submitTwoFactorCode();
    
    // 验证登录成功
    await loginPage.verifyLoginSuccess();
    await page.waitForURL('**/dashboard');
    
    // 验证API调用
    await TestHelpers.verifyApiCall(page, '/api/auth/verify-2fa', 'POST', {
      tempToken: 'temp_token_123',
      code: verificationCode
    });
  });

  test('2FA验证码错误', async ({ page }) => {
    // 模拟第一步登录成功
    await TestHelpers.mockApiResponse(
      page,
      '**/api/auth/login',
      {
        success: false,
        requiresTwoFactor: true,
        tempToken: 'temp_token_123'
      }
    );
    
    // 模拟2FA验证失败
    await TestHelpers.mockApiError(
      page,
      '**/api/auth/verify-2fa',
      { code: 'invalid_2fa_code', message: '验证码无效或已过期' },
      400
    );
    
    await loginPage.goto();
    await loginPage.verifyPageLoaded();
    
    await loginPage.login(userWith2FA.username, userWith2FA.password);
    await loginPage.verifyTwoFactorRequired();
    
    // 输入错误的验证码
    await loginPage.enterTwoFactorCode('000000');
    await loginPage.submitTwoFactorCode();
    
    // 验证错误提示
    await loginPage.verifyTwoFactorError('验证码无效或已过期');
  });

  test('使用备份代码登录', async ({ page }) => {
    // 模拟第一步登录成功
    await TestHelpers.mockApiResponse(
      page,
      '**/api/auth/login',
      {
        success: false,
        requiresTwoFactor: true,
        tempToken: 'temp_token_123'
      }
    );
    
    // 模拟备份代码验证API
    await TestHelpers.mockApiResponse(
      page,
      '**/api/auth/verify-backup-code',
      {
        success: true,
        data: {
          user: userWith2FA,
          token: TestHelpers.generateJwtToken(userWith2FA),
          refreshToken: 'refresh_token_123',
          expiresIn: 3600
        }
      }
    );
    
    await loginPage.goto();
    await loginPage.verifyPageLoaded();
    
    await loginPage.login(userWith2FA.username, userWith2FA.password);
    await loginPage.verifyTwoFactorRequired();
    
    // 切换到备份代码
    await loginPage.switchToBackupCode();
    
    // 输入备份代码
    const backupCode = 'backup123';
    await loginPage.enterBackupCode(backupCode);
    await loginPage.submitBackupCode();
    
    // 验证登录成功
    await loginPage.verifyLoginSuccess();
    await page.waitForURL('**/dashboard');
    
    // 验证API调用
    await TestHelpers.verifyApiCall(page, '/api/auth/verify-backup-code', 'POST', {
      tempToken: 'temp_token_123',
      backupCode: backupCode
    });
  });

  test('记住我功能', async ({ page }) => {
    // 模拟登录API（记住我）
    await TestHelpers.mockApiResponse(
      page,
      '**/api/auth/login',
      {
        success: true,
        data: {
          user: validUser,
          token: TestHelpers.generateJwtToken(validUser),
          refreshToken: 'refresh_token_123',
          expiresIn: 3600,
          rememberMe: true
        }
      }
    );
    
    await loginPage.goto();
    await loginPage.verifyPageLoaded();
    
    // 勾选记住我
    await loginPage.checkRememberMe();
    await loginPage.login(validUser.username, validUser.password);
    
    // 验证登录成功
    await loginPage.verifyLoginSuccess();
    
    // 验证API调用包含rememberMe参数
    await TestHelpers.verifyApiCall(page, '/api/auth/login', 'POST', {
      username: validUser.username,
      password: validUser.password,
      rememberMe: true
    });
    
    // 验证本地存储设置
    const rememberMeToken = await page.evaluate(() => localStorage.getItem('rememberMe'));
    expect(rememberMeToken).toBeTruthy();
  });

  test('登录尝试次数限制', async ({ page }) => {
    // 模拟多次登录失败后的限制
    await TestHelpers.mockApiError(
      page,
      '**/api/auth/login',
      { 
        code: 'too_many_attempts', 
        message: '登录尝试次数过多，请5分钟后再试',
        retryAfter: 300
      },
      429
    );
    
    await loginPage.goto();
    await loginPage.verifyPageLoaded();
    
    await loginPage.login('test@example.com', 'wrongpassword');
    
    // 验证限制提示
    await loginPage.verifyLoginFailure('登录尝试次数过多，请5分钟后再试');
    
    // 验证登录按钮被禁用
    await loginPage.verifyLoginButtonDisabled();
  });

  test('会话超时处理', async ({ page }) => {
    // 先登录
    await TestHelpers.setAuthState(page, validUser, [TEST_PERMISSIONS.DASHBOARD_READ]);
    
    await dashboardPage.goto();
    await dashboardPage.verifyPageLoaded();
    
    // 模拟会话超时
    await TestHelpers.simulateSessionTimeout(page);
    
    // 尝试访问需要认证的页面
    await page.goto('/admin/users');
    
    // 应该重定向到登录页面
    await page.waitForURL('**/login');
    await loginPage.verifyPageLoaded();
    
    // 验证会话超时提示
    await loginPage.verifySessionTimeoutMessage();
  });

  test('令牌自动刷新', async ({ page }) => {
    // 设置即将过期的令牌
    const expiredToken = TestHelpers.generateJwtToken(validUser, { expiresIn: '1s' });
    await TestHelpers.setAuthState(page, validUser, [TEST_PERMISSIONS.DASHBOARD_READ], expiredToken);
    
    // 模拟令牌刷新API
    await TestHelpers.mockApiResponse(
      page,
      '**/api/auth/refresh',
      {
        success: true,
        data: {
          token: TestHelpers.generateJwtToken(validUser),
          refreshToken: 'new_refresh_token_123',
          expiresIn: 3600
        }
      }
    );
    
    await dashboardPage.goto();
    await dashboardPage.verifyPageLoaded();
    
    // 等待令牌过期并自动刷新
    await page.waitForTimeout(2000);
    
    // 执行需要认证的操作
    await dashboardPage.navigateToUsers();
    
    // 验证令牌刷新API被调用
    await TestHelpers.verifyApiCall(page, '/api/auth/refresh', 'POST');
    
    // 验证页面正常工作
    await page.waitForURL('**/users');
  });

  test('令牌刷新失败处理', async ({ page }) => {
    // 设置过期的令牌
    const expiredToken = TestHelpers.generateJwtToken(validUser, { expiresIn: '1s' });
    await TestHelpers.setAuthState(page, validUser, [TEST_PERMISSIONS.DASHBOARD_READ], expiredToken);
    
    // 模拟令牌刷新失败
    await TestHelpers.mockApiError(
      page,
      '**/api/auth/refresh',
      { code: 'invalid_refresh_token', message: '刷新令牌无效' },
      401
    );
    
    await dashboardPage.goto();
    
    // 等待令牌过期
    await page.waitForTimeout(2000);
    
    // 尝试执行需要认证的操作
    await dashboardPage.navigateToUsers();
    
    // 应该重定向到登录页面
    await page.waitForURL('**/login');
    await loginPage.verifyPageLoaded();
  });

  test('退出登录', async ({ page }) => {
    // 先登录
    await TestHelpers.setAuthState(page, validUser, [TEST_PERMISSIONS.DASHBOARD_READ]);
    
    // 模拟退出登录API
    await TestHelpers.mockApiResponse(
      page,
      '**/api/auth/logout',
      { success: true }
    );
    
    await dashboardPage.goto();
    await dashboardPage.verifyPageLoaded();
    
    // 执行退出登录
    await dashboardPage.logout();
    
    // 验证重定向到登录页面
    await page.waitForURL('**/login');
    await loginPage.verifyPageLoaded();
    
    // 验证认证状态被清除
    const token = await page.evaluate(() => localStorage.getItem('authToken'));
    expect(token).toBeNull();
    
    // 验证API调用
    await TestHelpers.verifyApiCall(page, '/api/auth/logout', 'POST');
  });

  test('表单验证', async ({ page }) => {
    await loginPage.goto();
    await loginPage.verifyPageLoaded();
    
    // 测试空表单提交
    await loginPage.submitLogin();
    
    await loginPage.verifyValidationError('username', '用户名不能为空');
    await loginPage.verifyValidationError('password', '密码不能为空');
    
    // 测试无效邮箱格式
    await loginPage.fillUsername('invalid-email');
    await loginPage.submitLogin();
    
    await loginPage.verifyValidationError('username', '请输入有效的邮箱地址');
    
    // 测试密码长度
    await loginPage.fillUsername('test@example.com');
    await loginPage.fillPassword('123');
    await loginPage.submitLogin();
    
    await loginPage.verifyValidationError('password', '密码至少6位字符');
  });

  test('清空表单', async ({ page }) => {
    await loginPage.goto();
    await loginPage.verifyPageLoaded();
    
    // 填写表单
    await loginPage.fillUsername('test@example.com');
    await loginPage.fillPassword('password123');
    await loginPage.checkRememberMe();
    
    // 清空表单
    await loginPage.clearForm();
    
    // 验证表单已清空
    await loginPage.verifyFormCleared();
  });

  test('键盘操作', async ({ page }) => {
    await loginPage.goto();
    await loginPage.verifyPageLoaded();
    
    // 模拟登录API
    await TestHelpers.mockApiResponse(
      page,
      '**/api/auth/login',
      {
        success: true,
        data: {
          user: validUser,
          token: TestHelpers.generateJwtToken(validUser),
          refreshToken: 'refresh_token_123',
          expiresIn: 3600
        }
      }
    );
    
    // 使用键盘操作登录
    await loginPage.loginWithKeyboard(validUser.username, validUser.password);
    
    // 验证登录成功
    await loginPage.verifyLoginSuccess();
    await page.waitForURL('**/dashboard');
  });

  test('页面标题验证', async ({ page }) => {
    await loginPage.goto();
    await loginPage.verifyPageLoaded();
    
    // 验证页面标题
    await loginPage.verifyPageTitle('登录 - 管理后台');
  });

  test('安全特性验证', async ({ page }) => {
    await loginPage.goto();
    await loginPage.verifyPageLoaded();
    
    // 验证CSRF保护
    await loginPage.verifyCsrfProtection();
    
    // 验证安全头
    await loginPage.verifySecurityHeaders();
    
    // 验证密码字段类型
    await loginPage.verifyPasswordFieldSecurity();
  });

  test('网络错误处理', async ({ page }) => {
    // 模拟网络错误
    await TestHelpers.simulateNetworkError(page, '**/api/auth/login');
    
    await loginPage.goto();
    await loginPage.verifyPageLoaded();
    
    await loginPage.login(validUser.username, validUser.password);
    
    // 验证网络错误提示
    await loginPage.verifyNetworkError('网络连接失败，请检查网络设置');
  });

  test('加载状态验证', async ({ page }) => {
    // 模拟慢速API响应
    await TestHelpers.simulateSlowResponse(page, '**/api/auth/login', 2000);
    
    await loginPage.goto();
    await loginPage.verifyPageLoaded();
    
    await loginPage.login(validUser.username, validUser.password);
    
    // 验证加载状态
    await loginPage.verifyLoginProcessing();
    
    // 等待登录完成
    await loginPage.waitForLoginComplete();
  });

  test('响应式设计验证', async ({ page }) => {
    await loginPage.goto();
    await loginPage.verifyPageLoaded();
    
    // 测试不同屏幕尺寸
    const breakpoints = [
      { name: 'mobile', width: 375, height: 667 },
      { name: 'tablet', width: 768, height: 1024 },
      { name: 'desktop', width: 1920, height: 1080 }
    ];
    
    await TestHelpers.verifyResponsiveDesign(page, breakpoints);
  });

  test('可访问性验证', async ({ page }) => {
    await loginPage.goto();
    await loginPage.verifyPageLoaded();
    
    // 验证键盘导航和ARIA标签
    await TestHelpers.verifyAccessibility(page);
  });

  test('浏览器兼容性', async ({ page, browserName }) => {
    await loginPage.goto();
    await loginPage.verifyPageLoaded();
    
    // 验证不同浏览器的兼容性
    await loginPage.verifyBrowserCompatibility(browserName);
  });

  test('多语言支持', async ({ page }) => {
    // 设置英文语言
    await page.addInitScript(() => {
      localStorage.setItem('language', 'en-US');
    });
    
    await loginPage.goto();
    await loginPage.verifyPageLoaded();
    
    // 验证英文界面
    await loginPage.verifyLanguage('en-US');
    
    // 切换到中文
    await loginPage.switchLanguage('zh-CN');
    
    // 验证中文界面
    await loginPage.verifyLanguage('zh-CN');
  });

  test('深色主题支持', async ({ page }) => {
    // 设置深色主题
    await page.addInitScript(() => {
      localStorage.setItem('theme', 'dark');
    });
    
    await loginPage.goto();
    await loginPage.verifyPageLoaded();
    
    // 验证深色主题样式
    await loginPage.verifyDarkTheme();
  });
});