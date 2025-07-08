import AuthLayout from '@/components/AuthLayout';
import React from 'react';

export default function AdminAreaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AuthLayout>{children}</AuthLayout>;
}
