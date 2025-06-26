"use strict";
/**
 * JWT (JSON Web Token) 通用工具类
 * JWT (JSON Web Token) Universal Utility Class
 *
 * 提供JWT令牌的创建、验证、解析等通用功能
 * Provides universal JWT token creation, verification, parsing functionality
 *
 * @author OAuth团队
 * @since 2.0.0
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.JWTUtils = void 0;
exports.getIssuer = getIssuer;
exports.getAudience = getAudience;
exports.getRSAPrivateKeyForSigning = getRSAPrivateKeyForSigning;
exports.getRSAPublicKeyForVerification = getRSAPublicKeyForVerification;
exports.createAccessToken = createAccessToken;
exports.createRefreshToken = createRefreshToken;
exports.createIdToken = createIdToken;
exports.verifyAccessToken = verifyAccessToken;
exports.verifyRefreshToken = verifyRefreshToken;
exports.decodeToken = decodeToken;
exports.getTokenHash = getTokenHash;
exports.isTokenNearExpiry = isTokenNearExpiry;
exports.getSubjectFromToken = getSubjectFromToken;
exports.getScopesFromToken = getScopesFromToken;
exports.decodeTokenPayload = decodeTokenPayload;
exports.verifyAndDecodeRefreshToken = verifyAndDecodeRefreshToken;
exports.extractTokenFromHeader = extractTokenFromHeader;
const jose = __importStar(require("jose"));
const crypto = __importStar(require("crypto"));
// ===== 函数实现区域 (Function implementations) =====
/**
 * 获取JWT签发者
 * (Gets JWT issuer)
 */
function getIssuer() {
    const issuer = process.env.JWT_ISSUER;
    if (!issuer) {
        throw new Error('JWT_ISSUER environment variable is required');
    }
    return issuer;
}
/**
 * 获取JWT受众
 * (Gets JWT audience)
 */
function getAudience() {
    const audience = process.env.JWT_AUDIENCE;
    if (!audience) {
        throw new Error('JWT_AUDIENCE environment variable is required');
    }
    return audience;
}
/**
 * 获取RSA私钥用于签名
 * (Gets RSA private key for signing)
 */
async function getRSAPrivateKeyForSigning() {
    const privateKeyPEM = process.env.JWT_PRIVATE_KEY;
    if (!privateKeyPEM) {
        throw new Error('JWT_PRIVATE_KEY environment variable is required');
    }
    try {
        return await jose.importPKCS8(privateKeyPEM, 'RS256');
    }
    catch (error) {
        throw new Error(`Failed to import JWT private key: ${error}`);
    }
}
/**
 * 获取RSA公钥用于验证
 * (Gets RSA public key for verification)
 */
async function getRSAPublicKeyForVerification() {
    const publicKeyPEM = process.env.JWT_PUBLIC_KEY;
    if (!publicKeyPEM) {
        throw new Error('JWT_PUBLIC_KEY environment variable is required');
    }
    try {
        return await jose.importSPKI(publicKeyPEM, 'RS256');
    }
    catch (error) {
        throw new Error(`Failed to import JWT public key: ${error}`);
    }
}
/**
 * 创建访问令牌
 * (Creates an access token)
 */
async function createAccessToken(payload, config) {
    const algorithm = (config === null || config === void 0 ? void 0 : config.algorithm) || process.env.JWT_ALGORITHM || 'RS256';
    const keyId = (config === null || config === void 0 ? void 0 : config.keyId) || process.env.JWT_KEY_ID || 'default-kid';
    const jwtPayload = {
        client_id: payload.client_id,
        sub: payload.user_id || payload.client_id,
        aud: (config === null || config === void 0 ? void 0 : config.audience) || getAudience(),
        iss: (config === null || config === void 0 ? void 0 : config.issuer) || getIssuer(),
        jti: crypto.randomUUID(),
        iat: Math.floor(Date.now() / 1000),
        scope: payload.scope,
        permissions: payload.permissions || [],
    };
    Object.keys(jwtPayload).forEach((key) => jwtPayload[key] === undefined && delete jwtPayload[key]);
    return await new jose.SignJWT(jwtPayload)
        .setProtectedHeader({ alg: algorithm, kid: keyId })
        .setExpirationTime((config === null || config === void 0 ? void 0 : config.expiresIn) || payload.exp || '1h')
        .sign(await getRSAPrivateKeyForSigning());
}
/**
 * 创建刷新令牌
 * (Creates a refresh token)
 */
