'use client';

import { Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui';
import { Button } from '@repo/ui';
import { Alert, AlertDescription } from '@repo/ui';

function ErrorPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const error = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');
  const state = searchParams.get('state');

  const getErrorMessage = () => {
    if (errorDescription) {
      return errorDescription;
    }

    switch (error) {
      case 'access_denied':
        return '您已拒绝授权访问。';
      case 'invalid_request':
        return '无效的授权请求。';
      case 'unauthorized_client':
        return '客户端未授权。';
      case 'unsupported_response_type':
        return '不支持的响应类型。';
      case 'invalid_scope':
        return '无效的权限范围。';
      case 'server_error':
        return '服务器内部错误。';
      case 'temporarily_unavailable':
        return '服务暂时不可用。';
      default:
        return '发生未知错误。';
    }
  };

  const getErrorTitle = () => {
    switch (error) {
      case 'access_denied':
        return '授权被拒绝';
      case 'invalid_request':
        return '请求无效';
      case 'unauthorized_client':
        return '未授权';
      case 'server_error':
        return '服务器错误';
      default:
        return 'OAuth错误';
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-red-600">{getErrorTitle()}</CardTitle>
          <CardDescription>OAuth授权过程中发生错误</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert variant="destructive">
            <AlertDescription>{getErrorMessage()}</AlertDescription>
          </Alert>

          {state && <p className="text-sm text-gray-600">状态参数: {state}</p>}

          <div className="space-y-3">
            <Button onClick={() => router.push('/login')} className="w-full">
              返回登录
            </Button>
            <Button onClick={() => router.push('/admin')} variant="outline" className="w-full">
              返回管理后台
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * OAuth错误页面
 * 显示oauth-service返回的各种OAuth错误
 */
export default function OAuthErrorPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <Card className="w-full max-w-md">
            <CardContent>
              <div className="text-center">
                <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-gray-900 mx-auto"></div>
                <p className="mt-4 text-gray-600">加载中...</p>
              </div>
            </CardContent>
          </Card>
        </div>
      }
    >
      <ErrorPageContent />
    </Suspense>
  );
}
