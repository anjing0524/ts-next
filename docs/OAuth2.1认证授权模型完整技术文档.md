# OAuth2.1认证授权模型完整技术文档

## 1. 系统架构概述

### 1.1 OAuth2.1标准实现

本系统基于OAuth2.1标准实现，结合PKCE（Proof Key for Code Exchange）和OpenID Connect (OIDC)，提供安全可靠的认证授权服务。

#### 1.1.1 核心组件

```mermaid
graph TB
    A[客户端应用] --> B[授权服务器]
    B --> C[资源服务器]
    D[用户] --> A
    E[管理中心] --> B
    F[RBAC权限系统] --> B
    G[审计日志系统] --> B
```

- **授权服务器**: 核心OAuth2.1服务，处理授权请求和令牌颁发
- **资源服务器**: 受保护的API资源
- **客户端应用**: 第三方应用或内部应用
- **管理中心**: 统一的认证授权管理界面
- **RBAC权限系统**: 基于角色的访问控制
- **审计日志系统**: 安全事件记录和监控

#### 1.1.2 技术栈

- **框架**: Next.js 14 (App Router)
- **数据库**: PostgreSQL + Prisma ORM
- **缓存**: Redis
- **JWT**: jose库
- **加密**: bcrypt
- **前端**: React + TypeScript + Tailwind CSS

### 1.2 OAuth2.1流程实现

#### 1.2.1 授权码流程 (Authorization Code Flow)

```mermaid
sequenceDiagram
    participant C as 客户端
    participant U as 用户
    participant AS as 授权服务器
    participant RS as 资源服务器
    
    C->>AS: 1. 授权请求 + PKCE Challenge
    AS->>U: 2. 用户登录/授权
    U->>AS: 3. 用户同意
    AS->>C: 4. 授权码
    C->>AS: 5. 令牌请求 + PKCE Verifier
    AS->>C: 6. 访问令牌 + 刷新令牌
    C->>RS: 7. API请求 + 访问令牌
    RS->>C: 8. 受保护资源
```

#### 1.2.2 PKCE安全增强

```typescript
// PKCE实现
export class PKCEHelper {
  static generateCodeVerifier(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return base64URLEncode(array);
  }
  
  static async generateCodeChallenge(verifier: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return base64URLEncode(new Uint8Array(digest));
  }
  
  static verifyCodeChallenge(
    verifier: string, 
    challenge: string, 
    method: 'S256' | 'plain'
  ): boolean {
    if (method === 'plain') {
      return verifier === challenge;
    }
    
    const computedChallenge = this.generateCodeChallenge(verifier);
    return computedChallenge === challenge;
  }
}
```

## 2. API端点设计

### 2.1 OAuth2.1标准端点

#### 2.1.1 授权端点

```typescript
// /api/v2/oauth/authorize
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  
  const authRequest = {
    client_id: searchParams.get('client_id'),
    response_type: searchParams.get('response_type'),
    redirect_uri: searchParams.get('redirect_uri'),
    scope: searchParams.get('scope'),
    state: searchParams.get('state'),
    code_challenge: searchParams.get('code_challenge'),
    code_challenge_method: searchParams.get('code_challenge_method'),
  };
  
  // 验证客户端
  const client = await validateClient(authRequest.client_id);
  if (!client) {
    return new Response('Invalid client', { status: 400 });
  }
  
  // 验证重定向URI
  if (!validateRedirectUri(client, authRequest.redirect_uri)) {
    return new Response('Invalid redirect URI', { status: 400 });
  }
  
  // 验证PKCE（公共客户端必须）
  if (client.public && !authRequest.code_challenge) {
    return new Response('PKCE required for public clients', { status: 400 });
  }
  
  // 检查用户登录状态
  const user = await getCurrentUser(request);
  if (!user) {
    // 重定向到登录页面
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('auth_request_id', authRequestId);
    return NextResponse.redirect(loginUrl);
  }
  
  // 检查用户同意
  const consent = await checkUserConsent(user.id, client.id, authRequest.scope);
  if (!consent) {
    // 重定向到同意页面
    const consentUrl = new URL('/oauth/consent', request.url);
    consentUrl.searchParams.set('auth_request_id', authRequestId);
    return NextResponse.redirect(consentUrl);
  }
  
  // 生成授权码
  const authCode = await generateAuthorizationCode({
    clientId: client.id,
    userId: user.id,
    scope: authRequest.scope,
    redirectUri: authRequest.redirect_uri,
    codeChallenge: authRequest.code_challenge,
    codeChallengeMethod: authRequest.code_challenge_method,
  });
  
  // 重定向回客户端
  const redirectUrl = new URL(authRequest.redirect_uri);
  redirectUrl.searchParams.set('code', authCode.code);
  redirectUrl.searchParams.set('state', authRequest.state);
  
  return NextResponse.redirect(redirectUrl);
}
```

#### 2.1.2 令牌端点

```typescript
// /api/v2/oauth/token
export async function POST(request: NextRequest) {
  const body = await request.json();
  
  const tokenRequest = {
    grant_type: body.grant_type,
    code: body.code,
    redirect_uri: body.redirect_uri,
    client_id: body.client_id,
    client_secret: body.client_secret,
    code_verifier: body.code_verifier,
    refresh_token: body.refresh_token,
  };
  
  // 客户端认证
  const client = await authenticateClient(tokenRequest);
  if (!client) {
    return NextResponse.json(
      { error: 'invalid_client' },
      { status: 401 }
    );
  }
  
  if (tokenRequest.grant_type === 'authorization_code') {
    return handleAuthorizationCodeGrant(tokenRequest, client);
  } else if (tokenRequest.grant_type === 'refresh_token') {
    return handleRefreshTokenGrant(tokenRequest, client);
  }
  
  return NextResponse.json(
    { error: 'unsupported_grant_type' },
    { status: 400 }
  );
}

async function handleAuthorizationCodeGrant(
  tokenRequest: any,
  client: OAuthClient
) {
  // 验证授权码
  const authCode = await validateAuthorizationCode(
    tokenRequest.code,
    client.id,
    tokenRequest.redirect_uri
  );
  
  if (!authCode) {
    return NextResponse.json(
      { error: 'invalid_grant' },
      { status: 400 }
    );
  }
  
  // 验证PKCE
  if (authCode.codeChallenge) {
    const isValidPKCE = PKCEHelper.verifyCodeChallenge(
      tokenRequest.code_verifier,
      authCode.codeChallenge,
      authCode.codeChallengeMethod
    );
    
    if (!isValidPKCE) {
      return NextResponse.json(
        { error: 'invalid_grant' },
        { status: 400 }
      );
    }
  }
  
  // 生成令牌
  const tokens = await generateTokens({
    clientId: client.id,
    userId: authCode.userId,
    scope: authCode.scope,
  });
  
  // 删除已使用的授权码
  await revokeAuthorizationCode(authCode.id);
  
  return NextResponse.json({
    access_token: tokens.accessToken,
    token_type: 'Bearer',
    expires_in: tokens.expiresIn,
    refresh_token: tokens.refreshToken,
    scope: authCode.scope,
  });
}
```

