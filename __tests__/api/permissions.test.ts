import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
    createOAuth2TestSetup,
    TestUser,
    TestClient,
    // TestDataManager, // Included in createOAuth2TestSetup
    // TestHttpClient, // Included in createOAuth2TestSetup
    TEST_CONFIG
} from '../utils/test-helpers'; // Adjust path as necessary
// Import Prisma types if needed for direct DB assertions, though mostly we'll use TestDataManager
// import { Role, Scope, Permission as PrismaPermission } from '@prisma/client';

describe('API V1 Compatibility - /api/permissions/check', () => {
    const { dataManager, httpClient, setup, cleanup } = createOAuth2TestSetup('api_v1_permissions_check');

    let client: TestClient; // Client for whom the tokens are generated

    let callerUserWithExecPerm: TestUser;
    let callerUserWithoutExecPerm: TestUser;
    let targetUserWithDocReadPerm: TestUser;
    let targetUserWithoutDocReadPerm: TestUser;

    let tokenForCallerWithExecPerm: string;
    let tokenForCallerWithoutExecPerm: string;

    const permCheckExecuteName = 'permissions:check:execute';
    const docReadPermName = 'document:123:read';
    const profileViewPermName = 'profile:view'; // Another permission for a basic role

    beforeAll(async () => {
        await setup(); // Init TestDataManager, basic scopes like openid, profile

        // 0. Create a client for issuing tokens
        client = await dataManager.createTestClient('CLIENT_FOR_PERM_CHECK_TESTS');

        // 1. Create necessary Permissions/Scopes
        // Note: dataManager.createScope can be used if "Permissions" are treated as "Scopes"
        // If PermissionService relies on actual "Permission" table records, ensure TDM handles that.
        // For now, assuming PermissionService uses string names which can be sourced from Scope table.
        await dataManager.createScope({ name: permCheckExecuteName, description: 'Allows checking permissions for other users' });
        await dataManager.createScope({ name: docReadPermName, description: 'Allows reading document 123' });
        await dataManager.createScope({ name: profileViewPermName, description: 'Allows viewing profiles' });

        // 2. Create Roles
        const permCheckRole = await dataManager.createRole({
            name: 'perm_checker_v1_role',
            permissions: [permCheckExecuteName]
        });

        const docReaderRole = await dataManager.createRole({
            name: 'doc_reader_v1_role',
            permissions: [docReadPermName]
        });

        const basicRole = await dataManager.createRole({
            name: 'basic_user_v1_role',
            permissions: [profileViewPermName]
        });

        // 3. Create Users and assign roles
        callerUserWithExecPerm = await dataManager.createUser({
            username: 'callerWithExecPerm',
            email: 'caller_exec@example.com',
            password: 'Password123!',
            roles: [permCheckRole.id!]
        });

        callerUserWithoutExecPerm = await dataManager.createUser({
            username: 'callerWithoutExecPerm',
            email: 'caller_noexec@example.com',
            password: 'Password123!',
            roles: [basicRole.id!] // Basic role without permCheckExecuteName
        });

        targetUserWithDocReadPerm = await dataManager.createUser({
            username: 'targetWithDocRead',
            email: 'target_docread@example.com',
            password: 'Password123!',
            roles: [docReaderRole.id!]
        });

        targetUserWithoutDocReadPerm = await dataManager.createUser({
            username: 'targetWithoutDocRead',
            email: 'target_nodocread@example.com',
            password: 'Password123!',
            roles: [basicRole.id!] // Basic role, doesn't have docReadPermName
        });

        // 4. Generate JWTs for callers
        // The scope parameter for createAccessToken will grant those scopes in the token.
        // The actual permissions for the HOF will come from the user's roles via PermissionService.
        tokenForCallerWithExecPerm = await dataManager.createAccessToken(
            callerUserWithExecPerm.id!,
            client.clientId,
            permCheckExecuteName // Requesting the relevant scope for the token itself
        );

        tokenForCallerWithoutExecPerm = await dataManager.createAccessToken(
            callerUserWithoutExecPerm.id!,
            client.clientId,
            profileViewPermName // Some other scope
        );

    }, 70000); // Increased timeout for beforeAll due to multiple DB operations

    afterAll(async () => {
        await cleanup();
    });

    beforeEach(async () => {
        // If any per-test setup is needed, add here.
        // For now, global setup in beforeAll should suffice.
    });

    // Test Scenarios will go here

    // Scenario 1: Caller Authorized, Target User Has Permission
    it('TC_PERMCHK_001: should return allowed:true when caller is authorized and target user has permission', async () => {
        const requestBody = {
            userId: targetUserWithDocReadPerm.id,
            resourceAttributes: { resourceId: 'document:123' }, // resourceId part of permission name
            action: { type: 'read' }, // action part of permission name
            requestId: 'test001'
        };

        const response = await httpClient.makeRequest('/api/permissions/check', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${tokenForCallerWithExecPerm}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
        });
        const responseBody = await response.json();

        expect(response.status).toBe(200);
        expect(responseBody.allowed).toBe(true);
        expect(responseBody.reasonCode).toBe('V1_PERMISSION_GRANTED');
        expect(responseBody.requestId).toBe('test001');
    });

    // Scenario 2: Caller Authorized, Target User Lacks Permission
    it('TC_PERMCHK_002: should return allowed:false when caller is authorized but target user lacks permission', async () => {
        const requestBody = {
            userId: targetUserWithoutDocReadPerm.id,
            resourceAttributes: { resourceId: 'document:123' },
            action: { type: 'read' },
            requestId: 'test002'
        };

        const response = await httpClient.makeRequest('/api/permissions/check', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${tokenForCallerWithExecPerm}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
        });
        const responseBody = await response.json();

        expect(response.status).toBe(200);
        expect(responseBody.allowed).toBe(false);
        expect(responseBody.reasonCode).toBe('V1_PERMISSION_DENIED');
        expect(responseBody.requestId).toBe('test002');
    });

    // Scenario 3: Caller Unauthorized (Lacks permissions:check:execute)
    it('TC_PERMCHK_003: should return 403 Forbidden when caller lacks permissions:check:execute', async () => {
        const requestBody = {
            userId: targetUserWithDocReadPerm.id,
            resourceAttributes: { resourceId: 'document:123' },
            action: { type: 'read' },
        };

        const response = await httpClient.makeRequest('/api/permissions/check', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${tokenForCallerWithoutExecPerm}`, // Token without permissions:check:execute
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
        });
        const responseBody = await response.json();

        // This endpoint uses `withAuth` which internally calls `authenticateBearer`
        // `authenticateBearer` checks required permissions. If not met, it returns 403 with "insufficient_permissions"
        // or a similar error, not necessarily related to the V1 compatibility layer's specific error messages.
        // The old `requirePermission` HOF returned "Forbidden: You do not have permission..."
        // The new `authenticateBearer` returns "Insufficient permissions for this resource"
        expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.FORBIDDEN);
        expect(responseBody.error).toBe('forbidden'); // Or 'insufficient_permissions' depending on middleware error structure
        expect(responseBody.error_description).toContain('Insufficient permissions'); // Message from withAuth
    });

    // Scenario 4: Invalid Request Body
    it('TC_PERMCHK_004: should return 400 Bad Request for malformed request body (e.g., missing userId)', async () => {
        const requestBody = {
            // userId is missing
            resourceAttributes: { resourceId: 'document:123' },
            action: { type: 'read' },
        };

        const response = await httpClient.makeRequest('/api/permissions/check', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${tokenForCallerWithExecPerm}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
        });
        const responseBody = await response.json();

        expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.BAD_REQUEST);
        expect(responseBody.error).toBe('VALIDATION_ERROR'); // As per the route's error handling
        expect(responseBody.message).toContain('userId'); // Zod error message should mention userId
    });

    it('TC_PERMCHK_004b: should return 400 Bad Request for malformed request body (e.g., missing resourceAttributes)', async () => {
        const requestBody = {
            userId: targetUserWithDocReadPerm.id,
            // resourceAttributes is missing
            action: { type: 'read' },
        };

        const response = await httpClient.makeRequest('/api/permissions/check', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${tokenForCallerWithExecPerm}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
        });
        const responseBody = await response.json();

        expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.BAD_REQUEST);
        expect(responseBody.error).toBe('VALIDATION_ERROR');
        expect(responseBody.message).toContain('resourceAttributes');
    });


    // Scenario 5: Target User Not Found
    it('TC_PERMCHK_005: should return allowed:false when target user does not exist', async () => {
        const requestBody = {
            userId: 'nonexistent-user-id-12345',
            resourceAttributes: { resourceId: 'document:123' },
            action: { type: 'read' },
        };

        const response = await httpClient.makeRequest('/api/permissions/check', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${tokenForCallerWithExecPerm}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
        });
        const responseBody = await response.json();

        expect(response.status).toBe(200);
        expect(responseBody.allowed).toBe(false);
        expect(responseBody.reasonCode).toBe('V1_PERMISSION_DENIED');
        // This is because PermissionService.checkPermission for a non-existent user will return false.
    });
});
