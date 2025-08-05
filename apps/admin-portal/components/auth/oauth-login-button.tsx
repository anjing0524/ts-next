'use client';

import { Button } from '@repo/ui';
import { useOAuthLogin, useDefaultOAuthConfig } from '@/hooks/use-oauth-login';

interface OAuthLoginButtonProps {
  className?: string;
  disabled?: boolean;
}

export function OAuthLoginButton({ className, disabled }: OAuthLoginButtonProps) {
  const config = useDefaultOAuthConfig();
  const { isLoading, initiateOAuthFlow } = useOAuthLogin(config);

  const handleOAuthLogin = () => {
    initiateOAuthFlow(false);
  };

  return (
    <Button
      variant="outline"
      onClick={handleOAuthLogin}
      className={`w-full border-2 border-blue-600 text-blue-600 hover:bg-blue-50 font-medium py-2 px-4 rounded-md transition duration-200 ${className || ''}`}
      disabled={disabled || isLoading}
    >
      {isLoading ? (
        <>
          <svg
            className="animate-spin -ml-1 mr-2 h-4 w-4 text-blue-600"
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
          正在重定向...
        </>
      ) : (
        '使用 OAuth 登录'
      )}
    </Button>
  );
}