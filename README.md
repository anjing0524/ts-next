# TS Next Template

这是一个基于 Next.js 和 TypeScript 的项目模板。

## 项目结构

- `app/`: Next.js 应用代码
- `components/`: 可复用组件
- `lib/`: 工具库和共享代码
- `public/`: 静态资源
- `k8s/`: Kubernetes 配置文件
  - `mysql/`: MySQL 相关的 Kubernetes 配置文件

## 开发

```bash
# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev
```

## 构建

```bash
# 构建应用
pnpm build
```

## Docker 构建

```bash
# 构建 Docker 镜像
docker build -t liushuodocker/ts-next:latest -f build-docker/Dockerfile .
```

## Kubernetes 部署

### 快速部署

我们提供了便捷的部署和验证脚本，可以一键完成部署和验证：

```bash
# 部署应用和 MySQL
./k8s/deploy.sh

# 验证应用和 MySQL 的连接
./k8s/verify.sh
```

### 手动部署

如果您想手动部署，可以按照以下步骤操作：

#### 应用部署

```bash
# 使用 Kustomize 应用所有应用资源
kubectl apply -k k8s
```

#### MySQL 部署

MySQL 部署配置位于 `k8s/mysql/` 目录下，详细说明请参考 [MySQL 部署说明](k8s/mysql/README.md)。

```bash
# 使用 Kustomize 应用所有 MySQL 资源
kubectl apply -k k8s/mysql
```

## 访问应用

应用部署后，可以通过以下方式访问：

- 本地访问: `http://localhost:3000`
- 集群内部访问: `http://ts-next-template-service`
