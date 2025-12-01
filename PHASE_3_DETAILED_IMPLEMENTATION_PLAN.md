# Phase 3 详细实现计划：权限同意页面

**计划日期**: 2025-12-01
**预计完成**: 2025-12-04（3天）
**状态**: 📋 规划中

---

## 📋 概览

Phase 3 将实现 OAuth 2.1 流程中的**权限同意页面（Consent Page）**，用户在此页面批准第三方应用访问其数据。该页面是完整 OAuth 授权流程的关键环节。

### 关键特性
- 显示第三方应用信息（名称、描述、图标）
- 列出应用请求的权限范围
- 用户批准/拒绝决策
- 记住用户选择（可选）
- 安全审计日志

### 技术栈
- **后端**: Rust/Axum + Askama 模板
- **前端**: HTML + Tailwind CSS + Vanilla JS
- **测试**: Playwright E2E
- **安全**: CSRF 保护、权限验证、审计日志

---

## 🗂️ 任务分解

### Task 3.1: 权限同意页面 UI 设计和实现（2小时）

#### 3.1.1 页面布局设计
```
┌─────────────────────────────────────────┐
│        OAuth 权限同意页面                 │
├─────────────────────────────────────────┤
│                                           │
│  ┌──────────────────────────────────┐    │
│  │  第三方应用信息                     │    │
│  │  ┌────┐                          │    │
│  │  │图标│  应用名称                  │    │
│  │  │    │  应用描述                  │    │
│  │  └────┘  来源: example.com      │    │
│  └──────────────────────────────────┘    │
│                                           │
│  ┌──────────────────────────────────┐    │
│  │ 请求的权限（用户预览）              │    │
│  │  □ openid     - 唯一身份识别      │    │
│  │  □ profile    - 个人资料信息      │    │
│  │  □ email      - 邮箱地址          │    │
│  │  □ phone      - 电话号码          │    │
│  └──────────────────────────────────┘    │
│                                           │
│  ┌──────────────────────────────────┐    │
│  │ □ 记住此选择（30天内）              │    │
│  └──────────────────────────────────┘    │
│                                           │
│  [拒绝]  [同意并继续]                      │
│                                           │
└─────────────────────────────────────────┘
```

#### 3.1.2 HTML 结构
**文件**: `templates/consent.html`

```html
{% extends "layout.html" %}

{% block title %}权限同意 - OAuth 授权系统{% endblock %}

{% block extra_head %}
<style>
  /* 响应式样式 */
  /* 权限列表样式 */
  /* 危险权限突出显示 */
</style>
{% endblock %}

{% block content %}
<div class="consent-container">
  <!-- 安全警告（如有危险权限）-->
  {% if dangerous_scopes %}
  <div class="warning-banner">
    <p>此应用请求访问您的敏感信息</p>
  </div>
  {% endif %}

  <!-- 应用信息卡片 -->
  <div class="app-info-card">
    <div class="app-header">
      {% if app_icon %}
        <img src="{{ app_icon }}" alt="App Icon" class="app-icon">
      {% else %}
        <div class="app-icon-placeholder"></div>
      {% endif %}
      <div class="app-details">
        <h2>{{ client_name }}</h2>
        <p class="app-description">{{ client_description }}</p>
        <p class="app-origin">来源: {{ app_origin }}</p>
      </div>
    </div>
  </div>

  <!-- 权限列表 -->
  <div class="scopes-card">
    <h3>此应用请求以下权限</h3>
    <ul class="scopes-list">
      {% for scope in scope_list %}
      <li class="scope-item {% if scope.is_dangerous %}dangerous{% endif %}">
        <input type="checkbox" id="scope-{{ scope.name }}"
               data-scope="{{ scope.name }}" checked disabled>
        <label for="scope-{{ scope.name }}">
          <strong>{{ scope.display_name }}</strong>
          <p class="scope-description">{{ scope.description }}</p>
        </label>
        {% if scope.is_dangerous %}
        <span class="danger-badge">⚠️ 敏感</span>
        {% endif %}
      </li>
      {% endfor %}
    </ul>
  </div>

  <!-- 记住选择 -->
  <div class="remember-choice">
    <label>
      <input type="checkbox" id="remember" name="remember">
      <span>记住此选择（30天内无需再次批准）</span>
    </label>
  </div>

  <!-- 按钮组 -->
  <div class="consent-actions">
    <form id="deny-form" method="POST" action="/api/v2/oauth/consent" class="inline">
      <input type="hidden" name="action" value="deny">
      <input type="hidden" name="state" value="{{ state }}">
      <button type="submit" class="btn btn-secondary">拒绝</button>
    </form>

    <form id="consent-form" method="POST" action="/api/v2/oauth/consent" class="inline">
      <input type="hidden" name="action" value="approve">
      <input type="hidden" name="state" value="{{ state }}">
      <input type="hidden" name="remember" value="">
      <button type="submit" id="approve-btn" class="btn btn-primary">同意并继续</button>
    </form>
  </div>

  <!-- 安全信息 -->
  <div class="security-info">
    <p class="text-sm text-gray-600">
      此应用通过 OAuth 2.1 授权框架访问您的数据。
      您可以随时在账户设置中撤销应用权限。
    </p>
  </div>
</div>
{% endblock %}

{% block extra_script %}
<script>
  // 同意按钮处理
  document.getElementById('consent-form').addEventListener('submit', (e) => {
    const remember = document.getElementById('remember').checked;
    document.querySelector('input[name="remember"]').value = remember ? 'true' : 'false';
  });

  // 安全警告（如有敏感权限）
  const dangerousScopes = document.querySelectorAll('.scope-item.dangerous');
  if (dangerousScopes.length > 0) {
    // 强制用户阅读警告
  }
</script>
{% endblock %}
```

