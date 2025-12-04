"use server";

import {
  serverActionTemplate,
  ActionError,
  type ActionResult,
  normalizePagination,
  normalizeSort,
  type PaginationInput,
  type SortInput,
} from "../base";

/**
 * 用户管理 Server Actions
 * User Management Server Actions
 */

export interface User {
  id: string;
  email: string;
  name?: string;
  role?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ListUsersInput extends PaginationInput, SortInput {
  search?: string;
  role?: string;
}

export interface UpdateUserInput {
  id: string;
  email?: string;
  name?: string;
  role?: string;
}

/**
 * 获取用户列表
 * Fetch users list
 *
 * @param input - 查询参数 / Query parameters
 * @returns 用户列表 / Users list with pagination
 */
export async function fetchUsers(
  input: ListUsersInput = {}
): Promise<ActionResult<{ users: User[]; total: number }>> {
  return serverActionTemplate(
    async () => {
      const { pageSize, offset } = normalizePagination(input);
      const { sortBy, sortOrder } = normalizeSort(input);

      // TODO: 实现实际的 API 调用 / Implement actual API call
      // 示例：const response = await api.getUsers({ offset, pageSize, sortBy, sortOrder, search: input.search });
      // Example: const response = await api.getUsers({ offset, pageSize, sortBy, sortOrder, search: input.search });

      console.log("[fetchUsers]", {
        offset,
        pageSize,
        sortBy,
        sortOrder,
        search: input.search,
      });

      // 返回空结果用于演示 / Return empty result for demonstration
      return {
        users: [],
        total: 0,
      };
    },
    {
      invalidateTags: ["users"],
    }
  );
}

/**
 * 获取单个用户详情
 * Fetch user by ID
 *
 * @param userId - 用户 ID / User ID
 * @returns 用户详情 / User details
 */
export async function fetchUser(userId: string): Promise<ActionResult<User>> {
  return serverActionTemplate(async () => {
    if (!userId || userId.trim() === "") {
      throw new ActionError("User ID is required", "INVALID_INPUT", 400);
    }

    // TODO: 实现实际的 API 调用 / Implement actual API call
    // const response = await api.getUser(userId);

    console.log("[fetchUser]", { userId });

    throw new ActionError("Not implemented", "NOT_IMPLEMENTED", 501);
  });
}

/**
 * 更新用户
 * Update user
 *
 * @param input - 更新数据 / Update data
 * @returns 更新后的用户 / Updated user
 */
export async function updateUser(input: UpdateUserInput): Promise<ActionResult<User>> {
  return serverActionTemplate(
    async () => {
      if (!input.id || input.id.trim() === "") {
        throw new ActionError("User ID is required", "INVALID_INPUT", 400);
      }

      // TODO: 权限验证 / Validate permissions
      // const auth = await getAuthContext();
      // if (!auth.permissions?.includes("admin:update-users")) {
      //   throw new ActionError("Insufficient permissions", "FORBIDDEN", 403);
      // }

      // TODO: 实现实际的 API 调用 / Implement actual API call
      // const response = await api.updateUser(input.id, input);

      console.log("[updateUser]", input);

      throw new ActionError("Not implemented", "NOT_IMPLEMENTED", 501);
    },
    {
      invalidateTags: ["users", `user-${input.id}`],
    }
  );
}

/**
 * 删除用户
 * Delete user
 *
 * @param userId - 用户 ID / User ID
 * @returns 删除结果 / Deletion result
 */
export async function deleteUser(userId: string): Promise<ActionResult<{ success: boolean }>> {
  return serverActionTemplate(
    async () => {
      if (!userId || userId.trim() === "") {
        throw new ActionError("User ID is required", "INVALID_INPUT", 400);
      }

      // TODO: 权限验证 / Validate permissions
      // const auth = await getAuthContext();
      // if (!auth.permissions?.includes("admin:delete-users")) {
      //   throw new ActionError("Insufficient permissions", "FORBIDDEN", 403);
      // }

      // TODO: 实现实际的 API 调用 / Implement actual API call
      // await api.deleteUser(userId);

      console.log("[deleteUser]", { userId });

      return { success: true };
    },
    {
      invalidateTags: ["users", `user-${userId}`],
    }
  );
}
