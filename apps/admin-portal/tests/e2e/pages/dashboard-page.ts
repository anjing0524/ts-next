import { Page, expect } from '@playwright/test';
import { BasePage } from './base-page';

/**
 * 仪表盘页面对象类
 */
export class DashboardPage extends BasePage {
  // 页面元素选择器
  private readonly pageTitle = '[data-testid="dashboard-title"], h1, .dashboard-title';
  private readonly userWelcome = '[data-testid="user-welcome"], .user-welcome, .welcome-message';
  private readonly navigationMenu = '[data-testid="nav-menu"], .nav-menu, nav';
  private readonly sidebarMenu = '[data-testid="sidebar"], .sidebar, aside';
  private readonly logoutButton = '[data-testid="logout-button"], button:has-text("退出"), .logout-btn';
  private readonly userMenu = '[data-testid="user-menu"], .user-menu, .user-dropdown';
  private readonly dashboardCards = '[data-testid="dashboard-card"], .dashboard-card, .stat-card';
  private readonly quickActions = '[data-testid="quick-actions"], .quick-actions';
  
  // 导航菜单项
  private readonly menuItems = {
    users: '[data-testid="menu-users"], a[href*="/admin/users"], .menu-users',
    roles: '[data-testid="menu-roles"], a[href*="/admin/roles"], .menu-roles',
    clients: '[data-testid="menu-clients"], a[href*="/admin/clients"], .menu-clients',
    profile: '[data-testid="menu-profile"], a[href*="/profile"], .menu-profile'
  };

  constructor(page: Page) {
    super(page);
  }

  /**
   * 导航到仪表盘页面
   */
  async goto(): Promise<void> {
    await super.goto('/dashboard');
    await this.waitForLoad();
  }

  /**
   * 验证仪表盘页面已加载
   */
  async verifyPageLoaded(): Promise<void> {
    await this.waitForElement(this.pageTitle);
    await this.waitForLoadingComplete();
    
    // 验证关键元素存在
    await expect(this.page.locator(this.navigationMenu)).toBeVisible();
  }

  /**
   * 验证用户已成功登录
   * @param expectedUsername 期望的用户名
   */
  async verifyUserLoggedIn(expectedUsername?: string): Promise<void> {
    // 验证JWT令牌存在
    await this.verifyTokenExists();
    
    // 验证用户欢迎信息
    const welcomeElement = this.page.locator(this.userWelcome);
    if (await welcomeElement.isVisible()) {
      if (expectedUsername) {
        const welcomeText = await this.getText(this.userWelcome);
        expect(welcomeText).toContain(expectedUsername);
      }
    }
    
    // 验证当前URL是dashboard
    expect(this.getCurrentUrl()).toContain('/dashboard');
  }

  /**
   * 验证页面标题
   */
  async verifyPageTitle(): Promise<void> {
    const title = await this.getTitle();
    expect(title).toMatch(/仪表盘|Dashboard|管理后台/);
  }

  /**
   * 验证导航菜单根据权限显示
   * @param expectedMenuItems 期望显示的菜单项
   */
  async verifyNavigationMenu(expectedMenuItems: string[]): Promise<void> {
    await this.waitForElement(this.navigationMenu);
    
    for (const menuItem of expectedMenuItems) {
      const menuSelector = this.menuItems[menuItem as keyof typeof this.menuItems];
      if (menuSelector) {
        await expect(this.page.locator(menuSelector)).toBeVisible();
      }
    }
  }

  /**
   * 验证管理员权限菜单
   */
  async verifyAdminMenu(): Promise<void> {
    const adminMenuItems = ['users', 'roles', 'clients'];
    await this.verifyNavigationMenu(adminMenuItems);
  }

  /**
   * 验证普通用户权限菜单
   */
  async verifyUserMenu(): Promise<void> {
    const userMenuItems = ['profile'];
    await this.verifyNavigationMenu(userMenuItems);
    
    // 验证管理员菜单不显示
    const adminMenuItems = ['users', 'roles', 'clients'];
    for (const menuItem of adminMenuItems) {
      const menuSelector = this.menuItems[menuItem as keyof typeof this.menuItems];
      if (menuSelector) {
        await expect(this.page.locator(menuSelector)).not.toBeVisible();
      }
    }
  }