#### 3.1.3 CSS 样式
- 应用卡片设计（带图标、名称、描述）
- 权限列表（可展开/折叠）
- 危险权限警告标签
- 响应式布局（移动/平板/桌面）
- 深色模式支持

**目标**: 清晰、直观、安全

---

### Task 3.2: 权限列表数据和权限说明（1小时）

#### 3.2.1 权限定义
```rust
#[derive(Clone, Debug)]
pub struct ScopeInfo {
    pub name: String,              // 权限标识
    pub display_name: String,      // 显示名称
    pub description: String,       // 详细描述
    pub icon: String,              // 图标 emoji
    pub is_dangerous: bool,        // 是否敏感
    pub category: String,          // 分类
}

// 标准 OIDC 权限
pub const SCOPE_OPENID: ScopeInfo = ScopeInfo {
    name: "openid",
    display_name: "唯一身份识别",
    description: "使用您的 OpenID 唯一标识符",
    icon: "🆔",
    is_dangerous: false,
    category: "Identity",
};

pub const SCOPE_PROFILE: ScopeInfo = ScopeInfo {
    name: "profile",
    display_name: "个人资料",
    description: "访问您的姓名、头像、生日等个人信息",
    icon: "👤",
    is_dangerous: false,
    category: "Profile",
};

pub const SCOPE_EMAIL: ScopeInfo = ScopeInfo {
    name: "email",
    display_name: "邮箱地址",
    description: "访问您的邮箱地址和邮箱验证状态",
    icon: "📧",
    is_dangerous: false,
    category: "Contact",
};

pub const SCOPE_PHONE: ScopeInfo = ScopeInfo {
    name: "phone",
    display_name: "电话号码",
    description: "访问您的电话号码和验证状态",
    icon: "📱",
    is_dangerous: true,  // 敏感权限
    category: "Contact",
};

pub const SCOPE_ADDRESS: ScopeInfo = ScopeInfo {
    name: "address",
    display_name: "地址信息",
    description: "访问您的街道、城市、邮编等地址信息",
    icon: "📍",
    is_dangerous: true,  // 敏感权限
    category: "Contact",
};

pub const SCOPE_OFFLINE_ACCESS: ScopeInfo = ScopeInfo {
    name: "offline_access",
    display_name: "离线访问",
    description: "即使您离线，该应用也可以代表您执行操作",
    icon: "🔄",
    is_dangerous: true,  // 高风险
    category: "Access",
};
```

#### 3.2.2 权限分类
```
Identity (身份)
├── openid       - 基础身份
└── sub          - 主体标识

Profile (资料)
├── profile      - 个人资料
├── name         - 姓名
├── picture      - 头像
├── website      - 网站
├── gender       - 性别
├── birthdate    - 生日
└── locale       - 地区

Contact (联系)
├── email        - 邮箱
├── phone        - 电话
└── address      - 地址

Access (访问)
├── offline_access - 离线访问
└── refresh       - 刷新令牌
```

#### 3.2.3 权限风险分级
- **低风险** (绿色): openid, profile, email
- **中风险** (黄色): phone, address, offline_access
- **高风险** (红色): 完整权限访问

**任务目标**: 定义权限元数据和风险分级

---

