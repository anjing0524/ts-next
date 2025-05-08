# Kubernetes Ingress 配置指南

本文档提供了如何使用 Ingress 在 Kubernetes 中暴露 ts-next-template 服务的详细步骤。

## 什么是 Ingress？

Ingress 是 Kubernetes 中的一种 API 对象，用于管理对集群中服务的外部访问。它提供了 HTTP/HTTPS 路由规则，允许您将流量路由到不同的服务。

## 配置步骤

### 1. 安装 Ingress 控制器

首先，您需要安装一个 Ingress 控制器。我们使用 NGINX Ingress 控制器，这是最常用的选择之一。

您可以使用我们提供的脚本自动安装：

```bash
./k8s/setup-ingress.sh
```

或者手动安装：

```bash
# 使用 Helm 安装
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update
helm install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx \
  --create-namespace \
  --set controller.service.type=LoadBalancer
```

### 2. 配置 Ingress 资源

我们已经创建了一个 Ingress 资源文件 `k8s/ingress.yaml`，它定义了如何将流量路由到您的服务。

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ts-next-template-ingress
  annotations:
    kubernetes.io/ingress.class: 'nginx'
    nginx.ingress.kubernetes.io/ssl-redirect: 'false'
    nginx.ingress.kubernetes.io/use-regex: 'true'
    nginx.ingress.kubernetes.io/rewrite-target: /$1
spec:
  rules:
    - host: ts-next-template.example.com # 替换为您的实际域名
      http:
        paths:
          - path: /(.*)
            pathType: Prefix
            backend:
              service:
                name: ts-next-template-service
                port:
                  number: 80
```

### 3. 应用 Ingress 资源

应用 Ingress 资源：

```bash
kubectl apply -f k8s/ingress.yaml
```

### 4. 配置 DNS

获取 Ingress 控制器的外部 IP：

```bash
kubectl get service -n ingress-nginx ingress-nginx-controller
```

将您的域名（例如 `ts-next-template.example.com`）指向此 IP 地址。

### 5. 验证 Ingress 配置

验证 Ingress 配置是否正常工作：

```bash
kubectl get ingress
kubectl describe ingress ts-next-template-ingress
```

## 高级配置

### 配置 TLS

如果您需要 HTTPS 支持，可以配置 TLS：

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ts-next-template-ingress
  annotations:
    kubernetes.io/ingress.class: 'nginx'
    nginx.ingress.kubernetes.io/ssl-redirect: 'true'
    nginx.ingress.kubernetes.io/use-regex: 'true'
    nginx.ingress.kubernetes.io/rewrite-target: /$1
spec:
  tls:
    - hosts:
        - ts-next-template.example.com
      secretName: ts-next-template-tls
  rules:
    - host: ts-next-template.example.com
      http:
        paths:
          - path: /(.*)
            pathType: Prefix
            backend:
              service:
                name: ts-next-template-service
                port:
                  number: 80
```

然后创建 TLS 密钥：

```bash
kubectl create secret tls ts-next-template-tls \
  --cert=path/to/cert.pem \
  --key=path/to/key.pem
```

### 配置路径重写

如果您需要将请求重写到不同的路径，可以使用 `nginx.ingress.kubernetes.io/rewrite-target` 注解：

```yaml
annotations:
  nginx.ingress.kubernetes.io/rewrite-target: /api/$1
```

### 配置负载均衡

如果您需要配置负载均衡，可以使用 `nginx.ingress.kubernetes.io/load-balance` 注解：

```yaml
annotations:
  nginx.ingress.kubernetes.io/load-balance: 'round_robin'
```

## 故障排除

### Ingress 控制器未就绪

如果 Ingress 控制器未就绪，请检查：

```bash
kubectl get pods -n ingress-nginx
kubectl describe pod -n ingress-nginx <pod-name>
```

### Ingress 资源未生效

如果 Ingress 资源未生效，请检查：

```bash
kubectl get ingress
kubectl describe ingress ts-next-template-ingress
```

### 无法访问服务

如果无法访问服务，请检查：

1. DNS 配置是否正确
2. Ingress 控制器的外部 IP 是否正确
3. 服务是否正常运行
4. 防火墙规则是否允许流量

## 其他资源

- [Kubernetes 文档：Ingress](https://kubernetes.io/docs/concepts/services-networking/ingress/)
- [NGINX Ingress 控制器文档](https://kubernetes.github.io/ingress-nginx/)
- [Helm 文档](https://helm.sh/docs/)
