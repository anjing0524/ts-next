"use strict";
/**
 * @repo/lib 包根级导出
 * Root level exports for @repo/lib package
 *
 * 统一导出所有共享模块
 * Unified exports for all shared modules
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
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_OAUTH_CONFIG = exports.OAuthConfig = exports.prisma = exports.LIB_VERSION = exports.generateRequestId = exports.errorResponse = exports.successResponse = void 0;
// 认证模块 (Authentication modules)
__exportStar(require("./auth"), exports);
// 中间件模块 (Middleware modules)
__exportStar(require("./middleware"), exports);
// 服务模块 (Service modules)
__exportStar(require("./services"), exports);
// 工具模块 (Utility modules)
__exportStar(require("./utils"), exports);
// 错误处理 (Error handling)
__exportStar(require("./errors"), exports);
// API响应工具函数
var apiResponse_1 = require("./apiResponse");
Object.defineProperty(exports, "successResponse", { enumerable: true, get: function () { return apiResponse_1.successResponse; } });
Object.defineProperty(exports, "errorResponse", { enumerable: true, get: function () { return apiResponse_1.errorResponse; } });
Object.defineProperty(exports, "generateRequestId", { enumerable: true, get: function () { return apiResponse_1.generateRequestId; } });
// 类型定义 (Type definitions)
__exportStar(require("./types"), exports);
// 版本信息 (Version info)
exports.LIB_VERSION = '1.0.0';
// export * from './cache';       // Exports from ./src/cache.ts
// Re-export prisma from database package
var database_1 = require("@repo/database");
Object.defineProperty(exports, "prisma", { enumerable: true, get: function () { return database_1.prisma; } });
// OAuth配置管理
var oauth_config_1 = require("./config/oauth-config");
Object.defineProperty(exports, "OAuthConfig", { enumerable: true, get: function () { return oauth_config_1.OAuthConfig; } });
Object.defineProperty(exports, "DEFAULT_OAUTH_CONFIG", { enumerable: true, get: function () { return oauth_config_1.DEFAULT_OAUTH_CONFIG; } });
