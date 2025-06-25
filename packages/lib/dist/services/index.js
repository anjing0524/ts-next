"use strict";
/**
 * 服务模块统一导出
 * Services module exports
 *
 * 提供业务逻辑服务类
 * Provides business logic service classes
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PermissionService = exports.RBACService = void 0;
// RBAC 权限服务 (RBAC permission service)
var rbac_service_1 = require("./rbac-service");
Object.defineProperty(exports, "RBACService", { enumerable: true, get: function () { return rbac_service_1.RBACService; } });
// 权限服务 (Permission service)
var permission_service_1 = require("./permission-service");
Object.defineProperty(exports, "PermissionService", { enumerable: true, get: function () { return permission_service_1.PermissionService; } });
