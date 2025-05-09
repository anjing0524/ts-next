#!/bin/bash

# 设置颜色
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 默认值
DEFAULT_IMAGE="liushuodocker/ts-next:latest"
NAMESPACE="default"

# 显示帮助信息
show_help() {
  echo -e "${YELLOW}使用方法:${NC}"
  echo -e "  $0 [选项]"
  echo -e ""
  echo -e "${YELLOW}选项:${NC}"
  echo -e "  -h, --help               显示帮助信息"
  echo -e "  -d, --deploy             部署应用到 Kubernetes"
  echo -e "  -i, --image IMAGE        指定要使用的镜像 (默认: $DEFAULT_IMAGE)"
  echo -e "  -n, --namespace NS       指定 Kubernetes 命名空间 (默认: $NAMESPACE)"
  echo -e ""
  echo -e "${YELLOW}示例:${NC}"
  echo -e "  $0 --deploy                     # 使用默认镜像部署应用"
  echo -e "  $0 --deploy --image myapp:v1    # 使用指定镜像部署应用"
}

# 检查 kubectl 是否可用
check_kubectl() {
  if ! command -v kubectl &> /dev/null; then
    echo -e "${RED}错误: kubectl 未安装或不在 PATH 中${NC}"
    exit 1
  fi
}

# 检查命名空间是否存在，如果不存在则创建
check_namespace() {
  if ! kubectl get namespace $NAMESPACE &> /dev/null; then
    echo -e "${YELLOW}命名空间 $NAMESPACE 不存在，正在创建...${NC}"
    kubectl create namespace $NAMESPACE
    if [ $? -ne 0 ]; then
      echo -e "${RED}创建命名空间失败${NC}"
      exit 1
    fi
    echo -e "${GREEN}命名空间 $NAMESPACE 创建成功${NC}"
  else
    echo -e "${GREEN}命名空间 $NAMESPACE 已存在${NC}"
  fi
}

# 验证 Kubernetes 配置文件
validate_config() {
  echo -e "${YELLOW}验证 Kubernetes 配置文件...${NC}"
  
  # 验证 MySQL 配置
  echo -e "${YELLOW}验证 MySQL 配置...${NC}"
  kubectl apply -f k8s/mysql/deployment.yaml --dry-run=client -n $NAMESPACE
  kubectl apply -f k8s/mysql/service.yaml --dry-run=client -n $NAMESPACE
  kubectl apply -f k8s/mysql/pvc.yaml --dry-run=client -n $NAMESPACE
  kubectl apply -f k8s/mysql/secret.yaml --dry-run=client -n $NAMESPACE
  
  # 验证应用配置
  echo -e "${YELLOW}验证应用配置...${NC}"
  kubectl apply -f k8s/app/deployment.yaml --dry-run=client -n $NAMESPACE
  kubectl apply -f k8s/app/service.yaml --dry-run=client -n $NAMESPACE
  kubectl apply -f k8s/app/ingress.yaml --dry-run=client -n $NAMESPACE
  kubectl apply -f k8s/app/pvc.yaml --dry-run=client -n $NAMESPACE
  
  echo -e "${GREEN}配置文件验证成功${NC}"
}

# 部署应用到 Kubernetes
deploy_app() {
  echo -e "${YELLOW}部署应用到 Kubernetes...${NC}"
  
  # 检查 kubectl 是否可用
  check_kubectl
  
  # 检查命名空间
  check_namespace
  
  # 验证配置文件
  validate_config
  
  # 使用 kubectl apply -f 部署
  echo -e "${YELLOW}部署应用和 MySQL...${NC}"
  
  # 部署 MySQL
  echo -e "${YELLOW}部署 MySQL...${NC}"
  kubectl apply -f k8s/mysql/deployment.yaml -n $NAMESPACE
  kubectl apply -f k8s/mysql/service.yaml -n $NAMESPACE
  kubectl apply -f k8s/mysql/pvc.yaml -n $NAMESPACE
  kubectl apply -f k8s/mysql/secret.yaml -n $NAMESPACE
  
  # 部署应用
  echo -e "${YELLOW}部署应用...${NC}"
  
  # 部署应用 PVC
  echo -e "${YELLOW}部署应用 PVC...${NC}"
  kubectl apply -f k8s/app/pvc.yaml -n $NAMESPACE
  
  # 确定要使用的镜像
  IMAGE_TO_USE=$DEFAULT_IMAGE
  echo -e "${YELLOW}使用镜像: $IMAGE_TO_USE${NC}"
  
  # 创建临时部署文件，使用指定的镜像
  TMP_DEPLOYMENT=$(mktemp)
  cat k8s/app/deployment.yaml | sed "s|image: .*|image: $IMAGE_TO_USE|" > $TMP_DEPLOYMENT
  
  kubectl apply -f $TMP_DEPLOYMENT -n $NAMESPACE
  kubectl apply -f k8s/app/service.yaml -n $NAMESPACE
  kubectl apply -f k8s/app/ingress.yaml -n $NAMESPACE
  
  # 删除临时文件
  rm $TMP_DEPLOYMENT
  
  # 检查部署结果
  if [ $? -eq 0 ]; then
    echo -e "${GREEN}应用部署成功${NC}"
    
    # 等待部署完成
    echo -e "${YELLOW}等待部署完成...${NC}"
    kubectl rollout status deployment/ts-next-template -n $NAMESPACE
    
    # 显示 Pod 状态
    echo -e "${YELLOW}Pod 状态:${NC}"
    kubectl get pods -l app=ts-next-template -n $NAMESPACE
    
    # 显示 MySQL Pod 状态
    echo -e "${YELLOW}MySQL Pod 状态:${NC}"
    kubectl get pods -l app=mysql -n $NAMESPACE
    
    # 显示 Ingress 状态
    echo -e "${YELLOW}Ingress 状态:${NC}"
    kubectl get ingress -n $NAMESPACE
    
    # 显示 PVC 状态
    echo -e "${YELLOW}PVC 状态:${NC}"
    kubectl get pvc -n $NAMESPACE
    
    # 显示访问信息
    echo -e "${YELLOW}访问信息:${NC}"
    echo -e "应用可以通过以下地址访问:"
    echo -e "http://ts-next-template.local/datamgr_flow"
    
    # 显示验证命令
    echo -e "${YELLOW}验证命令:${NC}"
    echo -e "./k8s/verify.sh"
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
        DEPLOY=true
        ;;
      -i|--image)
        DEFAULT_IMAGE="$2"
        shift
        ;;
      -n|--namespace)
        NAMESPACE="$2"
        shift
        ;;
      *)
        echo -e "${RED}错误: 未知选项 $1${NC}"
        show_help
        exit 1
        ;;
    esac
    shift
  done
  
  # 执行选定的操作
  if [ "$DEPLOY" = true ]; then
    deploy_app
  else
    show_help
  fi
}

# 执行主函数
main "$@" 