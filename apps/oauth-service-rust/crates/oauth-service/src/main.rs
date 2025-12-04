use oauth_service::{config, create_app, initialize_database};
use std::{net::SocketAddr, sync::Arc};
use tokio::net::TcpListener;
use sqlx::SqlitePool;

#[tokio::main]
async fn main() -> Result<(), anyhow::Error> {
    // 日志和跟踪初始化
    tracing_subscriber::fmt::init();

    tracing::info!("=== OAuth 2.1 Service Starting ===");

    // 加载配置
    let config = Arc::new(config::Config::from_env()?);
    tracing::info!("Configuration loaded successfully");

    // 初始化数据库（包括迁移和种子数据）
    tracing::info!("Initializing database...");
    let pool: Arc<SqlitePool> = Arc::new(initialize_database(&config.database_url).await?);
    tracing::info!("✅ Database initialized successfully (migrations + seed data)");

    // 创建应用
    let app = create_app(pool.clone(), config.clone()).await;
    tracing::info!("✅ Application state initialized successfully");
    tracing::info!("✅ JWT keys loaded");

    // 启动服务器
    let addr = SocketAddr::from(([127, 0, 0, 1], 3001));
    tracing::info!("✅ OAuth service listening on http://{}", addr);
    tracing::info!("=== OAuth 2.1 Service Ready ===\n");

    let listener = TcpListener::bind(&addr).await?;
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .await?;

    Ok(())
}
