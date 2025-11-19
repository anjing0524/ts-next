# SQLx Code Examples: Good Practices & Issues

## 1. GOOD: Parameterized Queries (SQL Injection Prevention)

### Example from user_service.rs (Lines 49-53)
```rust
// GOOD: User input is parameterized
let user = sqlx::query_as::<_, User>("SELECT * FROM users WHERE username = ?")
    .bind(username)  // ✅ Parameter binding - prevents SQL injection
    .fetch_optional(&*self.db)
    .await?;
```

### Example from db.rs (Lines 121-126)
```rust
// GOOD: Even hardcoded values use bind() pattern
let existing = sqlx::query_scalar::<_, String>(
    "SELECT id FROM users WHERE username = 'admin' LIMIT 1"
)
.fetch_optional(pool)
.await
.map_err(|e| ServiceError::Internal(format!("Failed to check admin user: {}", e)))?;

// Alternative safer approach:
let existing = sqlx::query_scalar::<_, String>(
    "SELECT id FROM users WHERE username = ?"
)
.bind("admin")  // ✅ Even hardcoded values should use bind()
.fetch_optional(pool)
.await?;
```

---

## 2. GOOD: Type-Safe Queries with FromRow

### Example from models/user.rs
```rust
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct User {
    pub id: String,
    pub username: String,
    pub password_hash: String,
    pub is_active: bool,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
    pub last_login_at: Option<chrono::DateTime<chrono::Utc>>,
    pub display_name: Option<String>,
    pub failed_login_attempts: i32,
    pub locked_until: Option<chrono::DateTime<chrono::Utc>>,
}

// Usage - Type-safe deserialization
let user = sqlx::query_as::<_, User>(
    "SELECT * FROM users WHERE id = ?"
)
.bind(user_id)
.fetch_one(&pool)
.await?;
// ✅ If database schema doesn't match struct, compilation error at build time
```

### Example from models/client.rs
```rust
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type, PartialEq)]
#[sqlx(type_name = "ClientType", rename_all = "UPPERCASE")]
pub enum ClientType {
    PUBLIC,
    CONFIDENTIAL,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct OAuthClient {
    pub id: String,
    pub client_id: String,
    pub client_secret: Option<String>,
    pub name: String,
    pub client_type: ClientType,  // ✅ Enum types properly mapped
    pub is_active: bool,
    pub access_token_ttl: i32,
    pub refresh_token_ttl: i32,
    // ... more fields
}
```

---

## 3. GOOD: NULL Handling with Option<T>

### Example from user_service.rs
```rust
// Schema field can be NULL
pub last_login_at: Option<chrono::DateTime<chrono::Utc>>,

// Proper handling in code
async fn update_last_login(&self, user_id: &str) -> Result<(), ServiceError> {
    let now = Utc::now();
    sqlx::query("UPDATE users SET last_login_at = ? WHERE id = ?")
        .bind(now)  // ✅ Binds non-NULL value
        .bind(user_id)
        .execute(&*self.db)
        .await?;
    Ok(())
}

// Reading from database respects None option
if let Some(last_login) = user.last_login_at {
    println!("Last login: {}", last_login);
} else {
    println!("User has never logged in");
}
```

### Example from db.rs (Seed data)
```rust
// GOOD: NULL values explicitly handled
sqlx::query(
    "INSERT INTO users (id, username, password_hash, display_name, is_active, must_change_password)
     VALUES (?, ?, ?, ?, ?, ?)"
)
.bind(&user_id)
.bind("admin")
.bind(password_hash)
.bind("Administrator")  // ✅ Explicit value for display_name
.bind(true)
.bind(true)  // must_change_password
.execute(pool)
.await?;
```

---

## 4. EXCELLENT: Concurrent Queries (N+1 Prevention)

