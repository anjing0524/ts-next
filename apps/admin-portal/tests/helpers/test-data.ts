/**
 * 测试数据管理工具
 * 提供创建、管理和清理测试数据的方法
 */

/**
 * 测试用户数据
 */
export const TEST_USERS = {
  admin: {
    username: 'admin',
    password: 'adminpassword',
    email: 'admin@example.com',
    roles: ['admin'],
    permissions: ['admin:full_access'],
  },
  user: {
    username: 'testuser',
    password: 'userpassword',
    email: 'user@example.com',
    roles: ['user'],
    permissions: ['user:read'],
  },
  manager: {
    username: 'manager',
    password: 'managerpassword',
    email: 'manager@example.com',
    roles: ['manager'],
    permissions: ['user:read', 'user:write'],
  },
} as const;

/**
 * 测试OAuth客户端数据
 */
export const TEST_CLIENTS = {
  adminPortal: {
    clientId: 'auth-center-admin-client',
    clientSecret: 'authcenteradminclientsecret',
    clientName: 'Admin Portal',
    redirectUris: ['http://localhost:3002/auth/callback'],
    grantTypes: ['authorization_code', 'refresh_token'],
    responseTypes: ['code'],
    scope: 'openid profile email admin:portal',
  },
  testClient: {
    clientId: 'test-client',
    clientSecret: 'test-client-secret',
    clientName: 'Test Client',
    redirectUris: ['http://localhost:3002/test/callback'],
    grantTypes: ['authorization_code', 'client_credentials'],
    responseTypes: ['code'],
    scope: 'openid profile',
  },
} as const;

/**
 * 测试角色数据
 */
export const TEST_ROLES = {
  admin: {
    name: 'admin',
    description: '系统管理员',
    permissions: [
      'admin:full_access',
      'users:read',
      'users:write',
      'roles:read',
      'roles:write',
      'clients:read',
      'clients:write',
    ],
  },
  manager: {
    name: 'manager',
    description: '管理者',
    permissions: ['users:read', 'users:write', 'roles:read'],
  },
  user: {
    name: 'user',
    description: '普通用户',
    permissions: ['profile:read', 'profile:write'],
  },
} as const;

/**
 * 测试权限数据
 */
export const TEST_PERMISSIONS = {
  adminFullAccess: {
    name: 'admin:full_access',
    description: '管理员完全访问权限',
    category: 'admin',
  },
  usersRead: {
    name: 'users:read',
    description: '读取用户信息',
    category: 'users',
  },
  usersWrite: {
    name: 'users:write',
    description: '修改用户信息',
    category: 'users',
  },
  rolesRead: {
    name: 'roles:read',
    description: '读取角色信息',
    category: 'roles',
  },
  rolesWrite: {
    name: 'roles:write',
    description: '修改角色信息',
    category: 'roles',
  },
  clientsRead: {
    name: 'clients:read',
    description: '读取客户端信息',
    category: 'clients',
  },
  clientsWrite: {
    name: 'clients:write',
    description: '修改客户端信息',
    category: 'clients',
  },
  profileRead: {
    name: 'profile:read',
    description: '读取个人资料',
    category: 'profile',
  },
  profileWrite: {
    name: 'profile:write',
    description: '修改个人资料',
    category: 'profile',
  },
} as const;

/**
 * 测试数据管理器
 */
export class TestDataManager {
  private static getApiUrl() {
    return process.env.NEXT_PUBLIC_OAUTH_SERVICE_URL || 'http://localhost:3001';
  }

  /**
   * Creates a user for testing via API.
   * This requires the test runner to have an admin-level token or a specific test setup endpoint.
   */
  static async setupTestUser(userData: any) {
    // In a real scenario, this would be an API call to a test-setup endpoint.
    // For this example, we assume a direct DB manipulation or a special endpoint exists.
    console.log('Setting up test user:', userData.username);
    // Placeholder for actual user creation logic
    return { id: `user-${Date.now()}`, ...userData };
  }

  /**
   * Cleans up test data via API.
   */
  static async cleanupTestData() {
    console.log('Cleaning up test data...');
    // Placeholder for cleanup logic
  }

  /**
   * 获取测试用户凭据
   * @param userType - 用户类型
   * @returns 用户凭据
   */
  static getUserCredentials(userType: keyof typeof TEST_USERS) {
    return TEST_USERS[userType];
  }

  /**
   * 获取测试客户端配置
   * @param clientType - 客户端类型
   * @returns 客户端配置
   */
  static getClientConfig(clientType: keyof typeof TEST_CLIENTS) {
    return TEST_CLIENTS[clientType];
  }

  /**
   * 获取测试角色
   * @param roleType - 角色类型
   * @returns 角色数据
   */
  static getRole(roleType: keyof typeof TEST_ROLES) {
    return TEST_ROLES[roleType];
  }

  /**
   * 获取测试权限
   * @param permissionType - 权限类型
   * @returns 权限数据
   */
  static getPermission(permissionType: keyof typeof TEST_PERMISSIONS) {
    return TEST_PERMISSIONS[permissionType];
  }

  /**
   * 生成随机测试数据
   * @param prefix - 前缀
   * @returns 随机字符串
   */
  static generateRandomData(prefix = 'test') {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `${prefix}_${timestamp}_${random}`;
  }

  /**
   * 创建测试用户数据
   * @param overrides - 覆盖字段
   * @returns 用户数据
   */
  static createTestUser(overrides: Partial<typeof TEST_USERS.admin> = {}) {
    return {
      ...TEST_USERS.admin,
      username: this.generateRandomData('user'),
      email: `${this.generateRandomData('user')}@example.com`,
      ...overrides,
    };
  }

  /**
   * 创建测试客户端数据
   * @param overrides - 覆盖字段
   * @returns 客户端数据
   */
  static createTestClient(overrides: Partial<typeof TEST_CLIENTS.testClient> = {}) {
    const randomId = this.generateRandomData('client');
    return {
      ...TEST_CLIENTS.testClient,
      clientId: randomId,
      clientName: `Test Client ${randomId}`,
      ...overrides,
    };
  }

  /**
   * 创建测试角色数据
   * @param overrides - 覆盖字段
   * @returns 角色数据
   */
  static createTestRole(overrides: Partial<typeof TEST_ROLES.user> = {}) {
    return {
      ...TEST_ROLES.user,
      name: this.generateRandomData('role'),
      description: `Test Role ${this.generateRandomData()}`,
      ...overrides,
    };
  }

  /**
   * 创建测试权限数据
   * @param overrides - 覆盖字段
   * @returns 权限数据
   */
  static createTestPermission(overrides: Partial<typeof TEST_PERMISSIONS.profileRead> = {}) {
    return {
      ...TEST_PERMISSIONS.profileRead,
      name: this.generateRandomData('permission'),
      description: `Test Permission ${this.generateRandomData()}`,
      ...overrides,
    };
  }

  /**
   * 验证必要的测试数据
   * @returns 验证结果
   */
  static validateTestData() {
    const errors: string[] = [];

    // 验证用户数据
    Object.entries(TEST_USERS).forEach(([key, user]) => {
      if (!user.username || !user.password) {
        errors.push(`用户 ${key} 缺少必要字段`);
      }
    });

    // 验证客户端数据
    Object.entries(TEST_CLIENTS).forEach(([key, client]) => {
      if (!client.clientId || !client.clientSecret) {
        errors.push(`客户端 ${key} 缺少必要字段`);
      }
    });

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
