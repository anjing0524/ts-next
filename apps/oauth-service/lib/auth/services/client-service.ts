/**
 * OAuth客户端管理服务类
 * OAuth Client Management Service Class
 *
 * 提供完整的OAuth客户端CRUD操作、密钥管理、权限控制
 * Provides complete OAuth client CRUD operations, key management, and access control
 *
 * @author OAuth团队
 * @since 1.0.0
 */

import { ClientType, OAuthClient, prisma } from '@repo/database';
import { AuthorizationUtils } from '@repo/lib/node';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { OAuth2Error, OAuth2ErrorCode } from '../../errors';

/**
 * 客户端创建参数接口
 * Client creation parameters interface
 */
export interface CreateClientParams {
  name: string;
  description?: string;
  clientType: ClientType;
  redirectUris: string[];
  grantTypes: string[];
  responseTypes: string[];
  allowedScopes: string[];
  logoUri?: string;
  policyUri?: string;
  tosUri?: string;
  requirePkce?: boolean;
  requireConsent?: boolean;
  ipWhitelist?: string[];
  accessTokenTtl?: number;
  refreshTokenTtl?: number;
  authorizationCodeLifetime?: number;
}

/**
 * 客户端更新参数接口
 * Client update parameters interface
 */
export interface UpdateClientParams {
  name?: string;
  description?: string;
  redirectUris?: string[];
  grantTypes?: string[];
  responseTypes?: string[];
  allowedScopes?: string[];
  logoUri?: string;
  policyUri?: string;
  tosUri?: string;
  requirePkce?: boolean;
  requireConsent?: boolean;
  ipWhitelist?: string[];
  accessTokenTtl?: number;
  refreshTokenTtl?: number;
  authorizationCodeLifetime?: number;
  isActive?: boolean;
}

/**
 * 客户端查询参数接口
 * Client query parameters interface
 */
export interface ClientQueryParams {
  clientType?: ClientType;
  isActive?: boolean;
  name?: string;
  limit?: number;
  offset?: number;
}

/**
 * OAuth客户端管理服务
 * OAuth Client Management Service
 *
 * 采用静态方法模式，提供完整的客户端管理功能
 * Uses static method pattern to provide complete client management functionality
 */
export class ClientService {
  /**
   * 创建新的OAuth客户端
   * Create a new OAuth client
   *
   * @param params - 客户端创建参数 (Client creation parameters)
   * @param auditInfo - 审计信息 (Audit information)
   * @returns 创建的客户端信息 (Created client information)
   */
  static async createClient(
    params: CreateClientParams,
    auditInfo: {
      userId?: string;
      ipAddress?: string;
      userAgent?: string;
    }
  ): Promise<OAuthClient> {
    try {
      // 验证参数
      // Validate parameters
      ClientService.validateCreateParams(params);

      // 生成客户端ID和密钥（如果需要）
      // Generate client ID and secret (if needed)
      const clientId = ClientService.generateClientId();
      let clientSecret: string | null = null;

      if (params.clientType === ClientType.CONFIDENTIAL) {
        clientSecret = ClientService.generateClientSecret();
      }

      // 创建客户端记录
      // Create client record
      const client = await prisma.oAuthClient.create({
        data: {
          clientId,
          clientSecret: clientSecret ? await bcrypt.hash(clientSecret, 12) : null,
          name: params.name,
          description: params.description,
          clientType: params.clientType,
          redirectUris: JSON.stringify(params.redirectUris),
          grantTypes: JSON.stringify(params.grantTypes),
          responseTypes: JSON.stringify(params.responseTypes),
          allowedScopes: JSON.stringify(params.allowedScopes),
          logoUri: params.logoUri,
          policyUri: params.policyUri,
          tosUri: params.tosUri,
          requirePkce: params.requirePkce ?? true,
          requireConsent: params.requireConsent ?? true,
          ipWhitelist: params.ipWhitelist ? JSON.stringify(params.ipWhitelist) : null,
          accessTokenTtl: params.accessTokenTtl ?? 3600,
          refreshTokenTtl: params.refreshTokenTtl ?? 2592000,
          authorizationCodeLifetime: params.authorizationCodeLifetime ?? 600,
        },
      });

      // 记录审计日志
      // Record audit log
      await AuthorizationUtils.logAuditEvent({
        userId: auditInfo.userId,
        clientId: client.id,
        action: 'client_created',
        resource: `client:${client.clientId}`,
        ipAddress: auditInfo.ipAddress,
        userAgent: auditInfo.userAgent,
        success: true,
        metadata: {
          clientName: params.name,
          clientType: params.clientType,
        },
      });

      // 返回客户端信息（包含明文密钥）
      // Return client information (including plaintext secret)
      return {
        ...client,
        clientSecret: clientSecret, // 仅在创建时返回明文密钥
      } as OAuthClient;
    } catch (error) {
      // 记录失败的审计日志
      // Record failure audit log
      await AuthorizationUtils.logAuditEvent({
        userId: auditInfo.userId,
        action: 'client_create_failed',
        resource: 'client:unknown',
        ipAddress: auditInfo.ipAddress,
        userAgent: auditInfo.userAgent,
        success: false,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });

      throw new OAuth2Error(
        'Failed to create OAuth client',
        OAuth2ErrorCode.ServerError,
        500,
        error instanceof Error ? error.message : undefined
      );
    }
  }

