// 文件路径: app/api/v2/oauth/revoke/route.ts
// 描述: OAuth 2.0 令牌撤销端点 (RFC 7009)

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import crypto from 'crypto'; // 引入 crypto 用于哈希

import { prisma } from '@/lib/prisma';
import { successResponse, errorResponse } from '@/lib/api/apiResponse';
import { withErrorHandler, ApiError } from '@/lib/api/errorHandler';
import { JWTUtils, ClientAuthUtils, OAuth2ErrorTypes } from '@/lib/auth/oauth2'; // 假设这些工具类可用

// --- 请求 Schema ---
const RevocationRequestSchema = z.object({
  token: z.string().min(1, '令牌 (token) 不能为空'),
  token_type_hint: z.string().optional().describe('可选的令牌类型提示 (e.g., access_token, refresh_token)'),
  // client_id 和 client_secret 用于客户端认证，如果未使用 Basic Auth
  client_id: z.string().optional(),
  client_secret: z.string().optional(),
});

// --- 辅助函数 ---
// (与内省端点类似的客户端认证逻辑，实际应复用或通过中间件处理)
async function authenticateRevocationClient(request: NextRequest, body: URLSearchParams): Promise<{ client: { id: string, clientId: string, clientSecret: string | null, isPublic: boolean } | null; error?: NextResponse }> {
  const authHeader = request.headers.get('Authorization');
  let formClientId = body.get('client_id');
  let formClientSecret = body.get('client_secret');

  let credentialsClientId: string | undefined;
  let credentialsClientSecret: string | undefined;

  if (authHeader && authHeader.toLowerCase().startsWith('basic ')) {
    try {
      const base64Credentials = authHeader.substring(6);
      const decodedCredentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
      [credentialsClientId, credentialsClientSecret] = decodedCredentials.split(':', 2);
    } catch (e) {
      return { client: null, error: NextResponse.json(errorResponse(400, '无效的 Basic 认证头 (Invalid Basic auth header)', OAuth2ErrorTypes.INVALID_CLIENT), { status: 400 }) };
    }
  }

  const clientId = credentialsClientId || formClientId;
  const clientSecret = credentialsClientSecret || formClientSecret;

  if (!clientId) {
    return { client: null, error: NextResponse.json(errorResponse(401, '客户端认证失败: 缺少客户端ID (Client authentication failed: missing client_id)', OAuth2ErrorTypes.INVALID_CLIENT), { status: 401 }) };
  }

  const client = await prisma.oAuthClient.findUnique({
    where: { clientId },
    select: { id: true, clientId: true, clientSecret: true, clientType: true } // clientType can be used to infer isPublic
  });

  if (!client) {
    return { client: null, error: NextResponse.json(errorResponse(401, '客户端认证失败: 客户端未找到 (Client authentication failed: client not found)', OAuth2ErrorTypes.INVALID_CLIENT), { status: 401 }) };
  }

  const isPublicClient = client.clientType === 'PUBLIC';

  // 对于机密客户端，必须提供密钥
  if (!isPublicClient) {
    if (!clientSecret) {
      return { client: null, error: NextResponse.json(errorResponse(401, '客户端认证失败: 机密客户端缺少密钥 (Client authentication failed: client_secret required for confidential client)', OAuth2ErrorTypes.INVALID_CLIENT), { status: 401 }) };
    }
    // 注意：实际应用中应比较哈希后的密钥
    // const bcrypt = require('bcrypt');
    // const isValidSecret = await bcrypt.compare(clientSecret, client.clientSecret);
    // if (!isValidSecret) {
    if (client.clientSecret !== clientSecret) { // 再次强调：这是不安全的比较，仅为示例
      return { client: null, error: NextResponse.json(errorResponse(401, '客户端认证失败: 客户端密钥无效 (Client authentication failed: invalid client_secret)', OAuth2ErrorTypes.INVALID_CLIENT), { status: 401 }) };
    }
    // }
  } else { // 对于公共客户端
    if (clientSecret) {
      // 公共客户端不应发送 client_secret
      return { client: null, error: NextResponse.json(errorResponse(400, '无效请求: 公共客户端不应发送 client_secret (Invalid request: public client must not send client_secret)', OAuth2ErrorTypes.INVALID_REQUEST), { status: 400 }) };
    }
  }

  return { client: { ...client, isPublic: isPublicClient } };
}

// 确保 JWTUtils 中有 getTokenHash 方法
const getTokenHash = (token: string): string => {
  return crypto.createHash('sha256').update(token).digest('hex');
};


/**
 * @swagger
 * /api/v2/oauth/revoke:
 *   post:
 *     summary: OAuth 2.0 令牌撤销 (Token Revocation)
 *     description: |
 *       撤销一个访问令牌或刷新令牌。
 *       此端点受客户端凭证保护。公共客户端可以撤销其令牌而无需认证密钥。
 *       参考 RFC 7009。
 *     tags:
 *       - OAuth V2
 *     consumes:
 *       - application/x-www-form-urlencoded
 *     produces:
 *       - application/json
 *     requestBody:
 *       required: true
 *       content:
 *         application/x-www-form-urlencoded:
 *           schema:
 *             type: object
 *             properties:
 *               token:
 *                 type: string
 *                 description: 需要撤销的令牌。
 *               token_type_hint:
 *                 type: string
 *                 description: 可选的令牌类型提示 (例如 "access_token" 或 "refresh_token")。
 *               client_id:
 *                 type: string
 *                 description: (如果未使用Basic Auth) 进行请求的客户端ID。
 *               client_secret:
 *                 type: string
 *                 description: (如果未使用Basic Auth且客户端是机密的) 客户端密钥。
 *             required:
 *               - token
 *     responses:
 *       '200':
 *         description: 令牌已成功撤销或客户端无权撤销或令牌无效 (服务器不区分这些情况以避免信息泄露)。
 *       '400':
 *         description: 无效的请求 (例如缺少 'token' 参数或不支持的令牌类型)。
 *       '401':
 *         description: 客户端认证失败 (仅当客户端认证是必需的时)。
 *       '500':
 *         description: 服务器内部错误。
 */
