// __tests__/app/middleware.test.ts
import { NextRequest, NextResponse } from 'next/server';
import { middleware, config as middlewareConfig } from '@/app/middleware'; // Adjust path as necessary
import * as jose from 'jose';

// Mock jose.jwtVerify
jest.mock('jose', () => {
  const originalJose = jest.requireActual('jose');
  return {
    ...originalJose,
    jwtVerify: jest.fn(),
  };
});

// Mock NextResponse static methods
const mockNextResponseNext = jest.fn();
const mockNextResponseRedirect = jest.fn();

jest.mock('next/server', () => {
  const originalNextServer = jest.requireActual('next/server');
  return {
    ...originalNextServer,
    NextResponse: {
      ...originalNextServer.NextResponse,
      next: (...args: any[]) => {
        mockNextResponseNext(...args);
        // Return a new plain object simulating a basic response for chaining or inspection
        // Or, return a simplified version of what NextResponse.next() might return
        // For these tests, knowing it was called is often enough.
        // However, the middleware often returns the result of NextResponse.next()
        // So we need to return a valid response-like object.
        return new originalNextServer.NextResponse(null, { status: 200, headers: { 'x-middleware-next': '1' } });
      },
      redirect: (...args: any[]) => {
        mockNextResponseRedirect(...args);
        // The redirect function takes a URL and an optional status or init object.
        // It returns a NextResponse object.
        const url = args[0] instanceof URL ? args[0] : new URL(args[0].toString(), 'http://localhost');
        const init = args[1] || { status: 307 }; // Default redirect status
        const response = new originalNextServer.NextResponse(null, {
            status: init.status || 307,
            headers: { Location: url.toString() },
        });
        // console.log('Redirecting to:', url.toString(), 'with status:', response.status);
        return response;
      },
    },
  };
});


// Helper to create NextRequest
function createMockReq(
  urlPath: string,
  {
    token,
    isCookie = true,
    headers,
  }: { token?: string; isCookie?: boolean; headers?: Record<string, string> } = {}
): NextRequest {
  const url = new URL(urlPath, 'http://localhost:3000');
  const request = new NextRequest(url.toString());

  if (token) {
    if (isCookie) {
      request.cookies.set('auth_token', token);
    } else {
      request.headers.set('Authorization', `Bearer ${token}`);
    }
  }
  if (headers) {
    for (const key in headers) {
      request.headers.set(key, headers[key]);
    }
  }
  return request;
}

