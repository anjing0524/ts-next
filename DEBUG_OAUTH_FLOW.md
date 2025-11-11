# OAuth 流程深度调试指南

## 问题诊断

尽管进行了多项代码修改，E2E 测试仍然显示死循环重定向问题。需要逐步验证每个环节。

## 关键检查点

### 1. 验证登录请求的响应类型

**目标**：确保 `/api/v2/auth/login` 返回正确的 JSON 响应

**步骤**：
```bash
# 启动服务
cd /Users/liushuo/code/ts-next-template
bash run-integration-tests.sh &

# 等待服务启动
sleep 10

# 直接测试登录端点
curl -X POST http://localhost:6188/api/v2/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "admin123",
    "redirect": "http://localhost:6188/api/v2/oauth/authorize?client_id=auth-center-admin-client"
  }' \
  -v 2>&1 | tee /tmp/login_response.log

# 检查：
# 1. HTTP 状态码应该是 200（不是 302）
# 2. Content-Type 应该包含 application/json
# 3. 响应体应该包含 {"success": true, "redirect_url": "..."}
# 4. Set-Cookie header 应该存在
```

### 2. 验证 Set-Cookie 是否被传递

**目标**：确保浏览器接收到 session_token cookie

**步骤**：
```bash
# 检查响应的 Set-Cookie headers
grep -i "set-cookie" /tmp/login_response.log

# 应该看到类似：
# Set-Cookie: session_token=<jwt_value>; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600
```

### 3. 验证 Cookie 在后续请求中被发送

**目标**：确保浏览器在发送 authorize 请求时包含 cookie

**步骤**：
```bash
# 从响应中提取 cookie
curl -c /tmp/cookies.txt -X POST http://localhost:6188/api/v2/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "admin123",
    "redirect": "http://localhost:6188/api/v2/oauth/authorize?client_id=auth-center-admin-client"
  }' 2>&1 > /dev/null

# 检查是否保存了 cookie
cat /tmp/cookies.txt

# 使用 cookie 发送 authorize 请求
curl -b /tmp/cookies.txt \
  "http://localhost:6188/api/v2/oauth/authorize?client_id=auth-center-admin-client&redirect_uri=http://localhost:6188/auth/callback&response_type=code&scope=openid+profile+email&state=test123&code_challenge=test&code_challenge_method=S256" \
  -v 2>&1 | tee /tmp/authorize_response.log

# 检查：
# 1. 是否看到 "Found session_token cookie" 日志（如果启用了日志）
# 2. 响应是否是 302 重定向到 /auth/callback（成功）或 /login（失败）
```

### 4. 检查 OAuth Service 日志

**步骤**：
```bash
# 查看 OAuth Service 日志中的关键信息
ps aux | grep oauth-service-rust | grep -v grep | awk '{print $2}' | xargs kill -9 2>/dev/null

# 以 debug 日志级别重启
RUST_LOG=debug /Users/liushuo/code/ts-next-template/apps/oauth-service-rust/target/debug/oauth-service-rust &

# 等待启动
sleep 5

# 重新运行测试
curl -X POST http://localhost:6188/api/v2/auth/login ...

# 查看 OAuth Service 的输出，查找：
# - "Cookies received in authorize request:"
# - "Found session_token cookie"
# - "Session token validated successfully"
```

## 可能的问题和解决方案

### 问题 A：login 端点返回 302 而不是 200 JSON

**症状**：curl 显示 Location header，没有 JSON 响应

**原因**：可能代码没有被正确编译或部署

**解决**：
```bash
# 重新编译
cd /Users/liushuo/code/ts-next-template/apps/oauth-service-rust
cargo build

# 停止旧进程
pkill -f oauth-service-rust

# 重启
./target/debug/oauth-service-rust
```

### 问题 B：浏览器没有发送 Cookie header

**症状**：authorize 请求中没有 Cookie header

**原因**：
1. Cookie domain 不匹配
2. Cookie secure flag 要求 HTTPS
3. SameSite 设置过于严格

**解决**：
```bash
# 检查 Set-Cookie 的细节
grep -i "set-cookie:" /tmp/login_response.log

# 如果看到 Secure 但使用 HTTP，这就是问题
# 需要确保：
# - Domain 不设置（或匹配 localhost）
# - Secure 只在生产环境启用
# - SameSite=Lax（已设置）

# 手动设置 cookie 来测试
curl -H "Cookie: session_token=<token_value>" \
  "http://localhost:6188/api/v2/oauth/authorize?..." \
  -v
```

### 问题 C：authorize 端点仍然检测不到 cookie

**症状**：日志显示"No session_token cookie found"

**原因**：
1. Pingora 没有转发 Cookie header
2. Cookie 被某个地方过滤了

**解决**：
```bash
# 检查 Pingora 的日志
grep "session_token" /Users/liushuo/code/ts-next-template/pingora.log

# 直接访问 OAuth Service（绕过 Pingora）
curl -c /tmp/cookies2.txt -X POST http://localhost:3001/api/v2/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "admin123"}'

# 使用 cookie 访问 authorize
curl -b /tmp/cookies2.txt \
  "http://localhost:3001/api/v2/oauth/authorize?..." \
  -v 2>&1 | grep -E "session_token|Location"
```

## 快速验证脚本

创建 `/tmp/test_oauth.sh`：

```bash
#!/bin/bash

echo "=== Testing OAuth Flow ==="

# 1. Test login endpoint
echo -e "\n1. Testing POST /api/v2/auth/login"
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:6188/api/v2/auth/login \
  -H "Content-Type: application/json" \
  -D /tmp/response_headers.txt \
  -d '{
    "username": "admin",
    "password": "admin123",
    "redirect": "http://localhost:6188/api/v2/oauth/authorize?client_id=auth-center-admin-client&redirect_uri=http://localhost:6188/auth/callback&response_type=code&scope=openid+profile+email&state=test&code_challenge=test&code_challenge_method=S256"
  }')

echo "Response:"
echo "$LOGIN_RESPONSE" | jq . 2>/dev/null || echo "$LOGIN_RESPONSE"

echo -e "\nResponse Headers:"
cat /tmp/response_headers.txt | grep -i "set-cookie\|content-type"

# 2. Extract session_token if present
SESSION_TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.success' 2>/dev/null)
if [ "$SESSION_TOKEN" = "true" ]; then
  echo -e "\n✅ Login successful, checking for Set-Cookie..."
  REDIRECT_URL=$(echo "$LOGIN_RESPONSE" | jq -r '.redirect_url')
  echo "Redirect URL: $REDIRECT_URL"
fi
```

运行：
```bash
bash /tmp/test_oauth.sh
```

## 最可能的根本原因

基于架构分析，最可能的问题是：

1. **浏览器没有发送 Cookie** - 因为 cookie 被设置为只对特定的 domain/port，但浏览器请求的 port 不匹配
2. **Pingora 过滤了 Cookie header** - 虽然代码中看不到，但 Pingora 库的默认行为可能这样做
3. **OAuth Service 的 LoginResponse 序列化失败** - 导致返回错误的响应格式

## 下一步

1. 运行上述测试脚本
2. 检查 Set-Cookie header 的详细内容
3. 验证 Cookie 是否在后续请求中被发送
4. 如果 Cookie 没有被发送，排查原因（domain/secure/etc）
5. 如果 Cookie 被发送但 authorize 仍然失败，检查 OAuth Service 的 extract_user_id_from_request 逻辑

---

**关键：直接使用 curl 测试比运行 Playwright 测试更能快速隔离问题！**