#### 2.1.3 用户信息端点

```typescript
// /api/v2/oauth/userinfo
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json(
      { error: 'invalid_token' },
      { status: 401 }
    );
  }
  
  const token = authHeader.substring(7);
  const tokenInfo = await validateAccessToken(token);
  
  if (!tokenInfo) {
    return NextResponse.json(
      { error: 'invalid_token' },
      { status: 401 }
    );
  }
  
  // 检查scope
  if (!tokenInfo.scope.includes('openid')) {
    return NextResponse.json(
      { error: 'insufficient_scope' },
      { status: 403 }
    );
  }
  
  const user = await getUserById(tokenInfo.userId);
  const userInfo: any = {
    sub: user.id,
  };
  
  // 根据scope返回用户信息
  if (tokenInfo.scope.includes('profile')) {
    userInfo.name = user.name;
    userInfo.given_name = user.firstName;
    userInfo.family_name = user.lastName;
    userInfo.picture = user.avatar;
  }
  
  if (tokenInfo.scope.includes('email')) {
    userInfo.email = user.email;
    userInfo.email_verified = user.emailVerified;
  }
  
  if (tokenInfo.scope.includes('groups')) {
    userInfo.groups = await getUserGroups(user.id);
  }
  
  return NextResponse.json(userInfo);
}
```

### 2.2 管理API设计

#### 2.2.1 客户端管理API

```typescript
// /api/v2/clients
export async function GET(request: NextRequest) {
  // 权限检查
  const hasPermission = await checkPermission(request, 'clients:list');
  if (!hasPermission) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  
  const clients = await prisma.oAuthClient.findMany({
    select: {
      id: true,
      clientId: true,
      clientName: true,
      public: true,
      redirectUris: true,
      scopes: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  
  return NextResponse.json(clients);
}

export async function POST(request: NextRequest) {
  const hasPermission = await checkPermission(request, 'clients:create');
  if (!hasPermission) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  
  const body = await request.json();
  
  // 验证输入
  const validation = clientCreateSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: validation.error.errors },
      { status: 400 }
    );
  }
  
  const { clientName, redirectUris, scopes, public: isPublic } = validation.data;
  
  // 生成客户端ID和密钥
  const clientId = generateClientId();
  const clientSecret = isPublic ? null : generateClientSecret();
  const clientSecretHash = clientSecret ? await bcrypt.hash(clientSecret, 10) : null;
  
  const client = await prisma.oAuthClient.create({
    data: {
      clientId,
      clientName,
      clientSecretHash,
      public: isPublic,
      redirectUris,
      scopes,
      requirePkce: isPublic, // 公共客户端强制PKCE
      pkceChallengeMethod: 'S256',
    },
  });
  
  // 记录审计日志
  await auditLogger.log({
    action: 'CLIENT_CREATED',
    userId: request.user.id,
    resourceId: client.id,
    details: { clientId, clientName },
  });
  
  return NextResponse.json({
    ...client,
    clientSecret: clientSecret, // 只在创建时返回
  });
}
```

#### 2.2.2 用户管理API

```typescript
// /api/v2/users
export async function GET(request: NextRequest) {
  const hasPermission = await checkPermission(request, 'users:list');
  if (!hasPermission) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  
  const { searchParams } = request.nextUrl;
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '20');
  const search = searchParams.get('search');
  
  const where = search ? {
    OR: [
      { username: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { firstName: { contains: search, mode: 'insensitive' } },
      { lastName: { contains: search, mode: 'insensitive' } },
    ],
  } : {};
  
  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        username: true,
        email: true,
        firstName: true,
        lastName: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        roles: {
          select: {
            role: {
              select: {
                name: true,
                displayName: true,
              },
            },
          },
        },
      },
    }),
    prisma.user.count({ where }),
  ]);
  
  return NextResponse.json({
    users: users.map(user => ({
      ...user,
      roles: user.roles.map(ur => ur.role),
    })),
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  });
}
```

## 3. RBAC权限体系

### 3.1 权限模型设计

#### 3.1.1 数据模型

```prisma
// schema.prisma
model User {
  id            String    @id @default(cuid())
  username      String    @unique
  email         String    @unique
  passwordHash  String
  firstName     String?
  lastName      String?
  isActive      Boolean   @default(true)
  mustChangePassword Boolean @default(false)
  lastLoginAt   DateTime?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  
  roles         UserRole[]
  sessions      UserSession[]
  auditLogs     AuditLog[]
  
  @@map("users")
}

model Role {
  id          String @id @default(cuid())
  name        String @unique
  displayName String
  description String?
  isActive    Boolean @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  users       UserRole[]
  permissions RolePermission[]
  
  @@map("roles")
}

model Permission {
  id              String @id @default(cuid())
  name            String @unique
  displayName     String
  description     String?
  category        String // 'menu', 'api', 'data'
  resourcePattern String // 资源模式
  action          String // 操作类型
  isActive        Boolean @default(true)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  
  roles           RolePermission[]
  
  @@map("permissions")
}

model UserRole {
  id         String   @id @default(cuid())
  userId     String
  roleId     String
  assignedAt DateTime @default(now())
  assignedBy String?
  expiresAt  DateTime?
  
  user       User @relation(fields: [userId], references: [id], onDelete: Cascade)
  role       Role @relation(fields: [roleId], references: [id], onDelete: Cascade)
  
  @@unique([userId, roleId])
  @@map("user_roles")
}

model RolePermission {
  id           String   @id @default(cuid())
  roleId       String
  permissionId String
  assignedAt   DateTime @default(now())
  assignedBy   String?
  
  role         Role @relation(fields: [roleId], references: [id], onDelete: Cascade)
  permission   Permission @relation(fields: [permissionId], references: [id], onDelete: Cascade)
  
  @@unique([roleId, permissionId])
  @@map("role_permissions")
}
```

#### 3.1.2 权限服务实现

