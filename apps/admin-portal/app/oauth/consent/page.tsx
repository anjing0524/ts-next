'use client';

import { useAuth } from '@repo/ui';
import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@repo/ui';
import { ENDPOINTS } from '@/lib/api-endpoints';
import { apiRequest } from '@/lib/api';

interface ConsentApiData {
  client: { id: string; name: string; logoUri?: string | null };
  requested_scopes: { name: string; description: string }[];
  user: { id: string; username: string | null };
  consent_form_action_url: string;
  client_id: string;
  redirect_uri: string;
  scope: string;
  state?: string;
  response_type: string;
  code_challenge?: string;
  code_challenge_method?: string;
  nonce?: string;
}

function ConsentContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();

  const clientId = searchParams.get('client_id');
  const redirectUri = searchParams.get('redirect_uri');
  const responseType = searchParams.get('response_type');
  const scope = searchParams.get('scope');
  const state = searchParams.get('state');
  const codeChallenge = searchParams.get('code_challenge');
  const codeChallengeMethod = searchParams.get('code_challenge_method');
  const nonce = searchParams.get('nonce');

  const [apiData, setApiData] = useState<ConsentApiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // 拼接API参数
    const params = new URLSearchParams({
      client_id: clientId || '',
      redirect_uri: redirectUri || '',
      response_type: responseType || '',
      scope: scope || '',
      state: state || '',
      code_challenge: codeChallenge || '',
      code_challenge_method: codeChallengeMethod || '',
      nonce: nonce || '',
    });
    // 统一通过apiRequest和ENDPOINTS管理API路径
    apiRequest<{ data: ConsentApiData }>(`/oauth/consent?${params.toString()}`)
      .then((response) => {
        setApiData(response.data);
        setLoading(false);
      })
      .catch((err) => {
        setError(typeof err === 'string' ? err : err.message || '加载同意信息失败');
        setLoading(false);
      });
  }, [clientId, redirectUri, responseType, scope, state, codeChallenge, codeChallengeMethod]);

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">加载同意信息...</div>;
  }
  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-red-600">加载失败</CardTitle>
          </CardHeader>
          <CardContent>
            <p>{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // 优先用API数据，否则用URL参数兜底
  const displayClient = apiData?.client || { id: clientId, name: clientId, logoUri: null };
  const displayScopes = apiData?.requested_scopes || (scope ? [{ name: scope, description: '基础账户访问权限' }] : []);
  const displayUser = apiData?.user || { username: user?.username || '未知用户' };

  // 检查必要参数
  if (!clientId || !redirectUri || responseType !== 'code') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-red-600">错误</CardTitle>
          </CardHeader>
          <CardContent>
            <p>缺少必要的OAuth参数（client_id、redirect_uri或response_type）。</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // 格式化权限范围
  const formattedScope = scope
    ? scope
        .split(/[\s,_]+/)
        .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
        .join(', ')
    : '基础账户访问权限';

  // 处理授权确认
  const handleConsent = async (action: 'allow' | 'deny') => {
    try {
      const consentParams = new URLSearchParams({
        decision: action,
        client_id: clientId || '',
        redirect_uri: redirectUri || '',
        scope: scope || '',
        response_type: responseType || '',
        state: state || '',
        code_challenge: codeChallenge || '',
        code_challenge_method: codeChallengeMethod || 'S256',
        nonce: nonce || '',
      });

      const response = await adminApi.submitConsent(action, consentParams);

      if (response.redirect_uri) {
        window.location.href = response.redirect_uri;
      } else {
        // Handle non-redirect responses if necessary
        console.log('Consent submission successful', response);
      }
    } catch (error) {
      console.error('授权确认错误:', error);
      setError('网络错误或服务器不可用');
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-100 to-slate-300 dark:from-slate-900 dark:to-slate-800">
      <Card className="w-full max-w-lg shadow-xl">
        <CardHeader className="space-y-2 text-center border-b pb-6">
          <CardTitle className="text-3xl font-bold tracking-tight">授权应用</CardTitle>
          <CardDescription className="text-gray-600 text-base">
            应用 <strong className="text-indigo-600">{displayClient.name}</strong> 正在请求访问您的账户。
          </CardDescription>
          {displayClient.logoUri && (
            <img src={displayClient.logoUri} alt="应用Logo" className="mx-auto h-12 w-12 rounded-full mt-2" />
          )}
        </CardHeader>
        <CardContent className="pt-6 space-y-6">
          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-gray-800">请求的权限：</h3>
            <div className="bg-slate-50 border border-slate-200 rounded-md p-4">
              <ul className="list-disc list-inside space-y-1 text-gray-700">
                {displayScopes.map((s) => (
                  <li key={s.name}>
                    <strong className="font-medium">{s.name}</strong>：{s.description}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="text-sm text-gray-700 bg-slate-50 border border-slate-200 rounded-md p-4">
            <p>
              当前登录用户：{' '}
              <strong className="font-medium text-indigo-600">{displayUser.username}</strong>。
            </p>
            <p className="text-xs text-gray-500 mt-1">
              如果这不是您，请取消并重新登录正确的账户。
            </p>
          </div>
          <p className="text-center font-medium text-gray-700 pt-2 text-base">
            您是否授权 <strong className="text-indigo-600">{displayClient.name}</strong> 访问这些权限？
          </p>
        </CardContent>
        <CardFooter className="flex flex-col sm:flex-row justify-center items-center space-y-3 sm:space-y-0 sm:space-x-6 pt-6 border-t">
          <Button
            onClick={() => handleConsent('deny')}
            variant="outline"
            size="lg"
            className="w-full border-gray-400 hover:bg-gray-100 text-gray-700"
          >
            拒绝访问
          </Button>
          <Button
            onClick={() => handleConsent('allow')}
            variant="default"
            size="lg"
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            允许访问
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

export default function ConsentPage() {
  const { user, isLoading } = useAuth();

  // 如果未登录，跳转到登录页面
  if (!isLoading && !user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-red-600">需要登录</CardTitle>
          </CardHeader>
          <CardContent>
            <p>您需要先登录才能进行授权确认。</p>
            <Button 
              onClick={() => window.location.href = '/login'}
              className="mt-4"
            >
              前往登录
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <Suspense fallback={<div>加载中...</div>}>
      <ConsentContent />
    </Suspense>
  );
} 