// lib/auth/jwtUtils.ts

/**
 * JWT (JSON Web Token) 工具类
 * 负责JWT的生成、验证等操作。
 *
 * 主要功能:
 * - 生成符合RS256算法的JWT
 * - 验证JWT的签名、过期时间、声明等
 *
 * 依赖:
 * - jose 库 (用于JWT操作)
 * - 环境变量 (用于RSA密钥对、签发者、受众等配置)
 */

import * as jose from 'jose';
import { randomUUID } from 'crypto'; // For JTI

// --- RSA Key Setup ---
const RSA_PRIVATE_KEY_PEM = process.env.JWT_RSA_PRIVATE_KEY || '';
const RSA_PUBLIC_KEY_PEM = process.env.JWT_RSA_PUBLIC_KEY || '';

let rsaPrivateKey: jose.KeyLike | undefined;
let rsaPublicKey: jose.KeyLike | undefined;
let keysImportPromise: Promise<void> | null = null;

function _importKeys() {
  // This function is not async itself but returns a promise
  // that resolves once keys are attempted to be imported.
  return (async () => {
    try {
      if (RSA_PRIVATE_KEY_PEM) {
        rsaPrivateKey = await jose.importPkcs8(RSA_PRIVATE_KEY_PEM, 'RS256');
      } else {
        console.warn('JWT_RSA_PRIVATE_KEY is not set. JWT generation will likely fail.');
      }
      if (RSA_PUBLIC_KEY_PEM) {
        rsaPublicKey = await jose.importSpki(RSA_PUBLIC_KEY_PEM, 'RS256');
      } else {
        console.warn('JWT_RSA_PUBLIC_KEY is not set. JWT validation will likely fail.');
      }
    } catch (error) {
      console.error('Failed to import RSA keys for JWT:', error);
      // rsaPrivateKey and rsaPublicKey will remain undefined
    }
  })();
}

keysImportPromise = _importKeys(); // Initialize key import on module load

// JWT标准声明的默认值，可以从环境变量配置
const DEFAULT_ISSUER = process.env.JWT_ISSUER || 'https://auth.example.com';
const DEFAULT_AUDIENCE = process.env.JWT_AUDIENCE || 'https://api.example.com';
const ALGORITHM = 'RS256';

export interface JwtCustomPayload {
  [key: string]: any; // 允许包含任何自定义声明
}

/**
 * 生成 JWT 令牌.
 * Generates a JWT token.
 *
 * @param payload - 要包含在JWT中的自定义数据 (Custom data to be included in the JWT).
 * @param subject - 令牌的主题 (Subject of the token, e.g., user ID or client ID).
 * @param expiresIn - 令牌有效期 (Token expiration time, e.g., "1h", "7d", or number of seconds).
 * @returns 返回生成的JWT字符串 (Returns the generated JWT string).
 * @throws Error - 如果私钥未设置或生成失败 (Throws an error if the private key is not set or generation fails).
 */
export async function generateJwtToken(
  payload: JwtCustomPayload,
  subject: string,
  expiresIn: string | number,
): Promise<string> {
  await keysImportPromise; // Ensure key import attempt has completed
  if (!rsaPrivateKey) {
    throw new Error('RSA private key is not available for JWT generation. Check JWT_RSA_PRIVATE_KEY env variable and server logs.');
  }

  const iat = Math.floor(Date.now() / 1000); // 签发时间 (Issued at)
  const jti = randomUUID(); // JWT ID，确保唯一性

  const jwtBuilder = new jose.SignJWT({ ...payload })
    .setProtectedHeader({ alg: ALGORITHM })
    .setSubject(subject)
    .setIssuer(DEFAULT_ISSUER)
    .setAudience(DEFAULT_AUDIENCE)
    .setIssuedAt(iat)
    .setJti(jti);

  if (typeof expiresIn === 'string') {
    jwtBuilder.setExpirationTime(expiresIn);
  } else {
    // expiresIn is number of seconds
    jwtBuilder.setExpirationTime(iat + expiresIn);
  }

  try {
    const token = await jwtBuilder.sign(rsaPrivateKey);
    return token;
  } catch (error) {
    console.error('Error generating JWT:', error);
    throw new Error('Failed to generate JWT token.');
  }
}

/**
 * 验证 JWT 令牌.
 * Validates a JWT token.
 *
 * @param token - 需要验证的JWT字符串 (The JWT string to validate).
 * @returns 返回解码后的JWT载荷及受保护的头部 (Returns the decoded JWT payload and protected header if valid).
 * @throws Error - 如果令牌无效 (e.g., 签名错误, 过期, 格式错误等) (Throws an error if the token is invalid).
 */
export async function validateJwtToken(token: string): Promise<jose.JWTVerifyResult & { payload: jose.JWTPayload & JwtCustomPayload }> {
  await keysImportPromise; // Ensure key import attempt has completed
  if (!rsaPublicKey) {
    throw new Error('RSA public key is not available for JWT validation. Check JWT_RSA_PUBLIC_KEY env variable and server logs.');
  }

  try {
    const { payload, protectedHeader } = await jose.jwtVerify(token, rsaPublicKey, {
      issuer: DEFAULT_ISSUER,
      audience: DEFAULT_AUDIENCE,
      algorithms: [ALGORITHM],
    });
    // 类型断言 payload 以包含自定义声明
    return { payload: payload as jose.JWTPayload & JwtCustomPayload, protectedHeader };
  } catch (error: any) {
    // 根据 jose 的错误类型进行更细致的错误处理
    if (error.code === 'ERR_JWT_EXPIRED') {
      throw new Error(`Token expired at ${new Date((error.payload?.exp || 0) * 1000).toISOString()}`);
    } else if (error.code === 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED') {
      throw new Error('Invalid token signature.');
    } else if (error.code === 'ERR_JWT_CLAIM_VALIDATION_FAILED') {
      throw new Error(`Token claim validation failed: ${error.claim} ${error.reason}.`);
    } else if (error.code === 'ERR_JWS_INVALID' || error.code === 'ERR_JOSE_NOT_SUPPORTED' || error.code === 'ERR_JOSE_ALG_NOT_ALLOWED') {
        throw new Error(`Invalid JWT: ${error.message}`);
    }
    // Fallback for other errors
    throw new Error(`Invalid token: ${error.message}`);
  }
}

// 模块重置函数 (仅用于测试环境, 以便重新导入密钥)
export async function __test__resetKeys() {
  rsaPrivateKey = undefined;
  rsaPublicKey = undefined;
  keysImportPromise = _importKeys();
  await keysImportPromise;
}