### Example from client_service.rs (Lines 69-113)
```rust
// EXCELLENT: All 6 queries run in parallel instead of sequentially
let (redirect_uris, grant_types, response_types, allowed_scopes, 
     client_permissions, ip_whitelist) = tokio::join!(
    async {
        sqlx::query_scalar("SELECT uri FROM client_redirect_uris WHERE client_id = ?")
            .bind(&client.id)
            .fetch_all(&*self.db)
            .await
            .unwrap_or_default()
    },
    async {
        sqlx::query_scalar("SELECT grant_type FROM client_grant_types WHERE client_id = ?")
            .bind(&client.id)
            .fetch_all(&*self.db)
            .await
            .unwrap_or_default()
    },
    async {
        sqlx::query_scalar("SELECT response_type FROM client_response_types WHERE client_id = ?")
            .bind(&client.id)
            .fetch_all(&*self.db)
            .await
            .unwrap_or_default()
    },
    async {
        sqlx::query_scalar("SELECT scope FROM client_allowed_scopes WHERE client_id = ?")
            .bind(&client.id)
            .fetch_all(&*self.db)
            .await
            .unwrap_or_default()
    },
    async {
        sqlx::query_scalar("SELECT permission FROM client_permissions WHERE client_id = ?")
            .bind(&client.id)
            .fetch_all(&*self.db)
            .await
            .unwrap_or_default()
    },
    async {
        sqlx::query_scalar("SELECT ip_address FROM client_ip_whitelist WHERE client_id = ?")
            .bind(&client.id)
            .fetch_all(&*self.db)
            .await
            .unwrap_or_default()
    }
);
```

**Performance Impact:**
- Without optimization: 6 queries × ~5ms = ~30ms total
- With `tokio::join!()`: 6 queries in parallel = ~5ms total
- **6x improvement!**

### Example from rbac_service.rs (Lines 51-59) - Using JOINs
```rust
// EXCELLENT: Single query with JOINs instead of N separate queries
let permissions = sqlx::query_as::<_, Permission>(
    "SELECT p.name FROM permissions p
     JOIN role_permissions rp ON p.id = rp.permission_id
     JOIN user_roles ur ON rp.role_id = ur.role_id
     WHERE ur.user_id = ?"
)
.bind(user_id)
.fetch_all(&*self.db)
.await?;

let permission_names: Vec<String> = permissions
    .into_iter()
    .map(|p| p.name)
    .collect();
```

---

## 5. GOOD: Transaction Management

### Example from client_service.rs (Lines 196-269)
```rust
// GOOD: Transaction for multi-statement operation
let mut tx = self.db.begin().await?;

sqlx::query(
    r#"
    INSERT INTO oauth_clients (
        id, client_id, client_secret, name, client_type,
        is_active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    "#,
)
.bind(&id)
.bind(&client_id)
.bind(&client_secret_hash)
.bind(&request.name)
.bind(&client_type_str)
.bind(true)
.bind(&now)
.bind(&now)
.execute(&mut *tx)  // ✅ Using transaction
.await?;

for uri in &request.redirect_uris {
    sqlx::query("INSERT INTO client_redirect_uris (client_id, uri) VALUES (?, ?)")
        .bind(&id)
        .bind(uri)
        .execute(&mut *tx)  // ✅ Same transaction
        .await?;
}

for grant in &request.grant_types {
    sqlx::query("INSERT INTO client_grant_types (client_id, grant_type) VALUES (?, ?)")
        .bind(&id)
        .bind(grant)
        .execute(&mut *tx)  // ✅ Same transaction
        .await?;
}

// ... more inserts ...

tx.commit().await?;  // ✅ All operations committed atomically
```

### Example from auth_code_service.rs (Lines 77-118) - Preventing Code Reuse
```rust
// GOOD: Transaction prevents authorization code reuse attacks
let mut tx = self.db.begin().await?;

// Find the code
let auth_code = sqlx::query_as::<_, AuthCode>(
    "SELECT * FROM authorization_codes WHERE code = ?"
)
.bind(code)
.fetch_optional(&mut *tx)  // ✅ In transaction
.await?
.ok_or_else(|| ServiceError::ValidationError("Invalid authorization code".to_string()))?;

// Prevent reuse
if auth_code.is_used {
    return Err(ServiceError::ValidationError(
        "Authorization code has already been used".to_string(),
    ));
}

// Check expiration
if auth_code.expires_at < Utc::now() {
    return Err(ServiceError::ValidationError(
        "Authorization code has expired".to_string(),
    ));
}

// Mark as used atomically
sqlx::query("UPDATE authorization_codes SET is_used = TRUE WHERE id = ?")
    .bind(&auth_code.id)
    .execute(&mut *tx)  // ✅ Same transaction
    .await?;

tx.commit().await?;  // ✅ Commit ensures atomicity
```

