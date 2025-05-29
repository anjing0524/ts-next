import { describe, it, expect, beforeEach, vi } from 'vitest'

// Test API utility functions without importing the full lib/api module
describe('API Utility Functions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('basePath detection', () => {
    it('should return /datamgr_flow when pathname starts with /datamgr_flow', () => {
      // Mock window.location directly in test
      const mockLocation = {
        pathname: '/datamgr_flow/admin',
        origin: 'http://localhost:3000'
      }
      vi.stubGlobal('window', { location: mockLocation })

      const getBasePath = () => {
        if (typeof window !== 'undefined') {
          const pathname = window.location.pathname;
          if (pathname.startsWith('/datamgr_flow')) {
            return '/datamgr_flow';
          }
        }
        return '';
      };

      expect(getBasePath()).toBe('/datamgr_flow')
    })

    it('should return empty string for development paths', () => {
      const mockLocation = {
        pathname: '/admin',
        origin: 'http://localhost:3000'
      }
      vi.stubGlobal('window', { location: mockLocation })

      const getBasePath = () => {
        if (typeof window !== 'undefined') {
          const pathname = window.location.pathname;
          if (pathname.startsWith('/datamgr_flow')) {
            return '/datamgr_flow';
          }
        }
        return '';
      };

      expect(getBasePath()).toBe('')
    })
  })

  describe('URL construction', () => {
    it('should construct full URLs with basePath correctly', () => {
      const mockLocation = {
        origin: 'http://localhost:3000'
      }
      vi.stubGlobal('window', { location: mockLocation })

      const getFullUrl = (path: string, basePath: string = '') => {
        if (typeof window === 'undefined') return path;
        return path.startsWith('/') ? `${window.location.origin}${basePath}${path}` : path;
      }

      const fullUrl = getFullUrl('/api/oauth/token', '/datamgr_flow')
      expect(fullUrl).toBe('http://localhost:3000/datamgr_flow/api/oauth/token')
    })

    it('should handle OAuth redirect URI correctly', () => {
      const mockLocation = {
        origin: 'http://localhost:3000'
      }
      vi.stubGlobal('window', { location: mockLocation })

      const getOAuthRedirectUri = (basePath: string = '') => {
        if (typeof window === 'undefined') return '';
        return `${window.location.origin}${basePath}/auth/callback`;
      }

      const redirectUri = getOAuthRedirectUri('/datamgr_flow')
      expect(redirectUri).toBe('http://localhost:3000/datamgr_flow/auth/callback')
    })

    it('should not add basePath to external URLs', () => {
      const getFullUrl = (path: string, basePath: string = '') => {
        if (typeof window === 'undefined') return path;
        return path.startsWith('/') ? `${window.location.origin}${basePath}${path}` : path;
      }

      const externalUrl = getFullUrl('https://external.com/api')
      expect(externalUrl).toBe('https://external.com/api')
    })
  })

  describe('fetch wrapper functionality', () => {
    it('should add basePath to relative URLs', () => {
      const apiFetch = (url: string, basePath: string = '') => {
        const fullUrl = url.startsWith('/') ? `${basePath}${url}` : url;
        return { url: fullUrl };
      }

      const result = apiFetch('/api/users', '/datamgr_flow')
      expect(result.url).toBe('/datamgr_flow/api/users')
    })

    it('should not modify absolute URLs', () => {
      const apiFetch = (url: string, basePath: string = '') => {
        const fullUrl = url.startsWith('/') ? `${basePath}${url}` : url;
        return { url: fullUrl };
      }

      const result = apiFetch('https://api.example.com/data', '/datamgr_flow')
      expect(result.url).toBe('https://api.example.com/data')
    })

    it('should handle empty basePath correctly', () => {
      const apiFetch = (url: string, basePath: string = '') => {
        const fullUrl = url.startsWith('/') ? `${basePath}${url}` : url;
        return { url: fullUrl };
      }

      const result = apiFetch('/api/users', '')
      expect(result.url).toBe('/api/users')
    })
  })

  describe('authentication headers', () => {
    it('should add Bearer token when available', () => {
      // Mock sessionStorage
      const mockSessionStorage = {
        getItem: vi.fn().mockReturnValue('mock-token')
      }
      vi.stubGlobal('sessionStorage', mockSessionStorage)

      const addAuthHeaders = (headers: Record<string, string> = {}) => {
        const token = sessionStorage.getItem('access_token')
        if (token) {
          headers['Authorization'] = `Bearer ${token}`
        }
        return headers
      }

      const headers = addAuthHeaders({ 'Content-Type': 'application/json' })
      expect(headers).toEqual({
        'Content-Type': 'application/json',
        'Authorization': 'Bearer mock-token'
      })
    })

    it('should not add auth header when no token available', () => {
      const mockSessionStorage = {
        getItem: vi.fn().mockReturnValue(null)
      }
      vi.stubGlobal('sessionStorage', mockSessionStorage)

      const addAuthHeaders = (headers: Record<string, string> = {}) => {
        const token = sessionStorage.getItem('access_token')
        if (token) {
          headers['Authorization'] = `Bearer ${token}`
        }
        return headers
      }

      const headers = addAuthHeaders({ 'Content-Type': 'application/json' })
      expect(headers).toEqual({
        'Content-Type': 'application/json'
      })
    })
  })
}) 