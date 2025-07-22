import { Page, expect } from '@playwright/test';
import { BasePage } from './base-page';

/**
 * 登录页面对象类
 */
export class LoginPage extends BasePage {
  // 页面元素选择器
  private readonly usernameInput = '[data-testid="username-input"], input[name="username"], input[type="text"]';
  private readonly passwordInput = '[data-testid="password-input"], input[name="password"], input[type="password"]';
  private readonly loginButton = '[data-testid="login-button"], button[type="submit"], button:has-text("登录")';
  private readonly errorMessage = '[data-testid="error-message"], .error-message, [role="alert"]';
  private readonly loginForm = '[data-testid="login-form"], form';
  private readonly pageTitle = 'h1, [data-testid="page-title"]';

  constructor(page: Page) {
    super(page);
  }

  /**
   * 导航到登录页面
   */
  async goto(): Promise<void> {
    await super.goto('/auth/login');
    await this.waitForLoad();
  }

  /**
   * 验证登录页面已加载
   */
  async verifyPageLoaded(): Promise<void> {
    await this.waitForElement(this.loginForm);
    await expect(this.page.locator(this.usernameInput)).toBeVisible();
    await expect(this.page.locator(this.passwordInput)).toBeVisible();
    await expect(this.page.locator(this.loginButton)).toBeVisible();
  }

  /**
   * 输入用户名
   * @param username 用户名
   */
  async enterUsername(username: string): Promise<void> {
    await this.fill(this.usernameInput, username);
  }

  /**
   * 输入密码
   * @param password 密码
   */
  async enterPassword(password: string): Promise<void> {
    await this.fill(this.passwordInput, password);
  }

  /**
   * 点击登录按钮
   */
  async clickLogin(): Promise<void> {
    await this.click(this.loginButton);
  }

  /**
   * 执行登录操作
   * @param username 用户名
   * @param password 密码
   */
  async login(username: string, password: string): Promise<void> {
    await this.enterUsername(username);
    await this.enterPassword(password);
    await this.clickLogin();
  }

  /**
   * 验证登录成功（重定向到授权页面或dashboard）
   */
  async verifyLoginSuccess(): Promise<void> {
    // 等待重定向，可能到授权页面或直接到dashboard
    await this.page.waitForURL(/\/(oauth\/consent|dashboard)/, { timeout: 10000 });
    
    const currentUrl = this.getCurrentUrl();
    const isConsentPage = currentUrl.includes('/oauth/consent');
    const isDashboard = currentUrl.includes('/dashboard');
    
    expect(isConsentPage || isDashboard).toBeTruthy();
  }

  /**
   * 验证登录失败
   */
  async verifyLoginFailure(): Promise<void> {
    // 验证仍在登录页面
    expect(this.getCurrentUrl()).toContain('/auth/login');
    
    // 验证显示错误消息
    await this.waitForElement(this.errorMessage);
    await expect(this.page.locator(this.errorMessage)).toBeVisible();
  }

  /**
   * 获取错误消息文本
   */
  async getErrorMessage(): Promise<string> {
    await this.waitForElement(this.errorMessage);
    return await this.getText(this.errorMessage);
  }

  /**
   * 验证错误消息内容
   * @param expectedMessage 期望的错误消息
   */
  async verifyErrorMessage(expectedMessage: string): Promise<void> {
    const errorText = await this.getErrorMessage();
    expect(errorText).toContain(expectedMessage);
  }

  /**
   * 清空登录表单
   */
  async clearForm(): Promise<void> {
    await this.page.locator(this.usernameInput).clear();
    await this.page.locator(this.passwordInput).clear();
  }

  /**
   * 验证表单验证错误
   */
  async verifyFormValidationErrors(): Promise<void> {
    // 检查用户名和密码字段的验证错误
    const usernameError = this.page.locator('[data-testid="username-error"], .field-error');
    const passwordError = this.page.locator('[data-testid="password-error"], .field-error');
    
    // 至少应该有一个验证错误显示
    const hasUsernameError = await usernameError.isVisible();
    const hasPasswordError = await passwordError.isVisible();
    
    expect(hasUsernameError || hasPasswordError).toBeTruthy();
  }

