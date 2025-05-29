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

  static async validateScopes(scopes: string[], client: Client): Promise<{ valid: boolean; invalidScopes: string[] }> {
    if (scopes.length === 0) {
      return { valid: true, invalidScopes: [] };
    }

    // Check if scopes exist in database
    const validDbScopes = await prisma.scope.findMany({
      where: {
        name: { in: scopes },
        isActive: true,
      },
    });

    const validScopeNames = validDbScopes.map(s => s.name);
    const invalidScopes = scopes.filter(scope => !validScopeNames.includes(scope));

    // Check if client is allowed to use these scopes
    if (!client.isPublic) {
      // Private clients can use any valid scope
      return { valid: invalidScopes.length === 0, invalidScopes };
    } else {
      // Public clients can only use public scopes
      const publicScopes = validDbScopes.filter(s => s.isPublic).map(s => s.name);
      const restrictedScopes = scopes.filter(scope => !publicScopes.includes(scope));
      
      return { 
        valid: invalidScopes.length === 0 && restrictedScopes.length === 0, 
        invalidScopes: [...invalidScopes, ...restrictedScopes] 
      };
    }
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
  private static getSecret(): TextEncoder {
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

  static async createIdToken(user: User, client: Client, nonce?: string): Promise<string> {
    const payload = {
      aud: client.clientId,
      email: user.email,
      email_verified: user.emailVerified,
      name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username,
      preferred_username: user.username,
      updated_at: Math.floor(user.updatedAt.getTime() / 1000),
    };

    const jwt = new jose.SignJWT(payload)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setIssuer(this.getIssuer())
      .setSubject(user.id)
      .setAudience(client.clientId)
      .setExpirationTime('1h');

    if (nonce) {
      jwt.claim('nonce', nonce);
    }

    return await jwt.sign(this.getSecret());
  }
}

// Client authentication utilities
export class ClientAuthUtils {
  static async authenticateClient(request: NextRequest, body: FormData): Promise<{
    client: Client | null;
    error?: OAuth2Error;
  }> {
    const client_id = body.get('client_id') as string;
    const client_secret = body.get('client_secret') as string;
    const client_assertion_type = body.get('client_assertion_type') as string;
    const client_assertion = body.get('client_assertion') as string;

    // JWT Client Authentication (private_key_jwt)
    if (client_assertion_type === 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer' && client_assertion) {
      return await this.authenticateWithJWT(client_assertion, request);
    }

    // Client Secret Authentication
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

    if (!client || client.clientSecret !== clientSecret) {
      return {
        client: null,
        error: {
          error: OAuth2ErrorTypes.INVALID_CLIENT,
          error_description: 'Invalid client credentials',
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
    await prisma.auditLog.create({
      data: {
        userId: event.userId,
        clientId: event.clientId,
        action: event.action,
        resource: event.resource,
        ipAddress: event.ipAddress,
        userAgent: event.userAgent,
        success: event.success,
        errorMessage: event.errorMessage,
        metadata: event.metadata ? JSON.stringify(event.metadata) : undefined,
      },
    });
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
      return request.headers.get('x-forwarded-for') || 
             request.headers.get('x-real-ip') || 
             'unknown';
    }
    
    // For client-based rate limiting, you'd extract client_id from the request
    return 'client-rate-limit';
  }
} 