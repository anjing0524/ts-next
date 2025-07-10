# Pingora Proxy - Simplified Reverse Proxy

A lightweight, high-performance reverse proxy built on the [Pingora](https://github.com/cloudflare/pingora) framework. This project serves as a basic example of how to set up a simple reverse proxy with load balancing and health checks.

## 🚀 Core Features

- **High-Performance**: Inherits the performance and efficiency of the Rust-based Pingora framework.
- **Asynchronous**: Built on `tokio` for non-blocking I/O.
- **Load Balancing**: Simple round-robin load balancing across multiple upstream servers.
- **Health Checks**: Active TCP-based health checks to ensure traffic is only sent to healthy servers.
- **Configurable**: Easy to configure via a `yaml` file.

## 📊 Architecture Overview

This proxy is a single service that listens for incoming HTTP requests and forwards them to a pool of upstream servers.

```
┌────────────────────────────────┐
│        Incoming HTTP           │
└────────────────────────────────┘
               │
               ▼
┌────────────────────────────────┐
│      Pingora Proxy Service     │
│ (Listening on 0.0.0.0:6188)    │
└────────────────────────────────┘
               │
               ▼
┌────────────────────────────────┐
│  Load Balancer (Round Robin)   │
│       w/ Health Checks         │
└────────────────────────────────┘
               │
     ┌─────────┴─────────┐
     ▼                   ▼
┌──────────┐      ┌──────────┐
│ Upstream 1 │ ...  │ Upstream N │
└──────────┘      └──────────┘
```

## 🚀 Quick Start

### System Requirements
- **Rust**: 2021 edition or later
- **OS**: Linux, macOS, or Windows

### Build and Run

1.  **Clone the repository**
    ```bash
    # Clone the project
    git clone <repository-url>
    cd ts-next-template/apps/pingora-proxy
    ```

2.  **Configure the proxy**

    Modify `config/default.yaml` to define your server and upstream backends:

    ```yaml
    server:
      bind_address: "0.0.0.0:6188"
      worker_threads: 4

    upstreams:
      - name: "backend"
        addrs:
          - "127.0.0.1:3001"
          - "127.0.0.1:3002"
    ```

3.  **Build the application**
    ```bash
    cargo build --release
    ```

4.  **Run the proxy**
    ```bash
    ./target/release/pingora-proxy
    ```
    You can also run it as a daemon:
    ```bash
    ./target/release/pingora-proxy --daemon
    ```

## 🔧 Development

### Project Structure
```
apps/pingora-proxy/
├── src/
│   ├── main.rs              # Application entrypoint
│   ├── config.rs            # Configuration loading
│   └── proxy.rs             # Core proxy logic
├── config/
│   └── default.yaml         # Default configuration
└── Cargo.toml               # Project dependencies
```

### Running Tests
```bash
cargo test
```

## 📄 License

This project is licensed under the MIT License.