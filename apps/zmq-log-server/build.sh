#!/bin/bash

# ZMQ Log Server Build Script
# This script builds the Rust server and Node.js bindings

set -e

echo "🚀 Building ZMQ Log Server..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if required tools are installed
check_requirements() {
    print_status "Checking requirements..."
    
    if ! command -v cargo &> /dev/null; then
        print_error "Cargo is not installed. Please install Rust first."
        exit 1
    fi
    
    if ! command -v node &> /dev/null; then
        print_warning "Node.js is not installed. Skipping Node.js bindings build."
        return 1
    fi
    
    if ! command -v npm &> /dev/null; then
        print_warning "npm is not installed. Skipping Node.js bindings build."
        return 1
    fi
    
    return 0
}

# Build Rust server
build_rust_server() {
    print_status "Building Rust server..."
    
    # Build in release mode
    cargo build --release
    
    if [ $? -eq 0 ]; then
        print_status "Rust server built successfully!"
        print_status "Binary location: target/release/zmq-log-server"
    else
        print_error "Failed to build Rust server"
        exit 1
    fi
}

# Build Node.js bindings
build_node_bindings() {
    print_status "Building Node.js bindings..."
    
    # Check if bindings directory exists
    if [ ! -d "bindings" ]; then
        print_warning "Bindings directory not found. Creating basic structure..."
        mkdir -p bindings/src
        mkdir -p bindings/examples
        mkdir -p bindings/scripts
    fi
    
    # Build Node.js bindings
    cd bindings
    
    # Initialize package.json if it doesn't exist
    if [ ! -f "package.json" ]; then
        print_status "Initializing Node.js package..."
        npm init -y
        
        # Add necessary dependencies
        npm install --save-dev @types/node typescript ts-node
        npm install --save napi-rs
        
        # Add build scripts
        cat > package.json << 'EOF'
{
  "name": "zmq-log-server-bindings",
  "version": "0.1.0",
  "description": "Node.js bindings for ZMQ Log Server",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "jest",
    "example": "ts-node examples/example.ts"
  },
  "keywords": ["zmq", "logging", "rust", "nodejs"],
  "author": "ZMQ Log Server Team",
  "license": "MIT",
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.0.0",
    "ts-node": "^10.9.0",
    "jest": "^29.0.0",
    "@types/jest": "^29.0.0"
  },
  "dependencies": {
    "napi-rs": "^2.16.0"
  }
}
EOF
    fi
    
    # Create TypeScript config if it doesn't exist
    if [ ! -f "tsconfig.json" ]; then
        cat > tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
EOF
    fi
    
    # Create basic TypeScript interface
    mkdir -p src
    cat > src/index.ts << 'EOF'
/**
 * ZMQ Log Server Node.js Bindings
 * 
 * This module provides TypeScript interfaces and bindings for the ZMQ Log Server.
 */

export interface LogEntry {
  id: string;
  timestamp: Date;
  level: LogLevel;
  message: string;
  source: string;
  tags: string[];
  fields: Record<string, any>;
  thread_id?: number;
  process_id?: number;
  hostname?: string;
  service?: string;
  version?: string;
  environment?: string;
  stack_trace?: string;
  user_id?: string;
  session_id?: string;
  request_id?: string;
  trace_id?: string;
  parent_trace_id?: string;
  metadata: Record<string, any>;
}

export enum LogLevel {
  Error = 0,
  Warn = 1,
  Info = 2,
  Debug = 3,
  Trace = 4
}

export interface LogConfig {
  log_level: string;
  zmq: ZmqConfig;
  storage: StorageConfig;
  http: HttpConfig;
  processor: ProcessorConfig;
  metrics: MetricsConfig;
}

export interface ZmqConfig {
  bind_address: string;
  port: number;
  socket_type: string;
  io_threads: number;
  high_watermark: number;
  recv_timeout: number;
  enable_heartbeat: boolean;
  heartbeat_interval: number;
}

export interface StorageConfig {
  log_dir: string;
  max_file_size: number;
  max_files: number;
  enable_compression: boolean;
  compression_algorithm: string;
  enable_rotation: boolean;
  rotation_strategy: string;
  write_buffer_size: number;
  flush_interval: number;
}

export interface HttpConfig {
  bind_address: string;
  port: number;
  enable_https: boolean;
  max_request_size: number;
  request_timeout: number;
  enable_cors: boolean;
  cors_origins: string[];
  enable_metrics: boolean;
  enable_health_check: boolean;
}

export interface ProcessorConfig {
  enable_batch: boolean;
  batch_size: number;
  batch_timeout: number;
  enable_filter: boolean;
  enable_transform: boolean;
  enable_validation: boolean;
  enable_sampling: boolean;
  sample_rate: number;
  worker_threads: number;
  queue_size: number;
}

export interface MetricsConfig {
  enable_metrics: boolean;
  collection_interval: number;
  enable_prometheus: boolean;
  prometheus_bind_address: string;
  prometheus_port: number;
  enable_system_metrics: boolean;
  enable_app_metrics: boolean;
  retention_period: number;
}

/**
 * ZMQ Log Server Client
 */
export class ZmqLogClient {
  private serverAddress: string;
  private serviceName: string;
  
  constructor(serverAddress: string, serviceName: string = 'default-service') {
    this.serverAddress = serverAddress;
    this.serviceName = serviceName;
  }
  
  /**
   * Send a log entry to the server
   */
  async sendLog(entry: LogEntry): Promise<void> {
    // This would connect to the Rust server via ZMQ
    // For now, it's a placeholder implementation
    console.log('Sending log:', entry);
  }
  