  /**
   * 点击导航菜单项
   * @param menuItem 菜单项名称
   */
  async clickMenuItem(menuItem: keyof typeof this.menuItems): Promise<void> {
    const menuSelector = this.menuItems[menuItem];
    await this.click(menuSelector);
  }

  /**
   * 导航到用户管理页面
   */
  async navigateToUsers(): Promise<void> {
    await this.clickMenuItem('users');
    await this.waitForUrl('/admin/users');
  }

  /**
   * 导航到角色管理页面
   */
  async navigateToRoles(): Promise<void> {
    await this.clickMenuItem('roles');
    await this.waitForUrl('/admin/roles');
  }

  /**
   * 导航到客户端管理页面
   */
  async navigateToClients(): Promise<void> {
    await this.clickMenuItem('clients');
    await this.waitForUrl('/admin/clients');
  }

  /**
   * 导航到个人资料页面
   */
  async navigateToProfile(): Promise<void> {
    await this.clickMenuItem('profile');
    await this.waitForUrl('/profile');
  }

  /**
   * 执行退出登录
   */
  async logout(): Promise<void> {
    // 尝试点击用户菜单（如果存在）
    const userMenuElement = this.page.locator(this.userMenu);
    if (await userMenuElement.isVisible()) {
      await this.click(this.userMenu);
      await this.page.waitForTimeout(500); // 等待下拉菜单展开
    }
    
    // 点击退出按钮
    await this.click(this.logoutButton);
    
    // 验证重定向到登录页面
    await this.waitForUrl('/auth/login');
    
    // 验证localStorage被清空
    const accessToken = await this.getLocalStorageItem('access_token');
    const refreshToken = await this.getLocalStorageItem('refresh_token');
    
    expect(accessToken).toBeNull();
    expect(refreshToken).toBeNull();
  }

  /**
   * 验证仪表盘统计卡片
   */
  async verifyDashboardCards(): Promise<void> {
    const cards = this.page.locator(this.dashboardCards);
    const cardCount = await cards.count();
    
    if (cardCount > 0) {
      // 验证每个卡片都有内容
      for (let i = 0; i < cardCount; i++) {
        const card = cards.nth(i);
        await expect(card).toBeVisible();
        
        const cardText = await card.textContent();
        expect(cardText?.trim()).toBeTruthy();
      }
    }
  }

  /**
   * 验证快捷操作区域
   */
  async verifyQuickActions(): Promise<void> {
    const quickActionsElement = this.page.locator(this.quickActions);
    
    if (await quickActionsElement.isVisible()) {
      // 验证快捷操作按钮可点击
      const actionButtons = quickActionsElement.locator('button, a');
      const buttonCount = await actionButtons.count();
      
      for (let i = 0; i < buttonCount; i++) {
        const button = actionButtons.nth(i);
        await expect(button).toBeVisible();
        await expect(button).toBeEnabled();
      }
    }
  }

  /**
   * 验证响应式布局
   */
  async verifyResponsiveLayout(): Promise<void> {
    // 测试移动端视口
    await this.page.setViewportSize({ width: 375, height: 667 });
    await this.page.waitForTimeout(500);
    
    // 验证移动端布局
    const sidebar = this.page.locator(this.sidebarMenu);
    if (await sidebar.isVisible()) {
      // 在移动端，侧边栏可能是隐藏的或者是折叠的
      // 这里的具体验证逻辑取决于实际的响应式设计
    }
    
    // 恢复桌面端视口
    await this.page.setViewportSize({ width: 1280, height: 720 });
    await this.page.waitForTimeout(500);
  }

