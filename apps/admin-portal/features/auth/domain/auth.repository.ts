import { User } from '../../users/domain/user';
import { TokenPayload } from '@/types/auth';

export interface IAuthRepository {
  login(credentials: {
    username: string;
    password: string;
  }): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    refreshExpiresIn: number;
  }>;
  logout(refreshToken: string): Promise<void>;
  refreshAccessToken(
    refreshToken: string
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    refreshExpiresIn: number;
  }>;
  fetchUserProfile(): Promise<User>;
}
