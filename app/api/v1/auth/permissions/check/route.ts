// 文件路径: app/api/v1/auth/permissions/check/route.ts
// 描述: V1 旧版权限检查路径，重定向到新的V1标准路径
// (V1 Old permission check path, redirects to the new V1 standard path)

import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  // 获取原始请求的URL基础 (Get the base of the original request URL)
  const originalUrl = new URL(req.url);
  const baseUrl = `${originalUrl.protocol}//${originalUrl.host}`;

  // 新的目标路径 (New target path)
  const targetUrl = `${baseUrl}/api/v1/permissions/check`;

  // 返回308永久重定向，保留方法和请求体
  // (Return 308 Permanent Redirect, preserving method and body)
  console.log(`Redirecting POST from ${req.url} to ${targetUrl}`);
  return NextResponse.redirect(targetUrl, 308);
}

// 也为其他可能使用的方法添加重定向（尽管POST是主要的）
// (Also add redirects for other methods that might be used, though POST is primary)
export async function GET(req: NextRequest) {
  const originalUrl = new URL(req.url);
  const baseUrl = `${originalUrl.protocol}//${originalUrl.host}`;
  const targetUrl = `${baseUrl}/api/v1/permissions/check`;
  console.log(`Redirecting GET from ${req.url} to ${targetUrl} (though /api/v1/permissions/check primarily expects POST)`);
  // 对于GET，301也可以，但如果目标端点不支持GET，则可能无关紧要
  // (For GET, 301 is also fine, but may not matter if target doesn't support GET)
  return NextResponse.redirect(targetUrl, 301);
}

// 可以为 PUT, DELETE 等也添加类似的重定向，如果这些方法曾被错误地路由到此路径
// (Can add similar redirects for PUT, DELETE etc. if those methods were ever mistakenly routed here)
// export async function PUT(req: NextRequest) { ... return NextResponse.redirect(targetUrl, 308); }
// export async function DELETE(req: NextRequest) { ... return NextResponse.redirect(targetUrl, 308); }