  /**
   * 根据ID获取客户端信息
   * Get client information by ID
   *
   * @param clientId - 客户端ID (Client ID)
   * @returns 客户端信息 (Client information)
   */
  static async getClientById(clientId: string): Promise<OAuthClient | null> {
    try {
      return await prisma.oAuthClient.findUnique({
        where: { id: clientId },
      });
    } catch (error) {
      throw new OAuth2Error(
        'Failed to retrieve client',
        OAuth2ErrorCode.ServerError,
        500,
        error instanceof Error ? error.message : undefined
      );
    }
  }

  /**
   * 根据客户端ID获取客户端信息
   * Get client information by client ID
   *
   * @param clientId - 客户端标识符 (Client identifier)
   * @returns 客户端信息 (Client information)
   */
  static async getClientByClientId(clientId: string): Promise<OAuthClient | null> {
    try {
      return await prisma.oAuthClient.findUnique({
        where: { clientId },
      });
    } catch (error) {
      throw new OAuth2Error(
        'Failed to retrieve client',
        OAuth2ErrorCode.ServerError,
        500,
        error instanceof Error ? error.message : undefined
      );
    }
  }

  /**
   * 查询客户端列表
   * Query client list
   *
   * @param params - 查询参数 (Query parameters)
   * @returns 客户端列表和总数 (Client list and total count)
   */
  static async getClients(params: ClientQueryParams = {}): Promise<{
    clients: OAuthClient[];
    total: number;
  }> {
    try {
      const where: any = {};

      if (params.clientType) {
        where.clientType = params.clientType;
      }

      if (params.isActive !== undefined) {
        where.isActive = params.isActive;
      }

      if (params.name) {
        where.name = {
          contains: params.name,
          mode: 'insensitive',
        };
      }

      const [clients, total] = await Promise.all([
        prisma.oAuthClient.findMany({
          where,
          skip: params.offset ?? 0,
          take: params.limit ?? 50,
          orderBy: { createdAt: 'desc' },
        }),
        prisma.oAuthClient.count({ where }),
      ]);

      return { clients, total };
    } catch (error) {
      throw new OAuth2Error(
        'Failed to query clients',
        OAuth2ErrorCode.ServerError,
        500,
        error instanceof Error ? error.message : undefined
      );
    }
  }

