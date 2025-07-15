# 使用基础镜像
FROM node:lts AS base

# 设置时区为东八区
RUN apt-get update && apt-get install -y tzdata
ENV TZ=Asia/Shanghai
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

WORKDIR /app

# 安装 pnpm
RUN npm install -g pnpm

# 安装依赖阶段
FROM base AS deps
WORKDIR /app

# 复制版本和配置文件
COPY package.json pnpm-lock.yaml* .npmrc ./

# 安装依赖（优化缓存策略）
RUN --mount=type=cache,target=/root/.pnpm-store \
    pnpm install --frozen-lockfile --prefer-offline && \
    pnpm cache clean

# 构建阶段
FROM base AS builder
WORKDIR /app

# 复制依赖
COPY --from=deps /app/node_modules ./node_modules

# 复制必要的源代码文件和配置文件
COPY next.config.ts ./
COPY tsconfig.json ./
COPY package.json ./
COPY postcss.config.mjs ./
COPY prettier.config.mjs ./
COPY components.json ./
COPY .node-version ./

# 复制源代码目录
COPY app ./app
COPY components ./components
COPY lib ./lib
COPY public ./public
COPY types ./types
COPY utils ./utils

# 优化构建过程
ENV NEXT_TELEMETRY_DISABLED=1

# 构建应用
RUN --mount=type=cache,target=/app/.next/cache \
    DISABLE_ESLINT_PLUGIN=true pnpm run build

# 生产阶段 - 使用更轻量的基础镜像
FROM node:lts-slim AS runner
WORKDIR /app

# 设置可被覆盖的生产环境变量
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME="0.0.0.0" \
    # 添加RSC相关环境变量
    NEXT_RUNTIME="nodejs" \
    NEXT_SHARP_PATH="/app/node_modules/sharp" \
    # 添加网络相关环境变量
    NODE_OPTIONS="--max-old-space-size=4096 --max-http-header-size=16384" \
    # 添加调试环境变量
    DEBUG="next:*"

# 声明可注入的环境变量（用于数据库连接）
ENV MYSQL_HOST="" \
    MYSQL_USER="" \
    MYSQL_PASSWORD="" \
    MYSQL_DATABASE="" \
    MYSQL_PORT=3306 \
    SCHEDULER_API_URL=""

# 创建非特权用户
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# 复制 standalone 输出和必要的静态文件
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
# COPY --from=builder --chown=nextjs:nodejs /app/generated ./generated

# 确保非特权用户可以访问所需文件
RUN chown -R nextjs:nodejs /app && \
    chmod -R 755 /app/public && \
    chmod -R 755 /app/.next

# 创建健康检查脚本
RUN echo '#!/bin/sh\ncurl -f http://localhost:3000/api/health || exit 1' > /app/healthcheck.sh && \
    chmod +x /app/healthcheck.sh

USER nextjs
EXPOSE 3000

# 使用健康检查
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
    CMD /app/healthcheck.sh

# 使用更可靠的启动命令
CMD ["node", "server.js"]