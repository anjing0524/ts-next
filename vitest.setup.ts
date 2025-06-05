// vitest.setup.ts
import { vi, beforeAll, beforeEach, afterEach, afterAll } from 'vitest';
import { TextEncoder, TextDecoder } from 'util';

// Polyfill global objects for Node.js environment
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder as any;

// Mock fetch if not available (for OAuth2 HTTP clients)
if (!global.fetch) {
  const nodeFetch = require('node-fetch');
  global.fetch = nodeFetch;
  global.Headers = nodeFetch.Headers;
  global.Request = nodeFetch.Request;
  global.Response = nodeFetch.Response;
}

// REMOVED: NextRequest and NextResponse mocks - we want real implementations for coverage
// The previous mocks prevented actual API route execution

// Setup environment variables for testing
Object.assign(process.env, {
  NODE_ENV: 'test',
  NEXT_PUBLIC_BASE_PATH: '/datamgr_flow',
  TEST_BASE_URL: 'http://localhost:3000'
});

// Mock logger only (但保持其他真实功能)
vi.mock('@/utils/logger', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

// Setup and cleanup hooks
beforeAll(async () => {
  console.log('🧪 测试环境初始化 (使用真实数据库连接和真实API路由)');
  console.log('🧪 Test environment initialized (using real database connection and real API routes)');
  
  // 确保测试数据库连接
  try {
    const { prisma } = await import('@/lib/prisma');
    await prisma.$connect();
    console.log('✅ 数据库连接成功 / Database connection successful');
  } catch (error) {
    console.error('❌ 数据库连接失败 / Database connection failed:', error);
    throw error;
  }
});

beforeEach(() => {
  // Reset only logger mocks before each test
  vi.clearAllMocks();
});

afterEach(() => {
  // Additional cleanup if needed
});

afterAll(async () => {
  console.log('🧹 测试环境清理完成 / Test environment cleaned up');
  
  // 断开数据库连接
  try {
    const { prisma } = await import('@/lib/prisma');
    await prisma.$disconnect();
    console.log('✅ 数据库连接已断开 / Database connection disconnected');
  } catch (error) {
    console.error('❌ 数据库断开连接失败 / Database disconnection failed:', error);
  }
});