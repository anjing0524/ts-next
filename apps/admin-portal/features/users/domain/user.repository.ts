import { User, CreateUserInput, UpdateUserInput, PaginatedResponse } from './user';

// 用户仓储接口定义
// 2025-07-10：已彻底移除 PaginatedUsersResponse 类型，全部统一为 PaginatedResponse<User>
export interface IUserRepository {
  /**
   * 获取用户分页列表
   * @param params 查询参数
   * @returns 用户分页响应
   */
  getUsers(params?: { offset?: number; limit?: number; search?: string }): Promise<PaginatedResponse<User>>;
  getUserById(userId: string): Promise<User>;
  createUser(userData: CreateUserInput): Promise<User>;
  updateUser(userId: string, userData: UpdateUserInput): Promise<User>;
  deleteUser(userId: string): Promise<void>;
  updateUserProfile(profileData: UpdateUserInput): Promise<User>;
  updatePassword(passwordData: { oldPassword?: string; newPassword?: string }): Promise<void>;
}
