// 用户仓储实现
// 2025-07-10：已彻底移除 PaginatedUsersResponse 类型，全部统一为 PaginatedResponse<User>
import { api } from '../../../lib/api';
import { IUserRepository } from '../domain/user.repository';
import { User } from '@/types/auth';
import { PaginatedResponse } from '../domain/user';

export class UserRepository implements IUserRepository {
  /**
   * 获取用户分页列表
   * @param params 查询参数
   * @returns 用户分页响应
   */
  async getUsers(params?: {
    offset?: number;
    limit?: number;
    search?: string;
  }): Promise<PaginatedResponse<User>> {
    // 兼容 meta 字段结构，补齐 itemCount 字段
    const res = (await api.getUsers(params)) as any;
    return {
      ...res,
      meta: {
        ...res.meta,
        itemCount: res.meta.itemCount ?? res.meta.totalItems ?? 0,
      },
    };
  }

  async getUserById(userId: string): Promise<User> {
    return api.getUserById(userId) as Promise<User>;
  }

  async createUser(userData: any): Promise<User> {
    // 断言返回 User
    return api.createUser(userData) as unknown as Promise<User>;
  }

  async updateUser(userId: string, userData: any): Promise<User> {
    // 断言返回 User
    return api.updateUser(userId, userData) as unknown as Promise<User>;
  }

  async deleteUser(userId: string): Promise<void> {
    // 断言返回 void
    return api.deleteUser(userId) as unknown as Promise<void>;
  }

  async updateUserProfile(profileData: any): Promise<User> {
    // 断言返回 User
    return api.updateUserProfile(profileData) as unknown as Promise<User>;
  }

  async updatePassword(passwordData: any): Promise<void> {
    // 断言返回 void
    return api.updatePassword(passwordData) as unknown as Promise<void>;
  }
}
