'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '@repo/ui';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui';
import { Button } from '@repo/ui';
import { Alert, AlertDescription } from '@repo/ui';
import { Suspense } from 'react';

export default function AuthCallbackPage() {
  // 用 Suspense 包裹 searchParams 相关逻辑，修复 Next.js 15 构建要求
  return (
    <Suspense fallback={<LoadingCard />}>
      <AuthCallbackContent />
    </Suspense>
  );
}

function AuthCallbackContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { handleCallback } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(true);

  useEffect(() => {
    const processCallback = async () => {
      try {
        const code = searchParams.get('code');
        const state = searchParams.get('state');
        const error = searchParams.get('error');

        if (error) {
          setError(`授权失败: ${error}`);
          setIsProcessing(false);
          return;
        }

        if (!code) {
          setError('缺少授权码');
          setIsProcessing(false);
          return;
        }

        // 处理OAuth回调
        await handleCallback(code, state);
        // 跳转到管理后台
        router.push('/admin');
      } catch (err) {
        setError(err instanceof Error ? err.message : '处理授权回调失败');
        setIsProcessing(false);
      }
    };
    processCallback();
  }, [searchParams, router, handleCallback]);

  if (isProcessing) {
    return <LoadingCard />;
  }

  if (error) {
    return <ErrorCard error={error} router={router} />;
  }

  return null;
}

function LoadingCard() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>处理授权回调</CardTitle>
          <CardDescription>正在验证授权信息，请稍候...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ErrorCard({ error, router }: { error: string; router: ReturnType<typeof useRouter> }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>授权失败</CardTitle>
          <CardDescription>处理授权回调时发生错误</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
          <Button onClick={() => router.push('/login')} className="w-full">
            返回登录页面
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
