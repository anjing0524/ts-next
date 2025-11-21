# 灾难恢复和高可用性设计

**文档版本**: 1.0
**创建日期**: 2025-11-21
**适用版本**: v1.0 及以上
**文档所有者**: 运维团队、架构团队

---

## 目录

1. [概述](#概述)
2. [高可用架构](#高可用架构)
3. [故障检测](#故障检测)
4. [自动故障转移](#自动故障转移)
5. [数据保护和恢复](#数据保护和恢复)
6. [RTO/RPO 验证](#rtorpo-验证)
7. [运维流程](#运维流程)
8. [监控和告警](#监控和告警)

---

## 概述

### 目标

实现 **99.9% 可用性 SLA**，确保：
- **RTO (恢复时间目标)**: < 15 分钟
- **RPO (恢复点目标)**: < 5 分钟
- **月故障时间**: < 43.2 分钟

### 高可用原则

```
三故障转移原则:
1. 无单点故障 - 关键组件 3 副本+ 部署
2. 自动检测和响应 - 30 秒内检测故障
3. 数据一致性保证 - 主从复制 + 备份验证
```

---

## 高可用架构

### 架构图

```
┌─────────────────────────────────────────────────────────────┐
│                    负载均衡器 (LB)                          │
│                  (Health Check: 10s)                        │
└─────────────────┬──────────────┬──────────────┬─────────────┘
                  │              │              │
        ┌─────────▼──────┐  ┌────▼─────────┐  ┌─▼──────────────┐
        │ OAuth Service  │  │ OAuth Service │  │ OAuth Service  │
        │   Instance 1   │  │  Instance 2   │  │  Instance 3    │
        │  (Active)      │  │  (Standby)    │  │  (Standby)     │
        └─────────┬──────┘  └────┬─────────┘  └──┬───────────────┘
                  │              │              │
                  └──────────────┬──────────────┘
                                 │
                    ┌────────────┴─────────────┐
                    │                          │
            ┌───────▼──────┐          ┌────────▼──────┐
            │ PostgreSQL   │◄────────►│ PostgreSQL    │
            │   Primary    │ 同步复制 │   Secondary   │
            └───────┬──────┘          └────────┬──────┘
                    │                          │
                    └──────────────┬───────────┘
                                   │
                            ┌──────▼──────┐
                            │  Backup     │
                            │  (6h cycle) │
                            └─────────────┘
```

### 部署配置

#### Kubernetes 配置

```yaml
# deployment.yaml
kind: Deployment
metadata:
  name: oauth-service
spec:
  replicas: 3  # 最少 3 副本
  selector:
    matchLabels:
      app: oauth-service
  template:
    metadata:
      labels:
        app: oauth-service
    spec:
      containers:
      - name: oauth-service
        image: oauth-service:v1.0
        ports:
        - containerPort: 8080

        # 健康检查
        livenessProbe:
          httpGet:
            path: /health/live
            port: 8080
          initialDelaySeconds: 30
          periodSeconds: 10
          timeoutSeconds: 5
          failureThreshold: 3

        readinessProbe:
          httpGet:
            path: /health/ready
            port: 8080
          initialDelaySeconds: 10
          periodSeconds: 5
          timeoutSeconds: 3
          failureThreshold: 2

        # 资源限制
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "1Gi"
            cpu: "1000m"

      # Pod 反亲和性 - 分散部署
      affinity:
        podAntiAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
          - weight: 100
            podAffinityTerm:
              labelSelector:
                matchExpressions:
                - key: app
                  operator: In
                  values:
                  - oauth-service
              topologyKey: kubernetes.io/hostname

---
kind: Service
metadata:
  name: oauth-service
spec:
  selector:
    app: oauth-service
  ports:
  - protocol: TCP
    port: 80
    targetPort: 8080
  type: LoadBalancer

---
kind: PodDisruptionBudget
metadata:
  name: oauth-service-pdb
spec:
  minAvailable: 2  # 最少保持 2 个副本可用
  selector:
    matchLabels:
      app: oauth-service
```

---

## 故障检测

### 健康检查指标

| 检查项 | 方法 | 频率 | 超时 | 失败阈值 |
|--------|------|------|------|---------|
| **活跃性检查** | GET /health/live | 10s | 5s | 3 次 |
| **就绪性检查** | GET /health/ready | 5s | 3s | 2 次 |
| **数据库连接** | SQL ping | 30s | 10s | 3 次 |
| **缓存可用性** | Redis ping | 30s | 5s | 3 次 |

### Health Endpoint 实现

```rust
// src/routes/health.rs

#[get("/health/live")]
pub async fn health_live(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    // 检查服务是否正在运行（轻量级）
    Json(json!({
        "status": "alive",
        "timestamp": Utc::now().to_rfc3339()
    }))
}

#[get("/health/ready")]
pub async fn health_ready(State(state): State<Arc<AppState>>) -> Result<impl IntoResponse, AppError> {
    // 检查所有依赖是否就绪

    // 1. 数据库连接检查
    state.db_pool.get_connection().await?;

    // 2. 缓存可用性检查
    state.cache.ping().await?;

    // 3. 必要的配置检查
    if state.jwt_key.is_none() {
        return Err(AppError::Service("JWT key not configured".into()));
    }

    Ok(Json(json!({
        "status": "ready",
        "timestamp": Utc::now().to_rfc3339(),
        "components": {
            "database": "healthy",
            "cache": "healthy",
            "config": "healthy"
        }
    })))
}
```

---

## 自动故障转移

### 故障转移流程

```
故障检测（30s）
    ↓
故障确认（重试 3 次）
    ↓
触发告警 (Prometheus alert)
    ↓
驱逐故障 Pod
    ↓
Kubernetes 调度新 Pod
    ↓
新 Pod 执行就绪检查（< 1 分钟）
    ↓
LB 开始转发流量
    ↓
数据一致性检查（< 5 分钟）
    ↓
故障转移完成
```

### 告警规则配置

```yaml
# prometheus-rules.yaml
groups:
- name: oauth-service-alerts
  rules:

  # Pod 崩溃告警
  - alert: OAuthServicePodCrashing
    expr: rate(kube_pod_container_status_restarts_total{pod=~"oauth-service-.*"}[15m]) > 0.1
    for: 5m
    labels:
      severity: critical
    annotations:
      summary: "OAuth Service pod {{ $labels.pod }} is crashing"
      action: "Check pod logs: kubectl logs {{ $labels.pod }}"

  # 健康检查失败告警
  - alert: OAuthServiceUnhealthy
    expr: up{job="oauth-service"} == 0
    for: 1m
    labels:
      severity: critical
    annotations:
      summary: "OAuth Service is unhealthy"
      action: "Run: kubectl describe pod oauth-service-xxx"

  # 数据库连接失败
  - alert: DatabaseConnectionFailed
    expr: oauth_db_connection_errors_total > 10
    for: 5m
    labels:
      severity: warning
    annotations:
      summary: "Database connection errors detected"
      action: "Check database status and connectivity"
```

---

## 数据保护和恢复

### 备份策略

| 备份类型 | 频率 | 保留期 | 验证周期 | 恢复时间 |
|---------|------|--------|---------|---------|
| **增量备份** | 每 6 小时 | 7 天 | 每日 | < 2 分钟 |
| **全量备份** | 每 24 小时 | 30 天 | 每周 | < 10 分钟 |
| **归档备份** | 每 7 天 | 2 年 | 每月 | < 30 分钟 |

### 数据库主从复制

```sql
-- 主库配置
ALTER SYSTEM SET wal_level = replica;
ALTER SYSTEM SET max_wal_senders = 10;
ALTER SYSTEM SET wal_keep_segments = 64;
SELECT pg_reload_conf();

-- 创建复制用户
CREATE USER replicator WITH REPLICATION PASSWORD 'secure_password';
GRANT CONNECT ON DATABASE oauth TO replicator;

-- 从库配置
-- 1. 从主库创建基础备份
pg_basebackup -h primary.db.local -D /var/lib/postgresql/data -U replicator -v -P

-- 2. 配置恢复参数
CREATE recovery.conf 文件
primary_conninfo = 'host=primary.db.local port=5432 user=replicator password=xxx'
standby_mode = 'on'
restore_command = 'cp /wal_archive/%f %p'
```

### 备份验证

```bash
#!/bin/bash
# backup-verification.sh

# 每天自动验证备份完整性
BACKUP_DIR="/backups/oauth"
LOG_FILE="/var/log/backup-verification.log"

# 1. 检查最新备份是否存在
LATEST_BACKUP=$(ls -t $BACKUP_DIR | head -n 1)
if [ -z "$LATEST_BACKUP" ]; then
  echo "$(date): ERROR - No backup found" >> $LOG_FILE
  exit 1
fi

# 2. 验证备份文件完整性（MD5）
cd $BACKUP_DIR
md5sum -c backup.md5 >> $LOG_FILE 2>&1
if [ $? -ne 0 ]; then
  echo "$(date): ERROR - Backup integrity check failed" >> $LOG_FILE
  # 发送告警
  curl -X POST https://alerts.example.com/backup-failed
  exit 1
fi

# 3. 在沙箱环境还原并验证
restore-and-test-backup.sh >> $LOG_FILE 2>&1

echo "$(date): OK - Backup verification passed" >> $LOG_FILE
```

---

## RTO/RPO 验证

### RPO 验证（< 5 分钟）

```rust
// src/services/recovery_verification.rs

pub struct RecoveryVerification {
    last_successful_backup: DateTime<Utc>,
    current_time: DateTime<Utc>,
}

impl RecoveryVerification {
    pub fn verify_rpo(&self) -> Result<(), String> {
        let rpo_limit = Duration::minutes(5);
        let time_since_backup = self.current_time - self.last_successful_backup;

        if time_since_backup > rpo_limit {
            return Err(format!(
                "RPO violation: {} > {}",
                time_since_backup, rpo_limit
            ));
        }
        Ok(())
    }
}

// 定期验证任务（每 2 分钟运行）
#[tokio::main]
async fn verify_rpo_continuously() {
    loop {
        tokio::time::sleep(Duration::from_secs(120)).await;

        let verification = RecoveryVerification {
            last_successful_backup: get_last_backup_time().await,
            current_time: Utc::now(),
        };

        match verification.verify_rpo() {
            Ok(_) => tracing::info!("RPO check passed"),
            Err(e) => {
                tracing::error!("RPO violation: {}", e);
                send_alert(&e).await;
            }
        }
    }
}
```

### RTO 验证（< 15 分钟）

故障转移流程中的时间检查点：

```
故障检测: 30s
  ├─ LB 检测到故障: 10s
  └─ 确认故障: 20s

故障隔离: 2min
  ├─ 驱逐故障 Pod: 30s
  └─ 清理资源: 90s

新实例启动: 8min
  ├─ Scheduler 调度: 1m
  ├─ 容器拉取镜像: 2m
  ├─ 应用启动: 2m
  └─ 健康检查就绪: 3m

LB 转发流量: 1min
  └─ 总计: ~12 分钟 ✅ < 15 分钟
```

---

## 运维流程

### 故障演练

每月进行一次故障演练以验证恢复能力：

```bash
# 演练脚本：chaos-engineering-test.sh

#!/bin/bash

echo "=== OAuth Service Chaos Engineering Test ==="

# 场景 1: 终止一个 Pod
echo "Test 1: Kill one pod..."
kubectl delete pod oauth-service-0
sleep 30
verify-pod-recovery.sh

# 场景 2: 模拟数据库故障（readonly mode）
echo "Test 2: Database readonly..."
kubectl exec -it postgres-0 -- psql -c "ALTER DATABASE oauth SET default_transaction_read_only=on;"
sleep 60
verify-database-failover.sh
kubectl exec -it postgres-0 -- psql -c "ALTER DATABASE oauth SET default_transaction_read_only=off;"

# 场景 3: 网络分区（Chaos Mesh）
echo "Test 3: Network partition..."
kubectl apply -f chaos-network-partition.yaml
sleep 120
verify-network-recovery.sh
kubectl delete -f chaos-network-partition.yaml

echo "=== Chaos Test Complete ==="
```

### 恢复手册（Runbook）

**场景: 一个 Pod 频繁崩溃**

```
1. 检查 Pod 日志
   kubectl logs oauth-service-0

2. 检查事件
   kubectl describe pod oauth-service-0

3. 如果是内存不足:
   kubectl set resources deployment oauth-service --limits memory=2Gi

4. 如果是磁盘不足:
   kubectl exec oauth-service-0 -- df -h /tmp

5. 强制重启
   kubectl rollout restart deployment/oauth-service

6. 验证恢复
   kubectl get pods oauth-service-*
   kubectl logs oauth-service-0
```

---

## 监控和告警

### 关键指标

```
红色指标（SRE Golden Signals）:
1. Latency - API p95 响应时间 < 100ms
2. Traffic - 请求吞吐量 > 8,000 TPS (healthy)
3. Errors - 错误率 < 0.1%
4. Saturation - CPU < 70%, Memory < 80%

系统可用性:
- Uptime: 99.9% (目标)
- MTBF (平均故障间隔): > 30 天
- MTTR (平均修复时间): < 15 分钟
```

### 告警通知

```
严重级别告警 → Slack + PagerDuty
  ├─ 立即通知 on-call 工程师
  └─ 自动创建事件单

警告级别告警 → Slack + Email
  ├─ 记录日志
  └─ 晨会讨论

信息级别告警 → Prometheus dashboard
  └─ 趋势分析
```

---

**文档状态**: ✅ 已发布
**下一版本**: 2026-02-20
**维护者**: 运维团队
