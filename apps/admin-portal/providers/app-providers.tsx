'use client';

import { ReactNode } from 'react';
import { AuthProvider as BaseAuthProvider } from '@repo/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { AuthProvider } from '../components/auth/auth-provider';
import { AuthStatusMonitor } from '../components/auth/auth-status-monitor';
import { GlobalErrorHandler } from '../components/error/global-error-handler';
import { ErrorBoundary } from '../components/error/ErrorBoundary';
import { PerformanceMonitorToggle } from '../components/performance/performance-monitor';
import { SecurityEnhancer } from '../components/security/security-enhancer';
import { ToastProvider } from '../components/common/toast';
import { authService } from '../lib/auth-service';

const queryClient = new QueryClient();

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BaseAuthProvider authService={authService}>
          <ToastProvider>
            <AuthProvider>
              {children}
              <AuthStatusMonitor />
              <GlobalErrorHandler />
              <PerformanceMonitorToggle />
              <SecurityEnhancer />
              <Toaster />
            </AuthProvider>
          </ToastProvider>
        </BaseAuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
