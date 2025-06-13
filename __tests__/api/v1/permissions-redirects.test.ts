import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as adminRedirectPOST } from '@/app/api/v1/admin/permissions/check/route';
import { POST as authRedirectPOST } from '@/app/api/v1/auth/check/route';
import { TEST_CONFIG } from '../../utils/test-helpers'; // Assuming test-helpers is in parent's parent

// Helper to create mock NextRequest
function createMockRequest(method: string, urlPath: string, body?: any, headers?: any): NextRequest {
  const url = new URL(urlPath, 'http://localhost:3000'); // Base URL for context
  return new NextRequest(url.toString(), {
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

describe('V1权限重定向单元测试 / V1 Permissions Redirect Unit Tests', () => {
  const targetRedirectPathname = '/api/permissions/check';

  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {}); // Keep this to suppress expected warnings
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('POST /api/v1/admin/permissions/check (重定向单元测试) / (Redirect Unit Test)', () => {
    it('TC_PR_001_001: 应返回301重定向响应至统一权限检查端点 / Should return a 301 redirect response to the unified permission check endpoint', async () => {
      const request = createMockRequest('POST', '/api/v1/admin/permissions/check', {});
      const response = await adminRedirectPOST(request);

      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.MOVED_PERMANENTLY);
      const locationHeader = response.headers.get('Location');
      expect(locationHeader).toBeDefined();

      const expectedRedirectUrl = new URL(targetRedirectPathname, 'http://localhost:3000').toString();
      expect(locationHeader).toBe(expectedRedirectUrl);
      expect(new URL(locationHeader!).pathname).toBe(targetRedirectPathname);
    });
  });

  describe('POST /api/v1/auth/check (重定向单元测试) / (Redirect Unit Test)', () => {
    it('TC_PR_002_001: 应返回301重定向响应至统一权限检查端点 / Should return a 301 redirect response to the unified permission check endpoint', async () => {
      const request = createMockRequest('POST', '/api/v1/auth/check', {});
      const response = await authRedirectPOST(request);

      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.MOVED_PERMANENTLY);
      const locationHeader = response.headers.get('Location');
      expect(locationHeader).toBeDefined();

      const expectedRedirectUrl = new URL(targetRedirectPathname, 'http://localhost:3000').toString();
      expect(locationHeader).toBe(expectedRedirectUrl);
      expect(new URL(locationHeader!).pathname).toBe(targetRedirectPathname);
    });
  });
});