### Example from client_service.rs (Lines 325-327) - Pessimistic Locking
```rust
// GOOD: Use FOR UPDATE for concurrent updates
let existing_client = sqlx::query_as::<_, OAuthClient>(
    "SELECT * FROM oauth_clients WHERE client_id = ? FOR UPDATE"  // ✅ Locks row
)
.bind(client_id)
.fetch_optional(&mut *tx)
.await?
.ok_or_else(|| ServiceError::NotFound(format!("Client '{client_id}' not found")))?;
```

---

## 6. ISSUE: Missing Transaction for Token Refresh (token_service.rs:217-247)

```rust
// ⚠️ ISSUE: These operations should be atomic!
async fn refresh_token(&self, refresh_token: &str) -> Result<TokenPair, ServiceError> {
    let decoding_key = self.config.load_decoding_key()?;
    let claims = jwt::verify_token(refresh_token, &decoding_key)?;

    let jti = claims.jti.clone();
    let stored_token = sqlx::query_as::<_, RefreshToken>(
        "SELECT * FROM refresh_tokens WHERE jti = ?"
    )
    .bind(&jti)
    .fetch_optional(&*self.db)  // ⚠️ No transaction
    .await?
    .ok_or_else(|| ServiceError::Unauthorized("Invalid refresh token".to_string()))?;

    if stored_token.is_revoked {
        return Err(ServiceError::Unauthorized("Refresh token has been revoked".to_string()));
    }

    if stored_token.expires_at < Utc::now() {
        return Err(ServiceError::Unauthorized("Refresh token has expired".to_string()));
    }

    // ⚠️ ISSUE: Revoke old token...
    let now = Utc::now();
    sqlx::query("UPDATE refresh_tokens SET is_revoked = TRUE, revoked_at = ? WHERE id = ?")
        .bind(&now)
        .bind(&stored_token.id)
        .execute(&*self.db)  // ⚠️ NOT in transaction!
        .await?;

    // ⚠️ ISSUE: Then issue new token...
    let client = self.client_service
        .find_by_client_id(&claims.client_id)
        .await?
        .ok_or_else(|| ServiceError::NotFound(format!("Client {} not found", claims.client_id)))?;

    let user_id = claims.sub.ok_or_else(|| 
        ServiceError::ValidationError("User ID missing in refresh token claims".to_string())
    )?;
    let permissions = self.rbac_service.get_user_permissions(&user_id).await?;

    // ⚠️ PROBLEM: If issue_tokens fails here, old token is revoked but user has no new token!
    self.issue_tokens(&client, Some(user_id), claims.scope, permissions, None).await
}
```

### Better Implementation:
```rust
// ✅ FIXED: Use transaction for atomic operation
async fn refresh_token(&self, refresh_token: &str) -> Result<TokenPair, ServiceError> {
    let decoding_key = self.config.load_decoding_key()?;
    let claims = jwt::verify_token(refresh_token, &decoding_key)?;

    // ✅ Start transaction
    let mut tx = self.db.begin().await?;

    let jti = claims.jti.clone();
    let stored_token = sqlx::query_as::<_, RefreshToken>(
        "SELECT * FROM refresh_tokens WHERE jti = ?"
    )
    .bind(&jti)
    .fetch_optional(&mut *tx)  // ✅ In transaction
    .await?
    .ok_or_else(|| ServiceError::Unauthorized("Invalid refresh token".to_string()))?;

    if stored_token.is_revoked {
        return Err(ServiceError::Unauthorized("Refresh token has been revoked".to_string()));
    }

    if stored_token.expires_at < Utc::now() {
        return Err(ServiceError::Unauthorized("Refresh token has expired".to_string()));
    }

    let now = Utc::now();
    
    // ✅ Revoke old token in transaction
    sqlx::query("UPDATE refresh_tokens SET is_revoked = TRUE, revoked_at = ? WHERE id = ?")
        .bind(&now)
        .bind(&stored_token.id)
        .execute(&mut *tx)  // ✅ In transaction
        .await?;

    // ✅ Commit before issuing new token to ensure revocation persists
    tx.commit().await?;

    // Now issue new token (if fails, old token is already revoked)
    let client = self.client_service
        .find_by_client_id(&claims.client_id)
        .await?
        .ok_or_else(|| ServiceError::NotFound(format!("Client {} not found", claims.client_id)))?;

    let user_id = claims.sub.ok_or_else(|| 
        ServiceError::ValidationError("User ID missing in refresh token claims".to_string())
    )?;
    let permissions = self.rbac_service.get_user_permissions(&user_id).await?;

    // ✅ If this fails, old token is already revoked (acceptable failure mode)
    self.issue_tokens(&client, Some(user_id), claims.scope, permissions, None).await
}
```

