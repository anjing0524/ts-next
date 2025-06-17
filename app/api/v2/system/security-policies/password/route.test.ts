// app/api/v2/system/security-policies/password/route.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createOAuth2TestSetup, TestDataManager, TEST_USERS, TestUser, TestClient } from '@/../__tests__/utils/test-helpers';
import { prisma } from '@/lib/prisma';
import { ClientType, PolicyType, SecurityPolicy } from '@prisma/client';

const { httpClient, dataManager, setup, cleanup } = createOAuth2TestSetup('system-password-policy-api');

describe('GET and PUT /api/v2/system/security-policies/password', () => {
  let adminReadToken: string;
  let adminUpdateToken: string;
  let adminNoPermToken: string;

  const initialPolicies = {
    passwordStrength: { minLength: 8, requireUppercase: true, requireLowercase: true, requireNumber: true, requireSpecialChar: false },
    passwordHistory: { historyCount: 3 },
    passwordExpiration: { maxAgeDays: 90, notifyDaysBeforeExpiration: 7 },
  };

  beforeAll(async () => {
    await setup();
    const adminUserRead = await dataManager.createUser({ ...TEST_USERS.ADMIN, username: 'pwpolicyreadadmin', email: 'pwpolicyread@example.com' });
    const adminUserUpdate = await dataManager.createUser({ ...TEST_USERS.ADMIN, username: 'pwpolicyupdateadmin', email: 'pwpolicyupdate@example.com' });
    const adminUserNoPerm = await dataManager.createUser({ ...TEST_USERS.ADMIN, username: 'pwpolicynopermadmin', email: 'pwpolicynoperm@example.com' });

    const readPerm = await dataManager.findOrCreatePermission({ name: 'system:securitypolicies:read', displayName: 'Read System Security Policies', resource: 'system:securitypolicies', action: 'read' });
    const updatePerm = await dataManager.findOrCreatePermission({ name: 'system:passwordpolicy:update', displayName: 'Update Password Policy', resource: 'system:passwordpolicy', action: 'update' });

    const adminRoleRead = await dataManager.createRole({ name: 'pw_policy_reader_role', permissions: [readPerm.name] });
    const adminRoleUpdate = await dataManager.createRole({ name: 'pw_policy_updater_role', permissions: [updatePerm.name] });
    const adminRoleNoPerm = await dataManager.createRole({ name: 'pw_policy_no_perm_role', permissions: []});

    await dataManager.assignRoleToUser(adminUserRead.id!, adminRoleRead.id);
    await dataManager.assignRoleToUser(adminUserUpdate.id!, adminRoleUpdate.id);
    await dataManager.assignRoleToUser(adminUserNoPerm.id!, adminRoleNoPerm.id);

    const tokenClient = await dataManager.createClient({ clientId: 'token-client-for-pw-policy', name: 'Token Client PW Policy', clientType: 'CONFIDENTIAL', clientSecret: 'supersecret', redirectUris: ['http://localhost/cb'], grantTypes: ['client_credentials'], allowedScopes:['openid'] });

    adminReadToken = await dataManager.createAccessToken(adminUserRead.id!, tokenClient.clientId, 'openid system:securitypolicies:read', [readPerm.name]);
    adminUpdateToken = await dataManager.createAccessToken(adminUserUpdate.id!, tokenClient.clientId, 'openid system:passwordpolicy:update', [updatePerm.name]);
    adminNoPermToken = await dataManager.createAccessToken(adminUserNoPerm.id!, tokenClient.clientId, 'openid', []);

    // Seed initial password policies
    await prisma.securityPolicy.deleteMany({where: {type: {in: [PolicyType.PASSWORD_STRENGTH, PolicyType.PASSWORD_HISTORY, PolicyType.PASSWORD_EXPIRATION]}}});
    await prisma.securityPolicy.createMany({
      data: [
        { name: 'Password Strength Policy', type: PolicyType.PASSWORD_STRENGTH, policy: initialPolicies.passwordStrength, isActive: true, description: "Defines requirements for user passwords." },
        { name: 'Password History Policy', type: PolicyType.PASSWORD_HISTORY, policy: initialPolicies.passwordHistory, isActive: true, description: "Defines password reuse restrictions." },
        { name: 'Password Expiration Policy', type: PolicyType.PASSWORD_EXPIRATION, policy: initialPolicies.passwordExpiration, isActive: true, description: "Defines password validity duration." },
      ],
    });
  });

  afterAll(async () => {
    await prisma.securityPolicy.deleteMany({where: {type: {in: [PolicyType.PASSWORD_STRENGTH, PolicyType.PASSWORD_HISTORY, PolicyType.PASSWORD_EXPIRATION]}}});
    await cleanup();
  });

  describe('GET /api/v2/system/security-policies/password', () => {
    it('should retrieve all password-related policies successfully (200)', async () => {
      const response = await httpClient.authenticatedRequest('/api/v2/system/security-policies/password', adminReadToken);
      expect(response.status).toBe(200);
      const policies = await response.json();

      expect(policies.passwordStrength).toEqual(initialPolicies.passwordStrength);
      expect(policies.passwordHistory).toEqual(initialPolicies.passwordHistory);
      expect(policies.passwordExpiration).toEqual(initialPolicies.passwordExpiration);
    });

    it('should return 403 for user without system:securitypolicies:read permission', async () => {
       const response = await httpClient.authenticatedRequest('/api/v2/system/security-policies/password', adminNoPermToken);
       expect(response.status).toBe(403);
    });
  });

  describe('PUT /api/v2/system/security-policies/password', () => {
    it('should update password strength policy successfully (200)', async () => {
      const newStrengthPolicy = { minLength: 12, requireUppercase: true, requireLowercase: true, requireNumber: true, requireSpecialChar: true };
      const updatePayload = { passwordStrength: newStrengthPolicy };

      const response = await httpClient.authenticatedRequest('/api/v2/system/security-policies/password', adminUpdateToken, {
        method: 'PUT',
        body: JSON.stringify(updatePayload),
      });
      expect(response.status).toBe(200);
      const updatedPolicies = await response.json();
      expect(updatedPolicies.passwordStrength).toEqual(newStrengthPolicy);
      // Other policies should remain unchanged from initial
      expect(updatedPolicies.passwordHistory).toEqual(initialPolicies.passwordHistory);

      const dbPolicy = await prisma.securityPolicy.findFirst({ where: { type: PolicyType.PASSWORD_STRENGTH }});
      expect(dbPolicy?.policy).toEqual(newStrengthPolicy);
    });

    it('should update password history and expiration policies successfully (200)', async () => {
      const newHistoryPolicy = { historyCount: 10 };
      const newExpirationPolicy = { maxAgeDays: 60, notifyDaysBeforeExpiration: 5 };
      const updatePayload = {
        passwordHistory: newHistoryPolicy,
        passwordExpiration: newExpirationPolicy,
      };

      const response = await httpClient.authenticatedRequest('/api/v2/system/security-policies/password', adminUpdateToken, {
        method: 'PUT',
        body: JSON.stringify(updatePayload),
      });
      expect(response.status).toBe(200);
      const updatedPolicies = await response.json();
      expect(updatedPolicies.passwordHistory).toEqual(newHistoryPolicy);
      expect(updatedPolicies.passwordExpiration).toEqual(newExpirationPolicy);
    });

    it('should return 400 for invalid policy structure (e.g., wrong data type for minLength)', async () => {
      const updatePayload = { passwordStrength: { minLength: "not-a-number" } };
      const response = await httpClient.authenticatedRequest('/api/v2/system/security-policies/password', adminUpdateToken, {
        method: 'PUT',
        body: JSON.stringify(updatePayload),
      });
      expect(response.status).toBe(400);
      const error = await response.json();
      expect(error.issues).toBeDefined();
      expect(error.issues[0].path).toEqual(['passwordStrength', 'minLength']);
    });

    it('should return 400 if no policies are provided in payload', async () => {
      const response = await httpClient.authenticatedRequest('/api/v2/system/security-policies/password', adminUpdateToken, {
        method: 'PUT',
        body: JSON.stringify({}), // Empty payload
      });
      expect(response.status).toBe(400);
       const error = await response.json();
      expect(error.message).toContain("No password policies provided for update");
    });

    it('should return 403 for user without system:passwordpolicy:update permission', async () => {
      const updatePayload = { passwordStrength: { minLength: 10 } };
      const response = await httpClient.authenticatedRequest('/api/v2/system/security-policies/password', adminNoPermToken, {
        method: 'PUT',
        body: JSON.stringify(updatePayload),
      });
      expect(response.status).toBe(403);
    });
  });
});