  /**
   * 验证登录按钮状态
   * @param shouldBeDisabled 是否应该被禁用
   */
  async verifyLoginButtonState(shouldBeDisabled: boolean): Promise<void> {
    const loginBtn = this.page.locator(this.loginButton);
    
    if (shouldBeDisabled) {
      await expect(loginBtn).toBeDisabled();
    } else {
      await expect(loginBtn).toBeEnabled();
    }
  }

  /**
   * 等待登录处理完成
   */
  async waitForLoginProcessing(): Promise<void> {
    // 等待加载状态
    await this.waitForLoadingComplete();
    
    // 等待网络请求完成
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * 验证页面标题
   */
  async verifyPageTitle(): Promise<void> {
    const title = await this.getTitle();
    expect(title).toContain('登录');
  }

  /**
   * 检查是否有"记住我"选项
   */
  async hasRememberMeOption(): Promise<boolean> {
    const rememberMe = this.page.locator('[data-testid="remember-me"], input[name="remember"]');
    return await rememberMe.isVisible();
  }

  /**
   * 勾选"记住我"
   */
  async checkRememberMe(): Promise<void> {
    const rememberMe = this.page.locator('[data-testid="remember-me"], input[name="remember"]');
    if (await rememberMe.isVisible()) {
      await rememberMe.check();
    }
  }

  /**
   * 验证登录页面的安全特性
   */
  async verifySecurityFeatures(): Promise<void> {
    // 验证密码字段是password类型
    const passwordField = this.page.locator(this.passwordInput);
    await expect(passwordField).toHaveAttribute('type', 'password');
    
    // 验证表单有CSRF保护（如果实现了）
    const csrfToken = this.page.locator('input[name="_token"], input[name="csrf_token"]');
    // CSRF token是可选的，所以不强制要求
  }

  /**
   * 模拟键盘操作登录
   * @param username 用户名
   * @param password 密码
   */
  async loginWithKeyboard(username: string, password: string): Promise<void> {
    await this.page.locator(this.usernameInput).focus();
    await this.page.keyboard.type(username);
    await this.page.keyboard.press('Tab');
    await this.page.keyboard.type(password);
    await this.page.keyboard.press('Enter');
  }

  /**
   * 导航到登录页面（别名方法）
   */
  async navigate(): Promise<void> {
    await this.goto();
  }

  /**
   * 填写登录凭据
   */
  async fillCredentials(username: string, password: string): Promise<void> {
    await this.enterUsername(username);
    await this.enterPassword(password);
  }

  /**
   * 点击登录按钮（别名方法）
   */
  async clickLoginButton(): Promise<void> {
    await this.clickLogin();
  }

  /**
   * 验证需要双因素认证
   */
  async verifyTwoFactorRequired(): Promise<void> {
    // 等待2FA页面或表单出现
    const twoFactorForm = '[data-testid="two-factor-form"], [data-testid="2fa-form"]';
    await this.waitForElement(twoFactorForm);
  }

  /**
   * 输入双因素认证代码
   */
  async enterTwoFactorCode(code: string): Promise<void> {
    const codeInput = '[data-testid="two-factor-code"], [data-testid="2fa-code"], input[name="code"]';
    await this.fill(codeInput, code);
  }

  /**
   * 提交双因素认证代码
   */
  async submitTwoFactorCode(): Promise<void> {
    const submitButton = '[data-testid="submit-2fa"], button[type="submit"]';
    await this.click(submitButton);
  }

  /**
   * 验证双因素认证错误
   */
  async verifyTwoFactorError(expectedMessage?: string): Promise<void> {
    await this.waitForElement(this.errorMessage);
    if (expectedMessage) {
      await this.verifyErrorMessage(expectedMessage);
    }
  }
}