```typescript
export class PermissionService {
  private redis: Redis;
  private cacheTTL = 300; // 5分钟缓存
  
  constructor() {
    this.redis = new Redis(process.env.REDIS_URL!);
  }
  
  /**
   * 检查用户是否具有指定权限
   */
  async checkUserPermission(userId: string, permission: string): Promise<boolean> {
    const userPermissions = await this.getUserPermissions(userId);
    return userPermissions.includes(permission);
  }
  
  /**
   * 批量检查用户权限
   */
  async checkUserPermissions(
    userId: string, 
    permissions: string[]
  ): Promise<Record<string, boolean>> {
    const userPermissions = await this.getUserPermissions(userId);
    const result: Record<string, boolean> = {};
    
    for (const permission of permissions) {
      result[permission] = userPermissions.includes(permission);
    }
    
    return result;
  }
  
  /**
   * 获取用户所有权限（带缓存）
   */
  async getUserPermissions(userId: string): Promise<string[]> {
    const cacheKey = `user:permissions:${userId}`;
    const cached = await this.redis.get(cacheKey);
    
    if (cached) {
      return JSON.parse(cached);
    }
    
    const permissions = await this.loadUserPermissionsFromDB(userId);
    await this.redis.setex(cacheKey, this.cacheTTL, JSON.stringify(permissions));
    
    return permissions;
  }
  
  /**
   * 从数据库加载用户权限
   */
  private async loadUserPermissionsFromDB(userId: string): Promise<string[]> {
    const userRoles = await prisma.userRole.findMany({
      where: {
        userId,
        role: { isActive: true },
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
      include: {
        role: {
          include: {
            permissions: {
              include: {
                permission: {
                  where: { isActive: true },
                },
              },
            },
          },
        },
      },
    });
    
    const permissions = new Set<string>();
    
    for (const userRole of userRoles) {
      for (const rolePermission of userRole.role.permissions) {
        permissions.add(rolePermission.permission.name);
      }
    }
    
    return Array.from(permissions);
  }
  
  /**
   * 清除用户权限缓存
   */
  async invalidateUserPermissions(userId: string): Promise<void> {
    const cacheKey = `user:permissions:${userId}`;
    await this.redis.del(cacheKey);
  }
  
  /**
   * 获取用户菜单权限
   */
  async getUserMenuPermissions(userId: string): Promise<string[]> {
    const allPermissions = await this.getUserPermissions(userId);
    return allPermissions.filter(permission => permission.startsWith('menu:'));
  }
  
  /**
   * 获取用户API权限
   */
  async getUserApiPermissions(userId: string): Promise<string[]> {
    const allPermissions = await this.getUserPermissions(userId);
    return allPermissions.filter(permission => 
      !permission.startsWith('menu:') && !permission.startsWith('data:')
    );
  }
}

export const permissionService = new PermissionService();
```

### 3.2 权限中间件

```typescript
// 权限检查中间件
export function requirePermission(permission: string) {
  return async (req: NextRequest, context: any) => {
    try {
      // 获取当前用户
      const user = await getCurrentUser(req);
      if (!user) {
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        );
      }
      
      // 检查权限
      const hasPermission = await permissionService.checkUserPermission(
        user.id,
        permission
      );
      
      if (!hasPermission) {
        // 记录权限拒绝事件
        await auditLogger.log({
          action: 'PERMISSION_DENIED',
          userId: user.id,
          details: {
            permission,
            path: req.nextUrl.pathname,
            method: req.method,
          },
        });
        
        return NextResponse.json(
          { error: 'Forbidden' },
          { status: 403 }
        );
      }
      
      // 将用户信息添加到请求中
      (req as any).user = user;
      
      return null; // 继续处理
    } catch (error) {
      console.error('Permission check error:', error);
      return NextResponse.json(
        { error: 'Internal Server Error' },
        { status: 500 }
      );
    }
  };
}

// 使用示例
export async function GET(request: NextRequest) {
  const permissionCheck = await requirePermission('users:list')(request, {});
  if (permissionCheck) return permissionCheck;
  
  // 处理请求逻辑
  const users = await getUserList();
  return NextResponse.json(users);
}
```

## 4. 前端管理中心设计

### 4.1 管理中心架构

#### 4.1.1 页面结构

```
管理中心 (/admin)
├── 仪表板 (/admin/dashboard)
├── 用户管理 (/admin/users)
│   ├── 用户列表 (/admin/users/list)
│   ├── 创建用户 (/admin/users/create)
│   └── 用户详情 (/admin/users/[id])
├── 角色权限 (/admin/roles)
│   ├── 角色列表 (/admin/roles/list)
│   ├── 权限管理 (/admin/permissions)
│   └── 角色权限分配 (/admin/roles/[id]/permissions)
├── OAuth客户端 (/admin/clients)
│   ├── 客户端列表 (/admin/clients/list)
│   ├── 注册客户端 (/admin/clients/register)
│   └── 客户端详情 (/admin/clients/[id])
├── 审计日志 (/admin/audit)
│   ├── 操作日志 (/admin/audit/logs)
│   ├── 安全事件 (/admin/audit/security)
│   └── 合规报告 (/admin/audit/reports)
└── 系统设置 (/admin/system)
    ├── 系统配置 (/admin/system/config)
    ├── 安全策略 (/admin/system/security)
    └── 系统监控 (/admin/system/monitoring)
```

#### 4.1.2 权限控制组件

```typescript
// 权限控制HOC
export function withPermission<T extends object>(
  Component: React.ComponentType<T>,
  requiredPermission: string
) {
  return function PermissionWrapper(props: T) {
    const { user, permissions } = useAuth();
    
    if (!user) {
      return <LoginRequired />;
    }
    
    if (!permissions.includes(requiredPermission)) {
      return <AccessDenied permission={requiredPermission} />;
    }
    
    return <Component {...props} />;
  };
}

// 权限检查Hook
export function usePermission(permission: string): boolean {
  const { permissions } = useAuth();
  return permissions.includes(permission);
}

// 权限控制组件
export function PermissionGate({ 
  permission, 
  children, 
  fallback 
}: {
  permission: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const hasPermission = usePermission(permission);
  
  if (!hasPermission) {
    return fallback || null;
  }
  
  return <>{children}</>;
}
```

#### 4.1.3 菜单权限过滤

```typescript
// 菜单配置
export const menuConfig = [
  {
    id: 'dashboard',
    title: '仪表板',
    path: '/admin/dashboard',
    icon: 'dashboard',
    permission: 'menu:dashboard:view',
  },
  {
    id: 'users',
    title: '用户管理',
    path: '/admin/users',
    icon: 'users',
    permission: 'menu:users:view',
    children: [
      {
        id: 'users-list',
        title: '用户列表',
        path: '/admin/users/list',
        permission: 'menu:users:list',
      },
      {
        id: 'users-create',
        title: '创建用户',
        path: '/admin/users/create',
        permission: 'menu:users:create',
      },
    ],
  },
  // ... 其他菜单项
];

// 菜单过滤Hook
export function useFilteredMenu() {
  const { permissions } = useAuth();
  
  return useMemo(() => {
    return filterMenuByPermissions(menuConfig, permissions);
  }, [permissions]);
}

function filterMenuByPermissions(
  menus: MenuItem[],
  permissions: string[]
): MenuItem[] {
  return menus
    .filter(menu => !menu.permission || permissions.includes(menu.permission))
    .map(menu => ({
      ...menu,
      children: menu.children
        ? filterMenuByPermissions(menu.children, permissions)
        : undefined,
    }))
    .filter(menu => !menu.children || menu.children.length > 0);
}
```

