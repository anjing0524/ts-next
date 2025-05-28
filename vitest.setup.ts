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
// Note: Headers, Request, Response are already available in Node.js globally

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

// Global test cleanup
beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
}); 