async function revocationHandler(request: NextRequest) {
  const overallRequestId = (request as any).requestId; // from withErrorHandler

  if (request.headers.get('content-type') !== 'application/x-www-form-urlencoded') {
    return NextResponse.json(errorResponse(415, '不支持的媒体类型 (Unsupported Media Type). 请使用 application/x-www-form-urlencoded。', 'UNSUPPORTED_MEDIA_TYPE', overallRequestId), { status: 415 });
  }

  const bodyParams = new URLSearchParams(await request.text());

  // --- 客户端认证 ---
  const authResult = await authenticateRevocationClient(request, bodyParams);
  if (authResult.error) {
    return authResult.error;
  }
  const authenticatedClient = authResult.client; // 经过验证的客户端信息
  if (!authenticatedClient) { // Should not happen if error is handled
    return NextResponse.json(errorResponse(500, '客户端认证逻辑错误', 'SERVER_ERROR', overallRequestId), { status: 500 });
  }


  // --- 请求体验证 ---
  const tokenToRevoke = bodyParams.get('token');
  const tokenTypeHint = bodyParams.get('token_type_hint');

  if (!tokenToRevoke) {
    return NextResponse.json(errorResponse(400, '请求缺少令牌 (token is required)', OAuth2ErrorTypes.INVALID_REQUEST, overallRequestId), { status: 400 });
  }

  // --- 令牌撤销逻辑 ---
  // RFC 7009: 服务器应该首先验证令牌，然后验证客户端是否有权撤销它。
  // 如果令牌无效或客户端无权，服务器应该仍然返回200 OK，以防止客户端探测令牌。

  const tokenHash = getTokenHash(tokenToRevoke); // 使用哈希进行数据库查找

  let tokenFoundAndRevoked = false;

  // 尝试作为访问令牌处理
  if (tokenTypeHint === 'access_token' || !tokenTypeHint) {
    const accessToken = await prisma.accessToken.findFirst({
      where: { tokenHash: tokenHash, clientId: authenticatedClient.id }, // 确保令牌属于此客户端
    });

    if (accessToken) {
      if (!accessToken.revoked) {
        await prisma.accessToken.update({
          where: { id: accessToken.id },
          data: { revoked: true, revokedAt: new Date() },
        });
      }
      tokenFoundAndRevoked = true;
      // 审计日志 (可选)
      // await prisma.auditLog.create({ data: { action: 'access_token_revoked', actorId: authenticatedClient.clientId, resourceId: accessToken.id, success: true }});
    }
  }

  // 尝试作为刷新令牌处理 (如果未作为访问令牌找到或提示是刷新令牌)
  if (!tokenFoundAndRevoked && (tokenTypeHint === 'refresh_token' || !tokenTypeHint)) {
    const refreshToken = await prisma.refreshToken.findFirst({
      where: { tokenHash: tokenHash, clientId: authenticatedClient.id }, // 确保令牌属于此客户端
    });

    if (refreshToken) {
      if (!refreshToken.revoked) {
        await prisma.refreshToken.update({
          where: { id: refreshToken.id },
          data: { revoked: true, revokedAt: new Date() },
        });
      }
      tokenFoundAndRevoked = true;
      // 审计日志 (可选)
      // await prisma.auditLog.create({ data: { action: 'refresh_token_revoked', actorId: authenticatedClient.clientId, resourceId: refreshToken.id, success: true }});

      // 标准还建议，如果撤销的是刷新令牌，相关的访问令牌也应被撤销。
      // 这需要额外的逻辑来查找并撤销由该刷新令牌（或其用户和客户端组合）颁发的所有活动访问令牌。
      // 例如:
      // await prisma.accessToken.updateMany({
      //   where: {
      //     userId: refreshToken.userId,
      //     clientId: refreshToken.clientId,
      //     revoked: false,
      //     // อาจจะต้องมีฟิลด์ refreshTokenId ใน AccessToken เพื่อการเชื่อมโยงที่แม่นยำ
      //   },
      //   data: { revoked: true, revokedAt: new Date() },
      // });
    }
  }

  // RFC 7009: "The server responds with HTTP status code 200 if the token has been
  // revoked successfully or if the client submitted an invalid token."
  // 服务器不应泄露令牌是否存在或有效的具体信息。
  return new NextResponse(null, { status: 200 }); // HTTP 200 OK, 无内容
}

// export const POST = withErrorHandler(withClientAuth(revocationHandler)); // 使用合适的客户端认证中间件
export const POST = withErrorHandler(revocationHandler);

EOF
