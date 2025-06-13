// Redirects to /api/v2/oauth/consent
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const newUrl = `/api/v2/oauth/consent?${searchParams.toString()}`;
  return NextResponse.redirect(new URL(newUrl, request.url), 308);
}

export async function POST(request: NextRequest) {
  // Assuming consent might also involve POST for form submissions
  const { searchParams } = new URL(request.url);
  const newUrl = `/api/v2/oauth/consent?${searchParams.toString()}`;
  return NextResponse.redirect(new URL(newUrl, request.url), 308);
}
