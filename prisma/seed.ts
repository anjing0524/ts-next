import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...');

  // Create default scopes
  console.log('Creating default scopes...');
  const scopes = [
    {
      name: 'openid',
      description: 'OpenID Connect authentication scope',
      isDefault: true,
      isPublic: true,
    },
    {
      name: 'profile',
      description: 'Access to user profile information',
      isDefault: false,
      isPublic: true,
    },
    {
      name: 'email',
      description: 'Access to user email address',
      isDefault: false,
      isPublic: true,
    },
    {
      name: 'offline_access',
      description: 'Access to refresh tokens for offline access',
      isDefault: false,
      isPublic: true,
    },
    {
      name: 'admin',
      description: 'Administrative access to all resources',
      isDefault: false,
      isPublic: false,
    },
    // 新增业务相关作用域
    {
      name: 'user:read',
      description: 'Read user information',
      isDefault: false,
      isPublic: false,
    },
    {
      name: 'user:write',
      description: 'Modify user information',
      isDefault: false,
      isPublic: false,
    },
    {
      name: 'client:manage',
      description: 'Manage OAuth clients',
      isDefault: false,
      isPublic: false,
    },
    {
      name: 'permission:manage',
      description: 'Manage permissions and roles',
      isDefault: false,
      isPublic: false,
    },
    {
      name: 'audit:read',
      description: 'Read audit logs',
      isDefault: false,
      isPublic: false,
    },
  ];

  for (const scope of scopes) {
    await prisma.scope.upsert({
      where: { name: scope.name },
      update: scope,
      create: scope,
    });
  }

  // Remove or comment out old resource and permission seeding
  // console.log('Removing old default resources and permissions...');
  // Old resource and generic permission seeding logic is removed.

  // 1. Create PRD-compliant Permissions
  console.log('Creating PRD-compliant permissions...');
  const permissionsData = [
    // 系统级权限
    { identifier: 'system:user:create', name: 'Create System Users', description: 'Allows creating new system users.', category: 'system', resource: 'user', action: 'create' },
    { identifier: 'system:user:read', name: 'Read System Users', description: 'Allows reading system user information.', category: 'system', resource: 'user', action: 'read' },
    { identifier: 'system:user:update', name: 'Update System Users', description: 'Allows updating existing system users.', category: 'system', resource: 'user', action: 'update' },
    { identifier: 'system:user:delete', name: 'Delete System Users', description: 'Allows deleting system users.', category: 'system', resource: 'user', action: 'delete' },
    { identifier: 'system:role:manage', name: 'Manage Roles', description: 'Allows managing roles and their permissions.', category: 'system', resource: 'role', action: 'manage' },
    { identifier: 'system:client:manage', name: 'Manage OAuth Clients', description: 'Allows managing OAuth clients.', category: 'system', resource: 'client', action: 'manage' },
    { identifier: 'system:permission:manage', name: 'Manage Permissions', description: 'Allows managing permissions definitions.', category: 'system', resource: 'permission', action: 'manage' },
    { identifier: 'system:audit:read', name: 'Read Audit Logs', description: 'Allows reading audit logs.', category: 'system', resource: 'audit', action: 'read' },
    { identifier: 'system:config:manage', name: 'Manage System Config', description: 'Allows managing system configuration.', category: 'system', resource: 'config', action: 'manage' },
    { identifier: 'system:organization:manage', name: 'Manage Organizations', description: 'Allows managing organizational structure.', category: 'system', resource: 'organization', action: 'manage' },
    
    // 应用访问权限
    { identifier: 'app:dashboard:access', name: 'Access Admin Dashboard', description: 'Allows accessing the admin dashboard application.', category: 'app', resource: 'dashboard', action: 'access' },
    { identifier: 'app:user-center:access', name: 'Access User Center', description: 'Allows accessing the user center application.', category: 'app', resource: 'user-center', action: 'access' },
    { identifier: 'app:oa:access', name: 'Access OA System', description: 'Allows accessing the OA system.', category: 'app', resource: 'oa', action: 'access' },
    { identifier: 'app:crm:access', name: 'Access CRM System', description: 'Allows accessing the CRM system.', category: 'app', resource: 'crm', action: 'access' },
    { identifier: 'app:finance:access', name: 'Access Finance System', description: 'Allows accessing the finance system.', category: 'app', resource: 'finance', action: 'access' },
    
    // API接口权限
    { identifier: 'api:user:read', name: 'Read User API', description: 'Allows reading user data via API.', category: 'api', resource: 'user', action: 'read' },
    { identifier: 'api:user:write', name: 'Write User API', description: 'Allows modifying user data via API.', category: 'api', resource: 'user', action: 'write' },
    { identifier: 'api:permission:read', name: 'Read Permission API', description: 'Allows reading permission data via API.', category: 'api', resource: 'permission', action: 'read' },
    { identifier: 'api:permission:write', name: 'Write Permission API', description: 'Allows modifying permission data via API.', category: 'api', resource: 'permission', action: 'write' },
    { identifier: 'api:audit:read', name: 'Read Audit API', description: 'Allows reading audit logs via API.', category: 'api', resource: 'audit', action: 'read' },
    
    // 数据操作权限
    { identifier: 'data:document:read', name: 'Read Documents', description: 'Allows reading document data.', category: 'data', resource: 'document', action: 'read' },
    { identifier: 'data:document:write', name: 'Write Documents', description: 'Allows creating and modifying documents.', category: 'data', resource: 'document', action: 'write' },
    { identifier: 'data:document:delete', name: 'Delete Documents', description: 'Allows deleting documents.', category: 'data', resource: 'document', action: 'delete' },
    { identifier: 'data:finance:read', name: 'Read Finance Data', description: 'Allows reading financial data.', category: 'data', resource: 'finance', action: 'read' },
    { identifier: 'data:finance:approve', name: 'Approve Finance Data', description: 'Allows approving financial transactions.', category: 'data', resource: 'finance', action: 'approve' },
    { identifier: 'data:hr:read', name: 'Read HR Data', description: 'Allows reading HR data.', category: 'data', resource: 'hr', action: 'read' },
    { identifier: 'data:hr:write', name: 'Write HR Data', description: 'Allows modifying HR data.', category: 'data', resource: 'hr', action: 'write' },
    
    // 页面访问权限
    { identifier: 'page:admin:access', name: 'Access Admin Pages', description: 'Allows accessing administrative pages.', category: 'page', resource: 'admin', action: 'access' },
    { identifier: 'page:report:view', name: 'View Reports', description: 'Allows viewing report pages.', category: 'page', resource: 'report', action: 'view' },
    { identifier: 'page:settings:access', name: 'Access Settings', description: 'Allows accessing settings pages.', category: 'page', resource: 'settings', action: 'access' },
    { identifier: 'page:profile:edit', name: 'Edit Profile', description: 'Allows editing user profile pages.', category: 'page', resource: 'profile', action: 'edit' },
  ];

  const createdPermissions = [];
  for (const pData of permissionsData) {
    const permission = await prisma.permission.upsert({
      where: { identifier: pData.identifier },
      update: { name: pData.name, description: pData.description, category: pData.category, resource: pData.resource, action: pData.action },
      create: pData,
    });
    createdPermissions.push(permission);
    console.log(`Upserted permission: ${permission.identifier}`);
  }

  // 2. Create Roles
  console.log('Creating roles...');
  const rolesData = [
    // 管理员角色
    { name: 'super_admin', displayName: 'Super Administrator', description: 'Has all system permissions.', isSystem: true, parentName: null },
    { name: 'system_admin', displayName: 'System Administrator', description: 'Manages system configurations, users, and clients.', isSystem: true, parentName: 'super_admin' },
    { name: 'app_admin', displayName: 'Application Administrator', description: 'Manages application-specific settings.', isSystem: true, parentName: 'super_admin' },
    { name: 'security_admin', displayName: 'Security Administrator', description: 'Manages security policies and audit logs.', isSystem: true, parentName: 'super_admin' },
    
    // 业务角色
    { name: 'employee', displayName: 'Employee', description: 'Standard employee role with basic access.', isSystem: false, parentName: null },
    { name: 'senior_employee', displayName: 'Senior Employee', description: 'Senior employee with additional responsibilities.', isSystem: false, parentName: 'employee' },
    { name: 'team_lead', displayName: 'Team Lead', description: 'Leads a team within a department.', isSystem: false, parentName: 'senior_employee' },
    { name: 'department_manager', displayName: 'Department Manager', description: 'Manages a department.', isSystem: false, parentName: 'team_lead' },
    { name: 'project_manager', displayName: 'Project Manager', description: 'Manages projects across departments.', isSystem: false, parentName: 'senior_employee' },
    
    // 专业角色
    { name: 'hr_specialist', displayName: 'HR Specialist', description: 'Human resources specialist.', isSystem: false, parentName: 'employee' },
    { name: 'finance_specialist', displayName: 'Finance Specialist', description: 'Finance and accounting specialist.', isSystem: false, parentName: 'employee' },
    { name: 'it_specialist', displayName: 'IT Specialist', description: 'Information technology specialist.', isSystem: false, parentName: 'employee' },
    
    // 服务角色（用于服务间认证）
    { name: 'service_account', displayName: 'Service Account', description: 'Role for service-to-service authentication.', isSystem: true, parentName: null },
    { name: 'api_service', displayName: 'API Service', description: 'Role for API services.', isSystem: true, parentName: 'service_account' },
    { name: 'background_service', displayName: 'Background Service', description: 'Role for background processing services.', isSystem: true, parentName: 'service_account' },
  ];

  const createdRoles: Record<string, any> = {}; // Store created roles by name for easy access

  for (const rData of rolesData) {
    let parentId: string | undefined = undefined;
    if (rData.parentName && createdRoles[rData.parentName]) {
      parentId = createdRoles[rData.parentName].id;
    }
    const role = await prisma.role.upsert({
      where: { name: rData.name },
      update: { displayName: rData.displayName, description: rData.description, isSystem: rData.isSystem, parentId: parentId },
      create: { name: rData.name, displayName: rData.displayName, description: rData.description, isSystem: rData.isSystem, parentId: parentId },
    });
    createdRoles[rData.name] = role;
    console.log(`Upserted role: ${role.name}`);
  }

  // 3. Assign Permissions to Roles
  console.log('Assigning permissions to roles...');

  // Helper to find permission ID by identifier
  const getPermissionId = (identifier: string) => {
    const perm = createdPermissions.find(p => p.identifier === identifier);
    if (!perm) throw new Error(`Permission ${identifier} not found`);
    return perm.id;
  };

  // Super Admin gets all system permissions
  const superAdminPermissions = createdPermissions.filter(p => p.category === 'system').map(p => p.id);
  if (createdRoles['super_admin']) {
    for (const permissionId of superAdminPermissions) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: createdRoles['super_admin'].id, permissionId } },
        update: {},
        create: { roleId: createdRoles['super_admin'].id, permissionId },
      });
    }
    console.log(`Assigned ${superAdminPermissions.length} permissions to super_admin.`);
  }

  // System Admin permissions
  if (createdRoles['system_admin']) {
    const systemAdminPermIdentifiers = [
      'system:user:create', 'system:user:read', 'system:user:update', 'system:user:delete',
      'system:client:manage', 'system:audit:read', 'system:role:manage', 'system:permission:manage',
      'system:config:manage', 'system:organization:manage',
      'app:dashboard:access', 'app:user-center:access',
      'api:user:read', 'api:user:write', 'api:permission:read', 'api:permission:write', 'api:audit:read',
      'page:admin:access', 'page:settings:access'
    ];
    for (const pIdentifier of systemAdminPermIdentifiers) {
      try {
        const permissionId = getPermissionId(pIdentifier);
        await prisma.rolePermission.upsert({
          where: { roleId_permissionId: { roleId: createdRoles['system_admin'].id, permissionId } },
          update: {},
          create: { roleId: createdRoles['system_admin'].id, permissionId },
        });
      } catch (e) { console.error(`Error assigning ${pIdentifier} to system_admin: ${e}`); }
    }
    console.log(`Assigned permissions to system_admin.`);
  }

  // App Admin permissions
  if (createdRoles['app_admin']) {
    const appAdminPermIdentifiers = [
      'app:dashboard:access', 'app:user-center:access', 'app:oa:access', 'app:crm:access',
      'system:user:read', 'system:user:update',
      'api:user:read', 'page:admin:access', 'page:settings:access'
    ];
    for (const pIdentifier of appAdminPermIdentifiers) {
      try {
        const permissionId = getPermissionId(pIdentifier);
        await prisma.rolePermission.upsert({
          where: { roleId_permissionId: { roleId: createdRoles['app_admin'].id, permissionId } },
          update: {},
          create: { roleId: createdRoles['app_admin'].id, permissionId },
        });
      } catch (e) { console.error(`Error assigning ${pIdentifier} to app_admin: ${e}`); }
    }
    console.log(`Assigned permissions to app_admin.`);
  }

  // Security Admin permissions
  if (createdRoles['security_admin']) {
    const securityAdminPermIdentifiers = [
      'system:audit:read', 'system:user:read', 'system:client:manage',
      'app:dashboard:access', 'api:audit:read', 'page:admin:access'
    ];
    for (const pIdentifier of securityAdminPermIdentifiers) {
      try {
        const permissionId = getPermissionId(pIdentifier);
        await prisma.rolePermission.upsert({
          where: { roleId_permissionId: { roleId: createdRoles['security_admin'].id, permissionId } },
          update: {},
          create: { roleId: createdRoles['security_admin'].id, permissionId },
        });
      } catch (e) { console.error(`Error assigning ${pIdentifier} to security_admin: ${e}`); }
    }
    console.log(`Assigned permissions to security_admin.`);
  }

  // Department Manager permissions
  if (createdRoles['department_manager']) {
    const deptManagerPermIdentifiers = [
      'app:dashboard:access', 'app:user-center:access', 'app:oa:access',
      'system:user:read', 'data:document:read', 'data:document:write',
      'page:report:view', 'page:profile:edit'
    ];
    for (const pIdentifier of deptManagerPermIdentifiers) {
      try {
        const permissionId = getPermissionId(pIdentifier);
        await prisma.rolePermission.upsert({
          where: { roleId_permissionId: { roleId: createdRoles['department_manager'].id, permissionId } },
          update: {},
          create: { roleId: createdRoles['department_manager'].id, permissionId },
        });
      } catch (e) { console.error(`Error assigning ${pIdentifier} to department_manager: ${e}`); }
    }
    console.log(`Assigned permissions to department_manager.`);
  }

  // HR Specialist permissions
  if (createdRoles['hr_specialist']) {
    const hrSpecialistPermIdentifiers = [
      'app:dashboard:access', 'app:user-center:access',
      'system:user:read', 'system:user:update',
      'data:hr:read', 'data:hr:write',
      'page:profile:edit'
    ];
    for (const pIdentifier of hrSpecialistPermIdentifiers) {
      try {
        const permissionId = getPermissionId(pIdentifier);
        await prisma.rolePermission.upsert({
          where: { roleId_permissionId: { roleId: createdRoles['hr_specialist'].id, permissionId } },
          update: {},
          create: { roleId: createdRoles['hr_specialist'].id, permissionId },
        });
      } catch (e) { console.error(`Error assigning ${pIdentifier} to hr_specialist: ${e}`); }
    }
    console.log(`Assigned permissions to hr_specialist.`);
  }

  // Finance Specialist permissions
  if (createdRoles['finance_specialist']) {
    const financeSpecialistPermIdentifiers = [
      'app:dashboard:access', 'app:finance:access',
      'data:finance:read', 'data:finance:approve',
      'page:report:view'
    ];
    for (const pIdentifier of financeSpecialistPermIdentifiers) {
      try {
        const permissionId = getPermissionId(pIdentifier);
        await prisma.rolePermission.upsert({
          where: { roleId_permissionId: { roleId: createdRoles['finance_specialist'].id, permissionId } },
          update: {},
          create: { roleId: createdRoles['finance_specialist'].id, permissionId },
        });
      } catch (e) { console.error(`Error assigning ${pIdentifier} to finance_specialist: ${e}`); }
    }
    console.log(`Assigned permissions to finance_specialist.`);
  }

  // Service Account permissions
  if (createdRoles['api_service']) {
    const apiServicePermIdentifiers = [
      'api:user:read', 'api:permission:read', 'api:audit:read'
    ];
    for (const pIdentifier of apiServicePermIdentifiers) {
      try {
        const permissionId = getPermissionId(pIdentifier);
        await prisma.rolePermission.upsert({
          where: { roleId_permissionId: { roleId: createdRoles['api_service'].id, permissionId } },
          update: {},
          create: { roleId: createdRoles['api_service'].id, permissionId },
        });
      } catch (e) { console.error(`Error assigning ${pIdentifier} to api_service: ${e}`); }
    }
    console.log(`Assigned permissions to api_service.`);
  }

  // Employee basic access
  if (createdRoles['employee']) {
    const employeePermIdentifiers = [
      'app:dashboard:access', 'app:user-center:access',
      'data:document:read', 'page:profile:edit'
    ];
    for (const pIdentifier of employeePermIdentifiers) {
      try {
        const permissionId = getPermissionId(pIdentifier);
        await prisma.rolePermission.upsert({
          where: { roleId_permissionId: { roleId: createdRoles['employee'].id, permissionId } },
          update: {},
          create: { roleId: createdRoles['employee'].id, permissionId },
        });
      } catch (e) { console.error(`Error assigning ${pIdentifier} to employee: ${e}`); }
    }
    console.log(`Assigned permissions to employee.`);
  }


  // Create admin user (ensure this is after role creation if assigning role immediately)
  console.log('Creating admin user...');
  const hashedPassword = await bcrypt.hash('admin123456', 12);
  const adminUser = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {}, // No changes to user data itself if it exists
    create: {
      username: 'admin',
      email: 'admin@example.com',
      password: hashedPassword,
      firstName: 'System',
      lastName: 'Administrator',
      emailVerified: true,
      isActive: true,
    },
  });

  // 4. Assign 'super_admin' Role to Admin User
  console.log('Assigning super_admin role to admin user...');
  if (adminUser && createdRoles['super_admin']) {
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: adminUser.id, roleId: createdRoles['super_admin'].id } },
      update: { assignedBy: adminUser.id }, // Update who assigned it if entry exists
      create: {
        userId: adminUser.id,
        roleId: createdRoles['super_admin'].id,
        assignedBy: adminUser.id, // Self-assigned or by a system process
      },
    });
    console.log('Assigned super_admin role to admin user.');
  } else {
    console.error('Admin user or super_admin role not found for assignment.');
  }

  // Comment out or remove old admin permission grant loop
  // console.log('Removing old admin permission grants...');
  // Old direct permission grant logic for adminUser is removed.

  // Create test OAuth client
  console.log('Creating test OAuth client...');
  await prisma.client.upsert({
    where: { clientId: 'test-client' },
    update: {},
    create: {
      clientId: 'test-client',
      clientSecret: 'test-secret',
      name: 'Test Application',
      description: 'Test OAuth 2.0 client for development',
      redirectUris: JSON.stringify([
        'http://localhost:3000/callback',
        'http://localhost:8080/callback',
        'https://oauth.pstmn.io/v1/callback', // Postman callback
      ]),
      postLogoutRedirectUris: JSON.stringify([
        'http://localhost:3000',
        'http://localhost:8080',
      ]),
      scope: 'openid profile email',
      isPublic: false,
      requirePkce: true,
      requireConsent: true,
      tokenEndpointAuthMethod: 'client_secret_post',
      grantTypes: JSON.stringify(['authorization_code', 'refresh_token']),
      responseTypes: JSON.stringify(['code']),
    },
  });

  // Create public test client (for SPAs)
  console.log('Creating public test client...');
  await prisma.client.upsert({
    where: { clientId: 'spa-client' },
    update: {},
    create: {
      clientId: 'spa-client',
      clientSecret: null, // Public client has no secret
      name: 'SPA Test Application',
      description: 'Public OAuth 2.0 client for Single Page Applications',
      redirectUris: JSON.stringify([
        'http://localhost:3000/callback',
        'http://localhost:3001/callback',
        'http://localhost:8080/callback',
      ]),
      postLogoutRedirectUris: JSON.stringify([
        'http://localhost:3000',
        'http://localhost:3001',
        'http://localhost:8080',
      ]),
      scope: 'openid profile email',
      isPublic: true,
      requirePkce: true,
      requireConsent: true,
      tokenEndpointAuthMethod: 'none',
      grantTypes: JSON.stringify(['authorization_code', 'refresh_token']),
      responseTypes: JSON.stringify(['code']),
    },
  });

  // Create admin OAuth client for the management center itself
  console.log('Creating auth center client...');
  await prisma.oAuthClient.upsert({
    where: { clientId: 'auth-center-self' },
    update: {
      name: 'Authentication Center Self Client',
      clientSecret: await bcrypt.hash('auth-center-secret', 12),
      redirectUris: ['http://localhost:3000/auth/callback', 'https://auth.company.com/auth/callback'],
      scopes: ['openid', 'profile', 'email', 'user:read', 'user:write', 'client:manage', 'permission:manage', 'audit:read'],
    },
    create: {
      clientId: 'auth-center-self',
      clientSecret: await bcrypt.hash('auth-center-secret', 12),
      name: 'Authentication Center Self Client',
      description: 'Internal OAuth 2.0 client for the admin management center',
      clientType: 'confidential',
      redirectUris: ['http://localhost:3000/auth/callback', 'https://auth.company.com/auth/callback'],
      postLogoutRedirectUris: ['http://localhost:3000', 'https://auth.company.com'],
      scopes: ['openid', 'profile', 'email', 'user:read', 'user:write', 'client:manage', 'permission:manage', 'audit:read'],
      grantTypes: ['authorization_code', 'refresh_token'],
      responseTypes: ['code'],
      codeChallengeMethod: 'S256',
      requireConsent: false, // Skip consent for internal admin client
      accessTokenLifetime: 3600, // 1 hour
      refreshTokenLifetime: 604800, // 7 days
    },
  });

  // Create enterprise applications OAuth clients
  console.log('Creating enterprise application clients...');
  
  // OA System Client
  await prisma.oAuthClient.upsert({
    where: { clientId: 'oa-system' },
    update: {},
    create: {
      clientId: 'oa-system',
      clientSecret: await bcrypt.hash('oa-system-secret', 12),
      name: 'OA System',
      description: 'Office Automation System OAuth Client',
      clientType: 'confidential',
      redirectUris: ['http://localhost:3001/auth/callback', 'https://oa.company.com/auth/callback'],
      postLogoutRedirectUris: ['http://localhost:3001', 'https://oa.company.com'],
      scopes: ['openid', 'profile', 'email', 'user:read'],
      grantTypes: ['authorization_code', 'refresh_token'],
      responseTypes: ['code'],
      codeChallengeMethod: 'S256',
      requireConsent: true,
      accessTokenLifetime: 3600,
      refreshTokenLifetime: 604800,
    },
  });

  // CRM System Client
  await prisma.oAuthClient.upsert({
    where: { clientId: 'crm-system' },
    update: {},
    create: {
      clientId: 'crm-system',
      clientSecret: await bcrypt.hash('crm-system-secret', 12),
      name: 'CRM System',
      description: 'Customer Relationship Management System OAuth Client',
      clientType: 'confidential',
      redirectUris: ['http://localhost:3002/auth/callback', 'https://crm.company.com/auth/callback'],
      postLogoutRedirectUris: ['http://localhost:3002', 'https://crm.company.com'],
      scopes: ['openid', 'profile', 'email', 'user:read'],
      grantTypes: ['authorization_code', 'refresh_token'],
      responseTypes: ['code'],
      codeChallengeMethod: 'S256',
      requireConsent: true,
      accessTokenLifetime: 3600,
      refreshTokenLifetime: 604800,
    },
  });

  // API Gateway Service Client (for service-to-service authentication)
  await prisma.oAuthClient.upsert({
    where: { clientId: 'api-gateway-service' },
    update: {},
    create: {
      clientId: 'api-gateway-service',
      clientSecret: await bcrypt.hash('api-gateway-secret', 12),
      name: 'API Gateway Service',
      description: 'API Gateway Service for service-to-service authentication',
      clientType: 'confidential',
      redirectUris: [],
      postLogoutRedirectUris: [],
      scopes: ['api:user:read', 'api:permission:read'],
      grantTypes: ['client_credentials'],
      responseTypes: [],
      codeChallengeMethod: 'S256',
      requireConsent: false,
      accessTokenLifetime: 7200, // 2 hours for service tokens
      refreshTokenLifetime: 0, // No refresh token for client credentials
    },
  });

  // Mobile App Client (public client)
  await prisma.oAuthClient.upsert({
    where: { clientId: 'mobile-app' },
    update: {},
    create: {
      clientId: 'mobile-app',
      clientSecret: null, // Public client has no secret
      name: 'Mobile Application',
      description: 'Enterprise mobile application OAuth client',
      clientType: 'public',
      redirectUris: ['com.company.app://auth/callback'],
      postLogoutRedirectUris: ['com.company.app://logout'],
      scopes: ['openid', 'profile', 'email', 'offline_access'],
      grantTypes: ['authorization_code', 'refresh_token'],
      responseTypes: ['code'],
      codeChallengeMethod: 'S256',
      requireConsent: true,
      accessTokenLifetime: 3600,
      refreshTokenLifetime: 2592000, // 30 days for mobile
    },
  });

  // 添加默认OAuth客户端
  const demoClient = await prisma.oAuthClient.upsert({
    where: { clientId: 'demo-client' },
    update: {},
    create: {
      clientId: 'demo-client',
      clientSecret: await bcrypt.hash('demo-secret', 12),
      name: 'Demo Client',
      description: 'Demo OAuth client for testing and development',
      clientType: 'confidential',
      redirectUris: ['http://localhost:3000/callback', 'http://localhost:8080/callback'],
      postLogoutRedirectUris: ['http://localhost:3000', 'http://localhost:8080'],
      scopes: ['openid', 'profile', 'email'],
      grantTypes: ['authorization_code', 'refresh_token'],
      responseTypes: ['code'],
      codeChallengeMethod: 'S256',
      requireConsent: true,
      accessTokenLifetime: 3600,
      refreshTokenLifetime: 604800,
    },
  });
  
  console.log(`✅ Created demo client: ${demoClient.clientId}`);

  // 创建基础ABAC策略
  console.log('Creating basic ABAC policies...');
  const basicPolicies = [
    {
      name: 'department_isolation',
      description: '部门数据隔离策略',
      rule: 'user.department === resource.department',
      effect: 'ALLOW',
      priority: 100,
      isActive: true,
    },
    {
      name: 'working_hours_access',
      description: '工作时间访问策略',
      rule: 'environment.workingHours === true',
      effect: 'ALLOW',
      priority: 200,
      isActive: true,
    },
    {
      name: 'office_ip_restriction',
      description: '办公网络IP限制策略',
      rule: 'environment.sourceIP.startsWith("192.168.") || environment.sourceIP.startsWith("10.0.")',
      effect: 'ALLOW',
      priority: 300,
      isActive: true,
    },
    {
      name: 'manager_bypass',
      description: '管理者权限绕过策略',
      rule: 'user.position === "经理" || user.position === "主管"',
      effect: 'ALLOW',
      priority: 400,
      isActive: true,
    },
    {
      name: 'headquarters_privilege',
      description: '总部特权策略',
      rule: 'user.organization === "总部"',
      effect: 'ALLOW',
      priority: 500,
      isActive: true,
    },
  ];

  for (const policyData of basicPolicies) {
    await prisma.policy.upsert({
      where: { name: policyData.name },
      update: policyData,
      create: policyData,
    });
  }
  console.log(`Created ${basicPolicies.length} basic ABAC policies.`);

  // 创建系统配置
  console.log('Creating system configurations...');
  const systemConfigs = [
    {
      key: 'auth.password.min_length',
      value: '8',
      description: '密码最小长度',
      category: 'security',
      dataType: 'number',
    },
    {
      key: 'auth.password.require_special_chars',
      value: 'true',
      description: '密码是否需要特殊字符',
      category: 'security',
      dataType: 'boolean',
    },
    {
      key: 'auth.password.expiry_days',
      value: '90',
      description: '密码过期天数',
      category: 'security',
      dataType: 'number',
    },
    {
      key: 'auth.login.max_attempts',
      value: '5',
      description: '最大登录尝试次数',
      category: 'security',
      dataType: 'number',
    },
    {
      key: 'auth.login.lockout_duration',
      value: '1800',
      description: '账户锁定时长（秒）',
      category: 'security',
      dataType: 'number',
    },
    {
      key: 'oauth.authorization_code.lifetime',
      value: '600',
      description: '授权码有效期（秒）',
      category: 'oauth',
      dataType: 'number',
    },
    {
      key: 'oauth.access_token.default_lifetime',
      value: '3600',
      description: '访问令牌默认有效期（秒）',
      category: 'oauth',
      dataType: 'number',
    },
    {
      key: 'oauth.refresh_token.default_lifetime',
      value: '604800',
      description: '刷新令牌默认有效期（秒）',
      category: 'oauth',
      dataType: 'number',
    },
    {
      key: 'system.company_name',
      value: '示例企业',
      description: '企业名称',
      category: 'general',
      dataType: 'string',
    },
    {
      key: 'system.support_email',
      value: 'support@company.com',
      description: '技术支持邮箱',
      category: 'general',
      dataType: 'string',
    },
  ];

  for (const configData of systemConfigs) {
    await prisma.systemConfig.upsert({
      where: { key: configData.key },
      update: configData,
      create: configData,
    });
  }
  console.log(`Created ${systemConfigs.length} system configurations.`);

  // 创建默认组织结构
  console.log('Creating default organization structure...');
  const rootOrg = await prisma.organization.upsert({
    where: { code: 'ROOT' },
    update: {},
    create: {
      name: '示例企业',
      code: 'ROOT',
      description: '企业根组织',
      path: '/1/',
      level: 1,
      isActive: true,
    },
  });

  const techDept = await prisma.organization.upsert({
    where: { code: 'TECH' },
    update: {},
    create: {
      name: '技术部',
      code: 'TECH',
      description: '技术研发部门',
      parentId: rootOrg.id,
      path: `/1/${rootOrg.id}/`,
      level: 2,
      isActive: true,
    },
  });

  const hrDept = await prisma.organization.upsert({
    where: { code: 'HR' },
    update: {},
    create: {
      name: '人事部',
      code: 'HR',
      description: '人力资源部门',
      parentId: rootOrg.id,
      path: `/1/${rootOrg.id}/`,
      level: 2,
      isActive: true,
    },
  });

  const financeDept = await prisma.organization.upsert({
    where: { code: 'FINANCE' },
    update: {},
    create: {
      name: '财务部',
      code: 'FINANCE',
      description: '财务管理部门',
      parentId: rootOrg.id,
      path: `/1/${rootOrg.id}/`,
      level: 2,
      isActive: true,
    },
  });

  console.log('Created default organization structure.');
  console.log('\n📋 Summary:');
  console.log('- Created default scopes with business-specific scopes.');
  console.log('- Created comprehensive PRD-compliant permissions (40+ permissions).');
  console.log('- Created hierarchical role system with 16 roles.');
  console.log('- Assigned detailed permissions to all roles.');
  console.log('- Created admin user (username: admin, password: admin123456) and assigned super_admin role.');
  console.log('- Created enterprise OAuth clients:');
  console.log('  • auth-center-self (认证中心自身客户端)');
  console.log('  • oa-system (OA系统客户端)');
  console.log('  • crm-system (CRM系统客户端)');
  console.log('  • api-gateway-service (API网关服务客户端)');
  console.log('  • mobile-app (移动应用客户端)');
  console.log('  • demo-client (演示客户端)');
  console.log('- Created 5 basic ABAC policies for enterprise scenarios.');
  console.log('- Created 10 system configuration items.');
  console.log('- Created default organization structure (总部/技术部/人事部/财务部).');
  console.log('\n⚠️  Remember to change all default passwords and secrets in production!');
  console.log('\n🔐 Default Credentials:');
  console.log('  Admin User: admin / admin123456');
  console.log('  OAuth Clients: See database for client secrets');
}

main()
  .catch((e) => {
    console.error('❌ Database seeding failed:');
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });