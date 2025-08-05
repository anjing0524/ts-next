// jest.setup.js
import { TextEncoder, TextDecoder } from 'util';

global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Jest测试环境设置
require('@testing-library/jest-dom');

// Mock Next.js router
jest.mock('next/navigation', () => ({
  useRouter() {
    return {
      push: jest.fn(),
      replace: jest.fn(),
      prefetch: jest.fn(),
      back: jest.fn(),
      forward: jest.fn(),
      refresh: jest.fn(),
    };
  },
  useSearchParams() {
    return new URLSearchParams();
  },
  usePathname() {
    return '/';
  },
}));

// Mock environment variables
process.env.NEXT_PUBLIC_API_BASE_URL = 'http://localhost:3000';
// process.env.NEXT_PUBLIC_BASE_PATH = '';
process.env.NEXT_PUBLIC_OAUTH_SERVICE_URL = 'http://localhost:3001';

// Setup global mocks
global.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(), // deprecated
    removeListener: jest.fn(), // deprecated
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Mock @repo/ui components
jest.mock('@repo/ui', () => {
  const React = require('react');
  
  return {
    ...jest.requireActual('@repo/ui'),
    Button: ({ children, ...props }) => React.createElement('button', props, children),
    Input: (props) => React.createElement('input', props),
    Label: ({ children, ...props }) => React.createElement('label', props, children),
    Card: ({ children, ...props }) => React.createElement('div', { ...props, 'data-testid': 'card' }, children),
    CardHeader: ({ children, ...props }) => React.createElement('div', { ...props, 'data-testid': 'card-header' }, children),
    CardTitle: ({ children, ...props }) => React.createElement('div', { ...props, 'data-slot': 'card-title' }, children),
    CardDescription: ({ children, ...props }) => React.createElement('div', { ...props, 'data-slot': 'card-description' }, children),
    CardContent: ({ children, ...props }) => React.createElement('div', { ...props, 'data-slot': 'card-content' }, children),
    Skeleton: ({ className, ...props }) => React.createElement('div', { ...props, 'data-slot': 'skeleton', className: `bg-accent animate-pulse rounded-md ${className}` }),
    Alert: ({ children, ...props }) => React.createElement('div', { ...props, 'data-testid': 'alert', role: 'alert' }, children),
    AlertTitle: ({ children, ...props }) => React.createElement('h4', { ...props, 'data-testid': 'alert-title' }, children),
    AlertDescription: ({ children, ...props }) => React.createElement('div', { ...props, 'data-testid': 'alert-description' }, children),
    PermissionGuard: ({ children, requiredPermission, user, isLoading, fallback, loadingFallback }) => {
      if (isLoading) {
        return loadingFallback || React.createElement('div', {}, '正在验证权限...');
      }
      if (!user || !user.permissions || !user.permissions.includes(requiredPermission)) {
        return fallback || React.createElement('div', {}, '您没有权限访问仪表盘。');
      }
      return children;
    },
    toast: {
      success: jest.fn(),
      error: jest.fn(),
      info: jest.fn(),
      warning: jest.fn(),
    },
  };
});

// Mock DashboardShell component
jest.mock('@/components/layout/DashboardShell', () => {
  const React = require('react');
  return {
    DashboardShell: ({ children }) => React.createElement('div', { 'data-testid': 'dashboard-shell' }, children),
  };
});

// Mock localStorage
Object.defineProperty(window, 'localStorage', {
  value: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn(),
  },
  writable: true,
});

// Mock sessionStorage
Object.defineProperty(window, 'sessionStorage', {
  value: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn(),
  },
  writable: true,
});

// Note: window.location navigation errors are handled in individual test files

// Mock lucide-react at the global level
jest.mock('lucide-react', () => {
  const React = require('react');
  
  const createMockIcon = (name) => {
    const MockIcon = (props) => {
      return React.createElement('svg', {
        'data-testid': `${name.toLowerCase()}-icon`,
        'data-lucide': name.toLowerCase(),
        className: props.className,
        ...props
      }, name);
    };
    MockIcon.displayName = `Mock${name}`;
    return MockIcon;
  };

  const mockIcons = {
    AlertTriangle: createMockIcon('AlertTriangle'),
    Users: createMockIcon('Users'),
    AppWindow: createMockIcon('AppWindow'),
    ShieldCheck: createMockIcon('ShieldCheck'),
    KeyRound: createMockIcon('KeyRound'),
    Eye: createMockIcon('Eye'),
    EyeOff: createMockIcon('EyeOff'),
    Lock: createMockIcon('Lock'),
    User: createMockIcon('User'),
    Mail: createMockIcon('Mail'),
    Settings: createMockIcon('Settings'),
    LogOut: createMockIcon('LogOut'),
    Menu: createMockIcon('Menu'),
    X: createMockIcon('X'),
    ChevronDown: createMockIcon('ChevronDown'),
    ChevronUp: createMockIcon('ChevronUp'),
    ChevronLeft: createMockIcon('ChevronLeft'),
    ChevronRight: createMockIcon('ChevronRight'),
    Plus: createMockIcon('Plus'),
    Minus: createMockIcon('Minus'),
    Edit: createMockIcon('Edit'),
    Trash: createMockIcon('Trash'),
    Save: createMockIcon('Save'),
    Cancel: createMockIcon('Cancel'),
    Check: createMockIcon('Check'),
    Search: createMockIcon('Search'),
    Filter: createMockIcon('Filter'),
    Download: createMockIcon('Download'),
    Upload: createMockIcon('Upload'),
    Refresh: createMockIcon('Refresh'),
    Home: createMockIcon('Home'),
    Dashboard: createMockIcon('Dashboard'),
    BarChart: createMockIcon('BarChart'),
    PieChart: createMockIcon('PieChart'),
    TrendingUp: createMockIcon('TrendingUp'),
    TrendingDown: createMockIcon('TrendingDown'),
    Calendar: createMockIcon('Calendar'),
    Clock: createMockIcon('Clock'),
    Bell: createMockIcon('Bell'),
    Info: createMockIcon('Info'),
    Warning: createMockIcon('Warning'),
    Error: createMockIcon('Error'),
    Success: createMockIcon('Success'),
    Loading: createMockIcon('Loading'),
    Spinner: createMockIcon('Spinner'),
  };

  return new Proxy(mockIcons, {
    get: (target, prop) => {
      if (target[prop]) {
        return target[prop];
      }
      return createMockIcon(prop.toString());
    }
  });
});
