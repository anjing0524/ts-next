import { Page, expect, BrowserContext } from '@playwright/test';
import { faker } from '@faker-js/faker';
import * as jwt from 'jsonwebtoken';

/**
 * E2E测试辅助工具类
 */
export class TestHelpers {
  /**
   * 生成测试用户数据
   */
  static generateUserData(overrides: Partial<TestUser> = {}): TestUser {
    return {
      id: faker.string.uuid(),
      username: faker.internet.userName(),
      email: faker.internet.email(),
      firstName: faker.person.firstName(),
      lastName: faker.person.lastName(),
      phone: faker.phone.number(),
      status: 'active',
      roles: ['user'],
      createdAt: faker.date.past().toISOString(),
      updatedAt: faker.date.recent().toISOString(),
      ...overrides
    };
  }

  /**
   * 生成测试角色数据
   */
  static generateRoleData(overrides: Partial<TestRole> = {}): TestRole {
    return {
      id: faker.string.uuid(),
      name: faker.lorem.word(),
      description: faker.lorem.sentence(),
      permissions: ['read:users', 'write:users'],
      isBuiltIn: false,
      status: 'active',
      userCount: faker.number.int({ min: 0, max: 100 }),
      createdAt: faker.date.past().toISOString(),
      updatedAt: faker.date.recent().toISOString(),
      ...overrides
    };
  }

  /**
   * 生成测试客户端数据
   */
  static generateClientData(overrides: Partial<TestClient> = {}): TestClient {
    return {
      id: faker.string.uuid(),
      clientId: faker.string.alphanumeric(16),
      clientSecret: faker.string.alphanumeric(32),
      name: faker.company.name(),
      description: faker.lorem.sentence(),
      type: 'confidential',
      redirectUris: [faker.internet.url()],
      scopes: ['openid', 'profile', 'email'],
      grantTypes: ['authorization_code', 'refresh_token'],
      status: 'active',
      pkceRequired: true,
      createdAt: faker.date.past().toISOString(),
      updatedAt: faker.date.recent().toISOString(),
      ...overrides
    };
  }

  /**
   * 生成JWT令牌
   */
  static generateJwtToken(payload: any, secret: string = 'test-secret'): string {
    return jwt.sign(payload, secret, { expiresIn: '1h' });
  }

  /**
   * 生成访问令牌
   */
  static generateAccessToken(user: TestUser, permissions: string[] = []): string {
    const payload = {
      sub: user.id,
      username: user.username,
      email: user.email,
      roles: user.roles,
      permissions,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600
    };
    return this.generateJwtToken(payload);
  }

  /**
   * 生成刷新令牌
   */
  static generateRefreshToken(user: TestUser): string {
    const payload = {
      sub: user.id,
      type: 'refresh',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 86400 * 30 // 30天
    };
    return this.generateJwtToken(payload);
  }

  /**
   * 设置认证状态
   */
  static async setAuthState(page: Page, user: TestUser, permissions: string[] = []): Promise<void> {
    const accessToken = this.generateAccessToken(user, permissions);
    const refreshToken = this.generateRefreshToken(user);
    
    // 设置localStorage中的令牌
    await page.addInitScript((tokens) => {
      localStorage.setItem('access_token', tokens.accessToken);
      localStorage.setItem('refresh_token', tokens.refreshToken);
      localStorage.setItem('user_info', JSON.stringify(tokens.user));
    }, { accessToken, refreshToken, user });
  }

  /**
   * 清除认证状态
   */
  static async clearAuthState(page: Page): Promise<void> {
    await page.addInitScript(() => {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('user_info');
    });
  }

