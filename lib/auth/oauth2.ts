import { NextRequest } from 'next/server';
import * as jose from 'jose';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { User, Client, Scope } from '@prisma/client';

// OAuth 2.0 Error Types
export interface OAuth2Error {
  error: string;
  error_description?: string;
  error_uri?: string;
  state?: string;
}

export const OAuth2ErrorTypes = {
  INVALID_REQUEST: 'invalid_request',
  INVALID_CLIENT: 'invalid_client',
  INVALID_GRANT: 'invalid_grant',
  UNAUTHORIZED_CLIENT: 'unauthorized_client',
  UNSUPPORTED_GRANT_TYPE: 'unsupported_grant_type',
  INVALID_SCOPE: 'invalid_scope',
  ACCESS_DENIED: 'access_denied',
  UNSUPPORTED_RESPONSE_TYPE: 'unsupported_response_type',
  SERVER_ERROR: 'server_error',
  TEMPORARILY_UNAVAILABLE: 'temporarily_unavailable',
} as const;

// PKCE utilities
export class PKCEUtils {
  static generateCodeVerifier(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

  static generateCodeChallenge(verifier: string): string {
    return crypto.createHash('sha256').update(verifier).digest('base64url');
  }

  static verifyCodeChallenge(verifier: string, challenge: string, method: string = 'S256'): boolean {
    if (method !== 'S256') {
      return false;
    }
    const calculatedChallenge = this.generateCodeChallenge(verifier);
    return calculatedChallenge === challenge;
  }

  static validateCodeChallenge(challenge: string): boolean {
    // RFC 7636: code_challenge must be 43-128 characters
    return /^[A-Za-z0-9\-._~]{43,128}$/.test(challenge);
  }

  static validateCodeVerifier(verifier: string): boolean {
    // RFC 7636: code_verifier must be 43-128 characters
    return /^[A-Za-z0-9\-._~]{43,128}$/.test(verifier);
  }
}

// Scope utilities
export class ScopeUtils {
  static parseScopes(scopeString?: string): string[] {
    if (!scopeString) return [];
    return scopeString.split(' ').filter(s => s.length > 0);
  }

  static formatScopes(scopes: string[]): string {
    return scopes.join(' ');
  }

  static async validateScopes(scopes: string[], client: Client): Promise<{ valid: boolean; invalidScopes: string[] }>;
  static validateScopes(requestedScopes: string[], allowedScopes: string[]): { valid: boolean; invalidScopes: string[] };
  static validateScopes(
    scopes: string[], 
    clientOrAllowedScopes: Client | string[]
  ): Promise<{ valid: boolean; invalidScopes: string[] }> | { valid: boolean; invalidScopes: string[] } {
    if (scopes.length === 0) {
      return { valid: true, invalidScopes: [] };
    }

    // If second parameter is a string array, it's the simple validation (used by client_credentials)
    if (Array.isArray(clientOrAllowedScopes)) {
      const invalidScopes = scopes.filter(scope => !clientOrAllowedScopes.includes(scope));
      return {
        valid: invalidScopes.length === 0,
        invalidScopes
      };
    }

    // Otherwise, it's a Client object and we need async validation (used by /authorize)
    const client = clientOrAllowedScopes as Client; // Type assertion
    
    // Return a Promise for the async case
    return (async () => {
      // Step 1: Check against client.allowedScopes
      let clientAllowedScopes: string[] = [];
      if (client.allowedScopes) {
        try {
          clientAllowedScopes = JSON.parse(client.allowedScopes as string);
          if (!Array.isArray(clientAllowedScopes)) clientAllowedScopes = [];
        } catch (e) {
          console.error("Failed to parse client.allowedScopes for client ID:", client.id, e);
          // If allowedScopes is malformed, treat as if no scopes are allowed for safety.
          clientAllowedScopes = [];
        }
      }

      const invalidAgainstClientAllowed = scopes.filter(scope => !clientAllowedScopes.includes(scope));
      if (invalidAgainstClientAllowed.length > 0) {
        return {
          valid: false,
          invalidScopes: invalidAgainstClientAllowed,
          error_description: `Requested scope(s) not allowed for this client: ${invalidAgainstClientAllowed.join(', ')}`
        };
      }

      // Step 2: Check if scopes exist globally and are active in the Scope table
      const validDbScopes = await prisma.scope.findMany({
        where: {
          name: { in: scopes }, // Only check scopes that were already allowed for the client
          isActive: true,
        },
      });
      const validScopeNamesFromDb = validDbScopes.map(s => s.name);
      const invalidOrInactiveScopes = scopes.filter(scope => !validScopeNamesFromDb.includes(scope));

      if (invalidOrInactiveScopes.length > 0) {
        return {
          valid: false,
          invalidScopes: invalidOrInactiveScopes,
          error_description: `Requested scope(s) are invalid or inactive: ${invalidOrInactiveScopes.join(', ')}`
        };
      }

      // Step 3: For public clients, ensure all requested (and now validated) scopes are also public
      if (client.isPublic) {
        const nonPublicScopes = validDbScopes.filter(dbScope => !dbScope.isPublic).map(s => s.name);
        if (nonPublicScopes.length > 0) {
          return {
            valid: false,
            invalidScopes: nonPublicScopes,
            error_description: `Public client requested non-public scope(s): ${nonPublicScopes.join(', ')}`
          };
        }
      }

      return { valid: true, invalidScopes: [] };
    })();
  }