### Task 3.3: 权限同意处理器和数据库操作（2小时）

#### 3.3.1 处理器实现
**文件**: `src/routes/consent.rs` (新文件)

```rust
/// GET /oauth/consent - 显示权限同意页面
pub async fn consent_page_handler(
    State(state): State<Arc<AppState>>,
    Query(params): Query<ConsentPageQuery>,
) -> Result<ConsentTemplate, AppError>

/// POST /api/v2/oauth/consent - 处理用户决策
pub async fn consent_handler(
    State(state): State<Arc<AppState>>,
    jar: CookieJar,
    headers: HeaderMap,
    Form(request): Form<ConsentRequest>,
) -> Result<(CookieJar, Redirect), AppError>
```

#### 3.3.2 处理流程

**GET /oauth/consent** (显示页面):
```
1. 验证 state 参数 (CSRF 保护)
2. 查询 client 信息 (应用名称、描述)
3. 解析 scope 参数
4. 获取用户权限记录 (如有记住选择)
5. 渲染 consent.html 模板
```

**POST /api/v2/oauth/consent** (处理同意):
```
1. 验证用户身份 (session_token)
2. 验证 state 参数
3. 记录用户决策 (audit log)
4. 如果同意:
   a. 保存权限授予记录
   b. 如勾选"记住"，保存30天有效期
   c. 生成授权码
   d. 重定向回客户端
5. 如果拒绝:
   a. 记录拒绝事件
   b. 重定向回客户端 (error=access_denied)
```

#### 3.3.3 数据库表

```sql
-- 权限授予记录表
CREATE TABLE user_consents (
  id BIGINT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  client_id VARCHAR(255) NOT NULL,
  scopes TEXT NOT NULL,           -- 逗号分隔
  granted_at TIMESTAMP NOT NULL,
  expires_at TIMESTAMP,           -- 记住选择的过期时间
  ip_address VARCHAR(45),
  user_agent TEXT,
  UNIQUE(user_id, client_id)
);

-- 权限审计日志
CREATE TABLE consent_audit_logs (
  id BIGINT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  client_id VARCHAR(255) NOT NULL,
  action VARCHAR(20),             -- 'approve' | 'deny'
  scopes TEXT,
  timestamp TIMESTAMP NOT NULL,
  ip_address VARCHAR(45),
  user_agent TEXT
);
```

**任务目标**: 实现权限决策处理和持久化

---

### Task 3.4: 权限缓存和自动批准逻辑（1小时）

#### 3.4.1 自动批准条件
```
如果满足以下条件，可跳过权限同意页面:
1. 用户在过去 30 天内批准了相同权限
2. 应用是受信任的（内部应用）
3. 请求的权限未增加

自动批准流程:
1. 检查 user_consents 表
2. 如果存在有效记录，生成授权码
3. 直接重定向（不显示同意页面）
```

#### 3.4.2 缓存策略
```rust
// 权限缓存（Redis 或内存）
pub struct ConsentCache {
    user_id: String,
    client_id: String,
    scopes: HashSet<String>,
    expires_at: DateTime<Utc>,
}

// 缓存操作
pub async fn check_cached_consent(
    cache: &ConsentCache,
    user_id: &str,
    client_id: &str,
    scopes: &[String],
) -> Option<bool>

pub async fn save_consent(
    cache: &ConsentCache,
    consent: ConsentRecord,
) -> Result<(), Error>
```

**任务目标**: 改进用户体验（减少重复批准）

---

### Task 3.5: 权限拒绝和错误处理（1小时）

#### 3.5.1 拒绝处理
```rust
// 用户拒绝权限
pub async fn handle_consent_denial(
    user_id: String,
    client_id: String,
    state: String,
    redirect_uri: String,
) -> Result<String, AppError>
```

**拒绝后流程**:
```
1. 记录拒绝事件到审计日志
2. 检查 redirect_uri 有效性
3. 构建错误响应:
   redirect_uri?error=access_denied&state=...
4. 返回重定向 URL
```

#### 3.5.2 错误类型
```
- access_denied: 用户拒绝
- invalid_scope: 无效权限请求
- server_error: 服务器错误
- temporarily_unavailable: 服务暂不可用
```

**任务目标**: 完整的错误处理和恢复机制

---

### Task 3.6: 权限同意 E2E 测试（2小时）

#### 3.6.1 测试文件
**文件**: `apps/admin-portal/tests/e2e/consent-page.spec.ts`

#### 3.6.2 测试用例（20个）