---

## 7. GOOD: Error Handling with Context

### Example from client_service.rs (Lines 134-137)
```rust
// GOOD: Specific error handling with context
let client_details = self
    .find_by_client_id(client_id)
    .await?
    .ok_or_else(|| ServiceError::NotFound(format!("Client '{client_id}' not found")))?;
//                                                     ↑
//                                    ✅ Includes actual client_id value
```

### Example from auth_code_service.rs (Lines 85-88)
```rust
// GOOD: Includes relevant context in error
.fetch_optional(&mut *tx)
.await?
.ok_or_else(|| {
    tracing::warn!("Authorization code not found: {}", code);
    ServiceError::ValidationError("Invalid authorization code".to_string())
})?;
//  ↑ Also logs warning with code value
```

### Potential Issue - Missing Context:
```rust
// ⚠️ BAD: No context about which client failed
let client_details = self.find_by_client_id(&client_id).await?.ok_or_else(|| {
    ServiceError::Internal("Failed to retrieve created client".to_string())
})?;

// ✅ BETTER: Include the client_id
let client_details = self.find_by_client_id(&client_id).await?.ok_or_else(|| {
    ServiceError::Internal(format!("Failed to retrieve created client: {}", client_id))
})?;
```

---

## 8. GOOD: Permission Caching

### Example from rbac_service.rs (Lines 42-71)
```rust
async fn get_user_permissions(&self, user_id: &str) -> Result<Vec<String>, ServiceError> {
    // 1. Try cache first (memory lookup - instant)
    if let Some(cached_perms) = self.permission_cache.get(user_id).await {
        tracing::debug!("Permission cache hit for user: {}", user_id);
        return Ok(cached_perms);  // ✅ Return cached result
    }

    // 2. Cache miss - query database (slower path)
    tracing::debug!("Permission cache miss for user: {}, querying database", user_id);
    let permissions = sqlx::query_as::<_, Permission>(
        "SELECT p.name FROM permissions p
         JOIN role_permissions rp ON p.id = rp.permission_id
         JOIN user_roles ur ON rp.role_id = ur.role_id
         WHERE ur.user_id = ?"
    )
    .bind(user_id)
    .fetch_all(&*self.db)
    .await?;

    let permission_names: Vec<String> = permissions
        .into_iter()
        .map(|p| p.name)
        .collect();

    // 3. Cache result with 5-minute TTL
    if let Err(e) = self.permission_cache
        .set(user_id, permission_names.clone(), PERMISSION_CACHE_TTL)
        .await {
        tracing::warn!("Failed to cache permissions for user {}: {}", user_id, e);
        // Don't fail if cache fails - permissions still returned
    }

    Ok(permission_names)
}
```

