// jest.setup.ts

// Ensure TextEncoder and TextDecoder are globally available from Node.js's 'util' module
// This needs to be at the very top before other imports that might rely on it (e.g., undici).
import { TextEncoder, TextDecoder } from 'util';
global.TextEncoder = TextEncoder;
// Node's TextDecoder might not perfectly match the DOM lib's TextDecoder type,
// hence the 'as any' if type mismatches occur in strict TypeScript environments.
global.TextDecoder = TextDecoder as any; 

import '@testing-library/jest-dom';

// Use isomorphic-fetch for a robust global fetch polyfill.
// This might be more compatible with Jest's environment than undici for setup.
import fetch, { Headers, Request, Response } from 'isomorphic-fetch';

global.fetch = fetch;
global.Headers = Headers;
global.Request = Request;
global.Response = Response;

// URL and URLSearchParams are generally available in modern Node.js and JSDOM.
// If specific issues arise, they can be polyfilled from 'url' module or 'whatwg-url'.

// 导入jest-dom扩展断言
// This line was originally: import '@testing-library/jest-dom';
// It's good to keep it.

// 模拟Next.js的路由
jest.mock('next/router', () => ({
  useRouter() {
    return {
      route: '/',
      pathname: '',
      query: {},
      asPath: '',
      push: jest.fn(),
      replace: jest.fn(),
    };
  },
}));

import React from 'react'; // Import React for React.createElement

// 模拟next/image组件
jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: any) => { // Add 'any' type for props for simplicity in mock
    // eslint-disable-next-line jsx-a11y/alt-text
    // Use React.createElement to avoid JSX syntax issues in setup file
    return React.createElement('img', props);
  },
}));

// 模拟logger
jest.mock('@/utils/logger', () => ({
  info: jest.fn(),
  debug: jest.fn(),
  error: jest.fn(),
}));

// 模拟 node:timers
jest.mock('node:timers', () => {
  const originalModule = jest.requireActual('node:timers');
  return {
    ...originalModule,
    setTimeout: jest.fn((callback, ms) => {
      return setTimeout(callback, ms);
    }),
    clearTimeout: jest.fn((timer) => {
      clearTimeout(timer);
    }),
    setImmediate: jest.fn((callback) => {
      return setTimeout(callback, 0);
    }),
  };
});