```typescript
test.describe('权限同意页面 E2E 测试', () => {
  // Test 1: 页面加载和元素验证 (2个)
  test('同意页面应该正确加载')
  test('页面应该显示应用信息和权限列表')

  // Test 2: 权限信息显示 (3个)
  test('权限列表应该正确分类')
  test('敏感权限应该标记为危险')
  test('权限描述应该清晰')

  // Test 3: 用户交互 (4个)
  test('用户可以拒绝权限')
  test('用户可以批准权限')
  test('用户可以选择记住选择')
  test('表单提交应该有加载状态')

  // Test 4: 权限缓存 (3个)
  test('重复请求相同权限应该跳过同意页面')
  test('30天后应该再次显示同意页面')
  test('增加的权限应该总是显示同意页面')

  // Test 5: 错误处理 (2个)
  test('无效 state 参数应该显示错误')
  test('拒绝后应该返回正确的错误')

  // Test 6: 安全性 (3个)
  test('CSRF 令牌应该验证')
  test('应该防止权限提升攻击')
  test('审计日志应该记录所有决策')

  // Test 7: 响应式设计 (2个)
  test('移动设备显示正确')
  test('平板设备显示正确')

  // Test 8: 可访问性 (1个)
  test('应支持键盘导航和屏幕阅读器')
})
```

**任务目标**: 完整的 E2E 测试覆盖

---

### Task 3.7: 审计日志和合规性（1小时）

#### 3.7.1 审计日志
```rust
pub struct ConsentAuditLog {
    pub id: u64,
    pub user_id: String,
    pub client_id: String,
    pub action: String,              // "approve" | "deny"
    pub requested_scopes: Vec<String>,
    pub granted_scopes: Option<Vec<String>>,
    pub timestamp: DateTime<Utc>,
    pub ip_address: String,
    pub user_agent: String,
}

// 日志记录
pub async fn log_consent_decision(
    log: ConsentAuditLog,
) -> Result<(), AppError>
```

#### 3.7.2 合规性检查清单
- ✅ 用户明确批准
- ✅ 权限描述清晰
- ✅ 敏感权限标记
- ✅ 审计日志完整
- ✅ 权限撤销机制
- ✅ GDPR 合规性

**任务目标**: 满足法律和合规要求

---

### Task 3.8: 文档和验收标准（1小时）

#### 3.8.1 文档
- API 文档
- 用户流程说明
- 权限定义和说明
- 安全考虑
- 故障排查指南

#### 3.8.2 验收标准
```
✅ 页面加载正常（< 2s）
✅ 权限信息准确
✅ 用户决策正确处理
✅ 审计日志完整
✅ E2E 测试全部通过
✅ 代码审查通过
✅ 编译无警告
✅ 文档完整
```

**任务目标**: 完成项目交付

---

## 📅 时间计划

| 任务 | 预计时间 | 实际时间 | 状态 |
|------|---------|---------|------|
| 3.1 | 2h | - | 📋 |
| 3.2 | 1h | - | 📋 |
| 3.3 | 2h | - | 📋 |
| 3.4 | 1h | - | 📋 |
| 3.5 | 1h | - | 📋 |
| 3.6 | 2h | - | 📋 |
| 3.7 | 1h | - | 📋 |
| 3.8 | 1h | - | 📋 |
| **总计** | **11h** | - | 📋 |

**预计周期**: 3 天（每天 4 小时）

---

## 🎯 成果指标

### 代码质量
- 编译无错误/警告
- 代码覆盖率 > 80%
- 所有 E2E 测试通过

### 用户体验
- 页面加载 < 2s
- 权限说明清晰
- 移动设备友好

### 安全性
- CSRF 保护完整
- 审计日志完善
- 权限验证严格

### 文档完整性
- API 文档完整
- 用户指南清晰
- 故障排查指南

---

## 📚 参考资源

### OAuth 2.1 标准
- [RFC 6749 - OAuth 2.0 Authorization Framework](https://tools.ietf.org/html/rfc6749)
- [RFC 6819 - OAuth 2.0 Security Best Current Practice](https://tools.ietf.org/html/rfc6819)

### OIDC 标准权限
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html#ScopeClaims)

### 相关实现
- [Phase 2 完成报告](./PHASE_2_COMPLETION_REPORT.md)
- [系统设计文档](./docs/2-SYSTEM_DESIGN.md)

---

**计划创建时间**: 2025-12-01
**计划审核状态**: ⏳ 等待批准
**下一步**: 开始 Task 3.1 实现
