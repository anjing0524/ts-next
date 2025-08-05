# Kubernetes 部署指南

本目录包含用于在 Kubernetes 集群上部署 TS Next Template 应用的配置文件。

## 目录结构

```
k8s/
├── app/                  # 应用相关配置
│   ├── deployment.yaml   # 应用部署配置
│   ├── ingress.yaml      # Ingress 配置
│   ├── pvc.yaml          # 持久卷声明配置
│   └── service.yaml      # 服务配置
├── mysql/                # MySQL 相关配置
│   ├── deployment.yaml   # MySQL 部署配置
│   ├── pvc.yaml          # MySQL 持久卷声明配置
│   ├── secret.yaml       # MySQL 密钥配置
│   └── service.yaml      # MySQL 服务配置
├── deploy.sh             # 部署脚本
├── verify.sh             # 验证脚本
└── kustomization.yaml    # Kustomize 配置
```

## 快速开始

### 部署应用

使用提供的部署脚本一键部署应用和 MySQL：

```bash
# 使用默认镜像部署
./k8s/deploy.sh --deploy

# 使用指定镜像部署
./k8s/deploy.sh --deploy --image myapp:v1

# 在指定命名空间中部署
./k8s/deploy.sh --deploy --namespace myapp
```

### 验证部署

使用验证脚本检查部署状态和连接：

```bash
# 检查部署状态
./k8s/verify.sh --check

# 测试应用和 MySQL 的连接
./k8s/verify.sh --test

# 尝试修复部署问题
./k8s/verify.sh --fix

# 执行所有验证
./k8s/verify.sh --all

# 在指定命名空间中验证
./k8s/verify.sh --check --namespace myapp
```

## 配置说明

### 应用配置

应用部署配置位于 `app/deployment.yaml`，主要包含以下内容：

- 容器镜像和资源限制
- 环境变量配置（MySQL 连接信息等）
- 健康检查配置
- 卷挂载配置（日志和临时文件）

### MySQL 配置

MySQL 部署配置位于 `mysql/deployment.yaml`，主要包含以下内容：

- MySQL 镜像和资源限制
- 环境变量配置
- 持久卷挂载配置

### Ingress 配置

Ingress 配置位于 `app/ingress.yaml`，主要包含以下内容：

- 路径重写规则
- 安全头配置
- 主机名配置

### 持久卷配置

应用和 MySQL 的持久卷配置分别位于 `app/pvc.yaml` 和 `mysql/pvc.yaml`，用于持久化存储日志和数据库数据。

## 环境变量

应用使用以下环境变量：

- `MYSQL_HOST`: MySQL 主机名
- `MYSQL_PORT`: MySQL 端口
- `MYSQL_USER`: MySQL 用户名
- `MYSQL_PASSWORD`: MySQL 密码
- `MYSQL_DATABASE`: MySQL 数据库名
- `NODE_ENV`: 环境（production/development）
- `PORT`: 应用端口
- `BASE_PATH`: 应用基础路径

## 镜像配置

应用使用以下镜像：

- 默认镜像: `liushuodocker/ts-next:latest`

## 访问应用

应用部署后，可以通过以下方式访问：

- 本地访问: `http://ts-next-template.local/datamgr_flow`
- 集群内部访问: `http://ts-next-template-service/datamgr_flow`

## 故障排除

如果遇到部署问题，可以使用以下命令进行故障排除：

```bash
# 查看应用 Pod 日志
kubectl logs -l app=ts-next-template

# 查看 MySQL Pod 日志
kubectl logs -l app=mysql

# 查看 Pod 状态
kubectl get pods -l app=ts-next-template
kubectl get pods -l app=mysql

# 查看部署状态
kubectl get deployments -l app=ts-next-template
kubectl get deployments -l app=mysql

# 查看服务状态
kubectl get svc -l app=ts-next-template
kubectl get svc -l app=mysql

# 查看 Ingress 状态
kubectl get ingress
```

## 常见问题

### ImagePullBackOff 错误

如果遇到 ImagePullBackOff 错误，可能是因为镜像不存在或无法访问。可以使用以下方法解决：

1. 确保镜像已正确构建并推送到可访问的镜像仓库
2. 检查 Kubernetes 集群的镜像拉取凭证配置
3. 使用 `--fix` 选项尝试修复

### CrashLoopBackOff 错误

如果遇到 CrashLoopBackOff 错误，可能是因为应用启动失败。可以使用以下方法解决：

1. 查看 Pod 日志，了解具体错误原因
2. 检查环境变量配置是否正确
3. 检查应用代码是否有错误
4. 使用 `--fix` 选项尝试修复

### 连接问题

如果应用无法连接到 MySQL，请检查：

1. MySQL Pod 是否正常运行
2. MySQL 服务是否可访问
3. 环境变量配置是否正确
