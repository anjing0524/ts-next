#!/usr/bin/env node

/**
 * ZMQ日志服务测试脚本
 * 测试zmq-log-server和zmq-logger-napi的完整功能
 */

const { Logger } = require('./zmq-logger-napi');
const path = require('path');
const fs = require('fs');

async function testLogger() {
    console.log('🚀 开始测试ZMQ日志服务...\n');

    // 创建日志记录器
    const logger = new Logger('tcp://localhost:5555');
    
    console.log('📝 测试基本日志功能...');
    
    // 测试不同级别的日志
    logger.info('这是一条信息日志');
    logger.warn('这是一条警告日志');
    logger.error('这是一条错误日志');
    logger.debug('这是一条调试日志');
    logger.trace('这是一条跟踪日志');
    
    console.log('✅ 基本日志功能测试完成\n');
    
    console.log('📝 测试结构化日志功能...');
    
    // 测试带字段的日志
    logger.log_with_fields(
        'info',
        '用户登录',
        JSON.stringify({
            userId: '12345',
            username: 'testuser',
            action: 'login',
            ip: '192.168.1.100'
        }),
        ['auth', 'user', 'security']
    );
    
    // 测试带追踪ID的日志
    logger.log_with_trace(
        'info',
        'API请求处理',
        'trace-123-456-789',
        JSON.stringify({
            endpoint: '/api/users',
            method: 'GET',
            responseTime: 150
        })
    );
    
    console.log('✅ 结构化日志功能测试完成\n');
    
    console.log('📝 测试错误日志功能...');
    
    // 测试错误日志
    try {
        throw new Error('这是一个测试错误');
    } catch (error) {
        logger.log_with_stack(
            'error',
            '测试错误处理',
            error.stack,
            ['test', 'error']
        );
    }
    
    console.log('✅ 错误日志功能测试完成\n');
    
    console.log('📝 测试批量日志功能...');
    
    // 测试批量日志
    const batchLogs = [
        { level: 'info', message: '批量日志1', fields: { batchId: 1 } },
        { level: 'info', message: '批量日志2', fields: { batchId: 1 } },
        { level: 'info', message: '批量日志3', fields: { batchId: 1 } }
    ];
    
    for (const log of batchLogs) {
        logger.log_with_fields(
            log.level,
            log.message,
            JSON.stringify(log.fields),
            ['batch', 'test']
        );
    }
    
    console.log('✅ 批量日志功能测试完成\n');
    
    console.log('📝 测试不同服务的日志...');
    
    // 测试不同服务的日志
    logger.log_with_fields(
        'info',
        'OAuth服务启动',
        JSON.stringify({
            service: 'oauth-service-rust',
            version: '1.0.0',
            port: 3001
        }),
        ['service', 'startup']
    );
    
    logger.log_with_fields(
        'info',
        'K线服务启动',
        JSON.stringify({
            service: 'kline-service',
            version: '1.0.0',
            port: 3003
        }),
        ['service', 'startup']
    );
    
    console.log('✅ 服务日志功能测试完成\n');
    
    console.log('🎉 所有测试完成！');
    console.log('📊 测试统计:');
    console.log('   - 基本日志: 5条');
    console.log('   - 结构化日志: 2条');
    console.log('   - 错误日志: 1条');
    console.log('   - 批量日志: 3条');
    console.log('   - 服务日志: 2条');
    console.log('   - 总计: 13条日志');
    
    console.log('\n💡 提示:');
    console.log('   1. 确保zmq-log-server服务正在运行 (端口5555)');
    console.log('   2. 检查logs目录下的日志文件');
    console.log('   3. 验证日志格式和内容是否正确');
}

// 运行测试
if (require.main === module) {
    testLogger().catch(console.error);
}

module.exports = { testLogger };