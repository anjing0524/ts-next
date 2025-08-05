/**
 * 测试数据配置
 * 包含所有E2E测试所需的测试用户和配置
 */

export const TestUsers = {
  admin: {
    username: 'admin',
    password: 'adminpassword',
    displayName: '系统管理员',
    email: 'admin@example.com',
    roles: ['SYSTEM_ADMIN'],
  },
  userAdmin: {
    username: 'useradmin',
    password: 'password',
    displayName: '用户管理员',
    email: 'useradmin@example.com',
    roles: ['USER_ADMIN'],
  },
  regularUser: {
    username: 'testuser',
    password: 'password',
    displayName: '普通用户',
    email: 'testuser@example.com',
    roles: ['USER'],
  },
  inactiveUser: {
    username: 'inactiveuser',
    password: 'password',
    displayName: '停用用户',
    email: 'inactiveuser@example.com',
    roles: ['USER'],
  },
  lockedUser: {
    username: 'lockeduser',
    password: 'password',
    displayName: '锁定用户',
    email: 'lockeduser@example.com',
    roles: ['USER'],
  },
};

export const OAuthConfig = {
  clientId: 'admin-portal-client',
  redirectUri: 'http://localhost:3002/auth/callback',
  scopes: [
    'openid',
    'profile',
    'email',
    'user:read',
    'user:write',
    'role:read',
    'role:write',
    'permission:read',
    'permission:write',
    'client:read',
    'client:write',
    'audit:read',
  ],
};

export const APIEndpoints = {
  login: 'http://localhost:3001/api/v2/auth/login',
  authorize: 'http://localhost:3001/api/v2/oauth/authorize',
  token: 'http://localhost:3001/api/v2/oauth/token',
  userinfo: 'http://localhost:3001/api/v2/oauth/userinfo',
  logout: 'http://localhost:3001/api/v2/auth/logout',
};

export const TestUrls = {
  login: 'http://localhost:3002/login',
  dashboard: 'http://localhost:3002/dashboard',
  callback: 'http://localhost:3002/auth/callback',
  adminUsers: 'http://localhost:3002/admin/users',
  adminRoles: 'http://localhost:3002/admin/roles',
  adminClients: 'http://localhost:3002/admin/clients',
  adminAudits: 'http://localhost:3002/admin/audit',
};

export const ErrorMessages = {
  invalidCredentials: '用户名或密码错误',
  networkError: '网络错误，请稍后重试',
  serverError: '服务器错误，请稍后重试',
  sessionExpired: '会话已过期，请重新登录',
  accessDenied: '访问被拒绝',
  validationErrors: {
    usernameRequired: '请输入用户名',
    passwordRequired: '请输入密码',
    usernameMinLength: '用户名至少需要3个字符',
    passwordMinLength: '密码至少需要6个字符',
  },
};

export const Selectors = {
  login: {
    form: '[data-testid="login-form"]',
    username: '[data-testid="username-input"]',
    password: '[data-testid="password-input"]',
    loginButton: '[data-testid="login-button"]',
    oauthButton: 'button:has-text("使用 OAuth 登录")',
    errorMessage: '[data-testid="error-message"]',
    loadingSpinner: '[data-testid="loading-spinner"]',
  },
  dashboard: {
    welcomeMessage: '[data-testid="welcome-message"]',
    userMenu: '[data-testid="user-menu"]',
    logoutButton: '[data-testid="logout-button"]',
    navigation: '[data-testid="navigation-menu"]',
  },
  oauth: {
    authorizeButton: 'button:has-text("同意")',
    denyButton: 'button:has-text("拒绝")',
    clientInfo: '[data-testid="client-info"]',
    scopeList: '[data-testid="scope-list"]',
  },
};

export const TestData = {
  newUser: {
    username: 'testuser-new',
    password: 'Test@123456',
    firstName: '测试',
    lastName: '用户',
    email: 'testuser-new@example.com',
    displayName: '新测试用户',
    isActive: true,
  },
  newRole: {
    name: 'TEST_ROLE',
    displayName: '测试角色',
    description: '用于测试的角色',
    permissions: ['user:read', 'user:write'],
  },
  newClient: {
    clientId: 'test-client-e2e',
    name: '测试客户端',
    description: '用于E2E测试的客户端',
    redirectUris: ['http://localhost:3000/callback'],
    allowedScopes: ['openid', 'profile'],
  },
};