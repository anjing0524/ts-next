'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui';
import { UsernamePasswordForm } from '@/components/auth/username-password-form';

/**
 * Login 页面内容组件
 *
 * OAuth 流程说明：
 * 1. 用户访问受保护资源但无有效 token → Middleware 重定向到 OAuth /authorize
 * 2. OAuth /authorize 检查 session_token，如果没有 → 重定向到此 /login 页面
 * 3. URL 参数包含 redirect（指向原始 /authorize URL）
 * 4. 用户输入凭证 → 表单提交到 OAuth 服务的 /auth/login 端点
 * 5. OAuth 验证凭证 → 设置 session_token cookie → 重定向回 redirect URL
 * 6. /authorize 端点现在有 session_token → 继续授权流程
 */
function LoginContent() {
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect');
  const hasRedirect = !!redirect;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center">
            <svg
              className="w-8 h-8 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          </div>
          <CardTitle data-slot="card-title">登录认证中心</CardTitle>
          <CardDescription className="text-gray-600">
            {hasRedirect
              ? '正在进行授权流程，请输入您的凭证'
              : '请输入您的凭证以继续'
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UsernamePasswordForm />
          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
            <p className="text-xs text-blue-800 text-center">
              <strong>演示账户：</strong> username=admin, password=admin123
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <p className="text-lg font-medium">加载中...</p>
        </div>
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}

export const dynamic = 'force-dynamic';