### 4.2 核心管理页面

#### 4.2.1 用户管理页面

```typescript
// /app/admin/users/page.tsx
export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
  });
  
  const canCreateUser = usePermission('users:create');
  const canEditUser = usePermission('users:update');
  const canDeleteUser = usePermission('users:delete');
  
  useEffect(() => {
    loadUsers();
  }, [pagination.page]);
  
  const loadUsers = async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `/api/v2/users?page=${pagination.page}&limit=${pagination.limit}`
      );
      const data = await response.json();
      
      setUsers(data.users);
      setPagination(prev => ({ ...prev, total: data.pagination.total }));
    } catch (error) {
      toast.error('加载用户列表失败');
    } finally {
      setLoading(false);
    }
  };
  
  const handleDeleteUser = async (userId: string) => {
    if (!confirm('确定要删除此用户吗？')) return;
    
    try {
      await fetch(`/api/v2/users/${userId}`, { method: 'DELETE' });
      toast.success('用户删除成功');
      loadUsers();
    } catch (error) {
      toast.error('删除用户失败');
    }
  };
  
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">用户管理</h1>
        <PermissionGate permission="users:create">
          <Button asChild>
            <Link href="/admin/users/create">
              <Plus className="w-4 h-4 mr-2" />
              创建用户
            </Link>
          </Button>
        </PermissionGate>
      </div>
      
      <Card>
        <CardContent>
          <DataTable
            data={users}
            columns={[
              {
                header: '用户名',
                accessorKey: 'username',
              },
              {
                header: '邮箱',
                accessorKey: 'email',
              },
              {
                header: '姓名',
                cell: ({ row }) => 
                  `${row.original.firstName || ''} ${row.original.lastName || ''}`.trim(),
              },
              {
                header: '角色',
                cell: ({ row }) => (
                  <div className="flex gap-1">
                    {row.original.roles.map(role => (
                      <Badge key={role.name} variant="secondary">
                        {role.displayName}
                      </Badge>
                    ))}
                  </div>
                ),
              },
              {
                header: '状态',
                cell: ({ row }) => (
                  <Badge variant={row.original.isActive ? 'default' : 'destructive'}>
                    {row.original.isActive ? '活跃' : '禁用'}
                  </Badge>
                ),
              },
              {
                header: '操作',
                cell: ({ row }) => (
                  <div className="flex gap-2">
                    <PermissionGate permission="users:update">
                      <Button size="sm" variant="outline" asChild>
                        <Link href={`/admin/users/${row.original.id}`}>
                          编辑
                        </Link>
                      </Button>
                    </PermissionGate>
                    <PermissionGate permission="users:delete">
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleDeleteUser(row.original.id)}
                      >
                        删除
                      </Button>
                    </PermissionGate>
                  </div>
                ),
              },
            ]}
            pagination={pagination}
            onPaginationChange={setPagination}
            loading={loading}
          />
        </CardContent>
      </Card>
    </div>
  );
}

// 使用权限HOC包装
export default withPermission(UsersPage, 'menu:users:view');
```

#### 4.2.2 OAuth客户端管理

```typescript
// /app/admin/clients/page.tsx
export default function ClientsPage() {
  const [clients, setClients] = useState<OAuthClient[]>([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    loadClients();
  }, []);
  
  const loadClients = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/v2/clients');
      const data = await response.json();
      setClients(data);
    } catch (error) {
      toast.error('加载客户端列表失败');
    } finally {
      setLoading(false);
    }
  };
  
  const handleRegenerateSecret = async (clientId: string) => {
    if (!confirm('确定要重新生成客户端密钥吗？这将使现有密钥失效。')) return;
    
    try {
      const response = await fetch(
        `/api/v2/clients/${clientId}/regenerate-secret`,
        { method: 'POST' }
      );
      const data = await response.json();
      
      // 显示新密钥
      alert(`新的客户端密钥：${data.clientSecret}\n\n请妥善保存，此密钥只显示一次。`);
      loadClients();
    } catch (error) {
      toast.error('重新生成密钥失败');
    }
  };
  
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">OAuth客户端管理</h1>
        <PermissionGate permission="clients:create">
          <Button asChild>
            <Link href="/admin/clients/register">
              <Plus className="w-4 h-4 mr-2" />
              注册客户端
            </Link>
          </Button>
        </PermissionGate>
      </div>
      
      <Card>
        <CardContent>
          <DataTable
            data={clients}
            columns={[
              {
                header: '客户端ID',
                accessorKey: 'clientId',
                cell: ({ row }) => (
                  <code className="bg-gray-100 px-2 py-1 rounded text-sm">
                    {row.original.clientId}
                  </code>
                ),
              },
              {
                header: '客户端名称',
                accessorKey: 'clientName',
              },
              {
                header: '类型',
                cell: ({ row }) => (
                  <Badge variant={row.original.public ? 'secondary' : 'default'}>
                    {row.original.public ? '公共客户端' : '机密客户端'}
                  </Badge>
                ),
              },
              {
                header: '重定向URI',
                cell: ({ row }) => (
                  <div className="max-w-xs">
                    {row.original.redirectUris.map((uri, index) => (
                      <div key={index} className="text-sm text-gray-600 truncate">
                        {uri}
                      </div>
                    ))}
                  </div>
                ),
              },
              {
                header: '作用域',
                cell: ({ row }) => (
                  <div className="flex flex-wrap gap-1">
                    {row.original.scopes.map(scope => (
                      <Badge key={scope} variant="outline" className="text-xs">
                        {scope}
                      </Badge>
                    ))}
                  </div>
                ),
              },
              {
                header: '创建时间',
                cell: ({ row }) => 
                  new Date(row.original.createdAt).toLocaleDateString(),
              },
              {
                header: '操作',
                cell: ({ row }) => (
                  <div className="flex gap-2">
                    <PermissionGate permission="clients:update">
                      <Button size="sm" variant="outline" asChild>
                        <Link href={`/admin/clients/${row.original.id}`}>
                          编辑
                        </Link>
                      </Button>
                    </PermissionGate>
                    {!row.original.public && (
                      <PermissionGate permission="clients:secret:regenerate">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleRegenerateSecret(row.original.id)}
                        >
                          重新生成密钥
                        </Button>
                      </PermissionGate>
                    )}
                  </div>
                ),
              },
            ]}
            loading={loading}
          />
        </CardContent>
      </Card>
    </div>
  );
}

export default withPermission(ClientsPage, 'menu:clients:view');
```

## 5. 安全最佳实践

