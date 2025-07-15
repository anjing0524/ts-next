// 文件路径: app/.well-known/jwks.json/route.ts
// File path: app/.well-known/jwks.json/route.ts
// 描述: 此文件实现了 JWKS (JSON Web Key Set) 端点，用于提供JWT公钥信息
// Description: This file implements the JWKS (JSON Web Key Set) endpoint for providing JWT public key information

import { NextResponse } from 'next/server';
import { JWTUtils, withErrorHandling } from '@repo/lib/node';

/**
 * JWKS端点处理函数
 * 返回JWT公钥信息，供客户端验证JWT令牌
 */
async function jwksEndpointHandler(): Promise<NextResponse> {
  try {
    // 获取公钥
    const publicKey = await JWTUtils.getPublicKey();
    
    // 导出公钥为JWK格式
    const jwk = await JWTUtils.exportPublicKeyAsJWK(publicKey);
    
    // 返回JWKS格式的响应
    const jwks = {
      keys: [jwk]
    };
    
    return NextResponse.json(jwks, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600', // 缓存1小时
      },
    });
  } catch (error) {
    console.error('Failed to generate JWKS:', error);
    throw new Error('Failed to generate JWKS');
  }
}

export const GET = withErrorHandling(jwksEndpointHandler); 