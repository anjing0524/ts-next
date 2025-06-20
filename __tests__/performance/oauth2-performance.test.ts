/**
 * OAuth2性能测试
 */

import { performance } from 'perf_hooks';
import crypto from 'crypto';
import { generateCodeVerifier, generateCodeChallenge } from '@/lib/auth/pkce';

/**
 * 授权工具类 - 用于性能测试
 */
class AuthorizationUtils {
  /**
   * 生成授权码
   */
  static async generateAuthorizationCode(): Promise<string> {
    return crypto.randomBytes(32).toString('base64url');
  }

  /**
   * 验证作用域
   */
  static async validateScope(scopes: string[]): Promise<boolean> {
    const allowedScopes = ['read', 'write', 'admin'];
    return scopes.every(scope => allowedScopes.includes(scope));
  }
}

const PERFORMANCE_CONFIG = {
  BENCHMARK: {
    ITERATIONS: 50,
    MAX_RESPONSE_TIME: 1000,
    PERCENTILE_95_MAX: 500,
  },
  CONCURRENCY: {
    CONCURRENT_USERS: 20,
    REQUESTS_PER_USER: 5,
    MAX_CONCURRENT_TIME: 5000,
    SUCCESS_RATE_MIN: 95,
  },
};

interface PerformanceMetrics {
  totalRequests: number;
  successfulRequests: number;
  averageResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  percentile95: number;
  requestsPerSecond: number;
  successRate: number;
  duration: number;
}

class PerformanceTestUtils {
  static calculateMetrics(
    responseTimes: number[],
    startTime: number,
    endTime: number,
    failedCount: number = 0
  ): PerformanceMetrics {
    const sortedTimes = responseTimes.sort((a, b) => a - b);
    const totalRequests = responseTimes.length + failedCount;
    const successfulRequests = responseTimes.length;
    const duration = endTime - startTime;
    
    return {
      totalRequests,
      successfulRequests,
      averageResponseTime: responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length,
      minResponseTime: Math.min(...responseTimes),
      maxResponseTime: Math.max(...responseTimes),
      percentile95: sortedTimes[Math.floor(sortedTimes.length * 0.95)],
      requestsPerSecond: (successfulRequests / duration) * 1000,
      successRate: (successfulRequests / totalRequests) * 100,
      duration,
    };
  }

  static async executeAuthorizationCodeGeneration(): Promise<number> {
    const startTime = performance.now();
    const code = await AuthorizationUtils.generateAuthorizationCode();
    const endTime = performance.now();
    
    expect(code).toBeDefined();
    expect(typeof code).toBe('string');
    expect(code.length).toBeGreaterThan(0);
    
    return endTime - startTime;
  }

  static async executePKCEGeneration(): Promise<number> {
    const startTime = performance.now();
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    const endTime = performance.now();
    
    expect(codeVerifier).toBeDefined();
    expect(codeChallenge).toBeDefined();
    
    return endTime - startTime;
  }
}

