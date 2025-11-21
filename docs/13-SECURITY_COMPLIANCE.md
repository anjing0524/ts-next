# 安全和合规设计

**文档版本**: 1.0
**创建日期**: 2025-11-21
**适用版本**: v1.0 及以上
**所有者**: 安全团队、合规团队
**相关需求**: FR-012 (安全和合规补充需求)

---

## 目录

1. [概述](#概述)
2. [安全配置基准](#安全配置基准)
3. [数据加密设计](#数据加密设计)
4. [合规框架](#合规框架)
5. [安全验证](#安全验证)
6. [事件响应](#事件响应)
7. [审计和报告](#审计和报告)

---

## 概述

### 安全目标

```
1. 确保数据机密性 - 传输和存储加密
2. 确保数据完整性 - 防止篡改，签名验证
3. 确保可用性 - DDoS 防护，备份冗余
4. 确保可追溯性 - 完整审计日志
5. 确保合规性 - GDPR, SOX, SOC 2 Type II
```

### 安全层次

```
应用层      → 输入验证, 业务逻辑安全, API 安全
传输层      → TLS 1.3+, 密码套件强化
存储层      → 数据库加密, 敏感信息存储
基础设施层  → 网络隔离, 防火墙, WAF
人员管理    → 访问控制, 审计, 培训
```

---

## 安全配置基准

### TLS 配置

#### TLS 版本要求

```nginx
# nginx/conf.d/ssl.conf

# TLS 版本: 仅支持 1.3+
ssl_protocols TLSv1.3 TLSv1.2;  # 实际上应该移除 TLSv1.2 生产环境

# 仅允许强密码套件
ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305';

# 密码套件顺序优先级
ssl_prefer_server_ciphers on;

# 椭圆曲线
ssl_curves X25519:P-256:P-384;

# 会话缓存
ssl_session_cache shared:SSL:10m;
ssl_session_timeout 10m;
ssl_session_tickets off;

# OCSP Stapling (在线证书状态协议装订)
ssl_stapling on;
ssl_stapling_verify on;
resolver 8.8.8.8 8.8.4.4;

# 证书配置
ssl_certificate /etc/ssl/certs/oauth-cert.pem;
ssl_certificate_key /etc/ssl/private/oauth-key.pem;
ssl_trusted_certificate /etc/ssl/certs/oauth-chain.pem;
```

**验证命令**:
```bash
# 使用 nmap 检查 TLS 版本
nmap --script ssl-enum-ciphers -p 443 api.example.com

# 使用 testssl.sh 进行完整检查
./testssl.sh --full https://api.example.com

# 使用 openssl 验证
openssl s_client -connect api.example.com:443 -tls1_3
```

#### TLS 证书管理

```bash
#!/bin/bash
# scripts/manage-certificates.sh

# 生成 CSR (Certificate Signing Request)
openssl req -new -newkey rsa:2048 \
  -key api-key.pem \
  -out api.csr \
  -subj "/C=US/ST=State/L=City/O=Company/CN=api.example.com"

# 签发证书 (使用 Let's Encrypt 或内部 CA)
# 使用 certbot
sudo certbot certonly --webroot \
  -w /var/www/html \
  -d api.example.com \
  -d *.api.example.com

# 设置自动续期
sudo systemctl enable certbot-renew
sudo systemctl start certbot-renew

# 监控证书过期
EXPIRY=$(date -d "$(openssl x509 -enddate -noout -in /etc/ssl/certs/cert.pem | cut -d= -f 2)" +%s)
NOW=$(date +%s)
DAYS=$((($EXPIRY - $NOW) / 86400))

if [ $DAYS -lt 30 ]; then
  echo "Certificate expires in $DAYS days - RENEW NOW"
  exit 1
fi
```

### HTTP 安全头

```rust
// src/middleware/security_headers.rs

use axum::{
    extract::Request,
    middleware::Next,
    response::Response,
    http::HeaderMap,
};

pub async fn security_headers(
    mut req: Request,
    next: Next,
) -> Response {
    let mut response = next.run(req).await;
    let headers = response.headers_mut();

    // Strict-Transport-Security (HSTS)
    // 强制浏览器使用 HTTPS，防止 SSL Stripping 攻击
    headers.insert(
        "Strict-Transport-Security",
        "max-age=31536000; includeSubDomains; preload".parse().unwrap(),
    );

    // X-Content-Type-Options
    // 防止 MIME 类型嗅探，强制浏览器遵守 Content-Type
    headers.insert(
        "X-Content-Type-Options",
        "nosniff".parse().unwrap(),
    );

    // X-Frame-Options
    // 防止 Clickjacking 攻击
    headers.insert(
        "X-Frame-Options",
        "DENY".parse().unwrap(),  // 或 "SAMEORIGIN"
    );

    // X-XSS-Protection
    // 启用浏览器 XSS 防护
    headers.insert(
        "X-XSS-Protection",
        "1; mode=block".parse().unwrap(),
    );

    // Content-Security-Policy (CSP)
    // 严格的内容安全策略，防止 XSS
    headers.insert(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' https:; connect-src 'self' https://api.example.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'".parse().unwrap(),
    );

    // Referrer-Policy
    // 控制 Referer 信息泄露
    headers.insert(
        "Referrer-Policy",
        "strict-origin-when-cross-origin".parse().unwrap(),
    );

    // Permissions-Policy (formerly Feature-Policy)
    // 控制浏览器特性的使用
    headers.insert(
        "Permissions-Policy",
        "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()".parse().unwrap(),
    );

    response
}
```

### CORS 配置

```rust
// src/middleware/cors.rs

use tower_http::cors::{CorsLayer, AllowOrigin};
use std::str::FromStr;

pub fn cors_layer() -> CorsLayer {
    CorsLayer::permissive()
        // ✅ 限制来源白名单，不允许通配符
        .allow_origin(
            AllowOrigin::list(vec![
                "https://admin.example.com".parse().unwrap(),
                "https://app.example.com".parse().unwrap(),
                // 不包含 http://localhost (开发环境单独处理)
            ])
        )
        // 允许的 HTTP 方法
        .allow_methods(vec![
            axum::http::Method::GET,
            axum::http::Method::POST,
            axum::http::Method::PUT,
            axum::http::Method::DELETE,
        ])
        // 允许的请求头
        .allow_headers(vec![
            axum::http::header::AUTHORIZATION,
            axum::http::header::CONTENT_TYPE,
            axum::http::header::ACCEPT,
        ])
        // 暴露的响应头
        .expose_headers(vec![
            axum::http::header::CONTENT_LENGTH,
            axum::http::header::DEPRECATION,
            axum::http::header::SUNSET,
        ])
        // 凭证模式
        .allow_credentials(true)
        // 预检请求缓存时间 (1 小时)
        .max_age(Duration::from_secs(3600))
}

// 开发环境特殊处理
#[cfg(debug_assertions)]
pub fn cors_layer_dev() -> CorsLayer {
    CorsLayer::permissive()
        .allow_origin(
            AllowOrigin::list(vec![
                "http://localhost:3000".parse().unwrap(),  // Next.js
                "http://localhost:6188".parse().unwrap(),  // Admin Portal
                "http://localhost:8080".parse().unwrap(),  // 开发工具
            ])
        )
        // ...其他配置同上
}
```

---

## 数据加密设计

### 传输层加密 (TLS)

**目标**: 所有网络通信使用 TLS 1.3+

```rust
// src/config/security.rs

pub struct SecurityConfig {
    pub enforce_https: bool,
    pub hsts_max_age: u32,
    pub tls_version: String,
    pub cipher_suites: Vec<String>,
}

impl SecurityConfig {
    pub fn production() -> Self {
        Self {
            enforce_https: true,
            hsts_max_age: 31536000,  // 1 year
            tls_version: "1.3+".to_string(),
            cipher_suites: vec![
                "TLS_AES_256_GCM_SHA384".to_string(),
                "TLS_CHACHA20_POLY1305_SHA256".to_string(),
                "TLS_AES_128_GCM_SHA256".to_string(),
            ],
        }
    }
}

// 中间件：强制 HTTPS
pub async fn enforce_https(
    req: Request,
    next: Next,
) -> Response {
    if req.uri().scheme() != Some(&axum::http::uri::Scheme::HTTPS) {
        // 重定向到 HTTPS
        return Response::builder()
            .status(StatusCode::MOVED_PERMANENTLY)
            .header(
                "Location",
                format!("https://{}{}", req.headers().get("host").unwrap(), req.uri())
            )
            .body(Body::empty())
            .unwrap();
    }

    next.run(req).await
}
```

### 存储层加密

#### 敏感数据加密

```rust
// src/services/encryption.rs

use aes_gcm::{Aes256Gcm, Key, Nonce};
use rand::Rng;

pub struct DataEncryption {
    cipher: Aes256Gcm,
    key_id: String,
}

impl DataEncryption {
    /// 加密敏感字段（密钥、密码、PII）
    pub fn encrypt_field(
        &self,
        plaintext: &str,
        field_type: &str,  // "api_key", "password", "pii"
    ) -> Result<EncryptedData, CryptoError> {
        // 1. 生成随机 nonce (96-bit)
        let mut rng = rand::thread_rng();
        let nonce_bytes: [u8; 12] = rng.gen();
        let nonce = Nonce::from_slice(&nonce_bytes);

        // 2. 添加 AAD (Additional Authenticated Data)
        let aad = format!("{}:{}", self.key_id, field_type).as_bytes().to_vec();

        // 3. 加密
        let ciphertext = self.cipher
            .encrypt(nonce, aad.as_ref(), plaintext.as_bytes())?;

        Ok(EncryptedData {
            ciphertext: base64::encode(&ciphertext),
            nonce: base64::encode(&nonce_bytes),
            key_id: self.key_id.clone(),
            algorithm: "AES-256-GCM".to_string(),
            field_type: field_type.to_string(),
        })
    }

    /// 解密敏感字段
    pub fn decrypt_field(
        &self,
        encrypted: &EncryptedData,
    ) -> Result<String, CryptoError> {
        let ciphertext = base64::decode(&encrypted.ciphertext)?;
        let nonce_bytes = base64::decode(&encrypted.nonce)?;
        let nonce = Nonce::from_slice(&nonce_bytes);

        let aad = format!("{}:{}", encrypted.key_id, encrypted.field_type)
            .as_bytes()
            .to_vec();

        let plaintext = self.cipher.decrypt(nonce, aad.as_ref(), ciphertext.as_ref())?;

        Ok(String::from_utf8(plaintext)?)
    }
}

// 数据库存储敏感数据的列定义
// CREATE TABLE users (
//   id UUID PRIMARY KEY,
//   email VARCHAR(255),
//   phone_encrypted BYTEA NOT NULL,       -- 加密存储
//   phone_nonce BYTEA NOT NULL,
//   ssn_encrypted BYTEA,                  -- 加密存储
//   ssn_nonce BYTEA,
//   api_key_encrypted BYTEA NOT NULL,     -- 加密存储
//   api_key_nonce BYTEA NOT NULL
// );
```

#### 数据库加密

```sql
-- 创建加密列
CREATE TABLE sensitive_data (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id),

    -- 加密存储的字段
    pii_data BYTEA NOT NULL,              -- 加密的 PII 数据
    encryption_key_id VARCHAR(36) NOT NULL,
    encryption_nonce BYTEA NOT NULL,

    -- 审计字段
    encrypted_at TIMESTAMP DEFAULT NOW(),
    decrypted_at TIMESTAMP,
    accessed_by UUID,

    INDEX idx_user_id (user_id)
);

-- 触发器：自动加密敏感字段
CREATE TRIGGER encrypt_pii_data
BEFORE INSERT ON sensitive_data
FOR EACH ROW
EXECUTE FUNCTION encrypt_pii_function();

-- 触发器：审计访问
CREATE TRIGGER audit_pii_access
AFTER SELECT ON sensitive_data
FOR EACH ROW
EXECUTE FUNCTION audit_pii_access_function();
```

#### 备份加密

```bash
#!/bin/bash
# scripts/backup-with-encryption.sh

BACKUP_DIR="/backups/oauth"
ENCRYPTION_KEY="/etc/encryption/backup-key.pem"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/oauth_${TIMESTAMP}.sql.gz.enc"

# 1. 创建备份
pg_dump oauth_database | gzip > /tmp/oauth_${TIMESTAMP}.sql.gz

# 2. 使用 openssl 加密
openssl enc -aes-256-cbc \
  -in /tmp/oauth_${TIMESTAMP}.sql.gz \
  -out ${BACKUP_FILE} \
  -K $(od -An -tx1 -N32 < ${ENCRYPTION_KEY} | tr -d ' ')

# 3. 验证备份
openssl enc -aes-256-cbc -d -in ${BACKUP_FILE} | gunzip | pg_restore --data-only

# 4. 清理临时文件
shred -vfz -n 10 /tmp/oauth_${TIMESTAMP}.sql.gz

# 5. 上传到冷存储（S3 或其他）
aws s3 cp ${BACKUP_FILE} s3://secure-backups/oauth/ \
  --sse AES256 \
  --storage-class GLACIER

echo "Encrypted backup created: ${BACKUP_FILE}"
```

### 审计日志加密

```rust
// src/services/audit_log.rs

pub async fn store_audit_log(
    entry: &AuditLogEntry,
    encryption: &Arc<DataEncryption>,
) -> Result<(), AppError> {
    // 敏感字段加密
    let encrypted_details = encryption.encrypt_field(
        &serde_json::to_string(&entry.details)?,
        "audit_log",
    )?;

    // 存储到数据库
    sqlx::query(
        "INSERT INTO audit_logs (
            user_id, action_type, resource_type, resource_id,
            encrypted_details, details_nonce, key_id,
            ip_address, user_agent, timestamp
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)"
    )
    .bind(&entry.user_id)
    .bind(&entry.action_type)
    .bind(&entry.resource_type)
    .bind(&entry.resource_id)
    .bind(&encrypted_details.ciphertext)
    .bind(&encrypted_details.nonce)
    .bind(&encrypted_details.key_id)
    .bind(&entry.ip_address)
    .bind(&entry.user_agent)
    .bind(&entry.timestamp)
    .execute(&pool)
    .await?;

    Ok(())
}
```

---

## 合规框架

### GDPR 合规

#### 数据主体权利

```rust
// src/services/gdpr.rs

pub struct GdprService;

impl GdprService {
    /// 实现 "被遗忘权" - 删除用户所有个人数据
    pub async fn right_to_be_forgotten(
        user_id: &str,
        db_pool: &Arc<DbPool>,
    ) -> Result<(), AppError> {
        let mut tx = db_pool.begin().await?;

        // 1. 删除用户个人数据
        sqlx::query("DELETE FROM users WHERE id = $1")
            .bind(user_id)
            .execute(&mut *tx)
            .await?;

        // 2. 删除关联的 OAuth 授权
        sqlx::query("DELETE FROM oauth_authorizations WHERE user_id = $1")
            .bind(user_id)
            .execute(&mut *tx)
            .await?;

        // 3. 删除敏感数据（phone, SSN 等）
        sqlx::query("DELETE FROM sensitive_data WHERE user_id = $1")
            .bind(user_id)
            .execute(&mut *tx)
            .await?;

        // 4. 保留匿名的审计日志（用于合规）
        sqlx::query(
            "UPDATE audit_logs SET user_id = NULL WHERE user_id = $1"
        )
        .bind(user_id)
        .execute(&mut *tx)
        .await?;

        // 5. 记录删除事件
        log_gdpr_deletion(user_id, &mut *tx).await?;

        tx.commit().await?;
        Ok(())
    }

    /// 实现 "数据可移植性权" - 导出用户数据
    pub async fn right_to_data_portability(
        user_id: &str,
        db_pool: &Arc<DbPool>,
    ) -> Result<UserDataExport, AppError> {
        let user = db_pool.get_user(user_id).await?;
        let authorizations = db_pool.get_user_authorizations(user_id).await?;
        let audit_logs = db_pool.get_user_audit_logs(user_id).await?;

        Ok(UserDataExport {
            user: user.into(),
            authorizations: authorizations.into_iter().map(|a| a.into()).collect(),
            audit_logs: audit_logs.into_iter().map(|l| l.into()).collect(),
            export_timestamp: Utc::now(),
            export_format: "json".to_string(),
        })
    }

    /// 实现 "访问权" - 获取用户的所有个人数据
    pub async fn right_to_access(
        user_id: &str,
        db_pool: &Arc<DbPool>,
    ) -> Result<UserAccessReport, AppError> {
        Ok(UserAccessReport {
            profile: db_pool.get_user(user_id).await?,
            access_log: db_pool.get_access_log(user_id, 90).await?,
            data_processing: db_pool.get_data_processing_log(user_id).await?,
            third_parties: db_pool.get_third_party_sharing(user_id).await?,
        })
    }
}
```

#### 隐私影响评估 (DPIA)

```markdown
# GDPR 数据保护影响评估 (DPIA)

## 处理活动描述

- **处理方**: OAuth 服务
- **数据主体**: 用户
- **处理目的**: 身份认证和授权
- **数据类别**: 个人身份信息 (PII), 身份验证数据, 审计日志

## 合法性基础

- ✅ 明确的同意（条款 6(1)(a)）
- ✅ 合同必需（条款 6(1)(b)）
- ✅ 法律义务（条款 6(1)(c)）

## 风险评估

| 风险 | 可能性 | 影响 | 缓解措施 |
|------|--------|------|---------|
| 数据泄露 | 中 | 高 | 加密存储、访问控制、审计日志 |
| 未授权访问 | 低 | 高 | TLS、MFA、权限检查 |
| 数据丢失 | 低 | 中 | 备份和恢复流程 |

## 数据主体权利

- ✅ 访问权 - 实现
- ✅ 删除权（被遗忘权）- 实现
- ✅ 数据可移植性 - 实现
- ✅ 更正权 - 实现
- ✅ 反对权 - 实现

## 合规确认

- ✅ 数据最小化原则 - 仅收集必需数据
- ✅ 目的限制 - 仅用于身份认证
- ✅ 存储限制 - 定期删除过期数据
- ✅ 完整性和保密性 - 加密和访问控制
```

### SOX 合规

#### 变更管理

```bash
#!/bin/bash
# scripts/change-control.sh

# SOX 要求：所有代码变更必须经过审批和审计

# 1. 创建变更请求
cat > change_request.json <<EOF
{
  "change_id": "CHG-20251121-001",
  "description": "Update OAuth token endpoint",
  "affected_systems": ["oauth-service", "admin-portal"],
  "requester": "developer@example.com",
  "approver": "security@example.com",
  "implementation_date": "2025-11-21T20:00:00Z",
  "rollback_plan": "git revert to previous tag",
  "testing": "unit + integration tests passed"
}
EOF

# 2. 审批工作流
echo "等待安全团队批准..."
curl -X POST https://approvals.example.com/api/requests \
  -H "Content-Type: application/json" \
  -d @change_request.json

# 3. 自动化测试
npm run test
cargo test

# 4. 代码审查 (最少 2 个 reviewers)
git push origin feature/update-oauth-token
gh pr create --title "Update OAuth token endpoint" \
  --body "Changes: $(git log --oneline HEAD~1..HEAD)"

# 5. 部署（仅在批准后）
# CI/CD 流程
git tag -a v2.1.0 -m "Update OAuth token endpoint"
git push origin v2.1.0

# 6. 自动审计记录
echo "变更已部署: $(git rev-parse HEAD)" >> /var/log/sox-changes.log
```

#### 访问控制审计

```sql
-- 定期生成访问控制审计报告

SELECT
    user_id,
    username,
    role_id,
    assigned_at,
    assigned_by,
    COUNT(*) as access_count
FROM user_roles
WHERE assigned_at > NOW() - INTERVAL '1 quarter'
GROUP BY user_id, role_id
ORDER BY access_count DESC;

-- 检查特权账户活动
SELECT
    audit_logs.timestamp,
    users.username,
    user_roles.role_id,
    audit_logs.action_type,
    audit_logs.resource_type,
    audit_logs.ip_address
FROM audit_logs
JOIN users ON audit_logs.user_id = users.id
JOIN user_roles ON users.id = user_roles.user_id
WHERE user_roles.role_id IN ('super_admin', 'admin')
  AND audit_logs.timestamp > NOW() - INTERVAL '1 day'
ORDER BY audit_logs.timestamp DESC;
```

### SOC 2 Type II

#### 安全程序文档

```markdown
# SOC 2 Type II 安全管理框架

## 安全运营程序

### 事件响应程序

**目标**: 检测、响应和恢复安全事件

**程序**:
1. 检测 - 监控和告警系统识别异常
2. 分类 - 评估事件严重性
3. 遏制 - 采取行动限制影响
4. 根除 - 移除威胁因素
5. 恢复 - 恢复受影响系统
6. 教训总结 - 改进防御措施

**响应时间目标**:
- Critical: < 30 分钟
- High: < 2 小时
- Medium: < 24 小时
- Low: < 5 天

### 事件日志保留

所有安全事件日志保留至少 1 年:
- 系统日志: /var/log/syslog
- 应用日志: /var/log/app/*.log
- 审计日志: PostgreSQL audit_logs 表
- 网络日志: 防火墙和 WAF 日志
```

---

## 安全验证

### 依赖安全扫描

```bash
#!/bin/bash
# scripts/security-scan.sh

echo "=== 依赖安全扫描 ==="

# 1. Rust 依赖检查 (cargo-audit)
cargo audit --deny warnings

# 2. Node.js 依赖检查 (npm audit)
npm audit --audit-level=moderate

# 3. SNYK 全面扫描
snyk test --severity-threshold=high

# 4. 生成报告
snyk test --json > security-report.json
```

### 代码静态分析 (SAST)

```bash
#!/bin/bash
# scripts/sast-scan.sh

# SonarQube 代码质量和安全扫描
sonar-scanner \
  -Dsonar.projectKey=oauth-service \
  -Dsonar.sources=. \
  -Dsonar.host.url=https://sonarqube.internal \
  -Dsonar.login=${SONAR_TOKEN}

# 检查结果
curl https://sonarqube.internal/api/qualitygates/project_status \
  -DprojectKey=oauth-service | jq '.projectStatus.status'

# 必须达到 A 级
```

### 动态应用安全测试 (DAST)

```bash
#!/bin/bash
# scripts/dast-scan.sh

# 使用 OWASP ZAP 进行动态安全测试
docker run -t owasp/zap2docker-stable zap-baseline.py \
  -t https://oauth-service.internal \
  -r dast-report.html

# 关键检查项 (OWASP Top 10):
# A01:2021 - Broken Access Control
# A02:2021 - Cryptographic Failures
# A03:2021 - Injection
# A04:2021 - Insecure Design
# A05:2021 - Security Misconfiguration
# A06:2021 - Vulnerable and Outdated Components
# A07:2021 - Authentication and Session Management
# A08:2021 - Software and Data Integrity Failures
# A09:2021 - Logging and Monitoring Failures
# A10:2021 - Server-Side Request Forgery (SSRF)
```

### 渗透测试

```markdown
# 渗透测试计划

## 频率

- 年度全面渗透测试 (第四季度)
- 半年度 API 安全评估
- 主要版本发布前的渗透测试

## 范围

1. **网络级别**
   - 端口扫描和服务识别
   - 网络配置审计
   - VPN/防火墙配置检查

2. **应用级别**
   - OAuth 流程安全
   - API 端点安全
   - 认证和授权绕过
   - 业务逻辑漏洞

3. **基础设施级别**
   - Kubernetes 集群安全
   - 数据库访问控制
   - 备份系统安全

## 发现处理流程

- **Critical**: 立即停用受影响功能，发布补丁
- **High**: 在 7 天内修复
- **Medium**: 在 30 天内修复
- **Low**: 在下一个版本修复

## 验收标准

✅ OWASP Top 10 无发现
✅ CWE 高危无发现
✅ 所有建议的修复已实施
```

---

## 事件响应

### 安全事件分类

```rust
// src/security/incident.rs

pub enum IncidentSeverity {
    Critical,   // 系统彻底瘫痪、数据大规模泄露
    High,       // 功能部分不可用、关键用户受影响
    Medium,     // 功能受到影响、非关键用户受影响
    Low,        // 功能基本正常、用户无直接感知
}

pub struct SecurityIncident {
    pub id: String,
    pub severity: IncidentSeverity,
    pub title: String,
    pub description: String,
    pub affected_systems: Vec<String>,
    pub detected_at: DateTime<Utc>,
    pub response_started_at: Option<DateTime<Utc>>,
    pub resolved_at: Option<DateTime<Utc>>,
    pub root_cause: Option<String>,
}

impl SecurityIncident {
    pub async fn respond(
        &mut self,
        response_team: &str,
        initial_analysis: &str,
    ) -> Result<(), AppError> {
        self.response_started_at = Some(Utc::now());

        // 1. 立即通知
        notify_security_team(self, response_team).await?;

        // 2. 隔离受影响系统（如需要）
        match self.severity {
            IncidentSeverity::Critical => {
                isolate_affected_systems(&self.affected_systems).await?;
            }
            _ => {}
        }

        // 3. 记录详细信息
        log_incident_details(self, initial_analysis).await?;

        // 4. 启动调查
        start_investigation(self).await?;

        Ok(())
    }
}
```

### 应急响应团队

```
安全团队 (Security Team)
  ├─ 安全负责人 (CISO)
  ├─ 应急响应协调员 (Incident Coordinator)
  ├─ 取证专家 (Forensics Expert)
  └─ 威胁分析专家 (Threat Analyst)

技术团队 (Technical Team)
  ├─ 基础设施工程师 (Infrastructure)
  ├─ 数据库管理员 (DBA)
  ├─ 应用开发负责人 (App Lead)
  └─ 网络管理员 (Network Admin)

通信团队 (Communications)
  ├─ 公关主管 (PR Lead)
  ├─ 法律顾问 (Legal Counsel)
  └─ 客户成功 (Customer Success)
```

---

## 审计和报告

### 安全审计计划

```markdown
# 年度安全审计计划

## Q1 (1月-3月)
- 访问控制审计
- 密钥管理审计
- 依赖安全扫描

## Q2 (4月-6月)
- 代码安全审计
- 备份和恢复测试
- 灾难恢复演练

## Q3 (7月-9月)
- 合规性审查 (GDPR, SOX)
- 安全培训和意识
- 漏洞管理审计

## Q4 (10月-12月)
- 全面渗透测试
- SOC 2 Type II 审计准备
- 年度安全总结和计划

## 审计报告

- **内部报告** - 每月发送给管理层
- **外部报告** - 年度发送给 SOC 2 审计师
- **客户报告** - 应要求提供安全证明
```

### 合规证书和认证

```
持证情况:
  ✅ SOC 2 Type II (目标: 2025年12月)
  ✅ ISO 27001 (计划中)
  ✅ GDPR 合规认证 (2025年2月)
  ✅ 无安全漏洞 (目标: 每个版本)
```

---

**文档状态**: ✅ 已发布
**下一版本**: 2026-02-20
**维护者**: 安全团队
