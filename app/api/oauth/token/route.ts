// app/api/oauth/token/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient, Client } from '@/lib/generated/prisma'; // Import Client type
import crypto from 'crypto';
import { addHours, addDays, differenceInSeconds, isPast } from 'date-fns';
import * as jose from 'jose';
import logger from '@/utils/logger'; // Assuming logger is available

const prisma = new PrismaClient();

// Helper function to construct the token endpoint URL
function getTokenEndpointUrl(request: NextRequest): string {
  const requestUrl = new URL(request.url);
  // Prefer X-Forwarded-Proto and X-Forwarded-Host if behind a proxy
  const protocol = request.headers.get('x-forwarded-proto') || requestUrl.protocol.slice(0, -1);
  const host = request.headers.get('x-forwarded-host') || requestUrl.host;
  return `${protocol}://${host}/api/oauth/token`;
}


export async function POST(request: NextRequest) {
  let body;
  try {
    body = await request.formData();
  } catch (error) {
    console.error("Error parsing form data:", error);
    return NextResponse.json({ error: 'invalid_request', error_description: 'Failed to parse request body. Ensure it is application/x-www-form-urlencoded.' }, { status: 400 });
  }

  const grant_type = body.get('grant_type') as string | null;
  const code = body.get('code') as string | null;
  const redirect_uri = body.get('redirect_uri') as string | null;
  
  // Client Authentication parameters
  const client_id_param = body.get('client_id') as string | null; // For client_secret_basic/post
  const client_secret = body.get('client_secret') as string | null; // For client_secret_basic/post
  const client_assertion_type = body.get('client_assertion_type') as string | null;
  const client_assertion = body.get('client_assertion') as string | null;

  let authenticatedClient: Client | null = null;
  let clientIdForTokenProcessing: string | null = null;

  // Validate grant_type first
  if (grant_type !== 'authorization_code') {
    logger.warn(`Token request failed: Unsupported grant_type: ${grant_type}`);
    return NextResponse.json({ error: 'unsupported_grant_type', error_description: 'Grant type must be "authorization_code"' }, { status: 400 });
  }
  
  // Client Authentication Logic
  if (client_assertion_type === 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer' && client_assertion) {
    logger.info('Attempting client authentication with private_key_jwt');
    try {
      const decodedJwt = jose.decodeJwt(client_assertion);
      if (!decodedJwt.iss || !decodedJwt.sub || decodedJwt.iss !== decodedJwt.sub) {
        logger.warn('private_key_jwt: iss or sub claim missing or mismatched.', { iss: decodedJwt.iss, sub: decodedJwt.sub });
        return NextResponse.json({ error: 'invalid_client', error_description: 'Invalid JWT: iss and sub claims are required and must match.' }, { status: 401 });
      }
      const clientIdFromJwt = decodedJwt.iss;
      clientIdForTokenProcessing = clientIdFromJwt;

      const client = await prisma.client.findUnique({ where: { id: clientIdFromJwt } });
      if (!client) {
        logger.warn(`private_key_jwt: Client ${clientIdFromJwt} not found.`);
        return NextResponse.json({ error: 'invalid_client', error_description: 'Client not found.' }, { status: 401 });
      }
      if (!client.jwksUri) {
        logger.warn(`private_key_jwt: Client ${clientIdFromJwt} does not have a jwksUri configured.`);
        return NextResponse.json({ error: 'invalid_client', error_description: 'Client not configured for JWT assertion: Missing jwksUri.' }, { status: 401 });
      }

      const tokenEndpointUrl = getTokenEndpointUrl(request);
      const JWKS = jose.createRemoteJWKSet(new URL(client.jwksUri));

      const { payload } = await jose.jwtVerify(client_assertion, JWKS, {
        issuer: clientIdFromJwt,
        audience: tokenEndpointUrl,
        algorithms: ['RS256', 'ES256', 'PS256'], // Add more as needed, ensure they match what clients might use
      });

      // Additional check for 'sub' claim although 'iss' is primary for client identification in this context
      if (payload.sub !== clientIdFromJwt) {
        logger.warn(`private_key_jwt: sub claim (${payload.sub}) does not match issuer/client_id (${clientIdFromJwt}).`);
        return NextResponse.json({ error: 'invalid_client', error_description: 'Invalid JWT: sub claim does not match client_id.' }, { status: 401 });
      }
      
      // TODO: JTI replay protection (future enhancement)
      // if (payload.jti) { ... }

      authenticatedClient = client;
      logger.info(`Client ${clientIdFromJwt} authenticated successfully using private_key_jwt.`);

    } catch (error: any) {
      logger.error('private_key_jwt: JWT validation failed.', { errorName: error.name, errorMessage: error.message, code: error.code });
      if (error instanceof jose.errors.JOSEError) {
         if (error.code === 'ERR_JWKS_NO_MATCHING_KEY' || error.code === 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED') {
            return NextResponse.json({ error: 'invalid_client', error_description: 'Invalid signature or no matching key found for client assertion.' }, { status: 401 });
         }
         if (error.code === 'ERR_JWT_EXPIRED') {
            return NextResponse.json({ error: 'invalid_client', error_description: 'Client assertion has expired.' }, { status: 401 });
         }
         if (error.code === 'ERR_JWT_INVALID_AUDIENCE' || error.code === 'ERR_JWT_INVALID_ISSUER') {
             return NextResponse.json({ error: 'invalid_client', error_description: `Invalid JWT: ${error.message}` }, { status: 401 });
         }
      }
      return NextResponse.json({ error: 'invalid_client', error_description: 'Client assertion validation failed.' }, { status: 401 });
    }
  } else if (client_id_param && client_secret) {
    logger.info(`Attempting client authentication with client_secret for client_id: ${client_id_param}`);
    clientIdForTokenProcessing = client_id_param;
    const client = await prisma.client.findUnique({
      where: { id: client_id_param },
    });

    if (!client || client.secret !== client_secret) {
      logger.warn(`Client secret authentication failed for client_id: ${client_id_param}.`);
      return NextResponse.json({ error: 'invalid_client', error_description: 'Invalid client_id or client_secret' }, { status: 401 });
    }
    authenticatedClient = client;
    logger.info(`Client ${client_id_param} authenticated successfully using client_secret.`);
  } else {
    logger.warn('Token request failed: Missing client authentication credentials.');
    return NextResponse.json({ error: 'invalid_client', error_description: 'Client authentication required.' }, { status: 401 });
  }

  // Proceed with token issuance if client authentication was successful
  // Ensure all required parameters for the grant type are present
  if (!code || !redirect_uri || !clientIdForTokenProcessing) { // client_id_param is now clientIdForTokenProcessing
    logger.warn('Token request failed: Missing required parameters after client auth.', { code: !!code, redirect_uri: !!redirect_uri, clientId: !!clientIdForTokenProcessing });
    return NextResponse.json({ error: 'invalid_request', error_description: 'Missing required parameters: code, redirect_uri, client_id (derived from auth)' }, { status: 400 });
  }

  try {
    // At this point, authenticatedClient is set if authentication was successful
    if (!authenticatedClient) {
        // This should ideally not be reached if logic above is correct
        logger.error("Critical: authenticatedClient is null after client auth block.");
        return NextResponse.json({ error: 'server_error', error_description: 'Client authentication failed unexpectedly.' }, { status: 500 });
    }

    // Validate Authorization Code
    const authCode = await prisma.authorizationCode.findUnique({
      where: { code: code }, // code is from the request body
    });

    if (!authCode) {
      logger.warn(`Invalid grant: Authorization code not found for code: ${code}`);
      return NextResponse.json({ error: 'invalid_grant', error_description: 'Authorization code not found.' }, { status: 400 });
    }

    if (isPast(new Date(authCode.expiresAt))) {
      logger.warn(`Invalid grant: Expired authorization code used: ${code}`);
      // As per RFC 6749, if the authorization code is expired, it should be deleted.
      await prisma.authorizationCode.delete({ where: { id: authCode.id }});
      return NextResponse.json({ error: 'invalid_grant', error_description: 'Authorization code has expired.' }, { status: 400 });
    }

    if (authCode.clientId !== clientIdForTokenProcessing) { // Compare with the authenticated client's ID
      logger.warn(`Invalid grant: Auth code client ID (${authCode.clientId}) does not match authenticated client ID (${clientIdForTokenProcessing}).`);
      return NextResponse.json({ error: 'invalid_grant', error_description: 'Authorization code was not issued to this client.' }, { status: 400 });
    }

    if (authCode.redirectUri !== redirect_uri) { // redirect_uri from request body
      logger.warn(`Invalid grant: Auth code redirect URI (${authCode.redirectUri}) does not match request redirect_uri (${redirect_uri}).`);
      return NextResponse.json({ error: 'invalid_grant', error_description: 'Invalid redirect_uri. It must match the one used in the authorization request.' }, { status: 400 });
    }
    
    // --- JWT Access Token Generation ---
    const jwtSecret = new TextEncoder().encode(process.env.JWT_ACCESS_TOKEN_SECRET || 'super-secret-key-for-hs256-oauth-dev-env-32-chars'); // Use env var in prod
    const jwtAlg = 'HS256';
    const jwtIssuer = process.env.JWT_ISSUER || `https://${request.headers.get('host') || 'localhost:3000'}`; // Dynamically get issuer or default
    const jwtAudience = process.env.JWT_AUDIENCE || 'api_resource'; // Default audience
    const accessTokenExpiresIn = '1h'; // Access token lifetime
    const accessTokenExpiresAt = addHours(new Date(), 1);

    let permissionsClaim: string[] = [];
    if (authCode.userId) {
      const userPermissions = await prisma.userResourcePermission.findMany({
        where: { userId: authCode.userId },
        include: {
          resource: true,
          permission: true,
        },
      });
      permissionsClaim = userPermissions.map(urp => `${urp.resource.name}:${urp.permission.name}`);
      logger.info(`Fetched ${permissionsClaim.length} permissions for user ${authCode.userId} for JWT.`);
    } else {
      logger.info(`No userId found on authCode ${authCode.id}, no permissions to fetch for JWT.`);
    }

    const accessTokenJwt = await new jose.SignJWT({
        client_id: authenticatedClient.id,
        scope: authCode.scope, // Include original scope
        permissions: permissionsClaim, // Custom permissions claim
      })
      .setProtectedHeader({ alg: jwtAlg })
      .setIssuedAt()
      .setIssuer(jwtIssuer)
      .setSubject(authCode.userId || authenticatedClient.id) // Subject is user if available, else client_id for client-only grants (not this flow though)
      .setAudience(jwtAudience)
      .setExpirationTime(accessTokenExpiresIn)
      .setJti(crypto.randomUUID())
      .sign(jwtSecret);

    // 5. Issue Tokens (Refresh Token remains opaque)
    const refreshToken = crypto.randomBytes(32).toString('hex');
    const refreshTokenExpiresAt = addDays(new Date(), 30); // Refresh token expires in 30 days

    // 6. Store Tokens (AccessToken now stores the JWT)
    await prisma.accessToken.create({
      data: {
        token: accessTokenJwt, // Store the JWT
        expiresAt: accessTokenExpiresAt,
        userId: authCode.userId,
        clientId: authenticatedClient.id,
        scope: authCode.scope,
      },
    });

    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        expiresAt: refreshTokenExpiresAt,
        userId: authCode.userId,
        clientId: authenticatedClient.id,
      },
    });

    // 7. Invalidate Authorization Code
    await prisma.authorizationCode.delete({
      where: { id: authCode.id },
    });

    // 8. Construct Response
    logger.info(`JWT Access Token and Refresh Token issued successfully for client ${clientIdForTokenProcessing}.`);
    return NextResponse.json({
      access_token: accessTokenJwt,
      token_type: 'Bearer',
      expires_in: differenceInSeconds(accessTokenExpiresAt, new Date()),
      refresh_token: refreshToken,
      scope: authCode.scope,
    });

  } catch (error: any) {
    logger.error(`Error during token issuance for client ${clientIdForTokenProcessing || 'unknown'}:`, { error });
    // Check for specific Prisma errors if needed, otherwise return a generic server error.
    return NextResponse.json({ error: 'server_error', error_description: 'An unexpected error occurred.' }, { status: 500 });
  }
}