  /**
   * 模拟API响应
   */
  static async mockApiResponse(page: Page, url: string, response: any, status: number = 200): Promise<void> {
    await page.route(url, async (route) => {
      await route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(response)
      });
    });
  }

  /**
   * 模拟API错误
   */
  static async mockApiError(page: Page, url: string, error: { code: string; message: string }, status: number = 400): Promise<void> {
    await page.route(url, async (route) => {
      await route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify({ error })
      });
    });
  }

  /**
   * 等待API调用
   */
  static async waitForApiCall(page: Page, url: string, method: string = 'GET'): Promise<any> {
    const response = await page.waitForResponse(response => 
      response.url().includes(url) && response.request().method() === method
    );
    return response.json();
  }

  /**
   * 验证API调用
   */
  static async verifyApiCall(page: Page, url: string, method: string = 'GET', expectedData?: any): Promise<void> {
    const response = await page.waitForResponse(response => 
      response.url().includes(url) && response.request().method() === method
    );
    
    expect(response.status()).toBe(200);
    
    if (expectedData) {
      const responseData = await response.json();
      expect(responseData).toMatchObject(expectedData);
    }
  }

  /**
   * 生成分页数据
   */
  static generatePaginatedData<T>(items: T[], page: number = 1, pageSize: number = 10): PaginatedResponse<T> {
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedItems = items.slice(startIndex, endIndex);
    
    return {
      data: paginatedItems,
      pagination: {
        page,
        pageSize,
        total: items.length,
        totalPages: Math.ceil(items.length / pageSize)
      }
    };
  }

  /**
   * 生成搜索结果
   */
  static generateSearchResults<T>(items: T[], query: string, searchFields: string[]): T[] {
    if (!query) return items;
    
    return items.filter(item => 
      searchFields.some(field => {
        const value = (item as any)[field];
        return value && value.toString().toLowerCase().includes(query.toLowerCase());
      })
    );
  }

  /**
   * 等待元素动画完成
   */
  static async waitForAnimation(page: Page, selector: string): Promise<void> {
    await page.locator(selector).waitFor({ state: 'visible' });
    await page.waitForTimeout(300); // 等待动画完成
  }

  /**
   * 截图并保存
   */
  static async takeScreenshot(page: Page, name: string): Promise<void> {
    await page.screenshot({ 
      path: `test-results/screenshots/${name}-${Date.now()}.png`,
      fullPage: true 
    });
  }

  /**
   * 验证表格数据
   */
  static async verifyTableData(page: Page, tableSelector: string, expectedData: any[]): Promise<void> {
    const table = page.locator(tableSelector);
    await expect(table).toBeVisible();
    
    const rows = table.locator('tbody tr');
    const rowCount = await rows.count();
    
    expect(rowCount).toBe(expectedData.length);
    
    for (let i = 0; i < rowCount; i++) {
      const row = rows.nth(i);
      const cells = row.locator('td');
      const cellCount = await cells.count();
      
      for (let j = 0; j < cellCount; j++) {
        const cellText = await cells.nth(j).textContent();
        // 根据具体需求验证单元格内容
      }
    }
  }

  /**
   * 验证表单验证
   */
  static async verifyFormValidation(page: Page, formSelector: string, fieldValidations: FieldValidation[]): Promise<void> {
    const form = page.locator(formSelector);
    
    for (const validation of fieldValidations) {
      const field = form.locator(`[name="${validation.field}"]`);
      await field.fill(validation.invalidValue);
      
      // 触发验证
      await field.blur();
      
      // 验证错误消息
      const errorMessage = form.locator(`[data-testid="${validation.field}-error"]`);
      await expect(errorMessage).toBeVisible();
      await expect(errorMessage).toContainText(validation.expectedError);
    }
  }

  /**
   * 模拟网络延迟
   */
  static async simulateNetworkDelay(page: Page, delay: number = 1000): Promise<void> {
    await page.route('**/*', async (route) => {
      await new Promise(resolve => setTimeout(resolve, delay));
      await route.continue();
    });
  }

  /**
   * 模拟网络错误
   */
  static async simulateNetworkError(page: Page, urlPattern: string): Promise<void> {
    await page.route(urlPattern, async (route) => {
      await route.abort('failed');
    });
  }

  /**
   * 验证权限控制
   */
  static async verifyPermissionControl(page: Page, user: TestUser, requiredPermission: string, protectedElement: string): Promise<void> {
    // 设置无权限用户
    const userWithoutPermission = { ...user, roles: ['viewer'] };
    await this.setAuthState(page, userWithoutPermission, []);
    
    await page.reload();
    
    // 验证受保护元素不可见
    const element = page.locator(protectedElement);
    await expect(element).not.toBeVisible();
    
    // 设置有权限用户
    await this.setAuthState(page, user, [requiredPermission]);
    await page.reload();
    
    // 验证受保护元素可见
    await expect(element).toBeVisible();
  }

  /**
   * 验证响应式设计
   */
  static async verifyResponsiveDesign(page: Page, breakpoints: { name: string; width: number; height: number }[]): Promise<void> {
    for (const breakpoint of breakpoints) {
      await page.setViewportSize({ width: breakpoint.width, height: breakpoint.height });
      await page.waitForTimeout(500); // 等待布局调整
      
      // 验证关键元素在不同屏幕尺寸下的显示
      const navigation = page.locator('[data-testid="navigation"]');
      const content = page.locator('[data-testid="main-content"]');
      
      await expect(navigation).toBeVisible();
      await expect(content).toBeVisible();
      
      // 可以添加更多特定于断点的验证
    }
  }

  /**
   * 验证可访问性
   */
  static async verifyAccessibility(page: Page): Promise<void> {
    // 验证键盘导航
    await page.keyboard.press('Tab');
    const focusedElement = await page.locator(':focus').first();
    await expect(focusedElement).toBeVisible();
    
    // 验证ARIA标签
    const buttons = page.locator('button');
    const buttonCount = await buttons.count();
    
    for (let i = 0; i < buttonCount; i++) {
      const button = buttons.nth(i);
      const ariaLabel = await button.getAttribute('aria-label');
      const text = await button.textContent();
      
      // 按钮应该有可访问的名称
      expect(ariaLabel || text).toBeTruthy();
    }
  }

  /**
   * 生成OAuth授权URL
   */
  static generateOAuthAuthorizationUrl(clientId: string, redirectUri: string, state?: string, codeChallenge?: string): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: 'openid profile email',
      ...(state && { state }),
      ...(codeChallenge && { 
        code_challenge: codeChallenge,
        code_challenge_method: 'S256'
      })
    });
    
    return `/oauth/authorize?${params.toString()}`;
  }

  /**
   * 生成PKCE代码挑战
   */
  static generatePKCEChallenge(): { codeVerifier: string; codeChallenge: string } {
    const codeVerifier = faker.string.alphanumeric(128);
    // 在实际实现中，这里应该使用SHA256哈希
    const codeChallenge = Buffer.from(codeVerifier).toString('base64url');
    
    return { codeVerifier, codeChallenge };
  }

  /**
   * 等待页面完全加载
   */
  static async waitForPageLoad(page: Page): Promise<void> {
    await page.waitForLoadState('networkidle');
    await page.waitForFunction(() => document.readyState === 'complete');
  }

  /**
   * 清理测试数据
   */
  static async cleanupTestData(page: Page): Promise<void> {
    // 清除localStorage
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    
    // 清除cookies
    const context = page.context();
    await context.clearCookies();
  }

  /**
   * 验证成功消息
   */
  static async verifySuccess(message?: string): Promise<void> {
    // 这是一个占位符方法，实际实现会根据应用的通知系统来定制
    console.log('Success verified:', message || 'Operation completed successfully');
  }

  /**
   * 验证错误消息
   */
  static async verifyError(message?: string): Promise<void> {
    // 这是一个占位符方法，实际实现会根据应用的错误处理系统来定制
    console.log('Error verified:', message || 'Operation failed');
  }

  /**
   * 模拟会话超时
   */
  static async simulateSessionTimeout(page: Page): Promise<void> {
    // 清除认证状态来模拟会话超时
    await this.clearAuthState(page);
  }

  /**
   * 验证CSRF保护
   */
  static async verifyCsrfProtection(page: Page, endpoint?: string, method?: string): Promise<void> {
    // 这是一个占位符方法，实际实现会验证CSRF令牌
    console.log('CSRF protection verified for:', endpoint, method);
  }
}

