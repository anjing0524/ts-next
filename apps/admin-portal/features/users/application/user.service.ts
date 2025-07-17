// 用户服务实现
// 2025-07-10：已彻底移除 PaginatedUsersResponse 类型，全部统一为 PaginatedResponse<User>
import { IUserRepository } from '../domain/user.repository';
import { User, CreateUserInput, UpdateUserInput, PaginatedResponse } from '../domain/user';

export class UserService {
  constructor(private userRepository: IUserRepository) {}

  async getUsers(params?: {
    offset?: number;
    limit?: number;
    search?: string;
  }): Promise<PaginatedResponse<User>> {
    return this.userRepository.getUsers(params);
  }

  async getUserById(userId: string): Promise<User> {
    return this.userRepository.getUserById(userId);
  }

  async createUser(userData: CreateUserInput): Promise<User> {
    // 在这里可以添加业务规则，例如检查用户名是否已存在，验证密码强度等。
    return this.userRepository.createUser(userData);
  }

  async updateUser(userId: string, userData: UpdateUserInput): Promise<User> {
    // 在这里可以添加业务规则，例如检查用户名是否已存在，验证密码强度等。
    return this.userRepository.updateUser(userId, userData);
  }

  async deleteUser(userId: string): Promise<void> {
    // 在这里可以添加业务规则，例如检查用户名是否已存在，验证密码强度等。
    return this.userRepository.deleteUser(userId);
  }

  async updateUserProfile(profileData: UpdateUserInput): Promise<User> {
    return this.userRepository.updateUserProfile(profileData);
  }

  async updatePassword(passwordData: {
    oldPassword?: string;
    newPassword?: string;
  }): Promise<void> {
    return this.userRepository.updatePassword(passwordData);
  }
}