### 5.1 OAuth2.1安全配置

#### 5.1.1 客户端安全策略

```typescript
// OAuth客户端安全配置
export const oauthSecurityConfig = {
  // PKCE配置
  pkce: {
    required: true, // 所有客户端强制PKCE
    allowedMethods: ['S256'], // 只允许SHA256
    minVerifierLength: 43,
    maxVerifierLength: 128,
  },
  
  // 令牌配置
  tokens: {
    accessToken: {
      lifetime: 3600, // 1小时
      algorithm: 'RS256',
      issuer: process.env.OAUTH_ISSUER,
    },
    refreshToken: {
      lifetime: 86400 * 30, // 30天
      rotateOnUse: true, // 使用时轮换
    },
    authorizationCode: {
      lifetime: 600, // 10分钟
      singleUse: true,
    },
  },
  
  // 客户端认证
  clientAuthentication: {
    confidentialClients: {
      required: true,
      methods: ['client_secret_basic', 'client_secret_post'],
    },
    publicClients: {
      requirePkce: true,
      allowedGrantTypes: ['authorization_code'],
    },
  },
  
  // 重定向URI安全
  redirectUri: {
    strictMatching: true,
    requireHttps: process.env.NODE_ENV === 'production',
    allowLocalhost: process.env.NODE_ENV === 'development',
    blockedDomains: ['bit.ly', 'tinyurl.com'], // 阻止短链接
  },
};
```

#### 5.1.2 JWT安全配置

```typescript
// JWT密钥管理
export class JWTKeyManager {
  private static instance: JWTKeyManager;
  private keyPair: CryptoKeyPair | null = null;
  private keyRotationInterval = 24 * 60 * 60 * 1000; // 24小时
  
  static getInstance(): JWTKeyManager {
    if (!this.instance) {
      this.instance = new JWTKeyManager();
    }
    return this.instance;
  }
  
  async initialize() {
    await this.loadOrGenerateKeys();
    this.scheduleKeyRotation();
  }
  
  private async loadOrGenerateKeys() {
    // 尝试从环境变量或密钥存储加载
    const privateKeyPem = process.env.JWT_PRIVATE_KEY;
    const publicKeyPem = process.env.JWT_PUBLIC_KEY;
    
    if (privateKeyPem && publicKeyPem) {
      this.keyPair = await this.importKeyPair(privateKeyPem, publicKeyPem);
    } else {
      this.keyPair = await this.generateKeyPair();
      // 在生产环境中，应该将密钥保存到安全存储
    }
  }
  
  private async generateKeyPair(): Promise<CryptoKeyPair> {
    return await crypto.subtle.generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['sign', 'verify']
    );
  }
  
  async signJWT(payload: any): Promise<string> {
    if (!this.keyPair) {
      throw new Error('Key pair not initialized');
    }
    
    return await new SignJWT(payload)
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuedAt()
      .setIssuer(process.env.OAUTH_ISSUER!)
      .setExpirationTime('1h')
      .sign(this.keyPair.privateKey);
  }
  
  async verifyJWT(token: string): Promise<any> {
    if (!this.keyPair) {
      throw new Error('Key pair not initialized');
    }
    
    const { payload } = await jwtVerify(token, this.keyPair.publicKey, {
      issuer: process.env.OAUTH_ISSUER,
    });
    
    return payload;
  }
  
  async getJWKS(): Promise<any> {
    if (!this.keyPair) {
      throw new Error('Key pair not initialized');
    }
    
    const publicKey = await exportJWK(this.keyPair.publicKey);
    
    return {
      keys: [
        {
          ...publicKey,
          kid: 'main-key',
          use: 'sig',
          alg: 'RS256',
        },
      ],
    };
  }
  
  private scheduleKeyRotation() {
    setInterval(async () => {
      await this.rotateKeys();
    }, this.keyRotationInterval);
  }
  
  private async rotateKeys() {
    // 密钥轮换逻辑
    console.log('Rotating JWT keys...');
    // 在生产环境中，需要实现平滑的密钥轮换
  }
}
```

### 5.2 安全中间件

#### 5.2.1 速率限制

```typescript
// 速率限制中间件
export class RateLimiter {
  private redis: Redis;
  
  constructor() {
    this.redis = new Redis(process.env.REDIS_URL!);
  }
  
  async checkLimit(
    key: string,
    limit: number,
    window: number
  ): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
    const now = Date.now();
    const windowStart = now - window * 1000;
    
    // 使用滑动窗口算法
    const pipe = this.redis.pipeline();
    pipe.zremrangebyscore(key, 0, windowStart);
    pipe.zadd(key, now, now);
    pipe.zcount(key, windowStart, now);
    pipe.expire(key, window);
    
    const results = await pipe.exec();
    const count = results?.[2]?.[1] as number;
    
    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
      resetTime: now + window * 1000,
    };
  }
}

// 速率限制装饰器
export function rateLimit(
  limit: number,
  window: number,
  keyGenerator?: (req: NextRequest) => string
) {
  const limiter = new RateLimiter();
  
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function (req: NextRequest, ...args: any[]) {
      const key = keyGenerator ? keyGenerator(req) : 
        `rate_limit:${req.ip || 'unknown'}:${propertyKey}`;
      
      const result = await limiter.checkLimit(key, limit, window);
      
      if (!result.allowed) {
        return NextResponse.json(
          { error: 'Too Many Requests' },
          { 
            status: 429,
            headers: {
              'X-RateLimit-Limit': limit.toString(),
              'X-RateLimit-Remaining': result.remaining.toString(),
              'X-RateLimit-Reset': result.resetTime.toString(),
            },
          }
        );
      }
      
      return originalMethod.apply(this, [req, ...args]);
    };
  };
}
```

#### 5.2.2 安全头配置

```typescript
// 安全头中间件
export function securityHeaders(request: NextRequest) {
  const response = NextResponse.next();
  
  // 安全头配置
  const securityHeaders = {
    // 防止XSS攻击
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    
    // HTTPS强制
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    
    // 内容安全策略
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self'",
      "connect-src 'self'",
      "frame-ancestors 'none'",
    ].join('; '),
    
    // 权限策略
    'Permissions-Policy': [
      'camera=()',
      'microphone=()',
      'geolocation=()',
      'payment=()',
    ].join(', '),
    
    // 引用策略
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  };
  
  // 设置安全头
  Object.entries(securityHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  
  return response;
}
```

### 5.3 审计日志系统

#### 5.3.1 审计日志模型