  /**
   * 验证页面性能
   */
  async verifyPagePerformance(): Promise<void> {
    // 测量页面加载时间
    const startTime = Date.now();
    await this.goto();
    await this.verifyPageLoaded();
    const loadTime = Date.now() - startTime;
    
    // 验证页面加载时间小于2秒
    expect(loadTime).toBeLessThan(2000);
  }

  /**
   * 验证无权限访问保护
   */
  async verifyUnauthorizedAccess(): Promise<void> {
    // 清除令牌
    await this.clearLocalStorage();
    
    // 尝试访问dashboard
    await this.goto();
    
    // 应该被重定向到登录页面
    await this.waitForUrl('/auth/login');
    expect(this.getCurrentUrl()).toContain('/auth/login');
  }

  /**
   * 验证令牌自动刷新
   */
  async verifyTokenRefresh(): Promise<void> {
    // 模拟令牌即将过期
    await this.simulateTokenExpiry();
    
    // 执行需要认证的操作
    await this.page.reload();
    
    // 验证页面仍然可以正常访问（令牌应该被自动刷新）
    await this.verifyPageLoaded();
  }

  /**
   * 获取用户权限信息
   */
  async getUserPermissions(): Promise<string[]> {
    const accessToken = await this.getLocalStorageItem('access_token');
    
    if (!accessToken) {
      return [];
    }
    
    // 解析JWT令牌获取权限信息
    const permissions = await this.page.evaluate((token) => {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        return payload.permissions || [];
      } catch {
        return [];
      }
    }, accessToken);
    
    return permissions;
  }

  /**
   * 验证用户权限
   * @param expectedPermissions 期望的权限列表
   */
  async verifyUserPermissions(expectedPermissions: string[]): Promise<void> {
    const userPermissions = await this.getUserPermissions();
    
    for (const permission of expectedPermissions) {
      expect(userPermissions).toContain(permission);
    }
  }

  /**
   * 导航到仪表盘页面（别名方法）
   */
  async navigate(): Promise<void> {
    await this.goto();
  }

  /**
   * 验证仪表盘已加载（别名方法）
   */
  async verifyDashboardLoaded(): Promise<void> {
    await this.verifyPageLoaded();
  }

  /**
   * 验证登录成功（别名方法）
   */
  async verifyLoginSuccess(): Promise<void> {
    await this.verifyUserLoggedIn();
  }

  /**
   * 获取仪表盘统计数据
   */
  async getDashboardStats(): Promise<Record<string, string>> {
    const stats: Record<string, string> = {};
    const cards = this.page.locator(this.dashboardCards);
    const count = await cards.count();
    
    for (let i = 0; i < count; i++) {
      const card = cards.nth(i);
      const title = await card.locator('[data-testid="card-title"], .card-title, h3').textContent();
      const value = await card.locator('[data-testid="card-value"], .card-value, .stat-value').textContent();
      
      if (title && value) {
        stats[title.trim()] = value.trim();
      }
    }
    
    return stats;
  }

  /**
   * 验证统计卡片数据
   */
  async verifyStatsCards(expectedStats: Record<string, string>): Promise<void> {
    const actualStats = await this.getDashboardStats();
    
    for (const [key, expectedValue] of Object.entries(expectedStats)) {
      expect(actualStats[key]).toBe(expectedValue);
    }
  }

  /**
   * 点击快速操作按钮
   */
  async clickQuickAction(actionName: string): Promise<void> {
    const actionButton = this.page.locator(`[data-testid="quick-action-${actionName}"], button:has-text("${actionName}")`);
    await actionButton.click();
  }

  /**
   * 验证侧边栏状态
   */
  async verifySidebarState(shouldBeVisible: boolean): Promise<void> {
    const sidebar = this.page.locator(this.sidebarMenu);
    if (shouldBeVisible) {
      await expect(sidebar).toBeVisible();
    } else {
      await expect(sidebar).not.toBeVisible();
    }
  }

  /**
   * 切换侧边栏
   */
  async toggleSidebar(): Promise<void> {
    const toggleButton = this.page.locator('[data-testid="sidebar-toggle"], .sidebar-toggle, .menu-toggle');
    await toggleButton.click();
  }
}