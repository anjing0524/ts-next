import { NextRequest, NextResponse } from 'next/server';
import { POST } from '@/app/api/v2/oauth/revoke_token_by_jti/route';
import { prisma } from '@/lib/prisma';
import { OAuth2ErrorTypes } from '@/lib/auth/oauth2';

// Mock dependencies
vi.mock('@/lib/prisma', () => ({
  prisma: {
    tokenBlacklist: {
      create: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

// Mock NextResponse methods (though POST handler uses them directly)
// No, the POST handler directly returns NextResponse.json, so we assert its mock calls.
// We need to mock NextResponse.json itself.
vi.mock('next/server', async (importOriginal) => {
    const actualServer = await importOriginal();
    return {
        ...actualServer,
        NextResponse: {
            ...actualServer.NextResponse,
            json: vi.fn((body, init) => {
                 // Simplified mock: just return an object that might resemble a Response
                 return { status: init?.status || 200, jsonBody: body, headers: new Headers(init?.headers) };
            }),
        },
    };
});


// Helper to create a mock NextRequest for this endpoint
const createMockRevokeRequest = (body: any, headers?: Record<string, string>): NextRequest => {
  return {
    headers: new Headers(headers),
    json: async () => body, // Mock the json() method
    url: 'http://localhost/api/v2/oauth/revoke_token_by_jti',
    method: 'POST',
    // ... other properties if needed
  } as NextRequest;
};

const MOCK_ADMIN_KEY = 'test-admin-secret-key';

describe('Token Revocation Endpoint - /api/v2/oauth/revoke_token_by_jti', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TOKEN_REVOCATION_ADMIN_KEY = MOCK_ADMIN_KEY; // Set the admin key for tests
  });

  afterEach(() => {
    delete process.env.TOKEN_REVOCATION_ADMIN_KEY; // Clean up env var
  });

  test('should return 401 if X-Admin-API-Key header is missing', async () => {
    const request = createMockRevokeRequest({ jti: 'some-jti', exp: 1234567890 });
    await POST(request);

    expect(NextResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: OAuth2ErrorTypes.UNAUTHORIZED_CLIENT, error_description: expect.stringContaining('Missing or invalid admin API key') }),
      expect.objectContaining({ status: 401 })
    );
  });

  test('should return 401 if X-Admin-API-Key header is incorrect', async () => {
    const request = createMockRevokeRequest({ jti: 'some-jti', exp: 1234567890 }, { 'X-Admin-API-Key': 'wrong-key' });
    await POST(request);

    expect(NextResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: OAuth2ErrorTypes.UNAUTHORIZED_CLIENT }),
      expect.objectContaining({ status: 401 })
    );
  });

  test('should return 400 if request body is not valid JSON', async () => {
    const request = {
        headers: new Headers({ 'X-Admin-API-Key': MOCK_ADMIN_KEY }),
        json: async () => { throw new Error("Invalid JSON"); }, // Simulate JSON parsing error
        url: 'http://localhost/api/v2/oauth/revoke_token_by_jti',
        method: 'POST',
    } as NextRequest;
    await POST(request);
    expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: OAuth2ErrorTypes.INVALID_REQUEST, error_description: 'Invalid JSON request body.' }),
        expect.objectContaining({ status: 400 })
    );
  });


  test('should return 400 if "jti" is missing in request body', async () => {
    const request = createMockRevokeRequest({ exp: 1234567890 }, { 'X-Admin-API-Key': MOCK_ADMIN_KEY });
    await POST(request);

    expect(NextResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: OAuth2ErrorTypes.INVALID_REQUEST, error_description: expect.stringContaining('Missing or invalid "jti"') }),
      expect.objectContaining({ status: 400 })
    );
  });

  test('should return 400 if "exp" is missing or not a number in request body', async () => {
    let request = createMockRevokeRequest({ jti: 'some-jti' }, { 'X-Admin-API-Key': MOCK_ADMIN_KEY });
    await POST(request);
    expect(NextResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: OAuth2ErrorTypes.INVALID_REQUEST, error_description: expect.stringContaining('Missing or invalid "exp"') }),
      expect.objectContaining({ status: 400 })
    );

    (NextResponse.json as any).mockClear();
    request = createMockRevokeRequest({ jti: 'some-jti', exp: 'not-a-number' }, { 'X-Admin-API-Key': MOCK_ADMIN_KEY });
    await POST(request);
    expect(NextResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: OAuth2ErrorTypes.INVALID_REQUEST, error_description: expect.stringContaining('Missing or invalid "exp"') }),
      expect.objectContaining({ status: 400 })
    );
  });

   test('should return 400 if "exp" is an invalid date format', async () => {
    const request = createMockRevokeRequest({ jti: 'some-jti', exp: "invalid-date-string" }, { 'X-Admin-API-Key': MOCK_ADMIN_KEY });
    await POST(request);
    expect(NextResponse.json).toHaveBeenCalledWith(
      // The error message "Missing or invalid "exp"" is for typeof exp !== 'number'
      // If it's a number but results in NaN for date, the other error message is triggered.
      // Since "invalid-date-string" is not a number, the first check catches it.
      expect.objectContaining({ error: OAuth2ErrorTypes.INVALID_REQUEST, error_description: 'Missing or invalid "exp" (expiry timestamp) in request body.' }),
      expect.objectContaining({ status: 400 })
    );
  });


  test('should blacklist JTI and return 201 if JTI is not already blacklisted', async () => {
    const jtiToRevoke = 'new-jti-to-revoke';
    const expiryTimestamp = Math.floor(Date.now() / 1000) + 3600; // Expires in 1 hour
    const expectedExpiresAt = new Date(expiryTimestamp * 1000);

    (prisma.tokenBlacklist.findUnique as any).mockResolvedValue(null); // Not found
    const mockCreatedEntry = { jti: jtiToRevoke, tokenType: 'access', expiresAt: expectedExpiresAt };
    (prisma.tokenBlacklist.create as any).mockResolvedValue(mockCreatedEntry);

    const request = createMockRevokeRequest(
      { jti: jtiToRevoke, exp: expiryTimestamp, token_type: 'access' },
      { 'X-Admin-API-Key': MOCK_ADMIN_KEY }
    );
    await POST(request);

    expect(prisma.tokenBlacklist.findUnique).toHaveBeenCalledWith({ where: { jti: jtiToRevoke } });
    expect(prisma.tokenBlacklist.create).toHaveBeenCalledWith({
      data: {
        jti: jtiToRevoke,
        tokenType: 'access',
        expiresAt: expectedExpiresAt,
      },
    });
    expect(NextResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Token JTI successfully blacklisted.', jti: jtiToRevoke }),
      expect.objectContaining({ status: 201 })
    );
  });

  test('should return 200 if JTI is already blacklisted', async () => {
    const jtiToRevoke = 'already-revoked-jti';
    const expiryTimestamp = Math.floor(Date.now() / 1000) + 3600;
    const existingEntry = { jti: jtiToRevoke, tokenType: 'access', expiresAt: new Date(expiryTimestamp * 1000) };

    (prisma.tokenBlacklist.findUnique as any).mockResolvedValue(existingEntry);

    const request = createMockRevokeRequest(
      { jti: jtiToRevoke, exp: expiryTimestamp },
      { 'X-Admin-API-Key': MOCK_ADMIN_KEY }
    );
    await POST(request);

    expect(prisma.tokenBlacklist.findUnique).toHaveBeenCalledWith({ where: { jti: jtiToRevoke } });
    expect(prisma.tokenBlacklist.create).not.toHaveBeenCalled();
    expect(NextResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'JTI already blacklisted.', jti: jtiToRevoke }),
      expect.objectContaining({ status: 200 })
    );
  });

  test('should use "access" as default token_type if not provided', async () => {
    const jtiToRevoke = 'jti-default-type';
    const expiryTimestamp = Math.floor(Date.now() / 1000) + 3600;
    (prisma.tokenBlacklist.findUnique as any).mockResolvedValue(null);
    (prisma.tokenBlacklist.create as any).mockResolvedValue({ jti: jtiToRevoke, tokenType: 'access', expiresAt: new Date(expiryTimestamp * 1000) });


    const request = createMockRevokeRequest(
      { jti: jtiToRevoke, exp: expiryTimestamp }, // token_type omitted
      { 'X-Admin-API-Key': MOCK_ADMIN_KEY }
    );
    await POST(request);

    expect(prisma.tokenBlacklist.create).toHaveBeenCalledWith(expect.objectContaining({ tokenType: 'access' }));
    expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 201, jsonBody: expect.objectContaining({ tokenType: 'access' }) })
    );
  });

  test('should use provided "refresh" as token_type', async () => {
    const jtiToRevoke = 'jti-refresh-type';
    const expiryTimestamp = Math.floor(Date.now() / 1000) + 3600;
    (prisma.tokenBlacklist.findUnique as any).mockResolvedValue(null);
    (prisma.tokenBlacklist.create as any).mockResolvedValue({ jti: jtiToRevoke, tokenType: 'refresh', expiresAt: new Date(expiryTimestamp * 1000) });


    const request = createMockRevokeRequest(
      { jti: jtiToRevoke, exp: expiryTimestamp, token_type: 'refresh' },
      { 'X-Admin-API-Key': MOCK_ADMIN_KEY }
    );
    await POST(request);

    expect(prisma.tokenBlacklist.create).toHaveBeenCalledWith(expect.objectContaining({ tokenType: 'refresh' }));
     expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 201, jsonBody: expect.objectContaining({ tokenType: 'refresh' }) })
    );
  });

  test('should handle Prisma errors during create gracefully', async () => {
    const jtiToRevoke = 'jti-prisma-error';
    const expiryTimestamp = Math.floor(Date.now() / 1000) + 3600;
    (prisma.tokenBlacklist.findUnique as any).mockResolvedValue(null); // Not found initially
    (prisma.tokenBlacklist.create as any).mockRejectedValue(new Error('Simulated Prisma error'));

    const request = createMockRevokeRequest(
      { jti: jtiToRevoke, exp: expiryTimestamp },
      { 'X-Admin-API-Key': MOCK_ADMIN_KEY }
    );
    await POST(request);

    expect(NextResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: OAuth2ErrorTypes.SERVER_ERROR, error_description: expect.stringContaining('Failed to blacklist JTI') }),
      expect.objectContaining({ status: 500 })
    );
  });
});