  static hasScope(userScopes: string[], requiredScope: string): boolean {
    return userScopes.includes(requiredScope);
  }

  static hasAnyScope(userScopes: string[], requiredScopes: string[]): boolean {
    return requiredScopes.some(scope => userScopes.includes(scope));
  }

  static hasAllScopes(userScopes: string[], requiredScopes: string[]): boolean {
    return requiredScopes.every(scope => userScopes.includes(scope));
  }
}

// JWT utilities
export class JWTUtils {
  private static getSecret(): Uint8Array {
    const secret = process.env.JWT_ACCESS_TOKEN_SECRET;
    if (!secret) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('JWT_ACCESS_TOKEN_SECRET is not set in production environment');
      }
      // Default secret for development
      return new TextEncoder().encode('super-secret-key-for-hs256-oauth-dev-env-32-chars-for-dev-only');
    }
    return new TextEncoder().encode(secret);
  }

  private static getIssuer(): string {
    const issuer = process.env.JWT_ISSUER;
    if (!issuer) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('JWT_ISSUER is not set in production environment');
      }
      return `http://localhost:${process.env.PORT || 3000}`;
    }
    return issuer;
  }

  private static getAudience(): string {
    const audience = process.env.JWT_AUDIENCE;
    if (!audience) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('JWT_AUDIENCE is not set in production environment');
      }
      return 'api_resource_dev';
    }
    return audience;
  }

  static async createAccessToken(payload: {
    client_id: string;
    user_id?: string;
    scope?: string;
    permissions?: string[];
    exp?: string;
  }): Promise<string> {
    const jwtPayload = {
      client_id: payload.client_id,
      scope: payload.scope,
      permissions: payload.permissions || [],
      aud: this.getAudience(),
    };

    return await new jose.SignJWT(jwtPayload)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setIssuer(this.getIssuer())
      .setSubject(payload.user_id || payload.client_id)
      .setAudience(this.getAudience())
      .setExpirationTime(payload.exp || '1h')
      .setJti(crypto.randomUUID())
      .sign(this.getSecret());
  }

  static async verifyAccessToken(token: string): Promise<{
    valid: boolean;
    payload?: jose.JWTPayload;
    error?: string;
  }> {
    try {
      const { payload } = await jose.jwtVerify(token, this.getSecret(), {
        issuer: this.getIssuer(),
        audience: this.getAudience(),
      });

      return { valid: true, payload };
    } catch (error) {
      let errorMessage = 'Token verification failed';
      
      if (error instanceof jose.errors.JWTExpired) {
        errorMessage = 'Token has expired';
      } else if (error instanceof jose.errors.JWTInvalid) {
        errorMessage = 'Invalid token';
      } else if (error instanceof jose.errors.JWSSignatureVerificationFailed) {
        errorMessage = 'Invalid token signature';
      }

      return { valid: false, error: errorMessage };
    }
  }

  static async createRefreshToken(payload: {
    client_id: string;
    user_id?: string;
    scope?: string;
    exp?: string;
  }): Promise<string> {
    const jwtPayload = {
      client_id: payload.client_id,
      scope: payload.scope,
      token_type: 'refresh',
      aud: this.getAudience(),
    };

    return await new jose.SignJWT(jwtPayload)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setIssuer(this.getIssuer())
      .setSubject(payload.user_id || payload.client_id)
      .setAudience(this.getAudience())
      .setExpirationTime(payload.exp || '30d')
      .setJti(crypto.randomUUID())
      .sign(this.getSecret());
  }

  static async verifyRefreshToken(token: string): Promise<{
    valid: boolean;
    payload?: jose.JWTPayload;
    error?: string;
  }> {
    try {
      const { payload } = await jose.jwtVerify(token, this.getSecret(), {
        issuer: this.getIssuer(),
        audience: this.getAudience(),
      });

      // Check if this is actually a refresh token
      if (payload.token_type !== 'refresh') {
        return { valid: false, error: 'Invalid token type' };
      }

      return { valid: true, payload };
    } catch (error) {
      let errorMessage = 'Refresh token verification failed';
      
      if (error instanceof jose.errors.JWTExpired) {
        errorMessage = 'Refresh token has expired';
      } else if (error instanceof jose.errors.JWTInvalid) {
        errorMessage = 'Invalid refresh token';
      } else if (error instanceof jose.errors.JWSSignatureVerificationFailed) {
        errorMessage = 'Invalid refresh token signature';
      }

      return { valid: false, error: errorMessage };
    }
  }

  static async createIdToken(user: User, client: Client): Promise<string> {
    const jwtPayload = {
      email: user.email,
      email_verified: user.emailVerified,
      name: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
      given_name: user.firstName,
      family_name: user.lastName,
      preferred_username: user.username,
      aud: client.clientId,
    };

    return await new jose.SignJWT(jwtPayload)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setIssuer(this.getIssuer())
      .setSubject(user.id)
      .setAudience(client.clientId)
      .setExpirationTime('1h')
      .setJti(crypto.randomUUID())
      .sign(this.getSecret());
  }
}

