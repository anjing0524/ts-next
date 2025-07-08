import { IAuthRepository } from '../domain/auth.repository';
import { User } from '../../users/domain/user';

export class AuthService {
  constructor(private authRepository: IAuthRepository) {}

  async login(username: string, password: string): Promise<{ accessToken: string; refreshToken: string; expiresIn: number; refreshExpiresIn: number }> {
    return this.authRepository.login({ username, password });
  }

  async logout(refreshToken: string): Promise<void> {
    return this.authRepository.logout(refreshToken);
  }

  async refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; refreshToken: string; expiresIn: number; refreshExpiresIn: number }> {
    return this.authRepository.refreshAccessToken(refreshToken);
  }

  async fetchUserProfile(): Promise<User> {
    return this.authRepository.fetchUserProfile();
  }
}
