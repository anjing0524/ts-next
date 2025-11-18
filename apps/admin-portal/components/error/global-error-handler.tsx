/**
 * GlobalErrorHandler - Global error handling component
 *
 * Features:
 * - Authentication error handling
 * - Network error handling
 * - API error handling
 * - User-friendly error messages
 * - Error recovery options
 */

'use client';

import React, { useState, useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui';
import { Button } from '@repo/ui';
import { XCircle, RefreshCw, AlertTriangle, WifiOff } from 'lucide-react';

interface ErrorInfo {
  type: 'auth' | 'network' | 'api' | 'general';
  message: string;
  details?: string;
  timestamp: number;
  retryable?: boolean;
}

export function GlobalErrorHandler() {
  const [errors, setErrors] = useState<ErrorInfo[]>([]);
  const [dismissedErrors, setDismissedErrors] = useState<Set<number>>(new Set());

  useEffect(() => {
    function handleUnhandledError(event: ErrorEvent) {
      const err = event.error || new Error(event.message);
      Sentry.captureException(err);

      addError({
        type: 'general',
        message: event.message || '发生未知错误',
        details: event.error?.stack,
        timestamp: Date.now(),
        retryable: false,
      });
    }

    function handleUnhandledRejection(event: PromiseRejectionEvent) {
      const err = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
      Sentry.captureException(err);

      addError({
        type: 'general',
        message: 'Promise 被拒绝',
        details: event.reason?.message || String(event.reason),
        timestamp: Date.now(),
        retryable: false,
      });
    }

    function handleAuthError(event: Event) {
      const customEvent = event as CustomEvent;
      addError({
        type: 'auth',
        message: customEvent.detail.message || '认证失败',
        details: customEvent.detail.details,
        timestamp: Date.now(),
        retryable: customEvent.detail.retryable,
      });
    }

    function handleNetworkError(event: Event) {
      const customEvent = event as CustomEvent;
      addError({
        type: 'network',
        message: customEvent.detail.message || '网络连接失败',
        details: customEvent.detail.details,
        timestamp: Date.now(),
        retryable: true,
      });
    }

    function handleApiError(event: Event) {
      const customEvent = event as CustomEvent;
      addError({
        type: 'api',
        message: customEvent.detail.message || 'API 请求失败',
        details: customEvent.detail.details,
        timestamp: Date.now(),
        retryable: customEvent.detail.retryable,
      });
    }

    window.addEventListener('error', handleUnhandledError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    window.addEventListener('auth_error', handleAuthError);
    window.addEventListener('network_error', handleNetworkError);
    window.addEventListener('api_error', handleApiError);

    return () => {
      window.removeEventListener('error', handleUnhandledError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      window.removeEventListener('auth_error', handleAuthError);
      window.removeEventListener('network_error', handleNetworkError);
      window.removeEventListener('api_error', handleApiError);
    };
  }, []);

  function addError(error: ErrorInfo) {
    setErrors(prev => {
      const newErrors = [...prev, error];
      return newErrors.slice(-10);
    });
  }

  function dismissError(timestamp: number) {
    setDismissedErrors(prev => new Set(prev).add(timestamp));

    setTimeout(() => {
      setErrors(prev => prev.filter(error => error.timestamp !== timestamp));
      setDismissedErrors(prev => {
        const newSet = new Set(prev);
        newSet.delete(timestamp);
        return newSet;
      });
    }, 5000);
  }

  function retryError(error: ErrorInfo) {
    switch (error.type) {
      case 'auth':
        window.location.href = '/login';
        break;
      case 'network':
      case 'api':
      default:
        window.location.reload();
        break;
    }
  }

  function getErrorIcon(type: ErrorInfo['type']) {
    switch (type) {
      case 'auth':
        return <XCircle className="h-5 w-5 text-red-500" />;
      case 'network':
        return <WifiOff className="h-5 w-5 text-orange-500" />;
      case 'api':
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      default:
        return <XCircle className="h-5 w-5 text-red-500" />;
    }
  }

  function getErrorColor(type: ErrorInfo['type']) {
    switch (type) {
      case 'auth':
        return 'border-red-200 bg-red-50';
      case 'network':
        return 'border-orange-200 bg-orange-50';
      case 'api':
        return 'border-yellow-200 bg-yellow-50';
      default:
        return 'border-red-200 bg-red-50';
    }
  }

  const visibleErrors = errors.filter(error => !dismissedErrors.has(error.timestamp));

  if (visibleErrors.length === 0) {
    return null;
  }

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 max-w-md">
      {visibleErrors.map((error) => (
        <Card key={error.timestamp} className={`${getErrorColor(error.type)} shadow-lg`}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                {getErrorIcon(error.type)}
                <CardTitle className="text-sm font-medium">
                  {error.type === 'auth' && '认证错误'}
                  {error.type === 'network' && '网络错误'}
                  {error.type === 'api' && 'API 错误'}
                  {error.type === 'general' && '系统错误'}
                </CardTitle>
              </div>
              <button
                onClick={() => dismissError(error.timestamp)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <XCircle className="h-4 w-4" />
              </button>
            </div>
            <CardDescription className="text-xs">
              {error.message}
            </CardDescription>
          </CardHeader>
          {error.details && (
            <CardContent className="pt-0">
              <div className="text-xs text-gray-600 bg-white p-2 rounded border"
                   style={{ maxHeight: '100px', overflowY: 'auto' }}>
                {error.details}
              </div>
            </CardContent>
          )}
          {error.retryable && (
            <CardContent className="pt-0">
              <Button
                onClick={() => retryError(error)}
                size="sm"
                className="w-full"
                variant="outline"
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                重试
              </Button>
            </CardContent>
          )}
        </Card>
      ))}
    </div>
  );
}

export function triggerAuthError(message: string, details?: string, retryable: boolean = false) {
  const event = new CustomEvent('auth_error', {
    detail: { message, details, retryable }
  });
  window.dispatchEvent(event);
}

export function triggerNetworkError(message: string, details?: string, retryable: boolean = true) {
  const event = new CustomEvent('network_error', {
    detail: { message, details, retryable }
  });
  window.dispatchEvent(event);
}

export function triggerApiError(message: string, details?: string, retryable: boolean = true) {
  const event = new CustomEvent('api_error', {
    detail: { message, details, retryable }
  });
  window.dispatchEvent(event);
}
