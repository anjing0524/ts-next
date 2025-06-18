// __tests__/lib/auth/middleware.test.ts
// 单元测试 requirePermission 中间件 HOF
// Unit tests for the requirePermission middleware HOF.

import { NextRequest, NextResponse } from 'next/server';
import * as jose from 'jose';
import { PermissionService } from '@/lib/services/permissionService';
import { requirePermission } from '../../lib/auth/middleware'; // Adjust path

// Mock jose
// 模拟 jose
jest.mock('jose', () => ({
  jwtVerify: jest.fn(),
  createRemoteJWKSet: jest.fn(),
}));

// Mock PermissionService
// 模拟 PermissionService
jest.mock('@/lib/services/permissionService', () => {
  // Mock the class and its methods
  const mockCheckPermission = jest.fn();
  return {
    PermissionService: jest.fn().mockImplementation(() => ({
      checkPermission: mockCheckPermission,
    })),
    // Export the mockCheckPermission function so we can access it in tests to set return values
    // and assert calls, if needed directly (though usually via instance)
    mockedCheckPermissionInstance: mockCheckPermission, // For easier access to the mock fn of the instance
  };
});


// Mock NextResponse.json to inspect responses
// 模拟 NextResponse.json 以检查响应
const mockNextResponseJson = jest.fn();
jest.mock('next/server', () => ({
  ...jest.requireActual('next/server'), // Import and retain default behavior
  NextResponse: {
    json: (body: any, init: any) => {
      mockNextResponseJson(body, init); // Call our mock
      // Return a mock Response object or something that matches enough for the HOF
      return { status: init?.status || 200, json: async () => body, text: async () => JSON.stringify(body) } as any;
    },
  },
}));


