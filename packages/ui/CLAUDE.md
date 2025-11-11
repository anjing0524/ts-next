# @repo/ui - UI Component Library

## Overview

The `@repo/ui` package is a comprehensive React UI component library serving as the design system foundation for the entire monorepo. It provides reusable components, hooks, utilities, and styling configurations built on modern web technologies.

## Package Purpose

This package acts as the central UI layer for all applications in the monorepo, providing:
- **Consistent Design System**: Standardized components following shadcn/ui patterns
- **Shared Components**: Reusable React components for common UI patterns
- **Authentication UI**: Permission-based component guards
- **Data Display**: Advanced data table components with full CRUD capabilities
- **Styling Configuration**: Centralized Tailwind CSS setup

## Architecture

### Core Structure
```
@repo/ui/
├── src/
│   ├── components/          # Reusable UI components
│   │   ├── ui/             # shadcn/ui primitive components
│   │   ├── auth/           # Authentication-related components
│   │   ├── blocks/         # Page-level component blocks
│   │   ├── data-table/     # Advanced data table components
│   │   └── flow/           # (empty) Workflow/diagram components
│   ├── hooks/              # Custom React hooks
│   ├── lib/                # Utility functions
│   ├── types/              # TypeScript type definitions
│   └── styles.css          # Global styles
├── dist/                   # Build output
└── configuration files
```

## Key Features

### 1. Authentication Components
- **PermissionGuard**: Role-based access control component
  - Pure UI component decoupled from auth logic
  - Supports single or array of required permissions
  - Customizable loading and fallback states
  - Type-safe user interface with `GuardUser` type

### 2. Data Table System
- **DataTable**: Full-featured table with TanStack Table integration
  - Server-side pagination, sorting, and filtering
  - Row selection and bulk operations
  - Column visibility controls
  - Context menu support with copy/export actions
  - Responsive design with mobile optimizations

### 3. UI Component Library
Based on shadcn/ui with extensive Radix UI primitives:
- **Form Controls**: Input, Select, Checkbox, Radio, Textarea
- **Navigation**: Dropdown Menu, Context Menu, Dialog, Sheet
- **Display**: Card, Badge, Avatar, Alert, Skeleton
- **Feedback**: Toast notifications, Loading states
- **Layout**: Table, Tabs, Separator, Scroll Area

### 4. Dashboard Blocks
- **AppSidebar**: Collapsible navigation sidebar
- **SiteHeader**: Top navigation with user profile
- **UserNav**: User account dropdown menu
- **NavMain**: Main navigation with collapsible sections

## Usage

### Installation
```bash
# From monorepo root
pnpm install

# Package is available as @repo/ui
```

### Basic Usage

#### Import Components
```typescript
// Import individual components
import { Button, Card, Input } from '@repo/ui';

// Import specific categories
import { PermissionGuard } from '@repo/ui';
import { DataTable } from '@repo/ui';

// Import hooks and utilities
import { useAuth } from '@repo/ui/hooks';
import { cn } from '@repo/ui/lib/utils';
```

#### Permission Guard
```typescript
import { PermissionGuard } from '@repo/ui';

function AdminPanel() {
  const { user, isLoading } = useAuth(); // Your auth hook
  
  return (
    <PermissionGuard
      user={user}
      isLoading={isLoading}
      requiredPermission="admin:read"
      fallback={<div>Access Denied</div>}
    >
      <AdminContent />
    </PermissionGuard>
  );
}
```

#### Data Table
```typescript
import { DataTable } from '@repo/ui';

const columns = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'email', header: 'Email' },
];

function UserTable({ users }) {
  return (
    <DataTable
      columns={columns}
      data={users}
      pageCount={10}
      pagination={pagination}
      onPaginationChange={setPagination}
      sorting={sorting}
      onSortingChange={setSorting}
    />
  );
}
```

## Configuration

### Tailwind CSS Setup
The package provides its own Tailwind configuration that consuming apps can extend:

```javascript
// In your app's tailwind.config.ts
import uiConfig from '@repo/ui/tailwind.config';

export default {
  ...uiConfig,
  content: [
    './src/**/*.{ts,tsx}',
    './node_modules/@repo/ui/src/**/*.{ts,tsx}',
  ],
};
```

### Styling Integration
```css
/* In your app's global CSS */
@import '@repo/ui/styles.css';
```

## Development

### Package Scripts
```bash
# Lint the package
pnpm --filter=@repo/ui lint

# Format code
pnpm --filter=@repo/ui format
```

### Adding New Components
1. Create component in `src/components/ui/` for primitives
2. Create component in `src/components/` for business components
3. Export from `src/components.ts` or `src/index.ts`
4. Update this documentation if adding major features

### Component Guidelines
- Follow shadcn/ui patterns and conventions
- Use TypeScript for type safety
- Include proper JSDoc comments
- Support dark mode variants
- Ensure accessibility (ARIA attributes, keyboard navigation)
- Provide loading and error states

## Dependencies

### Runtime Dependencies
- **Radix UI**: Headless UI primitives (`@radix-ui/react-*`)
- **TanStack**: React Query for data fetching, React Table for tables
- **Lucide React**: Icon library
- **Tailwind CSS**: Utility-first CSS framework
- **Framer Motion**: Animation library (via dependencies)

### Key Libraries
- `@dnd-kit/*`: Drag and drop functionality
- `react-hook-form`: Form handling with Zod validation
- `cmdk`: Command palette interface
- `sonner`: Toast notifications
- `vaul`: Drawer component for mobile

## TypeScript Support

### Exported Types
```typescript
// User type for permission system
interface GuardUser {
  permissions?: string[];
}

// Data table props (generic)
interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  // ... additional props
}
```

### Path Mapping
The package supports multiple entry points:
- `@repo/ui` - Main exports (components, utilities)
- `@repo/ui/hooks` - Custom React hooks
- `@repo/ui/styles.css` - Global styles
- `@repo/ui/tailwind.config` - Tailwind configuration

## Browser Support
- Modern browsers (ES2020+)
- React 18+ / 19+
- Next.js 15+ (App Router)
- Mobile responsive design

## Performance Considerations
- Tree-shakeable exports
- Code splitting friendly
- Optimized bundle size through selective imports
- Server-side rendering compatible
- Progressive enhancement

## Security Notes
- Components are pure UI without business logic
- Authentication state must be provided by consuming apps
- No direct API calls or data fetching
- Safe for server-side rendering