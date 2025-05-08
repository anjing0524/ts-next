# 优化的 Kubernetes 配置

本项目使用 Kubernetes 和 Kustomize 来管理应用和 MySQL 数据库的部署，已针对以下要求进行了优化：

1. MySQL 使用 root/123456 密码
2. ts-next-template 应用已配置为连接到 MySQL 并正常运行
3. 通过 Ingress 提供外部访问入口

## 配置说明

### MySQL 配置

MySQL 配置已更新为使用以下凭据：

- 用户名: root
- 密码: 123456
- 数据库: dataalchemist

这些凭据存储在 Kubernetes Secret 中，应用通过环境变量引用这些凭据。

### 应用配置

应用已配置为连接到 MySQL 数据库，使用以下环境变量：

- MYSQL_HOST: mysql
- MYSQL_USER: root
- MYSQL_PASSWORD: 123456
- MYSQL_DATABASE: dataalchemist

### Ingress 配置

应用已配置为通过 Ingress 提供外部访问入口，使用以下配置：

- 主机名: ts-next-template.local
- 路径: /(.\*)
- 服务: ts-next-template-service:80

## 部署

### 1. 安装 Ingress 控制器

首先，您需要安装 Ingress 控制器：

```bash
# 安装 Ingress 控制器
./k8s/setup-ingress.sh --install
```

安装完成后，请将 Ingress 控制器的外部 IP 添加到您的 /etc/hosts 文件中：

```
<INGRESS_IP> ts-next-template.local
```

### 2. 部署应用

使用 `deploy-optimized.sh` 脚本来部署应用：

```bash
# 显示帮助信息
./k8s/deploy-optimized.sh --help

# 部署应用到 Kubernetes
./k8s/deploy-optimized.sh --deploy
```

## 验证部署

部署完成后，可以使用以下命令验证部署状态：

```bash
# 检查 Pod 状态
kubectl get pods -l app=ts-next-template

# 检查服务状态
kubectl get svc -l app=ts-next-template

# 检查 MySQL Pod 状态
kubectl get pods -l app=mysql

# 检查 MySQL 服务状态
kubectl get svc -l app=mysql

# 检查 Ingress 状态
kubectl get ingress
```

## 访问应用

应用可以通过以下方式访问：

1. 通过 Ingress 访问：

   - 在浏览器中访问 http://ts-next-template.local
   - 确保已将 Ingress 控制器的外部 IP 添加到您的 /etc/hosts 文件中

2. 通过 port-forward 访问：
   ```bash
   kubectl port-forward svc/ts-next-template-service 8080:80
   ```
   然后通过 http://localhost:8080 访问应用

## 注意事项

1. 确保 kubectl 已安装并配置
2. 确保 Kubernetes 集群已启动
3. 确保有足够的资源（CPU、内存、存储）来运行应用和 MySQL
4. 确保 Ingress 控制器已安装并正常运行
