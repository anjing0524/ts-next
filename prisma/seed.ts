import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Start seeding scopes...');

  // OIDC Standard Scopes
  await prisma.scope.upsert({
    where: { name: 'openid' },
    update: { description: "Required OIDC scope for authentication.", isPublic: true, isActive: true },
    create: { name: 'openid', description: "Required OIDC scope for authentication.", isPublic: true, isActive: true },
  });

  await prisma.scope.upsert({
    where: { name: 'profile' },
    update: { description: "Access to user's basic profile information.", isPublic: true, isActive: true },
    create: { name: 'profile', description: "Access to user's basic profile information.", isPublic: true, isActive: true },
  });

  await prisma.scope.upsert({
    where: { name: 'email' },
    update: { description: "Access to user's email address.", isPublic: true, isActive: true },
    create: { name: 'email', description: "Access to user's email address.", isPublic: true, isActive: true },
  });

  await prisma.scope.upsert({
    where: { name: 'offline_access' },
    update: { description: "Enable issuance of refresh tokens for long-lived access.", isPublic: true, isActive: true },
    create: { name: 'offline_access', description: "Enable issuance of refresh tokens for long-lived access.", isPublic: true, isActive: true },
  });

  // Example Application Scopes
  await prisma.scope.upsert({
    where: { name: 'order:read' },
    update: { description: "Allows reading order information.", isPublic: false, isActive: true },
    create: { name: 'order:read', description: "Allows reading order information.", isPublic: false, isActive: true },
  });

  await prisma.scope.upsert({
    where: { name: 'order:create' },
    update: { description: "Allows creating new orders.", isPublic: false, isActive: true },
    create: { name: 'order:create', description: "Allows creating new orders.", isPublic: false, isActive: true },
  });

  await prisma.scope.upsert({
    where: { name: 'product:read' },
    update: { description: "Allows reading product information.", isPublic: false, isActive: true },
    create: { name: 'product:read', description: "Allows reading product information.", isPublic: false, isActive: true },
  });
  
  // Admin Scopes
  await prisma.scope.upsert({
    where: { name: 'users:read' },
    update: { description: "Allows reading user information (admin).", isPublic: false, isActive: true },
    create: { name: 'users:read', description: "Allows reading user information (admin).", isPublic: false, isActive: true },
  });

  await prisma.scope.upsert({
    where: { name: 'users:write' },
    update: { description: "Allows creating/updating user information (admin).", isPublic: false, isActive: true },
    create: { name: 'users:write', description: "Allows creating/updating user information (admin).", isPublic: false, isActive: true },
  });

  await prisma.scope.upsert({
    where: { name: 'clients:read' },
    update: { description: "Allows reading OAuth client information (admin).", isPublic: false, isActive: true },
    create: { name: 'clients:read', description: "Allows reading OAuth client information (admin).", isPublic: false, isActive: true },
  });

  await prisma.scope.upsert({
    where: { name: 'clients:write' },
    update: { description: "Allows creating/updating OAuth client information (admin).", isPublic: false, isActive: true },
    create: { name: 'clients:write', description: "Allows creating/updating OAuth client information (admin).", isPublic: false, isActive: true },
  });

  await prisma.scope.upsert({
    where: { name: 'admin' },
    update: { description: "General administrative privileges.", isPublic: false, isActive: true },
    create: { name: 'admin', description: "General administrative privileges.", isPublic: false, isActive: true },
  });

  console.log('Seeding scopes finished.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });