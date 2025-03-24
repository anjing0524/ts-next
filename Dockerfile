# 使用基础镜像
FROM liushuodocker/ts-next-template-base:latest AS base

# 设置工作目录
WORKDIR /app

# 安装依赖阶段
FROM base AS deps
WORKDIR /app

# 先复制 .node-version 和 .npmrc 文件
COPY .node-version .npmrc ./

# 读取 .node-version 文件内容并切换到对应版本
RUN NODE_VERSION=$(cat .node-version) && \
    echo "使用 Node.js 版本: $NODE_VERSION" && \
    bash -c 'export SHELL=/bin/bash && source ~/.bashrc && fnm use $NODE_VERSION'

# 复制package.json和锁文件
COPY package.json pnpm-lock.yaml* ./

# 安装依赖，使用 .npmrc 中的配置
RUN bash -c 'export SHELL=/bin/bash && source ~/.bashrc && export HUSKY=0 && pnpm install --no-frozen-lockfile'

# 构建阶段
FROM base AS builder
WORKDIR /app

# 复制 .node-version 文件并切换到对应版本
COPY .node-version ./
RUN NODE_VERSION=$(cat .node-version) && \
    echo "使用 Node.js 版本: $NODE_VERSION" && \
    bash -c 'export SHELL=/bin/bash && source ~/.bashrc && fnm use $NODE_VERSION'

# 复制依赖和源代码
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# 禁用 Next.js 遥测
ENV NEXT_TELEMETRY_DISABLED=1

# 构建应用
RUN bash -c 'export SHELL=/bin/bash && source ~/.bashrc && export HUSKY=0 && pnpm run build'

# 生产阶段
FROM base AS runner
WORKDIR /app

# 复制 .node-version 文件并切换到对应版本
COPY .node-version ./
RUN NODE_VERSION=$(cat .node-version) && \
    echo "使用 Node.js 版本: $NODE_VERSION" && \
    bash -c 'export SHELL=/bin/bash && source ~/.bashrc && fnm use $NODE_VERSION'

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