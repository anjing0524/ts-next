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
  echo -e "  -i, --install  安装 Ingress 控制器"
  echo -e "  -u, --uninstall 卸载 Ingress 控制器"
  echo -e ""
  echo -e "${YELLOW}示例:${NC}"
  echo -e "  $0 --install    # 安装 Ingress 控制器"
  echo -e "  $0 --uninstall  # 卸载 Ingress 控制器"
}

# 检查 kubectl 是否可用
check_kubectl() {
  if ! command -v kubectl &> /dev/null; then
    echo -e "${RED}错误: kubectl 未安装或不在 PATH 中${NC}"
    exit 1
  fi
}

# 安装 Ingress 控制器
install_ingress() {
  echo -e "${YELLOW}安装 Ingress 控制器...${NC}"
  
  # 检查 kubectl 是否可用
  check_kubectl
  
  # 创建命名空间
  echo -e "${YELLOW}创建命名空间...${NC}"
  kubectl create namespace ingress-nginx --dry-run=client -o yaml | kubectl apply -f -
  
  # 下载 Ingress 控制器清单
  echo -e "${YELLOW}下载 Ingress 控制器清单...${NC}"
  curl -s https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.8.1/deploy/static/provider/cloud/deploy.yaml > /tmp/ingress-nginx.yaml
  
  # 应用 Ingress 控制器清单
  echo -e "${YELLOW}应用 Ingress 控制器清单...${NC}"
  kubectl apply -f /tmp/ingress-nginx.yaml
  
  # 检查安装结果
  if [ $? -eq 0 ]; then
    echo -e "${GREEN}Ingress 控制器安装成功${NC}"
    
    # 等待 Ingress 控制器就绪
    echo -e "${YELLOW}等待 Ingress 控制器就绪...${NC}"
    kubectl wait --namespace ingress-nginx \
      --for=condition=ready pod \
      --selector=app.kubernetes.io/component=controller \
      --timeout=120s
    
    # 显示 Ingress 控制器状态
    echo -e "${YELLOW}Ingress 控制器状态:${NC}"
    kubectl get pods -n ingress-nginx
    
    # 显示 Ingress 控制器服务
    echo -e "${YELLOW}Ingress 控制器服务:${NC}"
    kubectl get svc -n ingress-nginx
    
    # 获取 Ingress 控制器的外部 IP
    echo -e "${YELLOW}Ingress 控制器的外部 IP:${NC}"
    INGRESS_IP=$(kubectl get svc -n ingress-nginx ingress-nginx-controller -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
    if [ -z "$INGRESS_IP" ]; then
      echo -e "${YELLOW}注意: 无法获取 Ingress 控制器的外部 IP，可能是因为使用了 NodePort 或 ClusterIP 服务类型${NC}"
      echo -e "${YELLOW}请使用以下命令获取 Ingress 控制器的 IP 和端口:${NC}"
      echo -e "${GREEN}kubectl get svc -n ingress-nginx ingress-nginx-controller${NC}"
    else
      echo -e "${GREEN}$INGRESS_IP${NC}"
      
      # 提示用户配置 hosts 文件
      echo -e "${YELLOW}请将以下行添加到您的 /etc/hosts 文件中:${NC}"
      echo -e "${GREEN}$INGRESS_IP ts-next-template.local${NC}"
    fi
  else
    echo -e "${RED}Ingress 控制器安装失败${NC}"
    exit 1
  fi
}

# 卸载 Ingress 控制器
uninstall_ingress() {
  echo -e "${YELLOW}卸载 Ingress 控制器...${NC}"
  
  # 检查 kubectl 是否可用
  check_kubectl
  
  # 下载 Ingress 控制器清单
  echo -e "${YELLOW}下载 Ingress 控制器清单...${NC}"
  curl -s https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.8.1/deploy/static/provider/cloud/deploy.yaml > /tmp/ingress-nginx.yaml
  
  # 删除 Ingress 控制器
  echo -e "${YELLOW}删除 Ingress 控制器...${NC}"
  kubectl delete -f /tmp/ingress-nginx.yaml
  
  # 检查卸载结果
  if [ $? -eq 0 ]; then
    echo -e "${GREEN}Ingress 控制器卸载成功${NC}"
  else
    echo -e "${RED}Ingress 控制器卸载失败${NC}"
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
      -i|--install)
        install_ingress
        ;;
      -u|--uninstall)
        uninstall_ingress
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