  /**
   * 更新客户端信息
   * Update client information
   *
   * @param clientId - 客户端ID (Client ID)
   * @param params - 更新参数 (Update parameters)
   * @param auditInfo - 审计信息 (Audit information)
   * @returns 更新后的客户端信息 (Updated client information)
   */
  static async updateClient(
    clientId: string,
    params: UpdateClientParams,
    auditInfo: {
      userId?: string;
      ipAddress?: string;
      userAgent?: string;
    }
  ): Promise<OAuthClient> {
    try {
      // 检查客户端是否存在
      // Check if client exists
      const existingClient = await ClientService.getClientById(clientId);
      if (!existingClient) {
        throw new OAuth2Error('Client not found', OAuth2ErrorCode.InvalidClient, 404);
      }

      // 验证更新参数
      // Validate update parameters
      ClientService.validateUpdateParams(params);

      // 构建更新数据
      // Build update data
      const updateData: any = {};

      if (params.name !== undefined) updateData.name = params.name;
      if (params.description !== undefined) updateData.description = params.description;
      if (params.redirectUris !== undefined)
        updateData.redirectUris = JSON.stringify(params.redirectUris);
      if (params.grantTypes !== undefined)
        updateData.grantTypes = JSON.stringify(params.grantTypes);
      if (params.responseTypes !== undefined)
        updateData.responseTypes = JSON.stringify(params.responseTypes);
      if (params.allowedScopes !== undefined)
        updateData.allowedScopes = JSON.stringify(params.allowedScopes);
      if (params.logoUri !== undefined) updateData.logoUri = params.logoUri;
      if (params.policyUri !== undefined) updateData.policyUri = params.policyUri;
      if (params.tosUri !== undefined) updateData.tosUri = params.tosUri;
      if (params.requirePkce !== undefined) updateData.requirePkce = params.requirePkce;
      if (params.requireConsent !== undefined) updateData.requireConsent = params.requireConsent;
      if (params.ipWhitelist !== undefined)
        updateData.ipWhitelist = params.ipWhitelist ? JSON.stringify(params.ipWhitelist) : null;
      if (params.accessTokenTtl !== undefined) updateData.accessTokenTtl = params.accessTokenTtl;
      if (params.refreshTokenTtl !== undefined) updateData.refreshTokenTtl = params.refreshTokenTtl;
      if (params.authorizationCodeLifetime !== undefined)
        updateData.authorizationCodeLifetime = params.authorizationCodeLifetime;
      if (params.isActive !== undefined) updateData.isActive = params.isActive;

      // 执行更新
      // Execute update
      const updatedClient = await prisma.oAuthClient.update({
        where: { id: clientId },
        data: updateData,
      });

      // 记录审计日志
      // Record audit log
      await AuthorizationUtils.logAuditEvent({
        userId: auditInfo.userId,
        clientId: updatedClient.id,
        action: 'client_updated',
        resource: `client:${updatedClient.clientId}`,
        ipAddress: auditInfo.ipAddress,
        userAgent: auditInfo.userAgent,
        success: true,
        metadata: {
          updatedFields: Object.keys(updateData),
        },
      });

      return updatedClient;
    } catch (error) {
      // 记录失败的审计日志
      // Record failure audit log
      await AuthorizationUtils.logAuditEvent({
        userId: auditInfo.userId,
        action: 'client_update_failed',
        resource: `client:${clientId}`,
        ipAddress: auditInfo.ipAddress,
        userAgent: auditInfo.userAgent,
        success: false,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });

      if (error instanceof OAuth2Error) {
        throw error;
      }

      throw new OAuth2Error(
        'Failed to update OAuth client',
        OAuth2ErrorCode.ServerError,
        500,
        error instanceof Error ? error.message : undefined
      );
    }
  }

  /**
   * 删除客户端
   * Delete client
   *
   * @param clientId - 客户端ID (Client ID)
   * @param auditInfo - 审计信息 (Audit information)
   */
  static async deleteClient(
    clientId: string,
    auditInfo: {
      userId?: string;
      ipAddress?: string;
      userAgent?: string;
    }
  ): Promise<void> {
    try {
      // 检查客户端是否存在
      // Check if client exists
      const existingClient = await ClientService.getClientById(clientId);
      if (!existingClient) {
        throw new OAuth2Error('Client not found', OAuth2ErrorCode.InvalidClient, 404);
      }

      // 删除客户端（级联删除相关记录）
      // Delete client (cascade delete related records)
      await prisma.oAuthClient.delete({
        where: { id: clientId },
      });

      // 记录审计日志
      // Record audit log
      await AuthorizationUtils.logAuditEvent({
        userId: auditInfo.userId,
        clientId: existingClient.id,
        action: 'client_deleted',
        resource: `client:${existingClient.clientId}`,
        ipAddress: auditInfo.ipAddress,
        userAgent: auditInfo.userAgent,
        success: true,
        metadata: {
          clientName: existingClient.name,
        },
      });
    } catch (error) {
      // 记录失败的审计日志
      // Record failure audit log
      await AuthorizationUtils.logAuditEvent({
        userId: auditInfo.userId,
        action: 'client_delete_failed',
        resource: `client:${clientId}`,
        ipAddress: auditInfo.ipAddress,
        userAgent: auditInfo.userAgent,
        success: false,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });

      if (error instanceof OAuth2Error) {
        throw error;
      }

      throw new OAuth2Error(
        'Failed to delete OAuth client',
        OAuth2ErrorCode.ServerError,
        500,
        error instanceof Error ? error.message : undefined
      );
    }
  }

