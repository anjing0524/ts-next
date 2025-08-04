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

  // 监听全局错误
  useEffect(() => {
    const handleUnhandledError = (event: ErrorEvent) => {
      addError({
        type: 'general',
        message: event.message || '发生未知错误',
        details: event.error?.stack,
        timestamp: Date.now(),
        retryable: false,
      });
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      addError({
        type: 'general',
        message: 'Promise 被拒绝',
        details: event.reason?.message || event.reason,
        timestamp: Date.now(),
        retryable: false,
      });
    };

    // 监听认证错误
    const handleAuthError = (event: CustomEvent) => {
      addError({
        type: 'auth',
        message: event.detail.message || '认证失败',
        details: event.detail.details,
        timestamp: Date.now(),
        retryable: event.detail.retryable,
      });
    };

    // 监听网络错误
    const handleNetworkError = (event: CustomEvent) => {
      addError({
        type: 'network',
        message: event.detail.message || '网络连接失败',
        details: event.detail.details,
        timestamp: Date.now(),
        retryable: true,
      });
    };

    // 监听API错误
    const handleApiError = (event: CustomEvent) => {
      addError({
        type: 'api',
        message: event.detail.message || 'API 请求失败',
        details: event.detail.details,
        timestamp: Date.now(),
        retryable: event.detail.retryable,
      });
    };

    window.addEventListener('error', handleUnhandledError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    window.addEventListener('auth_error', handleAuthError as EventListener);
    window.addEventListener('network_error', handleNetworkError as EventListener);
    window.addEventListener('api_error', handleApiError as EventListener);

    return () => {
      window.removeEventListener('error', handleUnhandledError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      window.removeEventListener('auth_error', handleAuthError as EventListener);
      window.removeEventListener('network_error', handleNetworkError as EventListener);
      window.removeEventListener('api_error', handleApiError as EventListener);
    };
  }, []);

  // 添加错误
  const addError = (error: ErrorInfo) => {
    setErrors(prev => {
      // 限制错误数量，避免内存泄漏
      const newErrors = [...prev, error];
      return newErrors.slice(-10); // 保留最近的10个错误
    });
  };

  // 关闭错误
  const dismissError = (timestamp: number) => {
    setDismissedErrors(prev => new Set(prev).add(timestamp));
    
    // 5秒后从状态中移除
    setTimeout(() => {
      setErrors(prev => prev.filter(error => error.timestamp !== timestamp));
      setDismissedErrors(prev => {
        const newSet = new Set(prev);
        newSet.delete(timestamp);
        return newSet;
      });
    }, 5000);
  };

  // 重试操作
  const retryError = (error: ErrorInfo) => {
    // 根据错误类型执行不同的重试逻辑
    switch (error.type) {
      case 'auth':
        // 重定向到登录页
        window.location.href = '/login';
        break;
      case 'network':
        // 刷新页面
        window.location.reload();
        break;
      case 'api':
        // 重新获取数据（通过重新渲染）
        window.location.reload();
        break;
      default:
        // 一般错误，刷新页面
        window.location.reload();
    }
  };

  // 获取错误图标
  const getErrorIcon = (type: ErrorInfo['type']) => {
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
  };

  // 获取错误颜色
  const getErrorColor = (type: ErrorInfo['type']) => {
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
  };

  // 过滤显示的错误
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

// 工具函数：触发认证错误
export function triggerAuthError(message: string, details?: string, retryable: boolean = false) {
  const event = new CustomEvent('auth_error', {
    detail: { message, details, retryable }
  });
  window.dispatchEvent(event);
}

// 工具函数：触发网络错误
export function triggerNetworkError(message: string, details?: string, retryable: boolean = true) {
  const event = new CustomEvent('network_error', {
    detail: { message, details, retryable }
  });
  window.dispatchEvent(event);
}

// 工具函数：触发API错误
export function triggerApiError(message: string, details?: string, retryable: boolean = true) {
  const event = new CustomEvent('api_error', {
    detail: { message, details, retryable }
  });
  window.dispatchEvent(event);
}