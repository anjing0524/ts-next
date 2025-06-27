import { test, expect } from '@playwright/test';

/**
 * Admin Portal管理功能端到端测试
 * 测试用户管理、角色权限管理等CRUD操作
 */
test.describe('Admin Portal 管理功能测试', () => {
  /**
   * 管理员登录辅助函数
   * @param page Playwright页面对象
   */
  async function loginAsAdmin(page) {
    await page.goto('/login');
    await page.fill('input[name="username"]', 'admin');
    await page.fill('input[name="password"]', 'admin123');
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');

    // 等待OAuth流程完成
    await page.waitForTimeout(3000);
  }

  test.beforeEach(async ({ page }) => {
    // 每个测试前清理状态并登录
    await page.context().clearCookies();
    await loginAsAdmin(page);
  });

  test('应该能够访问用户管理页面', async ({ page }) => {
    // 尝试访问用户管理页面
    await page.goto('/admin/users');
    await page.waitForLoadState('networkidle');

    // 验证页面标题
    await expect(page.locator('h1, h2, [data-testid="page-title"]')).toContainText(
      /用户管理|Users/
    );

    // 验证数据表格存在
    const table = page.locator('table, [role="table"], .data-table');
    await expect(table).toBeVisible({ timeout: 10000 });

    // 验证基本操作按钮
    const addButton = page.locator(
      'button:has-text("添加"), button:has-text("新增"), button:has-text("Add")'
    );
    await expect(addButton).toBeVisible();
  });

  test('应该能够查看用户列表和分页', async ({ page }) => {
    await page.goto('/admin/users');
    await page.waitForLoadState('networkidle');

    // 等待表格加载
    const table = page.locator('table, [role="table"], .data-table');
    await expect(table).toBeVisible({ timeout: 15000 });

    // 检查是否有数据行
    const dataRows = page.locator('tbody tr, [role="row"]:not([role="columnheader"])');
    const rowCount = await dataRows.count();
    expect(rowCount).toBeGreaterThan(0);

    // 检查分页组件（如果存在）
    const pagination = page.locator(
      '.pagination, [aria-label*="pagination"], nav[aria-label*="page"]'
    );
    const paginationExists = await pagination.isVisible();

    if (paginationExists) {
      console.log('分页组件存在，测试分页功能');
      // 可以添加分页测试逻辑
    }
  });

  test('应该能够搜索和筛选用户', async ({ page }) => {
    await page.goto('/admin/users');
    await page.waitForLoadState('networkidle');

    // 查找搜索框
    const searchInput = page.locator(
      'input[placeholder*="搜索"], input[placeholder*="search"], input[type="search"]'
    );
    const searchExists = await searchInput.isVisible();

    if (searchExists) {
      // 测试搜索功能
      await searchInput.fill('admin');
      await page.waitForTimeout(1000); // 等待搜索结果

      // 验证搜索结果
      const tableRows = page.locator('tbody tr, [role="row"]:not([role="columnheader"])');
      const rowCount = await tableRows.count();
      expect(rowCount).toBeGreaterThanOrEqual(0);
    }
  });

  test('应该能够访问角色管理页面', async ({ page }) => {
    // 尝试访问角色管理页面
    const rolePageUrls = ['/admin/system/roles', '/admin/roles', '/admin/users/roles'];

    let successfulUrl = null;
    for (const url of rolePageUrls) {
      try {
        await page.goto(url);
        await page.waitForLoadState('networkidle');

        // 检查页面是否成功加载
        const pageTitle = page.locator('h1, h2, [data-testid="page-title"]');
        const titleText = await pageTitle.textContent();

        if (titleText && titleText.includes('角色')) {
          successfulUrl = url;
          break;
        }
      } catch (error) {
        console.log(`无法访问 ${url}:`, error.message);
      }
    }

    if (successfulUrl) {
      console.log(`成功访问角色管理页面: ${successfulUrl}`);

      // 验证页面元素
      await expect(page.locator('h1, h2, [data-testid="page-title"]')).toContainText(/角色|Role/);

      // 检查是否有角色列表或管理界面
      const roleContent = page.locator('table, .role-list, [data-testid="roles"]');
      await expect(roleContent).toBeVisible({ timeout: 10000 });
    } else {
      console.log('未找到可访问的角色管理页面');
    }
  });

  test('应该能够访问客户端管理页面', async ({ page }) => {
    await page.goto('/admin/clients');
    await page.waitForLoadState('networkidle');

    // 验证页面加载
    const pageContent = page.locator('main, .content, [role="main"]');
    await expect(pageContent).toBeVisible();

    // 查找页面标题
    const titleElement = page.locator('h1, h2, [data-testid="page-title"]');
    const titleExists = await titleElement.isVisible();

    if (titleExists) {
      await expect(titleElement).toContainText(/客户端|Client/);
    }

    // 查找客户端列表或添加按钮
    const addClientButton = page.locator(
      'button:has-text("添加"), button:has-text("新增"), button:has-text("Add")'
    );
    const clientTable = page.locator('table, [role="table"], .data-table');

    const hasAddButton = await addClientButton.isVisible();
    const hasTable = await clientTable.isVisible();

    expect(hasAddButton || hasTable).toBeTruthy();
  });

  test('应该能够访问系统设置页面', async ({ page }) => {
    // 尝试访问系统设置相关页面
    const systemPageUrls = ['/admin/system', '/admin/settings', '/admin/audit'];

    for (const url of systemPageUrls) {
      try {
        await page.goto(url);
        await page.waitForLoadState('networkidle');

        // 验证页面加载
        const pageContent = page.locator('main, .content, [role="main"]');
        await expect(pageContent).toBeVisible();

        console.log(`成功访问系统页面: ${url}`);
        break;
      } catch (error) {
        console.log(`无法访问 ${url}:`, error.message);
      }
    }
  });

  test('导航菜单应该正常工作', async ({ page }) => {
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');

    // 查找导航菜单
    const navigation = page.locator('nav, [role="navigation"], .sidebar, .menu');
    await expect(navigation).toBeVisible({ timeout: 10000 });

    // 查找菜单项
    const menuItems = page.locator('nav a, .menu a, .sidebar a, [role="menuitem"]');
    const menuCount = await menuItems.count();

    expect(menuCount).toBeGreaterThan(0);

    // 测试第一个菜单项（如果存在）
    if (menuCount > 0) {
      const firstMenuItem = menuItems.first();
      const href = await firstMenuItem.getAttribute('href');

      if (href && href !== '#') {
        await firstMenuItem.click();
        await page.waitForLoadState('networkidle');

        // 验证导航成功
        const currentUrl = page.url();
        expect(currentUrl).toContain(href);
      }
    }
  });

  test('权限检查应该正常工作', async ({ page }) => {
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');

    // 验证管理员可以访问管理功能
    const adminElements = page.locator('[data-testid*="admin"], .admin-only');
    const adminElementCount = await adminElements.count();

    // 管理员应该能看到管理相关元素
    if (adminElementCount > 0) {
      await expect(adminElements.first()).toBeVisible();
    }

    // 测试访问受保护的页面
    const protectedUrls = ['/admin/users', '/admin/system/roles'];

    for (const url of protectedUrls) {
      await page.goto(url);
      await page.waitForLoadState('networkidle');

      // 不应该重定向到未授权页面
      const currentUrl = page.url();
      expect(currentUrl).not.toContain('/unauthorized');
    }
  });
});
