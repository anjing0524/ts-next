"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const winston_1 = __importDefault(require("winston"));
require("winston-daily-rotate-file");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
// 确保日志目录存在
const logDir = path_1.default.join(process.cwd(), 'logs');
if (!fs_1.default.existsSync(logDir)) {
    fs_1.default.mkdirSync(logDir, { recursive: true });
}
// 定义文件日志格式
const fileLogFormat = winston_1.default.format.combine(winston_1.default.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), winston_1.default.format.printf(({ timestamp, level, message }) => {
    return `${timestamp} [${level.toUpperCase()}]: ${message}`;
}));
// 定义控制台日志格式（美化版）
const consoleLogFormat = winston_1.default.format.combine(winston_1.default.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }), winston_1.default.format.colorize({ all: true }), winston_1.default.format.printf(({ timestamp, level, message }) => {
    const levelPadded = level.padEnd(15); // 确保日志级别对齐
    return `🕒 ${timestamp} | ${levelPadded} | ${message}`;
}));
// 创建按日期轮转的文件传输器
const dailyRotateFileTransport = new winston_1.default.transports.DailyRotateFile({
    filename: path_1.default.join(logDir, '%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    maxSize: '20m',
    maxFiles: '14d',
    format: fileLogFormat,
});
// 创建美化的控制台传输器
const consoleTransport = new winston_1.default.transports.Console({
    format: consoleLogFormat,
});
// 创建 logger 实例
const logger = winston_1.default.createLogger({
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    transports: [consoleTransport, dailyRotateFileTransport],
});
exports.default = logger;
