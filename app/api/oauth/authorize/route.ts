// app/api/oauth/authorize/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@/lib/generated/prisma';
import crypto from 'crypto';
import { addMinutes } from 'date-fns';

const prisma = new PrismaClient();

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const client_id = searchParams.get('client_id');
  const redirect_uri = searchParams.get('redirect_uri');
  const response_type = searchParams.get('response_type');
  const scope = searchParams.get('scope');
  const state = searchParams.get('state');
  const code_challenge = searchParams.get('code_challenge');
  const code_challenge_method = searchParams.get('code_challenge_method');

  // Basic parameter validation
  if (!client_id || !redirect_uri || !response_type) {
    return NextResponse.json({ error: 'invalid_request', error_description: 'Missing required parameters: client_id, redirect_uri, response_type' }, { status: 400 });
  }

  if (response_type !== 'code') {
    return NextResponse.json({ error: 'unsupported_response_type', error_description: 'Response type must be "code"' }, { status: 400 });
  }

  try {
    const client = await prisma.client.findUnique({
      where: { id: client_id },
    });

    if (!client) {
      return NextResponse.json({ error: 'unauthorized_client', error_description: 'Invalid client_id' }, { status: 400 });
    }

    const registeredRedirectUris = client.redirectUris.split(',');
    if (!registeredRedirectUris.includes(redirect_uri)) {
      return NextResponse.json({ error: 'invalid_request', error_description: 'Invalid redirect_uri' }, { status: 400 });
    }

    // TODO: User Authentication (Placeholder)
    // For now, assume a logged-in user with a hardcoded userId
    const userId = "test-user-id"; // Hardcoded user ID

    // If no user is "logged in", redirect to login page
    // This part will be expanded later. For now, we assume user is logged in.
    // if (!userId) {
    //   const loginUrl = new URL('/login', request.url);
    //   loginUrl.searchParams.set('redirect_uri', redirect_uri);
    //   loginUrl.searchParams.set('client_id', client_id);
    //   loginUrl.searchParams.set('response_type', response_type);
    //   if (scope) loginUrl.searchParams.set('scope', scope);
    //   if (state) loginUrl.searchParams.set('state', state);
    //   return NextResponse.redirect(loginUrl.toString());
    // }

    // PKCE Validation
    let pkceData: { codeChallenge?: string; codeChallengeMethod?: string } = {};
    if (code_challenge) {
      if (!code_challenge_method) {
        return NextResponse.json({ error: 'invalid_request', error_description: 'code_challenge_method is required when code_challenge is provided' }, { status: 400 });
      }
      if (code_challenge_method !== 'S256') {
        return NextResponse.json({ error: 'invalid_request', error_description: 'code_challenge_method must be S256' }, { status: 400 });
      }
      // Basic validation for code_challenge (RFC 7636: 43-128 chars, unreserved characters)
      // This is a simplified check; a more robust regex might be needed.
      if (!/^[A-Za-z0-9-._~]{43,128}$/.test(code_challenge)) {
        return NextResponse.json({ error: 'invalid_request', error_description: 'Invalid code_challenge format.' }, { status: 400 });
      }
      pkceData = { codeChallenge: code_challenge, codeChallengeMethod: code_challenge_method };
    } else if (code_challenge_method) {
      // code_challenge_method is present but code_challenge is not
      return NextResponse.json({ error: 'invalid_request', error_description: 'code_challenge must be provided if code_challenge_method is present' }, { status: 400 });
    }
    // If code_challenge is not provided, pkceData remains empty, and fields will be null in DB.

    // Generate Authorization Code
    const authorizationCodeValue = crypto.randomBytes(32).toString('hex');
    const expiresAt = addMinutes(new Date(), 10); // Code expires in 10 minutes

    // Store Authorization Code
    await prisma.authorizationCode.create({
      data: {
        code: authorizationCodeValue,
        expiresAt: expiresAt,
        redirectUri: redirect_uri,
        clientId: client_id,
        userId: userId, // Use the hardcoded userId
        scope: scope,
        ...pkceData, // Add PKCE fields
      },
    });

    // Redirect to Client
    const redirectUrl = new URL(redirect_uri);
    redirectUrl.searchParams.set('code', authorizationCodeValue);
    if (state) {
      redirectUrl.searchParams.set('state', state);
    }

    return NextResponse.redirect(redirectUrl.toString());

  } catch (error: any) { // Explicitly type error as any or a more specific error type
    console.error("Error during authorization:", error);
    // It's good practice to check if the error is a Prisma error or something else
    // to provide more specific error messages if needed.
    // For now, a generic server error is returned.
    return NextResponse.json({ error: 'server_error', error_description: 'An unexpected error occurred.' }, { status: 500 });
  }
}
