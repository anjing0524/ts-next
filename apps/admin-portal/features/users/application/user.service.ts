import { IUserRepository } from '../domain/user.repository';
import { User, CreateUserInput, UpdateUserInput, PaginatedUsersResponse } from '../domain/user';

export class UserService {
  constructor(private userRepository: IUserRepository) {}

  async getUsers(params?: { offset?: number; limit?: number; search?: string }): Promise<PaginatedUsersResponse> {
    return this.userRepository.getUsers(params);
  }

  async getUserById(userId: string): Promise<User> {
    return this.userRepository.getUserById(userId);
  }

  async createUser(userData: CreateUserInput): Promise<User> {
    // Here you can add business rules before creating a user
    // For example, check if username already exists, validate password strength, etc.
    return this.userRepository.createUser(userData);
  }

  async updateUser(userId: string, userData: UpdateUserInput): Promise<User> {
    // Here you can add business rules before updating a user
    return this.userRepository.updateUser(userId, userData);
  }

  async deleteUser(userId: string): Promise<void> {
    // Here you can add business rules before deleting a user
    return this.userRepository.deleteUser(userId);
  }

  async updateUserProfile(profileData: UpdateUserInput): Promise<User> {
    return this.userRepository.updateUserProfile(profileData);
  }

  async updatePassword(passwordData: { oldPassword?: string; newPassword?: string }): Promise<void> {
    return this.userRepository.updatePassword(passwordData);
  }
}
