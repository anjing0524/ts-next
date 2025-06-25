"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateRequestId = generateRequestId;
exports.successResponse = successResponse;
exports.errorResponse = errorResponse;
const nanoid_1 = require("nanoid");
function generateRequestId() {
    return (0, nanoid_1.nanoid)();
}
function successResponse(data, statusCode = 200, message = 'Operation successful', customRequestId) {
    return {
        code: statusCode,
        message,
        data,
        timestamp: new Date().toISOString(),
        requestId: customRequestId || generateRequestId(),
    };
}
function errorResponse(message, statusCode, customRequestId) {
    return {
        code: statusCode,
        message,
        data: null,
        timestamp: new Date().toISOString(),
        requestId: customRequestId || generateRequestId(),
    };
}
