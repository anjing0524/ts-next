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
    { identifier: 'system:user:create', name: 'Create System Users', description: 'Allows creating new system users.', category: 'system', resource: 'user', action: 'create' },
    { identifier: 'system:user:read', name: 'Read System Users', description: 'Allows reading system user information.', category: 'system', resource: 'user', action: 'read' },
    { identifier: 'system:user:update', name: 'Update System Users', description: 'Allows updating existing system users.', category: 'system', resource: 'user', action: 'update' },
    { identifier: 'system:user:delete', name: 'Delete System Users', description: 'Allows deleting system users.', category: 'system', resource: 'user', action: 'delete' },
    { identifier: 'system:role:manage', name: 'Manage Roles', description: 'Allows managing roles and their permissions.', category: 'system', resource: 'role', action: 'manage' },
    { identifier: 'system:client:manage', name: 'Manage OAuth Clients', description: 'Allows managing OAuth clients.', category: 'system', resource: 'client', action: 'manage' },
    { identifier: 'system:permission:manage', name: 'Manage Permissions', description: 'Allows managing permissions definitions.', category: 'system', resource: 'permission', action: 'manage' },
    { identifier: 'system:audit:read', name: 'Read Audit Logs', description: 'Allows reading audit logs.', category: 'system', resource: 'audit', action: 'read' },
    { identifier: 'app:dashboard:access', name: 'Access Admin Dashboard', description: 'Allows accessing the admin dashboard application.', category: 'app', resource: 'dashboard', action: 'access' },
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
    { name: 'super_admin', displayName: 'Super Administrator', description: 'Has all system permissions.', isSystem: true, parentName: null },
    { name: 'system_admin', displayName: 'System Administrator', description: 'Manages system configurations, users, and clients.', isSystem: false, parentName: 'super_admin' },
    { name: 'app_admin', displayName: 'Application Administrator', description: 'Manages application-specific settings.', isSystem: false, parentName: 'super_admin' },
    { name: 'employee', displayName: 'Employee', description: 'Standard employee role.', isSystem: false, parentName: null },
    { name: 'department_manager', displayName: 'Department Manager', description: 'Manages a department.', isSystem: false, parentName: 'employee' },
    { name: 'project_manager', displayName: 'Project Manager', description: 'Manages projects.', isSystem: false, parentName: 'employee' },
    { name: 'senior_employee', displayName: 'Senior Employee', description: 'Senior employee with additional responsibilities.', isSystem: false, parentName: 'employee' },
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
      'system:client:manage', 'system:audit:read', 'app:dashboard:access', 'system:role:manage', 'system:permission:manage' // Added role & perm manage
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

  // Employee basic access
   if (createdRoles['employee']) {
    try {
        const permId = getPermissionId('app:dashboard:access');
        await prisma.rolePermission.upsert({
            where: { roleId_permissionId: { roleId: createdRoles['employee'].id, permissionId: permId } },
            update: {},
            create: { roleId: createdRoles['employee'].id, permissionId: permId },
        });
        console.log('Assigned app:dashboard:access to employee.');
    } catch(e) { console.error(`Error assigning app:dashboard:access to employee: ${e}`); }
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
  await prisma.client.upsert({
    where: { clientId: 'auth-center-self' },
    update: {
      name: 'Authentication Center Self Client',
      clientSecret: 'auth-center-secret',
      redirectUris: JSON.stringify([
        'http://localhost:3000/auth/callback',
      ]),
      scope: 'profile:read users:manage clients:manage permissions:manage audit:read openid email',
      // Retain other existing values or update as per full requirements if they changed
    },
    create: {
      clientId: 'auth-center-self',
      clientSecret: 'auth-center-secret',
      name: 'Authentication Center Self Client',
      description: 'Internal OAuth 2.0 client for the admin management center',
      redirectUris: JSON.stringify([
        'http://localhost:3000/auth/callback',
      ]),
      postLogoutRedirectUris: JSON.stringify([
        'http://localhost:3000/datamgr_flow',
        'http://localhost:3001/datamgr_flow',
        'http://localhost:3002/datamgr_flow',
        'https://your-domain.com/datamgr_flow',
      ]),
      scope: 'profile:read users:manage clients:manage permissions:manage audit:read openid email',
      isPublic: false,
      requirePkce: true,
      requireConsent: false, // Skip consent for internal admin client
      tokenEndpointAuthMethod: 'client_secret_post',
      grantTypes: JSON.stringify(['authorization_code', 'refresh_token']),
      responseTypes: JSON.stringify(['code']),
    },
  });

  console.log('✅ Database seeding completed successfully!');
  console.log('\n📋 Summary:');
  console.log('- Created default scopes.');
  console.log('- Created PRD-compliant permissions.');
  console.log('- Created PRD-compliant roles.');
  console.log('- Assigned permissions to roles.');
  console.log('- Created admin user (username: admin, password: admin123456) and assigned super_admin role.');
  console.log('- Created test OAuth clients:');
  console.log('  • test-client (confidential client)');
  console.log('  • spa-client (public client for SPAs)');
  console.log('  • auth-center-self (internal admin client)');
  console.log('\n⚠️  Remember to change the admin password in production!');
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