async function createRefreshToken(payload, config) {
    const algorithm = (config === null || config === void 0 ? void 0 : config.algorithm) || process.env.JWT_ALGORITHM || 'RS256';
    const keyId = (config === null || config === void 0 ? void 0 : config.keyId) || process.env.JWT_KEY_ID || 'default-kid';
    const jwtPayload = {
        client_id: payload.client_id,
        sub: payload.user_id || payload.client_id,
        aud: (config === null || config === void 0 ? void 0 : config.audience) || getAudience(),
        iss: (config === null || config === void 0 ? void 0 : config.issuer) || getIssuer(),
        jti: crypto.randomUUID(),
        iat: Math.floor(Date.now() / 1000),
        scope: payload.scope,
        token_type: 'refresh_token',
    };
    Object.keys(jwtPayload).forEach((key) => jwtPayload[key] === undefined && delete jwtPayload[key]);
    return await new jose.SignJWT(jwtPayload)
        .setProtectedHeader({ alg: algorithm, kid: keyId })
        .setExpirationTime((config === null || config === void 0 ? void 0 : config.expiresIn) || '30d')
        .sign(await getRSAPrivateKeyForSigning());
}
/**
 * 创建ID令牌 (OpenID Connect)
 * (Creates an ID token for OpenID Connect)
 */
async function createIdToken(payload, config) {
    const algorithm = (config === null || config === void 0 ? void 0 : config.algorithm) || process.env.JWT_ALGORITHM || 'RS256';
    const keyId = (config === null || config === void 0 ? void 0 : config.keyId) || process.env.JWT_KEY_ID || 'default-kid';
    const jwtPayload = {
        sub: payload.sub,
        aud: payload.aud,
        iss: (config === null || config === void 0 ? void 0 : config.issuer) || getIssuer(),
        iat: payload.iat || Math.floor(Date.now() / 1000),
        exp: payload.exp,
        nonce: payload.nonce,
        email: payload.email,
        name: payload.name,
        picture: payload.picture,
    };
    Object.keys(jwtPayload).forEach((key) => jwtPayload[key] === undefined && delete jwtPayload[key]);
    return await new jose.SignJWT(jwtPayload)
        .setProtectedHeader({ alg: algorithm, kid: keyId })
        .setExpirationTime((config === null || config === void 0 ? void 0 : config.expiresIn) || '1h')
        .sign(await getRSAPrivateKeyForSigning());
}
/**
 * 验证访问令牌
 * (Verifies an access token)
 */
async function verifyAccessToken(token, config) {
    try {
        const publicKey = await getRSAPublicKeyForVerification();
        const { payload } = await jose.jwtVerify(token, publicKey, {
            issuer: (config === null || config === void 0 ? void 0 : config.issuer) || getIssuer(),
            audience: (config === null || config === void 0 ? void 0 : config.audience) || getAudience(),
            algorithms: [(config === null || config === void 0 ? void 0 : config.algorithm) || 'RS256'],
        });
        return { valid: true, payload };
    }
    catch (error) {
        let errorMessage = 'Token verification failed';
        if (error instanceof jose.errors.JWTExpired) {
            errorMessage = 'Token has expired';
        }
        else if (error instanceof jose.errors.JWSInvalid) {
            errorMessage = 'Invalid token signature';
        }
        return { valid: false, error: errorMessage };
    }
}
/**
 * 验证刷新令牌
 * (Verifies a refresh token)
 */
