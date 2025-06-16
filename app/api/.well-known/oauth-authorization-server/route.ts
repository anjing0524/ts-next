import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  // Construct the new URL for the v2 discovery endpoint.
  // It's important to use request.url to correctly inherit the host and protocol.
  const v2DiscoveryUrl = new URL('/api/v2/.well-known/openid-configuration', request.url);

  // Preserve any query parameters from the original request.
  // request.nextUrl.search includes the leading '?' if query parameters exist.
  v2DiscoveryUrl.search = request.nextUrl.search;

  // Perform a permanent redirect (HTTP 301).
  return NextResponse.redirect(v2DiscoveryUrl.toString(), 301);
}
