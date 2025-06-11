import { NextRequest, NextResponse } from 'next/server';

import { User, Client, AccessToken, RefreshToken } from '@prisma/client';
import * as bcrypt from 'bcrypt';

import { JWTUtils, ClientAuthUtils, AuthorizationUtils, OAuth2ErrorTypes } from '@/lib/auth/oauth2';
import { prisma } from '@/lib/prisma';

const SALT_ROUNDS = 10; // Should be consistent if used, though not directly for token introspection logic itself

interface IntrospectionResponse {
  active: boolean;
  scope?: string;
  client_id?: string;
  username?: string; // Typically from user associated with token
  token_type?: 'access_token' | 'refresh_token'; // Not standard, but can be useful
  exp?: number; // Expiration Unix timestamp
  iat?: number; // Issued at Unix timestamp
  nbf?: number; // Not before Unix timestamp
  sub?: string; // Subject (user_id or client_id)
  aud?: string | string[]; // Audience
  iss?: string; // Issuer
  jti?: string; // JWT ID
}

async function authenticateIntrospectingClient(request: NextRequest): Promise<Client | null> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.toLowerCase().startsWith('basic ')) {
    return null;
  }

  try {
    const base64Credentials = authHeader.slice(6); // Remove 'Basic '
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
    const [clientId, clientSecret] = credentials.split(':');

    if (!clientId || !clientSecret) {
      return null;
    }

    const client = await prisma.client.findUnique({
      where: { clientId: clientId, isActive: true },
    });

    if (!client || client.isPublic || !client.clientSecret) {
      // Must be a confidential client with a secret
      return null;
    }

    const isValidSecret = await bcrypt.compare(clientSecret, client.clientSecret);
    if (!isValidSecret) {
      return null;
    }
    return client;
  } catch (error) {
    console.error("Error during introspecting client authentication:", error);
    return null;
  }
}

function buildIntrospectionResponse(
  tokenData: AccessToken | RefreshToken,
  jwtPayload: any,
  isActive: boolean,
  tokenType: 'access_token' | 'refresh_token'
): IntrospectionResponse {
  if (!isActive || !jwtPayload) {
    return { active: false };
  }

  const response: IntrospectionResponse = {
    active: true,
    scope: jwtPayload.scope,
    client_id: jwtPayload.client_id, // client_id of the token owner
    sub: jwtPayload.sub,
    exp: jwtPayload.exp,
    iat: jwtPayload.iat,
    nbf: jwtPayload.nbf,
    iss: jwtPayload.iss,
    aud: jwtPayload.aud,
    jti: jwtPayload.jti,
    token_type: tokenType,
  };

  // Add username if user_id is present in subject (for user-bound tokens)
  // This part might need adjustment based on how 'sub' and 'username' are structured
  if (jwtPayload.sub && tokenData.userId && tokenType === 'access_token') {
     // Assuming we might fetch the user if username is needed and not in JWT
     // For now, if jwtPayload has username, use it.
     if (jwtPayload.username) {
        response.username = jwtPayload.username;
     } else if ((tokenData as AccessToken).user?.username) { // If user was included in tokenData
        response.username = (tokenData as AccessToken).user.username;
     }
  }

  return response;
}


