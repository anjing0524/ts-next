# Test Service Documentation

## Service Overview

The **test-service** is a Next.js-based testing and development service designed for testing shared utilities, database operations, and backend services. It serves as a sandbox environment for:

- Testing shared packages (`@repo/lib`, `@repo/database`, `@repo/ui`)
- Database integration and MySQL operations
- Time wheel scheduling system testing
- Server-Sent Events (SSE) implementation
- Health monitoring and diagnostics
- Logging and error handling utilities

**Port**: 3005

## Architecture Overview

```
test-service/
├── app/
│   ├── api/
│   │   ├── health/          # Health check endpoint
│   │   ├── sse/            # Server-Sent Events endpoint
│   │   └── test/           # Testing utilities endpoint
│   ├── layout.tsx          # Root layout component
│   └── globals.css         # Global styles
├── lib/
│   ├── api/
│   │   └── errorHandler.ts # API error handling
│   ├── instance/
│   │   ├── mysql-client.ts # MySQL client utilities
│   │   └── time-wheel.ts   # Time wheel singleton
│   ├── utils/
│   │   └── logger.ts       # Logging utilities
│   └── prisma.ts          # Prisma client
├── logs/                   # Application logs
├── coverage/              # Test coverage reports
└── package.json           # Dependencies and scripts
```

## API Endpoints

### Health Check
- **GET** `/api/health`
- **Purpose**: Service health monitoring
- **Features**:
  - Database connection health check
  - Service status verification
  - Error logging integration
- **Response**: `{ "status": "ok", "message": "Service is healthy" }`

### Server-Sent Events
- **GET** `/api/sse`
- **Purpose**: Real-time server-to-client communication
- **Features**:
  - Continuous time updates every 2 seconds
  - Proper SSE headers and formatting
  - Error handling and connection management
- **Usage**: Connect via `EventSource('/api/sse')`

### Test Utilities
- **GET** `/api/test`
- **Purpose**: Time wheel and scheduling testing
- **Features**:
  - Time wheel initialization
  - Scheduled task execution
  - Console logging for debugging
- **Response**: `{ "success": true, "message": "Time wheel started" }`

## Database Integration

### Prisma Client
- **Source**: `@repo/database` shared package
- **Usage**: Reused across all services for consistency
- **Features**:
  - Connection pooling
  - Type-safe database operations
  - Migration support

### MySQL Client
- **Purpose**: Direct MySQL operations and testing
- **Features**:
  - Connection health monitoring
  - Pool management utilities
  - Error handling integration

## Development Commands

### Basic Commands
```bash
# Development server
pnpm dev                    # Start test service on port 3005

# Build commands
pnpm build                 # Build for production
pnpm start                 # Start production server

# Database operations
pnpm db:generate          # Generate Prisma client
pnpm db:push              # Push schema changes
pnpm db:seed              # Seed database with test data
pnpm db:studio            # Open Prisma Studio
```

### Testing Commands
```bash
pnpm test                 # Run unit tests
pnpm test:watch          # Run tests in watch mode
pnpm coverage            # Generate coverage reports
pnpm e2e                 # Run end-to-end tests
```

### Shared Package Usage
```bash
# Install/update shared packages
pnpm install @repo/lib   # Shared utilities and time wheel
pnpm install @repo/database # Database client and utilities
pnpm install @repo/ui    # UI components and styles
```

## Environment Variables

### Required Variables
```bash
# Database connection
DATABASE_URL="file:./dev.db"           # SQLite for development
# DATABASE_URL="mysql://user:pass@localhost:3306/test"  # MySQL for production

# Redis (for caching and sessions)
REDIS_URL="redis://localhost:6379"

# JWT configuration
JWT_PRIVATE_KEY_PATH="./test-private.pem"
JWT_PUBLIC_KEY_PATH="./test-public.pem"
```

### Optional Variables
```bash
# Logging configuration
LOG_LEVEL="debug"
LOG_DIR="./logs"

# Server configuration
PORT=3005
NODE_ENV="development"
```

## Key Files and Their Purposes

### Core Configuration
- **`next.config.js`**: Next.js configuration with standalone output and package optimization
- **`tsconfig.json`**: TypeScript configuration extending shared config
- **`jest.config.js`**: Jest testing configuration using shared base config
- **`eslint.config.mjs`**: ESLint configuration using shared rules