### Cache Implementation (permission_cache.rs):
```rust
#[async_trait]
impl PermissionCache for InMemoryPermissionCache {
    async fn get(&self, user_id: &str) -> Option<Vec<String>> {
        let mut cache = self.cache.write().await;

        if let Some(entry) = cache.get(user_id) {
            if entry.is_expired() {
                cache.remove(user_id);
                *self.misses.write().await += 1;
                return None;
            }

            *self.hits.write().await += 1;  // ✅ Track hit rate
            return Some(entry.permissions.clone());
        }

        *self.misses.write().await += 1;  // ✅ Track miss rate
        None
    }

    async fn set(
        &self,
        user_id: &str,
        permissions: Vec<String>,
        ttl_seconds: i64,
    ) -> Result<(), CacheError> {
        let entry = CacheEntry {
            permissions,
            created_at: Utc::now(),
            ttl_seconds,
        };

        let mut cache = self.cache.write().await;
        cache.insert(user_id.to_string(), entry);
        Ok(())
    }

    async fn stats(&self) -> CacheStats {
        let cache = self.cache.read().await;
        let hits = *self.hits.read().await;
        let misses = *self.misses.read().await;
        let total = hits + misses;
        let hit_rate = if total > 0 {
            (hits as f64 / total as f64) * 100.0
        } else {
            0.0
        };

        CacheStats {
            total_entries: cache.len(),
            hits,
            misses,
            hit_rate,  // ✅ Can monitor cache effectiveness
        }
    }
}
```

---

## 9. ISSUE: SELECT * Brittleness

```rust
// ⚠️ ISSUE: Uses SELECT *
let user = sqlx::query_as::<_, User>("SELECT * FROM users WHERE username = ?")
    .bind(username)
    .fetch_optional(&*self.db)
    .await?;

// Problem: If someone adds a column in the wrong position in the table,
// or changes column order, the FromRow deserialization will fail at runtime

// ✅ BETTER: Be explicit
let user = sqlx::query_as::<_, User>(
    "SELECT 
        id, username, password_hash, is_active, created_at, updated_at,
        last_login_at, display_name, first_name, last_name, avatar,
        organization, department, must_change_password, failed_login_attempts,
        locked_until, created_by
     FROM users 
     WHERE username = ?"
)
.bind(username)
.fetch_optional(&*self.db)
.await?;
```

---

## 10. GOOD: Test Database Setup

### Example from comprehensive_service_tests.rs (Lines 22-36)
```rust
async fn setup_test_db() -> SqlitePool {
    // Set JWT_SECRET for testing
    std::env::set_var(
        "JWT_SECRET", 
        "test_jwt_secret_key_for_testing_only_do_not_use_in_production"
    );
    
    // ✅ Use in-memory database for tests (fast, isolated)
    let pool = SqlitePool::connect(":memory:")
        .await
        .expect("Failed to create in-memory database");

    // ✅ Load migrations to set up schema
    let initial_schema_sql = include_str!("../migrations/001_initial_schema.sql");
    sqlx::query(initial_schema_sql)
        .execute(&pool)
        .await
        .expect("Failed to run initial schema migration");

    pool
}

// Usage:
#[tokio::test]
async fn test_list_users_with_pagination() {
    let pool = Arc::new(setup_test_db().await);  // ✅ Fresh database per test
    let service = UserServiceImpl::new(pool.clone());

    for i in 0..5 {
        service.create_user(
            format!("user{i}"),
            "password123".to_string(),
            Some(format!("User {i}")),
        )
        .await
        .unwrap();
    }

    let users = service.list_users(None, None).await.unwrap();
    assert_eq!(users.len(), 5);
}
```

---

## Summary: Best Practices Checklist

- ✅ Always use `.bind()` for parameters
- ✅ Use `query_as::<_, T>` with FromRow for type safety
- ✅ Use `Option<T>` for nullable columns
- ✅ Use transactions for multi-statement operations
- ✅ Use `tokio::join!()` or `futures::join_all()` for parallel queries
- ✅ Use JOINs instead of N separate queries
- ✅ Include context in error messages
- ✅ Cache expensive queries with proper TTL
- ✅ Use in-memory databases for tests
- ✅ Test with migrations to ensure schema compatibility

---

## Anti-Patterns to Avoid

- ❌ Never concatenate user input into SQL strings
- ❌ Don't use SELECT * in production code
- ❌ Don't hold transactions across await points longer than necessary
- ❌ Don't ignore transient database errors without retry logic
- ❌ Don't mix transaction scopes across multiple functions
- ❌ Don't cache results without TTL/invalidation strategy
- ❌ Don't use unwrap() in query results

