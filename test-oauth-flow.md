# OAuth 2.1 集成验证测试

## 测试目标
验证 admin-portal 和 oauth-service 之间的无状态登录授权流程完整性

## 测试环境
- oauth-service: http://localhost:3001
- admin-portal: http://localhost:3002

## 测试步骤

### 1. 客户端注册验证
```bash
# 检查admin-portal客户端是否已注册
curl -X GET http://localhost:3001/api/v2/clients/auth-center-admin-client
```

### 2. 授权端点验证
```bash
# 构建授权请求
http://localhost:3001/api/v2/oauth/authorize?\
client_id=auth-center-admin-client&\
redirect_uri=http://localhost:3002/auth/callback&\
response_type=code&\
scope=openid profile email user:read user:write role:read role:write permission:read permission:write client:read client:write audit:read&\
state=test123&\
code_challenge=challenge123&\
code_challenge_method=S256
```

### 3. 登录流程验证
1. 访问 http://localhost:3002/login
2. 验证是否重定向到 OAuth 授权端点
3. 验证PKCE参数是否正确传递

### 4. 令牌交换验证
```bash
# 模拟令牌交换
curl -X POST http://localhost:3001/api/v2/oauth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code&code=AUTH_CODE&redirect_uri=http://localhost:3002/auth/callback&client_id=auth-center-admin-client&code_verifier=verifier123"
```

### 5. 用户信息验证
```bash
# 获取用户信息
curl -X GET http://localhost:3001/api/v2/oauth/userinfo \
  -H "Authorization: Bearer ACCESS_TOKEN"
```

## 验证清单

### ✅ OAuth 2.1 规范验证
- [ ] 授权码流程支持
- [ ] PKCE 强制要求
- [ ] state 参数CSRF保护
- [ ] 重定向URI验证

### ✅ 集成验证
- [ ] admin-portal → oauth-service 重定向
- [ ] 授权码正确返回
- [ ] 令牌交换成功
- [ ] 用户信息获取成功

### ✅ 权限验证
- [ ] 作用域权限正确映射
- [ ] RBAC权限验证
- [ ] 审计日志记录