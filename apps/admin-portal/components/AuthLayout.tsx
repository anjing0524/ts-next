'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@repo/ui/hooks';

interface AuthLayoutProps {
  children: React.ReactNode;
}

const AuthLayout: React.FC<AuthLayoutProps> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) {
    // You can render a loading spinner here
    return <div>Loading...</div>;
  }

  if (!isAuthenticated) {
    // Render nothing while redirecting
    return null;
  }

  return <>{children}</>;
};

export default AuthLayout;
