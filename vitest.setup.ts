// vitest.setup.ts

// Ensure TextEncoder and TextDecoder are globally available
import { TextEncoder, TextDecoder } from 'util';
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder as any;

// Import vitest globals and setup
import { vi, beforeEach, afterEach } from 'vitest';

// Import testing library matchers for Vitest
import '@testing-library/jest-dom/vitest';

// Use isomorphic-fetch for fetch polyfill
import fetch from 'isomorphic-fetch';

global.fetch = fetch;

// Mock Next.js router for Vitest
vi.mock('next/router', () => ({
  useRouter() {
    return {
      route: '/',
      pathname: '',
      query: {},
      asPath: '',
      push: vi.fn(),
      replace: vi.fn(),
    };
  },
}));

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => ({
    get: vi.fn(),
    has: vi.fn(),
    getAll: vi.fn(),
    keys: vi.fn(),
    values: vi.fn(),
    entries: vi.fn(),
    forEach: vi.fn(),
    toString: vi.fn(),
  }),
  usePathname: () => '',
}));

import React from 'react';

// Mock next/image component
vi.mock('next/image', () => ({
  __esModule: true,
  default: (props: any) => {
    return React.createElement('img', props);
  },
}));

// Mock logger with default export
vi.mock('@/utils/logger', () => ({
  default: {
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

// Mock sessionStorage
const mockSessionStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
}

Object.defineProperty(window, 'sessionStorage', {
  value: mockSessionStorage,
})

// Mock crypto for PKCE generation
Object.defineProperty(global, 'crypto', {
  value: {
    getRandomValues: vi.fn((arr: Uint8Array) => {
      for (let i = 0; i < arr.length; i++) {
        arr[i] = Math.floor(Math.random() * 256);
      }
      return arr;
    }),
    subtle: {
      digest: vi.fn(() => Promise.resolve(new ArrayBuffer(32))),
    },
  },
})

// Mock btoa/atob
global.btoa = vi.fn((str: string) => Buffer.from(str, 'binary').toString('base64'))
global.atob = vi.fn((str: string) => Buffer.from(str, 'base64').toString('binary'))

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}

// Global test cleanup
beforeEach(() => {
  vi.clearAllMocks();
  mockSessionStorage.getItem.mockClear();
  mockSessionStorage.setItem.mockClear();
  mockSessionStorage.removeItem.mockClear();
  mockSessionStorage.clear.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
}); 

// 用全局的 setTimeout/clearTimeout/setImmediate 覆盖 node:timers 的导出
vi.mock('node:timers', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    setTimeout,
    clearTimeout,
    setImmediate: (cb: any) => setTimeout(cb, 0), // 强制用 setTimeout
  };
});