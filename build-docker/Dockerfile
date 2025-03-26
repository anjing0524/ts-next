# 使用基础镜像
FROM liushuodocker/ts-next-template-base:latest AS base
WORKDIR /app

# 安装依赖阶段
FROM base AS deps
WORKDIR /app

# 复制版本和配置文件
COPY .node-version .npmrc ./

# 设置 Node.js 版本（优化命令）
RUN NODE_VERSION=$(cat .node-version) && \
    echo "使用 Node.js 版本: $NODE_VERSION" && \
    bash -c 'source ~/.bashrc && fnm use $NODE_VERSION && node -v'

# 复制并安装依赖（优化缓存策略）
COPY package.json pnpm-lock.yaml* ./
RUN --mount=type=cache,target=/root/.pnpm-store \
    bash -c 'source ~/.bashrc && \
    export HUSKY=0 && \
    pnpm install --frozen-lockfile --prefer-offline && \
    pnpm cache clean'

# 构建阶段
FROM base AS builder
WORKDIR /app

# 设置 Node.js 版本
COPY .node-version ./
RUN NODE_VERSION=$(cat .node-version) && \
    bash -c 'source ~/.bashrc && fnm use $NODE_VERSION'

# 复制依赖和源代码
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# 优化构建过程
ENV NEXT_TELEMETRY_DISABLED=1
RUN --mount=type=cache,target=/app/.next/cache \
    bash -c 'source ~/.bashrc && HUSKY=0 pnpm run build'

# 生产阶段 - 使用更轻量的基础镜像
FROM node:lts-slim AS runner
WORKDIR /app

# 设置生产环境变量
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME="0.0.0.0"

# 创建非特权用户
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# 复制构建产物（优化复制命令）
COPY --from=builder --chown=nextjs:nodejs /app/public ./public/
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static/

# 确保非特权用户可以访问所需文件
RUN chown -R nextjs:nodejs /app

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]