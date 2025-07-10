# Pingora Proxy 设计文档 (简化版)

## 1. 概述

本文档描述了 `pingora-proxy` 服务的设计。这是一个基于 Cloudflare Pingora 框架构建的轻量级、高性能的反向代理。此版本经过大幅简化，旨在提供一个清晰、基础的代理实现。

### 1.1. 目标

-   **高性能**: 继承 Pingora 框架的低延迟和高吞吐量特性。
-   **简单性**: 提供一个易于理解和维护的基础反向代理。
-   **可靠性**: 利用 Pingora 内置的负载均衡和健康检查功能来确保服务的可用性。

### 1.2. 非目标

-   成为一个功能齐全的 API 网关。
-   实现复杂的路由逻辑、认证或自定义指标收集。
-   支持除简单轮询负载均衡之外的复杂策略。

## 2. 架构

`pingora-proxy` 采用极简设计，核心组件如下：

-   **主程序 (`main.rs`)**: 初始化服务器、加载配置、设置并运行一个代理服务。
-   **配置 (`config/mod.rs`)**: 从一个简单的 YAML 文件加载服务器绑定地址和上游服务器列表。
-   **代理 (`proxy/mod.rs`)**: 实现一个基本的代理逻辑，使用轮询（Round Robin）策略将所有传入的 HTTP 请求转发到一个预定义的上游服务池。

```mermaid
graph TD
    A[Client] --> B(Pingora Proxy Service);
    B --> C{Load Balancer (Round Robin)};
    C --> D1[Upstream 1];
    C --> D2[Upstream 2];
    C --> Dn[Upstream N];

    subgraph Pingora Proxy Service
        direction LR
        subgraph Upstream Pool
            D1
            D2
            Dn
        end
        C --- D1;
        C --- D2;
        C --- Dn;
    end

```

## 3. 核心组件设计

### 3.1. 配置

配置采用简化的 YAML 格式，仅定义了服务器和单一上游组。

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

### 3.2. 代理服务

`ProxyService` 结构体实现了 `ProxyHttp` trait，是处理所有请求的核心。

-   `upstream_peer()`: 此方法是唯一的路由逻辑。它不检查请求路径，直接从配置的单一上游池中通过轮询方式选择一个健康的对等点。
-   **负载均衡与健康检查**: 直接利用 `pingora_load_balancing` crate。`main.rs` 中配置了一个 `LoadBalancing<RoundRobin>` 实例，并为其附加了一个 `TcpHealthCheck` 来自动管理上游服务器的健康状态。

## 4. 数据流

1.  客户端向代理发送一个 HTTP 请求。
2.  Pingora 服务器接收请求并将其传递给 `ProxyService`。
3.  `upstream_peer()` 方法被调用。
4.  负载均衡器从上游池中选择下一个对等点（轮询）。
5.  代理将请求直接转发到选定的对等点。
6.  上游服务返回响应。
7.  代理将响应转发回客户端。

## 5. 总结

该设计放弃了所有非核心的自定义实现，如自定义路由、认证、监控和安全模块。它完全依赖 Pingora 的核心代理、负载均衡和健康检查功能，从而实现了一个更简单、更易于维护、但仍然高性能的反向代理。
