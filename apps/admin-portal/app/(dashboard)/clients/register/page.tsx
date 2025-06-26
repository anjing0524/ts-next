'use client';

import { useState } from 'react';

import { z } from 'zod';

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from '@repo/ui';
import { adminApi } from '@/lib/api';

// Zod schema for client registration (matches backend)
const clientRegisterSchema = z.object({
  name: z.string().min(1, { message: 'Client name is required' }),
  redirectUris: z
    .string()
    .min(1, { message: 'At least one redirect URI is required' })
    .refine(
      (value) => {
        const uris = value.split(',').map((uri) => uri.trim());
        return uris.every((uri) => {
          if (uri === '') return false;
          return z
            .string()
            .url({ message: `Invalid URL: ${uri}` })
            .safeParse(uri).success;
        });
      },
      {
        message:
          'One or more redirect URIs are invalid. Ensure they are valid URLs and comma-separated if multiple.',
      }
    ),
  jwksUri: z.string().url({ message: 'JWKS URI must be a valid URL' }).optional().or(z.literal('')),
});

export default function ClientRegisterPage() {
  const [name, setName] = useState('');
  const [redirectUris, setRedirectUris] = useState('');
  const [jwksUri, setJwksUri] = useState(''); // 1. Update State
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiResponse, setApiResponse] = useState<{
    type: 'success' | 'error';
    message: string;
    data?: Record<string, string>;
  } | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setApiResponse(null); // Clear previous API response
    setErrors({}); // Clear previous Zod errors

    // 4. Update handleSubmit Function (safeParse)
    const validation = clientRegisterSchema.safeParse({ name, redirectUris, jwksUri });
    if (!validation.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of validation.error.issues) {
        if (issue.path[0]) {
          fieldErrors[issue.path[0]] = issue.message;
        }
      }
      setErrors(fieldErrors);
      return;
    }

    try {
      const result = await adminApi.registerClient(validation.data);

      setApiResponse({
        type: 'success',
        message: result.message || 'Client registered successfully!',
        data: { clientId: result.clientId, clientSecret: result.clientSecret },
      });
      // Optionally clear form: setName(''); setRedirectUris('');
    } catch (error) {
      console.error('Client registration request failed:', error);
      setApiResponse({
        type: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred. Please try again.',
      });
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-900 to-slate-700 p-4">
      <Card className="w-full max-w-lg shadow-xl bg-white/90 backdrop-blur-sm">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-3xl font-bold tracking-tight">Register OAuth Client</CardTitle>
          <CardDescription className="text-gray-600">
            Provide details for your new OAuth application.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-sm font-medium text-gray-700">
                Application Name
              </Label>
              <Input
                id="name"
                type="text"
                placeholder="My Awesome App"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                aria-describedby="name-error"
              />
              {errors.name && (
                <p id="name-error" className="text-sm text-red-600 pt-1">
                  {errors.name}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="redirectUris" className="text-sm font-medium text-gray-700">
                Redirect URIs
              </Label>
              <Input
                id="redirectUris"
                type="text"
                placeholder="https://client.com/callback, https://another.client.com/oauth"
                value={redirectUris}
                onChange={(e) => setRedirectUris(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                aria-describedby="redirectUris-error"
              />
              {errors.redirectUris && (
                <p id="redirectUris-error" className="text-sm text-red-600 pt-1">
                  {errors.redirectUris}
                </p>
              )}
              <p className="text-xs text-gray-500 pt-1">
                Comma-separated list of valid OAuth redirect URIs.
              </p>
            </div>
            {/* 3. Add Input Field */}
            <div className="space-y-2">
              <Label htmlFor="jwksUri" className="text-sm font-medium text-gray-700">
                JWKS URI (Optional)
              </Label>
              <Input
                id="jwksUri"
                type="text"
                placeholder="e.g., https://client.com/.well-known/jwks.json"
                value={jwksUri}
                onChange={(e) => setJwksUri(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                aria-describedby="jwksUri-error"
              />
              {errors.jwksUri && (
                <p id="jwksUri-error" className="text-sm text-red-600 pt-1">
                  {errors.jwksUri}
                </p>
              )}
              <p className="text-xs text-gray-500 pt-1">
                The URL to your JSON Web Key Set (JWKS) for public key client authentication.
              </p>
            </div>
            <Button
              type="submit"
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 px-4 rounded-md shadow-md transition duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
              onClick={handleSubmit} // Keep onClick for form submission if not relying solely on form's onSubmit
            >
              Register Application
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex flex-col items-center pt-6">
          {apiResponse && (
            <div
              className={`p-4 rounded-md w-full text-sm ${apiResponse.type === 'success' ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-800'}`}
            >
              <p
                className={`font-bold text-lg mb-2 ${apiResponse.type === 'success' ? 'text-green-700' : 'text-red-700'}`}
              >
                {apiResponse.type === 'success'
                  ? 'Registration Successful!'
                  : 'Registration Failed!'}
              </p>
              <p className="mb-3">{apiResponse.message}</p>
              {apiResponse.type === 'success' && apiResponse.data && (
                <div className="mt-3 text-sm bg-slate-50 p-3 rounded-md border border-slate-200 space-y-2">
                  <p className="font-semibold text-slate-700">Your New Credentials:</p>
                  <div>
                    <Label htmlFor="clientIdDisplay" className="font-medium text-slate-600">
                      Client ID:
                    </Label>
                    <Input
                      id="clientIdDisplay"
                      type="text"
                      value={apiResponse.data.clientId}
                      readOnly
                      className="w-full mt-1 bg-slate-100 border-slate-300 text-slate-700"
                    />
                  </div>
                  <div>
                    <Label htmlFor="clientSecretDisplay" className="font-medium text-slate-600">
                      Client Secret:
                    </Label>
                    <Input
                      id="clientSecretDisplay"
                      type="text"
                      value={apiResponse.data.clientSecret}
                      readOnly
                      className="w-full mt-1 bg-slate-100 border-slate-300 text-slate-700"
                    />
                  </div>
                  <p className="text-xs text-red-600 mt-2 font-medium">
                    Important: Copy your client secret now. You will not be able to see it again.
                  </p>
                </div>
              )}
            </div>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
