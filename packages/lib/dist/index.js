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
exports.prisma = exports.LIB_VERSION = void 0;
// 认证模块 (Authentication module)
__exportStar(require("./auth"), exports);
// 服务模块 (Services module)
__exportStar(require("./services"), exports);
// 工具模块 (Utils module)
__exportStar(require("./utils"), exports);
// 中间件模块 (Middleware module)
// export * from './middleware';
// 版本信息 (Version info)
exports.LIB_VERSION = '1.0.0';
__exportStar(require("./types"), exports); // Exports from ./src/types.ts (barrel for ./src/types/*)
__exportStar(require("./errors"), exports); // Exports from ./src/errors.ts
__exportStar(require("./cache"), exports); // Exports from ./src/cache.ts
// Re-export prisma from database package
var database_1 = require("@repo/database");
Object.defineProperty(exports, "prisma", { enumerable: true, get: function () { return database_1.prisma; } });
