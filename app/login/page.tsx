"use client";

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { z } from 'zod';

// Define Zod schema (can be moved later)
const loginSchema = z.object({
  username: z.string().min(1, { message: "Username is required" }),
  password: z.string().min(1, { message: "Password is required" }),
});

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<any>({}); // For displaying Zod errors

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const result = loginSchema.safeParse({ username, password });
    if (!result.success) {
      // Convert Zod errors to a more usable format for display
      const fieldErrors: any = {};
      for (const issue of result.error.issues) {
        if (issue.path[0]) {
          fieldErrors[issue.path[0]] = issue.message;
        }
      }
      setErrors(fieldErrors);
      console.log("Client-side validation errors:", fieldErrors);
      return;
    }
    setErrors({});
    console.log("Login submitted with:", result.data);
    // TODO: Send data to backend API
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-900 to-slate-700 p-4">
      <Card className="w-full max-w-md shadow-xl bg-white/90 backdrop-blur-sm">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-3xl font-bold tracking-tight">Welcome Back</CardTitle>
          <CardDescription className="text-gray-600">Sign in to continue to your dashboard.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-sm font-medium text-gray-700">Username</Label>
              <Input
                id="username"
                type="text"
                placeholder="your.username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                aria-describedby="username-error"
              />
              {errors.username && <p id="username-error" className="text-sm text-red-600 pt-1">{errors.username}</p>}
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-sm font-medium text-gray-700">Password</Label>
                {/* Optional: Add a "Forgot password?" link here if needed */}
                {/* <a href="#" className="text-sm text-indigo-600 hover:text-indigo-500">
                  Forgot password?
                </a> */}
              </div>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                aria-describedby="password-error"
              />
              {errors.password && <p id="password-error" className="text-sm text-red-600 pt-1">{errors.password}</p>}
            </div>
            <Button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 px-4 rounded-md shadow-md transition duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2">
              Sign In
            </Button>
          </form>
        </CardContent>
        <CardFooter className="text-center text-sm text-gray-600">
          {/* Optional: Add a "Don't have an account?" link here if needed */}
          {/* <p>
            Don't have an account? <a href="/signup" className="font-medium text-indigo-600 hover:text-indigo-500">Sign up</a>
          </p> */}
        </CardFooter>
      </Card>
    </div>
  );
}
