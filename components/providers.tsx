'use client';

import * as React from 'react';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { QueryClientProvider } from '@tanstack/react-query';
import { getQueryClient } from './get-query-client';

interface ProvidersProps {
  children: React.JSX.Element | React.JSX.Element[];
}

export function Providers({ children }: ProvidersProps) {
  const queryClient = getQueryClient();
  return (
    <>
      <QueryClientProvider client={queryClient}>
        <ToastContainer
          position="top-center"
          autoClose={3000}
          hideProgressBar={false}
          newestOnTop
          closeOnClick
          rtl={false}
          pauseOnFocusLoss
          draggable
          pauseOnHover
        />
        {children}
      </QueryClientProvider>
    </>
  );
}
