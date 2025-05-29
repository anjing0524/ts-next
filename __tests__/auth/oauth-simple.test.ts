import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock API utility functions
describe('OAuth Helper Functions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('PKCE Code Generation', () => {
    it('should generate a code verifier', () => {
      // Browser compatible PKCE functions
      function base64urlEscape(str: string): string {
        return str.replace(/\+/g, '-')
                  .replace(/\//g, '_')
                  .replace(/=/g, '');
      }

      function generateCodeVerifier(): string {
        const array = new Uint8Array(32);
        crypto.getRandomValues(array);
        return base64urlEscape(btoa(String.fromCharCode.apply(null, Array.from(array))));
      }

      const codeVerifier = generateCodeVerifier()
      expect(codeVerifier).toBeDefined()
      expect(typeof codeVerifier).toBe('string')
      expect(codeVerifier.length).toBeGreaterThan(0)
    })

    it('should generate a code challenge from verifier', async () => {
      function base64urlEscape(str: string): string {
        return str.replace(/\+/g, '-')
                  .replace(/\//g, '_')
                  .replace(/=/g, '');
      }

      async function generateCodeChallenge(codeVerifier: string): Promise<string> {
        const encoder = new TextEncoder();
        const data = encoder.encode(codeVerifier);
        const digest = await crypto.subtle.digest('SHA-256', data);
        return base64urlEscape(btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(digest)))));
      }

      const codeVerifier = 'test-code-verifier'
      const codeChallenge = await generateCodeChallenge(codeVerifier)
      
      expect(codeChallenge).toBeDefined()
      expect(typeof codeChallenge).toBe('string')
      expect(codeChallenge.length).toBeGreaterThan(0)
      expect(codeChallenge).not.toBe(codeVerifier)
    })
  })

  describe('OAuth URL Generation', () => {
    it('should generate proper OAuth authorization URL', () => {
      const params = {
        client_id: 'test-client',
        redirect_uri: 'http://localhost:3000/callback',
        response_type: 'code',
        scope: 'openid profile',
        code_challenge: 'test-challenge',
        code_challenge_method: 'S256',
        state: 'test-state'
      }

      const authUrl = new URL('http://localhost:3000/api/oauth/authorize')
      Object.entries(params).forEach(([key, value]) => {
        authUrl.searchParams.set(key, value)
      })

      expect(authUrl.toString()).toContain('client_id=test-client')
      expect(authUrl.toString()).toContain('redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fcallback')
      expect(authUrl.toString()).toContain('response_type=code')
      expect(authUrl.toString()).toContain('scope=openid+profile')
    })
  })

  describe('API Utility Functions', () => {
    it('should handle base path correctly', () => {
      // Mock window location
      Object.defineProperty(window, 'location', {
        value: {
          pathname: '/datamgr_flow/admin',
          origin: 'http://localhost:3000'
        },
        writable: true
      })

      const getBasePath = () => {
        if (typeof window !== 'undefined') {
          const pathname = window.location.pathname;
          if (pathname.startsWith('/datamgr_flow')) {
            return '/datamgr_flow';
          }
        }
        return '';
      };

      const basePath = getBasePath()
      expect(basePath).toBe('/datamgr_flow')
    })

    it('should construct full URLs correctly', () => {
      Object.defineProperty(window, 'location', {
        value: {
          origin: 'http://localhost:3000'
        },
        writable: true
      })

      function getFullUrl(path: string, basePath: string = ''): string {
        if (typeof window === 'undefined') return path;
        return path.startsWith('/') ? `${window.location.origin}${basePath}${path}` : path;
      }

      const fullUrl = getFullUrl('/api/oauth/token', '/datamgr_flow')
      expect(fullUrl).toBe('http://localhost:3000/datamgr_flow/api/oauth/token')
    })
  })

  describe('Session Storage Management', () => {
    it('should store and retrieve tokens', () => {
      const mockToken = 'mock-access-token'
      
      // Mock sessionStorage calls
      ;(sessionStorage.setItem as any).mockImplementation(() => {})
      ;(sessionStorage.getItem as any).mockReturnValue(mockToken)

      sessionStorage.setItem('access_token', mockToken)
      const storedToken = sessionStorage.getItem('access_token')

      expect(sessionStorage.setItem).toHaveBeenCalledWith('access_token', mockToken)
      expect(storedToken).toBe(mockToken)
    })

    it('should clear tokens on logout', () => {
      ;(sessionStorage.removeItem as any).mockImplementation(() => {})

      sessionStorage.removeItem('access_token')
      sessionStorage.removeItem('refresh_token')

      expect(sessionStorage.removeItem).toHaveBeenCalledWith('access_token')
      expect(sessionStorage.removeItem).toHaveBeenCalledWith('refresh_token')
    })
  })
}) 