import { test as base, expect } from '@playwright/test';
import { LoginPage } from '../pages/login-page';
import { DashboardPage } from '../pages/dashboard-page';
import { UserManagementPage } from '../pages/user-management-page';
import { RoleManagementPage } from '../pages/role-management-page';
import { AuditLogPage } from '../pages/audit-log-page';
import { TestUsers } from '../helpers/test-data';

/**
 * 自定义测试夹具，提供预配置的页面对象和认证状态
 */
export const test = base.extend<{
  loginPage: LoginPage;
  dashboardPage: DashboardPage;
  userManagementPage: UserManagementPage;
  roleManagementPage: RoleManagementPage;
  auditLogPage: AuditLogPage;
  authenticatedPage: {
    admin: LoginPage;
    userAdmin: LoginPage;
    regularUser: LoginPage;
  };
}>({
  // 页面对象夹具
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },
  
  dashboardPage: async ({ page }, use) => {
    await use(new DashboardPage(page));
  },
  
  userManagementPage: async ({ page }, use) => {
    await use(new UserManagementPage(page));
  },
  
  roleManagementPage: async ({ page }, use) => {
    await use(new RoleManagementPage(page));
  },
  
  auditLogPage: async ({ page }, use) => {
    await use(new AuditLogPage(page));
  },

  // 预认证页面夹具
  authenticatedPage: async ({ page }, use) => {
    const result = {
      admin: new LoginPage(page),
      userAdmin: new LoginPage(page),
      regularUser: new LoginPage(page),
    };

    // 管理员认证
    await page.goto('/login');
    const adminLogin = new LoginPage(page);
    await adminLogin.login(TestUsers.admin);
    await new DashboardPage(page).waitForLoad();
    result.admin = adminLogin;

    await use(result);
  },
});

/**
 * 测试工具函数
 */
export class TestUtils {
  /**
   * 等待并验证成功消息
   */
  static async expectSuccessMessage(page: any, expectedMessage?: string) {
    const successMessage = page.locator('[data-testid="success-message"]');
    await expect(successMessage).toBeVisible();
    if (expectedMessage) {
      await expect(successMessage).toContainText(expectedMessage);
    }
  }

  /**
   * 等待并验证错误消息
   */
  static async expectErrorMessage(page: any, expectedMessage?: string) {
    const errorMessage = page.locator('[data-testid="error-message"]');
    await expect(errorMessage).toBeVisible();
    if (expectedMessage) {
      await expect(errorMessage).toContainText(expectedMessage);
    }
  }

  /**
   * 等待加载状态完成
   */
  static async waitForLoadingComplete(page: any) {
    const loadingSpinner = page.locator('[data-testid="loading-spinner"]');
    if (await loadingSpinner.isVisible()) {
      await loadingSpinner.waitFor({ state: 'hidden', timeout: 30000 });
    }
  }

  /**
   * 获取随机字符串
   */
  static getRandomString(length: number = 10): string {
    return Math.random().toString(36).substring(2, length + 2);
  }

  /**
   * 获取随机邮箱
   */
  static getRandomEmail(): string {
    return `test-${this.getRandomString()}@example.com`;
  }

  /**
   * 获取随机用户名
   */
  static getRandomUsername(): string {
    return `testuser_${this.getRandomString()}`;
  }

  /**
   * 等待网络请求完成
   */
  static async waitForNetworkIdle(page: any, timeout: number = 10000) {
    await page.waitForLoadState('networkidle', { timeout });
  }

  /**
   * 模拟网络错误
   */
  static async simulateNetworkError(page: any, urlPattern: string) {
    await page.route(urlPattern, route => route.abort());
  }

  /**
   * 模拟服务器错误
   */
  static async simulateServerError(page: any, urlPattern: string, status: number = 500) {
    await page.route(urlPattern, route => 
      route.fulfill({
        status,
        body: JSON.stringify({ message: '服务器内部错误' })
      })
    );
  }

  /**
   * 模拟延迟响应
   */
  static async simulateDelay(page: any, urlPattern: string, delay: number) {
    await page.route(urlPattern, async route => {
      await new Promise(resolve => setTimeout(resolve, delay));
      await route.continue();
    });
  }

  /**
   * 验证分页功能
   */
  static async verifyPagination(page: any, itemSelector: string, expectedCountPerPage: number = 10) {
    const items = page.locator(itemSelector);
    const initialCount = await items.count();
    
    expect(initialCount).toBeLessThanOrEqual(expectedCountPerPage);
    
    const nextPageButton = page.locator('[data-testid="next-page-button"]');
    if (await nextPageButton.isVisible()) {
      await nextPageButton.click();
      await this.waitForNetworkIdle(page);
      
      const newItems = page.locator(itemSelector);
      const newCount = await newItems.count();
      
      // 验证页面内容发生变化
      expect(newCount).toBeGreaterThan(0);
    }
  }

  /**
   * 验证搜索功能
   */
  static async verifySearchFunctionality(
    page: any, 
    searchInputSelector: string, 
    itemSelector: string, 
    searchTerm: string
  ) {
    const searchInput = page.locator(searchInputSelector);
    const items = page.locator(itemSelector);
    
    const initialCount = await items.count();
    
    await searchInput.fill(searchTerm);
    await page.keyboard.press('Enter');
    await this.waitForNetworkIdle(page);
    
    const filteredItems = page.locator(itemSelector);
    const filteredCount = await filteredItems.count();
    
    expect(filteredCount).toBeLessThanOrEqual(initialCount);
    
    // 如果有结果，验证搜索词匹配
    if (filteredCount > 0) {
      const firstItem = filteredItems.first();
      const itemText = await firstItem.textContent();
      expect(itemText?.toLowerCase()).toContain(searchTerm.toLowerCase());
    }
  }

