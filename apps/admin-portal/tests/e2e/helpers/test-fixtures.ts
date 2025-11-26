/**
 * E2E 测试 Fixtures
 *
 * 提供测试数据,包括:
 * - 测试用户
 * - OAuth 客户端
 * - 测试角色和权限
 * - API 端点
 */

/**
 * 测试用户配置
 */
export const TEST_USERS = {
    /**
     * 管理员用户 - 拥有所有权限
     */
    admin: {
        username: process.env.TEST_ADMIN_USERNAME || 'admin',
        password: process.env.TEST_ADMIN_PASSWORD || 'admin123',
        email: 'admin@example.com',
        displayName: 'Administrator',
        permissions: ['*'], // 通配符权限
        roles: ['admin'],
        description: '系统管理员,拥有所有权限',
    },

    /**
     * 查看者用户 - 仅查看权限
     */
    viewer: {
        username: 'viewer',
        password: 'viewer123',
        email: 'viewer@example.com',
        displayName: 'Viewer User',
        permissions: [
            'users:list',
            'users:read',
            'roles:list',
            'roles:read',
            'menu:system:user:view',
            'menu:system:role:view',
        ],
        roles: ['viewer'],
        description: '查看者,仅有读取权限',
    },

    /**
     * 编辑者用户 - 查看和编辑权限
     */
    editor: {
        username: 'editor',
        password: 'editor123',
        email: 'editor@example.com',
        displayName: 'Editor User',
        permissions: [
            'users:list',
            'users:read',
            'users:create',
            'users:update',
            'roles:list',
            'roles:read',
            'menu:system:user:view',
            'menu:system:role:view',
        ],
        roles: ['editor'],
        description: '编辑者,可以查看和修改用户',
    },

    /**
     * 用户管理员 - 用户相关的所有权限
     */
    userAdmin: {
        username: 'user_admin',
        password: 'useradmin123',
        email: 'useradmin@example.com',
        displayName: 'User Administrator',
        permissions: ['users:*', 'menu:system:user:view'],
        roles: ['user_admin'],
        description: '用户管理员,拥有用户管理的所有权限',
    },

    /**
     * 无效用户 - 用于测试登录失败
     */
    invalid: {
        username: 'invalid_user_xyz',
        password: 'wrong_password_123',
        email: 'invalid@example.com',
        displayName: 'Invalid User',
        permissions: [],
        roles: [],
        description: '无效用户,用于测试认证失败场景',
    },
} as const;

/**
 * OAuth 客户端配置
 */
export const TEST_CLIENTS = {
    /**
     * Admin Portal 客户端
     */
    adminPortal: {
        client_id: 'admin-portal-client',
        client_secret: process.env.ADMIN_PORTAL_CLIENT_SECRET || 'admin-portal-secret',
        client_type: 'confidential',
        grant_types: ['authorization_code', 'refresh_token'],
        redirect_uris: [
            'http://localhost:6188/auth/callback',
            'http://localhost:3002/auth/callback',
        ],
        allowed_scopes: ['openid', 'profile', 'email'],
        description: 'Admin Portal Web 应用',
    },

    /**
     * 后端服务客户端 (Machine-to-Machine)
     */
    backendService: {
        client_id: 'backend-service-client',
        client_secret: process.env.BACKEND_SERVICE_CLIENT_SECRET || 'backend-service-secret',
        client_type: 'confidential',
        grant_types: ['client_credentials'],
        redirect_uris: [],
        allowed_scopes: ['api:read', 'api:write'],
        description: '后端服务 M2M 客户端',
    },

    /**
     * 移动应用客户端 (Public Client)
     */
    mobileApp: {
        client_id: 'mobile-app-client',
        client_secret: '', // Public client 没有 secret
        client_type: 'public',
        grant_types: ['authorization_code', 'refresh_token'],
        redirect_uris: ['myapp://oauth/callback'],
        allowed_scopes: ['openid', 'profile', 'email', 'offline_access'],
        description: '移动应用 (iOS/Android)',
    },
} as const;

/**
 * 测试角色配置
 */
export const TEST_ROLES = {
    admin: {
        name: 'admin',
        display_name: '系统管理员',
        description: '拥有系统的所有权限',
        permissions: ['*'],
    },
    viewer: {
        name: 'viewer',
        display_name: '查看者',
        description: '只能查看数据,不能修改',
        permissions: [
            'users:list',
            'users:read',
            'roles:list',
            'roles:read',
        ],
    },
    editor: {
        name: 'editor',
        display_name: '编辑者',
        description: '可以查看和编辑数据',
        permissions: [
            'users:list',
            'users:read',
            'users:create',
            'users:update',
            'roles:list',
            'roles:read',
        ],
    },
} as const;

/**
 * 权限配置
 */