```typescript
// 审计日志接口
export interface AuditLogEntry {
  id: string;
  action: string;
  userId?: string;
  clientId?: string;
  resourceType?: string;
  resourceId?: string;
  details: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  timestamp: Date;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

// 审计日志服务
export class AuditLogger {
  private queue: AuditLogEntry[] = [];
  private batchSize = 100;
  private flushInterval = 5000; // 5秒
  
  constructor() {
    this.startBatchProcessor();
  }
  
  async log(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): Promise<void> {
    const auditEntry: AuditLogEntry = {
      ...entry,
      id: generateId(),
      timestamp: new Date(),
    };
    
    this.queue.push(auditEntry);
    
    // 关键事件立即写入
    if (entry.severity === 'CRITICAL') {
      await this.flush();
    }
  }
  
  private async flush(): Promise<void> {
    if (this.queue.length === 0) return;
    
    const entries = this.queue.splice(0, this.batchSize);
    
    try {
      await prisma.auditLog.createMany({
        data: entries.map(entry => ({
          id: entry.id,
          action: entry.action,
          userId: entry.userId,
          clientId: entry.clientId,
          resourceType: entry.resourceType,
          resourceId: entry.resourceId,
          details: entry.details,
          ipAddress: entry.ipAddress,
          userAgent: entry.userAgent,
          timestamp: entry.timestamp,
          severity: entry.severity,
        })),
      });
    } catch (error) {
      console.error('Failed to write audit logs:', error);
      // 重新加入队列
      this.queue.unshift(...entries);
    }
  }
  
  private startBatchProcessor(): void {
    setInterval(() => {
      this.flush();
    }, this.flushInterval);
  }
  
  // 预定义的审计事件
  async logUserLogin(userId: string, ipAddress: string, success: boolean): Promise<void> {
    await this.log({
      action: success ? 'USER_LOGIN_SUCCESS' : 'USER_LOGIN_FAILED',
      userId,
      ipAddress,
      severity: success ? 'LOW' : 'MEDIUM',
      details: { success },
    });
  }
  
  async logOAuthAuthorization(
    userId: string,
    clientId: string,
    scope: string,
    granted: boolean
  ): Promise<void> {
    await this.log({
      action: granted ? 'OAUTH_AUTHORIZATION_GRANTED' : 'OAUTH_AUTHORIZATION_DENIED',
      userId,
      clientId,
      severity: 'MEDIUM',
      details: { scope, granted },
    });
  }
  
  async logPermissionDenied(
    userId: string,
    permission: string,
    resource: string
  ): Promise<void> {
    await this.log({
      action: 'PERMISSION_DENIED',
      userId,
      severity: 'HIGH',
      details: { permission, resource },
    });
  }
}

export const auditLogger = new AuditLogger();
```

## 6. 部署和运维

### 6.1 环境配置

#### 6.1.1 环境变量

```bash
# .env.production
# 数据库配置
DATABASE_URL="postgresql://user:password@localhost:5432/oauth_center"

# Redis配置
REDIS_URL="redis://localhost:6379"

# JWT配置
JWT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
JWT_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
OAUTH_ISSUER="https://auth.company.com"

# 安全配置
NEXTAUTH_SECRET="your-secret-key"
NEXTAUTH_URL="https://auth.company.com"

# CORS配置
ALLOWED_ORIGINS="https://app1.company.com,https://app2.company.com"

# 监控配置
MONITORING_ENABLED=true
PROMETHEUS_ENDPOINT="http://prometheus:9090"

# 日志配置
LOG_LEVEL="info"
LOG_FORMAT="json"
```

#### 6.1.2 Docker配置

```dockerfile
# Dockerfile
FROM node:18-alpine AS base

# 安装依赖
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --only=production

# 构建应用
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build

# 运行时镜像
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

CMD ["node", "server.js"]
```

#### 6.1.3 Kubernetes部署

```yaml
# k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: oauth-center
  namespace: auth
spec:
  replicas: 3
  selector:
    matchLabels:
      app: oauth-center
  template:
    metadata:
      labels:
        app: oauth-center
    spec:
      containers:
      - name: oauth-center
        image: oauth-center:latest
        ports:
        - containerPort: 3000
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: oauth-secrets
              key: database-url
        - name: REDIS_URL
          valueFrom:
            secretKeyRef:
              name: oauth-secrets
              key: redis-url
        - name: JWT_PRIVATE_KEY
          valueFrom:
            secretKeyRef:
              name: oauth-secrets
              key: jwt-private-key
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /api/health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /api/ready
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: oauth-center-service
  namespace: auth
spec:
  selector:
    app: oauth-center
  ports:
  - port: 80
    targetPort: 3000
  type: ClusterIP
```

### 6.2 监控和告警

#### 6.2.1 性能监控

```typescript
// 性能监控中间件
export class PerformanceMonitor {
  private metrics: Map<string, number[]> = new Map();
  
  startTimer(operation: string): () => void {
    const start = performance.now();
    
    return () => {
      const duration = performance.now() - start;
      this.recordMetric(operation, duration);
    };
  }
  
  recordMetric(operation: string, value: number): void {
    if (!this.metrics.has(operation)) {
      this.metrics.set(operation, []);
    }
    
    const values = this.metrics.get(operation)!;
    values.push(value);
    
    // 保持最近1000个数据点
    if (values.length > 1000) {
      values.shift();
    }
  }
  
  getMetrics(operation: string): {
    avg: number;
    min: number;
    max: number;
    p95: number;
    p99: number;
  } {
    const values = this.metrics.get(operation) || [];
    if (values.length === 0) {
      return { avg: 0, min: 0, max: 0, p95: 0, p99: 0 };
    }
    
    const sorted = [...values].sort((a, b) => a - b);
    const sum = values.reduce((a, b) => a + b, 0);
    
    return {
      avg: sum / values.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)],
    };
  }
}

export const performanceMonitor = new PerformanceMonitor();

// 监控装饰器
export function monitor(operation: string) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function (...args: any[]) {
      const endTimer = performanceMonitor.startTimer(operation);
      
      try {
        const result = await originalMethod.apply(this, args);
        endTimer();
        return result;
      } catch (error) {
        endTimer();
        throw error;
      }
    };
  };
}
```

#### 6.2.2 健康检查端点

```typescript
// /api/health/route.ts
export async function GET() {
  const checks = await Promise.allSettled([
    checkDatabase(),
    checkRedis(),
    checkExternalServices(),
  ]);
  
  const results = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    checks: {
      database: checks[0].status === 'fulfilled' ? 'healthy' : 'unhealthy',
      redis: checks[1].status === 'fulfilled' ? 'healthy' : 'unhealthy',
      external: checks[2].status === 'fulfilled' ? 'healthy' : 'unhealthy',
    },
    metrics: {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      performance: {
        tokenGeneration: performanceMonitor.getMetrics('token_generation'),
        userAuthentication: performanceMonitor.getMetrics('user_auth'),
        permissionCheck: performanceMonitor.getMetrics('permission_check'),
      },
    },
  };
  
  const isHealthy = Object.values(results.checks).every(status => status === 'healthy');
  results.status = isHealthy ? 'healthy' : 'unhealthy';
  
  return NextResponse.json(results, {
    status: isHealthy ? 200 : 503,
  });
}

async function checkDatabase(): Promise<void> {
  await prisma.$queryRaw`SELECT 1`;
}

async function checkRedis(): Promise<void> {
  const redis = new Redis(process.env.REDIS_URL!);
  await redis.ping();
  redis.disconnect();
}

async function checkExternalServices(): Promise<void> {
  // 检查外部依赖服务
  // 例如：邮件服务、短信服务等
}
```

