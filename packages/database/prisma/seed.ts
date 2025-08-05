import { PrismaClient, Prisma, PermissionType } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const SALT_ROUNDS = 10; // bcrypt salt rounds

async function main() {
  console.log('prisma/seed.ts: 数据库填充脚本启动...'); // Database seeding script started...

  // =====================================================================================
  // 步骤 1: 定义和填充默认角色 (Define and seed default roles) - Section 8.1
  // =====================================================================================
  console.log('步骤 1: 开始填充默认角色...'); // Step 1: Starting to seed default roles...
  const rolesData = [
    {
      name: 'SYSTEM_ADMIN',
      displayName: '系统管理员', // System Administrator
      description: '拥有系统所有权限的超级管理员。', // Super administrator with all system permissions.
      isActive: true,
    },
    {
      name: 'USER_ADMIN',
      displayName: '用户管理员', // User Administrator
      description: '负责用户账户管理和用户相关的配置。', // Responsible for user account management and user-related configurations.
      isActive: true,
    },
    {
      name: 'PERMISSION_ADMIN',
      displayName: '权限管理员', // Permission Administrator
      description: '负责角色和权限的分配与管理。', // Responsible for role and permission assignment and management.
      isActive: true,
    },
    {
      name: 'CLIENT_ADMIN',
      displayName: '客户端管理员', // Client Administrator
      description: '负责OAuth客户端应用程序的管理。', // Responsible for managing OAuth client applications.
      isActive: true,
    },
    {
      name: 'AUDIT_ADMIN',
      displayName: '审计管理员', // Audit Administrator
      description: '负责审计日志的查看和管理。', // Responsible for viewing and managing audit logs.
      isActive: true,
    },
    {
      name: 'USER',
      displayName: '普通用户', // Regular User
      description: '拥有基本访问权限的普通注册用户。', // Registered user with basic access permissions.
      isActive: true,
    },
  ];

  const seededRoles: Record<string, Prisma.RoleGetPayload<true>> = {};
  for (const role of rolesData) {
    const upsertedRole = await prisma.role.upsert({
      where: { name: role.name },
      update: {
        displayName: role.displayName,
        description: role.description,
        isActive: role.isActive,
      },
      create: role,
    });
    seededRoles[upsertedRole.name] = upsertedRole;
    console.log(`角色已更新/创建: ${upsertedRole.name} (${upsertedRole.displayName})`); // Role upserted/created
  }
  console.log('默认角色填充完成。'); // Default roles seeded.

  // =====================================================================================
  // 步骤 2: 定义和填充默认权限 (Define and seed default permissions) - Section 8.2
  // =====================================================================================
  console.log('步骤 2: 开始填充默认权限...'); // Step 2: Starting to seed default permissions...
  const permissionsData: Prisma.PermissionCreateInput[] = [
    // 菜单权限 (Menu Permissions) - Section 2.2
    {
      name: 'menu:dashboard:view',
      displayName: '查看仪表盘',
      description: '访问仪表盘页面',
      type: PermissionType.MENU,
      resource: '/dashboard',
      action: 'VIEW',
      isActive: true,
    },
    {
      name: 'menu:system:view',
      displayName: '查看系统管理',
      description: '访问系统管理顶级菜单',
      type: PermissionType.MENU,
      resource: '/system',
      action: 'VIEW',
      isActive: true,
    },
    {
      name: 'menu:system:user:view',
      displayName: '查看用户管理',
      description: '访问用户管理页面',
      type: PermissionType.MENU,
      resource: '/system/user',
      action: 'VIEW',
      isActive: true,
    },
    {
      name: 'menu:system:role:view',
      displayName: '查看角色管理',
      description: '访问角色管理页面',
      type: PermissionType.MENU,
      resource: '/system/role',
      action: 'VIEW',
      isActive: true,
    },
    {
      name: 'menu:system:permission:view',
      displayName: '查看权限管理',
      description: '访问权限管理页面',
      type: PermissionType.MENU,
      resource: '/system/permission',
      action: 'VIEW',
      isActive: true,
    },
    {
      name: 'menu:system:menu:view',
      displayName: '查看菜单管理',
      description: '访问菜单管理页面',
      type: PermissionType.MENU,
      resource: '/system/menu',
      action: 'VIEW',
      isActive: true,
    },
    {
      name: 'menu:system:client:view',
      displayName: '查看客户端管理',
      description: '访问OAuth客户端管理页面',
      type: PermissionType.MENU,
      resource: '/system/client',
      action: 'VIEW',
      isActive: true,
    },
    {
      name: 'menu:system:audit:view',
      displayName: '查看审计日志',
      description: '访问审计日志页面',
      type: PermissionType.MENU,
      resource: '/system/audit',
      action: 'VIEW',
      isActive: true,
    },
    {
      name: 'menu:system:config:view',
      displayName: '查看系统配置',
      description: '访问系统配置页面',
      type: PermissionType.MENU,
      resource: '/system/config',
      action: 'VIEW',
      isActive: true,
    },
    {
      name: 'menu:system:policy:view',
      displayName: '查看安全策略',
      description: '访问安全策略页面',
      type: PermissionType.MENU,
      resource: '/system/policy',
      action: 'VIEW',
      isActive: true,
    },
    {
      name: 'menu:profile:view',
      displayName: '查看个人资料',
      description: '访问个人资料页面',
      type: PermissionType.MENU,
      resource: '/profile',
      action: 'VIEW',
      isActive: true,
    },

    // API权限 (API Permissions) - Section 3.1 / Section 8.2 SQL
    // User Management
    {
      name: 'user:list',
      displayName: '列出用户',
      description: '获取用户列表',
      type: PermissionType.API,
      resource: '/api/v2/users',
      action: 'GET',
      isActive: true,
    },
    {
      name: 'user:create',
      displayName: '创建用户',
      description: '创建新用户',
      type: PermissionType.API,
      resource: '/api/v2/users',
      action: 'POST',
      isActive: true,
    },
    {
      name: 'user:read',
      displayName: '读取用户',
      description: '获取单个用户信息',
      type: PermissionType.API,
      resource: '/api/v2/users/{userId}',
      action: 'GET',
      isActive: true,
    },
    {
      name: 'user:update',
      displayName: '更新用户',
      description: '更新用户信息',
      type: PermissionType.API,
      resource: '/api/v2/users/{userId}',
      action: 'PUT',
      isActive: true,
    },
    {
      name: 'user:delete',
      displayName: '删除用户',
      description: '删除用户',
      type: PermissionType.API,
      resource: '/api/v2/users/{userId}',
      action: 'DELETE',
      isActive: true,
    },
    {
      name: 'user:status:update',
      displayName: '更新用户状态',
      description: '激活或停用用户账户',
      type: PermissionType.API,
      resource: '/api/v2/users/{userId}/status',
      action: 'PUT',
      isActive: true,
    },
    {
      name: 'user:password:reset',
      displayName: '重置用户密码',
      description: '管理员重置用户密码',
      type: PermissionType.API,
      resource: '/api/v2/users/{userId}/password-reset',
      action: 'POST',
      isActive: true,
    },
    {
      name: 'user:roles:list',
      displayName: '列出用户角色',
      description: '获取用户的角色列表',
      type: PermissionType.API,
      resource: '/api/v2/users/{userId}/roles',
      action: 'GET',
      isActive: true,
    },
    {
      name: 'user:roles:assign',
      displayName: '分配用户角色',
      description: '为用户分配角色',
      type: PermissionType.API,
      resource: '/api/v2/users/{userId}/roles',
      action: 'POST',
      isActive: true,
    },
    {
      name: 'user:roles:remove',
      displayName: '移除用户角色',
      description: '移除用户的角色',
      type: PermissionType.API,
      resource: '/api/v2/users/{userId}/roles/{roleId}',
      action: 'DELETE',
      isActive: true,
    },
    {
      name: 'user:profile:read',
      displayName: '读取用户个人资料',
      description: '获取指定用户的个人资料',
      type: PermissionType.API,
      resource: '/api/v2/users/{userId}/profile',
      action: 'GET',
      isActive: true,
    },
    {
      name: 'user:profile:update',
      displayName: '更新用户个人资料',
      description: '更新指定用户的个人资料',
      type: PermissionType.API,
      resource: '/api/v2/users/{userId}/profile',
      action: 'PUT',
      isActive: true,
    },
    {
      name: 'users:permissions:verify',
      displayName: '验证用户权限',
      description: '批量验证用户是否拥有特定权限',
      type: PermissionType.API,
      resource: '/api/v2/users/{userId}/permissions/verify',
      action: 'POST',
      isActive: true,
    },
    {
      name: 'users:permissions:read',
      displayName: '读取用户权限列表',
      description: '获取特定用户的有效权限列表',
      type: PermissionType.API,
      resource: '/api/v2/users/{userId}/permissions',
      action: 'GET',
      isActive: true,
    },
    {
      name: 'users:lock',
      displayName: '锁定用户账户',
      description: '管理员锁定用户账户',
      type: PermissionType.API,
      resource: '/api/v2/users/{userId}/lock',
      action: 'POST',
      isActive: true,
    },
    {
      name: 'users:unlock',
      displayName: '解锁用户账户',
      description: '管理员解锁用户账户',
      type: PermissionType.API,
      resource: '/api/v2/users/{userId}/unlock',
      action: 'POST',
      isActive: true,
    },

    // Role Management
    {
      name: 'role:list',
      displayName: '列出角色',
      description: '获取角色列表',
      type: PermissionType.API,
      resource: '/api/v2/roles',
      action: 'GET',
      isActive: true,
    },
    {
      name: 'role:create',
      displayName: '创建角色',
      description: '创建新角色',
      type: PermissionType.API,
      resource: '/api/v2/roles',
      action: 'POST',
      isActive: true,
    },
    {
      name: 'role:read',
      displayName: '读取角色',
      description: '获取单个角色信息',
      type: PermissionType.API,
      resource: '/api/v2/roles/{roleId}',
      action: 'GET',
      isActive: true,
    },
    {
      name: 'role:update',
      displayName: '更新角色',
      description: '更新角色信息',
      type: PermissionType.API,
      resource: '/api/v2/roles/{roleId}',
      action: 'PUT',
      isActive: true,
    },
    {
      name: 'role:delete',
      displayName: '删除角色',
      description: '删除角色',
      type: PermissionType.API,
      resource: '/api/v2/roles/{roleId}',
      action: 'DELETE',
      isActive: true,
    },
    {
      name: 'role:permissions:list',
      displayName: '列出角色权限',
      description: '获取角色的权限列表',
      type: PermissionType.API,
      resource: '/api/v2/roles/{roleId}/permissions',
      action: 'GET',
      isActive: true,
    },
    {
      name: 'role:permissions:assign',
      displayName: '分配角色权限',
      description: '为角色分配权限',
      type: PermissionType.API,
      resource: '/api/v2/roles/{roleId}/permissions',
      action: 'POST',
      isActive: true,
    },
    {
      name: 'role:permissions:remove',
      displayName: '移除角色权限',
      description: '移除角色的权限',
      type: PermissionType.API,
      resource: '/api/v2/roles/{roleId}/permissions/{permissionId}',
      action: 'DELETE',
      isActive: true,
    },

    // Permission Management
    {
      name: 'permission:list',
      displayName: '列出权限定义',
      description: '获取所有已定义的权限列表',
      type: PermissionType.API,
      resource: '/api/v2/permissions',
      action: 'GET',
      isActive: true,
    },
    {
      name: 'permission:create',
      displayName: '创建权限定义',
      description: '创建新的权限定义',
      type: PermissionType.API,
      resource: '/api/v2/permissions',
      action: 'POST',
      isActive: true,
    },
    {
      name: 'permission:read',
      displayName: '读取权限定义',
      description: '获取特定权限定义的详细信息',
      type: PermissionType.API,
      resource: '/api/v2/permissions/{permissionId}',
      action: 'GET',
      isActive: true,
    },
    {
      name: 'permission:update',
      displayName: '更新权限定义',
      description: '更新现有权限定义的信息',
      type: PermissionType.API,
      resource: '/api/v2/permissions/{permissionId}',
      action: 'PUT',
      isActive: true,
    },
    {
      name: 'permission:delete',
      displayName: '删除权限定义',
      description: '删除一个权限定义',
      type: PermissionType.API,
      resource: '/api/v2/permissions/{permissionId}',
      action: 'DELETE',
      isActive: true,
    },

    // OAuth Client Management
    {
      name: 'client:list',
      displayName: '列出客户端',
      description: '获取OAuth客户端列表',
      type: PermissionType.API,
      resource: '/api/v2/clients',
      action: 'GET',
      isActive: true,
    },
    {
      name: 'client:create',
      displayName: '创建客户端',
      description: '创建新OAuth客户端',
      type: PermissionType.API,
      resource: '/api/v2/clients',
      action: 'POST',
      isActive: true,
    },
    {
      name: 'client:read',
      displayName: '读取客户端',
      description: '获取单个OAuth客户端信息',
      type: PermissionType.API,
      resource: '/api/v2/clients/{clientId}',
      action: 'GET',
      isActive: true,
    },
    {
      name: 'client:update',
      displayName: '更新客户端',
      description: '更新OAuth客户端信息',
      type: PermissionType.API,
      resource: '/api/v2/clients/{clientId}',
      action: 'PUT',
      isActive: true,
    },
    {
      name: 'client:delete',
      displayName: '删除客户端',
      description: '删除OAuth客户端',
      type: PermissionType.API,
      resource: '/api/v2/clients/{clientId}',
      action: 'DELETE',
      isActive: true,
    },

    // Audit Log Management
    {
      name: 'audit:list',
      displayName: '列出审计日志',
      description: '获取审计日志列表',
      type: PermissionType.API,
      resource: '/api/v2/audits',
      action: 'GET',
      isActive: true,
    },
    {
      name: 'audit:read',
      displayName: '读取审计日志',
      description: '获取单个审计日志详情',
      type: PermissionType.API,
      resource: '/api/v2/audits/{logId}',
      action: 'GET',
      isActive: true,
    },

    // System Configuration Management
    {
      name: 'config:list',
      displayName: '列出系统配置',
      description: '获取系统配置项列表',
      type: PermissionType.API,
      resource: '/api/v2/system-configurations',
      action: 'GET',
      isActive: true,
    },
    {
      name: 'config:read',
      displayName: '读取系统配置',
      description: '获取单个系统配置项',
      type: PermissionType.API,
      resource: '/api/v2/system-configurations/{key}',
      action: 'GET',
      isActive: true,
    },
    {
      name: 'config:update',
      displayName: '更新系统配置',
      description: '更新系统配置项',
      type: PermissionType.API,
      resource: '/api/v2/system-configurations/{key}',
      action: 'PUT',
      isActive: true,
    },

    // Security Policy Management
    {
      name: 'policy:list',
      displayName: '列出安全策略',
      description: '获取安全策略列表',
      type: PermissionType.API,
      resource: '/api/v2/security-policies',
      action: 'GET',
      isActive: true,
    },
    {
      name: 'policy:read',
      displayName: '读取安全策略',
      description: '获取单个安全策略',
      type: PermissionType.API,
      resource: '/api/v2/security-policies/{policyId}',
      action: 'GET',
      isActive: true,
    },
    {
      name: 'policy:update',
      displayName: '更新安全策略',
      description: '更新安全策略',
      type: PermissionType.API,
      resource: '/api/v2/security-policies/{policyId}',
      action: 'PUT',
      isActive: true,
    },

    // Current User Profile (Self-service)
    {
      name: 'profile:me:read',
      displayName: '读取我的个人资料',
      description: '获取当前用户的个人资料',
      type: PermissionType.API,
      resource: '/api/v2/profile/me',
      action: 'GET',
      isActive: true,
    },
    {
      name: 'profile:me:update',
      displayName: '更新我的个人资料',
      description: '更新当前用户的个人资料',
      type: PermissionType.API,
      resource: '/api/v2/profile/me',
      action: 'PUT',
      isActive: true,
    },
    {
      name: 'profile:me:password:change',
      displayName: '修改我的密码',
      description: '当前用户修改自己的密码',
      type: PermissionType.API,
      resource: '/api/v2/profile/me/password',
      action: 'POST',
      isActive: true,
    },
    // 新增Auth Center交互权限 (New Auth Center Interaction Permission)
    {
      name: 'auth-center:interact',
      displayName: '与认证中心UI交互', // Interact with Auth Center UI
      description: '允许用户在登录后与认证中心页面（如同意页面）进行交互。', // Allows users to interact with auth center pages like consent after login.
      type: PermissionType.API, // 或根据实际情况定义为更合适的类型 (Or define as a more appropriate type based on context)
      resource: 'auth-center', // 虚拟资源，代表认证中心本身 (Virtual resource representing the auth center itself)
      action: 'interact', // 交互动作 (Interaction action)
      isActive: true,
    },
    // 新增客户端密钥重置权限
    {
      name: 'client:secret:reset',
      displayName: '重置客户端密钥',
      description: '重置OAuth客户端的密钥',
      type: PermissionType.API,
      resource: '/api/v2/clients/{clientId}/secret',
      action: 'POST',
      isActive: true,
    },
  ];

  const seededPermissions: Record<string, Prisma.PermissionGetPayload<true>> = {};
  for (const permData of permissionsData) {
    const permission = await prisma.permission.upsert({
      where: { name: permData.name },
      update: {
        displayName: permData.displayName,
        description: permData.description,
        resource: permData.resource,
        action: permData.action,
        type: permData.type,
        isActive: permData.isActive,
      },
      create: permData,
    });
    seededPermissions[permission.name] = permission;
    console.log(`权限已更新/创建: ${permission.name} (${permission.displayName})`); // Permission upserted/created
  }
  console.log('默认权限填充完成。'); // Default permissions seeded.

  // =====================================================================================
  // 步骤 3: 分配权限给角色 (Assign permissions to roles) - Section 8.3
  // =====================================================================================
  console.log('步骤 3: 开始分配权限给角色...'); // Step 3: Starting to assign permissions to roles...
  const rolePermissionsMapping: Record<string, string[]> = {
    USER_ADMIN: [
      'menu:system:user:view',
      'user:list',
      'user:create',
      'user:read',
      'user:update',
      'user:status:update',
      'user:password:reset',
      'user:roles:list',
      'user:roles:assign',
      'user:roles:remove',
      'user:profile:read',
      'user:profile:update',
      'users:permissions:verify',
      'users:permissions:read',
      'users:lock',
      'users:unlock', // Added new permissions for USER_ADMIN
    ],
    PERMISSION_ADMIN: [
      'menu:system:role:view',
      'menu:system:permission:view', // Menu permissions
      'role:list',
      'role:create',
      'role:read',
      'role:update',
      'role:delete', // Role CRUD
      'role:permissions:list',
      'role:permissions:assign',
      'role:permissions:remove', // Role-Permission assignment
      'permission:list',
      'permission:create',
      'permission:read',
      'permission:update',
      'permission:delete', // Permission definition CRUD
    ],
    CLIENT_ADMIN: [
      'menu:system:client:view',
      'client:list',
      'client:create',
      'client:read',
      'client:update',
      'client:delete',
      'client:secret:reset',
    ],
    AUDIT_ADMIN: ['menu:system:audit:view', 'audit:list', 'audit:read'],
    USER: [
      // Basic user permissions
      'menu:dashboard:view',
      'menu:profile:view',
      'profile:me:read',
      'profile:me:update',
      'profile:me:password:change',
      'auth-center:interact', // 为普通用户添加交互权限 (Add interaction permission for regular users)
    ],
    // SYSTEM_ADMIN will get all permissions later, including auth-center:interact
  };

  for (const roleName in rolePermissionsMapping) {
    const role = seededRoles[roleName];
    if (!role) {
      console.warn(`角色 ${roleName} 未找到，跳过权限分配。`); // Role not found, skipping permission assignment.
      continue;
    }
    for (const permName of rolePermissionsMapping[roleName]) {
      const permission = seededPermissions[permName];
      if (!permission) {
        console.warn(`权限 ${permName} 未找到，跳过为角色 ${roleName} 分配此权限。`); // Permission not found, skipping assignment for this role.
        continue;
      }
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      });
      console.log(`权限 '${permission.name}' 已分配给角色 '${role.name}'`); // Permission assigned to role
    }
  }

  // 为 SYSTEM_ADMIN 分配所有权限 (Assign all permissions to SYSTEM_ADMIN)
  const systemAdminRole = seededRoles['SYSTEM_ADMIN'];
  if (systemAdminRole) {
    for (const permName in seededPermissions) {
      // This loop already includes the new 'auth-center:interact'
      const permission = seededPermissions[permName];
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: systemAdminRole.id, permissionId: permission.id } },
        update: {},
        create: { roleId: systemAdminRole.id, permissionId: permission.id },
      });
    }
    console.log(
      `所有权限已分配给角色 '${systemAdminRole.name}' (All permissions assigned to role '${systemAdminRole.name}')`
    );
  } else {
    console.warn(
      'SYSTEM_ADMIN 角色未找到，无法分配所有权限。(SYSTEM_ADMIN role not found, cannot assign all permissions.)'
    );
  }
  console.log('角色权限分配完成。'); // Role permission assignment completed.

  // =====================================================================================
  // 步骤 4: 创建默认管理员用户 (Create default admin user) - Section 8.4
  // =====================================================================================
  console.log('步骤 4: 开始创建默认管理员用户...'); // Step 4: Starting to create default admin user...
  const adminPassword = 'adminpassword'; // 强烈建议首次登录后修改 (Highly recommend changing after first login)
  const hashedAdminPassword = await bcrypt.hash(adminPassword, SALT_ROUNDS);

  const adminUser = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {
      // In case the user exists, update relevant fields
      passwordHash: hashedAdminPassword,
      isActive: true,
      mustChangePassword: true,
      firstName: '系统', // System
      lastName: '管理员', // Administrator
      displayName: '系统管理员',
    },
    create: {
      username: 'admin',
      passwordHash: hashedAdminPassword,
      isActive: true,
      mustChangePassword: true,
      firstName: '系统', // System
      lastName: '管理员', // Administrator
      displayName: '系统管理员',
      avatar: null,
      organization: '默认组织', // Default Organization
      department: 'IT部门', // IT Department
    },
  });
  console.log(`默认管理员用户已更新/创建: ${adminUser.username} (密码: ${adminPassword})`); // Default admin user upserted/created

  // 为管理员用户记录密码历史 (Log password history for admin user)
  await prisma.passwordHistory
    .create({
      data: {
        userId: adminUser.id,
        passwordHash: hashedAdminPassword,
      },
    })
    .catch((e) =>
      console.warn(`为用户 ${adminUser.username} 添加密码历史失败，可能已存在: ${e.message}`)
    );

  // 为管理员用户分配 SYSTEM_ADMIN 角色 (Assign SYSTEM_ADMIN role to admin user)
  if (systemAdminRole) {
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: adminUser.id, roleId: systemAdminRole.id } },
      update: {},
      create: { userId: adminUser.id, roleId: systemAdminRole.id },
    });
    console.log(`角色 '${systemAdminRole.name}' 已分配给用户 '${adminUser.username}'`); // Role assigned to user
  } else {
    console.warn(`SYSTEM_ADMIN 角色未找到，无法分配给用户 '${adminUser.username}'`); // SYSTEM_ADMIN role not found, cannot assign to user.
  }
  console.log('默认管理员用户创建完成。'); // Default admin user creation completed.

  // =====================================================================================
  // 步骤 5: 维护其他实体的现有填充逻辑 (Maintain existing seeding logic for other entities)
  // =====================================================================================
  console.log('步骤 5: 开始填充其他实体 (Scope, 测试用户, OAuth客户端)...'); // Step 5: Starting to seed other entities...

  // 5.1 Seed Scopes (OIDC 和其他自定义 Scope)
  console.log('正在填充 Scopes...'); // Seeding Scopes...
  const scopesToSeed = [
    { name: 'openid', description: 'OIDC必须 Scope，用于认证。', isPublic: true, isActive: true },
    { name: 'profile', description: '访问用户基本个人资料信息。', isPublic: true, isActive: true },

    {
      name: 'offline_access',
      description: '允许发放刷新令牌以实现长期访问。',
      isPublic: true,
      isActive: true,
    },
    { name: 'order:read', description: '允许读取订单信息。', isPublic: false, isActive: true },
    { name: 'order:create', description: '允许创建新订单。', isPublic: false, isActive: true },
    { name: 'product:read', description: '允许读取产品信息。', isPublic: false, isActive: true },
    // Scopes for specific permissions if required (coarse-grained access)
    // Example: 'user_management_admin' could map to several fine-grained permissions
    {
      name: 'admin:full_access',
      description: '完全管理权限 (粗粒度)',
      isPublic: false,
      isActive: true,
    },
  ];
  for (const scopeData of scopesToSeed) {
    const createdScope = await prisma.scope.upsert({
      where: { name: scopeData.name },
      update: {
        description: scopeData.description,
        isPublic: scopeData.isPublic,
        isActive: scopeData.isActive,
      },
      create: scopeData,
    });

    // 为admin:full_access scope关联所有权限
    if (scopeData.name === 'admin:full_access') {
      for (const permission of Object.values(seededPermissions)) {
        await prisma.scopePermission.upsert({
          where: {
            scopeId_permissionId: {
              scopeId: createdScope.id,
              permissionId: permission.id,
            },
          },
          update: {},
          create: {
            scopeId: createdScope.id,
            permissionId: permission.id,
          },
        });
      }
      console.log(`Scope '${scopeData.name}' 已关联所有权限`);
    }

    // 为其他scope关联对应的权限
    if (scopeData.name === 'order:read') {
      const orderReadPermission = seededPermissions['order:read'];
      if (orderReadPermission) {
        await prisma.scopePermission.upsert({
          where: {
            scopeId_permissionId: {
              scopeId: createdScope.id,
              permissionId: orderReadPermission.id,
            },
          },
          update: {},
          create: {
            scopeId: createdScope.id,
            permissionId: orderReadPermission.id,
          },
        });
      }
    }

    if (scopeData.name === 'order:create') {
      const orderCreatePermission = seededPermissions['order:create'];
      if (orderCreatePermission) {
        await prisma.scopePermission.upsert({
          where: {
            scopeId_permissionId: {
              scopeId: createdScope.id,
              permissionId: orderCreatePermission.id,
            },
          },
          update: {},
          create: {
            scopeId: createdScope.id,
            permissionId: orderCreatePermission.id,
          },
        });
      }
    }

    if (scopeData.name === 'product:read') {
      const productReadPermission = seededPermissions['product:read'];
      if (productReadPermission) {
        await prisma.scopePermission.upsert({
          where: {
            scopeId_permissionId: {
              scopeId: createdScope.id,
              permissionId: productReadPermission.id,
            },
          },
          update: {},
          create: {
            scopeId: createdScope.id,
            permissionId: productReadPermission.id,
          },
        });
      }
    }
  }
  console.log('Scopes 和 Scope-Permission 关联填充完成。'); // Scopes and scope-permission relationships seeded.

  // 5.2 Seed Additional Test Users (保留现有测试用户)
  console.log('正在填充其他测试用户...'); // Seeding additional test users...
  const generalPassword = 'password';
  const hashedGeneralPassword = await bcrypt.hash(generalPassword, SALT_ROUNDS);
  const userRole = seededRoles['USER']; // Get the 'USER' role
  const userAdminRole = seededRoles['USER_ADMIN']; // Get the 'USER_ADMIN' role

  const usersToSeed = [
    {
      username: 'useradmin',
      firstName: '用户',
      lastName: '管理员',
      isActive: true,
      mustChangePassword: false,
    },
    {
      username: 'testuser',
      firstName: '普通',
      lastName: '用户',
      isActive: true,
      mustChangePassword: false,
    },
    {
      username: 'inactiveuser',
      firstName: '停用',
      lastName: '用户',
      isActive: false,
      mustChangePassword: false,
    },
    {
      username: 'lockeduser',
      firstName: '锁定',
      lastName: '用户',
      isActive: true,
      mustChangePassword: false,
      lockedUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    }, // Locked for 7 days
    {
      username: 'changepwuser',
      firstName: '修改密码',
      lastName: '用户',
      isActive: true,
      mustChangePassword: true,
    },
  ];

  for (const userData of usersToSeed) {
    const createdUser = await prisma.user.upsert({
      where: { username: userData.username },
      update: { ...userData, passwordHash: hashedGeneralPassword },
      create: { ...userData, passwordHash: hashedGeneralPassword },
    });
    console.log(`测试用户已更新/创建: ${createdUser.username}`); // Test user upserted/created
    await prisma.passwordHistory
      .create({
        data: { userId: createdUser.id, passwordHash: hashedGeneralPassword },
      })
      .catch((e) => console.warn(`为用户 ${createdUser.username} 添加密码历史失败: ${e.message}`));

    // Assign 'USER' role to 'testuser' and 'changepwuser'
    if (
      userRole &&
      (createdUser.username === 'testuser' || createdUser.username === 'changepwuser')
    ) {
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: createdUser.id, roleId: userRole.id } },
        update: {},
        create: { userId: createdUser.id, roleId: userRole.id },
      });
      console.log(`角色 '${userRole.name}' 已分配给用户 '${createdUser.username}'`);
    }

    // Assign 'USER_ADMIN' role to 'useradmin'
    if (userAdminRole && createdUser.username === 'useradmin') {
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: createdUser.id, roleId: userAdminRole.id } },
        update: {},
        create: { userId: createdUser.id, roleId: userAdminRole.id },
      });
      console.log(`角色 '${userAdminRole.name}' 已分配给用户 '${createdUser.username}'`);
    }
  }
  console.log('其他测试用户填充完成。'); // Additional test users seeded.

  // 5.3 Seed OAuth Clients (保留现有客户端)
  console.log('正在填充 OAuth 客户端...'); // Seeding OAuth Clients...
  
  // Admin Portal Client (admin-portal应用使用的客户端)
  const adminPortalSecretRaw = 'admin-portal-secret-key-change-this-in-production';
  const hashedAdminPortalSecret = await bcrypt.hash(adminPortalSecretRaw, SALT_ROUNDS);

  await prisma.oAuthClient.upsert({
    where: { clientId: 'admin-portal-client' },
    update: {
      clientSecret: hashedAdminPortalSecret,
      name: '管理员门户',
      allowedScopes: JSON.stringify([
        'openid', 'profile', 'email', 'user:read', 'user:write', 'role:read', 
        'role:write', 'permission:read', 'permission:write', 'client:read', 
        'client:write', 'audit:read'
      ]),
    },
    create: {
      clientId: 'admin-portal-client',
      clientSecret: hashedAdminPortalSecret,
      name: '管理员门户',
      description: '企业统一认证管理后台，用于用户和权限管理',
      clientType: 'CONFIDENTIAL',
      redirectUris: JSON.stringify([
        'http://localhost:3002/auth/callback',
        'https://admin-portal.example.com/auth/callback',
      ]),
      grantTypes: JSON.stringify(['authorization_code', 'refresh_token']),
      responseTypes: JSON.stringify(['code']),
      allowedScopes: JSON.stringify([
        'openid', 'profile', 'email', 'user:read', 'user:write', 'role:read', 
        'role:write', 'permission:read', 'permission:write', 'client:read', 
        'client:write', 'audit:read'
      ]),
      requirePkce: true,
      requireConsent: false, // 管理员门户不需要用户同意
      accessTokenTtl: 3600, // 1小时
      refreshTokenTtl: 86400, // 24小时
      authorizationCodeLifetime: 600, // 10分钟
      isActive: true,
      tokenEndpointAuthMethod: 'client_secret_basic',
    },
  });
  console.log(
    `OAuth客户端已更新/创建: admin-portal-client (原始密钥: ${adminPortalSecretRaw})`
  );

  // Auth Center Admin Client (现有的认证中心管理客户端)
  const adminClientSecretRaw = 'authcenteradminclientsecret'; // CHANGE THIS IN PRODUCTION
  const hashedAdminClientSecret = await bcrypt.hash(adminClientSecretRaw, SALT_ROUNDS);

  // Collect scope names that exist in the Scope table
  const existingScopeNames = ['openid', 'profile', 'offline_access', 'admin:full_access'];
  const adminClientAllowedScopes = JSON.stringify(existingScopeNames);

  await prisma.oAuthClient.upsert({
    where: { clientId: 'auth-center-admin-client' },
    update: {
      clientSecret: hashedAdminClientSecret,
      name: '认证中心管理后台客户端', // Auth Center Admin UI Client
      allowedScopes: adminClientAllowedScopes, // Grant all permissions via scopes for simplicity
    },
    create: {
      clientId: 'auth-center-admin-client',
      clientSecret: hashedAdminClientSecret,
      name: '认证中心管理后台客户端',
      description: '用于认证中心管理后台UI的OAuth客户端。', // OAuth client for the Auth Center Admin UI.
      clientType: 'CONFIDENTIAL',
      redirectUris: JSON.stringify([
        'http://localhost:3002/auth/callback',
        'http://localhost:3002/api/auth/callback/credentials',
        'http://localhost:3000/callback',
        'http://localhost:8000/callback',
        'https://admin.auth.example.com/callback',
      ]),
      grantTypes: JSON.stringify(['authorization_code', 'refresh_token', 'client_credentials']),
      responseTypes: JSON.stringify(['code']),
      allowedScopes: adminClientAllowedScopes,
      accessTokenTtl: 3600, // 1 hour
      refreshTokenTtl: 86400 * 30, // 30 days
      authorizationCodeLifetime: 600, // 10 minutes
      requirePkce: true,
      requireConsent: false, // Admin client often doesn't require user consent for its own operations
      isActive: true,
      tokenEndpointAuthMethod: 'client_secret_basic',
    },
  });
  console.log(
    `OAuth客户端已更新/创建: auth-center-admin-client (原始密钥: ${adminClientSecretRaw})`
  ); // OAuth client upserted/created

  // Public Test Client (SPA)
  await prisma.oAuthClient.upsert({
    where: { clientId: 'public-test-client' },
    update: {}, // No secret to update
    create: {
      clientId: 'public-test-client',
      name: '公共测试SPA客户端', // Public Test SPA Client
      description: '用于测试的公共SPA客户端。', // Public SPA client for testing.
      clientType: 'PUBLIC',
      redirectUris: JSON.stringify([
        'http://localhost:3001/callback',
        'https://spa.example.com/callback',
      ]),
      grantTypes: JSON.stringify(['authorization_code', 'refresh_token']),
      responseTypes: JSON.stringify(['code']),
      allowedScopes: JSON.stringify(['openid', 'profile', 'order:read', 'product:read']),
      requirePkce: true,
      requireConsent: true,
      isActive: true,
      tokenEndpointAuthMethod: 'none',
      accessTokenTtl: 1800, // 30 minutes
    },
  });
  console.log('OAuth客户端已更新/创建: public-test-client');

  // Confidential Test Client (Web App)
  const confidentialClientSecretRaw = 'testconfidentialclientsecret'; // CHANGE THIS
  const hashedConfidentialClientSecret = await bcrypt.hash(
    confidentialClientSecretRaw,
    SALT_ROUNDS
  );
  await prisma.oAuthClient.upsert({
    where: { clientId: 'confidential-test-client' },
    update: { clientSecret: hashedConfidentialClientSecret },
    create: {
      clientId: 'confidential-test-client',
      name: '机密测试Web客户端', // Confidential Test Web Client
      description: '用于测试的机密Web应用程序客户端。', // Confidential client for testing web applications.
      clientSecret: hashedConfidentialClientSecret,
      clientType: 'CONFIDENTIAL',
      redirectUris: JSON.stringify([
        'http://localhost:3002/callback',
        'https://webapp.example.com/callback',
      ]),
      grantTypes: JSON.stringify(['authorization_code', 'refresh_token', 'client_credentials']),
      responseTypes: JSON.stringify(['code']),
      allowedScopes: JSON.stringify([
        'openid',
        'profile',
        'order:read',
        'order:create',
        'product:read',
        'offline_access',
      ]),
      requirePkce: true,
      requireConsent: true,
      isActive: true,
      tokenEndpointAuthMethod: 'client_secret_basic',
      accessTokenTtl: 3600, // 1 hour
      refreshTokenTtl: 86400 * 7, // 7 days
    },
  });
  console.log(
    `OAuth客户端已更新/创建: confidential-test-client (原始密钥: ${confidentialClientSecretRaw})`
  );
  console.log('OAuth客户端填充完成。'); // OAuth Clients seeded.

  console.log('数据库填充成功完成！'); // Database seeding finished successfully!
  console.log(`默认管理员用户名: admin / 密码: ${adminPassword}`); // Default admin username/password
  console.log(`测试用户用户名: testuser / 密码: ${generalPassword}`); // Test user username/password
}

main()
  .catch((e) => {
    console.error('数据库填充过程中发生错误:', e); // Error during seeding
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    console.log('数据库连接已断开。'); // Database connection disconnected.
  });