export const PERMISSIONS = {
    // 用户权限
    users: {
        list: 'users:list',
        read: 'users:read',
        create: 'users:create',
        update: 'users:update',
        delete: 'users:delete',
        all: 'users:*',
    },
    // 角色权限
    roles: {
        list: 'roles:list',
        read: 'roles:read',
        create: 'roles:create',
        update: 'roles:update',
        delete: 'roles:delete',
        manage: 'roles:manage',
        all: 'roles:*',
    },
    // 菜单权限
    menu: {
        systemUser: 'menu:system:user:view',
        systemRole: 'menu:system:role:view',
    },
    // 通配符
    wildcard: '*',
} as const;

/**
 * API 端点配置
 */
export const API_ENDPOINTS = {
    // OAuth 认证端点
    oauth: {
        authorize: '/api/v2/oauth/authorize',
        token: '/api/v2/oauth/token',
        revoke: '/api/v2/oauth/revoke',
        introspect: '/api/v2/oauth/introspect',
        userinfo: '/api/v2/oauth/userinfo',
    },
    // 认证端点
    auth: {
        login: '/api/v2/auth/login',
        logout: '/api/v2/auth/logout',
        refresh: '/api/v2/auth/refresh',
    },
    // 用户管理端点
    users: {
        list: '/api/v2/admin/users',
        create: '/api/v2/admin/users',
        read: (id: string) => `/api/v2/admin/users/${id}`,
        update: (id: string) => `/api/v2/admin/users/${id}`,
        delete: (id: string) => `/api/v2/admin/users/${id}`,
    },
    // 角色管理端点
    roles: {
        list: '/api/v2/admin/roles',
        create: '/api/v2/admin/roles',
        read: (id: string) => `/api/v2/admin/roles/${id}`,
        update: (id: string) => `/api/v2/admin/roles/${id}`,
        delete: (id: string) => `/api/v2/admin/roles/${id}`,
        permissions: (id: string) => `/api/v2/admin/roles/${id}/permissions`,
    },
    // 权限管理端点
    permissions: {
        list: '/api/v2/admin/permissions',
    },
} as const;

/**
 * 测试配置
 */
export const TEST_CONFIG = {
    // 基础 URL
    baseUrl: process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:3002',

    // 超时配置
    timeouts: {
        short: 2000,
        medium: 5000,
        long: 10000,
        veryLong: 30000,
    },

    // Token 配置
    tokens: {
        accessTokenTTL: 3600, // 1 hour
        refreshTokenTTL: 2592000, // 30 days
        authCodeTTL: 600, // 10 minutes
    },

    // PKCE 配置
    pkce: {
        verifierLength: 128, // 43-128 字符
        challengeMethod: 'S256', // SHA256
    },

    // OAuth 配置
    oauth: {
        defaultScope: 'openid profile email',
        responseType: 'code',
    },

    // Rate Limit 配置
    rateLimit: {
        maxRequests: 100,
        windowMs: 60000, // 1 minute
    },

    // 密码策略
    passwordPolicy: {
        minLength: 8,
        requireUppercase: false,
        requireLowercase: false,
        requireNumbers: false,
        requireSpecialChars: false,
    },
} as const;

/**
 * 错误消息配置
 */
export const ERROR_MESSAGES = {
    auth: {
        invalidCredentials: /用户名或密码错误|invalid credentials|authentication failed/i,
        unauthorized: /unauthorized|401/i,
        tokenExpired: /token expired|token has expired/i,
        tokenRevoked: /token.*revoked|已撤销/i,
    },
    authorization: {
        forbidden: /forbidden|403/i,
        insufficientPermissions: /权限不足|insufficient permissions|missing.*permissions/i,
    },
    validation: {
        required: /必填|required|不能为空|cannot be empty/i,
        tooShort: /至少|minimum|too short/i,
        invalid: /无效|invalid/i,
    },
    network: {
        networkError: /网络错误|network error|连接失败|connection failed/i,
        serverError: /服务器错误|server error|internal error|500/i,
        notFound: /not found|404|找不到|不存在/i,
    },
    oauth: {
        invalidState: /invalid state|csrf|state mismatch/i,
        invalidCode: /invalid.*code|authorization code/i,
        pkceVerificationFailed: /pkce.*failed|pkce.*verification/i,
        unsupportedGrantType: /unsupported grant type|invalid grant_type/i,
    },
    resource: {
        duplicate: /已存在|already exists|duplicate|conflict/i,
        notFound: /not found|找不到|不存在/i,
    },
} as const;

/**
 * 测试场景标签
 */
export const TEST_TAGS = {
    priority: {
        p0: '@p0', // 关键流程
        p1: '@p1', // 重要功能
        p2: '@p2', // 次要功能
    },
    category: {
        auth: '@auth',
        oauth: '@oauth',
        rbac: '@rbac',
        crud: '@crud',
        security: '@security',
        performance: '@performance',
    },
    scope: {
        smoke: '@smoke', // 冒烟测试
        regression: '@regression', // 回归测试
        e2e: '@e2e', // 端到端测试
    },
} as const;
