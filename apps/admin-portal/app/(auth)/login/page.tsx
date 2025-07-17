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

/**
 * 管理员门户登录页面
 * 实现OAuth2.1授权码+PKCE流程，支持用户名密码验证
 */
function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      // 获取OAuth参数
      const clientId = searchParams.get('client_id') || 'admin-portal-client';
      const redirectUri =
        searchParams.get('redirect_uri') || `${window.location.origin}/auth/callback`;
      const state = searchParams.get('state') || '';
      const scope = searchParams.get('scope') || 'openid profile user:read';
      const codeChallenge = searchParams.get('code_challenge') || '';
      const codeChallengeMethod = searchParams.get('code_challenge_method') || 'S256';
      const nonce = searchParams.get('nonce') || '';

      // 验证用户名密码并获取授权码
      const response = await fetch('/api/v2/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username,
          password,
          client_id: clientId,
          redirect_uri: redirectUri,
          state,
          scope,
          response_type: 'code',
          code_challenge: codeChallenge,
          code_challenge_method: codeChallengeMethod,
          nonce,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        setError(data.error_description || '登录失败');
        return;
      }

      // 重定向到授权端点继续OAuth流程
      window.location.href = data.redirect_url;
    } catch (err) {
      setError('网络错误或服务器异常');
      console.error('登录错误:', err);
    } finally {
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
            请输入您的用户名和密码登录管理后台
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-6">
            {error && (
              <Alert variant="destructive">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <p className="text-sm text-red-600 ml-2">{error}</p>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="username" className="text-sm font-medium text-gray-700">
                用户名
              </Label>
              <Input
                id="username"
                name="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="请输入用户名"
                required
                className="w-full"
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium text-gray-700">
                密码
              </Label>
              <Input
                id="password"
                name="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入密码"
                required
                className="w-full"
                disabled={isLoading}
              />
            </div>

            <Button
              type="submit"
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
                  登录中...
                </>
              ) : (
                '登录'
              )}
            </Button>
          </form>

          {/* 忘记密码提示 */}
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600">忘记密码？请联系系统管理员重置密码。</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// 代理登录端点，处理admin-portal的登录请求
export default function LoginPage() {
  return <LoginForm />;
}
