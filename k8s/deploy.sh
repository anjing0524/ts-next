#!/bin/bash

# 设置颜色
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}开始部署 ts-next-template 应用...${NC}"

# 应用 Kubernetes 配置
echo -e "${YELLOW}应用 Kubernetes 配置...${NC}"
kubectl apply -k .

# 等待部署完成
echo -e "${YELLOW}等待部署完成...${NC}"
kubectl rollout status deployment/ts-next-template

# 获取服务访问信息
echo -e "${YELLOW}获取服务访问信息...${NC}"
NODE_PORT=$(kubectl get svc ts-next-template-service -o jsonpath='{.spec.ports[0].nodePort}')
echo -e "${GREEN}应用已成功部署!${NC}"
echo -e "${GREEN}您可以通过以下地址访问应用:${NC}"
echo -e "${GREEN}http://localhost:${NODE_PORT}${NC}"

# 显示 Pod 状态
echo -e "${YELLOW}Pod 状态:${NC}"
kubectl get pods -l app=ts-next-template 