  /**
   * Create and send a log entry with level and message
   */
  async log(level: LogLevel, message: string, fields?: Record<string, any>): Promise<void> {
    const entry: LogEntry = {
      id: this.generateId(),
      timestamp: new Date(),
      level,
      message,
      source: this.serviceName,
      tags: [],
      fields: fields || {},
      metadata: {}
    };
    
    await this.sendLog(entry);
  }
  
  /**
   * Send an info log
   */
  async info(message: string, fields?: Record<string, any>): Promise<void> {
    await this.log(LogLevel.Info, message, fields);
  }
  
  /**
   * Send a warning log
   */
  async warn(message: string, fields?: Record<string, any>): Promise<void> {
    await this.log(LogLevel.Warn, message, fields);
  }
  
  /**
   * Send an error log
   */
  async error(message: string, fields?: Record<string, any>): Promise<void> {
    await this.log(LogLevel.Error, message, fields);
  }
  
  /**
   * Send a debug log
   */
  async debug(message: string, fields?: Record<string, any>): Promise<void> {
    await this.log(LogLevel.Debug, message, fields);
  }
  
  private generateId(): string {
    return Math.random().toString(36).substr(2, 9);
  }
}

// Export convenience functions
export function createLogger(serverAddress: string, serviceName?: string): ZmqLogClient {
  return new ZmqLogClient(serverAddress, serviceName);
}

// Default logger instance
export const logger = createLogger('tcp://localhost:5555', 'default-service');
EOF
    fi
    
    # Build TypeScript
    npm run build
    
    if [ $? -eq 0 ]; then
        print_status "Node.js bindings built successfully!"
    else
        print_error "Failed to build Node.js bindings"
        cd ..
        return 1
    fi
    
    cd ..
    return 0
}

# Run tests
run_tests() {
    print_status "Running tests..."
    
    # Run Rust tests
    cargo test
    
    if [ $? -eq 0 ]; then
        print_status "Rust tests passed!"
    else
        print_error "Rust tests failed"
        return 1
    fi
    
    # Run Node.js tests if bindings exist
    if [ -d "bindings" ] && [ -f "bindings/package.json" ]; then
        cd bindings
        npm test
        if [ $? -eq 0 ]; then
            print_status "Node.js tests passed!"
        else
            print_error "Node.js tests failed"
            cd ..
            return 1
        fi
        cd ..
    fi
    
    return 0
}

# Create example usage
create_example() {
    print_status "Creating example usage..."
    
    mkdir -p examples
    
    # Create Node.js example
    cat > examples/nodejs-example.js << 'EOF'
/**
 * ZMQ Log Server Node.js Example
 * 
 * This example demonstrates how to use the ZMQ Log Server from Node.js.
 */

const { createLogger, LogLevel } = require('./bindings/dist/index.js');

async function main() {
    console.log('🚀 ZMQ Log Server Node.js Example');
    
    // Create a logger instance
    const logger = createLogger('tcp://localhost:5555', 'my-app');
    
    try {
        // Log different levels
        await logger.info('Application started', { version: '1.0.0' });
        await logger.debug('Debug information', { debug: true });
        await logger.warn('Warning message', { warning: 'low disk space' });
        await logger.error('Error occurred', { error: 'connection failed', code: 500 });
        
        // Log with custom fields
        await logger.info('User login', {
            user_id: '12345',
            username: 'john_doe',
            ip_address: '192.168.1.100'
        });
        
        console.log('✅ All logs sent successfully!');
        
    } catch (error) {
        console.error('❌ Failed to send logs:', error.message);
    }
}

main().catch(console.error);
EOF

    # Create Rust example
    cat > examples/rust-example.rs << 'EOF'
/**
 * ZMQ Log Server Rust Example
 * 
 * This example demonstrates how to use the ZMQ Log Server from Rust.
 */

use zmq_log_server::*;
use std::time::Duration;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    println!("🚀 ZMQ Log Server Rust Example");
    
    // Create a ZMQ client
    let client = ZmqClient::new("tcp://localhost:5555".to_string()).await?;
    
    // Create and send log entries
    let info_entry = LogEntry::info("Application started".to_string())
        .with_field("version".to_string(), "1.0.0".into())
        .with_service("my-app".to_string());
    
    client.send_log_entry(info_entry).await?;
    
    let debug_entry = LogEntry::debug("Debug information".to_string())
        .with_field("debug".to_string(), true.into())
        .with_service("my-app".to_string());
    
    client.send_log_entry(debug_entry).await?;
    
    let error_entry = LogEntry::error("Connection failed".to_string())
        .with_field("code".to_string(), 500.into())
        .with_field("retry_count".to_string(), 3.into())
        .with_service("my-app".to_string());
    
    client.send_log_entry(error_entry).await?;
    
    println!("✅ All logs sent successfully!");
    
    // Wait for messages to be sent
    tokio::time::sleep(Duration::from_secs(1)).await;
    
    Ok(())
}
EOF
    
    print_status "Example files created in examples/ directory"
}

# Main build process
main() {
    print_status "Starting build process..."
    
    # Check requirements
    HAS_NODEJS=0
    check_requirements || HAS_NODEJS=$?
    
    # Build Rust server
    build_rust_server
    
    # Build Node.js bindings if Node.js is available
    if [ $HAS_NODEJS -eq 0 ]; then
        build_node_bindings
    fi
    
    # Run tests
    run_tests
    
    # Create examples
    create_example
    
    print_status "🎉 Build completed successfully!"
    print_status ""
    print_status "Next steps:"
    print_status "1. Start the server: ./target/release/zmq-log-server"
    print_status "2. Run examples: node examples/nodejs-example.js"
    print_status "3. Check logs: ls -la logs/"
    print_status ""
    print_status "Server configuration: config/config.toml"
    print_status "Server will listen on: tcp://0.0.0.0:5555"
    print_status "HTTP API available at: http://localhost:3005"
}

# Run main function
main "$@"