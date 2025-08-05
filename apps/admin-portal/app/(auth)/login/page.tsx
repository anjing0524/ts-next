'use client';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@repo/ui';
import { UsernamePasswordForm } from '@/components/auth/username-password-form';
import { OAuthLoginButton } from '@/components/auth/oauth-login-button';
import { ErrorDisplay } from '@/components/common/error-display';

// 强制动态渲染，避免预渲染时访问浏览器API


/**
 * 管理员门户登录页面
 * 提供用户名密码和OAuth两种登录方式，使用OAuth2.1授权流程
 */
function LoginForm() {

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
          {/* 页面顶部标题，便于E2E用例定位 */}
          <h1 className="text-2xl font-bold text-center mb-6">登录认证中心</h1>
          <CardTitle data-slot="card-title">登录认证中心</CardTitle>
          <CardDescription className="text-gray-600">
            选择以下任一方式开始OAuth2.1认证流程
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {/* 用户名密码登录表单 */}
            <UsernamePasswordForm />
            
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">或者</span>
              </div>
            </div>

            {/* OAuth 快捷登录 */}
            <OAuthLoginButton />

            {/* 技术说明 */}
            <div className="mt-6 p-4 bg-gray-50 rounded-lg">
              <h3 className="text-sm font-medium text-gray-700 mb-2">技术说明</h3>
              <ul className="text-xs text-gray-600 space-y-1">
                <li>• 使用OAuth2.1授权码流程</li>
                <li>• 强制PKCE (Proof Key for Code Exchange)</li>
                <li>• State参数防止CSRF攻击</li>
                <li>• 安全的令牌交换机制</li>
                <li>• 支持用户名密码和OAuth两种登录方式</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return <LoginForm />;
}

// 禁用预渲染，因为组件使用了浏览器专用API
export const dynamic = 'force-dynamic';
