#!/bin/bash

# 设置颜色
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 默认值
NAMESPACE="default"
TIMEOUT=60
RETRY_INTERVAL=5

# 显示帮助信息
show_help() {
  echo -e "${YELLOW}使用方法:${NC}"
  echo -e "  $0 [选项]"
  echo -e ""
  echo -e "${YELLOW}选项:${NC}"
  echo -e "  -h, --help               显示帮助信息"
  echo -e "  -c, --check              检查部署状态"
  echo -e "  -t, --test               测试应用和 MySQL 的连接"
  echo -e "  -f, --fix                尝试修复部署问题"
  echo -e "  -a, --all                执行所有验证"
  echo -e "  -n, --namespace NS       指定 Kubernetes 命名空间 (默认: $NAMESPACE)"
  echo -e "  -w, --wait SECONDS       等待 Pod 就绪的超时时间 (默认: $TIMEOUT)"
  echo -e ""
  echo -e "${YELLOW}示例:${NC}"
  echo -e "  $0 --check                # 仅检查部署状态"
  echo -e "  $0 --test                 # 仅测试连接"
  echo -e "  $0 --fix                  # 尝试修复部署问题"
  echo -e "  $0 --all                  # 执行所有验证"
  echo -e "  $0 --namespace myapp      # 在指定命名空间中执行验证"
}

