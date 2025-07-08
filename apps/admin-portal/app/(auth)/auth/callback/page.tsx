'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, Suspense } from 'react';
import { Terminal } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@repo/ui';
import { useAuth } from '@repo/ui';

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { handleCallback, error: authError, isLoading, user } = useAuth();

  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const oauthError = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    if (oauthError) {
      // Handle direct error from OAuth server
      // The provider will set its own error state, but we can also show this immediate feedback
      return;
    }

    if (code) {
      handleCallback(code, state);
    }
  }, [searchParams, handleCallback]);

  useEffect(() => {
    // Redirect on successful login
    if (user && !isLoading) {
      router.push('/admin'); // Or a stored "from" path
    }
  }, [user, isLoading, router]);

  const displayError = authError || searchParams.get('error_description');

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="text-lg font-semibold text-gray-700">Processing authentication...</p>
        </div>
      </div>
    );
  }

  if (displayError) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-red-50 p-4">
        <Alert variant="destructive" className="max-w-md">
          <Terminal className="h-4 w-4" />
          <AlertTitle>Authentication Error</AlertTitle>
          <AlertDescription className="space-y-4">
            <p>{displayError}</p>
            <button
              onClick={() => router.push('/login')}
              className="w-full px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
            >
              Return to Login
            </button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <p>Redirecting...</p>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><p>Loading...</p></div>}>
      <AuthCallbackContent />
    </Suspense>
  );
}
