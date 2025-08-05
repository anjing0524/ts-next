'use client';

import { Button, Input, Label } from '@repo/ui';
import { useOAuthLogin, useDefaultOAuthConfig } from '@/hooks/use-oauth-login';
import { useLoginForm, LoginCredentials } from '@/hooks/use-login-form';

interface UsernamePasswordFormProps {
  className?: string;
}

export function UsernamePasswordForm({ className }: UsernamePasswordFormProps) {
  const config = useDefaultOAuthConfig();
  const { isLoading, error, initiateOAuthFlow, clearError } = useOAuthLogin(config);
  const { credentials, updateCredentials, setError } = useLoginForm();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate form
    if (!credentials.username.trim() || !credentials.password.trim()) {
      setError('请输入用户名和密码');
      return;
    }

    initiateOAuthFlow(true, credentials);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    updateCredentials(name as keyof LoginCredentials, value);
    clearError();
  };

  return (
    <form onSubmit={handleSubmit} className={`space-y-4 ${className || ''}`}>
      <div className="space-y-2">
        <Label htmlFor="username">用户名</Label>
        <Input
          id="username"
          name="username"
          type="text"
          placeholder="请输入用户名"
          value={credentials.username}
          onChange={handleInputChange}
          required
          className="w-full"
          data-testid="username-input"
        />
      </div>
      
      <div className="space-y-2">
        <Label htmlFor="password">密码</Label>
        <Input
          id="password"
          name="password"
          type="password"
          placeholder="请输入密码"
          value={credentials.password}
          onChange={handleInputChange}
          required
          className="w-full"
          data-testid="password-input"
        />
      </div>

      {error && (
        <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
          {error}
        </div>
      )}

      <Button
        type="submit"
        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md transition duration-200"
        disabled={isLoading}
        data-testid="login-button"
      >
        {isLoading ? (
          <>
            <svg
              className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
            登录中...
          </>
        ) : (
          '登录'
        )}
      </Button>
    </form>
  );
}