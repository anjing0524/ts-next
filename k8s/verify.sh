#!/bin/bash

# 设置颜色
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}验证 ts-next-template 应用状态...${NC}"

# 检查部署状态
echo -e "${YELLOW}检查部署状态...${NC}"
DEPLOYMENT_STATUS=$(kubectl get deployment ts-next-template -o jsonpath='{.status.availableReplicas}')
if [ "$DEPLOYMENT_STATUS" -ge 1 ]; then
  echo -e "${GREEN}部署状态正常，有 ${DEPLOYMENT_STATUS} 个可用副本${NC}"
else
  echo -e "${RED}部署状态异常，没有可用副本${NC}"
  exit 1
fi

# 检查 Pod 状态
echo -e "${YELLOW}检查 Pod 状态...${NC}"
PODS=$(kubectl get pods -l app=ts-next-template -o jsonpath='{.items[*].metadata.name}')
for POD in $PODS; do
  POD_STATUS=$(kubectl get pod $POD -o jsonpath='{.status.phase}')
  if [ "$POD_STATUS" == "Running" ]; then
    echo -e "${GREEN}Pod $POD 状态正常: $POD_STATUS${NC}"
  else
    echo -e "${RED}Pod $POD 状态异常: $POD_STATUS${NC}"
    exit 1
  fi
done

# 检查服务状态
echo -e "${YELLOW}检查服务状态...${NC}"
SERVICE_STATUS=$(kubectl get svc ts-next-template-service -o jsonpath='{.spec.type}')
if [ "$SERVICE_STATUS" == "NodePort" ]; then
  NODE_PORT=$(kubectl get svc ts-next-template-service -o jsonpath='{.spec.ports[0].nodePort}')
  echo -e "${GREEN}服务状态正常，类型: $SERVICE_STATUS, NodePort: $NODE_PORT${NC}"
  echo -e "${GREEN}您可以通过以下地址访问应用:${NC}"
  echo -e "${GREEN}http://localhost:${NODE_PORT}${NC}"
else
  echo -e "${RED}服务状态异常: $SERVICE_STATUS${NC}"
  exit 1
fi

# 检查 MySQL 连接
echo -e "${YELLOW}检查 MySQL 连接...${NC}"
MYSQL_POD=$(kubectl get pods -l app=mysql -o jsonpath='{.items[0].metadata.name}')
if [ -n "$MYSQL_POD" ]; then
  MYSQL_STATUS=$(kubectl get pod $MYSQL_POD -o jsonpath='{.status.phase}')
  if [ "$MYSQL_STATUS" == "Running" ]; then
    echo -e "${GREEN}MySQL Pod 状态正常: $MYSQL_STATUS${NC}"
  else
    echo -e "${RED}MySQL Pod 状态异常: $MYSQL_STATUS${NC}"
    exit 1
  fi
else
  echo -e "${RED}未找到 MySQL Pod${NC}"
  exit 1
fi

echo -e "${GREEN}验证完成，应用状态正常!${NC}" 