describe('App Middleware (`app/middleware.ts`)', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules(); // Reset modules to clear cache
    process.env = { ...OLD_ENV }; // Make a copy
    
    // Mock environment variables used by the middleware
    process.env.JWT_ACCESS_TOKEN_SECRET = 'test-secret-key-for-hs256-middleware';
    process.env.JWT_ISSUER = 'test-issuer';
    process.env.JWT_AUDIENCE = 'test-audience';

    // Reset mocks before each test
    (jose.jwtVerify as jest.Mock).mockReset();
    mockNextResponseNext.mockReset();
    mockNextResponseRedirect.mockReset();
  });

  afterAll(() => {
    process.env = OLD_ENV; // Restore old environment
  });

  describe('Protected Routes (/dashboard, /flow)', () => {
    const protectedPaths = ['/dashboard', '/flow', '/dashboard/settings', '/flow/new'];

    protectedPaths.forEach(path => {
      test(`should redirect to /login if no token is provided for ${path}`, async () => {
        const req = createMockReq(path);
        const response = await middleware(req);

        expect(mockNextResponseRedirect).toHaveBeenCalled();
        const redirectUrl = new URL(mockNextResponseRedirect.mock.calls[0][0].toString());
        expect(redirectUrl.pathname).toBe('/login');
        expect(redirectUrl.searchParams.get('redirect_uri')).toBe(path);
        expect(response?.headers?.get('Location')).toContain('/login');
        expect(response?.status).toBe(307); // Default redirect
      });

      test(`should redirect to /login if token is invalid for ${path}`, async () => {
        (jose.jwtVerify as jest.Mock).mockRejectedValue(new Error('Invalid token'));
        const req = createMockReq(path, { token: 'invalid-token' });
        const response = await middleware(req);
        
        expect(mockNextResponseRedirect).toHaveBeenCalled();
        const redirectUrl = new URL(mockNextResponseRedirect.mock.calls[0][0].toString());
        expect(redirectUrl.pathname).toBe('/login');
        expect(redirectUrl.searchParams.get('redirect_uri')).toBe(path);
        expect(redirectUrl.searchParams.get('error')).toBe('invalid_token');
        expect(response?.headers?.get('Location')).toContain('/login');
      });

      test(`should redirect to /unauthorized if token is valid but no page permission for ${path}`, async () => {
        const requiredPermission = path.startsWith('/dashboard') ? 'page_dashboard:access' : 'page_flow:access';
        (jose.jwtVerify as jest.Mock).mockResolvedValue({
          payload: { 
            sub: 'test-user', 
            permissions: ['other:access'] // No relevant permission
          },
        });
        const req = createMockReq(path, { token: 'valid-token-no-perms' });
        const response = await middleware(req);

        expect(mockNextResponseRedirect).toHaveBeenCalled();
        const redirectUrl = new URL(mockNextResponseRedirect.mock.calls[0][0].toString());
        expect(redirectUrl.pathname).toBe('/unauthorized');
        expect(redirectUrl.searchParams.get('attempted_path')).toBe(path);
        expect(redirectUrl.searchParams.get('required_permission')).toBe(requiredPermission);
        expect(response?.headers?.get('Location')).toContain('/unauthorized');
      });
      
      test(`should allow access if token is valid and has page permission for ${path}`, async () => {
        const permission = path.startsWith('/dashboard') ? 'page_dashboard:access' : 'page_flow:access';
        (jose.jwtVerify as jest.Mock).mockResolvedValue({
          payload: { 
            sub: 'test-user', 
            permissions: [permission, 'other:access'] 
          },
        });
        const req = createMockReq(path, { token: 'valid-token-with-perms' });
        const response = await middleware(req);

        expect(mockNextResponseNext).toHaveBeenCalled();
        expect(mockNextResponseRedirect).not.toHaveBeenCalled();
        expect(response?.headers?.get('x-middleware-next')).toBe('1'); // Check our mockNextResponseNext was used
      });
    });

    test('should redirect to /unauthorized for an unconfigured but protected path like /dashboard/unknown', async () => {
        (jose.jwtVerify as jest.Mock).mockResolvedValue({
          payload: { 
            sub: 'test-user', 
            // User might have general dashboard permission but not for this specific sub-path if it were configured differently
            permissions: ['page_dashboard:access'] 
          },
        });
        const req = createMockReq('/dashboard/unknown_feature'); // Token doesn't matter as much as path config
        const response = await middleware(req);

        expect(mockNextResponseRedirect).toHaveBeenCalled();
        const redirectUrl = new URL(mockNextResponseRedirect.mock.calls[0][0].toString());
        expect(redirectUrl.pathname).toBe('/unauthorized');
        expect(redirectUrl.searchParams.get('attempted_path')).toBe('/dashboard/unknown_feature');
        // This specific error is because /dashboard/unknown_feature is not in pagePermissions map
        expect(redirectUrl.searchParams.get('error')).toBe('unconfigured_protected_path'); 
        expect(response?.headers?.get('Location')).toContain('/unauthorized');
    });
  });

  describe('Excluded Routes (Matcher Logic)', () => {
    // Note: The matcher itself is hard to test directly in Jest without a full Next.js server.
    // These tests will primarily verify the initial `isProtectedPath` check within the middleware function
    // for paths that would typically be excluded by the matcher.
    // The middleware's `config.matcher` is more for Next.js infrastructure.
    // Our tests focus on the middleware *function's* behavior.

    const excludedPaths = [
      '/api/health',
      '/_next/static/css/main.css',
      '/_next/image/img.png',
      '/favicon.ico',
      '/login', // Login page should bypass protection
      '/', // Root path is not explicitly protected by /dashboard or /flow prefix
    ];

    excludedPaths.forEach(path => {
      test(`should bypass protection and call next() for excluded path: ${path}`, async () => {
        const req = createMockReq(path);
        // No need to mock jwtVerify or set tokens as these paths should skip that logic
        const response = await middleware(req);

        expect(mockNextResponseNext).toHaveBeenCalled();
        expect(mockNextResponseRedirect).not.toHaveBeenCalled();
        expect(jose.jwtVerify).not.toHaveBeenCalled();
        expect(response?.headers?.get('x-middleware-next')).toBe('1');
      });
    });
  });

  describe('Token Retrieval Logic', () => {
    const path = '/dashboard'; // Any protected path
    const permission = 'page_dashboard:access';

    test('should retrieve token from auth_token cookie', async () => {
      (jose.jwtVerify as jest.Mock).mockResolvedValue({
        payload: { sub: 'user-cookie', permissions: [permission] },
      });
      const req = createMockReq(path, { token: 'cookie-token', isCookie: true });
      await middleware(req);

      expect(jose.jwtVerify).toHaveBeenCalledWith(
        'cookie-token', 
        expect.any(Uint8Array), // Secret key
        expect.objectContaining({ audience: 'test-audience', issuer: 'test-issuer' })
      );
      expect(mockNextResponseNext).toHaveBeenCalled();
    });

    test('should retrieve token from Authorization header if cookie is not present', async () => {
      (jose.jwtVerify as jest.Mock).mockResolvedValue({
        payload: { sub: 'user-header', permissions: [permission] },
      });
      const req = createMockReq(path, { token: 'header-token', isCookie: false });
      await middleware(req);

      expect(jose.jwtVerify).toHaveBeenCalledWith(
        'header-token',
        expect.any(Uint8Array),
        expect.objectContaining({ audience: 'test-audience', issuer: 'test-issuer' })
      );
      expect(mockNextResponseNext).toHaveBeenCalled();
    });

    test('should prioritize cookie token if both cookie and Authorization header are present', async () => {
      (jose.jwtVerify as jest.Mock).mockResolvedValue({
        payload: { sub: 'user-cookie-priority', permissions: [permission] },
      });
      const req = createMockReq(path, { token: 'cookie-first-token', isCookie: true });
      req.headers.set('Authorization', 'Bearer header-second-token'); // Add header token as well
      
      await middleware(req);

      expect(jose.jwtVerify).toHaveBeenCalledWith(
        'cookie-first-token', // Expects the cookie token to be used
        expect.any(Uint8Array),
        expect.objectContaining({ audience: 'test-audience', issuer: 'test-issuer' })
      );
      expect(mockNextResponseNext).toHaveBeenCalled();
    });
  });
  
  describe('Environment Variable Checks', () => {
    test('should redirect to login with config_error if JWT_ACCESS_TOKEN_SECRET is missing', async () => {
        delete process.env.JWT_ACCESS_TOKEN_SECRET; // Remove the secret
        const req = createMockReq('/dashboard', { token: 'any-token' });
        const response = await middleware(req);

        expect(mockNextResponseRedirect).toHaveBeenCalled();
        const redirectUrl = new URL(mockNextResponseRedirect.mock.calls[0][0].toString());
        expect(redirectUrl.pathname).toBe('/login');
        expect(redirectUrl.searchParams.get('error')).toBe('configuration_error');
        expect(response?.headers?.get('Location')).toContain('/login');
    });
  });

});

// Example of how to test the matcher (more complex, might need specific Next.js test utils or focus on regex)
// describe('Middleware Matcher Configuration', () => {
//   const { matcher } = middlewareConfig;
//   // This is a simplified way to test parts of the regex.
//   // Full matcher testing is best done with Next.js's own testing patterns if available.
//   const positiveMatches = ['/dashboard', '/flow', '/dashboard/foo', '/flow/bar/baz'];
//   const negativeMatches = ['/', '/login', '/api/test', '/_next/static/chunk.js', '/favicon.ico'];

//   // The primary regex is the negative lookahead: '/((?!api|_next/static|_next/image|favicon.ico|login).*)'
//   // The other matchers are '/dashboard/:path*' and '/flow/:path*'
//   // Due to how Next.js combines these, simply testing the regexes individually might not be enough.
//   // However, we can test the spirit of the exclusion/inclusion.
  
//   // For now, this is a placeholder as direct regex testing of Next.js matcher arrays is non-trivial
//   // without Next.js's internal matching logic. The functional tests above for excluded paths
//   // provide more practical coverage of the *middleware function's* behavior based on paths.
// });
