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
} from '@repo/ui';
import { useRouter, useSearchParams } from 'next/navigation';
import { generateCodeVerifier, generateCodeChallenge } from '@repo/lib/browser';

// 强制动态渲染，避免预渲染时访问浏览器API


/**
 * 管理员门户登录页面
 * 提供用户名密码输入界面，直接验证用户凭据并处理OAuth2.1授权流程
 */
function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    username: '',
    password: '',
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setError(null); // 清除错误信息
  };

  const handleUsernamePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      // 生成PKCE参数
      const codeVerifier = generateCodeVerifier();
      const codeChallenge = await generateCodeChallenge(codeVerifier);
      const state = generateCodeVerifier();

      // 存储PKCE参数到sessionStorage
      sessionStorage.setItem('oauth_code_verifier', codeVerifier);
      sessionStorage.setItem('oauth_state', state);

      // 准备OAuth参数
      const clientId = 'admin-portal-client';
      const redirectUri = `${window.location.origin}/auth/callback`;

      // 验证用户凭据并获取授权URL
      const oauthServiceUrl = process.env.NEXT_PUBLIC_OAUTH_SERVICE_URL || 'http://localhost:3001';
      const loginResponse = await fetch(`${oauthServiceUrl}/api/v2/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: formData.username,
          password: formData.password,
          client_id: clientId,
          redirect_uri: redirectUri,
          response_type: 'code',
          scope: 'openid profile email user:read user:write role:read role:write permission:read permission:write client:read client:write audit:read',
          state: state,
          code_challenge: codeChallenge,
          code_challenge_method: 'S256',
        }),
      });

      const loginResult = await loginResponse.json();

      if (!loginResponse.ok) {
        throw new Error(loginResult.message || '登录失败');
      }

      // 直接重定向到授权URL完成OAuth流程
      window.location.href = loginResult.data.redirect_url;

    } catch (error) {
      console.error('登录失败:', error);
      setError(error instanceof Error ? error.message : '登录失败，请重试');
      setIsLoading(false);
    }
  };

  const handleOAuthLogin = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // 生成PKCE参数
      const codeVerifier = generateCodeVerifier();
      const codeChallenge = await generateCodeChallenge(codeVerifier);
      const state = generateCodeVerifier();

      // 存储PKCE参数到sessionStorage
      sessionStorage.setItem('oauth_code_verifier', codeVerifier);
      sessionStorage.setItem('oauth_state', state);

      // 准备OAuth参数
      const clientId = 'admin-portal-client';
      const redirectUri = `${window.location.origin}/auth/callback`;
      const oauthServiceUrl = process.env.NEXT_PUBLIC_OAUTH_SERVICE_URL || 'http://localhost:3001';

      // 构建授权URL
      const authorizeUrl = new URL('/api/v2/oauth/authorize', oauthServiceUrl);
      const authParams = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid profile email user:read user:write role:read role:write permission:read permission:write client:read client:write audit:read',
        state: state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      });

      authorizeUrl.search = authParams.toString();
      
      // 重定向到授权端点
      window.location.href = authorizeUrl.toString();

    } catch (error) {
      console.error('OAuth登录失败:', error);
      setError(error instanceof Error ? error.message : '登录初始化失败，请重试');
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
            {/* 用户名密码登录表单 */}
            <form onSubmit={handleUsernamePasswordLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">用户名</Label>
                <Input
                  id="username"
                  name="username"
                  type="text"
                  placeholder="请输入用户名"
                  value={formData.username}
                  onChange={handleInputChange}
                  required
                  className="w-full"
                  data-testid="username-input"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="password">密码</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  placeholder="请输入密码"
                  value={formData.password}
                  onChange={handleInputChange}
                  required
                  className="w-full"
                  data-testid="password-input"
                />
              </div>

              {error && (
                <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md transition duration-200"
                disabled={isLoading}
                data-testid="login-button"
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
                    登录中...
                  </>
                ) : (
                  '登录'
                )}
              </Button>
            </form>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">或者</span>
              </div>
            </div>

            {/* OAuth 快捷登录 */}
            <div className="text-center">
              <Button
                variant="outline"
                onClick={handleOAuthLogin}
                className="w-full border-2 border-blue-600 text-blue-600 hover:bg-blue-50 font-medium py-2 px-4 rounded-md transition duration-200"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <svg
                      className="animate-spin -ml-1 mr-2 h-4 w-4 text-blue-600"
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
                    正在重定向...
                  </>
                ) : (
                  '使用 OAuth 登录'
                )}
              </Button>
            </div>

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
