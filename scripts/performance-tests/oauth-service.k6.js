/**
 * OAuth Service 性能测试
 *
 * 测试关键 API 端点的性能和负载承载能力
 *
 * 运行命令:
 *   k6 run scripts/performance-tests/oauth-service.k6.js
 *
 * 带选项运行:
 *   k6 run -u 100 -d 30s scripts/performance-tests/oauth-service.k6.js  # 100 个用户, 30 秒持续时间
 */

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend, Counter, Gauge } from 'k6/metrics';

// 定义自定义指标
const errorRate = new Rate('errors');
const authorizationDuration = new Trend('auth_duration');
const tokenRefreshDuration = new Trend('token_refresh_duration');
const healthCheckDuration = new Trend('health_check_duration');
const userManagementDuration = new Trend('user_mgmt_duration');
const requestCounter = new Counter('http_requests_total');

// 性能测试配置
export const options = {
  // 默认配置: 10 个用户，10 分钟测试
  stages: [
    { duration: '1m', target: 10 },   // 梯次上升: 0 -> 10 用户
    { duration: '5m', target: 50 },   // 梯次上升: 10 -> 50 用户
    { duration: '3m', target: 10 },   // 梯次下降: 50 -> 10 用户
    { duration: '1m', target: 0 },    // 梯次下降: 10 -> 0 用户
  ],

  // 性能阈值
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'],  // 95% 请求 < 500ms, 99% < 1000ms
    http_req_failed: ['rate<0.1'],                     // 错误率 < 10%
    errors: ['rate<0.1'],
    auth_duration: ['p(95)<300', 'p(99)<500'],        // 认证 API: 95% < 300ms
    token_refresh_duration: ['p(95)<400', 'p(99)<700'], // Token 刷新: 95% < 400ms
    health_check_duration: ['p(95)<100'],              // 健康检查: 95% < 100ms
  },

  // 云执行配置（可选）
  // cloud: {
  //   projectID: 1234567,
  //   name: 'OAuth Service Performance Test',
  // },
};

// 基础 URL
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001/api/v2';
const ADMIN_BASE_URL = __ENV.ADMIN_BASE_URL || 'http://localhost:3002/api';

// 测试数据
const testUsers = [
  { email: `test-user-${Math.random()}@example.com`, password: 'TestPassword123!' },
  { email: `test-user-${Math.random()}@example.com`, password: 'TestPassword123!' },
  { email: `test-user-${Math.random()}@example.com`, password: 'TestPassword123!' },
];

/**
 * 测试: 健康检查
 * 验证 OAuth 服务可用性
 */
function testHealthCheck() {
  group('Health Check', function () {
    const startTime = new Date();
    const response = http.get(`${BASE_URL}/health`);
    const duration = new Date() - startTime;

    healthCheckDuration.add(duration);
    requestCounter.add(1);

    const result = check(response, {
      'health check status is 200': (r) => r.status === 200,
      'health check response time < 200ms': (r) => r.timings.duration < 200,
    });

    errorRate.add(!result);
  });
}

/**
 * 测试: 授权流程
 * 模拟 OAuth 2.0 授权码流程
 */
function testAuthorizationFlow() {
  group('Authorization Flow', function () {
    // Step 1: 获取授权码
    const authStartTime = new Date();
    const authResponse = http.post(
      `${BASE_URL}/oauth/authorize`,
      {
        client_id: 'test-client',
        redirect_uri: 'http://localhost:3002/auth/callback',
        response_type: 'code',
        scope: 'openid profile email',
        state: Math.random().toString(36).substring(7),
      },
      {
        headers: { 'Content-Type': 'application/json' },
      }
    );

    const authDuration = new Date() - authStartTime;
    authorizationDuration.add(authDuration);
    requestCounter.add(1);

    const authResult = check(authResponse, {
      'authorization request successful': (r) => r.status === 200 || r.status === 302,
      'authorization response time < 500ms': (r) => r.timings.duration < 500,
    });

    errorRate.add(!authResult);

    // Step 2: 交换令牌（如果有授权码）
    if (authResponse.status === 200 || authResponse.status === 302) {
      sleep(0.5);

      const tokenStartTime = new Date();
      const tokenResponse = http.post(
        `${BASE_URL}/oauth/token`,
        {
          grant_type: 'authorization_code',
          code: 'test-auth-code',
          client_id: 'test-client',
          client_secret: 'test-secret',
          redirect_uri: 'http://localhost:3002/auth/callback',
        },
        {
          headers: { 'Content-Type': 'application/json' },
        }
      );

      const tokenDuration = new Date() - tokenStartTime;
      authorizationDuration.add(tokenDuration);
      requestCounter.add(1);

      const tokenResult = check(tokenResponse, {
        'token request successful': (r) => r.status === 200,
        'token response includes access_token': (r) => r.body.includes('access_token'),
      });

      errorRate.add(!tokenResult);
    }
  });
}