// Client authentication utilities
export class ClientAuthUtils {
  static async authenticateClient(request: NextRequest, body: FormData): Promise<{
    client: Client | null;
    error?: OAuth2Error;
  }> {
    let client_id = body.get('client_id') as string;
    let client_secret = body.get('client_secret') as string;
    const client_assertion_type = body.get('client_assertion_type') as string;
    const client_assertion = body.get('client_assertion') as string;

    // Check for HTTP Basic Authentication first
    const authHeader = request.headers.get('authorization');
    if (authHeader && authHeader.startsWith('Basic ')) {
      try {
        const base64Credentials = authHeader.slice(6); // Remove 'Basic '
        const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
        const [basicClientId, basicClientSecret] = credentials.split(':');
        
        if (basicClientId && basicClientSecret) {
          // Use Basic auth credentials, but allow form data to override if present
          client_id = client_id || basicClientId;
          client_secret = client_secret || basicClientSecret;
        }
      } catch (error) {
        return {
          client: null,
          error: {
            error: OAuth2ErrorTypes.INVALID_CLIENT,
            error_description: 'Invalid Basic authentication format',
          },
        };
      }
    }

    // JWT Client Authentication (private_key_jwt)
    if (client_assertion_type === 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer' && client_assertion) {
      return await this.authenticateWithJWT(client_assertion, request);
    }

    // Client Secret Authentication (either from Basic auth or form data)
    if (client_id && client_secret) {
      return await this.authenticateWithSecret(client_id, client_secret);
    }

    // Public client (no authentication)
    if (client_id && !client_secret) {
      const client = await prisma.client.findUnique({
        where: { clientId: client_id, isActive: true },
      });

      if (!client) {
        return {
          client: null,
          error: {
            error: OAuth2ErrorTypes.INVALID_CLIENT,
            error_description: 'Client not found',
          },
        };
      }

      if (!client.isPublic) {
        return {
          client: null,
          error: {
            error: OAuth2ErrorTypes.INVALID_CLIENT,
            error_description: 'Client authentication required',
          },
        };
      }

      return { client };
    }

    return {
      client: null,
      error: {
        error: OAuth2ErrorTypes.INVALID_CLIENT,
        error_description: 'Client authentication required',
      },
    };
  }

