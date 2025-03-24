# 使用带版本的基础镜像
ARG NODE_VERSION="22.0.0"
FROM liushuodocker/ts-next-template-base:latest AS base

# 设置工作目录
WORKDIR /app

# 安装依赖阶段
FROM base AS deps
WORKDIR /app

# 选择正确的Node版本
ARG NODE_VERSION="22.0.0"
RUN . ~/.bashrc && fnm use ${NODE_VERSION}

# 配置npm和pnpm使用国内镜像源
RUN . ~/.bashrc && npm config set registry https://registry.npmmirror.com && \
    pnpm config set registry https://registry.npmmirror.com

# 根据锁文件选择合适的包管理器安装依赖
COPY package.json yarn.lock* package-lock.json* pnpm-lock.yaml* .npmrc* ./
RUN \
  . ~/.bashrc && \
  if [ -f yarn.lock ]; then yarn --frozen-lockfile; \
  elif [ -f package-lock.json ]; then npm ci; \
  elif [ -f pnpm-lock.yaml ]; then pnpm i --frozen-lockfile; \
  else echo "Lockfile not found." && exit 1; \
  fi

# 构建阶段
FROM base AS builder
WORKDIR /app

# 选择正确的Node版本并验证
ARG NODE_VERSION="22.0.0"
RUN . ~/.bashrc && fnm use ${NODE_VERSION} && \
    node -v | grep -q "v${NODE_VERSION}" || (echo "Node version mismatch" && exit 1)

# 复制依赖和源代码
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# 禁用 Next.js 遥测
ENV NEXT_TELEMETRY_DISABLED=1

# 根据锁文件选择合适的包管理器构建应用
RUN \
  . ~/.bashrc && \
  if [ -f yarn.lock ]; then yarn run build; \
  elif [ -f package-lock.json ]; then npm run build; \
  elif [ -f pnpm-lock.yaml ]; then pnpm run build; \
  else echo "Lockfile not found." && exit 1; \
  fi

# 生产阶段
FROM base AS runner
WORKDIR /app

# 选择正确的Node版本
ARG NODE_VERSION="22.0.0"
RUN . ~/.bashrc && fnm use ${NODE_VERSION}

# 设置为生产环境
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# 添加非 root 用户以提高安全性
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# 复制构建产物和必要文件
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# 切换到非 root 用户
USER nextjs

# 暴露端口
EXPOSE 3000

# 设置环境变量
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# 启动命令
CMD ["node", "server.js"]