'use client';

import { Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui';
import { UsernamePasswordForm } from '@/components/auth/username-password-form';

/**
 * Login 页面内容组件
 *
 * OAuth 2.1 第三方客户端模式中的登录页面
 *
 * 流程：
 * 1. 用户访问受保护页面 (e.g., /admin)
 * 2. middleware.ts 启动 OAuth authorize 流程
 * 3. OAuth Service 检查 session_token（没有）
 * 4. 重定向到 /login?redirect=<original_authorize_url>
 * 5. 用户输入凭证并提交
 * 6. 表单验证 redirect 参数（防止 open redirect 攻击）
 * 7. 提交到 OAuth Service /api/v2/auth/login
 * 8. OAuth Service 设置 session_token cookie
 * 9. 重定向回 redirect URL（原始 authorize URL）
 * 10. OAuth Service 生成 authorization code，重定向到 /auth/callback
 * 11. /auth/callback 交换 code 为 token
 */
function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect');
  const error = searchParams.get('error');

  console.log('Login page loaded with redirect:', redirect, 'and error:', error);


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
            请输入您的凭证登录
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-800">
                <strong>错误：</strong>{' '}
                {error === 'invalid_redirect'
                  ? '无效的重定向 URL，请重新开始。'
                  : error === 'invalid_credentials'
                  ? '用户名或密码错误，请重试。'
                  : '发生错误，请稍后重试。'}
              </p>
            </div>
          )}
          <UsernamePasswordForm />
          {!redirect && (
            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
              <p className="text-xs text-yellow-800 text-center">
                <strong>提示：</strong> 此页面由 OAuth 授权流程自动重定向到达
              </p>
            </div>
          )}
          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
            <p className="text-xs text-blue-800 text-center">
              <strong>演示账户：</strong> admin / admin123
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