# 检查 kubectl 是否可用
check_kubectl() {
  if ! command -v kubectl &> /dev/null; then
    echo -e "${RED}错误: kubectl 未安装或不在 PATH 中${NC}"
    exit 1
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

# 等待 Pod 就绪
wait_for_pod() {
  local pod_selector=$1
  local pod_name=$2
  local timeout=$TIMEOUT
  local interval=$RETRY_INTERVAL
  local elapsed=0
  
  echo -e "${YELLOW}等待 $pod_name Pod 就绪...${NC}"
  
  while [ $elapsed -lt $timeout ]; do
    pod_status=$(kubectl get pods -l $pod_selector -n $NAMESPACE -o jsonpath="{.items[0].status.phase}")
    
    if [ "$pod_status" == "Running" ]; then
      echo -e "${GREEN}$pod_name Pod 已就绪${NC}"
      return 0
    fi
    
    echo -e "${YELLOW}等待 $pod_name Pod 就绪... ($elapsed/$timeout 秒)${NC}"
    sleep $interval
    elapsed=$((elapsed + interval))
  done
  
  echo -e "${RED}等待 $pod_name Pod 就绪超时${NC}"
  return 1
}

# 检查部署状态
check_deployment() {
  echo -e "${YELLOW}检查部署状态...${NC}"
  
  # 检查应用 Pod 状态
  echo -e "${YELLOW}应用 Pod 状态:${NC}"
  kubectl get pods -l app=ts-next-template -n $NAMESPACE
  
  # 检查 MySQL Pod 状态
  echo -e "${YELLOW}MySQL Pod 状态:${NC}"
  kubectl get pods -l app=mysql -n $NAMESPACE
  
  # 检查服务状态
  echo -e "${YELLOW}服务状态:${NC}"
  kubectl get svc -l app=ts-next-template -n $NAMESPACE
  kubectl get svc -l app=mysql -n $NAMESPACE
  
  # 检查部署状态
  echo -e "${YELLOW}部署状态:${NC}"
  kubectl get deployments -l app=ts-next-template -n $NAMESPACE
  kubectl get deployments -l app=mysql -n $NAMESPACE
  
  # 检查 Ingress 状态
  echo -e "${YELLOW}Ingress 状态:${NC}"
  kubectl get ingress -n $NAMESPACE
  
  # 检查 PVC 状态
  echo -e "${YELLOW}PVC 状态:${NC}"
  kubectl get pvc -n $NAMESPACE
  
  # 检查是否有 ImagePullBackOff 错误
  IMAGE_PULL_ERROR=$(kubectl get pods -l app=ts-next-template -n $NAMESPACE -o jsonpath='{.items[*].status.containerStatuses[*].state.waiting.reason}' | grep -o "ImagePullBackOff")
  
  if [ ! -z "$IMAGE_PULL_ERROR" ]; then
    echo -e "${RED}检测到 ImagePullBackOff 错误，请使用 --fix 选项尝试修复${NC}"
  fi
  
  # 检查是否有 CrashLoopBackOff 错误
  CRASH_LOOP_ERROR=$(kubectl get pods -l app=ts-next-template -n $NAMESPACE -o jsonpath='{.items[*].status.containerStatuses[*].state.waiting.reason}' | grep -o "CrashLoopBackOff")
  
  if [ ! -z "$CRASH_LOOP_ERROR" ]; then
    echo -e "${RED}检测到 CrashLoopBackOff 错误，请使用 --fix 选项尝试修复${NC}"
  fi
}

# 测试应用和 MySQL 的连接
test_connection() {
  echo -e "${YELLOW}测试应用和 MySQL 的连接...${NC}"
  
  # 获取应用 Pod 名称
  APP_POD=$(kubectl get pods -l app=ts-next-template -n $NAMESPACE -o jsonpath="{.items[0].metadata.name}")
  
  if [ -z "$APP_POD" ]; then
    echo -e "${RED}错误: 未找到应用 Pod${NC}"
    exit 1
  fi
  
  # 等待应用 Pod 就绪
  wait_for_pod "app=ts-next-template" "应用" || {
    echo -e "${RED}应用 Pod 未就绪，无法测试连接${NC}"
    return 1
  }
  
  # 测试应用是否正常运行
  echo -e "${YELLOW}测试应用是否正常运行...${NC}"
  kubectl exec $APP_POD -n $NAMESPACE -- wget -qO- http://localhost:3000/datamgr_flow/api/health || echo "无法连接到应用"
  
  # 测试应用是否可以连接到 MySQL
  echo -e "${YELLOW}测试应用是否可以连接到 MySQL...${NC}"
  kubectl exec $APP_POD -n $NAMESPACE -- wget -qO- http://localhost:3000/datamgr_flow/api/db-test || echo "无法连接到数据库"
  
  # 测试 MySQL 连接
  echo -e "${YELLOW}测试 MySQL 连接...${NC}"
  MYSQL_POD=$(kubectl get pods -l app=mysql -n $NAMESPACE -o jsonpath="{.items[0].metadata.name}")
  
  if [ ! -z "$MYSQL_POD" ]; then
    # 等待 MySQL Pod 就绪
    wait_for_pod "app=mysql" "MySQL" || {
      echo -e "${RED}MySQL Pod 未就绪，无法测试连接${NC}"
      return 1
    }
    
    # 测试 MySQL 是否正常运行
    kubectl exec $MYSQL_POD -n $NAMESPACE -- mysqladmin ping -h localhost -u root -p123456 || echo "MySQL 未正常运行"
  else
    echo -e "${RED}错误: 未找到 MySQL Pod${NC}"
  fi
  
  echo -e "${GREEN}连接测试完成${NC}"
}

# 尝试修复部署问题
fix_deployment() {
  echo -e "${YELLOW}尝试修复部署问题...${NC}"
  
  # 验证配置文件
  validate_config
  
  # 检查是否有 ImagePullBackOff 错误
  IMAGE_PULL_ERROR=$(kubectl get pods -l app=ts-next-template -n $NAMESPACE -o jsonpath='{.items[*].status.containerStatuses[*].state.waiting.reason}' | grep -o "ImagePullBackOff")
  
  if [ ! -z "$IMAGE_PULL_ERROR" ]; then
    echo -e "${YELLOW}检测到 ImagePullBackOff 错误，尝试修复...${NC}"
    
    # 获取部署名称
    DEPLOYMENT_NAME=$(kubectl get deployments -l app=ts-next-template -n $NAMESPACE -o jsonpath="{.items[0].metadata.name}")
    
    # 获取当前镜像
    CURRENT_IMAGE=$(kubectl get deployment $DEPLOYMENT_NAME -n $NAMESPACE -o jsonpath="{.spec.template.spec.containers[0].image}")
    
    echo -e "${YELLOW}当前镜像: $CURRENT_IMAGE${NC}"
    
    # 修改部署使用正确的镜像
    kubectl set image deployment/$DEPLOYMENT_NAME ts-next-template=liushuodocker/ts-next:latest -n $NAMESPACE
    
    # 等待部署更新
    echo -e "${YELLOW}等待部署更新...${NC}"
    kubectl rollout status deployment/$DEPLOYMENT_NAME -n $NAMESPACE
  else
    # 检查是否有 CrashLoopBackOff 错误
    CRASH_LOOP_ERROR=$(kubectl get pods -l app=ts-next-template -n $NAMESPACE -o jsonpath='{.items[*].status.containerStatuses[*].state.waiting.reason}' | grep -o "CrashLoopBackOff")
    
    if [ ! -z "$CRASH_LOOP_ERROR" ]; then
      echo -e "${YELLOW}检测到 CrashLoopBackOff 错误，尝试修复...${NC}"
      
      # 获取部署名称
      DEPLOYMENT_NAME=$(kubectl get deployments -l app=ts-next-template -n $NAMESPACE -o jsonpath="{.items[0].metadata.name}")
      
      # 获取 Pod 名称
      POD_NAME=$(kubectl get pods -l app=ts-next-template -n $NAMESPACE -o jsonpath="{.items[0].metadata.name}")
      
      # 查看 Pod 日志
      echo -e "${YELLOW}查看 Pod 日志...${NC}"
      kubectl logs $POD_NAME -n $NAMESPACE
      
      # 重启部署
      echo -e "${YELLOW}重启部署...${NC}"
      kubectl rollout restart deployment/$DEPLOYMENT_NAME -n $NAMESPACE
      
      # 等待部署更新
      echo -e "${YELLOW}等待部署更新...${NC}"
      kubectl rollout status deployment/$DEPLOYMENT_NAME -n $NAMESPACE
      
      # 检查修复结果
      echo -e "${YELLOW}检查修复结果...${NC}"
      kubectl get pods -l app=ts-next-template -n $NAMESPACE
    else
      echo -e "${YELLOW}未检测到已知错误，尝试重启部署...${NC}"
      
      # 获取部署名称
      DEPLOYMENT_NAME=$(kubectl get deployments -l app=ts-next-template -n $NAMESPACE -o jsonpath="{.items[0].metadata.name}")
      
      # 重启部署
      kubectl rollout restart deployment/$DEPLOYMENT_NAME -n $NAMESPACE
      
      # 等待部署更新
      echo -e "${YELLOW}等待部署更新...${NC}"
      kubectl rollout status deployment/$DEPLOYMENT_NAME -n $NAMESPACE
    fi
  fi
  
  echo -e "${GREEN}修复尝试完成${NC}"
}

# 主函数
main() {
  # 如果没有参数，显示帮助信息
  if [ $# -eq 0 ]; then
    show_help
    exit 0
  fi
  
  # 检查 kubectl 是否可用
  check_kubectl
  
  # 处理参数
  while [ $# -gt 0 ]; do
    case "$1" in
      -h|--help)
        show_help
        exit 0
        ;;
      -c|--check)
        CHECK=true
        ;;
      -t|--test)
        TEST=true
        ;;
      -f|--fix)
        FIX=true
        ;;
      -a|--all)
        CHECK=true
        TEST=true
        ;;
      -n|--namespace)
        NAMESPACE="$2"
        shift
        ;;
      -w|--wait)
        TIMEOUT="$2"
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
  if [ "$CHECK" = true ]; then
    check_deployment
  fi
  
  if [ "$TEST" = true ]; then
    test_connection
  fi
  
  if [ "$FIX" = true ]; then
    fix_deployment
  fi
  
  # 如果没有选择任何操作，显示帮助信息
  if [ "$CHECK" != true ] && [ "$TEST" != true ] && [ "$FIX" != true ]; then
    show_help
  fi
}

# 执行主函数
main "$@" 