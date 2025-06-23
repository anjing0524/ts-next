// /api/v2/account/consents

import { NextResponse } from 'next/server';
// import { getCurrentUser } from '~/server/auth';
// import { prisma } from '~/server/db';

/**
 * @swagger
 * /api/v2/account/consents:
 *   get:
 *     summary: 获取当前用户的OAuth同意授予记录 (个人账户管理)
 *     description: 检索当前已认证用户给予第三方OAuth客户端的所有权限授予记录。
 *     tags: [Account API]
 *     responses:
 *       200:
 *         description: 成功获取同意授予记录列表。
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   consentId: # ConsentGrant ID
 *                     type: string
 *                   clientId:
 *                     type: string
 *                   clientName: # Fetched from related OAuthClient
 *                     type: string
 *                     nullable: true
 *                   clientLogoUri:
 *                     type: string
 *                     format: url
 *                     nullable: true
 *                   scopes: # Granted scopes
 *                     type: array
 *                     items:
 *                       type: string
 *                   issuedAt:
 *                     type: string
 *                     format: date-time
 *                   expiresAt:
 *                     type: string
 *                     format: date-time
 *                     nullable: true
 *       401:
 *         description: 用户未认证。
 *   delete:
 *     summary: 撤销当前用户特定的OAuth同意授予 (个人账户管理)
 *     description: 允许用户撤销之前给予特定OAuth客户端的权限授予。
 *     tags: [Account API]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - consentId
 *             properties:
 *               consentId:
 *                 type: string
 *                 description: 要撤销的同意授予记录的ID (ConsentGrant ID)。
 *     responses:
 *       204:
 *         description: 同意授予已成功撤销。
 *       400:
 *         description: 无效请求。
 *       401:
 *         description: 用户未认证。
 *       403:
 *         description: 禁止访问（例如，尝试撤销不属于自己的同意记录）。
 *       404:
 *         description: 未找到指定的同意授予记录。
 */
export async function GET(request: Request) {
  // TODO: 实现获取当前用户同意授予记录的逻辑 (Implement logic to get current user's consent grants)
  // 1. 获取当前已认证的用户信息.
  // 2. 从数据库查询该用户的 ConsentGrant 记录, 并 join OAuthClient 信息以获取客户端名称和Logo.
  // 3. 返回同意授予记录列表.
  console.log('GET /api/v2/account/consents request');
  // const currentUser = await getCurrentUser(request);
  // if (!currentUser) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  // const consents = await prisma.consentGrant.findMany({
  //   where: { userId: currentUser.id, revokedAt: null }, // Only active consents
  //   include: { client: { select: { clientName: true, logoUri: true, clientId: true } } }
  // });

  // 示例数据 (Example data)
  const exampleConsents = [
    {
      consentId: 'consent_abc',
      clientId: 'client_123',
      clientName: 'Third Party App A',
      clientLogoUri: 'https://example.com/logo_a.png',
      scopes: ['openid', 'profile', 'order:read'],
      issuedAt: new Date(Date.now() - 10*24*60*60*1000).toISOString(),
      expiresAt: null
    },
    {
      consentId: 'consent_xyz',
      clientId: 'client_789',
      clientName: 'Another Analytics Tool',
      clientLogoUri: null,
      scopes: ['openid', 'email'],
      issuedAt: new Date(Date.now() - 30*24*60*60*1000).toISOString(),
      expiresAt: new Date(Date.now() + 335*24*60*60*1000).toISOString()
    }
  ];
  return NextResponse.json(exampleConsents);
}

export async function DELETE(request: Request) {
  // TODO: 实现撤销用户特定同意授予的逻辑 (Implement logic to revoke a user's specific consent grant)
  // 1. 获取当前已认证的用户信息.
  // 2. 解析请求体中的 consentId.
  // 3. 验证该 consentId 对应的 ConsentGrant 是否属于当前用户.
  // 4. 从数据库中删除该 ConsentGrant 记录 (或标记为已撤销, e.g., set revokedAt).
  // 5. 返回成功响应 (204 No Content).
  console.log('DELETE /api/v2/account/consents request');
  // const currentUser = await getCurrentUser(request);
  // if (!currentUser) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { consentId } = body;

  if (!consentId) {
    return NextResponse.json({ message: "consentId is required." }, { status: 400 });
  }

  // Placeholder for actual consent revocation logic
  // const consent = await prisma.consentGrant.findUnique({ where: { id: consentId } });
  // if (!consent) {
  //   return NextResponse.json({ message: "Consent grant not found." }, { status: 404 });
  // }
  // if (consent.userId !== currentUser.id) {
  //   return NextResponse.json({ message: "Forbidden to revoke this consent." }, { status: 403 });
  // }
  // await prisma.consentGrant.update({ where: { id: consentId }, data: { revokedAt: new Date() } });
  // Or: await prisma.consentGrant.delete({ where: { id: consentId } });


  console.log(`Consent grant ${consentId} revoked (Not Implemented)`);
  return new NextResponse(null, { status: 204 });
}
