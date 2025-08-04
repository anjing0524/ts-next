'use client';

import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@repo/ui';

interface ErrorDisplayProps {
  error: string | null;
  onRetry?: () => void;
  onDismiss?: () => void;
  className?: string;
  variant?: 'inline' | 'card';
}

export function ErrorDisplay({ 
  error, 
  onRetry, 
  onDismiss, 
  className = '',
  variant = 'inline' 
}: ErrorDisplayProps) {
  if (!error) return null;

  const baseClasses = variant === 'card' 
    ? 'p-4 border border-red-200 rounded-lg bg-red-50'
    : 'p-3 text-sm bg-red-50 border border-red-200 rounded-md';

  return (
    <div className={`${baseClasses} ${className}`}>
      <div className="flex items-start space-x-3">
        <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-red-800">
            出现错误
          </h3>
          <p className="mt-1 text-sm text-red-700">
            {error}
          </p>
          {(onRetry || onDismiss) && (
            <div className="mt-3 flex space-x-2">
              {onRetry && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onRetry}
                  className="text-red-700 border-red-300 hover:bg-red-100"
                >
                  <RefreshCw className="h-4 w-4 mr-1" />
                  重试
                </Button>
              )}
              {onDismiss && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onDismiss}
                  className="text-red-700 border-red-300 hover:bg-red-100"
                >
                  关闭
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}