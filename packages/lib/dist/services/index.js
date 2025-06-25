"use strict";
/**
 * 服务模块统一导出
 * Services module exports
 *
 * 提供业务逻辑服务类
 * Provides business logic service classes
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.RBACService = void 0;
// RBAC 权限服务 (RBAC permission service)
var rbacService_1 = require("./rbacService");
Object.defineProperty(exports, "RBACService", { enumerable: true, get: function () { return rbacService_1.RBACService; } });
