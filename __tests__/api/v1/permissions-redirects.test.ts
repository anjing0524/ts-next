import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as adminRedirectPOST } from '@/app/api/v1/admin/permissions/check/route';
import { POST as authRedirectPOST } from '@/app/api/v1/auth/check/route';

// Helper to create mock NextRequest
function createMockRequest(method: string, urlPath: string, body?: any, headers?: any): NextRequest {
  const url = new URL(urlPath, 'http://localhost:3000'); // Base URL for context
  return new NextRequest(url.toString(), {
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

describe('V1 Permissions Redirect Unit Tests', () => {
  const targetRedirectPathname = '/api/permissions/check';

  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('POST /api/v1/admin/permissions/check (Redirect - Unit)', () => {
    it('should return a 301 redirect response to the unified permission check endpoint', async () => {
      const request = createMockRequest('POST', '/api/v1/admin/permissions/check', {});
      const response = await adminRedirectPOST(request);

      expect(response.status).toBe(301);
      const locationHeader = response.headers.get('Location');
      expect(locationHeader).toBeDefined();

      const expectedRedirectUrl = new URL(targetRedirectPathname, 'http://localhost:3000').toString();
      expect(locationHeader).toBe(expectedRedirectUrl);
      expect(new URL(locationHeader!).pathname).toBe(targetRedirectPathname);
    });
  });

  describe('POST /api/v1/auth/check (Redirect - Unit)', () => {
    it('should return a 301 redirect response to the unified permission check endpoint', async () => {
      const request = createMockRequest('POST', '/api/v1/auth/check', {});
      const response = await authRedirectPOST(request);

      expect(response.status).toBe(301);
      const locationHeader = response.headers.get('Location');
      expect(locationHeader).toBeDefined();

      const expectedRedirectUrl = new URL(targetRedirectPathname, 'http://localhost:3000').toString();
      expect(locationHeader).toBe(expectedRedirectUrl);
      expect(new URL(locationHeader!).pathname).toBe(targetRedirectPathname);
    });
  });
});
