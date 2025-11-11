import { authApi } from '../../../lib/api';
import { IAuthRepository } from '../domain/auth.repository';
import { User } from '../../users/domain/user';
import { TokenPayload } from '@/types/auth';

export class AuthRepository implements IAuthRepository {
  async login(credentials: {
    username: string;
    password: string;
  }): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    refreshExpiresIn: number;
  }> {
    return authApi.login({ grant_type: 'password', ...credentials });
  }

  async logout(refreshToken: string): Promise<void> {
    return authApi.logout();
  }

  async refreshAccessToken(
    refreshToken: string
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    refreshExpiresIn: number;
  }> {
    // authApi.refreshAccessToken is not directly exposed, it's handled internally by apiFetch
    // For now, we'll simulate or adjust authApi to expose it if needed.
    // As per lib/api.ts, refreshAccessToken is handled by apiFetch internally.
    // This method might not be directly callable from outside authApi.
    // If the backend has a dedicated refresh endpoint, we should call it here.
    // Assuming authApi.refreshAccessToken is a placeholder for a direct call to the backend's refresh endpoint.
    throw new Error(
      'Method not implemented: refreshAccessToken. It is handled internally by apiFetch.'
    );
  }

  async fetchUserProfile(): Promise<User> {
    return authApi.fetchUserProfile();
  }
}
