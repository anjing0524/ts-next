# Redis Kubernetes 部署配置

这个目录包含了在 Kubernetes 集群中部署 Redis 开发环境所需的所有配置文件。

## 📁 文件说明

- `deployment.yaml` - Redis Deployment 配置
- `service.yaml` - Redis Service 配置（NodePort 类型）
- `pv.yaml` - 持久化卷配置
- `pvc.yaml` - 持久化卷声明配置
- `secret.yaml` - Redis 密码配置
- `kustomization.yaml` - Kustomize 配置文件
- `deploy.sh` - 一键部署脚本

## 🚀 快速部署

### 方法一：使用部署脚本（推荐）

```bash
cd k8s/redis
./deploy.sh
```

### 方法二：手动部署

```bash
# 创建命名空间
kubectl create namespace ts-next-template

# 部署 Redis
kubectl apply -k . -n ts-next-template

# 检查部署状态
kubectl get pods -l app=redis -n ts-next-template
```

## 🔧 配置说明

### Redis 配置

- **镜像**: `redis:7-alpine`
- **端口**: `6379`
- **NodePort**: `30379`
- **密码**: `redis123`
- **持久化**: 启用 AOF 持久化
- **存储**: 5Gi 本地存储

### 资源限制

- **CPU 请求**: 0.1 核
- **CPU 限制**: 0.3 核
- **内存请求**: 128Mi
- **内存限制**: 256Mi

## 🔗 连接 Redis

### 从集群内部连接

```bash
# 进入 Redis 容器
kubectl exec -it deployment/redis -n ts-next-template -- redis-cli -a redis123
```

### 从本地连接

```bash
# 使用 redis-cli（需要本地安装 Redis 客户端）
redis-cli -h localhost -p 30379 -a redis123

# 或者使用端口转发
kubectl port-forward svc/redis 6379:6379 -n ts-next-template
redis-cli -a redis123
```

### 在应用中连接

```javascript
// Node.js 示例
const redis = require('redis');
const client = redis.createClient({
  host: 'localhost',
  port: 30379,
  password: 'redis123',
});
```

## 🧪 验证部署

```bash
# 检查 Pod 状态
kubectl get pods -l app=redis -n ts-next-template

# 检查 Service
kubectl get svc redis -n ts-next-template

# 检查持久化卷
kubectl get pv,pvc -n ts-next-template

# 查看 Redis 日志
kubectl logs deployment/redis -n ts-next-template
```

## 🗑️ 清理资源

```bash
# 删除 Redis 相关资源
kubectl delete -k . -n ts-next-template

# 删除持久化卷（可选）
kubectl delete pv redis-pv
```

## 🔒 安全注意事项

1. **密码管理**: 生产环境中应使用更强的密码，并考虑使用 Kubernetes Secrets 的加密功能
2. **网络访问**: NodePort 类型的 Service 会暴露端口到集群外部，生产环境建议使用 ClusterIP
3. **资源限制**: 根据实际需求调整 CPU 和内存限制
4. **持久化**: 生产环境建议使用更可靠的存储解决方案

## 🛠️ 故障排除

### Pod 无法启动

```bash
# 查看 Pod 详细信息
kubectl describe pod -l app=redis -n ts-next-template

# 查看事件
kubectl get events -n ts-next-template --sort-by='.lastTimestamp'
```

### 持久化卷问题

```bash
# 检查 PV 和 PVC 状态
kubectl get pv,pvc -n ts-next-template

# 确保本地路径存在
sudo mkdir -p /var/lib/docker/data/redis-data
sudo chmod 777 /var/lib/docker/data/redis-data
```

### 连接问题

```bash
# 检查 Service 端点
kubectl get endpoints redis -n ts-next-template

# 测试网络连接
kubectl run test-pod --image=redis:7-alpine --rm -it -- redis-cli -h redis.ts-next-template.svc.cluster.local -p 6379 -a redis123
```
