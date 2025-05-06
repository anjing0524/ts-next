# 使用基础镜像
FROM node:lts AS base
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

# 复制依赖和源代码
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# 优化构建过程
ENV NEXT_TELEMETRY_DISABLED=1
RUN --mount=type=cache,target=/app/.next/cache \
    DISABLE_ESLINT_PLUGIN=true pnpm run build

# 生产阶段 - 使用更轻量的基础镜像
FROM node:lts-slim AS runner
WORKDIR /app

# 安装 pnpm
RUN npm install -g pnpm

# 设置可被覆盖的生产环境变量
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME="0.0.0.0"

# 声明可注入的环境变量（用于数据库连接）
ENV MYSQL_HOST=$MYSQL_HOST \
    MYSQL_USER=$MYSQL_USER \
    MYSQL_PASSWORD=$MYSQL_PASSWORD \
    MYSQL_DATABASE=$MYSQL_DATABASE

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