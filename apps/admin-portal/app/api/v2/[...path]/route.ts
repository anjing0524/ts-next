import { NextRequest, NextResponse } from 'next/server';

const OAUTH_SERVICE_URL = process.env.OAUTH_SERVICE_URL || 'http://localhost:3001';

async function proxyRequest(request: NextRequest, { params }: { params: { path: string[] } }) {
    const path = params.path.join('/');
    const url = `${OAUTH_SERVICE_URL}/api/v2/${path}${request.nextUrl.search}`;

    console.log(`Proxying request to: ${url}`);

    try {
        const headers = new Headers(request.headers);
        headers.delete('host');
        headers.delete('connection');

        // Ensure we forward the IP address
        const forwardedFor = request.headers.get('x-forwarded-for');
        const realIp = request.headers.get('x-real-ip');
        if (forwardedFor) headers.set('x-forwarded-for', forwardedFor);
        if (realIp) headers.set('x-real-ip', realIp);

        const body = request.method !== 'GET' && request.method !== 'HEAD' ? await request.blob() : null;

        const response = await fetch(url, {
            method: request.method,
            headers,
            body,
            // @ts-ignore - duplex is required for streaming bodies in some node versions but not in standard types
            duplex: 'half',
        });

        return new NextResponse(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
        });
    } catch (error) {
        console.error('Proxy error:', error);
        return NextResponse.json(
            { error: 'Internal Server Error', message: 'Failed to proxy request' },
            { status: 500 }
        );
    }
}

export async function GET(request: NextRequest, context: any) {
    return proxyRequest(request, context);
}

export async function POST(request: NextRequest, context: any) {
    return proxyRequest(request, context);
}

export async function PUT(request: NextRequest, context: any) {
    return proxyRequest(request, context);
}

export async function DELETE(request: NextRequest, context: any) {
    return proxyRequest(request, context);
}

export async function PATCH(request: NextRequest, context: any) {
    return proxyRequest(request, context);
}
