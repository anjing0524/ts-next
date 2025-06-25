"use strict";
/**
 * 认证模块统一导出
 * Authentication module exports
 *
 * 提供 OAuth2 认证相关的工具类和服务
 * Provides OAuth2 authentication utilities and services
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
exports.AuthorizationUtils = exports.ScopeUtils = exports.PKCEUtils = exports.JWTUtils = void 0;
// 认证相关工具类 (Authentication utilities)
var jwt_utils_1 = require("./jwt-utils");
Object.defineProperty(exports, "JWTUtils", { enumerable: true, get: function () { return jwt_utils_1.JWTUtils; } });
var pkce_utils_1 = require("./pkce-utils");
Object.defineProperty(exports, "PKCEUtils", { enumerable: true, get: function () { return pkce_utils_1.PKCEUtils; } });
var scope_utils_1 = require("./scope-utils");
Object.defineProperty(exports, "ScopeUtils", { enumerable: true, get: function () { return scope_utils_1.ScopeUtils; } });
var authorization_utils_1 = require("./authorization-utils");
Object.defineProperty(exports, "AuthorizationUtils", { enumerable: true, get: function () { return authorization_utils_1.AuthorizationUtils; } });
// 密码工具函数 (Password utility functions)
__exportStar(require("./passwordUtils"), exports);