describe('requirePermission HOF', () => {
  let mockRequest: NextRequest;
  let mockHandler: jest.Mock;
  let originalEnv: NodeJS.ProcessEnv;

  const mockJwksUri = 'https://jwks.example.com/.well-known/jwks.json';
  const mockIssuer = 'test-issuer';
  const mockAudience = 'test-audience';
  const requiredPermissionName = 'read:resource';

  // Access the mocked checkPermission function from the PermissionService instance
  // (This is a bit of a workaround to get the mock function from the class mock)
  let permissionServiceInstance: PermissionService;
  let checkPermissionMock: jest.Mock;


  beforeAll(() => {
    originalEnv = { ...process.env };
    process.env.JWKS_URI = mockJwksUri;
    process.env.JWT_ISSUER = mockIssuer;
    process.env.JWT_AUDIENCE = mockAudience;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Re-initialize service and get the mock function for checkPermission for each test
    // This ensures that a fresh mock is used for each test run for checkPermission.
    permissionServiceInstance = new PermissionService();
    checkPermissionMock = (permissionServiceInstance.checkPermission as jest.Mock);


    // Setup mock request and handler
    // 设置模拟请求和处理函数
    mockRequest = {
      headers: new Headers(),
      // Add other NextRequest properties if your middleware uses them e.g., url
      url: 'http://localhost:3000/api/test',
    } as NextRequest;
    mockHandler = jest.fn(async (req) => {
      // A simple mock handler that returns a 200 OK response
      // 一个简单的模拟处理函数，返回 200 OK 响应
      return NextResponse.json({ message: 'Handler called successfully', user: req.user }, { status: 200 });
    });

    // Mock createRemoteJWKSet to return a dummy function, as its result is used by jwtVerify
    // 模拟 createRemoteJWKSet 返回一个虚拟函数，因为其结果被 jwtVerify 使用
    (jose.createRemoteJWKSet as jest.Mock).mockReturnValue(jest.fn());
  });


  const applyMiddleware = (permission: string | undefined = requiredPermissionName) => {
    return requirePermission(permission)(mockHandler);
  };

  describe('Successful Paths', () => {
    it('应在令牌有效且权限在令牌声明中时调用处理函数 // Should call handler if token is valid and permission is in token claims', async () => {
      mockRequest.headers.set('Authorization', 'Bearer valid-token-with-perms');
      const mockJwtPayload = {
        sub: 'user-123',
        iss: mockIssuer,
        aud: mockAudience,
        permissions: [requiredPermissionName, 'another:perm'], // 包含所需权限
                                                              // Contains required permission
      };
      (jose.jwtVerify as jest.Mock).mockResolvedValue({ payload: mockJwtPayload, protectedHeader: {} });

      const middleware = applyMiddleware();
      await middleware(mockRequest, {});

      expect(jose.jwtVerify).toHaveBeenCalledWith('valid-token-with-perms', expect.any(Function), {
        issuer: mockIssuer,
        audience: mockAudience,
      });
      expect(mockHandler).toHaveBeenCalledTimes(1);
      const handlerArgReq = mockHandler.mock.calls[0][0];
      expect(handlerArgReq.user).toEqual({ id: 'user-123', permissions: mockJwtPayload.permissions });
      expect(checkPermissionMock).not.toHaveBeenCalled(); // PermissionService 不应被调用
                                                          // PermissionService should NOT be called
    });

    it('应在令牌有效且PermissionService授予权限时调用处理函数 // Should call handler if token is valid and PermissionService grants permission', async () => {
      mockRequest.headers.set('Authorization', 'Bearer valid-token-no-perms-claim');
      const mockJwtPayloadNoPerms = { sub: 'user-456', iss: mockIssuer, aud: mockAudience }; // 没有 'permissions' 声明
                                                                                          // No 'permissions' claim
      (jose.jwtVerify as jest.Mock).mockResolvedValue({ payload: mockJwtPayloadNoPerms, protectedHeader: {} });
      checkPermissionMock.mockResolvedValue(true); // PermissionService 授予权限
                                                   // PermissionService grants permission

      const middleware = applyMiddleware();
      await middleware(mockRequest, {});

      expect(mockHandler).toHaveBeenCalledTimes(1);
      const handlerArgReq = mockHandler.mock.calls[0][0];
      expect(handlerArgReq.user).toEqual({ id: 'user-456', permissions: [] }); // permissions默认为空数组
                                                                               // permissions defaults to empty array
      expect(checkPermissionMock).toHaveBeenCalledWith('user-456', requiredPermissionName);
    });

    it('当不需要特定权限时 (permissionName为undefined)，应仅验证令牌并调用处理函数 // Should only validate token and call handler if no specific permissionName is required (undefined)', async () => {
      mockRequest.headers.set('Authorization', 'Bearer valid-token-general');
      const mockJwtPayload = { sub: 'user-789', iss: mockIssuer, aud: mockAudience, permissions: ['some:perm'] };
      (jose.jwtVerify as jest.Mock).mockResolvedValue({ payload: mockJwtPayload, protectedHeader: {} });

      const middleware = applyMiddleware(undefined); // 无特定权限要求
                                                    // No specific permission required
      await middleware(mockRequest, {});

      expect(mockHandler).toHaveBeenCalledTimes(1);
      const handlerArgReq = mockHandler.mock.calls[0][0];
      expect(handlerArgReq.user).toEqual({ id: 'user-789', permissions: ['some:perm'] });
      expect(checkPermissionMock).not.toHaveBeenCalled();
    });
  });

  describe('Authentication Failures', () => {
    it('没有Authorization头时应返回401 // Should return 401 if no Authorization header', async () => {
      const middleware = applyMiddleware();
      await middleware(mockRequest, {});
      expect(mockNextResponseJson).toHaveBeenCalledWith({ error: 'Unauthorized', message: 'Authorization header missing.' }, { status: 401 });
      expect(mockHandler).not.toHaveBeenCalled();
    });

    it('Authorization头格式错误时应返回401 // Should return 401 for malformed Authorization header', async () => {
      mockRequest.headers.set('Authorization', 'NotBearer some-token');
      const middleware = applyMiddleware();
      await middleware(mockRequest, {});
      expect(mockNextResponseJson).toHaveBeenCalledWith({ error: 'Unauthorized', message: 'Authorization header malformed.' }, { status: 401 });
      expect(mockHandler).not.toHaveBeenCalled();
    });

    it('令牌为空时应返回401 // Should return 401 for empty token', async () => {
      mockRequest.headers.set('Authorization', 'Bearer ');
      const middleware = applyMiddleware();
      await middleware(mockRequest, {});
      expect(mockNextResponseJson).toHaveBeenCalledWith({ error: 'Unauthorized', message: 'Token missing.' }, { status: 401 });
      expect(mockHandler).not.toHaveBeenCalled();
    });

    it('jwtVerify抛出JWTExpired错误时应返回401 // Should return 401 if jwtVerify throws JWTExpired', async () => {
      mockRequest.headers.set('Authorization', 'Bearer expired-token');
      (jose.jwtVerify as jest.Mock).mockRejectedValue(new jose.errors.JWTExpired('Token has expired'));

      const middleware = applyMiddleware();
      await middleware(mockRequest, {});
      expect(mockNextResponseJson).toHaveBeenCalledWith({ error: 'Unauthorized', message: 'Token has expired.' }, { status: 401 });
      expect(mockHandler).not.toHaveBeenCalled();
    });

    it('jwtVerify抛出JWSSignatureVerificationFailed错误时应返回401 // Should return 401 if jwtVerify throws JWSSignatureVerificationFailed', async () => {
      mockRequest.headers.set('Authorization', 'Bearer invalid-signature-token');
      (jose.jwtVerify as jest.Mock).mockRejectedValue(new jose.errors.JWSSignatureVerificationFailed('Signature verification failed'));

      const middleware = applyMiddleware();
      await middleware(mockRequest, {});
      expect(mockNextResponseJson).toHaveBeenCalledWith({ error: 'Unauthorized', message: 'Token signature verification failed.' }, { status: 401 });
      expect(mockHandler).not.toHaveBeenCalled();
    });

    it('jwtVerify抛出其他错误时应返回401 // Should return 401 if jwtVerify throws other errors', async () => {
      mockRequest.headers.set('Authorization', 'Bearer some-token');
      (jose.jwtVerify as jest.Mock).mockRejectedValue(new Error('Some other JOSE error'));

      const middleware = applyMiddleware();
      await middleware(mockRequest, {});
      expect(mockNextResponseJson).toHaveBeenCalledWith({ error: 'Unauthorized', message: 'Invalid token.' }, { status: 401 });
      expect(mockHandler).not.toHaveBeenCalled();
    });

    it('jwtVerify返回的payload没有sub时应返回401 // Should return 401 if jwtVerify payload has no sub', async () => {
      mockRequest.headers.set('Authorization', 'Bearer token-no-sub');
      (jose.jwtVerify as jest.Mock).mockResolvedValue({ payload: { iss: mockIssuer, aud: mockAudience }, protectedHeader: {} }); // 无 sub
                                                                                                                                // No sub
      const middleware = applyMiddleware();
      await middleware(mockRequest, {});
      expect(mockNextResponseJson).toHaveBeenCalledWith({ error: 'Unauthorized', message: 'Token missing user subject.' }, { status: 401 });
      expect(mockHandler).not.toHaveBeenCalled();
    });
  });

  describe('Authorization Failures', () => {
    it('令牌有效但所需权限不在声明中且PermissionService拒绝访问时应返回403 // Should return 403 if token valid, permission not in claims, and PermissionService denies', async () => {
      mockRequest.headers.set('Authorization', 'Bearer valid-token-perms-denied');
      const mockJwtPayload = { sub: 'user-789', iss: mockIssuer, aud: mockAudience, permissions: ['other:perm'] };
      (jose.jwtVerify as jest.Mock).mockResolvedValue({ payload: mockJwtPayload, protectedHeader: {} });
      checkPermissionMock.mockResolvedValue(false); // PermissionService 拒绝
                                                    // PermissionService denies

      const middleware = applyMiddleware();
      await middleware(mockRequest, {});

      expect(mockNextResponseJson).toHaveBeenCalledWith({ error: 'Forbidden', message: 'User does not have the required permission.' }, { status: 403 });
      expect(mockHandler).not.toHaveBeenCalled();
      expect(checkPermissionMock).toHaveBeenCalledWith('user-789', requiredPermissionName);
    });
  });

  describe('Configuration Errors', () => {
    it('JWKS_URI 未定义时应返回401或500（取决于内部错误处理）// Should return 401/500 if JWKS_URI is undefined', async () => {
      process.env.JWKS_URI = ''; // 或 undefined
                                  // or undefined
      // Re-create the HOF as it captures env vars on creation
      const middleware = requirePermission(requiredPermissionName)(mockHandler);

      mockRequest.headers.set('Authorization', 'Bearer some-token');
      // jwtVerify 可能会因为 createRemoteJWKSet 失败 (由于JWKS_URI缺失) 而抛出错误
      // jwtVerify might throw an error because createRemoteJWKSet fails (due to missing JWKS_URI)
      // 假设 createRemoteJWKSet 在这种情况下会快速失败或返回一个行为不正常的JWKS获取器
      // Assume createRemoteJWKSet fails fast or returns a misbehaving JWKS fetcher in this case
      (jose.createRemoteJWKSet as jest.Mock).mockImplementation(() => {
        throw new Error("Cannot create JWKSet without URI");
      });
      // 或者，如果 jwtVerify 内部捕获了这个错误并抛出自己的类型：
      // Or, if jwtVerify catches this internally and throws its own type:
      // (jose.jwtVerify as jest.Mock).mockRejectedValue(new Error('JWKS setup failed'));


      await middleware(mockRequest, {});

      // 期望一个通用认证错误，因为无法验证令牌
      // Expect a generic authentication error as token cannot be verified
      // 确切的消息可能取决于jose库或我们如何包装它
      // The exact message might depend on the jose library or how we wrap it.
      // "JWKS URI not configured" is a good specific message if we add such check.
      // Otherwise, it might fall into "Invalid token" or similar.
      expect(mockNextResponseJson).toHaveBeenCalled();
      const responseArgs = mockNextResponseJson.mock.calls[0];
      expect(responseArgs[1].status).toBe(500); // Or 401, depending on specific internal handling
      expect(responseArgs[0].error).toBe('Internal Server Error'); // Or 'Unauthorized'
      expect(responseArgs[0].message).toMatch(/JWKS URI not configured|Cannot create JWKSet without URI|Invalid token/i);


      expect(mockHandler).not.toHaveBeenCalled();
      process.env.JWKS_URI = mockJwksUri; // 恢复
                                          // Restore
    });
  });
});
