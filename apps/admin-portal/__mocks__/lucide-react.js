// Mock for lucide-react icons
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

// Mock dynamicIconImports
const mockDynamicIconImports = {};

const mockExports = new Proxy(mockIcons, {
  get: (target, prop) => {
    if (target[prop]) {
      return target[prop];
    }
    return createMockIcon(prop.toString());
  }
});

// Export both named exports and default export for dynamicIconImports
mockExports.default = mockDynamicIconImports;

module.exports = mockExports;