'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Input, Label } from '@repo/ui';

/**
 * 验证重定向 URL 以防止 open redirect 攻击
 */
function validateRedirectUrl(redirect: string): boolean {
  try {
    const decodedRedirect = decodeURIComponent(redirect);

    // 允许相对路径
    if (decodedRedirect.startsWith('/')) {
      return true;
    }

    const url = new URL(decodedRedirect);
    const redirectHost = url.host;
    const validHost = redirectHost.startsWith('localhost');
    const validPath = url.pathname === '/api/v2/oauth/authorize';

    return validHost && validPath;
  } catch (err) {
    console.error('Redirect URL validation error:', err);
    return false;
  }
}

interface UsernamePasswordFormProps {
  className?: string;
}

export function UsernamePasswordForm({ className }: UsernamePasswordFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect');

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    console.log('handleSubmit called! Username:', username, 'Redirect:', redirect);

    setLoading(true);
    setError(null);

    // 验证重定向 URL
    if (redirect && !validateRedirectUrl(redirect)) {
      setError('无效的重定向链接');
      setLoading(false);
      return;
    }

    // 验证必填字段
    if (!username || !password) {
      setError('请输入用户名和密码');
      setLoading(false);
      return;
    }

    try {
      // Use relative path to go through Next.js proxy
      const loginUrl = '/api/v2/auth/login';

      console.log('Sending login request to:', loginUrl);

      const response = await fetch(loginUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username,
          password,
          redirect,
        }),
        credentials: 'include',
      });

      console.log('Login response status:', response.status);

      if (!response.ok) {
        try {
          const errorData = await response.json();
          console.error('Login error data:', errorData);
          setError(errorData.error || '登录失败，请检查用户名和密码');
        } catch {
          setError('登录失败，请检查用户名和密码');
        }
        setLoading(false);
        return;
      }

      const loginData = await response.json();
      console.log('Login successful, response:', loginData);

      // 重定向到 OAuth 授权页面
      if (loginData.redirect_url) {
        console.log('Redirecting to:', loginData.redirect_url);
        window.location.href = loginData.redirect_url;
      } else {
        console.warn('No redirect_url in response, redirecting to /admin');
        window.location.href = '/admin';
      }
    } catch (err) {
      console.error('Login error:', err);
      setError('网络错误，请稍后重试');
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className={`space-y-4 ${className || ''}`}>
      <div className="space-y-2">
        <Label htmlFor="username">用户名</Label>
        <Input
          id="username"
          type="text"
          placeholder="请输入用户名"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          disabled={loading}
          required
          autoComplete="username"
          data-testid="username-input"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">密码</Label>
        <Input
          id="password"
          type="password"
          placeholder="请输入密码"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={loading}
          required
          autoComplete="current-password"
          data-testid="password-input"
        />
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-800">
            <strong>错误：</strong> {error}
          </p>
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          className="flex-1 inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-blue-600 hover:bg-blue-700 text-white h-10 px-4 py-2"
          data-testid="login-button"
          disabled={loading}
        >
          {loading ? '登录中...' : '登录'}
        </button>
      </div>
    </form>
  );
}