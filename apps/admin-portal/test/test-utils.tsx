/**
 * React component testing utilities
 * 
 * Provides custom testing utilities for React components
 */

import { render, RenderOptions } from '@testing-library/react';
import { ReactElement } from 'react';
import { AppStore } from '@/store';

// Custom render function with store provider
interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  store?: AppStore;
  initialState?: any;
}

export function renderWithStore(
  ui: ReactElement,
  { store, initialState, ...options }: CustomRenderOptions = {}
) {
  // Create a wrapper with store context if needed
  const Wrapper = ({ children }: { children: React.ReactNode }) => {
    // If store is provided, use it, otherwise use default
    return <>{children}</>;
  };

  return {
    ...render(ui, { wrapper: Wrapper, ...options }),
    // Add store to returned utilities
    store,
  };
}

// Mock hooks for testing
export const createMockStore = (initialState = {}) => {
  return {
    getState: () => initialState,
    setState: jest.fn(),
    subscribe: jest.fn(),
    destroy: jest.fn(),
  };
};

// Test data generators
export const generateTestData = {
  user: (overrides = {}) => ({
    id: 'test-user-id',
    username: 'testuser',
    email: 'test@example.com',
    roles: ['user'],
    permissions: ['read:dashboard'],
    ...overrides,
  }),

  permission: (overrides = {}) => ({
    id: 'test-permission-id',
    name: 'Test Permission',
    description: 'Test permission description',
    resource: 'dashboard',
    action: 'read',
    ...overrides,
  }),

  role: (overrides = {}) => ({
    id: 'test-role-id',
    name: 'Test Role',
    description: 'Test role description',
    permissions: ['read:dashboard'],
    ...overrides,
  }),

  notification: (overrides = {}) => ({
    id: 'test-notification-id',
    type: 'info',
    message: 'Test notification',
    timestamp: Date.now(),
    ...overrides,
  }),
};

// Custom matchers
expect.extend({
  toHavePermission(received, permission) {
    const hasPermission = received.permissions?.includes(permission);
    return {
      message: () => 
        `expected ${received} ${hasPermission ? 'not ' : ''}to have permission ${permission}`,
      pass: hasPermission,
    };
  },

  toHaveRole(received, role) {
    const hasRole = received.roles?.includes(role);
    return {
      message: () => 
        `expected ${received} ${hasRole ? 'not ' : ''}to have role ${role}`,
      pass: hasRole,
    };
  },

  toBeLoading(received) {
    const isLoading = received.loading === true;
    return {
      message: () => 
        `expected ${received} ${isLoading ? 'not ' : ''}to be loading`,
      pass: isLoading,
    };
  },

  toHaveError(received, error) {
    const hasError = received.error === error;
    return {
      message: () => 
        `expected ${received} ${hasError ? 'not ' : ''}to have error ${error}`,
      pass: hasError,
    };
  },
});

// Mock performance API
export const mockPerformance = () => {
  const mockPerformance = {
    now: jest.fn(() => Date.now()),
    getEntriesByType: jest.fn(() => []),
    mark: jest.fn(),
    measure: jest.fn(),
    clearMarks: jest.fn(),
    clearMeasures: jest.fn(),
  };

  Object.defineProperty(window, 'performance', {
    value: mockPerformance,
    writable: true,
  });

  return mockPerformance;
};

// Mock IntersectionObserver
export const mockIntersectionObserver = () => {
  const mockIntersectionObserver = jest.fn(() => ({
    observe: jest.fn(),
    unobserve: jest.fn(),
    disconnect: jest.fn(),
  }));

  Object.defineProperty(window, 'IntersectionObserver', {
    value: mockIntersectionObserver,
    writable: true,
  });

  return mockIntersectionObserver;
};

// Mock ResizeObserver
export const mockResizeObserver = () => {
  const mockResizeObserver = jest.fn(() => ({
    observe: jest.fn(),
    unobserve: jest.fn(),
    disconnect: jest.fn(),
  }));

  Object.defineProperty(window, 'ResizeObserver', {
    value: mockResizeObserver,
    writable: true,
  });

  return mockResizeObserver;
};

// Mock RequestIdleCallback
export const mockRequestIdleCallback = () => {
  const mockRequestIdleCallback = jest.fn((callback) => {
    return setTimeout(callback, 0);
  });

  const mockCancelIdleCallback = jest.fn((id) => {
    clearTimeout(id);
  });

  Object.defineProperty(window, 'requestIdleCallback', {
    value: mockRequestIdleCallback,
    writable: true,
  });

  Object.defineProperty(window, 'cancelIdleCallback', {
    value: mockCancelIdleCallback,
    writable: true,
  });

  return { mockRequestIdleCallback, mockCancelIdleCallback };
};

// Test utilities for async operations
export const waitForAsync = () => {
  return new Promise(resolve => setTimeout(resolve, 0));
};

export const flushPromises = () => {
  return new Promise(resolve => setTimeout(resolve, 0));
};

// Mock fetch API
export const mockFetch = () => {
  const mockFetch = jest.fn();
  Object.defineProperty(window, 'fetch', {
    value: mockFetch,
    writable: true,
  });
  return mockFetch;
};

// Mock localStorage
export const mockLocalStorage = () => {
  const store: Record<string, string> = {};
  
  const mockLocalStorage = {
    getItem: jest.fn((key: string) => store[key]),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value.toString();
    }),
    removeItem: jest.fn((key: string) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      Object.keys(store).forEach(key => delete store[key]);
    }),
    key: jest.fn((index: number) => Object.keys(store)[index]),
    length: 0,
  };

  Object.defineProperty(window, 'localStorage', {
    value: mockLocalStorage,
    writable: true,
  });

  return mockLocalStorage;
};

// Mock sessionStorage
export const mockSessionStorage = () => {
  const store: Record<string, string> = {};
  
  const mockSessionStorage = {
    getItem: jest.fn((key: string) => store[key]),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value.toString();
    }),
    removeItem: jest.fn((key: string) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      Object.keys(store).forEach(key => delete store[key]);
    }),
    key: jest.fn((index: number) => Object.keys(store)[index]),
    length: 0,
  };

  Object.defineProperty(window, 'sessionStorage', {
    value: mockSessionStorage,
    writable: true,
  });

  return mockSessionStorage;
};

// Test helpers for forms
export const fillForm = (form: HTMLFormElement, data: Record<string, string>) => {
  Object.entries(data).forEach(([name, value]) => {
    const input = form.querySelector(`[name="${name}"]`) as HTMLInputElement;
    if (input) {
      input.value = value;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
};

export const submitForm = (form: HTMLFormElement) => {
  form.dispatchEvent(new Event('submit', { bubbles: true }));
};

// Test helpers for user interactions
export const clickElement = (element: Element) => {
  element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
};

export const typeText = (element: Element, text: string) => {
  const input = element as HTMLInputElement;
  input.value = text;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
};

// Test helpers for navigation
export const mockRouter = () => {
  const mockRouter = {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
    prefetch: jest.fn(),
  };

  return mockRouter;
};

// Re-export everything from @testing-library/react
export * from '@testing-library/react';
export * from '@testing-library/jest-dom';
export * from '@testing-library/user-event';