// 导入jest-dom扩展断言
import '@testing-library/jest-dom';

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

// 模拟next/image组件
jest.mock('next/image', () => ({
  __esModule: true,
  default: (props) => {
    // eslint-disable-next-line jsx-a11y/alt-text
    return <img {...props} />;
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
  