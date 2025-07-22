import { test, expect } from '@playwright/test';
import { RoleManagementPage } from '../pages/role-management-page';
import { DashboardPage } from '../pages/dashboard-page';
import { TestHelpers, TEST_USERS, TEST_PERMISSIONS, TestRole } from '../utils/test-helpers';

test.describe('角色管理功能', () => {
  let roleManagementPage: RoleManagementPage;
  let dashboardPage: DashboardPage;
  
  const adminUser = TestHelpers.generateUserData({
    ...TEST_USERS.ADMIN,
    roles: ['admin']
  });
  
  const testRoles = [
    TestHelpers.generateRoleData({
      name: 'admin',
      displayName: '系统管理员',
      description: '拥有所有权限的系统管理员',
      permissions: ['users:read', 'users:write', 'users:delete', 'roles:read', 'roles:write'],
      isBuiltIn: true,
      status: 'active'
    }),
    TestHelpers.generateRoleData({
      name: 'manager',
      displayName: '部门经理',
      description: '部门管理权限',
      permissions: ['users:read', 'users:write', 'roles:read'],
      isBuiltIn: false,
      status: 'active'
    }),
    TestHelpers.generateRoleData({
      name: 'viewer',
      displayName: '查看者',
      description: '只读权限',
      permissions: ['users:read', 'roles:read'],
      isBuiltIn: false,
      status: 'inactive'
    })
  ];
  
  const availablePermissions = [
    { id: 'users:read', name: '查看用户', category: '用户管理' },
    { id: 'users:write', name: '编辑用户', category: '用户管理' },
    { id: 'users:delete', name: '删除用户', category: '用户管理' },
    { id: 'roles:read', name: '查看角色', category: '角色管理' },
    { id: 'roles:write', name: '编辑角色', category: '角色管理' },
    { id: 'roles:delete', name: '删除角色', category: '角色管理' },
    { id: 'clients:read', name: '查看客户端', category: '客户端管理' },
    { id: 'clients:write', name: '编辑客户端', category: '客户端管理' }
  ];

  test.beforeEach(async ({ page }) => {
    roleManagementPage = new RoleManagementPage(page);
    dashboardPage = new DashboardPage(page);
    
    // 设置管理员认证状态
    await TestHelpers.setAuthState(page, adminUser, [
      TEST_PERMISSIONS.ROLES_READ,
      TEST_PERMISSIONS.ROLES_WRITE,
      TEST_PERMISSIONS.ROLES_DELETE
    ]);
    
    // 模拟角色列表API
    const paginatedRoles = TestHelpers.generatePaginatedData(testRoles, 1, 10);
    await TestHelpers.mockApiResponse(
      page,
      '**/api/roles*',
      paginatedRoles
    );
    
    // 模拟权限列表API
    await TestHelpers.mockApiResponse(
      page,
      '**/api/permissions*',
      { data: availablePermissions }
    );
  });

  test('角色列表显示和分页', async ({ page }) => {
    await roleManagementPage.goto();
    await roleManagementPage.verifyPageLoaded();
    
    // 验证角色列表显示
    const roles = await roleManagementPage.getRoleList();
    expect(roles).toHaveLength(testRoles.length);
    
    // 验证角色信息显示正确
    for (let i = 0; i < testRoles.length; i++) {
      expect(roles[i].name).toBe(testRoles[i].name);
      expect(roles[i].displayName).toBe(testRoles[i].displayName);
      expect(roles[i].status).toBe(testRoles[i].status);
    }
    
    // 验证分页信息
    await roleManagementPage.verifyPaginationInfo(1, 10, testRoles.length);
  });

  test('角色搜索功能', async ({ page }) => {
    await roleManagementPage.goto();
    await roleManagementPage.verifyPageLoaded();
    
    // 按角色名搜索
    const searchQuery = 'admin';
    const filteredRoles = TestHelpers.generateSearchResults(
      testRoles,
      searchQuery,
      ['name', 'displayName', 'description']
    );
    
    await TestHelpers.mockApiResponse(
      page,
      `**/api/roles?search=${searchQuery}*`,
      TestHelpers.generatePaginatedData(filteredRoles, 1, 10)
    );
    
    await roleManagementPage.searchRoles(searchQuery);
    
    // 验证搜索结果
    const searchResults = await roleManagementPage.getRoleList();
    expect(searchResults).toHaveLength(filteredRoles.length);
    expect(searchResults[0].name).toContain(searchQuery);
  });

  test('角色状态筛选', async ({ page }) => {
    await roleManagementPage.goto();
    await roleManagementPage.verifyPageLoaded();
    
    // 筛选活跃角色
    const activeRoles = testRoles.filter(role => role.status === 'active');
    await TestHelpers.mockApiResponse(
      page,
      '**/api/roles?status=active*',
      TestHelpers.generatePaginatedData(activeRoles, 1, 10)
    );
    
    await roleManagementPage.filterByStatus('active');
    
    // 验证筛选结果
    const filteredResults = await roleManagementPage.getRoleList();
    expect(filteredResults).toHaveLength(activeRoles.length);
    filteredResults.forEach(role => {
      expect(role.status).toBe('active');
    });
  });

  test('创建新角色', async ({ page }) => {
    await roleManagementPage.goto();
    await roleManagementPage.verifyPageLoaded();
    
    const newRole = TestHelpers.generateRoleData({
      name: 'editor',
      displayName: '编辑者',
      description: '内容编辑权限',
      permissions: ['users:read', 'users:write']
    });
    
    // 模拟创建角色API
    await TestHelpers.mockApiResponse(
      page,
      '**/api/roles',
      { success: true, data: newRole }
    );
    
    await roleManagementPage.clickCreateRole();
    await roleManagementPage.fillRoleForm({
      name: newRole.name,
      displayName: newRole.displayName,
      description: newRole.description
    });
    
    // 选择权限
    await roleManagementPage.selectPermissions(newRole.permissions);
    
    await roleManagementPage.submitRoleForm();
    
    // 验证创建成功
    await roleManagementPage.verifyOperationSuccess();
    
    // 验证API调用
    await TestHelpers.verifyApiCall(page, '/api/roles', 'POST', {
      name: newRole.name,
      displayName: newRole.displayName,
      description: newRole.description,
      permissions: newRole.permissions
    });
  });

  test('编辑角色信息', async ({ page }) => {
    await roleManagementPage.goto();
    await roleManagementPage.verifyPageLoaded();
    
    const roleToEdit = testRoles[1]; // 选择非内置角色
    const updatedRole = {
      ...roleToEdit,
      displayName: '更新的部门经理',
      description: '更新的描述',
      permissions: ['users:read', 'users:write', 'roles:read', 'clients:read']
    };
    
    // 模拟更新角色API
    await TestHelpers.mockApiResponse(
      page,
      `**/api/roles/${roleToEdit.id}`,
      { success: true, data: updatedRole }
    );
    
    await roleManagementPage.editRole(roleToEdit.name);
    await roleManagementPage.fillRoleForm({
      displayName: updatedRole.displayName,
      description: updatedRole.description
    });
    
    // 更新权限选择
    await roleManagementPage.selectPermissions(updatedRole.permissions);
    
    await roleManagementPage.submitRoleForm();
    
    // 验证更新成功
    await roleManagementPage.verifyOperationSuccess();
    
    // 验证API调用
    await TestHelpers.verifyApiCall(page, `/api/roles/${roleToEdit.id}`, 'PUT');
  });

  test('删除角色', async ({ page }) => {
    await roleManagementPage.goto();
    await roleManagementPage.verifyPageLoaded();
    
    const roleToDelete = testRoles[2]; // 选择非内置角色
    
    // 模拟删除角色API
    await TestHelpers.mockApiResponse(
      page,
      `**/api/roles/${roleToDelete.id}`,
      { success: true }
    );
    
    await roleManagementPage.deleteRole(roleToDelete.name);
    await roleManagementPage.confirmDelete();
    
    // 验证删除成功
    await roleManagementPage.verifyOperationSuccess();
    
    // 验证API调用
    await TestHelpers.verifyApiCall(page, `/api/roles/${roleToDelete.id}`, 'DELETE');
  });

  test('内置角色保护', async ({ page }) => {
    await roleManagementPage.goto();
    await roleManagementPage.verifyPageLoaded();
    
    const builtInRole = testRoles[0]; // admin角色是内置的
    
    // 验证内置角色不能删除
    await roleManagementPage.verifyBuiltInRoleProtection(builtInRole.name);
    
    // 验证删除按钮不可见或禁用
    await expect(
      page.locator(`[data-testid="delete-role-${builtInRole.name}"]`)
    ).not.toBeVisible();
    
    // 验证编辑时某些字段不可修改
    await roleManagementPage.editRole(builtInRole.name);
    await roleManagementPage.verifyBuiltInRoleEditRestrictions();
  });

  test('批量操作角色', async ({ page }) => {
    await roleManagementPage.goto();
    await roleManagementPage.verifyPageLoaded();
    
    const rolesToSelect = [testRoles[1].name, testRoles[2].name]; // 排除内置角色
    
    // 模拟批量删除API
    await TestHelpers.mockApiResponse(
      page,
      '**/api/roles/batch',
      { success: true, deletedCount: 2 }
    );
    
    // 选择多个角色
    for (const roleName of rolesToSelect) {
      await roleManagementPage.selectRole(roleName);
    }
    
    // 执行批量删除
    await roleManagementPage.batchDeleteRoles();
    await roleManagementPage.confirmBatchOperation();
    
    // 验证批量操作成功
    await roleManagementPage.verifyOperationSuccess();
  });

  test('角色状态切换', async ({ page }) => {
    await roleManagementPage.goto();
    await roleManagementPage.verifyPageLoaded();
    
    const roleToToggle = testRoles[1];
    const newStatus = roleToToggle.status === 'active' ? 'inactive' : 'active';
    
    // 模拟状态切换API
    await TestHelpers.mockApiResponse(
      page,
      `**/api/roles/${roleToToggle.id}/status`,
      { success: true, status: newStatus }
    );
    
    await roleManagementPage.toggleRoleStatus(roleToToggle.name);
    
    // 验证状态切换成功
    await roleManagementPage.verifyOperationSuccess();
    
    // 验证API调用
    await TestHelpers.verifyApiCall(
      page,
      `/api/roles/${roleToToggle.id}/status`,
      'PATCH',
      { status: newStatus }
    );
  });

  test('角色详情查看', async ({ page }) => {
    await roleManagementPage.goto();
    await roleManagementPage.verifyPageLoaded();
    
    const roleToView = testRoles[0];
    
    // 模拟角色详情API
    await TestHelpers.mockApiResponse(
      page,
      `**/api/roles/${roleToView.id}`,
      { data: roleToView }
    );
    
    await roleManagementPage.viewRoleDetails(roleToView.name);
    
    // 验证详情显示
    await roleManagementPage.verifyRoleDetails({
      name: roleToView.name,
      displayName: roleToView.displayName,
      description: roleToView.description,
      permissions: roleToView.permissions,
      status: roleToView.status
    });
  });

  test('权限选择和搜索', async ({ page }) => {
    await roleManagementPage.goto();
    await roleManagementPage.verifyPageLoaded();
    
    await roleManagementPage.clickCreateRole();
    
    // 验证权限列表显示
    await roleManagementPage.verifyPermissionsList(availablePermissions);
    
    // 测试权限搜索
    const searchQuery = '用户';
    await roleManagementPage.searchPermissions(searchQuery);
    
    // 验证搜索结果只显示包含"用户"的权限
    const filteredPermissions = availablePermissions.filter(
      p => p.name.includes(searchQuery) || p.category.includes(searchQuery)
    );
    await roleManagementPage.verifyPermissionsList(filteredPermissions);
    
    // 测试按分类筛选权限
    await roleManagementPage.filterPermissionsByCategory('用户管理');
    const userPermissions = availablePermissions.filter(
      p => p.category === '用户管理'
    );
    await roleManagementPage.verifyPermissionsList(userPermissions);
  });

  test('权限依赖关系验证', async ({ page }) => {
    await roleManagementPage.goto();
    await roleManagementPage.verifyPageLoaded();
    
    await roleManagementPage.clickCreateRole();
    
    // 选择需要依赖的权限（例如删除用户需要先有编辑用户权限）
    await roleManagementPage.selectPermissions(['users:delete']);
    
    // 验证依赖权限自动选中
    await roleManagementPage.verifyPermissionDependencies([
      'users:read',
      'users:write',
      'users:delete'
    ]);
    
    // 尝试取消依赖权限，应该显示警告
    await roleManagementPage.deselectPermission('users:write');
    await roleManagementPage.verifyDependencyWarning('删除用户权限需要编辑用户权限');
  });

  test('表单验证', async ({ page }) => {
    await roleManagementPage.goto();
    await roleManagementPage.verifyPageLoaded();
    
    await roleManagementPage.clickCreateRole();
    
    // 测试必填字段验证
    await roleManagementPage.submitRoleForm();
    await roleManagementPage.verifyValidationError('name', '角色名称不能为空');
    await roleManagementPage.verifyValidationError('displayName', '显示名称不能为空');
    
    // 测试角色名称格式验证
    await roleManagementPage.fillRoleForm({
      name: 'Invalid Name!', // 包含特殊字符
      displayName: '测试角色'
    });
    await roleManagementPage.submitRoleForm();
    await roleManagementPage.verifyValidationError('name', '角色名称只能包含字母、数字和下划线');
    
    // 测试角色名称重复验证
    await TestHelpers.mockApiError(
      page,
      '**/api/roles',
      { code: 'role_exists', message: '角色名称已存在' },
      409
    );
    
    await roleManagementPage.fillRoleForm({
      name: testRoles[0].name,
      displayName: '新角色'
    });
    await roleManagementPage.submitRoleForm();
    await roleManagementPage.verifyOperationError('角色名称已存在');
    
    // 测试权限选择验证
    await roleManagementPage.fillRoleForm({
      name: 'valid_role',
      displayName: '有效角色'
    });
    await roleManagementPage.submitRoleForm();
    await roleManagementPage.verifyValidationError('permissions', '至少选择一个权限');
  });

  test('角色使用情况验证', async ({ page }) => {
    await roleManagementPage.goto();
    await roleManagementPage.verifyPageLoaded();
    
    const roleInUse = testRoles[0];
    
    // 模拟角色使用情况API
    await TestHelpers.mockApiResponse(
      page,
      `**/api/roles/${roleInUse.id}/usage`,
      { 
        userCount: 5,
        users: [
          { id: '1', username: 'user1', email: 'user1@example.com' },
          { id: '2', username: 'user2', email: 'user2@example.com' }
        ]
      }
    );
    
    await roleManagementPage.viewRoleUsage(roleInUse.name);
    
    // 验证使用情况显示
    await roleManagementPage.verifyRoleUsage({
      userCount: 5,
      hasUsers: true
    });
    
    // 尝试删除正在使用的角色
    await roleManagementPage.deleteRole(roleInUse.name);
    await roleManagementPage.verifyDeletionWarning('该角色正被5个用户使用，确定要删除吗？');
  });

  test('权限控制验证', async ({ page }) => {
    // 测试只读权限用户
    const readOnlyUser = TestHelpers.generateUserData({
      ...TEST_USERS.VIEWER,
      roles: ['viewer']
    });
    
    await TestHelpers.setAuthState(page, readOnlyUser, [TEST_PERMISSIONS.ROLES_READ]);
    
    await roleManagementPage.goto();
    await roleManagementPage.verifyPageLoaded();
    
    // 验证只能查看，不能编辑
    await roleManagementPage.verifyReadOnlyMode();
    
    // 验证创建按钮不可见
    await expect(page.locator('[data-testid="create-role-button"]')).not.toBeVisible();
    
    // 验证编辑和删除按钮不可见
    await expect(page.locator('[data-testid="edit-role-button"]')).not.toBeVisible();
    await expect(page.locator('[data-testid="delete-role-button"]')).not.toBeVisible();
  });

  test('无权限访问保护', async ({ page }) => {
    // 设置无权限用户
    const noPermissionUser = TestHelpers.generateUserData({
      username: 'noperm',
      roles: ['basic']
    });
    
    await TestHelpers.setAuthState(page, noPermissionUser, []);
    
    // 尝试访问角色管理页面
    await roleManagementPage.goto();
    
    // 应该显示无权限错误或重定向到仪表盘
    await Promise.race([
      expect(page.locator('[data-testid="no-permission"]')).toBeVisible(),
      page.waitForURL('**/dashboard')
    ]);
  });

  test('分页功能', async ({ page }) => {
    // 生成大量测试数据
    const manyRoles = Array.from({ length: 25 }, (_, i) => 
      TestHelpers.generateRoleData({
        name: `role${i + 1}`,
        displayName: `角色${i + 1}`,
        description: `测试角色${i + 1}`
      })
    );
    
    // 模拟第一页数据
    await TestHelpers.mockApiResponse(
      page,
      '**/api/roles?page=1*',
      TestHelpers.generatePaginatedData(manyRoles, 1, 10)
    );
    
    await roleManagementPage.goto();
    await roleManagementPage.verifyPageLoaded();
    
    // 验证第一页显示
    let roles = await roleManagementPage.getRoleList();
    expect(roles).toHaveLength(10);
    await roleManagementPage.verifyPaginationInfo(1, 10, 25);
    
    // 模拟第二页数据
    await TestHelpers.mockApiResponse(
      page,
      '**/api/roles?page=2*',
      TestHelpers.generatePaginatedData(manyRoles, 2, 10)
    );
    
    // 切换到第二页
    await roleManagementPage.goToPage(2);
    
    // 验证第二页显示
    roles = await roleManagementPage.getRoleList();
    expect(roles).toHaveLength(10);
    await roleManagementPage.verifyPaginationInfo(2, 10, 25);
  });

  test('排序功能', async ({ page }) => {
    await roleManagementPage.goto();
    await roleManagementPage.verifyPageLoaded();
    
    // 按角色名升序排序
    const sortedRolesAsc = [...testRoles].sort((a, b) => a.name.localeCompare(b.name));
    await TestHelpers.mockApiResponse(
      page,
      '**/api/roles?sort=name&order=asc*',
      TestHelpers.generatePaginatedData(sortedRolesAsc, 1, 10)
    );
    
    await roleManagementPage.sortBy('name', 'asc');
    
    let roles = await roleManagementPage.getRoleList();
    expect(roles[0].name).toBe(sortedRolesAsc[0].name);
    
    // 按创建时间降序排序
    const sortedRolesDesc = [...testRoles].sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    await TestHelpers.mockApiResponse(
      page,
      '**/api/roles?sort=createdAt&order=desc*',
      TestHelpers.generatePaginatedData(sortedRolesDesc, 1, 10)
    );
    
    await roleManagementPage.sortBy('createdAt', 'desc');
    
    roles = await roleManagementPage.getRoleList();
    expect(roles[0].name).toBe(sortedRolesDesc[0].name);
  });

  test('空状态显示', async ({ page }) => {
    // 模拟空数据
    await TestHelpers.mockApiResponse(
      page,
      '**/api/roles*',
      TestHelpers.generatePaginatedData([], 1, 10)
    );
    
    await roleManagementPage.goto();
    await roleManagementPage.verifyPageLoaded();
    
    // 验证空状态显示
    await roleManagementPage.verifyEmptyState();
  });

  test('网络错误处理', async ({ page }) => {
    // 模拟网络错误
    await TestHelpers.mockApiError(
      page,
      '**/api/roles*',
      { code: 'network_error', message: '网络连接失败' },
      500
    );
    
    await roleManagementPage.goto();
    
    // 验证错误状态显示
    await roleManagementPage.verifyErrorState('网络连接失败');
    
    // 验证重试功能
    await TestHelpers.mockApiResponse(
      page,
      '**/api/roles*',
      TestHelpers.generatePaginatedData(testRoles, 1, 10)
    );
    
    await roleManagementPage.retryLoad();
    await roleManagementPage.verifyPageLoaded();
  });

  test('响应式设计验证', async ({ page }) => {
    await roleManagementPage.goto();
    await roleManagementPage.verifyPageLoaded();
    
    // 测试不同屏幕尺寸
    const breakpoints = [
      { name: 'mobile', width: 375, height: 667 },
      { name: 'tablet', width: 768, height: 1024 },
      { name: 'desktop', width: 1920, height: 1080 }
    ];
    
    await TestHelpers.verifyResponsiveDesign(page, breakpoints);
  });

  test('可访问性验证', async ({ page }) => {
    await roleManagementPage.goto();
    await roleManagementPage.verifyPageLoaded();
    
    // 验证键盘导航和ARIA标签
    await TestHelpers.verifyAccessibility(page);
  });
});