  private static async authenticateWithSecret(clientId: string, clientSecret: string): Promise<{
    client: Client | null;
    error?: OAuth2Error;
  }> {
    const client = await prisma.client.findUnique({
      where: { clientId, isActive: true },
    });

    if (!client) {
      return {
        client: null,
        error: {
          error: OAuth2ErrorTypes.INVALID_CLIENT,
          error_description: 'Invalid client credentials',
        },
      };
    }

    // 对于公共客户端，不应该有密钥
    if (client.isPublic) {
      return {
        client: null,
        error: {
          error: OAuth2ErrorTypes.INVALID_CLIENT,
          error_description: 'Public client should not provide client_secret',
        },
      };
    }

    // 验证客户端密钥（使用bcrypt比较哈希值）
    if (!client.clientSecret) {
      return {
        client: null,
        error: {
          error: OAuth2ErrorTypes.INVALID_CLIENT,
          error_description: 'Client secret not configured',
        },
      };
    }

    try {
      const bcrypt = await import('bcrypt');
      const isValidSecret = await bcrypt.compare(clientSecret, client.clientSecret);
      
      if (!isValidSecret) {
        return {
          client: null,
          error: {
            error: OAuth2ErrorTypes.INVALID_CLIENT,
            error_description: 'Invalid client credentials',
          },
        };
      }
    } catch (error) {
      console.error('bcrypt comparison error:', error);
      return {
        client: null,
        error: {
          error: OAuth2ErrorTypes.INVALID_CLIENT,
          error_description: 'Client authentication failed',
        },
      };
    }

    // Check if client secret has expired
    if (client.clientSecretExpiresAt && client.clientSecretExpiresAt < new Date()) {
      return {
        client: null,
        error: {
          error: OAuth2ErrorTypes.INVALID_CLIENT,
          error_description: 'Client secret has expired',
        },
      };
    }

    return { client };
  }

  private static async authenticateWithJWT(assertion: string, request: NextRequest): Promise<{
    client: Client | null;
    error?: OAuth2Error;
  }> {
    try {
      const decodedJwt = jose.decodeJwt(assertion);
      
      if (!decodedJwt.iss || !decodedJwt.sub || decodedJwt.iss !== decodedJwt.sub) {
        return {
          client: null,
          error: {
            error: OAuth2ErrorTypes.INVALID_CLIENT,
            error_description: 'Invalid JWT: iss and sub claims are required and must match',
          },
        };
      }

      const clientId = decodedJwt.iss;
      const client = await prisma.client.findUnique({
        where: { clientId, isActive: true },
      });

      if (!client) {
        return {
          client: null,
          error: {
            error: OAuth2ErrorTypes.INVALID_CLIENT,
            error_description: 'Client not found',
          },
        };
      }

      if (!client.jwksUri) {
        return {
          client: null,
          error: {
            error: OAuth2ErrorTypes.INVALID_CLIENT,
            error_description: 'Client not configured for JWT assertion',
          },
        };
      }

      // Get token endpoint URL for audience validation
      const tokenEndpointUrl = this.getTokenEndpointUrl(request);
      const JWKS = jose.createRemoteJWKSet(new URL(client.jwksUri));

      await jose.jwtVerify(assertion, JWKS, {
        issuer: clientId,
        audience: tokenEndpointUrl,
        algorithms: ['RS256', 'ES256', 'PS256'],
      });

      return { client };
    } catch (error) {
      return {
        client: null,
        error: {
          error: OAuth2ErrorTypes.INVALID_CLIENT,
          error_description: 'Client assertion validation failed',
        },
      };
    }
  }

  private static getTokenEndpointUrl(request: NextRequest): string {
    const requestUrl = new URL(request.url);
    const protocol = request.headers.get('x-forwarded-proto') || requestUrl.protocol.slice(0, -1);
    const host = request.headers.get('x-forwarded-host') || requestUrl.host;
    return `${protocol}://${host}/api/oauth/token`;
  }
}

// Authorization utilities
export class AuthorizationUtils {
  static validateRedirectUri(redirectUri: string, registeredUris: string[]): boolean {
    return registeredUris.includes(redirectUri);
  }

  static validateResponseType(responseType: string, supportedTypes: string[] = ['code']): boolean {
    return supportedTypes.includes(responseType);
  }

