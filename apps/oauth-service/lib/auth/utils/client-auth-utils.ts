import * as jose from 'jose';
import { NextRequest } from 'next/server';
import { prisma } from '@repo/database';
import { OAuth2Error, OAuth2ErrorCode, ConfigurationError } from '../../errors';
import type { OAuthClient as Client } from '@prisma/client';

/**
 * 客户端认证工具类 - 提供OAuth2客户端认证功能
 * Client authentication utility class - provides OAuth2 client authentication functions
 */
export class ClientAuthUtils {
  /**
   * 客户端认证主入口函数
   * Main entry function for client authentication
   * 
   * @param request - Next.js请求对象 (Next.js request object)
   * @param body - 表单数据 (Form data)
   * @returns 认证成功的客户端对象 (Authenticated client object)
   */
  static async authenticateClient(
    request: NextRequest,
    body: FormData
  ): Promise<Client> {
    let client_id = body.get('client_id') as string;
    let client_secret = body.get('client_secret') as string;
    const client_assertion_type = body.get('client_assertion_type') as string;
    const client_assertion = body.get('client_assertion') as string;

    // 检查Basic认证头 (Check Basic authentication header)
    const authHeader = request.headers.get('authorization');
    if (authHeader && authHeader.toLowerCase().startsWith('basic ')) {
      try {
        const base64Credentials = authHeader.slice(6);
        const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
        const [basicClientId, basicClientSecret] = credentials.split(':');

        if (basicClientId && basicClientSecret) {
          client_id = client_id || basicClientId;
          client_secret = client_secret || basicClientSecret;
        }
      } catch {
        throw new OAuth2Error(
          'Invalid Basic authentication header format.',
          OAuth2ErrorCode.InvalidClient,
          401
        );
      }
    }

    // JWT客户端断言认证 (JWT client assertion authentication)
    if (
      client_assertion_type === 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer' &&
      client_assertion
    ) {
      return await this.authenticateWithJWT(client_assertion, request);
    }

    // 客户端密钥认证 (Client secret authentication)
    if (client_id && client_secret) {
      return await this.authenticateWithSecret(client_id, client_secret);
    }

    // 公开客户端认证 (Public client authentication)
    if (client_id && !client_secret) {
      const client = await prisma.oAuthClient.findUnique({
        where: { clientId: client_id, isActive: true },
      });

      if (!client) {
        throw new OAuth2Error('Client not found.', OAuth2ErrorCode.InvalidClient, 401);
      }

      if (client.clientType !== 'PUBLIC') {
        throw new OAuth2Error(
          '客户端不是公开客户端，需要身份验证',
          OAuth2ErrorCode.InvalidClient,
          401
        );
      }
      return client;
    }

    throw new OAuth2Error(
      'Client authentication required but not provided or method not supported.',
      OAuth2ErrorCode.InvalidClient,
      401
    );
  }

  /**
   * 使用client_id和client_secret进行认证
   * Authenticate with client_id and client_secret
   * 
   * @param clientId - 客户端ID (Client ID)
   * @param clientSecret - 客户端密钥 (Client secret)
   * @returns 认证成功的客户端对象 (Authenticated client object)
   */
  private static async authenticateWithSecret(
    clientId: string,
    clientSecret: string
  ): Promise<Client> {
    const client = await prisma.oAuthClient.findUnique({
      where: { clientId, isActive: true },
    });

    if (!client) {
      throw new OAuth2Error(
        'Invalid client ID or client not active.',
        OAuth2ErrorCode.InvalidClient,
        401
      );
    }

    if (client.clientType === 'PUBLIC') {
      throw new OAuth2Error(
        '公开客户端试图使用密钥进行身份验证',
        OAuth2ErrorCode.InvalidClient,
        400
      );
    }

    if (!client.clientSecret) {
      console.error(`客户端 ${clientId} 在数据库中缺少客户端密钥`);
      throw new ConfigurationError('此客户端未配置客户端密钥');
    }

    try {
      const bcrypt = await import('bcrypt');
      const isValidSecret = await bcrypt.compare(clientSecret, client.clientSecret);

      if (!isValidSecret) {
        throw new OAuth2Error('客户端密钥无效', OAuth2ErrorCode.InvalidClient, 401);
      }
    } catch (error) {
      console.error('客户端密钥验证期间bcrypt.compare发生错误:', error);
      throw new ConfigurationError('客户端密钥验证期间发生错误');
    }

    return client;
  }

