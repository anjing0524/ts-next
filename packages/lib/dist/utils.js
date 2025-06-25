"use strict";
/**
 * packages/lib/src/utils.ts
 * Utility functions module unified exports
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
exports.isValidEmail = isValidEmail;
// === 日志工具 (Logger Utils) ===
__exportStar(require("./utils/logger"), exports);
// === 错误处理 (Error Handling) ===
__exportStar(require("./utils/error-handler"), exports);
// === 时间轮工具 (Time Wheel Utils) ===
__exportStar(require("./utils/time-wheel"), exports);
// === MySQL 客户端工具 (MySQL Client Utils) ===
// mysql-client已迁移到@repo/database包
// 导出速率限制工具 (Export rate limiting utilities)
__exportStar(require("./utils/rate-limit-utils"), exports);
/**
 * Validates if the given string is a valid email address.
 * @param email The string to validate.
 * @returns True if the email is valid, false otherwise.
 */
function isValidEmail(email) {
    if (!email) {
        return false;
    }
    // A common, reasonably effective regex for email validation.
    // For production, consider more comprehensive validation or a library if needed.
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}