  static generateState(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

  static generateNonce(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

  static generateAuthorizationCode(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  static async logAuditEvent(event: {
    userId?: string;
    clientId?: string;
    action: string;
    resource?: string;
    ipAddress?: string;
    userAgent?: string;
    success: boolean;
    errorMessage?: string;
    metadata?: Record<string, any>;
  }): Promise<void> {
    try {
      // Validate userId exists if provided
      let validUserId: string | null = null;
      if (event.userId) {
        const userExists = await prisma.user.findUnique({
          where: { id: event.userId },
          select: { id: true }
        });
        validUserId = userExists ? event.userId : null;
      }

      // Validate clientId exists if provided
      let validClientId: string | null = null;
      if (event.clientId) {
        const clientExists = await prisma.client.findUnique({
          where: { id: event.clientId },
          select: { id: true }
        });
        validClientId = clientExists ? event.clientId : null;
      }

      await prisma.auditLog.create({
        data: {
          userId: validUserId,
          clientId: validClientId,
          action: event.action,
          resource: event.resource || null,
          ipAddress: event.ipAddress || null,
          userAgent: event.userAgent || null,
          success: event.success,
          errorMessage: event.errorMessage || null,
          metadata: event.metadata ? JSON.stringify(event.metadata) : null,
        },
      });
    } catch (error) {
      console.error('Failed to log audit event:', error);
    }
  }

  static async getUserPermissions(userId: string): Promise<string[]> {
    if (!userId) {
      return [];
    }

    const userRoles = await prisma.userRole.findMany({
      where: {
        userId: userId,
        // Optional: Check if the UserRole assignment itself is active if such a field exists
        // user: { isActive: true }, // Ensure user is active (usually checked before calling this)
        role: { isActive: true }, // Ensure the role itself is active
        // Optional: Check UserRole.expiresAt if that feature is actively used
        // AND: [
        //   { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }
        // ],
      },
      include: {
        role: {
          include: {
            rolePermissions: {
              where: {
                // Optional: Check RolePermission.conditions if ABAC is used
                permission: { isActive: true }, // Ensure the permission itself is active
              },
              include: {
                permission: true, // Select the actual permission details
              },
            },
          },
        },
      },
    });

    const permissionsSet = new Set<string>();
    userRoles.forEach(userRole => {
      userRole.role.rolePermissions.forEach(rolePermission => {
        if (rolePermission.permission && rolePermission.permission.isActive) {
          // The permission name should be the canonical string like "order:read"
          permissionsSet.add(rolePermission.permission.name);
        }
      });
    });

    return Array.from(permissionsSet);
  }
}

// Rate limiting utilities
export class RateLimitUtils {
  private static requests = new Map<string, { count: number; resetTime: number }>();

  static isRateLimited(
    key: string,
    maxRequests: number = 100,
    windowMs: number = 60000 // 1 minute
  ): boolean {
    // Bypass rate limiting in test environment or for test IPs
    if (process.env.NODE_ENV === 'test' || 
        process.env.DISABLE_RATE_LIMITING === 'true' ||
        key.startsWith('test-') ||
        key.includes('192.168.') || 
        key.includes('127.0.0.1') ||
        key === 'unknown') {
      return false;
    }

    const now = Date.now();
    const record = this.requests.get(key);

    if (!record || now > record.resetTime) {
      this.requests.set(key, { count: 1, resetTime: now + windowMs });
      return false;
    }

    if (record.count >= maxRequests) {
      return true;
    }

    record.count++;
    return false;
  }

  static getRateLimitKey(request: NextRequest, type: 'client' | 'ip' = 'ip'): string {
    if (type === 'ip') {
      const ip = request.headers.get('x-forwarded-for') || 
                 request.headers.get('x-real-ip') || 
                 'unknown';
      
      // Add test prefix for test requests
      if (process.env.NODE_ENV === 'test') {
        return `test-${ip}`;
      }
      
      return ip;
    }
    
    // For client-based rate limiting, you'd extract client_id from the request
    return 'client-rate-limit';
  }

  // Method to clear rate limit cache (useful for testing)
  static clearCache(): void {
    this.requests.clear();
  }

  // Method to set a custom rate limit for testing
  static setTestRateLimit(key: string, count: number, resetTime: number): void {
    if (process.env.NODE_ENV === 'test') {
      this.requests.set(key, { count, resetTime });
    }
  }
} 
