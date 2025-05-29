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

  // Create default resources
  console.log('Creating default resources...');
  const resources = [
    {
      name: 'user_profile',
      description: 'User profile and personal information',
      apiPath: '/api/users/*',
    },
    {
      name: 'permissions',
      description: 'User permissions and authorization management',
      apiPath: '/api/permissions/*',
    },
    {
      name: 'scopes',
      description: 'OAuth 2.0 scope management',
      apiPath: '/api/scopes/*',
    },
    {
      name: 'clients',
      description: 'OAuth 2.0 client management',
      apiPath: '/api/clients/*',
    },
    {
      name: 'audit_logs',
      description: 'System audit logs and security monitoring',
      apiPath: '/api/audit/*',
    },
  ];

  for (const resource of resources) {
    await prisma.resource.upsert({
      where: { name: resource.name },
      update: resource,
      create: resource,
    });
  }

  // Create default permissions
  console.log('Creating default permissions...');
  const permissions = [
    { name: 'read', description: 'Read access to resource' },
    { name: 'write', description: 'Write/modify access to resource' },
    { name: 'delete', description: 'Delete access to resource' },
    { name: 'read_any', description: 'Read access to any instance of resource' },
    { name: 'write_any', description: 'Write access to any instance of resource' },
    { name: 'delete_any', description: 'Delete access to any instance of resource' },
    { name: 'admin', description: 'Full administrative access to resource' },
  ];

  for (const permission of permissions) {
    await prisma.permission.upsert({
      where: { name: permission.name },
      update: permission,
      create: permission,
    });
  }

  // Create admin user
  console.log('Creating admin user...');
  const hashedPassword = await bcrypt.hash('admin123456', 12);
  
  const adminUser = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
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

  // Grant admin permissions to admin user
  console.log('Granting admin permissions...');
  const allResources = await prisma.resource.findMany();
  const adminPermission = await prisma.permission.findUnique({
    where: { name: 'admin' },
  });

  if (adminPermission) {
    for (const resource of allResources) {
      await prisma.userResourcePermission.upsert({
        where: {
          userId_resourceId_permissionId: {
            userId: adminUser.id,
            resourceId: resource.id,
            permissionId: adminPermission.id,
          },
        },
        update: {},
        create: {
          userId: adminUser.id,
          resourceId: resource.id,
          permissionId: adminPermission.id,
          grantedBy: adminUser.id,
        },
      });
    }
  }

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
  console.log('Creating admin management center client...');
  await prisma.client.upsert({
    where: { clientId: 'admin-center' },
    update: {},
    create: {
      clientId: 'admin-center',
      clientSecret: 'admin-center-secret',
      name: 'OAuth 2.0 Admin Center',
      description: 'Internal OAuth 2.0 client for the admin management center',
      redirectUris: JSON.stringify([
        'http://localhost:3000/datamgr_flow/auth/callback',
        'http://localhost:3001/datamgr_flow/auth/callback',
        'http://localhost:3002/datamgr_flow/auth/callback',
        'https://your-domain.com/datamgr_flow/auth/callback',
      ]),
      postLogoutRedirectUris: JSON.stringify([
        'http://localhost:3000/datamgr_flow',
        'http://localhost:3001/datamgr_flow',
        'http://localhost:3002/datamgr_flow',
        'https://your-domain.com/datamgr_flow',
      ]),
      scope: 'openid profile email admin',
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
  console.log('- Created default scopes, resources, and permissions');
  console.log('- Created admin user (username: admin, password: admin123456)');
  console.log('- Created test OAuth clients:');
  console.log('  • test-client (confidential client)');
  console.log('  • spa-client (public client for SPAs)');
  console.log('  • admin-center (internal admin client)');
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