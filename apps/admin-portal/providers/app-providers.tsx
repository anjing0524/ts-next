'use client';

import { ReactNode } from 'react';
import { AuthProvider } from '@repo/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { authService } from '../lib/auth-service';

const queryClient = new QueryClient();

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider authService={authService}>
        {children}
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}
