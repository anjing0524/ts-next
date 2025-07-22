import { Page, Locator, expect } from '@playwright/test';

/**
 * 基础页面类，提供通用的页面操作方法
 */
export abstract class BasePage {
  protected page: Page;
  protected baseUrl: string;

  constructor(page: Page, baseUrl: string = 'http://localhost:3002') {
    this.page = page;
    this.baseUrl = baseUrl;
  }

  /**
   * 导航到指定路径
   * @param path 页面路径
   */
  async goto(path: string): Promise<void> {
    await this.page.goto(`${this.baseUrl}${path}`);
  }

  /**
   * 等待页面加载完成
   */
  async waitForLoad(): Promise<void> {
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * 获取页面标题
   */
  async getTitle(): Promise<string> {
    return await this.page.title();
  }

  /**
   * 检查元素是否可见
   * @param selector 元素选择器
   */
  async isVisible(selector: string): Promise<boolean> {
    return await this.page.isVisible(selector);
  }

  /**
   * 等待元素出现
   * @param selector 元素选择器
   * @param timeout 超时时间（毫秒）
   */
  async waitForElement(selector: string, timeout: number = 10000): Promise<Locator> {
    const element = this.page.locator(selector);
    await element.waitFor({ timeout });
    return element;
  }

  /**
   * 点击元素
   * @param selector 元素选择器
   */
  async click(selector: string): Promise<void> {
    await this.page.click(selector);
  }

  /**
   * 填写输入框
   * @param selector 输入框选择器
   * @param value 输入值
   */
  async fill(selector: string, value: string): Promise<void> {
    await this.page.fill(selector, value);
  }

  /**
   * 获取元素文本
   * @param selector 元素选择器
   */
  async getText(selector: string): Promise<string> {
    return await this.page.textContent(selector) || '';
  }

  /**
   * 等待并验证成功提示消息
   * @param message 期望的提示消息
   */
  async waitForSuccessMessage(message?: string): Promise<void> {
    const toast = this.page.locator('[data-testid="toast-success"], .toast-success, [role="alert"]');
    await toast.waitFor({ timeout: 5000 });
    
    if (message) {
      await expect(toast).toContainText(message);
    }
  }

  /**
   * 等待并验证错误提示消息
   * @param message 期望的错误消息
   */
  async waitForErrorMessage(message?: string): Promise<void> {
    const toast = this.page.locator('[data-testid="toast-error"], .toast-error, [role="alert"]');
    await toast.waitFor({ timeout: 5000 });
    
    if (message) {
      await expect(toast).toContainText(message);
    }
  }

  /**
   * 等待加载状态结束
   */
  async waitForLoadingComplete(): Promise<void> {
    // 等待加载指示器消失
    const loadingIndicators = [
      '[data-testid="loading"]',
      '.loading',
      '.spinner',
      '[aria-label="Loading"]'
    ];

    for (const selector of loadingIndicators) {
      try {
        await this.page.waitForSelector(selector, { state: 'hidden', timeout: 1000 });
      } catch {
        // 如果元素不存在，忽略错误
      }
    }
  }

  /**
   * 截图保存
   * @param name 截图文件名
   */
  async screenshot(name: string): Promise<void> {
    await this.page.screenshot({ 
      path: `test-results/screenshots/${name}.png`,
      fullPage: true 
    });
  }

  /**
   * 获取当前URL
   */
  getCurrentUrl(): string {
    return this.page.url();
  }

  /**
   * 等待URL包含指定路径
   * @param path 期望的路径
   */
  async waitForUrl(path: string): Promise<void> {
    await this.page.waitForURL(`**${path}**`);
  }

  /**
   * 检查是否重定向到指定路径
   * @param expectedPath 期望的路径
   */
  async verifyRedirect(expectedPath: string): Promise<void> {
    await this.waitForUrl(expectedPath);
    expect(this.getCurrentUrl()).toContain(expectedPath);
  }

  /**
   * 获取localStorage中的值
   * @param key 存储键
   */
  async getLocalStorageItem(key: string): Promise<string | null> {
    return await this.page.evaluate((key) => {
      return localStorage.getItem(key);
    }, key);
  }

  /**
   * 设置localStorage中的值
   * @param key 存储键
   * @param value 存储值
   */
  async setLocalStorageItem(key: string, value: string): Promise<void> {
    await this.page.evaluate(({ key, value }) => {
      localStorage.setItem(key, value);
    }, { key, value });
  }

  /**
   * 清空localStorage
   */
  async clearLocalStorage(): Promise<void> {
    await this.page.evaluate(() => {
      localStorage.clear();
    });
  }

  /**
   * 验证JWT令牌存在且有效
   */
  async verifyTokenExists(): Promise<void> {
    const accessToken = await this.getLocalStorageItem('access_token');
    const refreshToken = await this.getLocalStorageItem('refresh_token');
    
    expect(accessToken).toBeTruthy();
    expect(refreshToken).toBeTruthy();
  }

  /**
   * 模拟令牌过期
   */
  async simulateTokenExpiry(): Promise<void> {
    // 设置一个过期的JWT令牌
    const expiredToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJvYXV0aC1zZXJ2aWNlIiwic3ViIjoidXNlci0xMjMiLCJhdWQiOiJhZG1pbi1wb3J0YWwiLCJleHAiOjE2MDk0NTkyMDAsImlhdCI6MTYwOTQ1OTIwMCwic2NvcGUiOiJvcGVuaWQgcHJvZmlsZSBhZG1pbjpyZWFkIGFkbWluOndyaXRlIn0.invalid';
    await this.setLocalStorageItem('access_token', expiredToken);
  }
}