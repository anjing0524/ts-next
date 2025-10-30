/**
 * AuthStatusMonitor - Component for monitoring authentication status
 *
 * Features:
 * - Network status monitoring
 * - Session timeout handling
 */

'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/components/auth/auth-provider';
import { Card, CardContent } from '@repo/ui';

export function AuthStatusMonitor() {
  const {
    isAuthenticated,
  } = useAuth();

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

  // 监听认证状态变化
  useEffect(() => {
    if (!isAuthenticated) {
      // 会话过期，重定向到登录页
      window.location.href = '/login';
    }
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2">
      {/* 网络状态指示器 */}
      {networkStatus === 'offline' && (
        <Card className="w-80 bg-yellow-50 border-yellow-200">
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-yellow-500 rounded-full animate-pulse"></div>
              <span className="text-sm text-yellow-800">网络连接已断开</span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}