import { test, expect } from '@playwright/test';
import { DashboardPage } from '../pages/dashboard-page';
import { LoginPage } from '../pages/login-page';
import { TestHelpers, TEST_USERS, TEST_PERMISSIONS } from '../utils/test-helpers';

test.describe('仪表盘功能', () => {
  let dashboardPage: DashboardPage;
  let loginPage: LoginPage;
  
  const adminUser = {
    ...TEST_USERS.ADMIN,
    firstName: '管理员',
    lastName: '用户',
    email: 'admin@example.com',
    roles: ['admin'],
    permissions: [
      TEST_PERMISSIONS.DASHBOARD_READ,
      TEST_PERMISSIONS.USER_READ,
      TEST_PERMISSIONS.ROLE_READ,
      TEST_PERMISSIONS.CLIENT_READ,
      TEST_PERMISSIONS.PROFILE_READ
    ]
  };
  
  const viewerUser = {
    ...TEST_USERS.VIEWER,
    firstName: '查看者',
    lastName: '用户',
    email: 'viewer@example.com',
    roles: ['viewer'],
    permissions: [
      TEST_PERMISSIONS.DASHBOARD_READ,
      TEST_PERMISSIONS.USER_READ,
      TEST_PERMISSIONS.PROFILE_READ
    ]
  };
  
  const dashboardStats = {
    totalUsers: 1250,
    activeUsers: 980,
    totalRoles: 15,
    totalClients: 45,
    todayLogins: 234,
    weeklyGrowth: 12.5,
    monthlyGrowth: 8.3,
    systemHealth: 'healthy'
  };
  
  const recentActivities = [
    {
      id: '1',
      type: 'user_login',
      user: '张三',
      action: '用户登录',
      timestamp: new Date().toISOString(),
      details: { ip: '192.168.1.100', device: 'Chrome on Windows' }
    },
    {
      id: '2',
      type: 'user_created',
      user: '管理员',
      action: '创建用户',
      timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      details: { targetUser: '李四', role: 'editor' }
    },
    {
      id: '3',
      type: 'role_updated',
      user: '管理员',
      action: '更新角色权限',
      timestamp: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
      details: { role: 'editor', permissions: ['user:read', 'user:write'] }
    },
    {
      id: '4',
      type: 'client_created',
      user: '管理员',
      action: '创建OAuth客户端',
      timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      details: { clientName: 'Mobile App', type: 'public' }
    },
    {
      id: '5',
      type: 'system_backup',
      user: '系统',
      action: '数据备份完成',
      timestamp: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      details: { size: '2.5GB', duration: '15分钟' }
    }
  ];
  
  const systemAlerts = [
    {
      id: '1',
      type: 'warning',
      title: '磁盘空间不足',
      message: '系统磁盘使用率已达85%，建议清理日志文件',
      timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      severity: 'medium'
    },
    {
      id: '2',
      type: 'info',
      title: '系统更新可用',
      message: '新版本 v2.1.0 已发布，包含安全更新和性能优化',
      timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      severity: 'low'
    }
  ];
  
  const chartData = {
    userGrowth: {
      labels: ['1月', '2月', '3月', '4月', '5月', '6月'],
      data: [100, 150, 200, 280, 350, 420]
    },
    loginActivity: {
      labels: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
      data: [45, 52, 48, 61, 55, 32, 28]
    },
    roleDistribution: {
      labels: ['管理员', '编辑者', '查看者', '客服'],
      data: [5, 25, 180, 40]
    }
  };

  test.beforeEach(async ({ page }) => {
    dashboardPage = new DashboardPage(page);
    loginPage = new LoginPage(page);
  });

  test('管理员仪表盘显示', async ({ page }) => {
    // 设置管理员认证状态
    await TestHelpers.setAuthState(page, adminUser, adminUser.permissions);
    
    // 模拟仪表盘数据API
    await TestHelpers.mockApiResponse(
      page,
      '**/api/dashboard/stats',
      { data: dashboardStats }
    );
    
    await TestHelpers.mockApiResponse(
      page,
      '**/api/dashboard/activities',
      { data: recentActivities }
    );
    
    await TestHelpers.mockApiResponse(
      page,
      '**/api/dashboard/alerts',
      { data: systemAlerts }
    );
    
    await TestHelpers.mockApiResponse(
      page,
      '**/api/dashboard/charts',
      { data: chartData }
    );
    
    await dashboardPage.goto();
    await dashboardPage.verifyPageLoaded();
    
    // 验证用户信息显示
    await dashboardPage.verifyUserLoggedIn(adminUser);
    
    // 验证统计卡片
    await dashboardPage.verifyStatsCards({
      totalUsers: dashboardStats.totalUsers,
      activeUsers: dashboardStats.activeUsers,
      totalRoles: dashboardStats.totalRoles,
      totalClients: dashboardStats.totalClients
    });
    
    // 验证增长指标
    await dashboardPage.verifyGrowthMetrics({
      todayLogins: dashboardStats.todayLogins,
      weeklyGrowth: dashboardStats.weeklyGrowth,
      monthlyGrowth: dashboardStats.monthlyGrowth
    });
    
    // 验证系统健康状态
    await dashboardPage.verifySystemHealth(dashboardStats.systemHealth);
    
    // 验证最近活动
    await dashboardPage.verifyRecentActivities(recentActivities.slice(0, 5));
    
    // 验证系统警告
    await dashboardPage.verifySystemAlerts(systemAlerts);
    
    // 验证图表显示
    await dashboardPage.verifyChartsDisplayed();
  });

  test('查看者仪表盘显示', async ({ page }) => {
    // 设置查看者认证状态
    await TestHelpers.setAuthState(page, viewerUser, viewerUser.permissions);
    
    // 模拟受限的仪表盘数据
    const limitedStats = {
      totalUsers: dashboardStats.totalUsers,
      activeUsers: dashboardStats.activeUsers,
      todayLogins: dashboardStats.todayLogins
      // 不包含角色和客户端统计
    };
    
    await TestHelpers.mockApiResponse(
      page,
      '**/api/dashboard/stats',
      { data: limitedStats }
    );
    
    await TestHelpers.mockApiResponse(
      page,
      '**/api/dashboard/activities',
      { data: recentActivities.filter(a => a.type === 'user_login') }
    );
    
    await dashboardPage.goto();
    await dashboardPage.verifyPageLoaded();
    
    // 验证受限的统计显示
    await dashboardPage.verifyLimitedStatsCards(limitedStats);
    
    // 验证某些功能不可见
    await dashboardPage.verifyRestrictedAccess([
      'role-management-card',
      'client-management-card',
      'system-alerts-section'
    ]);
  });

  test('导航菜单权限验证', async ({ page }) => {
    // 测试管理员权限
    await TestHelpers.setAuthState(page, adminUser, adminUser.permissions);
    
    await dashboardPage.goto();
    await dashboardPage.verifyPageLoaded();
    
    // 验证管理员可见的菜单项
    await dashboardPage.verifyNavigationMenus([
      { name: '仪表盘', href: '/dashboard', visible: true },
      { name: '用户管理', href: '/users', visible: true },
      { name: '角色管理', href: '/roles', visible: true },
      { name: '客户端管理', href: '/clients', visible: true },
      { name: '个人资料', href: '/profile', visible: true }
    ]);
    
    // 测试查看者权限
    await TestHelpers.setAuthState(page, viewerUser, viewerUser.permissions);
    
    await page.reload();
    await dashboardPage.verifyPageLoaded();
    
    // 验证查看者可见的菜单项
    await dashboardPage.verifyNavigationMenus([
      { name: '仪表盘', href: '/dashboard', visible: true },
      { name: '用户管理', href: '/users', visible: true },
      { name: '角色管理', href: '/roles', visible: false },
      { name: '客户端管理', href: '/clients', visible: false },
      { name: '个人资料', href: '/profile', visible: true }
    ]);
  });

  test('快捷操作功能', async ({ page }) => {
    await TestHelpers.setAuthState(page, adminUser, adminUser.permissions);
    
    await TestHelpers.mockApiResponse(
      page,
      '**/api/dashboard/stats',
      { data: dashboardStats }
    );
    
    await dashboardPage.goto();
    await dashboardPage.verifyPageLoaded();
    
    // 验证快捷操作按钮
    await dashboardPage.verifyQuickActions([
      { name: '创建用户', action: 'create-user' },
      { name: '创建角色', action: 'create-role' },
      { name: '创建客户端', action: 'create-client' },
      { name: '系统设置', action: 'system-settings' }
    ]);
    
    // 测试快捷创建用户
    await dashboardPage.clickQuickAction('create-user');
    await page.waitForURL('**/users/create');
    
    // 返回仪表盘
    await dashboardPage.goto();
    
    // 测试快捷创建角色
    await dashboardPage.clickQuickAction('create-role');
    await page.waitForURL('**/roles/create');
  });

  test('页面跳转功能', async ({ page }) => {
    await TestHelpers.setAuthState(page, adminUser, adminUser.permissions);
    
    await TestHelpers.mockApiResponse(
      page,
      '**/api/dashboard/stats',
      { data: dashboardStats }
    );
    
    await dashboardPage.goto();
    await dashboardPage.verifyPageLoaded();
    
    // 测试通过统计卡片跳转
    await dashboardPage.clickStatsCard('users');
    await page.waitForURL('**/users');
    
    await dashboardPage.goto();
    
    await dashboardPage.clickStatsCard('roles');
    await page.waitForURL('**/roles');
    
    await dashboardPage.goto();
    
    await dashboardPage.clickStatsCard('clients');
    await page.waitForURL('**/clients');
  });

  test('实时数据更新', async ({ page }) => {
    await TestHelpers.setAuthState(page, adminUser, adminUser.permissions);
    
    // 初始数据
    await TestHelpers.mockApiResponse(
      page,
      '**/api/dashboard/stats',
      { data: dashboardStats }
    );
    
    await TestHelpers.mockApiResponse(
      page,
      '**/api/dashboard/activities',
      { data: recentActivities }
    );
    
    await dashboardPage.goto();
    await dashboardPage.verifyPageLoaded();
    
    // 验证初始数据
    await dashboardPage.verifyStatsCards({
      totalUsers: dashboardStats.totalUsers,
      activeUsers: dashboardStats.activeUsers
    });
    
    // 模拟数据更新
    const updatedStats = {
      ...dashboardStats,
      totalUsers: dashboardStats.totalUsers + 5,
      activeUsers: dashboardStats.activeUsers + 3
    };
    
    const newActivity = {
      id: '6',
      type: 'user_created',
      user: '管理员',
      action: '创建用户',
      timestamp: new Date().toISOString(),
      details: { targetUser: '王五', role: 'viewer' }
    };
    
    // 更新API响应
    await TestHelpers.mockApiResponse(
      page,
      '**/api/dashboard/stats',
      { data: updatedStats }
    );
    
    await TestHelpers.mockApiResponse(
      page,
      '**/api/dashboard/activities',
      { data: [newActivity, ...recentActivities] }
    );
    
    // 触发数据刷新
    await dashboardPage.refreshData();
    
    // 验证数据已更新
    await dashboardPage.verifyStatsCards({
      totalUsers: updatedStats.totalUsers,
      activeUsers: updatedStats.activeUsers
    });
    
    // 验证新活动显示
    await dashboardPage.verifyNewActivity(newActivity);
  });

  test('图表交互功能', async ({ page }) => {
    await TestHelpers.setAuthState(page, adminUser, adminUser.permissions);
    
    await TestHelpers.mockApiResponse(
      page,
      '**/api/dashboard/charts',
      { data: chartData }
    );
    
    await dashboardPage.goto();
    await dashboardPage.verifyPageLoaded();
    
    // 验证用户增长图表
    await dashboardPage.verifyChart('user-growth', chartData.userGrowth);
    
    // 测试图表交互
    await dashboardPage.hoverChartPoint('user-growth', 2);
    await dashboardPage.verifyChartTooltip('3月: 200 用户');
    
    // 验证登录活动图表
    await dashboardPage.verifyChart('login-activity', chartData.loginActivity);
    
    // 测试图表时间范围切换
    await dashboardPage.switchChartTimeRange('user-growth', '3个月');
    
    // 验证角色分布饼图
    await dashboardPage.verifyPieChart('role-distribution', chartData.roleDistribution);
    
    // 测试饼图点击
    await dashboardPage.clickPieChartSegment('role-distribution', '查看者');
    await page.waitForURL('**/users?role=viewer');
  });

  test('系统警告处理', async ({ page }) => {
    await TestHelpers.setAuthState(page, adminUser, adminUser.permissions);
    
    await TestHelpers.mockApiResponse(
      page,
      '**/api/dashboard/alerts',
      { data: systemAlerts }
    );
    
    await dashboardPage.goto();
    await dashboardPage.verifyPageLoaded();
    
    // 验证警告显示
    await dashboardPage.verifySystemAlerts(systemAlerts);
    
    // 测试警告关闭
    const alertToClose = systemAlerts[0];
    
    await TestHelpers.mockApiResponse(
      page,
      `**/api/dashboard/alerts/${alertToClose.id}/dismiss`,
      { success: true }
    );
    
    await dashboardPage.dismissAlert(alertToClose.id);
    
    // 验证警告已关闭
    await dashboardPage.verifyAlertDismissed(alertToClose.id);
    
    // 验证API调用
    await TestHelpers.verifyApiCall(
      page,
      `/api/dashboard/alerts/${alertToClose.id}/dismiss`,
      'POST'
    );
  });

  test('搜索功能', async ({ page }) => {
    await TestHelpers.setAuthState(page, adminUser, adminUser.permissions);
    
    const searchResults = {
      users: [
        { id: '1', name: '张三', email: 'zhangsan@example.com', type: 'user' },
        { id: '2', name: '李四', email: 'lisi@example.com', type: 'user' }
      ],
      roles: [
        { id: '1', name: '编辑者', description: '可编辑内容', type: 'role' }
      ],
      clients: [
        { id: '1', name: 'Mobile App', type: 'client' }
      ]
    };
    
    await TestHelpers.mockApiResponse(
      page,
      '**/api/search*',
      { data: searchResults }
    );
    
    await dashboardPage.goto();
    await dashboardPage.verifyPageLoaded();
    
    // 执行搜索
    await dashboardPage.performGlobalSearch('张三');
    
    // 验证搜索结果
    await dashboardPage.verifySearchResults(searchResults);
    
    // 测试搜索结果点击
    await dashboardPage.clickSearchResult('user', '1');
    await page.waitForURL('**/users/1');
  });

  test('退出登录功能', async ({ page }) => {
    await TestHelpers.setAuthState(page, adminUser, adminUser.permissions);
    
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
  });

  test('无权限访问保护', async ({ page }) => {
    // 测试未认证用户访问
    await dashboardPage.goto();
    
    // 应该重定向到登录页面
    await page.waitForURL('**/login');
    await loginPage.verifyPageLoaded();
    
    // 测试权限不足的用户
    const limitedUser = {
      ...TEST_USERS.VIEWER,
      permissions: [] // 无任何权限
    };
    
    await TestHelpers.setAuthState(page, limitedUser, []);
    
    await dashboardPage.goto();
    
    // 应该显示权限不足页面或重定向
    await dashboardPage.verifyAccessDenied();
  });

  test('令牌自动刷新', async ({ page }) => {
    // 设置即将过期的令牌
    const expiredToken = TestHelpers.generateJwtToken(adminUser, { expiresIn: '1s' });
    await TestHelpers.setAuthState(page, adminUser, adminUser.permissions, expiredToken);
    
    // 模拟令牌刷新API
    await TestHelpers.mockApiResponse(
      page,
      '**/api/auth/refresh',
      {
        success: true,
        data: {
          token: TestHelpers.generateJwtToken(adminUser),
          refreshToken: 'new_refresh_token_123',
          expiresIn: 3600
        }
      }
    );
    
    await TestHelpers.mockApiResponse(
      page,
      '**/api/dashboard/stats',
      { data: dashboardStats }
    );
    
    await dashboardPage.goto();
    await dashboardPage.verifyPageLoaded();
    
    // 等待令牌过期
    await page.waitForTimeout(2000);
    
    // 执行需要认证的操作
    await dashboardPage.refreshData();
    
    // 验证令牌刷新API被调用
    await TestHelpers.verifyApiCall(page, '/api/auth/refresh', 'POST');
    
    // 验证页面正常工作
    await dashboardPage.verifyPageLoaded();
  });

  test('页面性能验证', async ({ page }) => {
    await TestHelpers.setAuthState(page, adminUser, adminUser.permissions);
    
    await TestHelpers.mockApiResponse(
      page,
      '**/api/dashboard/stats',
      { data: dashboardStats }
    );
    
    // 开始性能监控
    await page.goto('/dashboard');
    
    // 验证页面加载性能
    await dashboardPage.verifyPagePerformance({
      loadTime: 3000, // 3秒内加载完成
      firstContentfulPaint: 1500, // 1.5秒内首次内容绘制
      largestContentfulPaint: 2500 // 2.5秒内最大内容绘制
    });
  });

  test('错误处理', async ({ page }) => {
    await TestHelpers.setAuthState(page, adminUser, adminUser.permissions);
    
    // 模拟API错误
    await TestHelpers.mockApiError(
      page,
      '**/api/dashboard/stats',
      { code: 'server_error', message: '服务器内部错误' },
      500
    );
    
    await dashboardPage.goto();
    
    // 验证错误处理
    await dashboardPage.verifyErrorMessage('加载仪表盘数据失败，请稍后重试');
    
    // 测试重试功能
    await TestHelpers.mockApiResponse(
      page,
      '**/api/dashboard/stats',
      { data: dashboardStats }
    );
    
    await dashboardPage.retryLoadData();
    await dashboardPage.verifyPageLoaded();
  });

  test('响应式设计验证', async ({ page }) => {
    await TestHelpers.setAuthState(page, adminUser, adminUser.permissions);
    
    await TestHelpers.mockApiResponse(
      page,
      '**/api/dashboard/stats',
      { data: dashboardStats }
    );
    
    await dashboardPage.goto();
    await dashboardPage.verifyPageLoaded();
    
    // 测试不同屏幕尺寸
    const breakpoints = [
      { name: 'mobile', width: 375, height: 667 },
      { name: 'tablet', width: 768, height: 1024 },
      { name: 'desktop', width: 1920, height: 1080 }
    ];
    
    await TestHelpers.verifyResponsiveDesign(page, breakpoints);
    
    // 验证移动端特定功能
    await page.setViewportSize({ width: 375, height: 667 });
    await dashboardPage.verifyMobileLayout();
  });

  test('可访问性验证', async ({ page }) => {
    await TestHelpers.setAuthState(page, adminUser, adminUser.permissions);
    
    await TestHelpers.mockApiResponse(
      page,
      '**/api/dashboard/stats',
      { data: dashboardStats }
    );
    
    await dashboardPage.goto();
    await dashboardPage.verifyPageLoaded();
    
    // 验证键盘导航和ARIA标签
    await TestHelpers.verifyAccessibility(page);
  });

  test('数据导出功能', async ({ page }) => {
    await TestHelpers.setAuthState(page, adminUser, adminUser.permissions);
    
    await TestHelpers.mockApiResponse(
      page,
      '**/api/dashboard/export',
      { 
        success: true, 
        downloadUrl: 'https://example.com/exports/dashboard-report.pdf' 
      }
    );
    
    await dashboardPage.goto();
    await dashboardPage.verifyPageLoaded();
    
    // 测试导出报告
    await dashboardPage.exportDashboardReport('pdf');
    
    // 验证导出成功
    await dashboardPage.verifyExportSuccess();
    
    // 验证API调用
    await TestHelpers.verifyApiCall(page, '/api/dashboard/export', 'POST', {
      format: 'pdf'
    });
  });

  test('主题切换功能', async ({ page }) => {
    await TestHelpers.setAuthState(page, adminUser, adminUser.permissions);
    
    await dashboardPage.goto();
    await dashboardPage.verifyPageLoaded();
    
    // 测试切换到深色主题
    await dashboardPage.switchTheme('dark');
    await dashboardPage.verifyTheme('dark');
    
    // 测试切换到浅色主题
    await dashboardPage.switchTheme('light');
    await dashboardPage.verifyTheme('light');
    
    // 验证主题设置持久化
    await page.reload();
    await dashboardPage.verifyTheme('light');
  });
});