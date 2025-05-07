#!/bin/bash

set -e

# 设置变量
DOCKER_CONTAINER="mysql-container"  # 源 Docker 容器名称
BACKUP_FILE="mysql_backup_$(date +%Y%m%d_%H%M%S).sql"
LOG_FILE="mysql_migration_$(date +%Y%m%d_%H%M%S).log"
K8S_NAMESPACE="default"
MYSQL_ROOT_PASSWORD="123456"  # MySQL root 密码

# 初始化日志
function log() {
  echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}

log "开始数据迁移..."

# 从 Docker 容器导出数据
log "从 Docker 容器导出数据..."
docker exec $DOCKER_CONTAINER mysqldump -u root -p"$MYSQL_ROOT_PASSWORD" --databases dataalchemist > "$BACKUP_FILE" || {
  log "导出数据失败！"
  exit 1
}

# 等待 Kubernetes MySQL Pod 就绪
log "等待 Kubernetes MySQL Pod 就绪..."
kubectl wait --for=condition=ready pod -l app=mysql --timeout=300s || {
  log "等待 MySQL Pod 就绪超时！"
  exit 1
}

# 获取 MySQL Pod 名称
MYSQL_POD=$(kubectl get pod -l app=mysql -o jsonpath="{.items[0].metadata.name}")
if [ -z "$MYSQL_POD" ]; then
  log "无法获取 MySQL Pod 名称！"
  exit 1
fi

# 在 Pod 中导入数据
log "导入数据..."
cat "$BACKUP_FILE" | kubectl exec -i $MYSQL_POD -- mysql -u root -p"$MYSQL_ROOT_PASSWORD" dataalchemist || {
  log "导入数据失败！"
  exit 1
}

# 清理临时文件
log "清理临时文件..."
rm "$BACKUP_FILE"

log "数据迁移完成！"