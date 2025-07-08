import { User, CreateUserInput, UpdateUserInput, PaginatedUsersResponse } from './user';

export interface IUserRepository {
  getUsers(params?: { offset?: number; limit?: number; search?: string }): Promise<PaginatedUsersResponse>;
  getUserById(userId: string): Promise<User>;
  createUser(userData: CreateUserInput): Promise<User>;
  updateUser(userId: string, userData: UpdateUserInput): Promise<User>;
  deleteUser(userId: string): Promise<void>;
  updateUserProfile(profileData: UpdateUserInput): Promise<User>;
  updatePassword(passwordData: { oldPassword?: string; newPassword?: string }): Promise<void>;
}
