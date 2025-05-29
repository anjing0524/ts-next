"use client";

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { authApi, getOAuthRedirectUri } from '@/lib/api';

export default function AuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Processing authorization...');

  useEffect(() => {
    const handleCallback = async () => {
      try {
        const code = searchParams.get('code');
        const state = searchParams.get('state');
        const error = searchParams.get('error');

        if (error) {
          setStatus('error');
          setMessage(`Authorization failed: ${error}`);
          return;
        }

        if (!code) {
          setStatus('error');
          setMessage('No authorization code received');
          return;
        }

        // Exchange authorization code for tokens
        const tokenResponse = await authApi.exchangeToken({
          grant_type: 'authorization_code',
          code: code,
          redirect_uri: getOAuthRedirectUri(),
          client_id: 'admin-center',
          client_secret: 'admin-center-secret',
          code_verifier: sessionStorage.getItem('code_verifier') || '',
        });

        if (!tokenResponse.ok) {
          const errorData = await tokenResponse.json();
          throw new Error(errorData.error_description || 'Token exchange failed');
        }

        const tokenData = await tokenResponse.json();
        
        // Store tokens securely (consider using secure HTTP-only cookies in production)
        sessionStorage.setItem('access_token', tokenData.access_token);
        if (tokenData.refresh_token) {
          sessionStorage.setItem('refresh_token', tokenData.refresh_token);
        }

        // Clean up PKCE code verifier
        sessionStorage.removeItem('code_verifier');

        setStatus('success');
        setMessage('Authorization successful! Redirecting...');

        // Redirect to dashboard
        setTimeout(() => {
          router.push('/admin');
        }, 1000);

      } catch (error) {
        console.error('Callback error:', error);
        setStatus('error');
        setMessage(error instanceof Error ? error.message : 'An unexpected error occurred');
      }
    };

    handleCallback();
  }, [searchParams, router]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-900 to-slate-700 p-4">
      <Card className="w-full max-w-md shadow-xl bg-white/90 backdrop-blur-sm">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold tracking-tight">
            {status === 'loading' && 'Processing...'}
            {status === 'success' && 'Success!'}
            {status === 'error' && 'Error'}
          </CardTitle>
          <CardDescription className="text-gray-600">
            OAuth 2.0 Authorization
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          {status === 'loading' && (
            <div className="flex items-center justify-center space-x-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{message}</span>
            </div>
          )}
          {status === 'success' && (
            <div className="text-green-600 space-y-2">
              <div className="text-lg">✓</div>
              <div>{message}</div>
            </div>
          )}
          {status === 'error' && (
            <div className="text-red-600 space-y-2">
              <div className="text-lg">✗</div>
              <div>{message}</div>
              <button 
                onClick={() => router.push('/login')}
                className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
              >
                Try Again
              </button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
} 