import { Page, expect } from '@playwright/test';
import { BasePage } from './base-page';

/**
 * OAuth授权同意页面对象类
 */
export class ConsentPage extends BasePage {
  // 页面元素选择器
  private readonly pageTitle = '[data-testid="consent-title"], h1, .consent-title';
  private readonly clientInfo = '[data-testid="client-info"], .client-info';
  private readonly scopesList = '[data-testid="scopes-list"], .scopes-list, .permissions-list';
  private readonly allowButton = '[data-testid="allow-button"], button:has-text("同意"), button:has-text("Allow"), .btn-allow';
  private readonly denyButton = '[data-testid="deny-button"], button:has-text("拒绝"), button:has-text("Deny"), .btn-deny';
  private readonly scopeItem = '[data-testid="scope-item"], .scope-item, .permission-item';
  private readonly clientName = '[data-testid="client-name"], .client-name';
  private readonly userInfo = '[data-testid="user-info"], .user-info';

  constructor(page: Page) {
    super(page);
  }

  /**
   * 验证授权页面已加载
   */
  async verifyPageLoaded(): Promise<void> {
    await this.waitForElement(this.pageTitle);
    await expect(this.page.locator(this.allowButton)).toBeVisible();
    await expect(this.page.locator(this.denyButton)).toBeVisible();
  }

  /**
   * 验证页面标题
   */
  async verifyPageTitle(): Promise<void> {
    const title = await this.getText(this.pageTitle);
    expect(title).toMatch(/授权|同意|Authorization|Consent/);
  }

  /**
   * 验证客户端信息显示
   * @param expectedClientName 期望的客户端名称
   */
  async verifyClientInfo(expectedClientName: string = 'admin-portal'): Promise<void> {
    await this.waitForElement(this.clientInfo);
    
    // 验证客户端名称显示
    const clientNameElement = this.page.locator(this.clientName);
    if (await clientNameElement.isVisible()) {
      const clientName = await this.getText(this.clientName);
      expect(clientName).toContain(expectedClientName);
    }
  }

  /**
   * 验证权限范围列表
   * @param expectedScopes 期望的权限范围
   */
  async verifyScopes(expectedScopes: string[]): Promise<void> {
    await this.waitForElement(this.scopesList);
    
    // 获取所有权限项
    const scopeItems = this.page.locator(this.scopeItem);
    const scopeCount = await scopeItems.count();
    
    expect(scopeCount).toBeGreaterThan(0);
    
    // 验证每个期望的权限都存在
    for (const scope of expectedScopes) {
      const scopeElement = this.page.locator(this.scopeItem).filter({ hasText: scope });
      await expect(scopeElement).toBeVisible();
    }
  }

  /**
   * 验证标准OAuth权限范围
   */
  async verifyStandardScopes(): Promise<void> {
    const expectedScopes = [
      'openid',
      'profile', 
      'admin:read',
      'admin:write'
    ];
    
    await this.verifyScopes(expectedScopes);
  }

  /**
   * 获取所有显示的权限范围
   */
  async getAllScopes(): Promise<string[]> {
    await this.waitForElement(this.scopesList);
    
    const scopeItems = this.page.locator(this.scopeItem);
    const scopeCount = await scopeItems.count();
    const scopes: string[] = [];
    
    for (let i = 0; i < scopeCount; i++) {
      const scopeText = await scopeItems.nth(i).textContent();
      if (scopeText) {
        scopes.push(scopeText.trim());
      }
    }
    
    return scopes;
  }

  /**
   * 点击同意授权
   */
  async clickAllow(): Promise<void> {
    await this.click(this.allowButton);
  }

  /**
   * 点击拒绝授权
   */
  async clickDeny(): Promise<void> {
    await this.click(this.denyButton);
  }

  /**
   * 同意授权并等待重定向
   */
  async allowAndWaitForRedirect(): Promise<void> {
    await this.clickAllow();
    
    // 等待重定向到回调URL或dashboard
    await this.page.waitForURL(/\/(auth\/callback|dashboard)/, { timeout: 10000 });
  }

