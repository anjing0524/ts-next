"use strict";
/**
 * 通用中间件导出
 * Common middleware exports
 *
 * 这些中间件具有高度通用性，可在所有服务中复用
 * These middleware are highly reusable across all services
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.withValidation = exports.validatePKCE = exports.validateRedirectUri = exports.validateRequest = exports.withUserRateLimit = exports.withIPRateLimit = exports.withOAuthRateLimit = exports.withRateLimit = exports.getCORSOptionsFromEnv = exports.withEnvCORS = exports.withDefaultCORS = exports.withCORS = exports.requirePermission = exports.withAuth = exports.authenticateBearer = void 0;
// Bearer认证中间件 (Bearer authentication middleware)
var bearer_auth_1 = require("./bearer-auth");
Object.defineProperty(exports, "authenticateBearer", { enumerable: true, get: function () { return bearer_auth_1.authenticateBearer; } });
Object.defineProperty(exports, "withAuth", { enumerable: true, get: function () { return bearer_auth_1.withAuth; } });
Object.defineProperty(exports, "requirePermission", { enumerable: true, get: function () { return bearer_auth_1.requirePermission; } });
// CORS中间件 (CORS middleware)
var cors_1 = require("./cors");
Object.defineProperty(exports, "withCORS", { enumerable: true, get: function () { return cors_1.withCORS; } });
Object.defineProperty(exports, "withDefaultCORS", { enumerable: true, get: function () { return cors_1.withDefaultCORS; } });
Object.defineProperty(exports, "withEnvCORS", { enumerable: true, get: function () { return cors_1.withEnvCORS; } });
Object.defineProperty(exports, "getCORSOptionsFromEnv", { enumerable: true, get: function () { return cors_1.getCORSOptionsFromEnv; } });
// 速率限制中间件 (Rate limiting middleware)
var rate_limit_1 = require("./rate-limit");
Object.defineProperty(exports, "withRateLimit", { enumerable: true, get: function () { return rate_limit_1.withRateLimit; } });
Object.defineProperty(exports, "withOAuthRateLimit", { enumerable: true, get: function () { return rate_limit_1.withOAuthRateLimit; } });
Object.defineProperty(exports, "withIPRateLimit", { enumerable: true, get: function () { return rate_limit_1.withIPRateLimit; } });
Object.defineProperty(exports, "withUserRateLimit", { enumerable: true, get: function () { return rate_limit_1.withUserRateLimit; } });
// 基础验证中间件 (Basic validation middleware)
var validation_1 = require("./validation");
Object.defineProperty(exports, "validateRequest", { enumerable: true, get: function () { return validation_1.validateRequest; } });
Object.defineProperty(exports, "validateRedirectUri", { enumerable: true, get: function () { return validation_1.validateRedirectUri; } });
Object.defineProperty(exports, "validatePKCE", { enumerable: true, get: function () { return validation_1.validatePKCE; } });
Object.defineProperty(exports, "withValidation", { enumerable: true, get: function () { return validation_1.withValidation; } });
