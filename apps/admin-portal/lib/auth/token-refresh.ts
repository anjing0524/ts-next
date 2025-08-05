import { TokenStorage } from './token-storage-consolidated';

export interface AuthEventListener {
  onTokenExpired?: () => void;
  onTokenRefreshed?: (newToken: string) => void;
  onRefreshFailed?: (error: Error) => void;
}

export class TokenRefreshManager {
  private static instance: TokenRefreshManager;
  private listeners: AuthEventListener[] = [];
  private refreshPromise: Promise<string> | null = null;
  private autoRefreshActive = false;

  static getInstance(): TokenRefreshManager {
    if (!TokenRefreshManager.instance) {
      TokenRefreshManager.instance = new TokenRefreshManager();
    }
    return TokenRefreshManager.instance;
  }

  addEventListener(listener: AuthEventListener): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  /**
   * 检查令牌是否即将过期
   */
  isTokenExpiringSoon(threshold: number = 300): boolean {
    const remainingTime = TokenStorage.getTokenRemainingTime();
    return remainingTime <= threshold;
  }

  removeEventListener(listener: AuthEventListener): void {
    const index = this.listeners.indexOf(listener);
    if (index > -1) {
      this.listeners.splice(index, 1);
    }
  }

  async refreshTokens(): Promise<void> {
    await this.refreshTokenIfNeeded();
  }

  startAutoRefresh(): void {
    this.autoRefreshActive = true;
  }

  destroy(): void {
    this.autoRefreshActive = false;
    this.listeners = [];
  }

  getTokenStatus() {
    const token = TokenStorage.getInstance().getToken();
    const refreshToken = TokenStorage.getInstance().getRefreshToken();
    
    let isExpired = false;
    let isExpiringSoon = false;
    let timeUntilExpiration = 0;
    
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        const expiry = payload.exp * 1000;
        const now = Date.now();
        timeUntilExpiration = expiry - now;
        isExpired = timeUntilExpiration <= 0;
        isExpiringSoon = timeUntilExpiration < 5 * 60 * 1000;
      } catch (error) {
        isExpired = true;
      }
    }

    return {
      hasAccessToken: !!token,
      hasRefreshToken: !!refreshToken,
      isExpiringSoon,
      isExpired,
      timeUntilExpiration,
      autoRefreshActive: this.autoRefreshActive,
    };
  }

  async refreshTokenIfNeeded(): Promise<string | null> {
    const token = TokenStorage.getInstance().getToken();
    if (!token) {
      return null;
    }

    // Check if token is expired
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const expiry = payload.exp * 1000;
      const now = Date.now();
      
      // If token expires in less than 5 minutes, refresh it
      if (expiry - now < 5 * 60 * 1000) {
        return await this.refreshToken();
      }
      
      return token;
    } catch (error) {
      console.error('Error checking token expiry:', error);
      return null;
    }
  }

  private async refreshToken(): Promise<string> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.performRefresh();
    
    try {
      const newToken = await this.refreshPromise;
      this.listeners.forEach(listener => listener.onTokenRefreshed?.(newToken));
      return newToken;
    } catch (error) {
      this.listeners.forEach(listener => listener.onRefreshFailed?.(error as Error));
      throw error;
    } finally {
      this.refreshPromise = null;
    }
  }

  private async performRefresh(): Promise<string> {
    const refreshToken = TokenStorage.getInstance().getRefreshToken();
    if (!refreshToken) {
      throw new Error('No refresh token available');
    }

    const response = await fetch(`${process.env.NEXT_PUBLIC_OAUTH_SERVICE_URL}/api/v2/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: process.env.NEXT_PUBLIC_OAUTH_CLIENT_ID!,
      }),
    });

    if (!response.ok) {
      throw new Error(`Token refresh failed: ${response.statusText}`);
    }

    const data = await response.json();
    const { access_token, refresh_token } = data;

    TokenStorage.getInstance().setToken(access_token);
    if (refresh_token) {
      TokenStorage.getInstance().setRefreshToken(refresh_token);
    }

    return access_token;
  }
}