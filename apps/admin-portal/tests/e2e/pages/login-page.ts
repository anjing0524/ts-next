import { Page, Locator } from '@playwright/test';

/**
 * 登录页面页面对象模式
 * 封装所有与登录页面相关的操作和断言
 */
export class LoginPage {
  readonly page: Page;
  readonly usernameInput: Locator;
  readonly passwordInput: Locator;
  readonly loginButton: Locator;
  readonly oauthButton: Locator;
  readonly errorMessage: Locator;
  readonly loadingSpinner: Locator;
  readonly usernameValidation: Locator;
  readonly passwordValidation: Locator;

  constructor(page: Page) {
    this.page = page;
    this.usernameInput = page.locator('[data-testid="username-input"]');
    this.passwordInput = page.locator('[data-testid="password-input"]');
    this.loginButton = page.locator('[data-testid="login-button"]');
    this.oauthButton = page.locator('button:has-text("使用 OAuth 登录")');
    this.errorMessage = page.locator('[role="alert"], .text-red-600');
    this.loadingSpinner = page.locator('.animate-spin');
    this.usernameValidation = page.locator('text=请输入用户名');
    this.passwordValidation = page.locator('text=请输入密码');
  }

  async goto() {
    await this.page.goto('/login');
    await this.page.waitForLoadState('networkidle');
  }

  async fillUsername(username: string) {
    await this.usernameInput.clear();
    await this.usernameInput.fill(username);
  }

  async fillPassword(password: string) {
    await this.passwordInput.clear();
    await this.passwordInput.fill(password);
  }

  async clickLoginButton() {
    await this.loginButton.click();
  }

  async clickOAuthButton() {
    await this.oauthButton.click();
  }

  async login(credentials: { username: string; password: string }) {
    await this.fillUsername(credentials.username);
    await this.fillPassword(credentials.password);
    await this.clickLoginButton();
  }

  async waitForRedirect() {
    await this.page.waitForURL(/.*\/dashboard/, { timeout: 10000 });
  }

  async getErrorMessage(): Promise<string> {
    return await this.errorMessage.textContent() || '';
  }

  async isLoading(): Promise<boolean> {
    return await this.loadingSpinner.isVisible();
  }
}