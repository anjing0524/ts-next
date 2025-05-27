"use client";

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input'; // Using Input instead of Textarea
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { z } from 'zod';

// Zod schema for client registration (matches backend)
const clientRegisterSchema = z.object({
  name: z.string().min(1, { message: "Client name is required" }),
  redirectUris: z.string().min(1, { message: "At least one redirect URI is required" })
                   .refine(value => {
                     const uris = value.split(',').map(uri => uri.trim());
                     return uris.every(uri => {
                       if (uri === '') return false;
                       return z.string().url({ message: `Invalid URL: ${uri}` }).safeParse(uri).success;
                     });
                   }, { message: "One or more redirect URIs are invalid. Ensure they are valid URLs and comma-separated if multiple." }),
});

export default function ClientRegisterPage() {
  const [name, setName] = useState('');
  const [redirectUris, setRedirectUris] = useState('');
  const [errors, setErrors] = useState<any>({});
  const [apiResponse, setApiResponse] = useState<{ type: 'success' | 'error'; message: string; data?: any } | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setApiResponse(null); // Clear previous API response
    setErrors({});      // Clear previous Zod errors

    const validation = clientRegisterSchema.safeParse({ name, redirectUris });
    if (!validation.success) {
      const fieldErrors: any = {};
      for (const issue of validation.error.issues) {
        if (issue.path[0]) {
          fieldErrors[issue.path[0]] = issue.message;
        }
      }
      setErrors(fieldErrors);
      return;
    }

    try {
      const response = await fetch('/api/clients/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validation.data),
      });

      const result = await response.json();

      if (response.ok) {
        setApiResponse({
          type: 'success',
          message: result.message || 'Client registered successfully!',
          data: { clientId: result.clientId, clientSecret: result.clientSecret },
        });
        // Optionally clear form: setName(''); setRedirectUris('');
      } else {
        setApiResponse({ type: 'error', message: result.message || `Error: ${response.statusText}` });
        if (result.errors) { // Handle Zod errors from backend if any (though unlikely if client-side passes)
            setErrors(result.errors);
        }
      }
    } catch (error) {
      console.error("Client registration request failed:", error);
      setApiResponse({ type: 'error', message: 'An unexpected error occurred. Please try again.' });
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100 p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Register New Client</CardTitle>
          <CardDescription>Enter the details for the new OAuth client application.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit}>
            <div className="grid w-full items-center gap-4">
              <div className="flex flex-col space-y-1.5">
                <Label htmlFor="name">Client Name</Label>
                <Input
                  id="name"
                  placeholder="Enter client application name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                {errors.name && <p className="text-sm text-red-500 mt-1">{errors.name}</p>}
              </div>
              <div className="flex flex-col space-y-1.5">
                <Label htmlFor="redirectUris">Redirect URIs</Label>
                <Input // Changed from Textarea to Input
                  id="redirectUris"
                  placeholder="Comma-separated URLs (e.g., https://client.com/cb)"
                  value={redirectUris}
                  onChange={(e) => setRedirectUris(e.target.value)}
                />
                {errors.redirectUris && <p className="text-sm text-red-500 mt-1">{errors.redirectUris}</p>}
              </div>
            </div>
          </form>
        </CardContent>
        <CardFooter className="flex flex-col items-start">
          <Button type="submit" className="w-full mb-4" onClick={handleSubmit}>Register Client</Button>
          {apiResponse && (
            <div className={`p-3 rounded-md w-full ${apiResponse.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              <p className="font-semibold">{apiResponse.type === 'success' ? 'Success!' : 'Error!'}</p>
              <p>{apiResponse.message}</p>
              {apiResponse.type === 'success' && apiResponse.data && (
                <div className="mt-2 text-sm bg-gray-50 p-2 rounded">
                  <p><strong>Client ID:</strong> {apiResponse.data.clientId}</p>
                  <p><strong>Client Secret:</strong> {apiResponse.data.clientSecret}</p>
                  <p className="text-xs text-gray-600 mt-1">Save these credentials securely. The client secret will not be shown again.</p>
                </div>
              )}
            </div>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
