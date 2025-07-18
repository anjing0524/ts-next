'use client';

import { useState } from 'react';
import {
  Button,
  Input,
  Label,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Alert,
} from '@repo/ui';
import { useRouter, useSearchParams } from 'next/navigation';
import { generateCodeVerifier, generateCodeChallenge } from '@repo/lib/browser';

/**
 * 管理员门户登录页面
 * 实现OAuth2.1授权码+PKCE流程，直接重定向到oauth-service授权端点
 */
function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [isLoading, setIsLoading] = useState(false);

  const handleOAuthLogin = async () => {
    setIsLoading(true);

    try {
      // 生成PKCE参数
      const codeVerifier = generateCodeVerifier();
      const codeChallenge = await generateCodeChallenge(codeVerifier);
      const state = generateCodeVerifier();

      // 存储PKCE参数到sessionStorage
      sessionStorage.setItem('oauth_code_verifier', codeVerifier);
      sessionStorage.setItem('oauth_state', state);

      // 构建OAuth授权URL
      const oauthParams = new URLSearchParams({
        client_id: 'admin-portal-client',
        redirect_uri: `${window.location.origin}/auth/callback`,
        response_type: 'code',
        scope: 'openid profile email user:read user:write role:read role:write permission:read permission:write client:read client:write audit:read',
        state: state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      });

      // 重定向到oauth-service授权端点
      const authUrl = `/api/v2/oauth/authorize?${oauthParams.toString()}`;
      window.location.href = authUrl;
    } catch (error) {
      console.error('OAuth登录初始化失败:', error);
      setIsLoading(false);
    }
  };

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
            点击下方按钮开始OAuth2.1认证流程
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <div className="text-center">
              <p className="text-sm text-gray-600 mb-4">
                系统将使用OAuth2.1授权码流程进行安全认证
              </p>
            </div>

            <Button
              onClick={handleOAuthLogin}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md transition duration-200"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <svg
                    className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  正在初始化...
                </>
              ) : (
                '开始登录'
              )}
            </Button>

            {/* 技术说明 */}
            <div className="mt-6 p-4 bg-gray-50 rounded-lg">
              <h3 className="text-sm font-medium text-gray-700 mb-2">技术说明</h3>
              <ul className="text-xs text-gray-600 space-y-1">
                <li>• 使用OAuth2.1授权码流程</li>
                <li>• 强制PKCE (Proof Key for Code Exchange)</li>
                <li>• State参数防止CSRF攻击</li>
                <li>• 安全的令牌交换机制</li>
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