  /**
   * 拒绝授权并验证结果
   */
  async denyAndVerifyError(): Promise<void> {
    await this.clickDeny();
    
    // 等待重定向到错误页面或回到登录页面
    await this.page.waitForURL(/\/(auth\/login|error)/, { timeout: 10000 });
    
    const currentUrl = this.getCurrentUrl();
    expect(currentUrl).toMatch(/error|access_denied/);
  }

  /**
   * 验证用户信息显示
   * @param expectedUsername 期望的用户名
   */
  async verifyUserInfo(expectedUsername?: string): Promise<void> {
    const userInfoElement = this.page.locator(this.userInfo);
    
    if (await userInfoElement.isVisible()) {
      if (expectedUsername) {
        const userText = await this.getText(this.userInfo);
        expect(userText).toContain(expectedUsername);
      }
    }
  }

  /**
   * 验证授权页面的安全特性
   */
  async verifySecurityFeatures(): Promise<void> {
    // 验证页面URL包含必要的OAuth参数
    const currentUrl = this.getCurrentUrl();
    expect(currentUrl).toContain('client_id');
    expect(currentUrl).toContain('response_type=code');
    expect(currentUrl).toContain('code_challenge'); // PKCE
    
    // 验证state参数存在（CSRF保护）
    expect(currentUrl).toContain('state');
  }

  /**
   * 验证PKCE参数
   */
  async verifyPKCEParameters(): Promise<void> {
    const currentUrl = this.getCurrentUrl();
    
    // 验证PKCE相关参数
    expect(currentUrl).toContain('code_challenge');
    expect(currentUrl).toContain('code_challenge_method=S256');
  }

  /**
   * 获取授权URL中的参数
   * @param paramName 参数名
   */
  async getUrlParameter(paramName: string): Promise<string | null> {
    const url = new URL(this.getCurrentUrl());
    return url.searchParams.get(paramName);
  }

  /**
   * 验证OAuth参数完整性
   */
  async verifyOAuthParameters(): Promise<void> {
    const requiredParams = [
      'client_id',
      'response_type',
      'scope',
      'state',
      'code_challenge',
      'code_challenge_method'
    ];
    
    for (const param of requiredParams) {
      const value = await this.getUrlParameter(param);
      expect(value).toBeTruthy();
    }
    
    // 验证特定参数值
    expect(await this.getUrlParameter('client_id')).toBe('admin-portal');
    expect(await this.getUrlParameter('response_type')).toBe('code');
    expect(await this.getUrlParameter('code_challenge_method')).toBe('S256');
  }

  /**
   * 验证权限范围参数
   */
  async verifyScopeParameter(): Promise<void> {
    const scope = await this.getUrlParameter('scope');
    expect(scope).toBeTruthy();
    
    const scopes = scope?.split(' ') || [];
    expect(scopes).toContain('openid');
    expect(scopes).toContain('profile');
  }

  /**
   * 验证按钮状态
   */
  async verifyButtonStates(): Promise<void> {
    await expect(this.page.locator(this.allowButton)).toBeEnabled();
    await expect(this.page.locator(this.denyButton)).toBeEnabled();
  }

  /**
   * 验证页面可访问性
   */
  async verifyAccessibility(): Promise<void> {
    // 验证按钮有适当的标签
    const allowBtn = this.page.locator(this.allowButton);
    const denyBtn = this.page.locator(this.denyButton);
    
    // 验证按钮文本或aria-label
    const allowText = await allowBtn.textContent();
    const denyText = await denyBtn.textContent();
    
    expect(allowText).toMatch(/同意|允许|Allow|Accept/);
    expect(denyText).toMatch(/拒绝|取消|Deny|Cancel/);
  }

  /**
   * 模拟键盘操作
   */
  async navigateWithKeyboard(): Promise<void> {
    // Tab键导航到同意按钮
    await this.page.keyboard.press('Tab');
    await this.page.keyboard.press('Tab');
    
    // 验证焦点在同意按钮上
    await expect(this.page.locator(this.allowButton)).toBeFocused();
    
    // 可以用Enter键确认
    // await this.page.keyboard.press('Enter');
  }
}