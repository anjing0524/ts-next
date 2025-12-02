# apps/oauth-service-rust/Dockerfile
FROM rust:1.75-alpine AS builder

WORKDIR /app

# 安装必要的build工具
RUN apk add --no-cache openssl-dev pkg-config

# 复制Cargo文件
COPY Cargo.toml Cargo.lock ./
COPY src ./src

# 构建应用 (release模式，优化二进制大小)
RUN cargo build --release

# ===== 运行镜像 =====
FROM alpine:3.18

WORKDIR /app

# 安装运行时依赖
RUN apk add --no-cache openssl ca-certificates

# 复制编译的二进制
COPY --from=builder /app/target/release/oauth-service-rust /app/oauth-service

# 创建非root用户
RUN addgroup -g 1000 appuser && \
    adduser -D -u 1000 -G appuser appuser
USER appuser

# 设置环境变量
ENV RUST_LOG=info
ENV PORT=3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

EXPOSE 3001

CMD ["/app/oauth-service"]