  /**
   * 轮换客户端密钥
   * Rotate client secret
   *
   * @param clientId - 客户端ID (Client ID)
   * @param auditInfo - 审计信息 (Audit information)
   * @returns 新的客户端密钥 (New client secret)
   */
  static async rotateClientSecret(
    clientId: string,
    auditInfo: {
      userId?: string;
      ipAddress?: string;
      userAgent?: string;
    }
  ): Promise<string> {
    try {
      // 检查客户端是否存在
      // Check if client exists
      const existingClient = await ClientService.getClientById(clientId);
      if (!existingClient) {
        throw new OAuth2Error('Client not found', OAuth2ErrorCode.InvalidClient, 404);
      }

      // 只有机密客户端才能轮换密钥
      // Only confidential clients can rotate secrets
      if (existingClient.clientType !== ClientType.CONFIDENTIAL) {
        throw new OAuth2Error(
          'Public clients do not have secrets',
          OAuth2ErrorCode.InvalidClient,
          400
        );
      }

      // 生成新密钥
      // Generate new secret
      const newSecret = ClientService.generateClientSecret();
      const hashedSecret = await bcrypt.hash(newSecret, 12);

      // 更新客户端密钥
      // Update client secret
      await prisma.oAuthClient.update({
        where: { id: clientId },
        data: { clientSecret: hashedSecret },
      });

      // 记录审计日志
      // Record audit log
      await AuthorizationUtils.logAuditEvent({
        userId: auditInfo.userId,
        clientId: existingClient.id,
        action: 'client_secret_rotated',
        resource: `client:${existingClient.clientId}`,
        ipAddress: auditInfo.ipAddress,
        userAgent: auditInfo.userAgent,
        success: true,
      });

      return newSecret;
    } catch (error) {
      // 记录失败的审计日志
      // Record failure audit log
      await AuthorizationUtils.logAuditEvent({
        userId: auditInfo.userId,
        action: 'client_secret_rotation_failed',
        resource: `client:${clientId}`,
        ipAddress: auditInfo.ipAddress,
        userAgent: auditInfo.userAgent,
        success: false,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });

      if (error instanceof OAuth2Error) {
        throw error;
      }

      throw new OAuth2Error(
        'Failed to rotate client secret',
        OAuth2ErrorCode.ServerError,
        500,
        error instanceof Error ? error.message : undefined
      );
    }
  }

  /**
   * 验证创建参数
   * Validate creation parameters
   *
   * @param params - 创建参数 (Creation parameters)
   */
  private static validateCreateParams(params: CreateClientParams): void {
    if (!params.name || params.name.trim().length === 0) {
      throw new OAuth2Error('Client name is required', OAuth2ErrorCode.InvalidRequest, 400);
    }

    if (!params.redirectUris || params.redirectUris.length === 0) {
      throw new OAuth2Error(
        'At least one redirect URI is required',
        OAuth2ErrorCode.InvalidRequest,
        400
      );
    }

    // 验证重定向URI格式
    // Validate redirect URI format
    for (const uri of params.redirectUris) {
      try {
        new URL(uri);
      } catch {
        throw new OAuth2Error(`Invalid redirect URI: ${uri}`, OAuth2ErrorCode.InvalidRequest, 400);
      }
    }

    if (!params.grantTypes || params.grantTypes.length === 0) {
      throw new OAuth2Error(
        'At least one grant type is required',
        OAuth2ErrorCode.InvalidRequest,
        400
      );
    }

    if (!params.allowedScopes || params.allowedScopes.length === 0) {
      throw new OAuth2Error(
        'At least one allowed scope is required',
        OAuth2ErrorCode.InvalidRequest,
        400
      );
    }
  }

  /**
   * 验证更新参数
   * Validate update parameters
   *
   * @param params - 更新参数 (Update parameters)
   */
  private static validateUpdateParams(params: UpdateClientParams): void {
    if (params.name !== undefined && params.name.trim().length === 0) {
      throw new OAuth2Error('Client name cannot be empty', OAuth2ErrorCode.InvalidRequest, 400);
    }

    if (params.redirectUris !== undefined) {
      if (params.redirectUris.length === 0) {
        throw new OAuth2Error(
          'At least one redirect URI is required',
          OAuth2ErrorCode.InvalidRequest,
          400
        );
      }

      // 验证重定向URI格式
      // Validate redirect URI format
      for (const uri of params.redirectUris) {
        try {
          new URL(uri);
        } catch {
          throw new OAuth2Error(
            `Invalid redirect URI: ${uri}`,
            OAuth2ErrorCode.InvalidRequest,
            400
          );
        }
      }
    }
  }

  /**
   * 生成客户端ID
   * Generate client ID
   *
   * @returns 客户端ID (Client ID)
   */
  private static generateClientId(): string {
    return `client_${crypto.randomBytes(16).toString('hex')}`;
  }

  /**
   * 生成客户端密钥
   * Generate client secret
   *
   * @returns 客户端密钥 (Client secret)
   */
  private static generateClientSecret(): string {
    return crypto.randomBytes(32).toString('base64url');
  }
}
