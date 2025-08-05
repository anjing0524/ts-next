import { Page, Locator } from '@playwright/test';

/**
 * 仪表盘页面页面对象模式
 * 封装所有与仪表盘页面相关的操作和断言
 */
export class DashboardPage {
  readonly page: Page;
  readonly welcomeMessage: Locator;
  readonly userMenu: Locator;
  readonly logoutButton: Locator;
  readonly navigationMenu: Locator;
  readonly userManagementLink: Locator;
  readonly roleManagementLink: Locator;
  readonly systemConfigLink: Locator;

  constructor(page: Page) {
    this.page = page;
    this.welcomeMessage = page.locator('[data-testid="welcome-message"]');
    this.userMenu = page.locator('[data-testid="user-menu"]');
    this.logoutButton = page.locator('[data-testid="logout-button"]');
    this.navigationMenu = page.locator('[data-testid="navigation-menu"]');
    this.userManagementLink = page.locator('a[href*="/admin/users"]');
    this.roleManagementLink = page.locator('a[href*="/admin/roles"]');
    this.systemConfigLink = page.locator('a[href*="/admin/system"]');
  }

  async goto() {
    await this.page.goto('/dashboard');
    await this.page.waitForLoadState('networkidle');
  }

  async waitForLoad() {
    await this.welcomeMessage.waitFor({ state: 'visible', timeout: 10000 });
  }

  async clickUserMenu() {
    await this.userMenu.click();
  }

  async clickLogoutButton() {
    await this.logoutButton.click();
  }

  async getWelcomeMessage(): Promise<string> {
    return await this.welcomeMessage.textContent() || '';
  }

  async isLoggedIn(): Promise<boolean> {
    try {
      await this.welcomeMessage.waitFor({ state: 'visible', timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  async navigateToUserManagement() {
    await this.userManagementLink.click();
    await this.page.waitForURL(/.*\/admin\/users/);
  }

  async navigateToRoleManagement() {
    await this.roleManagementLink.click();
    await this.page.waitForURL(/.*\/admin\/roles/);
  }

  async navigateToSystemConfig() {
    await this.systemConfigLink.click();
    await this.page.waitForURL(/.*\/admin\/system/);
  }
}