# Pingora Proxy - Rust Reverse Proxy Service

## Overview

Pingora Proxy is a high-performance reverse proxy service built on [Cloudflare's Pingora framework](https://github.com/cloudflare/pingora). This Rust-based proxy provides load balancing, health checks, and routing capabilities for the entire application stack.

## Architecture

### Core Components

```
┌─────────────────────────────────────────────────────────────┐
│                    Pingora Proxy Service                    │
│                    (Port 6188/6189)                        │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌───────────────────────┐ │
│  │   Config    │  │   Proxy     │  │   Health Check        │ │
│  │   Loader    │  │   Service   │  │   Manager             │ │
│  └─────────────┘  └─────────────┘  └───────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌───────────────────────┐ │
│  │  Load       │  │  Routing    │  │  TLS/SSL              │ │
│  │  Balancer   │  │  Engine     │  │  Handler              │ │
│  └─────────────┘  └─────────────┘  └───────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
├── src/
│   ├── main.rs              # Application entry point
│   ├── lib.rs               # Library exports
│   ├── config/              # Configuration management
│   │   └── mod.rs           # Settings and YAML config loader
│   └── proxy/               # Core proxy logic
│       ├── mod.rs           # Proxy service implementation
│       ├── context/         # Request context management
│       ├── router/          # Routing logic
│       └── load_balancer/   # Load balancing strategies
├── config/
│   └── default.yaml         # Default configuration file
├── docs/
│   └── tasks/               # Development task documentation
├── examples/                # Usage examples
├── scripts/                 # Build and deployment scripts
├── Cargo.toml              # Dependencies and metadata
└── README.md               # Basic setup instructions
```

## Service Configuration

### Configuration Format (YAML)

```yaml
services:
  - name: 'admin-portal'
    bind_address: '0.0.0.0:6188'
    upstreams:
      - '127.0.0.1:3002'
    tls: false
    health_check:
      timeout_ms: 500
      frequency_secs: 5
  - name: 'oauth-service'
    bind_address: '0.0.0.0:6189'
    upstreams:
      - '127.0.0.1:3001'
    tls: false
```

### Configuration Schema

| Field | Type | Description | Default |
|-------|------|-------------|---------|
| `services` | array | List of proxy service configurations | - |
| `name` | string | Service identifier for logging | - |
| `bind_address` | string | Address to bind the service | - |
| `upstreams` | array | List of backend server addresses | - |
| `tls` | boolean | Enable TLS/SSL | false |
| `health_check.timeout_ms` | number | Health check timeout in milliseconds | 500 |
| `health_check.frequency_secs` | number | Health check frequency in seconds | 5 |

## Development Commands

### Build Commands

```bash
# Development build
cargo build

# Production build with optimizations
cargo build --release

# Run with default configuration
cargo run

# Run with custom configuration
cargo run -- --config config/production.yaml

# Run as daemon
cargo run -- --daemon
```

### Development Workflow

```bash
# 1. Install Rust (if not already installed)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# 2. Clone the repository
git clone <repository-url>
cd apps/pingora-proxy

# 3. Build the project
cargo build

# 4. Run tests
cargo test

# 5. Run with development configuration
cargo run -- --config config/development.yaml
```

### Testing Commands

```bash
# Run all tests
cargo test

# Run tests with output
cargo test -- --nocapture

# Run specific test module
cargo test config_tests

# Run integration tests
cargo test --test integration
```

### Performance Testing

```bash
# Build optimized version
cargo build --release

# Run with performance monitoring
RUST_LOG=info cargo run --release

# Profile with perf tools
perf record ./target/release/pingora-proxy
perf report
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `RUST_LOG` | Logging level (trace, debug, info, warn, error) | `info` |
| `RUST_BACKTRACE` | Enable full backtrace on panic | `1` |
| `CONFIG_PATH` | Path to configuration file | `config/default.yaml` |
| `WORKER_THREADS` | Number of worker threads | Auto-detected |

## Key Files and Their Purposes

### Core Files

- **`src/main.rs`**: Application entry point, CLI argument parsing, service initialization
- **`src/lib.rs`**: Library exports and module declarations
- **`src/config/mod.rs`**: Configuration loading, validation, and access patterns
- **`src/proxy/mod.rs`**: Core proxy service implementation with Pingora integration

### Configuration Files

- **`config/default.yaml`**: Default service configuration for local development
- **`config/production.yaml`**: Production environment configuration
- **`config/development.yaml`**: Development environment configuration

### Architecture Patterns

#### 1. **Service Configuration Pattern**
```rust
// src/config/mod.rs
pub struct Settings {
    pub services: Vec<ServiceConfig>,
}

impl Settings {
    pub fn from_file(path: &str) -> Result<Self, anyhow::Error>;
    pub fn validate(&self) -> Result<(), anyhow::Error>;
}
```

#### 2. **Proxy Service Pattern**
```rust
// src/proxy/mod.rs
pub struct ProxyService {
    pub service_name: Arc<str>,
    pub upstreams: Arc<LoadBalancer<RoundRobin>>,
    pub use_tls: bool,
}

#[async_trait]
impl ProxyHttp for ProxyService {
    async fn upstream_peer(&self, session: &mut Session, _ctx: &mut Self::CTX) -> Result<Box<HttpPeer>>;
}
```

#### 3. **Load Balancing Strategy**
- **Algorithm**: Round-robin with health checks
- **Health Check**: TCP-based connectivity testing
- **Failover**: Automatic removal of unhealthy backends
- **Recovery**: Automatic reintegration of recovered backends

## Routing and Proxy Logic

### Request Flow

1. **Incoming Request** → Proxy Service
2. **Load Balancer** → Selects healthy upstream
3. **Health Check** → Validates backend availability
4. **Request Forwarding** → Proxies to selected backend
5. **Response Handling** → Returns response to client

### Load Balancing Details

```rust
// Health check configuration
let mut health_check = TcpHealthCheck::new();
health_check.peer_template.options.connection_timeout = 
    Some(Duration::from_millis(timeout_ms));

// Round-robin load balancing
let mut lb = LoadBalancer::<RoundRobin>::try_from_iter(&upstreams)?;
lb.set_health_check(health_check);
lb.health_check_frequency = Some(Duration::from_secs(frequency_secs));
```

## Authentication Integration

### Current State
- **Authentication**: Handled by upstream services (oauth-service, admin-portal)
- **Token Forwarding**: Preserves Authorization headers
- **Session Management**: Delegated to backend services

### Future Enhancements
- JWT token validation at proxy level
- Rate limiting per user/session
- Request signing for backend verification

## Testing Setup

### Test Structure

```
tests/
├── unit/                    # Unit tests
├── integration/             # Integration tests
├── fixtures/               # Test data and configurations
└── benchmarks/             # Performance benchmarks
```

### Test Categories

1. **Unit Tests**: Individual component testing
2. **Integration Tests**: End-to-end service testing
3. **Performance Tests**: Load testing and benchmarking
4. **Configuration Tests**: Config validation and parsing

### Test Commands

```bash
# Run all tests
cargo test

# Run specific test category
cargo test --test integration

# Run with coverage
cargo tarpaulin --out Html

# Benchmark performance
cargo bench
```

## Best Practices and Patterns

### 1. **Configuration Management**
- **YAML First**: All service configuration in YAML files
- **Environment Variables**: Override configuration values
- **Validation**: Runtime configuration validation
- **Hot Reload**: Future support for configuration changes without restart

### 2. **Error Handling**
- **Structured Logging**: Using `tracing` crate for structured logs
- **Graceful Degradation**: Service continues with partial upstream failures
- **Circuit Breaker**: Automatic backend isolation on repeated failures
- **Detailed Metrics**: Health check statistics and request metrics

### 3. **Performance Optimization**
- **Async/Await**: Fully asynchronous request handling
- **Connection Pooling**: Reuse backend connections
- **Zero-Copy**: Efficient data transfer between proxy and backends
- **Resource Limits**: Configurable worker threads and connection limits

### 4. **Security Considerations**
- **TLS Support**: Configurable TLS termination
- **Header Sanitization**: Remove sensitive headers before forwarding
- **Rate Limiting**: Basic rate limiting capabilities
- **Access Control**: IP-based access restrictions

### 5. **Monitoring and Observability**
- **Structured Logging**: JSON-formatted logs with request context
- **Health Endpoints**: Dedicated health check endpoints
- **Metrics**: Request latency, error rates, upstream health
- **Tracing**: Distributed tracing support

## Deployment Guide

### Docker Deployment

```dockerfile
FROM rust:1.75 as builder
WORKDIR /app
COPY Cargo.toml Cargo.lock ./
COPY src ./src
COPY config ./config
RUN cargo build --release

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/pingora-proxy /usr/local/bin/
COPY --from=builder /app/config/default.yaml /etc/pingora-proxy/config.yaml
EXPOSE 6188 6189
CMD ["pingora-proxy", "--config", "/etc/pingora-proxy/config.yaml"]
```

### Systemd Service

```ini
[Unit]
Description=Pingora Proxy Service
After=network.target

[Service]
Type=simple
User=pingora
Group=pingora
WorkingDirectory=/opt/pingora-proxy
ExecStart=/opt/pingora-proxy/pingora-proxy --config /etc/pingora-proxy/config.yaml
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

### Nginx Integration

```nginx
upstream pingora_proxy {
    server 127.0.0.1:6188;
    server 127.0.0.1:6189 backup;
}

server {
    listen 80;
    server_name your-domain.com;
    
    location / {
        proxy_pass http://pingora_proxy;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

## Troubleshooting

### Common Issues

1. **Port Binding Errors**
   - Check if ports 6188/6189 are already in use
   - Verify firewall rules allow the bind addresses

2. **Upstream Connection Issues**
   - Verify backend services are running
   - Check network connectivity to upstream servers
   - Review health check logs for failure details

3. **Configuration Errors**
   - Validate YAML syntax: `cargo run -- --config config/test.yaml`
   - Check upstream addresses are reachable
   - Ensure all required fields are present

### Debug Commands

```bash
# Verbose logging
RUST_LOG=debug cargo run

# Configuration validation
./target/release/pingora-proxy --config config/test.yaml --validate

# Health check testing
curl -v http://localhost:6188/health

# Load testing
wrk -t12 -c400 -d30s http://localhost:6188
```

## Development Roadmap

### Phase 1: Core Features ✅
- [x] Basic reverse proxy functionality
- [x] Round-robin load balancing
- [x] TCP health checks
- [x] YAML configuration
- [x] Logging and metrics

### Phase 2: Advanced Features 🚧
- [ ] Configuration hot-reload (Task T001)
- [ ] JWT token validation
- [ ] Rate limiting
- [ ] Circuit breaker pattern
- [ ] WebSocket proxy support

### Phase 3: Enterprise Features 📋
- [ ] TLS termination
- [ ] Advanced load balancing algorithms
- [ ] Request/response modification
- [ ] Distributed configuration
- [ ] Prometheus metrics
- [ ] Distributed tracing

## Contributing

### Development Setup

1. **Install Rust tools**
   ```bash
   rustup component add rustfmt clippy
   cargo install cargo-watch
   ```

2. **Code formatting**
   ```bash
   cargo fmt --all
   cargo clippy --all-targets --all-features
   ```

3. **Development server with auto-reload**
   ```bash
   cargo watch -x 'run -- --config config/development.yaml'
   ```

### Code Style

- **Rust Style**: Follow official Rust style guidelines
- **Error Handling**: Use `anyhow::Result` for application errors
- **Logging**: Use `tracing` crate with structured logging
- **Testing**: Write tests for all new functionality
- **Documentation**: Document all public APIs and complex logic

### Pull Request Process

1. Fork the repository
2. Create feature branch: `git checkout -b feature/new-feature`
3. Write tests for new functionality
4. Ensure all tests pass: `cargo test`
5. Run linting: `cargo clippy`
6. Format code: `cargo fmt`
7. Submit pull request with detailed description

## Resources and Links

- **Pingora Documentation**: https://docs.rs/pingora/latest/pingora/
- **Rust Book**: https://doc.rust-lang.org/book/
- **Async Rust**: https://rust-lang.github.io/async-book/
- **Performance Best Practices**: https://pingora.dev/book/
- **Community**: https://github.com/cloudflare/pingora/discussions

## License

This project is licensed under the MIT License - see the LICENSE file for details.