async function verifyRefreshToken(token, config) {
    try {
        const publicKey = await getRSAPublicKeyForVerification();
        const { payload } = await jose.jwtVerify(token, publicKey, {
            issuer: (config === null || config === void 0 ? void 0 : config.issuer) || getIssuer(),
            audience: (config === null || config === void 0 ? void 0 : config.audience) || getAudience(),
            algorithms: [(config === null || config === void 0 ? void 0 : config.algorithm) || 'RS256'],
        });
        if (payload.token_type !== 'refresh_token') {
            return { valid: false, error: 'Invalid token type, expected refresh_token' };
        }
        return { valid: true, payload };
    }
    catch (error) {
        let errorMessage = 'Refresh token verification failed';
        if (error instanceof jose.errors.JWTExpired) {
            errorMessage = 'Refresh token has expired';
        }
        else if (error instanceof jose.errors.JWSInvalid) {
            errorMessage = 'Invalid refresh token signature';
        }
        return { valid: false, error: errorMessage };
    }
}
/**
 * 解码令牌（不验证签名）
 * (Decodes a token without verifying the signature)
 */
function decodeToken(token) {
    try {
        return jose.decodeJwt(token);
    }
    catch (error) {
        console.error('Failed to decode token:', error);
        return null;
    }
}
/**
 * 计算令牌的哈希值
 * (Calculates the hash of a token)
 */
function getTokenHash(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}
/**
 * 检查令牌是否即将过期
 * (Checks if a token is nearing expiry)
 */
function isTokenNearExpiry(token, thresholdSeconds = 300) {
    const payload = decodeToken(token);
    if (!payload || !payload.exp) {
        return false;
    }
    const nowInSeconds = Math.floor(Date.now() / 1000);
    return payload.exp - nowInSeconds < thresholdSeconds;
}
/**
 * 从令牌中获取 subject (sub)
 * (Gets the subject (sub) from a token)
 */
function getSubjectFromToken(token) {
    const payload = decodeToken(token);
    return (payload === null || payload === void 0 ? void 0 : payload.sub) || null;
}
/**
 * 从令牌中获取 scopes
 * (Gets scopes from a token)
 */
function getScopesFromToken(token) {
    const payload = decodeToken(token);
    if (!payload || !payload.scope || typeof payload.scope !== 'string') {
        return [];
    }
    return payload.scope.split(' ').filter((s) => s);
}
/**
 * 解码令牌负载
 * (Decodes token payload)
 */
async function decodeTokenPayload(token, secret) {
    if (!secret) {
        // 尝试在没有密钥的情况下解码（用于公钥验证）
        try {
            const decoded = jose.decodeJwt(token);
            return decoded;
        }
        catch (e) {
            throw new Error('Invalid token format' + e);
        }
    }
    // 使用密钥验证和解码
    try {
        const secretKey = new TextEncoder().encode(secret);
        const { payload } = await jose.jwtVerify(token, secretKey);
        return payload;
    }
    catch (e) {
        if (e.code === 'ERR_JWT_EXPIRED') {
            throw new Error('Token has expired');
        }
        throw new Error('Invalid token');
    }
}
/**
 * 验证和解码刷新令牌
 * (Verifies and decodes a refresh token)
 */
async function verifyAndDecodeRefreshToken(token, client) {
    const result = await verifyRefreshToken(token);
    if (!result.valid || !result.payload) {
        throw new Error(result.error || 'Invalid refresh token');
    }
    const payload = result.payload;
    if (payload.client_id !== client.clientId) {
        throw new Error('Refresh token was not issued to this client');
    }
    return payload;
}
/**
 * 从Authorization头中提取令牌
 * (Extracts token from Authorization header)
 */
function extractTokenFromHeader(authHeader) {
    if (!authHeader.startsWith('Bearer ')) {
        return null;
    }
    return authHeader.substring(7);
}
// ===== 兼容旧调用：导出同名对象 =====
/**
 * 为了兼容旧代码中 JWTUtils.method 的调用，
 * 这里导出一个与之前类同名的常量对象。
 */
exports.JWTUtils = {
    getIssuer,
    getAudience,
    getRSAPrivateKeyForSigning,
    getRSAPublicKeyForVerification,
    createAccessToken,
    createRefreshToken,
    createIdToken,
    verifyAccessToken,
    verifyRefreshToken,
    decodeToken,
    getTokenHash,
    isTokenNearExpiry,
    getSubjectFromToken,
    getScopesFromToken,
    decodeTokenPayload,
    verifyAndDecodeRefreshToken,
    extractTokenFromHeader,
};