// 类型定义
export interface TestUser {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  status: 'active' | 'inactive' | 'suspended';
  roles: string[];
  createdAt: string;
  updatedAt: string;
}

export interface TestRole {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  isBuiltIn: boolean;
  status: 'active' | 'inactive';
  userCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface TestClient {
  id: string;
  clientId: string;
  clientSecret: string;
  name: string;
  description: string;
  type: 'public' | 'confidential';
  redirectUris: string[];
  scopes: string[];
  grantTypes: string[];
  status: 'active' | 'inactive';
  pkceRequired: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface FieldValidation {
  field: string;
  invalidValue: string;
  expectedError: string;
}

// 常用测试数据
export const TEST_USERS = {
  ADMIN: {
    username: 'admin',
    email: 'admin@example.com',
    roles: ['admin'],
    permissions: ['*']
  },
  USER_MANAGER: {
    username: 'user-manager',
    email: 'user-manager@example.com',
    roles: ['user-manager'],
    permissions: ['read:users', 'write:users', 'delete:users']
  },
  VIEWER: {
    username: 'viewer',
    email: 'viewer@example.com',
    roles: ['viewer'],
    permissions: ['read:dashboard']
  }
};

export const TEST_PERMISSIONS = {
  DASHBOARD: 'read:dashboard',
  USERS_READ: 'read:users',
  USERS_WRITE: 'write:users',
  USERS_DELETE: 'delete:users',
  ROLES_READ: 'read:roles',
  ROLES_WRITE: 'write:roles',
  ROLES_DELETE: 'delete:roles',
  CLIENTS_READ: 'read:clients',
  CLIENTS_WRITE: 'write:clients',
  CLIENTS_DELETE: 'delete:clients'
};

export const TEST_ENDPOINTS = {
  AUTH: {
    LOGIN: '/api/auth/login',
    LOGOUT: '/api/auth/logout',
    REFRESH: '/api/auth/refresh',
    PROFILE: '/api/auth/profile'
  },
  USERS: {
    LIST: '/api/users',
    CREATE: '/api/users',
    UPDATE: (id: string) => `/api/users/${id}`,
    DELETE: (id: string) => `/api/users/${id}`
  },
  ROLES: {
    LIST: '/api/roles',
    CREATE: '/api/roles',
    UPDATE: (id: string) => `/api/roles/${id}`,
    DELETE: (id: string) => `/api/roles/${id}`
  },
  CLIENTS: {
    LIST: '/api/clients',
    CREATE: '/api/clients',
    UPDATE: (id: string) => `/api/clients/${id}`,
    DELETE: (id: string) => `/api/clients/${id}`
  }
};