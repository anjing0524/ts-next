// Redirects to /api/v2/oauth/token
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  // Token endpoint is typically POST.
  // Body forwarding is critical here. A simple redirect won't pass the body.
  // This requires a more sophisticated approach: re-writing the request or proxying.
  // For a pure redirect, the client would have to re-POST to the new location.
  // However, returning a 308 is standard for "permanent redirect" which implies method & body *should* be preserved by compliant clients.
  const newUrl = `/api/v2/oauth/token`;
  return NextResponse.redirect(new URL(newUrl, request.url), 308);
}
