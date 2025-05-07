# MySQL Kubernetes 部署

本目录包含用于在 Kubernetes 中部署 MySQL 的配置文件。

## 文件说明

- `mysql-configmap.yaml`: MySQL 配置
- `mysql-secret.yaml`: MySQL 密码等敏感信息
- `mysql-pvc.yaml`: MySQL 数据持久化
- `mysql-deployment.yaml`: MySQL 部署配置
- `mysql-service.yaml`: MySQL 服务配置
- `mysql-migration.sh`: 从 Docker 容器迁移数据到 Kubernetes MySQL 的脚本
- `kustomization.yaml`: Kustomize 配置文件，用于管理所有资源

## 部署步骤

### 1. 应用 MySQL 配置

```bash
# 使用 Kustomize 应用所有 MySQL 资源
kubectl apply -k k8s/mysql
```

### 2. 迁移 MySQL 数据

```bash
# 给迁移脚本添加执行权限
chmod +x k8s/mysql/mysql-migration.sh

# 执行迁移脚本
./k8s/mysql/mysql-migration.sh
```

### 3. 验证部署

```bash
# 检查 MySQL Pod 状态
kubectl get pods -l app=mysql

# 检查 MySQL 服务状态
kubectl get services -l app=mysql

# 连接到 MySQL
kubectl exec -it $(kubectl get pods -l app=mysql -o jsonpath="{.items[0].metadata.name}") -- mysql -u root -p123456 mydb
```

## 配置说明

### MySQL 配置

MySQL 配置存储在 ConfigMap 中，包括字符集、缓冲区大小等参数。

### 数据持久化

MySQL 数据存储在 PersistentVolumeClaim 中，确保数据在 Pod 重启后不会丢失。

### 资源限制

MySQL 容器的资源限制：

- CPU: 请求 500m，限制 1000m
- 内存: 请求 512Mi，限制 1Gi
