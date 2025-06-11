"use client";

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

import { z } from 'zod';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authApi, getOAuthRedirectUri, getFullUrl } from '@/lib/api';


// Define Zod schema
const loginSchema = z.object({
  username: z.string().min(1, { message: "Username is required" }),
  password: z.string().min(1, { message: "Password is required" }),
});

// PKCE helper functions - Browser compatible
function base64urlEscape(str: string): string {
  return str.replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');
}

function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64urlEscape(btoa(String.fromCharCode.apply(null, Array.from(array))));
}

async function generateCodeChallenge(codeVerifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64urlEscape(btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(digest)))));
}

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<any>({}); 
  const [isLoading, setIsLoading] = useState(false);
  const [loginError, setLoginError] = useState('');

  // OAuth parameters from query string (if coming from OAuth flow)
  const clientId = searchParams.get('client_id');
  const redirectUri = searchParams.get('redirect_uri');
  const responseType = searchParams.get('response_type');
  const scope = searchParams.get('scope');
  const state = searchParams.get('state');
  const codeChallenge = searchParams.get('code_challenge');
  const codeChallengeMethod = searchParams.get('code_challenge_method');
  const nonce = searchParams.get('nonce');

  const isOAuthFlow = !!(clientId && redirectUri);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    setLoginError('');

    const result = loginSchema.safeParse({ username, password });
    if (!result.success) {
      const fieldErrors: any = {};
      for (const issue of result.error.issues) {
        if (issue.path[0]) {
          fieldErrors[issue.path[0]] = issue.message;
        }
      }
      setErrors(fieldErrors);
      setIsLoading(false);
      return;
    }

    setErrors({});

    try {
      // Step 1: Authenticate user with username/password
      await authApi.login({
        username: result.data.username,
        password: result.data.password,
      });

      // If this is not an OAuth flow, redirect to dashboard directly
      if (!isOAuthFlow) {
        // For internal admin access, initiate OAuth flow
        const codeVerifier = generateCodeVerifier();
        const codeChallenge = await generateCodeChallenge(codeVerifier);
        
        // Store code verifier for later use in callback
        sessionStorage.setItem('code_verifier', codeVerifier);

        // Generate state using browser crypto
        const stateArray = new Uint8Array(16);
        crypto.getRandomValues(stateArray);
        const state = Array.from(stateArray, byte => byte.toString(16).padStart(2, '0')).join('');

        const authUrl = new URL(getFullUrl('/api/oauth/authorize'));
        authUrl.searchParams.set('client_id', 'auth-center-self');
        authUrl.searchParams.set('redirect_uri', getOAuthRedirectUri());
        authUrl.searchParams.set('response_type', 'code');
        authUrl.searchParams.set('scope', 'profile:read users:manage clients:manage permissions:manage audit:read openid email');
        authUrl.searchParams.set('code_challenge', codeChallenge);
        authUrl.searchParams.set('code_challenge_method', 'S256');
        authUrl.searchParams.set('state', state);

        window.location.href = authUrl.toString();
        return;
      }

      // Step 2: For external OAuth flows, redirect to authorize endpoint with user session
      const oauthUrl = new URL(getFullUrl('/api/oauth/authorize'));
      oauthUrl.searchParams.set('client_id', clientId);
      oauthUrl.searchParams.set('redirect_uri', redirectUri);
      oauthUrl.searchParams.set('response_type', responseType || 'code');
      if (scope) oauthUrl.searchParams.set('scope', scope);
      if (state) oauthUrl.searchParams.set('state', state);
      if (codeChallenge) oauthUrl.searchParams.set('code_challenge', codeChallenge);
      if (codeChallengeMethod) oauthUrl.searchParams.set('code_challenge_method', codeChallengeMethod);
      if (nonce) oauthUrl.searchParams.set('nonce', nonce);

      window.location.href = oauthUrl.toString();

    } catch (error) {
      console.error('Login error:', error);
      setLoginError(error instanceof Error ? error.message : 'An unexpected error occurred');
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-900 to-slate-700 p-4">
      <Card className="w-full max-w-md shadow-xl bg-white/90 backdrop-blur-sm">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-3xl font-bold tracking-tight">
            {isOAuthFlow ? 'Sign In to Continue' : 'Admin Center Login'}
          </CardTitle>
          <CardDescription className="text-gray-600">
            {isOAuthFlow 
              ? `Sign in to authorize access for ${clientId}`
              : 'Sign in to access the OAuth 2.0 Admin Center'
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loginError && (
            <Alert className="mb-4 border-red-200 bg-red-50">
              <AlertDescription className="text-red-800">
                {loginError}
              </AlertDescription>
            </Alert>
          )}
          
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-sm font-medium text-gray-700">
                Username or Email
              </Label>
              <Input
                id="username"
                type="text"
                placeholder="Enter your username or email"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                aria-describedby="username-error"
                disabled={isLoading}
              />
              {errors.username && (
                <p id="username-error" className="text-sm text-red-600 pt-1">
                  {errors.username}
                </p>
              )}
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium text-gray-700">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                aria-describedby="password-error"
                disabled={isLoading}
              />
              {errors.password && (
                <p id="password-error" className="text-sm text-red-600 pt-1">
                  {errors.password}
                </p>
              )}
            </div>
            
            <Button 
              type="submit" 
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 px-4 rounded-md shadow-md transition duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
              disabled={isLoading}
            >
              {isLoading ? 'Signing In...' : 'Sign In'}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="text-center text-sm text-gray-600">
          <p>
            Don't have an account? <Link href="/register" className="font-medium text-indigo-600 hover:text-indigo-500">Sign up</Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
