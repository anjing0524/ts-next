'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Terminal } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@repo/ui';
import { getOAuthRedirectUri } from '@/lib/api'; // Assuming getOAuthRedirectUri gives the correct callback URL

export default function AuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const exchangeCodeForToken = async () => {
      const code = searchParams.get('code');
      // const state = searchParams.get('state'); // You might want to validate state if you generated one

      if (!code) {
        setError('Authorization code not found in callback.');
        setIsLoading(false);
        return;
      }

      const codeVerifier = sessionStorage.getItem('code_verifier');
      if (!codeVerifier) {
        setError('Code verifier not found. Please try logging in again.');
        setIsLoading(false);
        return;
      }
      // Remove code verifier from session storage after retrieving it
      sessionStorage.removeItem('code_verifier');

      try {
        const params = new URLSearchParams({
          grant_type: 'authorization_code',
          code: code,
          redirect_uri: getOAuthRedirectUri(), // Make sure this matches the one used in /authorize
          client_id: 'auth-center-self', // As configured in seed and login page
          code_verifier: codeVerifier,
        });

        const response = await fetch('/api/v2/oauth/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: params.toString(),
        });

        const data = await response.json();

        if (!response.ok) {
          setError(data.error_description || data.error || 'Failed to exchange token.');
          setIsLoading(false);
          return;
        }

        if (data.access_token) {
          document.cookie = `auth_token=${data.access_token}; path=/; SameSite=Lax`; // Add Secure in production
        }
        if (data.refresh_token) {
          sessionStorage.setItem('refresh_token', data.refresh_token);
        }

        // Redirect to dashboard or intended page
        // For now, redirecting to /dashboard
        const redirectTo = searchParams.get('redirect_uri_after_login') || '/dashboard';
        router.push(redirectTo);
      } catch (err) {
        console.error('Token exchange error:', err);
        setError(
          err instanceof Error ? err.message : 'An unexpected error occurred during token exchange.'
        );
        setIsLoading(false);
      }
    };

    exchangeCodeForToken();
  }, [router, searchParams]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <div className="text-center">
          <p className="text-lg font-semibold">Processing authentication...</p>
          {/* You can add a spinner or loading animation here */}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-red-50 p-4">
        <Alert variant="destructive" className="max-w-md">
          <Terminal className="h-4 w-4" />
          <AlertTitle>Authentication Error</AlertTitle>
          <AlertDescription>
            {error}
            <button
              onClick={() => router.push('/login')}
              className="mt-4 block w-full text-center px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
            >
              Return to Login
            </button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Should not be reached if loading or error is handled, but as a fallback:
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <p>Redirecting...</p>
    </div>
  );
}