  /**
   * 验证过滤功能
   */
  static async verifyFilterFunctionality(
    page: any,
    filterButtonSelector: string,
    filterOptionSelector: string,
    itemSelector: string
  ) {
    const items = page.locator(itemSelector);
    const initialCount = await items.count();
    
    await page.click(filterButtonSelector);
    await page.click(filterOptionSelector);
    await this.waitForNetworkIdle(page);
    
    const filteredItems = page.locator(itemSelector);
    const filteredCount = await filteredItems.count();
    
    expect(filteredCount).toBeLessThanOrEqual(initialCount);
  }

  /**
   * 验证排序功能
   */
  static async verifySortingFunctionality(
    page: any,
    sortButtonSelector: string,
    itemSelector: string,
    getTextFunction: (element: any) => Promise<string>
  ) {
    const items = page.locator(itemSelector);
    
    // 获取初始排序
    const initialTexts: string[] = [];
    const itemCount = Math.min(await items.count(), 5);
    
    for (let i = 0; i < itemCount; i++) {
      const text = await getTextFunction(items.nth(i));
      initialTexts.push(text);
    }
    
    // 点击排序
    await page.click(sortButtonSelector);
    await this.waitForNetworkIdle(page);
    
    // 获取排序后的文本
    const sortedTexts: string[] = [];
    for (let i = 0; i < itemCount; i++) {
      const text = await getTextFunction(items.nth(i));
      sortedTexts.push(text);
    }
    
    // 验证排序发生变化
    expect(sortedTexts).not.toEqual(initialTexts);
  }

  /**
   * 验证表单验证
   */
  static async verifyFormValidation(
    page: any,
    submitButtonSelector: string,
    expectedErrors: Array<{selector: string, message: string}>
  ) {
    await page.click(submitButtonSelector);
    
    for (const error of expectedErrors) {
      const errorElement = page.locator(error.selector);
      await expect(errorElement).toBeVisible();
      await expect(errorElement).toContainText(error.message);
    }
  }

  /**
   * 验证模态框操作
   */
  static async verifyModalOperation(
    page: any,
    openButtonSelector: string,
    modalSelector: string,
    submitButtonSelector: string,
    successMessageSelector: string
  ) {
    await page.click(openButtonSelector);
    await expect(page.locator(modalSelector)).toBeVisible();
    
    await page.click(submitButtonSelector);
    await expect(page.locator(successMessageSelector)).toBeVisible();
    await expect(page.locator(modalSelector)).toBeHidden();
  }

  /**
   * 验证批量操作
   */
  static async verifyBulkOperation(
    page: any,
    checkboxSelector: string,
    actionButtonSelector: string,
    confirmationButtonSelector: string,
    successMessageSelector: string
  ) {
    const checkboxes = page.locator(checkboxSelector);
    const count = await checkboxes.count();
    
    if (count > 1) {
      await checkboxes.first().click();
      await checkboxes.nth(1).click();
      
      await page.click(actionButtonSelector);
      await page.click(confirmationButtonSelector);
      
      await expect(page.locator(successMessageSelector)).toBeVisible();
    }
  }

  /**
   * 验证导出功能
   */
  static async verifyExportFunctionality(
    page: any,
    exportButtonSelector: string,
    expectedFileType: string
  ) {
    const downloadPromise = page.waitForEvent('download');
    await page.click(exportButtonSelector);
    const download = await downloadPromise;
    
    expect(download.suggestedFilename()).toMatch(new RegExp(`\\.${expectedFileType}$`));
    
    return download;
  }

  /**
   * 验证文件上传功能
   */
  static async verifyFileUpload(
    page: any,
    fileInputSelector: string,
    submitButtonSelector: string,
    filePath: string,
    successMessageSelector: string
  ) {
    await page.setInputFiles(fileInputSelector, filePath);
    await page.click(submitButtonSelector);
    
    await expect(page.locator(successMessageSelector)).toBeVisible();
  }
}

/**
 * 自定义匹配器
 */
expect.extend({
  /**
   * 验证元素包含有效的日期
   */
  toHaveValidDate(received: any) {
    const textContent = received.textContent();
    const date = new Date(textContent);
    
    if (isNaN(date.getTime())) {
      return {
        message: () => `Expected element to have valid date, but got: ${textContent}`,
        pass: false,
      };
    }
    
    return {
      message: () => `Expected element not to have valid date, but got: ${textContent}`,
      pass: true,
    };
  },

  /**
   * 验证元素包含有效的邮箱地址
   */
  toHaveValidEmail(received: any) {
    const textContent = received.textContent();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    
    if (!emailRegex.test(textContent)) {
      return {
        message: () => `Expected element to have valid email, but got: ${textContent}`,
        pass: false,
      };
    }
    
    return {
      message: () => `Expected element not to have valid email, but got: ${textContent}`,
      pass: true,
    };
  },

  /**
   * 验证元素包含有效的URL
   */
  toHaveValidUrl(received: any) {
    const textContent = received.textContent();
    try {
      new URL(textContent);
      return {
        message: () => `Expected element not to have valid URL, but got: ${textContent}`,
        pass: true,
      };
    } catch {
      return {
        message: () => `Expected element to have valid URL, but got: ${textContent}`,
        pass: false,
      };
    }
  },
});

export { expect };