// Redirects to /api/v2/oauth/authorize
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const newUrl = `/api/v2/oauth/authorize?${searchParams.toString()}`;
  return NextResponse.redirect(new URL(newUrl, request.url), 308); // 308 Permanent Redirect
}

export async function POST(request: NextRequest) {
  // POST requests might also need to be redirected, depending on the endpoint's behavior
  // For authorize, typically GET, but if POST is supported:
  const { searchParams } = new URL(request.url); // Params might be in URL for some POSTs
  const newUrl = `/api/v2/oauth/authorize?${searchParams.toString()}`;
  // Note: Body forwarding is not straightforward with simple redirect.
  // If body needs to be preserved, this might need a proxy or more complex handling.
  // For now, assuming query params are primary for authorize.
  return NextResponse.redirect(new URL(newUrl, request.url), 308);
}
