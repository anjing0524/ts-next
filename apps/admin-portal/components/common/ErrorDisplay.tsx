'use client';

import { Alert, AlertDescription, AlertTitle } from '@repo/ui';
import { AlertTriangle } from 'lucide-react';

interface ErrorDisplayProps {
  error: Error | null;
  title?: string;
}

export function ErrorDisplay({ error, title = '发生错误' }: ErrorDisplayProps) {
  if (!error) {
    return null;
  }

  return (
    <Alert variant="destructive">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{error.message || '未知错误'}</AlertDescription>
    </Alert>
  );
}
