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

// Define placeholder JWT PEM keys if not already set
if (!process.env.JWT_PRIVATE_KEY_PEM) {
  process.env.JWT_PRIVATE_KEY_PEM = "placeholder_private_key_pem_for_testing_only";
  console.warn(
    "⚠️ WARNING: JWT_PRIVATE_KEY_PEM was not set. Using a placeholder for testing. " +
    "Actual JWT signing/verification will not be cryptographically valid."
  );
}
if (!process.env.JWT_PUBLIC_KEY_PEM) {
  process.env.JWT_PUBLIC_KEY_PEM = "placeholder_public_key_pem_for_testing_only";
  console.warn(
    "⚠️ WARNING: JWT_PUBLIC_KEY_PEM was not set. Using a placeholder for testing. " +
    "Actual JWT signing/verification will not be cryptographically valid."
  );
}
// It's also good practice to set other related JWT env vars if they are expected by JWTUtils
if (!process.env.JWT_ALGORITHM) {
  process.env.JWT_ALGORITHM = "RS256"; // Default algorithm used in JWTUtils
}
if (!process.env.JWT_KEY_ID) {
  process.env.JWT_KEY_ID = "test-kid";
}
if (!process.env.JWT_ISSUER) {
  process.env.JWT_ISSUER = "http://localhost:3000"; // Default test issuer
}
if (!process.env.JWT_AUDIENCE) {
  process.env.JWT_AUDIENCE = "api_resource_dev"; // Default test audience
}
if (!process.env.JWKS_URI) {
  process.env.JWKS_URI = "http://localhost/.well-known/jwks.json"; // Dummy JWKS URI for testing
  console.warn(
    "⚠️ WARNING: JWKS_URI was not set. Using a placeholder for testing. " +
    "Actual JWT validation against a remote JWKS will not occur without further mocking if fetch is called."
  );
}


// Setup environment variables for testing
Object.assign(process.env, {
  NODE_ENV: 'test', // This will be set regardless of prior value
  NEXT_PUBLIC_BASE_PATH: '/datamgr_flow',
  TEST_BASE_URL: 'http://localhost:3000',
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

import { prisma } from '@/lib/prisma'; // Import prisma for connect/disconnect
import logger from '@/utils/logger'; // Import the actual logger to clear its mocks

// Setup and cleanup hooks
beforeAll(async () => {
  console.log('🧪 测试环境初始化 (使用真实数据库连接和真实API路由)');
  console.log(
    '🧪 Test environment initialized (using real database connection and real API routes)'
  );

  // 确保测试数据库连接
  try {
    await prisma.$connect();
    (globalThis as any).__vitestConnectedPrisma = prisma; // Store the connected instance globally
    console.log('✅ 数据库连接成功 / Database connection successful');
  } catch (error) {
    console.error('❌ 数据库连接失败 / Database connection failed:', error);
    throw error;
  }
});

beforeEach(() => {
  // Reset only logger mocks specifically
  vi.mocked(logger.info).mockClear();
  vi.mocked(logger.error).mockClear();
  vi.mocked(logger.warn).mockClear();
  vi.mocked(logger.debug).mockClear();
});

afterEach(() => {
  // Additional cleanup if needed
});

afterAll(async () => {
  console.log('🧹 测试环境清理完成 / Test environment cleaned up');

  // 断开数据库连接
  try {
    const connectedPrisma = (globalThis as any).__vitestConnectedPrisma;
    if (connectedPrisma && typeof connectedPrisma.$disconnect === 'function') {
      await connectedPrisma.$disconnect();
      console.log('✅ 数据库连接已断开 (via __vitestConnectedPrisma) / Database connection disconnected');
    } else {
      // Fallback if __vitestConnectedPrisma wasn't set or valid
      console.warn('__vitestConnectedPrisma not found or not functional, attempting disconnect on prisma from import.');
      await prisma.$disconnect();
      console.log('✅ 数据库连接已断开 (via direct import) / Database connection disconnected');
    }
  } catch (error) {
    console.error('❌ 数据库断开连接失败 / Database disconnection failed:', error);
  } finally {
    delete (globalThis as any).__vitestConnectedPrisma; // Clean up
  }
});
