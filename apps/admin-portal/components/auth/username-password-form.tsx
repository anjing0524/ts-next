'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button, Input, Label } from '@repo/ui';

function ErrorDisplay() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');

  if (!error) return null;

  const errorMessages: { [key: string]: string } = {
    invalid_credentials: '用户名或密码错误，请重试。',
    authorization_failed: '授权过程中发生错误，请稍后重试。',
    unknown: '发生未知错误，请联系管理员。',
  };

  return (
    <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
      {errorMessages[error] || errorMessages.unknown}
    </div>
  );
}

function HiddenFields() {
  const searchParams = useSearchParams();
  const params = Array.from(searchParams.entries());

  return (
    <>
      {params.map(([key, value]) => (
        <input type="hidden" name={key} value={value} key={key} />
      ))}
    </>
  );
}

interface UsernamePasswordFormProps {
  className?: string;
}

function FormContent({ className }: UsernamePasswordFormProps) {
  return (
    <form
      action={`${process.env.NEXT_PUBLIC_OAUTH_SERVICE_URL}/api/v2/auth/login`}
      method="POST"
      className={`space-y-4 ${className || ''}`}
    >
      <Suspense fallback={null}>
        <HiddenFields />
      </Suspense>

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
        />
      </div>

      <Suspense fallback={null}>
        <ErrorDisplay />
      </Suspense>

      <Button
        type="submit"
        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md transition duration-200"
        data-testid="login-button"
      >
        登录
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