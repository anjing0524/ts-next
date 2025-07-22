import { test, expect } from '@playwright/test';
import { UserManagementPage } from '../pages/user-management-page';
import { DashboardPage } from '../pages/dashboard-page';
import { TestHelpers, TEST_USERS, TEST_PERMISSIONS, TestUser } from '../utils/test-helpers';

test.describe('用户管理功能', () => {
  let userManagementPage: UserManagementPage;
  let dashboardPage: DashboardPage;
  
  const adminUser = TestHelpers.generateUserData({
    ...TEST_USERS.ADMIN,
    roles: ['admin']
  });
  
  const testUsers = [
    TestHelpers.generateUserData({
      username: 'user1',
      email: 'user1@example.com',
      status: 'active',
      roles: ['user']
    }),
    TestHelpers.generateUserData({
      username: 'user2',
      email: 'user2@example.com',
      status: 'inactive',
      roles: ['manager']
    }),
    TestHelpers.generateUserData({
      username: 'user3',
      email: 'user3@example.com',
      status: 'suspended',
      roles: ['viewer']
    })
  ];

  test.beforeEach(async ({ page }) => {
    userManagementPage = new UserManagementPage(page);
    dashboardPage = new DashboardPage(page);
    
    // 设置管理员认证状态
    await TestHelpers.setAuthState(page, adminUser, [
      TEST_PERMISSIONS.USERS_READ,
      TEST_PERMISSIONS.USERS_WRITE,
      TEST_PERMISSIONS.USERS_DELETE
    ]);
    
    // 模拟用户列表API
    const paginatedUsers = TestHelpers.generatePaginatedData(testUsers, 1, 10);
    await TestHelpers.mockApiResponse(
      page,
      '**/api/users*',
      paginatedUsers
    );
  });

  test('用户列表显示和分页', async ({ page }) => {
    await userManagementPage.goto();
    await userManagementPage.verifyPageLoaded();
    
    // 验证用户列表显示
    const users = await userManagementPage.getUserList();
    expect(users).toHaveLength(testUsers.length);
    
    // 验证用户信息显示正确
    for (let i = 0; i < testUsers.length; i++) {
      expect(users[i].username).toBe(testUsers[i].username);
      expect(users[i].email).toBe(testUsers[i].email);
      expect(users[i].status).toBe(testUsers[i].status);
    }
    
    // 验证分页信息
    await userManagementPage.verifyPaginationInfo(1, 10, testUsers.length);
  });

  test('用户搜索功能', async ({ page }) => {
    await userManagementPage.goto();
    await userManagementPage.verifyPageLoaded();
    
    // 按用户名搜索
    const searchQuery = 'user1';
    const filteredUsers = TestHelpers.generateSearchResults(
      testUsers,
      searchQuery,
      ['username', 'email']
    );
    
    await TestHelpers.mockApiResponse(
      page,
      `**/api/users?search=${searchQuery}*`,
      TestHelpers.generatePaginatedData(filteredUsers, 1, 10)
    );
    
    await userManagementPage.searchUsers(searchQuery);
    
    // 验证搜索结果
    const searchResults = await userManagementPage.getUserList();
    expect(searchResults).toHaveLength(filteredUsers.length);
    expect(searchResults[0].username).toContain(searchQuery);
  });

  test('用户状态筛选', async ({ page }) => {
    await userManagementPage.goto();
    await userManagementPage.verifyPageLoaded();
    
    // 筛选活跃用户
    const activeUsers = testUsers.filter(user => user.status === 'active');
    await TestHelpers.mockApiResponse(
      page,
      '**/api/users?status=active*',
      TestHelpers.generatePaginatedData(activeUsers, 1, 10)
    );
    
    await userManagementPage.filterByStatus('active');
    
    // 验证筛选结果
    const filteredResults = await userManagementPage.getUserList();
    expect(filteredResults).toHaveLength(activeUsers.length);
    filteredResults.forEach(user => {
      expect(user.status).toBe('active');
    });
  });

  test('创建新用户', async ({ page }) => {
    await userManagementPage.goto();
    await userManagementPage.verifyPageLoaded();
    
    const newUser = TestHelpers.generateUserData({
      username: 'newuser',
      email: 'newuser@example.com',
      firstName: '新',
      lastName: '用户',
      phone: '13800138000'
    });
    
    // 模拟创建用户API
    await TestHelpers.mockApiResponse(
      page,
      '**/api/users',
      { success: true, data: newUser }
    );
    
    // 模拟角色列表API
    const roles = [
      { id: '1', name: 'user', description: '普通用户' },
      { id: '2', name: 'manager', description: '管理员' }
    ];
    await TestHelpers.mockApiResponse(
      page,
      '**/api/roles',
      { data: roles }
    );
    
    await userManagementPage.clickCreateUser();
    await userManagementPage.fillUserForm({
      username: newUser.username,
      email: newUser.email,
      firstName: newUser.firstName,
      lastName: newUser.lastName,
      phone: newUser.phone,
      roles: ['user']
    });
    
    await userManagementPage.submitUserForm();
    
    // 验证创建成功
    await userManagementPage.verifyOperationSuccess();
    
    // 验证API调用
    await TestHelpers.verifyApiCall(page, '/api/users', 'POST', {
      username: newUser.username,
      email: newUser.email,
      firstName: newUser.firstName,
      lastName: newUser.lastName,
      phone: newUser.phone,
      roles: ['user']
    });
  });

  test('编辑用户信息', async ({ page }) => {
    await userManagementPage.goto();
    await userManagementPage.verifyPageLoaded();
    
    const userToEdit = testUsers[0];
    const updatedUser = {
      ...userToEdit,
      firstName: '更新的',
      lastName: '姓名',
      phone: '13900139000'
    };
    
    // 模拟更新用户API
    await TestHelpers.mockApiResponse(
      page,
      `**/api/users/${userToEdit.id}`,
      { success: true, data: updatedUser }
    );
    
    await userManagementPage.editUser(userToEdit.username);
    await userManagementPage.fillUserForm({
      firstName: updatedUser.firstName,
      lastName: updatedUser.lastName,
      phone: updatedUser.phone
    });
    
    await userManagementPage.submitUserForm();
    
    // 验证更新成功
    await userManagementPage.verifyOperationSuccess();
    
    // 验证API调用
    await TestHelpers.verifyApiCall(page, `/api/users/${userToEdit.id}`, 'PUT');
  });

  test('删除用户', async ({ page }) => {
    await userManagementPage.goto();
    await userManagementPage.verifyPageLoaded();
    
    const userToDelete = testUsers[0];
    
    // 模拟删除用户API
    await TestHelpers.mockApiResponse(
      page,
      `**/api/users/${userToDelete.id}`,
      { success: true }
    );
    
    await userManagementPage.deleteUser(userToDelete.username);
    await userManagementPage.confirmDelete();
    
    // 验证删除成功
    await userManagementPage.verifyOperationSuccess();
    
    // 验证API调用
    await TestHelpers.verifyApiCall(page, `/api/users/${userToDelete.id}`, 'DELETE');
  });

  test('批量操作用户', async ({ page }) => {
    await userManagementPage.goto();
    await userManagementPage.verifyPageLoaded();
    
    const usersToSelect = [testUsers[0].username, testUsers[1].username];
    
    // 模拟批量删除API
    await TestHelpers.mockApiResponse(
      page,
      '**/api/users/batch',
      { success: true, deletedCount: 2 }
    );
    
    // 选择多个用户
    for (const username of usersToSelect) {
      await userManagementPage.selectUser(username);
    }
    
    // 执行批量删除
    await userManagementPage.batchDeleteUsers();
    await userManagementPage.confirmBatchOperation();
    
    // 验证批量操作成功
    await userManagementPage.verifyOperationSuccess();
  });

  test('用户状态切换', async ({ page }) => {
    await userManagementPage.goto();
    await userManagementPage.verifyPageLoaded();
    
    const userToToggle = testUsers[0];
    const newStatus = userToToggle.status === 'active' ? 'inactive' : 'active';
    
    // 模拟状态切换API
    await TestHelpers.mockApiResponse(
      page,
      `**/api/users/${userToToggle.id}/status`,
      { success: true, status: newStatus }
    );
    
    await userManagementPage.toggleUserStatus(userToToggle.username);
    
    // 验证状态切换成功
    await userManagementPage.verifyOperationSuccess();
    
    // 验证API调用
    await TestHelpers.verifyApiCall(
      page,
      `/api/users/${userToToggle.id}/status`,
      'PATCH',
      { status: newStatus }
    );
  });

  test('用户详情查看', async ({ page }) => {
    await userManagementPage.goto();
    await userManagementPage.verifyPageLoaded();
    
    const userToView = testUsers[0];
    
    // 模拟用户详情API
    await TestHelpers.mockApiResponse(
      page,
      `**/api/users/${userToView.id}`,
      { data: userToView }
    );
    
    await userManagementPage.viewUserDetails(userToView.username);
    
    // 验证详情显示
    await userManagementPage.verifyUserDetails({
      username: userToView.username,
      email: userToView.email,
      status: userToView.status,
      roles: userToView.roles
    });
  });

  test('表单验证', async ({ page }) => {
    await userManagementPage.goto();
    await userManagementPage.verifyPageLoaded();
    
    await userManagementPage.clickCreateUser();
    
    // 测试必填字段验证
    await userManagementPage.submitUserForm();
    await userManagementPage.verifyValidationError('username', '用户名不能为空');
    await userManagementPage.verifyValidationError('email', '邮箱不能为空');
    
    // 测试邮箱格式验证
    await userManagementPage.fillUserForm({
      username: 'testuser',
      email: 'invalid-email'
    });
    await userManagementPage.submitUserForm();
    await userManagementPage.verifyValidationError('email', '邮箱格式无效');
    
    // 测试用户名重复验证
    await TestHelpers.mockApiError(
      page,
      '**/api/users',
      { code: 'username_exists', message: '用户名已存在' },
      409
    );
    
    await userManagementPage.fillUserForm({
      username: testUsers[0].username,
      email: 'newemail@example.com'
    });
    await userManagementPage.submitUserForm();
    await userManagementPage.verifyOperationError('用户名已存在');
  });

  test('权限控制验证', async ({ page }) => {
    // 测试只读权限用户
    const readOnlyUser = TestHelpers.generateUserData({
      ...TEST_USERS.VIEWER,
      roles: ['viewer']
    });
    
    await TestHelpers.setAuthState(page, readOnlyUser, [TEST_PERMISSIONS.USERS_READ]);
    
    await userManagementPage.goto();
    await userManagementPage.verifyPageLoaded();
    
    // 验证只能查看，不能编辑
    await userManagementPage.verifyReadOnlyMode();
    
    // 验证创建按钮不可见
    await expect(page.locator('[data-testid="create-user-button"]')).not.toBeVisible();
    
    // 验证编辑和删除按钮不可见
    await expect(page.locator('[data-testid="edit-user-button"]')).not.toBeVisible();
    await expect(page.locator('[data-testid="delete-user-button"]')).not.toBeVisible();
  });

  test('无权限访问保护', async ({ page }) => {
    // 设置无权限用户
    const noPermissionUser = TestHelpers.generateUserData({
      username: 'noperm',
      roles: ['basic']
    });
    
    await TestHelpers.setAuthState(page, noPermissionUser, []);
    
    // 尝试访问用户管理页面
    await userManagementPage.goto();
    
    // 应该显示无权限错误或重定向到仪表盘
    await Promise.race([
      expect(page.locator('[data-testid="no-permission"]')).toBeVisible(),
      page.waitForURL('**/dashboard')
    ]);
  });

  test('分页功能', async ({ page }) => {
    // 生成大量测试数据
    const manyUsers = Array.from({ length: 25 }, (_, i) => 
      TestHelpers.generateUserData({
        username: `user${i + 1}`,
        email: `user${i + 1}@example.com`
      })
    );
    
    // 模拟第一页数据
    await TestHelpers.mockApiResponse(
      page,
      '**/api/users?page=1*',
      TestHelpers.generatePaginatedData(manyUsers, 1, 10)
    );
    
    await userManagementPage.goto();
    await userManagementPage.verifyPageLoaded();
    
    // 验证第一页显示
    let users = await userManagementPage.getUserList();
    expect(users).toHaveLength(10);
    await userManagementPage.verifyPaginationInfo(1, 10, 25);
    
    // 模拟第二页数据
    await TestHelpers.mockApiResponse(
      page,
      '**/api/users?page=2*',
      TestHelpers.generatePaginatedData(manyUsers, 2, 10)
    );
    
    // 切换到第二页
    await userManagementPage.goToPage(2);
    
    // 验证第二页显示
    users = await userManagementPage.getUserList();
    expect(users).toHaveLength(10);
    await userManagementPage.verifyPaginationInfo(2, 10, 25);
  });

  test('排序功能', async ({ page }) => {
    await userManagementPage.goto();
    await userManagementPage.verifyPageLoaded();
    
    // 按用户名升序排序
    const sortedUsersAsc = [...testUsers].sort((a, b) => a.username.localeCompare(b.username));
    await TestHelpers.mockApiResponse(
      page,
      '**/api/users?sort=username&order=asc*',
      TestHelpers.generatePaginatedData(sortedUsersAsc, 1, 10)
    );
    
    await userManagementPage.sortBy('username', 'asc');
    
    let users = await userManagementPage.getUserList();
    expect(users[0].username).toBe(sortedUsersAsc[0].username);
    
    // 按用户名降序排序
    const sortedUsersDesc = [...testUsers].sort((a, b) => b.username.localeCompare(a.username));
    await TestHelpers.mockApiResponse(
      page,
      '**/api/users?sort=username&order=desc*',
      TestHelpers.generatePaginatedData(sortedUsersDesc, 1, 10)
    );
    
    await userManagementPage.sortBy('username', 'desc');
    
    users = await userManagementPage.getUserList();
    expect(users[0].username).toBe(sortedUsersDesc[0].username);
  });

  test('空状态显示', async ({ page }) => {
    // 模拟空数据
    await TestHelpers.mockApiResponse(
      page,
      '**/api/users*',
      TestHelpers.generatePaginatedData([], 1, 10)
    );
    
    await userManagementPage.goto();
    await userManagementPage.verifyPageLoaded();
    
    // 验证空状态显示
    await userManagementPage.verifyEmptyState();
  });

  test('网络错误处理', async ({ page }) => {
    // 模拟网络错误
    await TestHelpers.mockApiError(
      page,
      '**/api/users*',
      { code: 'network_error', message: '网络连接失败' },
      500
    );
    
    await userManagementPage.goto();
    
    // 验证错误状态显示
    await userManagementPage.verifyErrorState('网络连接失败');
    
    // 验证重试功能
    await TestHelpers.mockApiResponse(
      page,
      '**/api/users*',
      TestHelpers.generatePaginatedData(testUsers, 1, 10)
    );
    
    await userManagementPage.retryLoad();
    await userManagementPage.verifyPageLoaded();
  });

  test('响应式设计验证', async ({ page }) => {
    await userManagementPage.goto();
    await userManagementPage.verifyPageLoaded();
    
    // 测试不同屏幕尺寸
    const breakpoints = [
      { name: 'mobile', width: 375, height: 667 },
      { name: 'tablet', width: 768, height: 1024 },
      { name: 'desktop', width: 1920, height: 1080 }
    ];
    
    await TestHelpers.verifyResponsiveDesign(page, breakpoints);
  });

  test('可访问性验证', async ({ page }) => {
    await userManagementPage.goto();
    await userManagementPage.verifyPageLoaded();
    
    // 验证键盘导航和ARIA标签
    await TestHelpers.verifyAccessibility(page);
  });
});