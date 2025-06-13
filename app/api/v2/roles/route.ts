// 文件路径: app/api/v2/roles/route.ts
// 描述: 此文件处理角色 (Role) 集合的 API 请求，包括列出角色 (GET) 和创建新角色 (POST)。
// 使用 `requirePermission` 中间件来保护这些端点，确保只有授权用户才能访问。

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma'; // Prisma ORM 客户端，用于数据库交互。
import { Prisma } from '@prisma/client'; // Prisma 生成的类型，用于高级查询和类型定义。
import { requirePermission, AuthenticatedRequest } from '@/lib/auth/middleware'; // 引入权限控制中间件和认证请求类型。
import { z } from 'zod'; // Zod 库，用于数据验证。

// 定义获取角色列表时分页的默认页面大小。
const DEFAULT_PAGE_SIZE = 10;
// 定义获取角色列表时分页允许的最大页面大小，以防止滥用。
const MAX_PAGE_SIZE = 100;

// --- Zod Schema 定义 ---
// 用于验证创建角色请求体的数据结构和规则。
const CreateRoleSchema = z.object({
  // 角色名称 (内部标识符)
  name: z.string()
    .min(3, "角色名称至少需要3个字符 (Role name must be at least 3 characters long)")
    .max(50, "角色名称不能超过50个字符 (Role name cannot exceed 50 characters long)")
    // 正则表达式确保角色名称只包含字母、数字、下划线、冒号、连字符。
    .regex(/^[a-zA-Z0-9_:-]+$/, "角色名称只能包含字母、数字、下划线、冒号和连字符 (Role name can only contain letters, numbers, underscores, colons, and hyphens)"),
  // 角色显示名称 (用于UI展示)
  displayName: z.string()
    .min(1, "显示名称不能为空 (Display name cannot be empty)")
    .max(100, "显示名称不能超过100个字符 (Display name cannot exceed 100 characters long)"),
  // 角色描述 (可选)
  description: z.string()
    .max(255, "描述信息不能超过255个字符 (Description cannot exceed 255 characters long)")
    .optional(), // 描述是可选的
  // 角色是否激活 (可选，默认为 true)
  isActive: z.boolean().optional().default(true),
});

/**
 * GET /api/v2/roles - 列出所有角色 (支持分页和过滤)
 * 此处理函数响应 GET 请求，返回系统中的角色列表。
 * 支持通过查询参数进行分页 (`page`, `pageSize`)、按名称过滤 (`name`) 和按激活状态过滤 (`isActive`)。
 * 需要 'roles:list' 权限才能访问。
 * @param req AuthenticatedRequest - 经过认证的请求对象，包含用户信息。
 * @returns NextResponse - 包含角色列表和分页信息的 JSON 响应。
 */
async function listRolesHandler(req: AuthenticatedRequest): Promise<NextResponse> {
  // 从请求 URL 中解析查询参数。
  const { searchParams } = new URL(req.url);

  // 处理分页参数。
  const page = parseInt(searchParams.get('page') || '1', 10); // 页码，默认为1。
  let pageSize = parseInt(searchParams.get('pageSize') || DEFAULT_PAGE_SIZE.toString(), 10); // 每页数量，默认为 DEFAULT_PAGE_SIZE。
  // 限制 pageSize 在 1 到 MAX_PAGE_SIZE 之间。
  pageSize = Math.min(Math.max(pageSize, 1), MAX_PAGE_SIZE);

  // 处理过滤参数。
  const nameQuery = searchParams.get('name'); // 按角色名称 (name) 过滤。
  const isActiveQuery = searchParams.get('isActive'); // 按角色激活状态 (isActive) 过滤 ('true' 或 'false')。

  // 构建 Prisma 查询的 `where` 条件。
  const where: Prisma.RoleWhereInput = {};
  if (nameQuery) {
    // 如果提供了 nameQuery，则添加名称包含查询 (不区分大小写)。
    where.name = { contains: nameQuery, mode: 'insensitive' };
  }
  if (isActiveQuery !== null) {
    // 如果提供了 isActiveQuery，则转换为布尔值并添加到查询条件。
    where.isActive = isActiveQuery === 'true';
  }

  try {
    // 使用 Prisma Client 从数据库查询角色列表。
    const roles = await prisma.role.findMany({
      where, // 应用过滤条件。
      skip: (page - 1) * pageSize, // 计算跳过的记录数，用于分页。
      take: pageSize,             // 获取指定数量的记录。
      orderBy: { createdAt: 'desc' }, // 按创建时间降序排序。
    });
    // 获取满足过滤条件的角色总数，用于计算总页数。
    const totalRoles = await prisma.role.count({ where });

    // 返回包含角色数据和分页信息的 JSON 响应。
    return NextResponse.json({
      data: roles,
      pagination: {
        page,
        pageSize,
        totalItems: totalRoles,
        totalPages: Math.ceil(totalRoles / pageSize),
      },
    });
  } catch (error) {
    // 错误处理：记录错误并返回500服务器错误。
    console.error('列出角色失败 (Failed to list roles):', error);
    return NextResponse.json({ message: '获取角色列表失败 (Failed to retrieve roles list)' }, { status: 500 });
  }
}