### 6.3 备份和恢复

#### 6.3.1 数据备份策略

```bash
#!/bin/bash
# scripts/backup.sh

set -e

# 配置
BACKUP_DIR="/backups/oauth-center"
DATE=$(date +"%Y%m%d_%H%M%S")
RETENTION_DAYS=30

# 创建备份目录
mkdir -p "$BACKUP_DIR"

# 数据库备份
echo "Starting database backup..."
pg_dump "$DATABASE_URL" | gzip > "$BACKUP_DIR/db_backup_$DATE.sql.gz"

# Redis备份
echo "Starting Redis backup..."
redis-cli --rdb "$BACKUP_DIR/redis_backup_$DATE.rdb"

# 配置文件备份
echo "Backing up configuration files..."
tar -czf "$BACKUP_DIR/config_backup_$DATE.tar.gz" \
  /app/.env.production \
  /app/k8s/ \
  /app/docker-compose.yml

# 清理旧备份
echo "Cleaning up old backups..."
find "$BACKUP_DIR" -name "*backup*" -mtime +$RETENTION_DAYS -delete

echo "Backup completed successfully"
```

#### 6.3.2 灾难恢复计划

```yaml
# 灾难恢复步骤
灾难恢复计划:
  1. 评估损坏程度:
    - 检查数据库状态
    - 检查应用服务状态
    - 检查网络连接
    
  2. 数据恢复:
    - 从最新备份恢复数据库
    - 恢复Redis数据
    - 验证数据完整性
    
  3. 服务恢复:
    - 重新部署应用
    - 恢复配置文件
    - 重启相关服务
    
  4. 验证和测试:
    - 执行健康检查
    - 测试关键功能
    - 验证OAuth流程
    
  5. 通知和文档:
    - 通知相关团队
    - 更新事故记录
    - 总结经验教训

RTO目标: 4小时
RPO目标: 1小时
```

## 7. 测试策略

### 7.1 单元测试

```typescript
// __tests__/oauth/token.test.ts
import { handleAuthorizationCodeGrant } from '@/app/api/v2/oauth/token/route';
import { PKCEHelper } from '@/lib/oauth/pkce';

describe('OAuth Token Endpoint', () => {
  describe('Authorization Code Grant', () => {
    it('should generate tokens for valid authorization code', async () => {
      // 准备测试数据
      const mockClient = {
        id: 'client-1',
        clientId: 'test-client',
        public: false,
      };
      
      const mockAuthCode = {
        id: 'code-1',
        code: 'auth-code-123',
        userId: 'user-1',
        clientId: 'client-1',
        scope: 'openid profile',
        redirectUri: 'https://app.example.com/callback',
        expiresAt: new Date(Date.now() + 600000),
        codeChallenge: null,
        codeChallengeMethod: null,
      };
      
      // Mock数据库调用
      jest.spyOn(prisma.authorizationCode, 'findFirst')
        .mockResolvedValue(mockAuthCode);
      
      jest.spyOn(prisma.authorizationCode, 'delete')
        .mockResolvedValue(mockAuthCode);
      
      // 执行测试
      const tokenRequest = {
        grant_type: 'authorization_code',
        code: 'auth-code-123',
        redirect_uri: 'https://app.example.com/callback',
        client_id: 'test-client',
      };
      
      const response = await handleAuthorizationCodeGrant(tokenRequest, mockClient);
      const result = await response.json();
      
      // 验证结果
      expect(response.status).toBe(200);
      expect(result).toHaveProperty('access_token');
      expect(result).toHaveProperty('refresh_token');
      expect(result.token_type).toBe('Bearer');
      expect(result.scope).toBe('openid profile');
    });
    
    it('should validate PKCE for public clients', async () => {
      const codeVerifier = PKCEHelper.generateCodeVerifier();
      const codeChallenge = await PKCEHelper.generateCodeChallenge(codeVerifier);
      
      const mockClient = {
        id: 'client-2',
        clientId: 'public-client',
        public: true,
      };
      
      const mockAuthCode = {
        id: 'code-2',
        code: 'auth-code-456',
        userId: 'user-1',
        clientId: 'client-2',
        scope: 'openid',
        redirectUri: 'https://spa.example.com/callback',
        expiresAt: new Date(Date.now() + 600000),
        codeChallenge,
        codeChallengeMethod: 'S256',
      };
      
      jest.spyOn(prisma.authorizationCode, 'findFirst')
        .mockResolvedValue(mockAuthCode);
      
      const tokenRequest = {
        grant_type: 'authorization_code',
        code: 'auth-code-456',
        redirect_uri: 'https://spa.example.com/callback',
        client_id: 'public-client',
        code_verifier: codeVerifier,
      };
      
      const response = await handleAuthorizationCodeGrant(tokenRequest, mockClient);
      
      expect(response.status).toBe(200);
    });
    
    it('should reject invalid PKCE verifier', async () => {
      const codeChallenge = await PKCEHelper.generateCodeChallenge('valid-verifier');
      
      const mockAuthCode = {
        id: 'code-3',
        code: 'auth-code-789',
        codeChallenge,
        codeChallengeMethod: 'S256',
      };
      
      jest.spyOn(prisma.authorizationCode, 'findFirst')
        .mockResolvedValue(mockAuthCode);
      
      const tokenRequest = {
        grant_type: 'authorization_code',
        code: 'auth-code-789',
        code_verifier: 'invalid-verifier',
      };
      
      const response = await handleAuthorizationCodeGrant(tokenRequest, mockClient);
      const result = await response.json();
      
      expect(response.status).toBe(400);
      expect(result.error).toBe('invalid_grant');
    });
  });
});
```

### 7.2 集成测试

