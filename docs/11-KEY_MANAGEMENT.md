# 密钥管理策略设计

**文档版本**: 1.0
**创建日期**: 2025-11-21
**适用版本**: v1.0 及以上
**所有者**: 安全团队、基础设施团队
**相关需求**: FR-010 (密钥管理策略)

---

## 目录

1. [概述](#概述)
2. [密钥分类](#密钥分类)
3. [密钥生命周期](#密钥生命周期)
4. [存储安全](#存储安全)
5. [轮换策略](#轮换策略)
6. [实现架构](#实现架构)
7. [操作流程](#操作流程)
8. [监控和审计](#监控和审计)

---

## 概述

### 设计目标

```
1. 全生命周期管理 - 生成、激活、轮换、撤销、销毁
2. 安全存储 - 加密存储，最小暴露
3. 无停机轮换 - 支持新旧密钥并存期
4. 完整可追溯性 - 所有操作审计记录
5. 自动化管理 - 定时轮换，自动化部署
```

### 安全原则

```
- 最小需知 - 仅在必要时期存储和使用密钥
- 防护深度 - 多层防护（加密、访问控制、审计）
- 定期轮换 - 及时发现和限制泄露影响
- 应急响应 - 快速撤销和替换能力
```

---

## 密钥分类

### 1. JWT 签名密钥 (JWT Signing Keys)

**用途**: OAuth 2.1 Token 签名和验证

**类型**: RSA-2048 / ES256 (ECDSA)

**生成方式**:
```bash
# RSA-2048
openssl genrsa -out private_key.pem 2048
openssl rsa -in private_key.pem -pubout -out public_key.pem

# ECDSA P-256
openssl ecparam -name prime256v1 -genkey -noout -out private_key.pem
openssl ec -in private_key.pem -pubout -out public_key.pem
```

**轮换周期**: 90 天

**并存期**: 30 天（旧密钥继续验证，但新 Token 用新密钥签名）

**存储位置**: 密钥管理系统 (KMS) / HashiCorp Vault

**访问权限**: 仅 OAuth 服务

---

### 2. OAuth 客户端密钥 (Client Secrets)

**用途**: 客户端认证（confidential clients）

**类型**: bcrypt hashed secret (存储) + random secret (下发)

**生成方式**:
```rust
// 生成随机密钥
fn generate_client_secret() -> String {
    use rand::Rng;
    const CHARSET: &[u8] = b"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
    let mut rng = rand::thread_rng();
    (0..64)
        .map(|_| CHARSET[rng.gen_range(0..CHARSET.len())] as char)
        .collect()
}

// 存储时 bcrypt hash
let hashed = bcrypt::hash(&secret, bcrypt::DEFAULT_COST)?;
```

**轮换周期**: 180 天（自动轮换，通知客户端）

**并存期**: 7 天（同时支持旧密钥和新密钥）

**存储位置**: 数据库加密列 + KMS 加密

**访问权限**: OAuth 服务、管理员

---

### 3. 数据库加密密钥 (Database Encryption Keys)

**用途**: 敏感数据（密钥、密码、PII）加密存储

**类型**: AES-256-GCM

**生成方式**:
```rust
use aes_gcm::{Aes256Gcm, Key};
use rand::RngCore;

fn generate_db_encryption_key() -> Key<Aes256Gcm> {
    let mut key_bytes = [0u8; 32];  // 256 bits
    let mut rng = rand::OsRng;
    rng.fill_bytes(&mut key_bytes);
    Key::<Aes256Gcm>::from(key_bytes)
}
```

**轮换周期**: 365 天

**并存期**: 90 天（需要支持以旧密钥加密的数据解密）

**存储位置**: AWS KMS / 密钥管理系统

**访问权限**: 数据库应用用户

---

### 4. Session 加密密钥 (Session Encryption Keys)

**用途**: Cookie / Session 加密

**类型**: ChaCha20-Poly1305 / AES-256-GCM

**生成方式**:
```rust
use chacha20poly1305::{Key, ChaCha20Poly1305};
use rand::RngCore;

fn generate_session_key() -> Key {
    let mut key_bytes = [0u8; 32];
    let mut rng = rand::OsRng;
    rng.fill_bytes(&mut key_bytes);
    Key::from(key_bytes)
}
```

**轮换周期**: 30 天

**并存期**: 3 天

**存储位置**: 环境变量 (Kubernetes Secrets) / 密钥管理系统

**访问权限**: Web 应用服务

---

## 密钥生命周期

### 总体流程

```
[1] 生成 ────→ [2] 版本化 ────→ [3] 验证 ────→ [4] 激活
                              ↓              ↓
                         KMS 存储      新 Token 使用

   ┌─────────────────────────────────────┐
   │      新旧密钥并存期 (Overlap)       │
   │  - 新密钥签名新 Token                │
   │  - 旧密钥验证现有 Token              │
   │  - 时长取决于密钥类型                │
   └─────────────────────────────────────┘

[5] 过期 ─────→ [6] 归档 ──────→ [7] 销毁 (6 个月后)
   (轮换)        (加密保存)        (销毁记录保留)
```

### 状态定义

```rust
pub enum KeyStatus {
    Generated,      // 已生成，未激活
    Active,         // 当前活跃密钥，用于签名
    Deprecated,     // 已弃用，仅用于验证
    Archived,       // 已归档，仅用于数据恢复
    Destroyed,      // 已销毁（仅保留审计记录）
}

pub struct KeyMetadata {
    pub key_id: String,
    pub key_type: KeyType,
    pub algorithm: String,
    pub status: KeyStatus,
    pub version: u32,
    pub created_at: DateTime<Utc>,
    pub activated_at: Option<DateTime<Utc>>,
    pub rotated_at: Option<DateTime<Utc>>,
    pub expires_at: DateTime<Utc>,
    pub destroyed_at: Option<DateTime<Utc>>,
    pub created_by: String,
}
```

### JWT 密钥轮换流程 (示例)

```
Day 1 (轮换启动):
  ├─ 生成新的 RSA-2048 密钥对
  ├─ 存储到 KMS (状态: Generated)
  ├─ 验证密钥功能
  └─ 记录审计日志

Day 2-30 (并存期):
  ├─ 新密钥用于签名新 Token (v2)
  ├─ 旧密钥继续验证现有 Token (v1)
  ├─ 监控：确认客户端已适配新密钥
  └─ 审计：记录两个密钥的使用情况

Day 31 (转入已弃用):
  ├─ 旧密钥状态改为 Deprecated
  ├─ 旧密钥仅用于验证，不再签名
  ├─ 继续保留 60 天（某些 token 有效期长）
  └─ 记录审计日志

Day 91 (归档):
  ├─ 旧密钥状态改为 Archived
  ├─ 存储到冷备份
  ├─ 停止在运行时使用
  └─ 仅用于特殊恢复场景

Day 271 (销毁):
  ├─ 密钥安全销毁
  ├─ 保留销毁证明
  └─ 归档记录（仅审计日志）
```

---

## 存储安全

### KMS 集成

#### AWS KMS 配置

```rust
// src/services/kms.rs

use aws_sdk_kms::{Client, types::KeyMetadata};
use aws_kms_encryptor::Encryptor;

pub struct KmsKeyManager {
    kms_client: Client,
    key_alias: String,  // alias/oauth-jwt-key
    region: String,
}

impl KmsKeyManager {
    pub async fn encrypt_key(&self, key_data: &[u8]) -> Result<Vec<u8>, KmsError> {
        let response = self.kms_client
            .encrypt()
            .key_id(&self.key_alias)
            .plaintext(Blob::new(key_data))
            .send()
            .await?;

        Ok(response.ciphertext_blob.unwrap().into_inner())
    }

    pub async fn decrypt_key(&self, encrypted_data: &[u8]) -> Result<Vec<u8>, KmsError> {
        let response = self.kms_client
            .decrypt()
            .ciphertext_blob(Blob::new(encrypted_data))
            .send()
            .await?;

        Ok(response.plaintext.unwrap().into_inner())
    }

    pub async fn rotate_key(&self) -> Result<(), KmsError> {
        self.kms_client
            .enable_key_rotation()
            .key_id(&self.key_alias)
            .send()
            .await?;

        Ok(())
    }
}
```

#### HashiCorp Vault 配置

```rust
// src/services/vault_manager.rs

use vaultrs::{client::VaultClient, kv2};

pub struct VaultKeyManager {
    client: VaultClient,
    mount: String,      // secret/oauth-keys
}

impl VaultKeyManager {
    pub async fn store_key(
        &self,
        key_id: &str,
        key_data: &[u8],
        metadata: &KeyMetadata,
    ) -> Result<(), VaultError> {
        let secret_path = format!("jwt-keys/{}", key_id);
        let mut secret_data = HashMap::new();

        secret_data.insert(
            "key".to_string(),
            base64::encode(key_data).into(),
        );
        secret_data.insert(
            "algorithm".to_string(),
            metadata.algorithm.clone().into(),
        );
        secret_data.insert(
            "version".to_string(),
            metadata.version.to_string().into(),
        );

        kv2::set(
            &self.client,
            &self.mount,
            &secret_path,
            &secret_data,
        )
        .await?;

        Ok(())
    }

    pub async fn retrieve_key(&self, key_id: &str) -> Result<Vec<u8>, VaultError> {
        let secret_path = format!("jwt-keys/{}", key_id);
        let secret = kv2::read(
            &self.client,
            &self.mount,
            &secret_path,
        )
        .await?;

        let encoded = secret
            .data
            .data
            .get("key")
            .and_then(|v| v.as_str())
            .ok_or_else(|| VaultError::Other("Key not found".into()))?;

        base64::decode(encoded).map_err(|e| VaultError::Other(e.into()))
    }

    pub async fn list_keys(&self) -> Result<Vec<String>, VaultError> {
        kv2::list(&self.client, &self.mount, "jwt-keys").await
    }
}
```

### 环境变量管理

```yaml
# kubernetes/secrets.yaml - 不提交到 Git

apiVersion: v1
kind: Secret
metadata:
  name: oauth-keys
  namespace: production
type: Opaque
stringData:
  # Session 密钥 (ChaCha20)
  SESSION_ENCRYPTION_KEY: "base64-encoded-key"
  SESSION_KEY_VERSION: "1"

  # KMS 配置
  AWS_KMS_KEY_ID: "arn:aws:kms:region:account:key/key-id"
  AWS_REGION: "us-east-1"

  # Vault 配置
  VAULT_ADDR: "https://vault.internal:8200"
  VAULT_TOKEN: "s.xxxxxxxxxxxxx"  # 使用 Kubernetes auth, 不使用此字段
  VAULT_MOUNT: "secret"

---
apiVersion: v1
kind: ConfigMap
metadata:
  name: oauth-key-config
  namespace: production
data:
  key_rotation_schedule: "0 0 * * 0"  # 每周日午夜
  jwt_key_rotation_days: "90"
  client_secret_rotation_days: "180"
  session_key_rotation_days: "30"
  key_overlap_days: "30"
```

---

## 轮换策略

### 自动轮换流程

```rust
// src/jobs/key_rotation.rs

use tokio_cron_scheduler::{Job, JobScheduler};
use std::sync::Arc;

pub struct KeyRotationManager {
    scheduler: JobScheduler,
    kms_manager: Arc<KmsKeyManager>,
    db_pool: Arc<DbPool>,
    notification_service: Arc<NotificationService>,
}

impl KeyRotationManager {
    pub async fn start(&mut self) -> Result<(), Box<dyn std::error::Error>> {
        // JWT 密钥轮换: 每 90 天
        let jwt_job = Job::new_async("0 0 * * 0", |_uuid, _l| {
            Box::pin(async {
                if let Err(e) = rotate_jwt_keys().await {
                    tracing::error!("JWT key rotation failed: {}", e);
                }
            })
        })?;
        self.scheduler.add(jwt_job).await?;

        // 客户端密钥轮换: 每 180 天
        let client_job = Job::new_async("0 1 1 * *", |_uuid, _l| {
            Box::pin(async {
                if let Err(e) = rotate_client_secrets().await {
                    tracing::error!("Client secret rotation failed: {}", e);
                }
            })
        })?;
        self.scheduler.add(client_job).await?;

        // Session 密钥轮换: 每 30 天
        let session_job = Job::new_async("0 2 * * 0", |_uuid, _l| {
            Box::pin(async {
                if let Err(e) = rotate_session_keys().await {
                    tracing::error!("Session key rotation failed: {}", e);
                }
            })
        })?;
        self.scheduler.add(session_job).await?;

        // 密钥销毁: 每月检查 (销毁 > 270 天的已弃用密钥)
        let destroy_job = Job::new_async("0 3 1 * *", |_uuid, _l| {
            Box::pin(async {
                if let Err(e) = destroy_expired_keys().await {
                    tracing::error!("Key destruction failed: {}", e);
                }
            })
        })?;
        self.scheduler.add(destroy_job).await?;

        self.scheduler.start().await?;
        Ok(())
    }
}

pub async fn rotate_jwt_keys(
    kms_manager: &Arc<KmsKeyManager>,
    db_pool: &Arc<DbPool>,
) -> Result<(), AppError> {
    tracing::info!("Starting JWT key rotation");

    // 1. 生成新密钥
    let private_key = rsa::RsaPrivateKey::new(&mut rand::thread_rng(), 2048)?;
    let public_key = rsa::RsaPublicKey::from(&private_key);

    let private_pem = private_key.to_pkcs8_pem(rsa::pkcs8::LineEnding::LF)?;
    let public_pem = public_key.to_pkcs1_pem(rsa::pkcs1::LineEnding::LF)?;

    // 2. 存储到 KMS
    let key_id = uuid::Uuid::new_v4().to_string();
    kms_manager.encrypt_key(private_pem.as_bytes()).await?;

    // 3. 更新数据库
    db_pool
        .insert_key(KeyMetadata {
            key_id: key_id.clone(),
            key_type: KeyType::JwtSigning,
            algorithm: "RSA-2048".to_string(),
            status: KeyStatus::Generated,
            version: get_next_version().await?,
            created_at: Utc::now(),
            activated_at: None,
            expires_at: Utc::now() + Duration::days(90),
            ..Default::default()
        })
        .await?;

    // 4. 验证新密钥
    let test_data = b"test";
    let signature = private_key.sign(rsa::padding::Pkcs1v15Sign::new::<sha2::Sha256>(), test_data)?;
    public_key.verify(rsa::padding::Pkcs1v15Sign::new::<sha2::Sha256>(), test_data, &signature)?;

    tracing::info!("JWT key rotation completed: {}", key_id);

    // 5. 通知管理员
    send_notification(
        "JWT Key Rotation",
        &format!("New JWT signing key {} generated and activated", key_id),
    ).await?;

    Ok(())
}

pub async fn rotate_client_secrets(
    db_pool: &Arc<DbPool>,
    notification: &Arc<NotificationService>,
) -> Result<(), AppError> {
    tracing::info!("Starting client secret rotation");

    let clients = db_pool.get_clients_for_rotation().await?;

    for client in clients {
        // 1. 生成新密钥
        let new_secret = generate_client_secret();
        let new_hashed = bcrypt::hash(&new_secret, bcrypt::DEFAULT_COST)?;

        // 2. 更新数据库 (支持新旧并存)
        db_pool
            .update_client_secret(
                &client.id,
                &new_hashed,
                Some(&client.client_secret_hash),  // 保留旧密钥
            )
            .await?;

        // 3. 通知客户端
        notification
            .notify_client_secret_rotation(&client, &new_secret)
            .await?;

        tracing::info!("Client {} secret rotated", client.id);
    }

    Ok(())
}
```

### 轮换验证

```rust
pub async fn validate_key_rotation(
    key_id: &str,
    db_pool: &Arc<DbPool>,
) -> Result<RotationValidation, AppError> {
    let key_metadata = db_pool.get_key_metadata(key_id).await?;

    let mut validation = RotationValidation::default();

    // 1. 检查密钥是否已激活
    if key_metadata.activated_at.is_some() {
        validation.is_activated = true;
    }

    // 2. 检查是否成功替换旧密钥
    let old_keys = db_pool
        .get_keys_by_type_and_status(
            &key_metadata.key_type,
            &[KeyStatus::Deprecated, KeyStatus::Archived],
        )
        .await?;

    validation.old_keys_count = old_keys.len();

    // 3. 监控使用情况
    let usage_stats = db_pool
        .get_key_usage_stats(key_id, Duration::days(7))
        .await?;

    validation.usage_count = usage_stats.count;
    validation.last_used = usage_stats.last_used;

    // 4. 验证性能影响
    let latency_p95 = db_pool
        .get_operation_latency_percentile(key_id, 95)
        .await?;

    validation.latency_p95_ms = latency_p95;
    validation.is_healthy = latency_p95 < 50;  // < 50ms

    Ok(validation)
}
```

---

## 实现架构

### 密钥缓存策略

```rust
// src/cache/key_cache.rs

pub struct KeyCache {
    // 内存缓存 (带 TTL)
    active_keys: Arc<Mutex<HashMap<String, (KeyData, Instant)>>>,
    ttl: Duration,
    kms_manager: Arc<KmsKeyManager>,
}

impl KeyCache {
    pub async fn get_active_key(&self, key_type: &KeyType) -> Result<KeyData, AppError> {
        let mut cache = self.active_keys.lock().await;

        let cache_key = format!("active_{:?}", key_type);

        // 检查缓存是否有效
        if let Some((key_data, created_at)) = cache.get(&cache_key) {
            if created_at.elapsed() < self.ttl {
                return Ok(key_data.clone());
            }
        }

        // 缓存过期，从 KMS 重新加载
        let key_data = self.kms_manager.get_active_key(key_type).await?;
        cache.insert(cache_key, (key_data.clone(), Instant::now()));

        Ok(key_data)
    }

    pub async fn invalidate(&self, key_type: &KeyType) {
        let mut cache = self.active_keys.lock().await;
        let cache_key = format!("active_{:?}", key_type);
        cache.remove(&cache_key);
    }
}
```

### 密钥版本管理

```rust
// src/services/key_versioning.rs

pub struct KeyVersionManager {
    db_pool: Arc<DbPool>,
}

impl KeyVersionManager {
    /// 获取所有有效的密钥版本（用于验证）
    pub async fn get_valid_keys(
        &self,
        key_type: &KeyType,
    ) -> Result<Vec<KeyVersion>, AppError> {
        let keys = self.db_pool
            .get_keys_by_type(key_type)
            .await?;

        // 返回 Active 和 Deprecated 状态的密钥（验证时用）
        Ok(keys
            .iter()
            .filter(|k| {
                k.status == KeyStatus::Active || k.status == KeyStatus::Deprecated
            })
            .map(|k| KeyVersion {
                key_id: k.key_id.clone(),
                version: k.version,
                algorithm: k.algorithm.clone(),
                public_key: k.public_key.clone(),
            })
            .collect())
    }

    /// 获取主动密钥（用于签名）
    pub async fn get_signing_key(
        &self,
        key_type: &KeyType,
    ) -> Result<KeyData, AppError> {
        self.db_pool
            .get_key_by_type_and_status(key_type, &KeyStatus::Active)
            .await?
            .ok_or_else(|| AppError::NotFound("No active signing key".into()))
    }
}
```

---

## 操作流程

### 紧急密钥撤销

```rust
pub async fn revoke_key_immediately(
    key_id: &str,
    reason: &str,
    db_pool: &Arc<DbPool>,
    notification: &Arc<NotificationService>,
) -> Result<(), AppError> {
    tracing::warn!("URGENT: Revoking key {} due to: {}", key_id, reason);

    // 1. 立即标记为已撤销
    db_pool
        .update_key_status(key_id, KeyStatus::Destroyed, Some(reason))
        .await?;

    // 2. 清除所有缓存
    GLOBAL_KEY_CACHE.invalidate_all().await;

    // 3. 触发自动轮换
    rotate_keys_by_type(key_id).await?;

    // 4. 发出严重告警
    notification
        .alert_critical(
            "Security Alert: Key Revoked",
            &format!("Key {} was revoked: {}", key_id, reason),
        )
        .await?;

    // 5. 记录安全审计
    db_pool
        .log_security_event(SecurityEvent {
            event_type: "KEY_REVOKED".to_string(),
            severity: "critical".to_string(),
            key_id: Some(key_id.to_string()),
            reason: reason.to_string(),
            timestamp: Utc::now(),
        })
        .await?;

    Ok(())
}
```

### 密钥恢复（灾难恢复）

```rust
pub async fn recover_from_backup(
    backup_key_id: &str,
    db_pool: &Arc<DbPool>,
    kms_manager: &Arc<KmsKeyManager>,
) -> Result<(), AppError> {
    tracing::info!("Recovering key from backup: {}", backup_key_id);

    // 1. 从冷存储恢复
    let archived_key = db_pool.get_archived_key(backup_key_id).await?;

    // 2. 验证密钥完整性 (HMAC 检查)
    if !verify_key_integrity(&archived_key).await? {
        return Err(AppError::Other("Key integrity check failed".into()));
    }

    // 3. 激活恢复的密钥
    db_pool
        .update_key_status(backup_key_id, KeyStatus::Active, None)
        .await?;

    // 4. 更新缓存
    GLOBAL_KEY_CACHE.set_active_key(&archived_key).await;

    // 5. 记录恢复事件
    db_pool
        .log_security_event(SecurityEvent {
            event_type: "KEY_RECOVERED".to_string(),
            severity: "high".to_string(),
            key_id: Some(backup_key_id.to_string()),
            timestamp: Utc::now(),
        })
        .await?;

    Ok(())
}
```

---

## 监控和审计

### 密钥使用监控

```rust
// src/middleware/key_audit.rs

pub async fn log_key_usage(
    key_id: &str,
    operation: &str,  // sign, verify, encrypt, decrypt
    duration_ms: u64,
    success: bool,
) -> Result<(), AppError> {
    // 记录到审计日志
    AuditLog::create(AuditLogEntry {
        timestamp: Utc::now(),
        event_type: "KEY_USAGE".to_string(),
        key_id: key_id.to_string(),
        operation: operation.to_string(),
        duration_ms,
        success,
        status: if success { "success" } else { "failure" }.to_string(),
    })
    .await?;

    // 监控异常使用
    if duration_ms > 100 {
        tracing::warn!(
            "Slow key operation: {} took {}ms",
            operation,
            duration_ms
        );
    }

    Ok(())
}

pub async fn monitor_key_rotation_health(
    db_pool: &Arc<DbPool>,
) -> Result<RotationMetrics, AppError> {
    let metrics = RotationMetrics {
        active_keys_count: db_pool.count_active_keys().await?,
        deprecated_keys_count: db_pool.count_deprecated_keys().await?,
        archived_keys_count: db_pool.count_archived_keys().await?,
        days_until_next_rotation: get_days_until_next_rotation().await?,
        last_rotation_success: db_pool.get_last_rotation_success().await?,
        rotation_failures_7d: db_pool.count_rotation_failures_7d().await?,
    };

    Ok(metrics)
}
```

### Prometheus 指标

```yaml
# prometheus/rules/key_management.yaml

groups:
  - name: key-management
    rules:
      - alert: KeyRotationFailed
        expr: key_rotation_failures_total > 0
        for: 1h
        labels:
          severity: critical
        annotations:
          summary: "Key rotation failed"

      - alert: NoActiveKey
        expr: active_keys_count == 0
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "No active signing key"

      - alert: KeyNearExpiration
        expr: time() - key_rotation_last_success_timestamp > (90 * 86400)
        for: 24h
        labels:
          severity: warning
        annotations:
          summary: "Key expiration in 24h"

      - alert: KeyRotationSlowdown
        expr: key_operation_duration_seconds > 0.1
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "Key operations slow: {{ $value }}s"
```

---

**文档状态**: ✅ 已发布
**下一版本**: 2026-02-20
**维护者**: 安全团队
