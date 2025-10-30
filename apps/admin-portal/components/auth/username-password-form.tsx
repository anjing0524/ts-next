'use client';

import { Suspense, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Button, Input, Label } from '@repo/ui';

/**
 * 验证重定向 URL 以防止 open redirect 攻击
 *
 * Redirect 参数应该指向 OAuth Service 的 authorize URL，
 * 这确保用户被重定向回合法的 OAuth 流程
 */
function validateRedirectUrl(redirect: string): boolean {
  try {
    const url = new URL(decodeURIComponent(redirect));
    const oauthServiceUrl = process.env.NEXT_PUBLIC_OAUTH_SERVICE_URL || 'http://localhost:3001';
    const oauthServiceUrlObj = new URL(oauthServiceUrl);

    // 检查 host 是否为 localhost 或相同的 origin
    const redirectHost = url.host;
    const oauthHost = oauthServiceUrlObj.host;

    // 在 Pingora 代理模式下，都应该是 localhost:6188
    // 但直接调用时，OAuth Service 是 localhost:3001
    // 对于安全性，我们检查：
    // 1. 路径必须是 /api/v2/oauth/authorize
    // 2. Host 必须是 localhost（任何端口都可以）
    const validHost = redirectHost.startsWith('localhost');
    const validPath = url.pathname === '/api/v2/oauth/authorize';

    return validHost && validPath;
  } catch (err) {
    console.error('Redirect URL validation error:', err);
    return false;
  }
}

function ErrorDisplay({ error }: { error?: string | null }) {
  const searchParams = useSearchParams();
  const displayError = error || searchParams.get('error');

  if (!displayError) return null;

  const errorMessages: { [key: string]: string } = {
    invalid_credentials: '用户名或密码错误，请重试。',
    authorization_failed: '授权过程中发生错误，请稍后重试。',
    unknown: '发生未知错误，请联系管理员。',
    invalid_redirect: '无效的重定向 URL，请重新开始登陆。',
  };

  return (
    <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md" role="alert">
      {errorMessages[displayError] || errorMessages.unknown}
    </div>
  );
}

interface UsernamePasswordFormProps {
  className?: string;
}

function FormContent({ className }: UsernamePasswordFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect');

  /**
   * 处理登陆表单提交
   *
   * 流程：
   * 1. 验证用户名和密码不为空
   * 2. 提交凭证到 OAuth Service /api/v2/auth/login
   * 3. OAuth Service 设置 session_token cookie
   * 4. 重定向回 authorize URL (redirect 参数)
   * 5. OAuth Service 现在有 session，生成 authorization code
   * 6. OAuth Service 重定向到 callback URL
   */
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const form = e.currentTarget;
      const formData = new FormData(form);
      const username = formData.get('username') as string;
      const password = formData.get('password') as string;

      // 验证必填字段
      if (!username || !password) {
        setError('invalid_credentials');
        setLoading(false);
        return;
      }

      // 验证 redirect 参数（防止 open redirect 攻击）
      if (redirect && !validateRedirectUrl(redirect)) {
        console.warn('Invalid redirect URL attempted:', redirect);
        setError('invalid_redirect');
        setLoading(false);
        return;
      }

      // 提交登录请求到 OAuth Service
      // 通过 Pingora 代理 (6188) 而不是直接的 3001
      const loginUrl = new URL(
        `${process.env.NEXT_PUBLIC_OAUTH_SERVICE_URL || 'http://localhost:6188'}/api/v2/auth/login`
      );

      console.debug('Sending login request to:', loginUrl.toString());

      const response = await fetch(loginUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username,
          password,
        }),
        credentials: 'include', // 包含 cookies，允许设置 session_token
      });

      if (!response.ok) {
        // 获取详细的错误信息
        try {
          const errorData = await response.json();
          setError(errorData.error || 'invalid_credentials');
        } catch {
          setError('invalid_credentials');
        }
        setLoading(false);
        return;
      }

      console.debug('Login successful, response status:', response.status);

      // 成功登录，OAuth Service 已设置 session_token cookie
      // 重定向回 OAuth Service 的 authorize URL（redirect 参数）
      // 使用 window.location 进行完全页面刷新，确保 Pingora 能正确路由
      if (redirect) {
        console.debug('Redirecting to authorize URL:', redirect);
        window.location.href = decodeURIComponent(redirect);
      } else {
        // 备用：如果没有 redirect 参数（不应该发生）
        // 重定向到 admin portal 首页
        console.warn('No redirect parameter provided, redirecting to /admin');
        window.location.href = '/admin';
      }
    } catch (err) {
      console.error('Login error:', err);
      setError('unknown');
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={`space-y-4 ${className || ''}`}
    >
      <div className="space-y-2">
        <Label htmlFor="username">用户名</Label>
        <Input
          id="username"
          name="username"
          type="text"
          placeholder="请输入用户名"
          required
          className="w-full"
          data-testid="username-input"
          disabled={loading}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">密码</Label>
        <Input
          id="password"
          name="password"
          type="password"
          placeholder="请输入密码"
          required
          className="w-full"
          data-testid="password-input"
          disabled={loading}
        />
      </div>

      {error && <ErrorDisplay error={error} />}

      <Button
        type="submit"
        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
        data-testid="login-button"
        disabled={loading}
      >
        {loading ? '登录中...' : '登录'}
      </Button>
    </form>
  );
}

export function UsernamePasswordForm(props: UsernamePasswordFormProps) {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <FormContent {...props} />
    </Suspense>
  );
}