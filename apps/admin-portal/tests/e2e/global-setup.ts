import { chromium, FullConfig } from '@playwright/test';
import { TestHelpers } from './utils/test-helpers';

/**
 * Playwright全局设置
 * 在所有测试运行前执行一次
 */
async function globalSetup(config: FullConfig) {
  console.log('🚀 开始E2E测试全局设置...');
  
  const { baseURL } = config.projects[0].use;
  
  // 启动浏览器进行健康检查
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  try {
    console.log('⏳ 等待服务启动...');
    
    // 等待OAuth服务启动
    await waitForService('http://localhost:3001/health', 'OAuth Service');
    
    // 等待Admin Portal启动
    await waitForService(baseURL || 'http://localhost:3002', 'Admin Portal');
    
    console.log('✅ 所有服务已启动');
    
    // 初始化测试数据
    await initializeTestData();
    
    console.log('✅ 测试数据初始化完成');
    
  } catch (error) {
    console.error('❌ 全局设置失败:', error);
    throw error;
  } finally {
    await page.close();
    await browser.close();
  }
  
  console.log('✅ E2E测试全局设置完成');
}

/**
 * 等待服务启动
 */
async function waitForService(url: string, serviceName: string, maxRetries = 30) {
  console.log(`⏳ 等待 ${serviceName} 启动 (${url})...`);
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url);
      if (response.ok || response.status === 404) {
        console.log(`✅ ${serviceName} 已启动`);
        return;
      }
    } catch (error) {
      // 服务还未启动，继续等待
    }
    
    await new Promise(resolve => setTimeout(resolve, 2000)); // 等待2秒
  }
  
  throw new Error(`${serviceName} 启动超时`);
}

/**
 * 初始化测试数据
 */
async function initializeTestData() {
  console.log('⏳ 初始化测试数据...');
  
  try {
    // 创建测试用户
    await createTestUsers();
    
    // 创建测试角色
    await createTestRoles();
    
    // 创建测试客户端
    await createTestClients();
    
    console.log('✅ 测试数据创建完成');
  } catch (error) {
    console.error('❌ 测试数据初始化失败:', error);
    // 不抛出错误，允许测试继续运行
  }
}

/**
 * 创建测试用户
 */
async function createTestUsers() {
  const users = [
    {
      email: 'admin@test.com',
      password: 'admin123',
      firstName: '管理员',
      lastName: '用户',
      roles: ['admin'],
      status: 'active'
    },
    {
      email: 'editor@test.com',
      password: 'editor123',
      firstName: '编辑者',
      lastName: '用户',
      roles: ['editor'],
      status: 'active'
    },
    {
      email: 'viewer@test.com',
      password: 'viewer123',
      firstName: '查看者',
      lastName: '用户',
      roles: ['viewer'],
      status: 'active'
    },
    {
      email: '2fa@test.com',
      password: '2fa123',
      firstName: '双因素',
      lastName: '用户',
      roles: ['admin'],
      status: 'active',
      twoFactorEnabled: true
    },
    {
      email: 'locked@test.com',
      password: 'locked123',
      firstName: '锁定',
      lastName: '用户',
      roles: ['viewer'],
      status: 'locked'
    }
  ];
  
  for (const user of users) {
    try {
      await createUser(user);
      console.log(`✅ 创建测试用户: ${user.email}`);
    } catch (error) {
      console.warn(`⚠️ 用户可能已存在: ${user.email}`);
    }
  }
}

/**
 * 创建测试角色
 */
async function createTestRoles() {
  const roles = [
    {
      name: 'admin',
      displayName: '管理员',
      description: '系统管理员，拥有所有权限',
      permissions: [
        'user:read', 'user:write', 'user:delete',
        'role:read', 'role:write', 'role:delete',
        'client:read', 'client:write', 'client:delete',
        'dashboard:read', 'profile:read', 'profile:write'
      ],
      isBuiltIn: true
    },
    {
      name: 'editor',
      displayName: '编辑者',
      description: '内容编辑者，可管理用户和内容',
      permissions: [
        'user:read', 'user:write',
        'role:read',
        'client:read',
        'dashboard:read', 'profile:read', 'profile:write'
      ],
      isBuiltIn: true
    },
    {
      name: 'viewer',
      displayName: '查看者',
      description: '只读用户，只能查看信息',
      permissions: [
        'user:read',
        'dashboard:read', 'profile:read'
      ],
      isBuiltIn: true
    }
  ];
  
  for (const role of roles) {
    try {
      await createRole(role);
      console.log(`✅ 创建测试角色: ${role.name}`);
    } catch (error) {
      console.warn(`⚠️ 角色可能已存在: ${role.name}`);
    }
  }
}

/**
 * 创建测试客户端
 */
async function createTestClients() {
  const clients = [
    {
      name: 'Test Web App',
      type: 'confidential',
      redirectUris: ['http://localhost:3000/callback'],
      scopes: ['openid', 'profile', 'email'],
      description: '测试Web应用',
      status: 'active'
    },
    {
      name: 'Test Mobile App',
      type: 'public',
      redirectUris: ['myapp://callback'],
      scopes: ['openid', 'profile'],
      description: '测试移动应用',
      status: 'active',
      requirePkce: true
    },
    {
      name: 'Test API Client',
      type: 'confidential',
      redirectUris: [],
      scopes: ['api:read', 'api:write'],
      description: '测试API客户端',
      status: 'active',
      grantTypes: ['client_credentials']
    }
  ];
  
  for (const client of clients) {
    try {
      await createClient(client);
      console.log(`✅ 创建测试客户端: ${client.name}`);
    } catch (error) {
      console.warn(`⚠️ 客户端可能已存在: ${client.name}`);
    }
  }
}

/**
 * 创建用户API调用
 */
async function createUser(userData: any) {
  const response = await fetch('http://localhost:3001/api/admin/users', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${await getAdminToken()}`
    },
    body: JSON.stringify(userData)
  });
  
  if (!response.ok && response.status !== 409) { // 409 = 冲突（已存在）
    throw new Error(`创建用户失败: ${response.statusText}`);
  }
}

/**
 * 创建角色API调用
 */
async function createRole(roleData: any) {
  const response = await fetch('http://localhost:3001/api/admin/roles', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${await getAdminToken()}`
    },
    body: JSON.stringify(roleData)
  });
  
  if (!response.ok && response.status !== 409) {
    throw new Error(`创建角色失败: ${response.statusText}`);
  }
}

/**
 * 创建客户端API调用
 */
async function createClient(clientData: any) {
  const response = await fetch('http://localhost:3001/api/admin/clients', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${await getAdminToken()}`
    },
    body: JSON.stringify(clientData)
  });
  
  if (!response.ok && response.status !== 409) {
    throw new Error(`创建客户端失败: ${response.statusText}`);
  }
}

/**
 * 获取管理员令牌
 */
async function getAdminToken(): Promise<string> {
  // 使用系统管理员账户获取令牌
  const response = await fetch('http://localhost:3001/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      username: 'system@admin.com',
      password: 'system-admin-password'
    })
  });
  
  if (!response.ok) {
    // 如果系统管理员不存在，创建一个
    await createSystemAdmin();
    return getAdminToken();
  }
  
  const data = await response.json();
  return data.data.token;
}

/**
 * 创建系统管理员
 */
async function createSystemAdmin() {
  const response = await fetch('http://localhost:3001/api/setup/admin', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      email: 'system@admin.com',
      password: 'system-admin-password',
      firstName: '系统',
      lastName: '管理员'
    })
  });
  
  if (!response.ok) {
    throw new Error('创建系统管理员失败');
  }
}

export default globalSetup;