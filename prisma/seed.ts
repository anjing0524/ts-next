import { PrismaClient, Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const SALT_ROUNDS = 10;

// Define permissions based on scopes that imply API access
// Format: { name: "resource:action", displayName: "Can do X to Y", resource: "ResourceName", action: "ActionName" }
const adminPermissionsData = [
  // User Management
  { name: 'users:list', displayName: 'List Users', resource: 'users', action: 'list', type: 'API' },
  {
    name: 'users:read',
    displayName: 'Read User Details',
    resource: 'users',
    action: 'read',
    type: 'API',
  },
  {
    name: 'users:create',
    displayName: 'Create Users',
    resource: 'users',
    action: 'create',
    type: 'API',
  },
  {
    name: 'users:update',
    displayName: 'Update Users',
    resource: 'users',
    action: 'update',
    type: 'API',
  },
  {
    name: 'users:delete',
    displayName: 'Delete Users',
    resource: 'users',
    action: 'delete',
    type: 'API',
  },
  {
    name: 'user_profile:read_any',
    displayName: 'Read Any User Profile',
    resource: 'user_profile',
    action: 'read_any',
    type: 'API',
  },
  {
    name: 'user_profile:write_any',
    displayName: 'Write Any User Profile',
    resource: 'user_profile',
    action: 'write_any',
    type: 'API',
  },
  {
    name: 'user_profile:manage_status_any',
    displayName: 'Manage Any User Status',
    resource: 'user_profile',
    action: 'manage_status_any',
    type: 'API',
  },

  // Client Management
  {
    name: 'clients:list',
    displayName: 'List OAuth Clients',
    resource: 'clients',
    action: 'list',
    type: 'API',
  },
  {
    name: 'clients:read',
    displayName: 'Read OAuth Client Details',
    resource: 'clients',
    action: 'read',
    type: 'API',
  },
  {
    name: 'clients:create',
    displayName: 'Create OAuth Clients',
    resource: 'clients',
    action: 'create',
    type: 'API',
  },
  {
    name: 'clients:update',
    displayName: 'Update OAuth Clients',
    resource: 'clients',
    action: 'update',
    type: 'API',
  },
  {
    name: 'clients:delete',
    displayName: 'Delete OAuth Clients',
    resource: 'clients',
    action: 'delete',
    type: 'API',
  },

  // Role & Permission Management
  { name: 'roles:list', displayName: 'List Roles', resource: 'roles', action: 'list', type: 'API' },
  {
    name: 'roles:read',
    displayName: 'Read Role Details',
    resource: 'roles',
    action: 'read',
    type: 'API',
  },
  {
    name: 'roles:create',
    displayName: 'Create Roles',
    resource: 'roles',
    action: 'create',
    type: 'API',
  },
  {
    name: 'roles:update',
    displayName: 'Update Roles',
    resource: 'roles',
    action: 'update',
    type: 'API',
  },
  {
    name: 'roles:delete',
    displayName: 'Delete Roles',
    resource: 'roles',
    action: 'delete',
    type: 'API',
  },
  {
    name: 'permissions:list',
    displayName: 'List Permissions',
    resource: 'permissions',
    action: 'list',
    type: 'API',
  },
  // General Admin
  {
    name: 'admin:access',
    displayName: 'Access Admin Area',
    resource: 'admin',
    action: 'access',
    type: 'API',
  },
  // Legacy "system:role:manage" - map to granular if possible, or keep if used by old middleware
  {
    name: 'system:role:manage',
    displayName: 'Manage System Roles (Legacy)',
    resource: 'system_roles',
    action: 'manage',
    type: 'API',
  },
];

async function main() {
  console.log('Start seeding...');

  // 1. Seed Scopes (keeping existing logic, ensuring admin scopes are present)
  console.log('Seeding scopes...');
  const scopesToSeed = [
    {
      name: 'openid',
      description: 'Required OIDC scope for authentication.',
      isPublic: true,
      isActive: true,
    },
    {
      name: 'profile',
      description: "Access to user's basic profile information.",
      isPublic: true,
      isActive: true,
    },
    {
      name: 'email',
      description: "Access to user's email address.",
      isPublic: true,
      isActive: true,
    },
    {
      name: 'offline_access',
      description: 'Enable issuance of refresh tokens for long-lived access.',
      isPublic: true,
      isActive: true,
    },
    {
      name: 'order:read',
      description: 'Allows reading order information.',
      isPublic: false,
      isActive: true,
    },
    {
      name: 'order:create',
      description: 'Allows creating new orders.',
      isPublic: false,
      isActive: true,
    },
    {
      name: 'product:read',
      description: 'Allows reading product information.',
      isPublic: false,
      isActive: true,
    },
    // Admin-related scopes that correspond to permissions
    {
      name: 'users:read',
      description: 'Allows reading user information (admin).',
      isPublic: false,
      isActive: true,
    },
    {
      name: 'users:write',
      description: 'Allows creating/updating user information (admin).',
      isPublic: false,
      isActive: true,
    },
    {
      name: 'clients:read',
      description: 'Allows reading OAuth client information (admin).',
      isPublic: false,
      isActive: true,
    },
    {
      name: 'clients:write',
      description: 'Allows creating/updating OAuth client information (admin).',
      isPublic: false,
      isActive: true,
    },
    {
      name: 'admin',
      description: 'General administrative privileges.',
      isPublic: false,
      isActive: true,
    }, // Broad admin scope
  ];
  for (const scopeData of scopesToSeed) {
    await prisma.scope.upsert({
      where: { name: scopeData.name },
      update: {
        description: scopeData.description,
        isPublic: scopeData.isPublic,
        isActive: scopeData.isActive,
      },
      create: scopeData,
    });
  }
  console.log('Scopes seeded.');

  // 2. Seed Permissions
  console.log('Seeding permissions...');
  const seededPermissions = [];
  for (const permData of adminPermissionsData) {
    const permission = await prisma.permission.upsert({
      where: { name: permData.name },
      update: {
        displayName: permData.displayName,
        resource: permData.resource,
        action: permData.action,
        type: permData.type as any, // Cast because Prisma enum type might not be auto-inferred
      },
      create: {
        name: permData.name,
        displayName: permData.displayName,
        resource: permData.resource,
        action: permData.action,
        type: permData.type as any,
      },
    });
    seededPermissions.push(permission);
    console.log(`Upserted permission: ${permission.name}`);
  }
  console.log('Permissions seeded.');

  // 3. Seed Roles
  console.log('Seeding roles...');
  const adminRole = await prisma.role.upsert({
    where: { name: 'admin' },
    update: { displayName: 'Administrator', isActive: true },
    create: { name: 'admin', displayName: 'Administrator', isActive: true },
  });
  console.log(`Upserted role: ${adminRole.name}`);
  console.log('Roles seeded.');

  // 4. Assign Permissions to Admin Role
  console.log('Assigning permissions to admin role...');
  if (adminRole && seededPermissions.length > 0) {
    for (const permission of seededPermissions) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: adminRole.id, permissionId: permission.id } },
        update: {},
        create: { roleId: adminRole.id, permissionId: permission.id },
      });
      console.log(`Assigned permission ${permission.name} to role ${adminRole.name}`);
    }
  }
  console.log('Permissions assigned to admin role.');

  // 5. Seed Admin User
  console.log('Seeding admin user...');
  const adminPassword = 'adminpassword'; // For seeding, should be changed immediately
  const hashedAdminPassword = await bcrypt.hash(adminPassword, SALT_ROUNDS);
  const adminUser = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {
      email: 'admin@example.com',
      passwordHash: hashedAdminPassword,
      isActive: true,
      mustChangePassword: false,
    },
    create: {
      username: 'admin',
      email: 'admin@example.com',
      passwordHash: hashedAdminPassword,
      firstName: 'Admin',
      lastName: 'User',
      isActive: true,
      emailVerified: true, // Assuming admin's email is verified for seeding
      mustChangePassword: false, // For ease of first login
    },
  });
  console.log(`Upserted admin user: ${adminUser.username}`);

  // Add admin password to history (optional, but good practice)
  await prisma.passwordHistory
    .create({
      data: {
        userId: adminUser.id,
        passwordHash: hashedAdminPassword,
      },
    })
    .catch((e) =>
      console.warn(
        'Could not add admin password to history, possibly already exists for this user/hash combo:',
        e.message
      )
    );

  // 6. Assign Admin Role to Admin User
  console.log('Assigning admin role to admin user...');
  if (adminUser && adminRole) {
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: adminUser.id, roleId: adminRole.id } },
      update: {},
      create: { userId: adminUser.id, roleId: adminRole.id },
    });
    console.log(`Assigned role ${adminRole.name} to user ${adminUser.username}`);
  }
  console.log('Admin role assigned.');

  // 7. Seed OAuth Client for Auth Service (e.g., for backend services or admin UI)
  console.log('Seeding OAuth client for auth service...');
  const clientSecret = 'adminclientsecret'; // For seeding, should be changed
  const hashedClientSecret = await bcrypt.hash(clientSecret, SALT_ROUNDS);

  // Collect all permission names to grant to the admin client
  const allAdminPermissionNames = seededPermissions.map((p) => p.name);
  // Also include OIDC scopes and any other relevant general scopes
  const adminClientScopes = [
    'openid',
    'profile',
    'email',
    'offline_access',
    ...allAdminPermissionNames,
  ].join(' ');

  const adminClient = await prisma.oAuthClient.upsert({
    where: { clientId: 'auth-center-admin-client' },
    update: {
      clientSecret: hashedClientSecret, // Update secret if changed
      clientName: 'Auth Center Admin Client',
      redirectUris: JSON.stringify([
        'http://localhost/callback',
        'http://localhost:3000/callback',
        'http://localhost:8000/callback',
      ]),
      grantTypes: JSON.stringify(['authorization_code', 'client_credentials', 'refresh_token']),
      responseTypes: JSON.stringify(['code', 'token']),
      allowedScopes: adminClientScopes,
      isPublic: false,
      requirePkce: true,
      requireConsent: false, // Admin client might not need user consent for its own operations
      tokenEndpointAuthMethod: 'client_secret_basic',
    },
    create: {
      clientId: 'auth-center-admin-client',
      clientSecret: hashedClientSecret,
      clientName: 'Auth Center Admin Client',
      clientDescription: 'OAuth client for internal admin tasks and services.',
      redirectUris: JSON.stringify([
        'http://localhost/callback',
        'http://localhost:3000/callback',
        'http://localhost:8000/callback',
      ]),
      grantTypes: JSON.stringify(['authorization_code', 'client_credentials', 'refresh_token']),
      responseTypes: JSON.stringify(['code', 'token']),
      allowedScopes: adminClientScopes,
      isPublic: false,
      isActive: true,
      requirePkce: true,
      requireConsent: false,
      tokenEndpointAuthMethod: 'client_secret_basic',
    },
  });
  console.log(
    `Upserted OAuth client: ${adminClient.clientId}. IMPORTANT: Raw secret for seeding is '${clientSecret}'`
  );
  console.log('OAuth client seeded.');

  console.log('Seeding finished successfully.');
}

main()
  .catch((e) => {
    console.error('Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
