/**
 * AuthStatusMonitor - Component for monitoring authentication status
 * 
 * Features:
 * - Token expiration warnings
 * - Network status monitoring
 * - Session timeout handling
 * - User-friendly notifications
 */

'use client';

import React, { useState, useEffect } from 'react';
import { useAuthHook } from '@/hooks/use-auth-hook';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui';
import { Button } from '@repo/ui';

export function AuthStatusMonitor() {
  const {
    isAuthenticated,
    tokenStatus,
    getTokenRemainingTime,
    forceTokenRefresh,
    onTokenRefreshed,
    onSessionExpired,
    onAuthError,
  } = useAuthHook();

  const [showWarning, setShowWarning] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [networkStatus, setNetworkStatus] = useState<'online' | 'offline'>('online');

  // 监听网络状态
  useEffect(() => {
    const handleOnline = () => setNetworkStatus('online');
    const handleOffline = () => setNetworkStatus('offline');

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // 监听令牌状态
  useEffect(() => {
    if (!isAuthenticated) return;

    const checkTokenStatus = () => {
      const remaining = getTokenRemainingTime();
      setTimeRemaining(remaining);
      
      // 显示警告如果令牌在5分钟内过期
      setShowWarning(remaining > 0 && remaining < 300);
    };

    checkTokenStatus();
    const interval = setInterval(checkTokenStatus, 30000); // 每30秒检查一次

    return () => clearInterval(interval);
  }, [isAuthenticated, getTokenRemainingTime]);

  // 监听令牌刷新事件
  useEffect(() => {
    const unsubscribeRefreshed = onTokenRefreshed(() => {
      // 令牌刷新成功，隐藏警告
      setShowWarning(false);
    });

    const unsubscribeExpired = onSessionExpired(() => {
      // 会话过期，重定向到登录页
      window.location.href = '/login';
    });

    const unsubscribeError = onAuthError((error) => {
      console.error('Authentication error:', error);
    });

    return () => {
      unsubscribeRefreshed();
      unsubscribeExpired();
      unsubscribeError();
    };
  }, [onTokenRefreshed, onSessionExpired, onAuthError]);

  // 格式化时间显示
  const formatTime = (seconds: number): string => {
    if (seconds < 60) return `${Math.floor(seconds)}秒`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}分钟`;
    return `${Math.floor(seconds / 3600)}小时`;
  };

  // 处理手动刷新令牌
  const handleRefreshToken = async () => {
    try {
      await forceTokenRefresh();
      setShowWarning(false);
    } catch (error) {
      console.error('Failed to refresh token:', error);
    }
  };

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className=\"fixed bottom-4 right-4 z-50 space-y-2\">
      {/* 网络状态指示器 */}
      {networkStatus === 'offline' && (
        <Card className=\"w-80 bg-yellow-50 border-yellow-200\">
          <CardContent className=\"p-4\">
            <div className=\"flex items-center space-x-2\">
              <div className=\"w-3 h-3 bg-yellow-500 rounded-full animate-pulse\"></div>
              <span className=\"text-sm text-yellow-800\">网络连接已断开</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 令牌过期警告 */}
      {showWarning && (
        <Card className=\"w-80 bg-orange-50 border-orange-200\">
          <CardHeader className=\"pb-2\">
            <CardTitle className=\"text-sm font-medium text-orange-800\">
              会话即将过期
            </CardTitle>
            <CardDescription className=\"text-xs text-orange-600\">
              您的会话将在 {formatTime(timeRemaining)} 后过期
            </CardDescription>
          </CardHeader>
          <CardContent className=\"pt-0\">
            <Button
              onClick={handleRefreshToken}
              size=\"sm\"
              className=\"w-full bg-orange-600 hover:bg-orange-700 text-white\"
            >
              刷新会话
            </Button>
          </CardContent>
        </Card>
      )}

      {/* 调试信息（开发环境） */}
      {process.env.NODE_ENV === 'development' && (
        <Card className=\"w-80 bg-gray-50 border-gray-200\">
          <CardHeader className=\"pb-2\">
            <CardTitle className=\"text-sm font-medium text-gray-800\">
              认证状态
            </CardTitle>
          </CardHeader>
          <CardContent className=\"pt-0 space-y-1\">
            <div className=\"text-xs text-gray-600\">
              <div>访问令牌: {tokenStatus.hasAccessToken ? '✓' : '✗'}</div>
              <div>刷新令牌: {tokenStatus.hasRefreshToken ? '✓' : '✗'}</div>
              <div>自动刷新: {tokenStatus.autoRefreshActive ? '✓' : '✗'}</div>
              <div>即将过期: {tokenStatus.isExpiringSoon ? '⚠️' : '✓'}</div>
              <div>已过期: {tokenStatus.isExpired ? '✗' : '✓'}</div>
              {timeRemaining > 0 && (
                <div>剩余时间: {formatTime(timeRemaining)}</div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}