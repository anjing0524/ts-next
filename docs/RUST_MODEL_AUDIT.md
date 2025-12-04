# Rust Model Audit (2025-12-04)

## Current Model Status
- Total models found: 137
- Models in oauth-models: 7
- Models in oauth-core: 27
- Models in oauth-sdk-napi: 2
- Duplicate definitions found: **YES**

## Detailed Findings

### oauth-models (Source of Truth) - 7 models
1. RefreshToken (refresh_token.rs)
2. Role (role.rs)
3. OAuthClient (client.rs)
4. OAuthClientDetails (client.rs)
5. Permission (permission.rs)
6. AuthCode (auth_code.rs)
7. User (user.rs)

### oauth-core - 27 models (DUPLICATES DETECTED)
Key duplicates found:
- Permission (crates/oauth-core/src/napi/modules/rbac.rs) - DUPLICATE
- Role (crates/oauth-core/src/napi/modules/rbac.rs) - DUPLICATE
- UserRole (crates/oauth-core/src/napi/modules/rbac.rs)
- ClientInfo, ClientInfoPublic (crates/oauth-core/src/napi/modules/client.rs)
- UserInfo, UserModule (crates/oauth-core/src/napi/modules/user.rs)
- SDKConfig, OAuthSDK (crates/oauth-core/src/lib.rs)
- HttpClient (crates/oauth-core/src/napi/http_client.rs)

### oauth-sdk-napi - 2 models
Minimal models, likely wrappers

## Dependencies
- oauth-core depends on oauth-models: [TO BE VERIFIED]
- oauth-sdk-napi depends on oauth-models: [TO BE VERIFIED]

## Issues Identified
1. **Permission and Role are duplicated** in oauth-core/src/napi/modules/rbac.rs
2. These should be imported from oauth-models instead
3. oauth-core has 27 models when it should primarily use oauth-models

## Recommendations
1. Remove duplicate Permission and Role definitions from oauth-core
2. Update oauth-core to import from oauth-models
3. Verify all crates properly depend on oauth-models
4. Consolidate any missing models to oauth-models if needed
