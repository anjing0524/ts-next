#!/bin/bash

# 设置颜色
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 显示帮助信息
show_help() {
  echo -e "${YELLOW}使用方法:${NC}"
  echo -e "  $0 [选项]"
  echo -e ""
  echo -e "${YELLOW}选项:${NC}"
  echo -e "  -h, --help     显示帮助信息"
  echo -e "  -d, --deploy   部署应用到 Kubernetes"
  echo -e ""
  echo -e "${YELLOW}示例:${NC}"
  echo -e "  $0 --deploy    # 部署应用"
}

# 检查 kubectl 是否可用
check_kubectl() {
  if ! command -v kubectl &> /dev/null; then
    echo -e "${RED}错误: kubectl 未安装或不在 PATH 中${NC}"
    exit 1
  fi
}

# 检查 kustomize 是否可用
check_kustomize() {
  if ! command -v kustomize &> /dev/null; then
    echo -e "${RED}错误: kustomize 未安装或不在 PATH 中${NC}"
    exit 1
  fi
}

# 部署应用到 Kubernetes
deploy_app() {
  echo -e "${YELLOW}部署应用到 Kubernetes...${NC}"
  
  # 检查 kubectl 和 kustomize 是否可用
  check_kubectl
  check_kustomize
  
  # 使用 kustomize 部署
  echo -e "${YELLOW}部署应用...${NC}"
  kubectl apply -k k8s/
  
  # 检查部署结果
  if [ $? -eq 0 ]; then
    echo -e "${GREEN}应用部署成功${NC}"
    
    # 等待部署完成
    echo -e "${YELLOW}等待部署完成...${NC}"
    kubectl rollout status deployment/ts-next-template
    
    # 显示 Pod 状态
    echo -e "${YELLOW}Pod 状态:${NC}"
    kubectl get pods -l app=ts-next-template
    
    # 显示服务状态
    echo -e "${YELLOW}服务状态:${NC}"
    kubectl get svc -l app=ts-next-template
  else
    echo -e "${RED}应用部署失败${NC}"
    exit 1
  fi
}

# 主函数
main() {
  # 如果没有参数，显示帮助信息
  if [ $# -eq 0 ]; then
    show_help
    exit 0
  fi
  
  # 处理参数
  while [ $# -gt 0 ]; do
    case "$1" in
      -h|--help)
        show_help
        exit 0
        ;;
      -d|--deploy)
        deploy_app
        ;;
      *)
        echo -e "${RED}错误: 未知选项 $1${NC}"
        show_help
        exit 1
        ;;
    esac
    shift
  done
}

# 执行主函数
main "$@" 