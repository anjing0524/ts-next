import { test, expect } from '@playwright/test';
import { ClientManagementPage } from '../pages/client-management-page';
import { DashboardPage } from '../pages/dashboard-page';
import { TestHelpers, TEST_USERS, TEST_PERMISSIONS, TestClient } from '../utils/test-helpers';

test.describe('客户端管理功能', () => {
  let clientManagementPage: ClientManagementPage;
  let dashboardPage: DashboardPage;
  
  const adminUser = TestHelpers.generateUserData({
    ...TEST_USERS.ADMIN,
    roles: ['admin']
  });
  
  const testClients = [
    TestHelpers.generateClientData({
      clientId: 'web-app-001',
      name: 'Web应用',
      description: '主要的Web应用客户端',
      clientType: 'confidential',
      redirectUris: ['https://app.example.com/callback'],
      scopes: ['read', 'write', 'profile'],
      grantTypes: ['authorization_code', 'refresh_token'],
      requirePkce: true,
      status: 'active'
    }),
    TestHelpers.generateClientData({
      clientId: 'mobile-app-001',
      name: '移动应用',
      description: 'iOS和Android移动应用',
      clientType: 'public',
      redirectUris: ['com.example.app://callback'],
      scopes: ['read', 'profile'],
      grantTypes: ['authorization_code'],
      requirePkce: true,
      status: 'active'
    }),
    TestHelpers.generateClientData({
      clientId: 'api-service-001',
      name: 'API服务',
      description: '后端API服务客户端',
      clientType: 'confidential',
      redirectUris: [],
      scopes: ['api:read', 'api:write'],
      grantTypes: ['client_credentials'],
      requirePkce: false,
      status: 'inactive'
    })
  ];
  
  const availableScopes = [
    { id: 'read', name: '读取权限', description: '读取基本信息' },
    { id: 'write', name: '写入权限', description: '修改数据' },
    { id: 'profile', name: '用户资料', description: '访问用户资料信息' },
    { id: 'api:read', name: 'API读取', description: 'API读取权限' },
    { id: 'api:write', name: 'API写入', description: 'API写入权限' },
    { id: 'admin', name: '管理权限', description: '管理员权限' }
  ];
  
  const grantTypes = [
    { id: 'authorization_code', name: '授权码模式', description: '标准OAuth2授权码流程' },
    { id: 'client_credentials', name: '客户端凭证模式', description: '服务间认证' },
    { id: 'refresh_token', name: '刷新令牌', description: '令牌刷新' },
    { id: 'implicit', name: '隐式模式', description: '已弃用的隐式流程' }
  ];

  test.beforeEach(async ({ page }) => {
    clientManagementPage = new ClientManagementPage(page);
    dashboardPage = new DashboardPage(page);
    
    // 设置管理员认证状态
    await TestHelpers.setAuthState(page, adminUser, [
      TEST_PERMISSIONS.CLIENTS_READ,
      TEST_PERMISSIONS.CLIENTS_WRITE,
      TEST_PERMISSIONS.CLIENTS_DELETE
    ]);
    
    // 模拟客户端列表API
    const paginatedClients = TestHelpers.generatePaginatedData(testClients, 1, 10);
    await TestHelpers.mockApiResponse(
      page,
      '**/api/clients*',
      paginatedClients
    );
    
    // 模拟作用域列表API
    await TestHelpers.mockApiResponse(
      page,
      '**/api/scopes*',
      { data: availableScopes }
    );
    
    // 模拟授权类型列表API
    await TestHelpers.mockApiResponse(
      page,
      '**/api/grant-types*',
      { data: grantTypes }
    );
  });

  test('客户端列表显示和分页', async ({ page }) => {
    await clientManagementPage.goto();
    await clientManagementPage.verifyPageLoaded();
    
    // 验证客户端列表显示
    const clients = await clientManagementPage.getClientList();
    expect(clients).toHaveLength(testClients.length);
    
    // 验证客户端信息显示正确
    for (let i = 0; i < testClients.length; i++) {
      expect(clients[i].clientId).toBe(testClients[i].clientId);
      expect(clients[i].name).toBe(testClients[i].name);
      expect(clients[i].clientType).toBe(testClients[i].clientType);
      expect(clients[i].status).toBe(testClients[i].status);
    }
    
    // 验证分页信息
    await clientManagementPage.verifyPaginationInfo(1, 10, testClients.length);
  });

  test('客户端搜索功能', async ({ page }) => {
    await clientManagementPage.goto();
    await clientManagementPage.verifyPageLoaded();
    
    // 按客户端ID搜索
    const searchQuery = 'web-app';
    const filteredClients = TestHelpers.generateSearchResults(
      testClients,
      searchQuery,
      ['clientId', 'name', 'description']
    );
    
    await TestHelpers.mockApiResponse(
      page,
      `**/api/clients?search=${searchQuery}*`,
      TestHelpers.generatePaginatedData(filteredClients, 1, 10)
    );
    
    await clientManagementPage.searchClients(searchQuery);
    
    // 验证搜索结果
    const searchResults = await clientManagementPage.getClientList();
    expect(searchResults).toHaveLength(filteredClients.length);
    expect(searchResults[0].clientId).toContain(searchQuery);
  });

  test('客户端类型筛选', async ({ page }) => {
    await clientManagementPage.goto();
    await clientManagementPage.verifyPageLoaded();
    
    // 筛选机密客户端
    const confidentialClients = testClients.filter(client => client.clientType === 'confidential');
    await TestHelpers.mockApiResponse(
      page,
      '**/api/clients?type=confidential*',
      TestHelpers.generatePaginatedData(confidentialClients, 1, 10)
    );
    
    await clientManagementPage.filterByType('confidential');
    
    // 验证筛选结果
    const filteredResults = await clientManagementPage.getClientList();
    expect(filteredResults).toHaveLength(confidentialClients.length);
    filteredResults.forEach(client => {
      expect(client.clientType).toBe('confidential');
    });
  });

  test('创建机密客户端', async ({ page }) => {
    await clientManagementPage.goto();
    await clientManagementPage.verifyPageLoaded();
    
    const newClient = TestHelpers.generateClientData({
      clientId: 'new-web-app',
      name: '新Web应用',
      description: '新创建的Web应用客户端',
      clientType: 'confidential',
      redirectUris: ['https://newapp.example.com/callback', 'https://newapp.example.com/silent-callback'],
      scopes: ['read', 'write', 'profile'],
      grantTypes: ['authorization_code', 'refresh_token'],
      requirePkce: true
    });
    
    // 模拟创建客户端API
    const createdClient = {
      ...newClient,
      clientSecret: 'generated-secret-123'
    };
    await TestHelpers.mockApiResponse(
      page,
      '**/api/clients',
      { success: true, data: createdClient }
    );
    
    await clientManagementPage.clickCreateClient();
    await clientManagementPage.fillClientForm({
      clientId: newClient.clientId,
      name: newClient.name,
      description: newClient.description,
      clientType: newClient.clientType,
      redirectUris: newClient.redirectUris,
      requirePkce: newClient.requirePkce
    });
    
    // 选择作用域和授权类型
    await clientManagementPage.selectScopes(newClient.scopes);
    await clientManagementPage.selectGrantTypes(newClient.grantTypes);
    
    await clientManagementPage.submitClientForm();
    
    // 验证创建成功
    await clientManagementPage.verifyOperationSuccess();
    
    // 验证客户端密钥显示
    await clientManagementPage.verifyClientSecretGenerated(createdClient.clientSecret);
    
    // 验证API调用
    await TestHelpers.verifyApiCall(page, '/api/clients', 'POST', {
      clientId: newClient.clientId,
      name: newClient.name,
      description: newClient.description,
      clientType: newClient.clientType,
      redirectUris: newClient.redirectUris,
      scopes: newClient.scopes,
      grantTypes: newClient.grantTypes,
      requirePkce: newClient.requirePkce
    });
  });

  test('创建公共客户端', async ({ page }) => {
    await clientManagementPage.goto();
    await clientManagementPage.verifyPageLoaded();
    
    const newPublicClient = TestHelpers.generateClientData({
      clientId: 'new-mobile-app',
      name: '新移动应用',
      description: '新创建的移动应用客户端',
      clientType: 'public',
      redirectUris: ['com.newapp://callback'],
      scopes: ['read', 'profile'],
      grantTypes: ['authorization_code'],
      requirePkce: true
    });
    
    // 模拟创建公共客户端API
    await TestHelpers.mockApiResponse(
      page,
      '**/api/clients',
      { success: true, data: newPublicClient }
    );
    
    await clientManagementPage.clickCreateClient();
    await clientManagementPage.fillClientForm({
      clientId: newPublicClient.clientId,
      name: newPublicClient.name,
      description: newPublicClient.description,
      clientType: newPublicClient.clientType,
      redirectUris: newPublicClient.redirectUris,
      requirePkce: newPublicClient.requirePkce
    });
    
    // 验证公共客户端不显示客户端密钥字段
    await clientManagementPage.verifyNoClientSecretField();
    
    // 验证PKCE是必需的
    await clientManagementPage.verifyPkceRequired();
    
    await clientManagementPage.selectScopes(newPublicClient.scopes);
    await clientManagementPage.selectGrantTypes(newPublicClient.grantTypes);
    
    await clientManagementPage.submitClientForm();
    
    // 验证创建成功
    await clientManagementPage.verifyOperationSuccess();
  });

  test('编辑客户端信息', async ({ page }) => {
    await clientManagementPage.goto();
    await clientManagementPage.verifyPageLoaded();
    
    const clientToEdit = testClients[0];
    const updatedClient = {
      ...clientToEdit,
      name: '更新的Web应用',
      description: '更新的描述',
      redirectUris: ['https://app.example.com/callback', 'https://app.example.com/new-callback'],
      scopes: ['read', 'write', 'profile', 'admin']
    };
    
    // 模拟更新客户端API
    await TestHelpers.mockApiResponse(
      page,
      `**/api/clients/${clientToEdit.id}`,
      { success: true, data: updatedClient }
    );
    
    await clientManagementPage.editClient(clientToEdit.clientId);
    await clientManagementPage.fillClientForm({
      name: updatedClient.name,
      description: updatedClient.description,
      redirectUris: updatedClient.redirectUris
    });
    
    // 更新作用域选择
    await clientManagementPage.selectScopes(updatedClient.scopes);
    
    await clientManagementPage.submitClientForm();
    
    // 验证更新成功
    await clientManagementPage.verifyOperationSuccess();
    
    // 验证API调用
    await TestHelpers.verifyApiCall(page, `/api/clients/${clientToEdit.id}`, 'PUT');
  });

  test('删除客户端', async ({ page }) => {
    await clientManagementPage.goto();
    await clientManagementPage.verifyPageLoaded();
    
    const clientToDelete = testClients[2]; // 选择非活跃客户端
    
    // 模拟删除客户端API
    await TestHelpers.mockApiResponse(
      page,
      `**/api/clients/${clientToDelete.id}`,
      { success: true }
    );
    
    await clientManagementPage.deleteClient(clientToDelete.clientId);
    await clientManagementPage.confirmDelete();
    
    // 验证删除成功
    await clientManagementPage.verifyOperationSuccess();
    
    // 验证API调用
    await TestHelpers.verifyApiCall(page, `/api/clients/${clientToDelete.id}`, 'DELETE');
  });

  test('客户端密钥管理', async ({ page }) => {
    await clientManagementPage.goto();
    await clientManagementPage.verifyPageLoaded();
    
    const confidentialClient = testClients[0];
    
    // 查看客户端密钥
    await clientManagementPage.viewClientSecret(confidentialClient.clientId);
    await clientManagementPage.verifyClientSecretMasked();
    
    // 显示客户端密钥
    await clientManagementPage.revealClientSecret();
    await clientManagementPage.verifyClientSecretRevealed();
    
    // 重新生成客户端密钥
    const newSecret = 'new-generated-secret-456';
    await TestHelpers.mockApiResponse(
      page,
      `**/api/clients/${confidentialClient.id}/secret`,
      { success: true, clientSecret: newSecret }
    );
    
    await clientManagementPage.regenerateClientSecret();
    await clientManagementPage.confirmSecretRegeneration();
    
    // 验证新密钥显示
    await clientManagementPage.verifyNewClientSecret(newSecret);
    
    // 验证API调用
    await TestHelpers.verifyApiCall(
      page,
      `/api/clients/${confidentialClient.id}/secret`,
      'POST'
    );
  });

  test('批量操作客户端', async ({ page }) => {
    await clientManagementPage.goto();
    await clientManagementPage.verifyPageLoaded();
    
    const clientsToSelect = [testClients[1].clientId, testClients[2].clientId];
    
    // 模拟批量删除API
    await TestHelpers.mockApiResponse(
      page,
      '**/api/clients/batch',
      { success: true, deletedCount: 2 }
    );
    
    // 选择多个客户端
    for (const clientId of clientsToSelect) {
      await clientManagementPage.selectClient(clientId);
    }
    
    // 执行批量删除
    await clientManagementPage.batchDeleteClients();
    await clientManagementPage.confirmBatchOperation();
    
    // 验证批量操作成功
    await clientManagementPage.verifyOperationSuccess();
  });

  test('客户端状态切换', async ({ page }) => {
    await clientManagementPage.goto();
    await clientManagementPage.verifyPageLoaded();
    
    const clientToToggle = testClients[0];
    const newStatus = clientToToggle.status === 'active' ? 'inactive' : 'active';
    
    // 模拟状态切换API
    await TestHelpers.mockApiResponse(
      page,
      `**/api/clients/${clientToToggle.id}/status`,
      { success: true, status: newStatus }
    );
    
    await clientManagementPage.toggleClientStatus(clientToToggle.clientId);
    
    // 验证状态切换成功
    await clientManagementPage.verifyOperationSuccess();
    
    // 验证API调用
    await TestHelpers.verifyApiCall(
      page,
      `/api/clients/${clientToToggle.id}/status`,
      'PATCH',
      { status: newStatus }
    );
  });

  test('客户端详情查看', async ({ page }) => {
    await clientManagementPage.goto();
    await clientManagementPage.verifyPageLoaded();
    
    const clientToView = testClients[0];
    
    // 模拟客户端详情API
    await TestHelpers.mockApiResponse(
      page,
      `**/api/clients/${clientToView.id}`,
      { data: clientToView }
    );
    
    await clientManagementPage.viewClientDetails(clientToView.clientId);
    
    // 验证详情显示
    await clientManagementPage.verifyClientDetails({
      clientId: clientToView.clientId,
      name: clientToView.name,
      description: clientToView.description,
      clientType: clientToView.clientType,
      redirectUris: clientToView.redirectUris,
      scopes: clientToView.scopes,
      grantTypes: clientToView.grantTypes,
      requirePkce: clientToView.requirePkce,
      status: clientToView.status
    });
  });

  test('表单验证', async ({ page }) => {
    await clientManagementPage.goto();
    await clientManagementPage.verifyPageLoaded();
    
    await clientManagementPage.clickCreateClient();
    
    // 测试必填字段验证
    await clientManagementPage.submitClientForm();
    await clientManagementPage.verifyValidationError('clientId', '客户端ID不能为空');
    await clientManagementPage.verifyValidationError('name', '客户端名称不能为空');
    await clientManagementPage.verifyValidationError('clientType', '请选择客户端类型');
    
    // 测试客户端ID格式验证
    await clientManagementPage.fillClientForm({
      clientId: 'Invalid Client ID!', // 包含特殊字符
      name: '测试客户端',
      clientType: 'confidential'
    });
    await clientManagementPage.submitClientForm();
    await clientManagementPage.verifyValidationError('clientId', '客户端ID只能包含字母、数字、连字符和下划线');
    
    // 测试重定向URI格式验证
    await clientManagementPage.fillClientForm({
      clientId: 'valid-client-id',
      name: '测试客户端',
      clientType: 'confidential',
      redirectUris: ['invalid-uri', 'https://valid.example.com/callback']
    });
    await clientManagementPage.submitClientForm();
    await clientManagementPage.verifyValidationError('redirectUris', '重定向URI格式无效');
    
    // 测试客户端ID重复验证
    await TestHelpers.mockApiError(
      page,
      '**/api/clients',
      { code: 'client_exists', message: '客户端ID已存在' },
      409
    );
    
    await clientManagementPage.fillClientForm({
      clientId: testClients[0].clientId,
      name: '新客户端',
      clientType: 'confidential',
      redirectUris: ['https://example.com/callback']
    });
    await clientManagementPage.submitClientForm();
    await clientManagementPage.verifyOperationError('客户端ID已存在');
    
    // 测试作用域选择验证
    await clientManagementPage.fillClientForm({
      clientId: 'valid-client',
      name: '有效客户端',
      clientType: 'confidential',
      redirectUris: ['https://example.com/callback']
    });
    await clientManagementPage.submitClientForm();
    await clientManagementPage.verifyValidationError('scopes', '至少选择一个作用域');
    
    // 测试授权类型选择验证
    await clientManagementPage.selectScopes(['read']);
    await clientManagementPage.submitClientForm();
    await clientManagementPage.verifyValidationError('grantTypes', '至少选择一个授权类型');
  });

  test('客户端类型限制验证', async ({ page }) => {
    await clientManagementPage.goto();
    await clientManagementPage.verifyPageLoaded();
    
    await clientManagementPage.clickCreateClient();
    
    // 测试公共客户端限制
    await clientManagementPage.fillClientForm({
      clientType: 'public'
    });
    
    // 验证公共客户端必须使用PKCE
    await clientManagementPage.verifyPkceRequired();
    
    // 验证公共客户端不能使用客户端凭证模式
    await clientManagementPage.selectGrantTypes(['client_credentials']);
    await clientManagementPage.verifyGrantTypeRestriction('公共客户端不能使用客户端凭证模式');
    
    // 测试机密客户端
    await clientManagementPage.fillClientForm({
      clientType: 'confidential'
    });
    
    // 验证机密客户端可以选择所有授权类型
    await clientManagementPage.verifyAllGrantTypesAvailable();
  });

  test('PKCE要求验证', async ({ page }) => {
    await clientManagementPage.goto();
    await clientManagementPage.verifyPageLoaded();
    
    await clientManagementPage.clickCreateClient();
    
    // 公共客户端必须启用PKCE
    await clientManagementPage.fillClientForm({
      clientType: 'public'
    });
    await clientManagementPage.verifyPkceRequired();
    await clientManagementPage.verifyPkceCannotBeDisabled();
    
    // 机密客户端可以选择是否启用PKCE
    await clientManagementPage.fillClientForm({
      clientType: 'confidential'
    });
    await clientManagementPage.verifyPkceOptional();
    
    // 验证PKCE推荐提示
    await clientManagementPage.verifyPkceRecommendation();
  });

  test('OAuth配置验证', async ({ page }) => {
    await clientManagementPage.goto();
    await clientManagementPage.verifyPageLoaded();
    
    const client = testClients[0];
    await clientManagementPage.viewClientDetails(client.clientId);
    
    // 验证OAuth配置信息显示
    await clientManagementPage.verifyOAuthConfiguration({
      authorizationEndpoint: 'https://auth.example.com/oauth/authorize',
      tokenEndpoint: 'https://auth.example.com/oauth/token',
      userInfoEndpoint: 'https://auth.example.com/oauth/userinfo',
      jwksUri: 'https://auth.example.com/.well-known/jwks.json'
    });
    
    // 验证示例代码生成
    await clientManagementPage.generateSampleCode('javascript');
    await clientManagementPage.verifySampleCodeGenerated();
  });

  test('权限控制验证', async ({ page }) => {
    // 测试只读权限用户
    const readOnlyUser = TestHelpers.generateUserData({
      ...TEST_USERS.VIEWER,
      roles: ['viewer']
    });
    
    await TestHelpers.setAuthState(page, readOnlyUser, [TEST_PERMISSIONS.CLIENTS_READ]);
    
    await clientManagementPage.goto();
    await clientManagementPage.verifyPageLoaded();
    
    // 验证只能查看，不能编辑
    await clientManagementPage.verifyReadOnlyMode();
    
    // 验证创建按钮不可见
    await expect(page.locator('[data-testid="create-client-button"]')).not.toBeVisible();
    
    // 验证编辑和删除按钮不可见
    await expect(page.locator('[data-testid="edit-client-button"]')).not.toBeVisible();
    await expect(page.locator('[data-testid="delete-client-button"]')).not.toBeVisible();
    
    // 验证客户端密钥不可见
    await expect(page.locator('[data-testid="view-client-secret"]')).not.toBeVisible();
  });

  test('无权限访问保护', async ({ page }) => {
    // 设置无权限用户
    const noPermissionUser = TestHelpers.generateUserData({
      username: 'noperm',
      roles: ['basic']
    });
    
    await TestHelpers.setAuthState(page, noPermissionUser, []);
    
    // 尝试访问客户端管理页面
    await clientManagementPage.goto();
    
    // 应该显示无权限错误或重定向到仪表盘
    await Promise.race([
      expect(page.locator('[data-testid="no-permission"]')).toBeVisible(),
      page.waitForURL('**/dashboard')
    ]);
  });

  test('分页功能', async ({ page }) => {
    // 生成大量测试数据
    const manyClients = Array.from({ length: 25 }, (_, i) => 
      TestHelpers.generateClientData({
        clientId: `client-${i + 1}`,
        name: `客户端${i + 1}`,
        description: `测试客户端${i + 1}`
      })
    );
    
    // 模拟第一页数据
    await TestHelpers.mockApiResponse(
      page,
      '**/api/clients?page=1*',
      TestHelpers.generatePaginatedData(manyClients, 1, 10)
    );
    
    await clientManagementPage.goto();
    await clientManagementPage.verifyPageLoaded();
    
    // 验证第一页显示
    let clients = await clientManagementPage.getClientList();
    expect(clients).toHaveLength(10);
    await clientManagementPage.verifyPaginationInfo(1, 10, 25);
    
    // 模拟第二页数据
    await TestHelpers.mockApiResponse(
      page,
      '**/api/clients?page=2*',
      TestHelpers.generatePaginatedData(manyClients, 2, 10)
    );
    
    // 切换到第二页
    await clientManagementPage.goToPage(2);
    
    // 验证第二页显示
    clients = await clientManagementPage.getClientList();
    expect(clients).toHaveLength(10);
    await clientManagementPage.verifyPaginationInfo(2, 10, 25);
  });

  test('排序功能', async ({ page }) => {
    await clientManagementPage.goto();
    await clientManagementPage.verifyPageLoaded();
    
    // 按客户端ID升序排序
    const sortedClientsAsc = [...testClients].sort((a, b) => a.clientId.localeCompare(b.clientId));
    await TestHelpers.mockApiResponse(
      page,
      '**/api/clients?sort=clientId&order=asc*',
      TestHelpers.generatePaginatedData(sortedClientsAsc, 1, 10)
    );
    
    await clientManagementPage.sortBy('clientId', 'asc');
    
    let clients = await clientManagementPage.getClientList();
    expect(clients[0].clientId).toBe(sortedClientsAsc[0].clientId);
    
    // 按创建时间降序排序
    const sortedClientsDesc = [...testClients].sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    await TestHelpers.mockApiResponse(
      page,
      '**/api/clients?sort=createdAt&order=desc*',
      TestHelpers.generatePaginatedData(sortedClientsDesc, 1, 10)
    );
    
    await clientManagementPage.sortBy('createdAt', 'desc');
    
    clients = await clientManagementPage.getClientList();
    expect(clients[0].clientId).toBe(sortedClientsDesc[0].clientId);
  });

  test('空状态显示', async ({ page }) => {
    // 模拟空数据
    await TestHelpers.mockApiResponse(
      page,
      '**/api/clients*',
      TestHelpers.generatePaginatedData([], 1, 10)
    );
    
    await clientManagementPage.goto();
    await clientManagementPage.verifyPageLoaded();
    
    // 验证空状态显示
    await clientManagementPage.verifyEmptyState();
  });

  test('网络错误处理', async ({ page }) => {
    // 模拟网络错误
    await TestHelpers.mockApiError(
      page,
      '**/api/clients*',
      { code: 'network_error', message: '网络连接失败' },
      500
    );
    
    await clientManagementPage.goto();
    
    // 验证错误状态显示
    await clientManagementPage.verifyErrorState('网络连接失败');
    
    // 验证重试功能
    await TestHelpers.mockApiResponse(
      page,
      '**/api/clients*',
      TestHelpers.generatePaginatedData(testClients, 1, 10)
    );
    
    await clientManagementPage.retryLoad();
    await clientManagementPage.verifyPageLoaded();
  });

  test('响应式设计验证', async ({ page }) => {
    await clientManagementPage.goto();
    await clientManagementPage.verifyPageLoaded();
    
    // 测试不同屏幕尺寸
    const breakpoints = [
      { name: 'mobile', width: 375, height: 667 },
      { name: 'tablet', width: 768, height: 1024 },
      { name: 'desktop', width: 1920, height: 1080 }
    ];
    
    await TestHelpers.verifyResponsiveDesign(page, breakpoints);
  });

  test('可访问性验证', async ({ page }) => {
    await clientManagementPage.goto();
    await clientManagementPage.verifyPageLoaded();
    
    // 验证键盘导航和ARIA标签
    await TestHelpers.verifyAccessibility(page);
  });
});