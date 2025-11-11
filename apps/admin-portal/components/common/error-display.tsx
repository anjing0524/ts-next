'use client';

import { AlertCircle, RefreshCw, XCircle, AlertTriangle, CheckCircle, Info } from 'lucide-react';
import { Button } from '@repo/ui';

interface ErrorDisplayProps {
  error: Error | null;
  title?: string;
  message?: string;
  onRetry?: () => void;
  onClose?: () => void;
  className?: string;
  variant?: 'error' | 'warning' | 'info' | 'success';
  showStackTrace?: boolean;
  actions?: React.ReactNode;
  icon?: React.ReactNode;
}

export function ErrorDisplay({ 
  error, 
  title,
  message,
  onRetry, 
  onClose, 
  className = '',
  variant = 'error',
  showStackTrace = false,
  actions,
  icon 
}: ErrorDisplayProps) {
  const getVariantConfig = () => {
    switch (variant) {
      case 'warning':
        return {
          title: title || '警告',
          bgColor: 'bg-yellow-50',
          borderColor: 'border-yellow-200',
          textColor: 'text-yellow-800',
          iconColor: 'text-yellow-600',
          icon: icon || <AlertTriangle className="h-5 w-5" />
        };
      case 'info':
        return {
          title: title || '提示',
          bgColor: 'bg-blue-50',
          borderColor: 'border-blue-200',
          textColor: 'text-blue-800',
          iconColor: 'text-blue-600',
          icon: icon || <Info className="h-5 w-5" />
        };
      case 'success':
        return {
          title: title || '成功',
          bgColor: 'bg-green-50',
          borderColor: 'border-green-200',
          textColor: 'text-green-800',
          iconColor: 'text-green-600',
          icon: icon || <CheckCircle className="h-5 w-5" />
        };
      default:
        return {
          title: title || '发生错误',
          bgColor: 'bg-red-50',
          borderColor: 'border-red-200',
          textColor: 'text-red-800',
          iconColor: 'text-red-600',
          icon: icon || <AlertCircle className="h-5 w-5" />
        };
    }
  };

  const config = getVariantConfig();
  const errorMessage = message || (error?.message) || '未知错误';

  if (!error && !message) return null;

  return (
    <div className={`p-4 border ${config.borderColor} ${config.bgColor} rounded-lg ${className}`}>
      <div className="flex items-start space-x-3">
        <div className={config.iconColor} data-testid="alert-icon">
          {config.icon}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className={`text-sm font-medium ${config.textColor}`}>
            {config.title}
          </h3>
          <p className={`mt-1 text-sm ${config.textColor}`}>
            {errorMessage}
          </p>
          
          {showStackTrace && error?.stack && (
            <div className="mt-3 p-3 bg-white rounded border border-gray-200">
              <pre className="text-xs text-gray-600 whitespace-pre-wrap overflow-x-auto">
                {error.stack}
              </pre>
            </div>
          )}

          {(onRetry || onClose || actions) && (
            <div className="mt-3 flex space-x-2">
              {onRetry && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onRetry}
                  className={`${config.textColor} ${config.borderColor} hover:${config.bgColor}`}
                >
                  <RefreshCw className="h-4 w-4 mr-1" />
                  重试
                </Button>
              )}
              {onClose && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onClose}
                  className={`${config.textColor} ${config.borderColor} hover:${config.bgColor}`}
                >
                  <XCircle className="h-4 w-4 mr-1" />
                  关闭
                </Button>
              )}
              {actions}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}