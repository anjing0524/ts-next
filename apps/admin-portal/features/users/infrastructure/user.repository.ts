import { adminApi, PaginatedResponse } from '../../../lib/api';
import { IUserRepository } from '../domain/user.repository';
import { User, CreateUserInput, UpdateUserInput } from '../domain/user';

export class UserRepository implements IUserRepository {
  async getUsers(params?: { offset?: number; limit?: number; search?: string }): Promise<PaginatedResponse<User>> {
    return adminApi.getUsers(params);
  }

  async getUserById(userId: string): Promise<User> {
    return adminApi.getUserById(userId);
  }

  async createUser(userData: CreateUserInput): Promise<User> {
    return adminApi.createUser(userData);
  }

  async updateUser(userId: string, userData: UpdateUserInput): Promise<User> {
    return adminApi.updateUser(userId, userData);
  }

  async deleteUser(userId: string): Promise<void> {
    return adminApi.deleteUser(userId);
  }

  async updateUserProfile(profileData: UpdateUserInput): Promise<User> {
    return adminApi.updateUserProfile(profileData);
  }

  async updatePassword(passwordData: { oldPassword?: string; newPassword?: string }): Promise<void> {
    return adminApi.updatePassword(passwordData);
  }
}
