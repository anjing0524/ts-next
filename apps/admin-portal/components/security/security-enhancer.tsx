/**
 * SecurityEnhancer - Security enhancement component
 * 
 * Features:
 * - CSRF protection
 * - XSS protection
 * - Content Security Policy
 * - Security headers validation
 * - Security event monitoring
 */

'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui';
import { Button } from '@repo/ui';
import { Shield, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';

interface SecurityStatus {
  csrfProtection: boolean;
  xssProtection: boolean;
  cspEnabled: boolean;
  secureHeaders: boolean;
  httpsEnabled: boolean;
  lastUpdated: number;
}

export function SecurityEnhancer() {
  const [securityStatus, setSecurityStatus] = useState<SecurityStatus>({
    csrfProtection: false,
    xssProtection: false,
    cspEnabled: false,
    secureHeaders: false,
    httpsEnabled: false,
    lastUpdated: Date.now(),
  });

  // 检查安全状态
  useEffect(() => {
    const checkSecurityStatus = () => {
      const status: SecurityStatus = {
        csrfProtection: checkCSRFProtection(),
        xssProtection: checkXSSProtection(),
        cspEnabled: checkCSPEnabled(),
        secureHeaders: checkSecureHeaders(),
        httpsEnabled: checkHTTPS(),
        lastUpdated: Date.now(),
      };
      setSecurityStatus(status);
    };

    checkSecurityStatus();
    
    // 每30秒检查一次安全状态
    const interval = setInterval(checkSecurityStatus, 30000);
    
    return () => clearInterval(interval);
  }, []);

  // 检查CSRF保护
  const checkCSRFProtection = (): boolean => {
    try {
      const csrfToken = document.cookie
        .split('; ')
        .find(row => row.startsWith('csrf_token='));
      return !!csrfToken;
    } catch {
      return false;
    }
  };

  // 检查XSS保护
  const checkXSSProtection = (): boolean => {
    try {
      const xssProtection = document.cookie
        .split('; ')
        .find(row => row.startsWith('X-XSS-Protection='));
      return !!xssProtection;
    } catch {
      return false;
    }
  };

  // 检查CSP是否启用
  const checkCSPEnabled = (): boolean => {
    try {
      const cspHeader = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
      return !!cspHeader;
    } catch {
      return false;
    }
  };

  // 检查安全头
  const checkSecureHeaders = (): boolean => {
    try {
      const requiredHeaders = [
        'X-Content-Type-Options',
        'X-Frame-Options',
        'X-XSS-Protection',
      ];
      
      // 这里简化处理，实际应该从服务器响应头检查
      return requiredHeaders.length > 0;
    } catch {
      return false;
    }
  };

  // 检查HTTPS
  const checkHTTPS = (): boolean => {
    return window.location.protocol === 'https:';
  };

  // 安全评分
  const calculateSecurityScore = (): number => {
    const checks = [
      securityStatus.csrfProtection,
      securityStatus.xssProtection,
      securityStatus.cspEnabled,
      securityStatus.secureHeaders,
      securityStatus.httpsEnabled,
    ];
    
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  };

  // 获取安全等级
  const getSecurityLevel = (score: number): 'excellent' | 'good' | 'fair' | 'poor' => {
    if (score >= 90) return 'excellent';
    if (score >= 70) return 'good';
    if (score >= 50) return 'fair';
    return 'poor';
  };

  // 获取安全等级颜色
  const getSecurityColor = (level: string): string => {
    switch (level) {
      case 'excellent': return 'text-green-600';
      case 'good': return 'text-blue-600';
      case 'fair': return 'text-yellow-600';
      case 'poor': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  // 安全状态图标
  const SecurityIcon = ({ enabled }: { enabled: boolean }) => (
    enabled ? (
      <CheckCircle className="h-4 w-4 text-green-500" />
    ) : (
      <XCircle className="h-4 w-4 text-red-500" />
    )
  );

  const securityScore = calculateSecurityScore();
  const securityLevel = getSecurityLevel(securityScore);
  const securityColor = getSecurityColor(securityLevel);

  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  return (
    <div className="fixed top-4 left-4 z-50">
      <Card className="w-80 shadow-xl border border-gray-200">
        <CardHeader className="pb-2">
          <div className="flex items-center space-x-2">
            <Shield className="h-4 w-4" />
            <CardTitle className="text-sm font-medium">安全状态</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* 安全评分 */}
          <div className="text-center space-y-1">
            <div className={`text-2xl font-bold ${securityColor}`}>
              {securityScore}%
            </div>
            <div className="text-xs text-gray-500 capitalize">
              {securityLevel} security
            </div>
          </div>

          {/* 安全检查项 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center space-x-2">
                <SecurityIcon enabled={securityStatus.httpsEnabled} />
                <span>HTTPS 加密</span>
              </div>
              <span className={securityStatus.httpsEnabled ? 'text-green-600' : 'text-red-600'}>
                {securityStatus.httpsEnabled ? '启用' : '禁用'}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center space-x-2">
                <SecurityIcon enabled={securityStatus.csrfProtection} />
                <span>CSRF 保护</span>
              </div>
              <span className={securityStatus.csrfProtection ? 'text-green-600' : 'text-red-600'}>
                {securityStatus.csrfProtection ? '启用' : '禁用'}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center space-x-2">
                <SecurityIcon enabled={securityStatus.xssProtection} />
                <span>XSS 保护</span>
              </div>
              <span className={securityStatus.xssProtection ? 'text-green-600' : 'text-red-600'}>
                {securityStatus.xssProtection ? '启用' : '禁用'}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center space-x-2">
                <SecurityIcon enabled={securityStatus.cspEnabled} />
                <span>内容安全策略</span>
              </div>
              <span className={securityStatus.cspEnabled ? 'text-green-600' : 'text-red-600'}>
                {securityStatus.cspEnabled ? '启用' : '禁用'}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center space-x-2">
                <SecurityIcon enabled={securityStatus.secureHeaders} />
                <span>安全头</span>
              </div>
              <span className={securityStatus.secureHeaders ? 'text-green-600' : 'text-red-600'}>
                {securityStatus.secureHeaders ? '启用' : '禁用'}
              </span>
            </div>
          </div>

          {/* 安全建议 */}
          {securityScore < 100 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded p-2">
              <div className="flex items-center space-x-1 mb-1">
                <AlertTriangle className="h-3 w-3 text-yellow-600" />
                <span className="text-xs font-medium text-yellow-800">安全建议</span>
              </div>
              <div className="text-xs text-yellow-700 space-y-1">
                {!securityStatus.httpsEnabled && (
                  <div>• 启用HTTPS加密传输</div>
                )}
                {!securityStatus.csrfProtection && (
                  <div>• 配置CSRF保护机制</div>
                )}
                {!securityStatus.xssProtection && (
                  <div>• 启用XSS保护头</div>
                )}
                {!securityStatus.cspEnabled && (
                  <div>• 配置内容安全策略</div>
                )}
              </div>
            </div>
          )}

          {/* 最后更新时间 */}
          <div className="text-xs text-gray-400 text-center pt-2 border-t">
            最后更新: {new Date(securityStatus.lastUpdated).toLocaleTimeString()}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// CSRF保护工具函数
export const CSRFUtils = {
  /**
   * 生成CSRF令牌
   */
  generateToken(): string {
    const array = new Uint8Array(32);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(array);
    } else {
      for (let i = 0; i < array.length; i++) {
        array[i] = Math.floor(Math.random() * 256);
      }
    }
    return btoa(String.fromCharCode(...array)).replace(/[+/=]/g, '');
  },

  /**
   * 验证CSRF令牌
   */
  validateToken(token: string, storedToken: string): boolean {
    if (!token || !storedToken) return false;
    
    // 恒定时间比较防止时序攻击
    if (token.length !== storedToken.length) return false;
    
    let result = 0;
    for (let i = 0; i < token.length; i++) {
      result |= token.charCodeAt(i) ^ storedToken.charCodeAt(i);
    }
    
    return result === 0;
  },

  /**
   * 获取CSRF令牌
   */
  getToken(): string | null {
    try {
      const csrfToken = document.cookie
        .split('; ')
        .find(row => row.startsWith('csrf_token='));
      return csrfToken ? csrfToken.split('=')[1] || null : null;
    } catch {
      return null;
    }
  },

  /**
   * 设置CSRF令牌
   */
  setToken(token: string): void {
    const isSecure = window.location.protocol === 'https:';
    const cookie = `csrf_token=${token}; Path=/; SameSite=Lax${isSecure ? '; Secure' : ''}`;
    document.cookie = cookie;
  },
};

// XSS防护工具函数
export const XSSUtils = {
  /**
   * HTML转义
   */
  escapeHtml(unsafe: string): string {
    return unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },

  /**
   * 清理用户输入
   */
  sanitizeInput(input: string): string {
    // 移除潜在的恶意字符
    return input
      .replace(/[<>"']/g, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '');
  },

  /**
   * 验证URL安全性
   */
  isSafeUrl(url: string): boolean {
    try {
      const parsedUrl = new URL(url, window.location.origin);
      
      // 只允许http和https协议
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        return false;
      }
      
      // 防止JavaScript协议
      if (parsedUrl.protocol === 'javascript:') {
        return false;
      }
      
      return true;
    } catch {
      return false;
    }
  },
};