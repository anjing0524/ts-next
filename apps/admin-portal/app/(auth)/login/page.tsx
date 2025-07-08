'use client';

import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Alert,
  AlertDescription,
} from '@repo/ui';
import { useAuth } from '@repo/ui';

function LoginContent() {
  const searchParams = useSearchParams();
  const { login, isLoading, error } = useAuth();

  // OAuth parameters from query string (if coming from external OAuth flow)
  const clientId = searchParams.get('client_id');
  const redirectUri = searchParams.get('redirect_uri');
  const isExternalOAuthFlow = !!(clientId && redirectUri);

  const handleLogin = () => {
    login();
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-900 to-slate-700 p-4">
      <Card className="w-full max-w-md shadow-xl bg-white/90 backdrop-blur-sm">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-3xl font-bold tracking-tight">
            {isExternalOAuthFlow ? 'Sign In to Continue' : 'Admin Center Login'}
          </CardTitle>
          <CardDescription className="text-gray-600">
            {isExternalOAuthFlow
              ? `Sign in to authorize access for ${clientId}`
              : 'Sign in to access the OAuth 2.0 Admin Center'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {error && (
            <Alert className="border-red-200 bg-red-50">
              <AlertDescription className="text-red-800">{error}</AlertDescription>
            </Alert>
          )}

          <div className="text-center space-y-4">
            <p className="text-sm text-gray-600">
              Click the button below to sign in using OAuth 2.0 authentication.
            </p>

            <Button
              onClick={handleLogin}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-4 rounded-md shadow-md transition duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
              disabled={isLoading}
              data-testid="login-oauth-button"
            >
              {isLoading ? 'Redirecting...' : 'Sign In with OAuth 2.0'}
            </Button>

            <div className="text-xs text-gray-500 space-y-1">
              <p>You will be redirected to the authentication server</p>
              <p>Default credentials: admin / adminpassword</p>
            </div>
          </div>
        </CardContent>
        <CardFooter className="text-center text-sm text-gray-600">
          <p>Secure authentication powered by OAuth 2.1 + PKCE</p>
        </CardFooter>
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen bg-gray-100">
          <p>Loading...</p>
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