/**
 * POST /api/v2/roles - 创建新角色
 * 此处理函数响应 POST 请求，用于在系统中创建一个新的角色。
 * 请求体需要符合 `CreateRoleSchema` 定义的结构和规则。
 * 需要 'roles:create' 权限才能访问。
 * @param req AuthenticatedRequest - 经过认证的请求对象。
 * @returns NextResponse - 包含新创建的角色信息或错误信息的 JSON 响应。
 */
async function createRoleHandler(req: AuthenticatedRequest): Promise<NextResponse> {
  let body;
  try {
    // 解析请求体中的 JSON 数据。
    body = await req.json();
  } catch (e) {
    // 如果请求体不是有效的 JSON，返回400错误。
    return NextResponse.json({ message: '无效的JSON请求体 (Invalid JSON request body)' }, { status: 400 });
  }

  // 使用 Zod Schema 验证请求体数据。
  const validationResult = CreateRoleSchema.safeParse(body);
  if (!validationResult.success) {
    // 如果验证失败，返回400错误，并包含详细的验证错误信息。
    return NextResponse.json({
      message: '创建角色验证失败 (Role creation input validation failed)',
      errors: validationResult.error.format(), // Zod 格式化的错误信息。
    }, { status: 400 });
  }

  // 从验证成功的数据中解构出角色属性。
  const { name, displayName, description, isActive } = validationResult.data;

  try {
    // 步骤 1: 检查角色名称 (name) 是否已存在，因为角色名称需要唯一。
    const existingRole = await prisma.role.findUnique({ where: { name } });
    if (existingRole) {
      // 如果角色名称已存在，返回409 Conflict错误。
      return NextResponse.json({ message: `角色名称 "${name}" 已存在 (Role name "${name}" already exists)` }, { status: 409 });
    }

    // 步骤 2: 在数据库中创建新角色。
    const newRole = await prisma.role.create({
      data: {
        name,
        displayName,
        description: description || null, // 如果 description 未提供，则在数据库中存储为 null。
        isActive, // isActive 由 Zod Schema 提供了默认值 true (如果请求中未指定)。
      },
    });
    // 返回新创建的角色信息，HTTP状态码为 201 Created。
    return NextResponse.json(newRole, { status: 201 });
  } catch (error) {
    // 错误处理：
    console.error('创建角色失败 (Failed to create role):', error);
    // 捕获 Prisma 特定的唯一约束冲突错误 (P2002)，尽管上面的检查应该已经覆盖了 name 的唯一性。
    // 这可以作为一道额外的防线，或者如果数据库层面还有其他唯一约束。
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ message: `角色名称 "${name}" 已存在 (Role name "${name}" already exists due to a database constraint)` }, { status: 409 });
    }
    // 返回通用服务器错误。
    return NextResponse.json({ message: '创建角色时发生服务器错误 (An unexpected server error occurred during role creation)' }, { status: 500 });
  }
}

// 使用 `requirePermission` 中间件包装处理函数，并导出为相应的 HTTP 方法。
// GET 请求需要 'roles:list' 权限。
export const GET = requirePermission('roles:list')(listRolesHandler);
// POST 请求需要 'roles:create' 权限。
export const POST = requirePermission('roles:create')(createRoleHandler);

[end of app/api/v2/roles/route.ts]