export async function POST(request: NextRequest) {
  const introspectingClient = await authenticateIntrospectingClient(request);
  const requestBaseUrl = request.nextUrl.origin; // For constructing issuer/audience if needed

  if (!introspectingClient) {
    await AuthorizationUtils.logAuditEvent({
      action: 'token_introspection_unauthorized_client',
      ipAddress: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
      success: false,
      errorMessage: 'Introspecting client authentication failed.',
    });
    return NextResponse.json({ error: 'Unauthorized client' }, { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="token introspection"' }});
  }

  let tokenValue: string | null = null;
  let tokenTypeHint: string | null = null;

  // RFC 7662 specifies application/x-www-form-urlencoded
  const contentType = request.headers.get('content-type');
  if (contentType === 'application/x-www-form-urlencoded') {
    const formData = await request.formData();
    tokenValue = formData.get('token') as string | null;
    tokenTypeHint = formData.get('token_type_hint') as string | null;
  } else {
     await AuthorizationUtils.logAuditEvent({
      clientId: introspectingClient.id,
      action: 'token_introspection_invalid_request_content_type',
      ipAddress: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
      success: false,
      errorMessage: 'Invalid content type. Expected application/x-www-form-urlencoded.',
      metadata: { receivedContentType: contentType }
    });
    return NextResponse.json({ error: 'Invalid content_type', error_description: 'Content-Type must be application/x-www-form-urlencoded.' }, { status: 400 });
  }


  if (!tokenValue) {
    await AuthorizationUtils.logAuditEvent({
      clientId: introspectingClient.id,
      action: 'token_introspection_missing_token',
      ipAddress: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
      success: false,
      errorMessage: 'Token parameter was missing from the request.',
    });
    return NextResponse.json({ error: OAuth2ErrorTypes.INVALID_REQUEST, error_description: 'Token parameter is required.' }, { status: 400 });
  }

  let responseData: IntrospectionResponse = { active: false };
  let tokenProcessed = false;

  // Try as Access Token
  if (!tokenTypeHint || tokenTypeHint === 'access_token') {
    const { valid, payload, error } = await JWTUtils.verifyAccessToken(tokenValue);
    if (valid && payload && payload.jti) {
      const dbToken = await prisma.accessToken.findFirst({
        where: {
          jti: payload.jti,
          // token: tokenValue, // Using JTI is better if tokens are hashed in DB, but JWTUtils verifies signature
          clientId: payload.client_id as string, // Ensure client_id from JWT matches
          revoked: false,
          expiresAt: { gt: new Date() }
        },
        include: { user: { select: { username: true } } } // Include username if available
      });

      if (dbToken) {
        responseData = buildIntrospectionResponse(dbToken, payload, true, 'access_token');
        tokenProcessed = true;
      } else if (error) {
        // Log JWT verification error if needed, but active:false is the main outcome
        console.debug(`Access token JWT verification failed or DB lookup failed: ${error}`);
      }
    }
  }

  // Try as Refresh Token if not processed and hint allows or is not specific
  if (!tokenProcessed && (!tokenTypeHint || tokenTypeHint === 'refresh_token')) {
    const { valid, payload, error } = await JWTUtils.verifyRefreshToken(tokenValue);
    if (valid && payload && payload.jti) {
      const dbToken = await prisma.refreshToken.findFirst({
        where: {
          jti: payload.jti,
          clientId: payload.client_id as string,
          revoked: false,
          expiresAt: { gt: new Date() }
        },
         include: { user: { select: { username: true } } }
      });
      if (dbToken) {
        // For refresh tokens, typically less info is exposed.
        // The `buildIntrospectionResponse` can be adjusted or a separate one made if needed.
        responseData = buildIntrospectionResponse(dbToken, payload, true, 'refresh_token');
        tokenProcessed = true;
      } else if (error) {
         console.debug(`Refresh token JWT verification failed or DB lookup failed: ${error}`);
      }
    }
  }

  await AuthorizationUtils.logAuditEvent({
    clientId: introspectingClient.id,
    action: 'token_introspection_attempt',
    ipAddress: request.headers.get('x-forwarded-for') || undefined,
    userAgent: request.headers.get('user-agent') || undefined,
    success: true, // The introspection call itself was successful
    metadata: {
      token_type_hint: tokenTypeHint,
      token_active: responseData.active,
      introspected_token_client_id: responseData.client_id,
      introspected_token_sub: responseData.sub,
    }
  });

  return NextResponse.json(responseData, { headers: { 'Content-Type': 'application/json' }});
}
