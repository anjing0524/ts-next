# Kubernetes 配置

本项目使用 Kubernetes 和 Kustomize 来管理应用和 MySQL 数据库的部署。

## 目录结构

```
k8s/
├── base/                  # 基础配置
│   ├── app/               # 应用配置
│   │   ├── deployment.yaml
│   │   ├── service.yaml
│   │   └── kustomization.yaml
│   ├── mysql/             # MySQL 配置
│   │   ├── deployment.yaml
│   │   ├── service.yaml
│   │   ├── pvc.yaml
│   │   ├── secret.yaml
│   │   └── kustomization.yaml
│   └── kustomization.yaml # 主 kustomization 文件
├── overlays/              # 环境特定配置
│   └── dev/               # 开发环境
│       ├── kustomization.yaml
│       └── replicas-patch.yaml
└── deploy.sh              # 部署脚本
```

## 部署

使用 `deploy.sh` 脚本来构建和部署应用：

```bash
# 显示帮助信息
./k8s/deploy.sh --help

# 构建 Docker 镜像
./k8s/deploy.sh --build

# 部署应用到开发环境
./k8s/deploy.sh --deploy

# 构建镜像并部署到开发环境
./k8s/deploy.sh --all

# 部署到特定环境
./k8s/deploy.sh --deploy --env dev
```

## 应用与 MySQL 的连接

应用通过 Kubernetes 服务名称 `mysql` 连接到 MySQL 数据库。MySQL 服务在集群内部暴露为 `mysql:3306`。

应用的环境变量配置如下：

```yaml
env:
  - name: MYSQL_HOST
    value: mysql
  - name: MYSQL_USER
    valueFrom:
      secretKeyRef:
        name: mysql-secret
        key: MYSQL_USER
  - name: MYSQL_PASSWORD
    valueFrom:
      secretKeyRef:
        name: mysql-secret
        key: MYSQL_PASSWORD
  - name: MYSQL_DATABASE
    valueFrom:
      secretKeyRef:
        name: mysql-secret
        key: MYSQL_DATABASE
```

## 添加新环境

要添加新环境（如生产环境），请按照以下步骤操作：

1. 在 `overlays` 目录下创建新环境目录（如 `prod`）
2. 创建 `kustomization.yaml` 文件，指定命名空间和资源
3. 添加环境特定的补丁文件（如 `replicas-patch.yaml`）

示例：

```bash
mkdir -p k8s/overlays/prod
```

然后创建 `k8s/overlays/prod/kustomization.yaml`：

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

namespace: prod

resources:
  - ../../base

patches:
  - path: replicas-patch.yaml
    target:
      kind: Deployment
      name: ts-next-template
```

创建 `k8s/overlays/prod/replicas-patch.yaml`：

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ts-next-template
spec:
  replicas: 3
```

## 配置说明

### 应用部署

- 使用 `ts-next-template:latest` 镜像
- 资源请求: CPU 0.3, 内存 200Mi
- 资源限制: CPU 1, 内存 512Mi
- 健康检查: 通过 `/api/health` 端点

### MySQL 部署

- 使用 `mysql:8.0` 镜像
- 资源请求: CPU 0.2, 内存 256Mi
- 资源限制: CPU 0.5, 内存 512Mi
- 使用 PersistentVolumeClaim 存储数据

### 服务

- 应用服务: 将端口 80 映射到容器的 3000 端口
- MySQL 服务: 将端口 3306 映射到容器的 3306 端口

## 注意事项

1. 确保 Docker 已安装并运行
2. 确保 kubectl 已安装并配置
3. 确保 Kubernetes 集群已启动