  /**
   * 使用JWT客户端断言进行认证
   * Authenticate with JWT client assertion
   * 
   * @param assertion - JWT断言字符串 (JWT assertion string)
   * @param request - Next.js请求对象 (Next.js request object)
   * @returns 认证成功的客户端对象 (Authenticated client object)
   */
  private static async authenticateWithJWT(
    assertion: string,
    request: NextRequest
  ): Promise<Client> {
    try {
      const decodedJwt = jose.decodeJwt(assertion);

      if (!decodedJwt.iss || !decodedJwt.sub || decodedJwt.iss !== decodedJwt.sub) {
        throw new OAuth2Error(
          'Invalid JWT assertion: iss and sub claims are required and must be identical (client_id).',
          OAuth2ErrorCode.InvalidClient,
          400
        );
      }

      const clientId = decodedJwt.iss as string;
      const client = await prisma.oAuthClient.findUnique({
        where: { clientId, isActive: true },
      });

      if (!client) {
        throw new OAuth2Error(
          'Client specified in JWT assertion not found or not active.',
          OAuth2ErrorCode.InvalidClient,
          401
        );
      }

      if (!client.jwksUri) {
        throw new ConfigurationError(
          'Client is not configured for JWT assertion-based authentication (missing jwks_uri).',
          { missingJwksUri: true }
        );
      }

      const tokenEndpointUrl = this.getTokenEndpointUrl(request);
      const JWKS = jose.createRemoteJWKSet(new URL(client.jwksUri));

      await jose.jwtVerify(assertion, JWKS, {
        issuer: clientId,
        audience: tokenEndpointUrl,
        algorithms: ['RS256', 'ES256', 'PS256'],
      });

      return client;
    } catch (error: any) {
      console.error('Client JWT assertion validation failed:', error);
      let errorDescription = 'Client assertion validation failed.';
      let oauthErrorCode = OAuth2ErrorCode.InvalidClient;

      if (error instanceof jose.errors.JWTExpired) {
        errorDescription = 'Client assertion has expired.';
        oauthErrorCode = OAuth2ErrorCode.InvalidGrant; // Per RFC7521, expired JWT assertion can be invalid_grant
      } else if (error instanceof jose.errors.JWTClaimValidationFailed) {
        errorDescription = `Client assertion claim validation failed: ${error.claim} ${error.reason}.`;
      } else if (error instanceof jose.errors.JWSSignatureVerificationFailed) {
        errorDescription = 'Client assertion signature verification failed.';
      } else if (error instanceof ConfigurationError) {
        // 从内部抛出的ConfigurationError (Re-throw ConfigurationError from inside)
        throw error;
      }

      throw new OAuth2Error(
        errorDescription,
        oauthErrorCode,
        400,
        undefined,
        { originalError: error.message }
      );
    }
  }

  /**
   * 获取当前请求的令牌端点URL
   * Get the token endpoint URL for the current request
   * 
   * @param request - Next.js请求对象 (Next.js request object)
   * @returns 令牌端点URL (Token endpoint URL)
   */
  private static getTokenEndpointUrl(request: NextRequest): string {
    const requestUrl = new URL(request.url);
    const protocol = request.headers.get('x-forwarded-proto') || requestUrl.protocol.slice(0, -1);
    const host = request.headers.get('x-forwarded-host') || requestUrl.host;
    const path = process.env.OAUTH_TOKEN_ENDPOINT_PATH || '/api/v2/oauth/token';
    return `${protocol}://${host}${path}`;
  }
} 