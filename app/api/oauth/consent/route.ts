import { NextRequest, NextResponse } from 'next/server';

import { AuthorizationUtils, OAuth2ErrorTypes, ScopeUtils } from '@/lib/auth/oauth2';
import { validateSession } from '@/lib/auth/session'; // To validate user's current session
import { prisma } from '@/lib/prisma';

interface ConsentFormData {
  decision?: 'approve' | 'deny';
  client_id: string;
  redirect_uri: string;
  scope: string; // Original requested scopes string
  state?: string;
  code_challenge?: string;
  code_challenge_method?: string;
  nonce?: string;
  // Potentially other original OAuth params if needed
}

export async function POST(request: NextRequest) {
  const ipAddress = request.headers.get('x-forwarded-for') || undefined;
  const userAgent = request.headers.get('user-agent') || undefined;

  // 1. Validate user session
  const sessionContext = await validateSession(request);
  if (!sessionContext) {
    // This should ideally not happen if the consent page requires login.
    // Redirect to login or show an error.
    // For simplicity, returning an error. A redirect to login with return URL might be better.
    return NextResponse.json({ error: 'User session invalid or expired. Please login again.' }, { status: 401 });
  }
  const { user } = sessionContext;

  // 2. Parse form data
  let formData: ConsentFormData;
  try {
    const rawFormData = await request.formData();
    formData = Object.fromEntries(rawFormData.entries()) as unknown as ConsentFormData;
  } catch (e) {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const {
    decision,
    client_id,
    redirect_uri,
    scope: requestedScopeString,
    state,
    code_challenge,
    code_challenge_method,
    nonce
  } = formData;

  if (!decision || !client_id || !redirect_uri || !requestedScopeString) {
    return NextResponse.json({ error: 'Missing required form fields (decision, client_id, redirect_uri, scope).' }, { status: 400 });
  }

  // Fetch the OAuth client to get its actual DB ID (if client_id from form is the string identifier)
  // and to validate redirect_uri
  const oauthClient = await prisma.oAuthClient.findUnique({ where: { clientId: client_id } });
  if (!oauthClient) {
    // Log this attempt, client_id might be tampered with
    await AuthorizationUtils.logAuditEvent({
        userId: user.id,
        action: 'consent_decision_invalid_client',
        ipAddress, userAgent, success: false,
        errorMessage: `Consent decision for unknown client_id: ${client_id}`,
    });
    return NextResponse.json({ error: 'Invalid client_id' }, { status: 400 });
  }

  // Basic validation of redirect_uri against registered ones (simplified)
  const registeredUris = JSON.parse(oauthClient.redirectUris || '[]');
  if (!registeredUris.includes(redirect_uri)) {
     await AuthorizationUtils.logAuditEvent({
        userId: user.id, clientId: oauthClient.id,
        action: 'consent_decision_invalid_redirect_uri',
        ipAddress, userAgent, success: false,
        errorMessage: `Consent decision with invalid redirect_uri: ${redirect_uri}`,
    });
    return NextResponse.json({ error: 'Invalid redirect_uri' }, { status: 400 });
  }


  if (decision === 'approve') {
    const approvedScopes = ScopeUtils.parseScopes(requestedScopeString); // Use the originally requested scopes

    // Store/update consent grant
    await prisma.consentGrant.upsert({
      where: {
        userId_clientId: { userId: user.id, clientId: oauthClient.id }
      },
      update: {
        scopes: JSON.stringify(approvedScopes),
        issuedAt: new Date(),
        expiresAt: null, // Or set an expiration policy, e.g., 1 year from now
        revokedAt: null,
      },
      create: {
        userId: user.id,
        clientId: oauthClient.id,
        scopes: JSON.stringify(approvedScopes),
        issuedAt: new Date(),
        expiresAt: null, // Or set an expiration policy
      },
    });

    await AuthorizationUtils.logAuditEvent({
      userId: user.id,
      clientId: oauthClient.id,
      action: 'consent_approved',
      ipAddress, userAgent, success: true,
      metadata: { scopes: approvedScopes },
    });

    // Redirect back to the /api/oauth/authorize endpoint with original parameters
    // The authorize endpoint will re-check consent, find it, and issue the code.
    const authorizeUrl = new URL('/api/oauth/authorize', request.nextUrl.origin);
    authorizeUrl.searchParams.set('client_id', client_id);
    authorizeUrl.searchParams.set('redirect_uri', redirect_uri);
    authorizeUrl.searchParams.set('response_type', 'code'); // Assuming 'code' for now, should come from original req
    authorizeUrl.searchParams.set('scope', requestedScopeString);
    if (state) authorizeUrl.searchParams.set('state', state);
    if (code_challenge) authorizeUrl.searchParams.set('code_challenge', code_challenge);
    if (code_challenge_method) authorizeUrl.searchParams.set('code_challenge_method', code_challenge_method);
    if (nonce) authorizeUrl.searchParams.set('nonce', nonce);
    // Crucially, also pass prompt=none or some other indicator if the original authorize request should not prompt again.
    // However, the simplest is just to let it re-evaluate.

    return NextResponse.redirect(authorizeUrl.toString());

  } else { // Decision is 'deny' or anything else
    await AuthorizationUtils.logAuditEvent({
      userId: user.id,
      clientId: oauthClient.id,
      action: 'consent_denied',
      ipAddress, userAgent, success: true, // Action was successful (denial was processed)
      metadata: { scopes: ScopeUtils.parseScopes(requestedScopeString) },
    });

    // Redirect to client's redirect_uri with error
    const errorRedirectUrl = new URL(redirect_uri);
    errorRedirectUrl.searchParams.set('error', OAuth2ErrorTypes.ACCESS_DENIED);
    if (state) errorRedirectUrl.searchParams.set('state', state);

    return NextResponse.redirect(errorRedirectUrl.toString());
  }
}