describe('OAuth2性能测试', () => {
  describe('基准性能测试', () => {
    test('授权码生成性能基准测试', async () => {
      const responseTimes: number[] = [];
      
      const startTime = performance.now();
      
      for (let i = 0; i < PERFORMANCE_CONFIG.BENCHMARK.ITERATIONS; i++) {
        const responseTime = await PerformanceTestUtils.executeAuthorizationCodeGeneration();
        responseTimes.push(responseTime);
      }
      
      const endTime = performance.now();
      const metrics = PerformanceTestUtils.calculateMetrics(responseTimes, startTime, endTime);
      
      expect(metrics.averageResponseTime).toBeLessThan(PERFORMANCE_CONFIG.BENCHMARK.MAX_RESPONSE_TIME);
      expect(metrics.percentile95).toBeLessThan(PERFORMANCE_CONFIG.BENCHMARK.PERCENTILE_95_MAX);
      expect(metrics.successRate).toBe(100);
      
      console.log('授权码生成性能指标:', {
        平均响应时间: `${metrics.averageResponseTime.toFixed(2)}ms`,
        最小响应时间: `${metrics.minResponseTime.toFixed(2)}ms`,
        最大响应时间: `${metrics.maxResponseTime.toFixed(2)}ms`,
        '95%响应时间': `${metrics.percentile95.toFixed(2)}ms`,
        每秒请求数: `${metrics.requestsPerSecond.toFixed(2)}`,
        成功率: `${metrics.successRate.toFixed(2)}%`,
      });
    });

    test('PKCE生成性能基准测试', async () => {
      const responseTimes: number[] = [];
      
      const startTime = performance.now();
      
      for (let i = 0; i < PERFORMANCE_CONFIG.BENCHMARK.ITERATIONS; i++) {
        const responseTime = await PerformanceTestUtils.executePKCEGeneration();
        responseTimes.push(responseTime);
      }
      
      const endTime = performance.now();
      const metrics = PerformanceTestUtils.calculateMetrics(responseTimes, startTime, endTime);
      
      expect(metrics.averageResponseTime).toBeLessThan(PERFORMANCE_CONFIG.BENCHMARK.MAX_RESPONSE_TIME);
      expect(metrics.percentile95).toBeLessThan(PERFORMANCE_CONFIG.BENCHMARK.PERCENTILE_95_MAX);
      expect(metrics.successRate).toBe(100);
      
      console.log('PKCE生成性能指标:', {
        平均响应时间: `${metrics.averageResponseTime.toFixed(2)}ms`,
        最小响应时间: `${metrics.minResponseTime.toFixed(2)}ms`,
        最大响应时间: `${metrics.maxResponseTime.toFixed(2)}ms`,
        '95%响应时间': `${metrics.percentile95.toFixed(2)}ms`,
        每秒请求数: `${metrics.requestsPerSecond.toFixed(2)}`,
        成功率: `${metrics.successRate.toFixed(2)}%`,
      });
    });
  });

  describe('并发性能测试', () => {
    test('并发授权码生成测试', async () => {
      const startTime = performance.now();
      const promises: Promise<number>[] = [];
      
      const totalRequests = PERFORMANCE_CONFIG.CONCURRENCY.CONCURRENT_USERS * PERFORMANCE_CONFIG.CONCURRENCY.REQUESTS_PER_USER;
      
      for (let i = 0; i < totalRequests; i++) {
        promises.push(PerformanceTestUtils.executeAuthorizationCodeGeneration());
      }
      
      const responseTimes = await Promise.all(promises);
      const endTime = performance.now();
      
      const metrics = PerformanceTestUtils.calculateMetrics(responseTimes, startTime, endTime);
      
      expect(metrics.duration).toBeLessThan(PERFORMANCE_CONFIG.CONCURRENCY.MAX_CONCURRENT_TIME);
      expect(metrics.successRate).toBeGreaterThanOrEqual(PERFORMANCE_CONFIG.CONCURRENCY.SUCCESS_RATE_MIN);
      
      console.log('并发授权码生成性能指标:', {
        总请求数: metrics.totalRequests,
        成功请求数: metrics.successfulRequests,
        平均响应时间: `${metrics.averageResponseTime.toFixed(2)}ms`,
        '95%响应时间': `${metrics.percentile95.toFixed(2)}ms`,
        每秒请求数: `${metrics.requestsPerSecond.toFixed(2)}`,
        成功率: `${metrics.successRate.toFixed(2)}%`,
        总耗时: `${metrics.duration.toFixed(2)}ms`,
      });
    });

    test('并发PKCE生成测试', async () => {
      const startTime = performance.now();
      const promises: Promise<number>[] = [];
      
      const totalRequests = PERFORMANCE_CONFIG.CONCURRENCY.CONCURRENT_USERS * PERFORMANCE_CONFIG.CONCURRENCY.REQUESTS_PER_USER;
      
      for (let i = 0; i < totalRequests; i++) {
        promises.push(PerformanceTestUtils.executePKCEGeneration());
      }
      
      const responseTimes = await Promise.all(promises);
      const endTime = performance.now();
      
      const metrics = PerformanceTestUtils.calculateMetrics(responseTimes, startTime, endTime);
      
      expect(metrics.duration).toBeLessThan(PERFORMANCE_CONFIG.CONCURRENCY.MAX_CONCURRENT_TIME);
      expect(metrics.successRate).toBeGreaterThanOrEqual(PERFORMANCE_CONFIG.CONCURRENCY.SUCCESS_RATE_MIN);
      
      console.log('并发PKCE生成性能指标:', {
        总请求数: metrics.totalRequests,
        成功请求数: metrics.successfulRequests,
        平均响应时间: `${metrics.averageResponseTime.toFixed(2)}ms`,
        '95%响应时间': `${metrics.percentile95.toFixed(2)}ms`,
        每秒请求数: `${metrics.requestsPerSecond.toFixed(2)}`,
        成功率: `${metrics.successRate.toFixed(2)}%`,
        总耗时: `${metrics.duration.toFixed(2)}ms`,
      });
    });
  });
});