### API Routes
- **`app/api/health/route.ts`**: Health check endpoint with database connectivity verification
- **`app/api/sse/route.ts`**: Server-Sent Events implementation for real-time updates
- **`app/api/test/route.ts`**: Time wheel testing endpoint with scheduled tasks

### Shared Utilities
- **`lib/prisma.ts`**: Prisma client instance from shared database package
- **`lib/instance/mysql-client.ts`**: MySQL client utilities and health checks
- **`lib/instance/time-wheel.ts`**: Time wheel singleton instance from shared lib
- **`lib/utils/logger.ts`**: Winston logger instance from shared lib
- **`lib/api/errorHandler.ts`**: API error handling utilities from shared lib

## Testing Features

### Unit Testing
- **Framework**: Jest with TypeScript support
- **Coverage**: Comprehensive coverage reports in `/coverage`
- **Mocking**: Full support for mocking external dependencies
- **Shared configs**: Uses `@repo/jest-config` for consistent testing

### Integration Testing
- **Database testing**: Full database integration with test data
- **API testing**: Endpoint testing with real HTTP requests
- **Shared utilities**: Testing shared packages in isolation

### Performance Testing
- **Time wheel testing**: Scheduling and timing accuracy
- **Database performance**: Connection pooling and query optimization
- **Memory usage**: Monitoring memory leaks and optimization

## Logging and Monitoring

### Winston Logger
- **Source**: `@repo/lib/node`
- **Features**:
  - Daily rotating logs
  - Multiple log levels (error, warn, info, debug)
  - Structured JSON logging
  - File and console output

### Log Files
- **Location**: `/logs/2025-07-*.log`
- **Rotation**: Daily rotation with automatic cleanup
- **Retention**: 30 days of logs

## Time Wheel System

### Implementation
- **Source**: `@repo/lib/node`
- **Features**:
  - Precise scheduling with 250ms intervals
  - Repeating and one-time tasks
  - Memory-efficient task management
  - Console logging for debugging

### Usage Example
```typescript
import { getTimeWheelInstance } from '@repo/lib/node';

const timeWheel = getTimeWheelInstance();
timeWheel.addTask({
  delay: 1000,
  repeat: true,
  callback: () => console.log('Task executed')
});
```

## Best Practices and Patterns

### Code Organization
- **Modular structure**: Clear separation of concerns
- **Shared utilities**: Leverage `@repo/lib` for common functionality
- **Type safety**: Full TypeScript support throughout
- **Error handling**: Centralized error handling via shared utilities

### Development Workflow
1. **Setup**: Install dependencies and initialize database
2. **Development**: Use `pnpm dev` for hot reload
3. **Testing**: Run tests continuously with `pnpm test:watch`
4. **Building**: Use `pnpm build` for production builds
5. **Deployment**: Standalone builds for easy deployment

### Performance Optimization
- **Package optimization**: `optimizePackageImports` in next.config.js
- **Tree shaking**: Automatic dead code elimination
- **Code splitting**: Automatic route-based splitting
- **Caching**: Built-in caching for static assets

### Security Considerations
- **Input validation**: All API endpoints validate input
- **CORS**: Proper CORS configuration for SSE endpoints
- **Error exposure**: Safe error messages in production
- **Database security**: Parameterized queries via Prisma

## Troubleshooting

### Common Issues
1. **Database connection errors**: Check DATABASE_URL and MySQL service
2. **Port conflicts**: Ensure port 3005 is available
3. **Missing dependencies**: Run `pnpm install` in root directory
4. **Build failures**: Check TypeScript and ESLint configurations

### Debug Mode
```bash
# Enable debug logging
LOG_LEVEL=debug pnpm dev

# Database debugging
pnpm db:studio
```

### Performance Issues
- **Memory leaks**: Monitor logs for memory usage
- **Slow queries**: Use Prisma's query logging
- **High CPU**: Check time wheel task frequency

## Integration with Other Services

### OAuth Service (Port 3001)
- **Purpose**: Authentication and authorization
- **Integration**: JWT token validation
- **Testing**: User authentication flows

### Admin Portal (Port 3002)
- **Purpose**: Administration interface
- **Integration**: Shared database and utilities
- **Testing**: Admin functionality testing

### Kline Service (Port 3003)
- **Purpose**: Financial chart rendering
- **Integration**: Shared utilities and database
- **Testing**: Chart data processing

### Pingora Proxy (Port 6188)
- **Purpose**: Load balancing and routing
- **Integration**: Reverse proxy for all services
- **Testing**: Load testing and routing verification