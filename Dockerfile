# 使用 Node.js LTS 版本作为基础镜像
FROM node:20-alpine AS base

# 设置工作目录
WORKDIR /app

# 安装依赖阶段
FROM base AS deps
# 安装构建工具和依赖
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json* ./
RUN npm i

# 构建阶段
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# 构建应用
RUN npm run build

# 生产阶段
FROM base AS runner
# 设置为生产环境
ENV NODE_ENV production
# 添加非 root 用户以提高安全性
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
# 复制构建产物和必要文件
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# 切换到非 root 用户
USER nextjs

# 暴露端口
EXPOSE 3000

# 设置环境变量，允许从 .env 文件或 Kubernetes 配置中读取
ENV PORT 3000
# 允许主机头部，用于反向代理
ENV HOSTNAME "0.0.0.0"

# 启动命令
CMD ["node", "server.js"]