/**
 * 测试: Token 刷新
 * 验证 Token 刷新端点的性能
 */
function testTokenRefresh() {
  group('Token Refresh', function () {
    const startTime = new Date();
    const response = http.post(
      `${BASE_URL}/oauth/token`,
      {
        grant_type: 'refresh_token',
        refresh_token: 'test-refresh-token',
        client_id: 'test-client',
        client_secret: 'test-secret',
      },
      {
        headers: { 'Content-Type': 'application/json' },
      }
    );

    const duration = new Date() - startTime;
    tokenRefreshDuration.add(duration);
    requestCounter.add(1);

    const result = check(response, {
      'token refresh request successful': (r) => r.status === 200 || r.status === 401,
      'token refresh response time < 500ms': (r) => r.timings.duration < 500,
    });

    errorRate.add(!result);
  });
}

/**
 * 测试: 用户管理 API
 * 测试用户创建、查询、更新等操作的性能
 */
function testUserManagement() {
  group('User Management', function () {
    // 获取随机测试用户
    const testUser = testUsers[Math.floor(Math.random() * testUsers.length)];

    // 创建用户
    const createStartTime = new Date();
    const createResponse = http.post(
      `${ADMIN_BASE_URL}/users`,
      {
        email: testUser.email,
        password: testUser.password,
        name: `Test User ${Math.random()}`,
        role: 'user',
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token',
        },
      }
    );

    const createDuration = new Date() - createStartTime;
    userManagementDuration.add(createDuration);
    requestCounter.add(1);

    check(createResponse, {
      'user creation successful': (r) => r.status === 201 || r.status === 200,
      'user creation response time < 500ms': (r) => r.timings.duration < 500,
    });

    // 获取用户列表
    sleep(0.5);
    const listStartTime = new Date();
    const listResponse = http.get(
      `${ADMIN_BASE_URL}/users?page=1&limit=20`,
      {
        headers: {
          'Authorization': 'Bearer test-token',
        },
      }
    );

    const listDuration = new Date() - listStartTime;
    userManagementDuration.add(listDuration);
    requestCounter.add(1);

    check(listResponse, {
      'user list retrieval successful': (r) => r.status === 200,
      'user list response time < 300ms': (r) => r.timings.duration < 300,
    });
  });
}

/**
 * 测试: 权限验证
 * 测试权限检查端点的性能
 */
function testPermissionCheck() {
  group('Permission Check', function () {
    const response = http.get(
      `${ADMIN_BASE_URL}/permissions/check?resource=users&action=read`,
      {
        headers: {
          'Authorization': 'Bearer test-token',
        },
      }
    );

    requestCounter.add(1);

    check(response, {
      'permission check successful': (r) => r.status === 200 || r.status === 403,
      'permission check response time < 200ms': (r) => r.timings.duration < 200,
    });
  });
}

/**
 * 主测试函数
 * 模拟实际用户行为
 */
export default function () {
  // 健康检查
  testHealthCheck();
  sleep(1);

  // 授权流程
  testAuthorizationFlow();
  sleep(2);

  // Token 刷新
  testTokenRefresh();
  sleep(1);

  // 用户管理
  testUserManagement();
  sleep(2);

  // 权限检查
  testPermissionCheck();
  sleep(1);
}

/**
 * 测试执行结束时的汇总
 */
export function handleSummary(data) {
  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    'summary.json': JSON.stringify(data),
  };
}

/**
 * 文本摘要生成函数
 */
function textSummary(data, options) {
  const { indent = '', enableColors = false } = options;

  let summary = `\n${indent}═══════════════════════════════════\n`;
  summary += `${indent}     性能测试执行摘要\n`;
  summary += `${indent}═══════════════════════════════════\n\n`;

  // 添加指标信息
  if (data.metrics) {
    summary += `${indent}请求统计:\n`;
    summary += `${indent}  - 总请求数: ${data.metrics.http_requests_total?.value || 0}\n`;
    summary += `${indent}  - 错误率: ${(data.metrics.errors?.value || 0).toFixed(2)}%\n`;
    summary += `${indent}\n`;
  }

  return summary;
}