```typescript
// __tests__/integration/oauth-flow.test.ts
import { test, expect } from '@playwright/test';

test.describe('OAuth2.1 Authorization Flow', () => {
  test('complete authorization code flow with PKCE', async ({ page, context }) => {
    // 1. 客户端发起授权请求
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    const state = generateRandomString();
    
    const authUrl = new URL('/api/v2/oauth/authorize', process.env.BASE_URL);
    authUrl.searchParams.set('client_id', 'test-spa-client');
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('redirect_uri', 'http://localhost:3001/callback');
    authUrl.searchParams.set('scope', 'openid profile email');
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    
    await page.goto(authUrl.toString());
    
    // 2. 用户登录
    await expect(page.locator('h1')).toContainText('登录');
    await page.fill('[name="username"]', 'testuser');
    await page.fill('[name="password"]', 'password123');
    await page.click('button[type="submit"]');
    
    // 3. 用户授权
    await expect(page.locator('h1')).toContainText('授权确认');
    await expect(page.locator('.client-name')).toContainText('测试SPA应用');
    await expect(page.locator('.scope-list')).toContainText('openid');
    await expect(page.locator('.scope-list')).toContainText('profile');
    await expect(page.locator('.scope-list')).toContainText('email');
    
    await page.click('button[data-action="approve"]');
    
    // 4. 获取授权码
    await page.waitForURL(/callback/);
    const url = new URL(page.url());
    const authCode = url.searchParams.get('code');
    const returnedState = url.searchParams.get('state');
    
    expect(authCode).toBeTruthy();
    expect(returnedState).toBe(state);
    
    // 5. 交换访问令牌
    const tokenResponse = await fetch('/api/v2/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code: authCode,
        redirect_uri: 'http://localhost:3001/callback',
        client_id: 'test-spa-client',
        code_verifier: codeVerifier,
      }),
    });
    
    expect(tokenResponse.status).toBe(200);
    
    const tokens = await tokenResponse.json();
    expect(tokens).toHaveProperty('access_token');
    expect(tokens).toHaveProperty('refresh_token');
    expect(tokens.token_type).toBe('Bearer');
    expect(tokens.scope).toBe('openid profile email');
    
    // 6. 使用访问令牌获取用户信息
    const userinfoResponse = await fetch('/api/v2/oauth/userinfo', {
      headers: {
        'Authorization': `Bearer ${tokens.access_token}`,
      },
    });
    
    expect(userinfoResponse.status).toBe(200);
    
    const userinfo = await userinfoResponse.json();
    expect(userinfo).toHaveProperty('sub');
    expect(userinfo).toHaveProperty('email');
    expect(userinfo).toHaveProperty('name');
  });
  
  test('should reject invalid client', async ({ page }) => {
    const authUrl = new URL('/api/v2/oauth/authorize', process.env.BASE_URL);
    authUrl.searchParams.set('client_id', 'invalid-client');
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('redirect_uri', 'http://localhost:3001/callback');
    
    const response = await page.goto(authUrl.toString());
    expect(response?.status()).toBe(400);
  });
});
```

## 8. 实施计划

### 8.1 迁移策略

#### 8.1.1 API迁移计划

```typescript
// 迁移步骤
const migrationPlan = {
  phase1: {
    title: '清理冗余API',
    duration: '1周',
    tasks: [
      '删除重复的权限检查API',
      '移除不规范的v1管理API',
      '统一错误处理格式',
    ],
    risks: ['现有客户端可能依赖旧API'],
    mitigation: ['提前通知客户端开发者', '提供迁移指南'],
  },
  
  phase2: {
    title: 'OAuth端点标准化',
    duration: '2周',
    tasks: [
      '将OAuth端点迁移到/api/v2/oauth/',
      '实现PKCE强制要求',
      '添加OpenID Connect支持',
      '完善令牌端点安全性',
    ],
    risks: ['OAuth流程中断'],
    mitigation: ['并行运行新旧端点', '逐步切换客户端'],
  },
  
  phase3: {
    title: '权限系统优化',
    duration: '2周',
    tasks: [
      '优化权限缓存策略',
      '实现权限继承机制',
      '添加权限审计功能',
      '完善批量权限检查',
    ],
    risks: ['权限检查性能下降'],
    mitigation: ['性能测试', '缓存预热'],
  },
  
  phase4: {
    title: '管理界面完善',
    duration: '3周',
    tasks: [
      '实现统一管理中心',
      '完善用户角色管理',
      '添加OAuth客户端管理',
      '实现审计日志查看',
      '添加系统监控界面',
    ],
    risks: ['用户体验不佳'],
    mitigation: ['用户测试', '界面优化'],
  },
};
```

### 8.2 部署检查清单

```yaml
部署前检查:
  环境配置:
    - [ ] 数据库连接配置正确
    - [ ] Redis连接配置正确
    - [ ] JWT密钥配置完成
    - [ ] 环境变量设置完整
    - [ ] HTTPS证书配置正确
    
  安全配置:
    - [ ] CORS策略配置正确
    - [ ] 安全头配置完成
    - [ ] 速率限制配置启用
    - [ ] 审计日志配置正确
    - [ ] 密码策略配置完成
    
  功能测试:
    - [ ] OAuth2.1流程测试通过
    - [ ] PKCE验证测试通过
    - [ ] 权限系统测试通过
    - [ ] 管理界面功能正常
    - [ ] API端点响应正常
    
  性能测试:
    - [ ] 负载测试通过
    - [ ] 数据库性能正常
    - [ ] 缓存性能正常
    - [ ] 响应时间符合要求
    
  监控配置:
    - [ ] 健康检查端点正常
    - [ ] 监控指标收集正常
    - [ ] 告警规则配置完成
    - [ ] 日志收集配置正确
    
  备份恢复:
    - [ ] 备份策略配置完成
    - [ ] 恢复流程测试通过
    - [ ] 数据迁移脚本准备
    - [ ] 回滚计划制定完成
```

## 9. 总结

本技术文档详细描述了OAuth2.1认证授权模型的完整实现方案，涵盖了从架构设计到部署运维的各个方面。主要特点包括：

### 9.1 核心优势

1. **标准合规**: 严格遵循OAuth2.1和OpenID Connect标准
2. **安全增强**: 强制PKCE、JWT签名、完善的安全策略
3. **权限精细**: 基于RBAC的多层权限控制
4. **可扩展性**: 模块化设计，支持水平扩展
5. **可观测性**: 完善的监控、日志和审计系统

### 9.2 技术亮点

- **现代技术栈**: Next.js 14 + TypeScript + Prisma
- **安全最佳实践**: PKCE、JWT轮换、速率限制
- **高性能**: Redis缓存、连接池、批量操作
- **用户友好**: 统一管理界面、权限可视化
- **运维友好**: 容器化部署、健康检查、自动备份

### 9.3 实施建议

1. **分阶段实施**: 按照迁移计划逐步推进
2. **充分测试**: 单元测试、集成测试、性能测试
3. **监控先行**: 部署监控系统，确保可观测性
4. **文档完善**: 维护API文档、运维手册
5. **团队培训**: 确保团队熟悉新系统

通过本方案的实施，将建立一个安全、可靠、易用的OAuth2.1认证授权中心，为企业应用提供统一的身份认证和访问控制服务。