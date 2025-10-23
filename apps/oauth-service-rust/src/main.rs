use oauth_service_rust::{config, create_app};
use std::{net::SocketAddr, sync::Arc};
use tokio::net::TcpListener;

#[tokio::main]
async fn main() -> Result<(), anyhow::Error> {
    // 日志和跟踪初始化
    tracing_subscriber::fmt::init();

    // 加载配置
    let config = Arc::new(config::Config::from_env()?);

    // 创建数据库连接池
    let pool = Arc::new(sqlx::SqlitePool::connect(&config.database_url).await?);

    // 创建应用
    let app = create_app(pool.clone(), config.clone()).await;

    tracing::info!("Application state initialized successfully.");
    tracing::info!("Database connected.");
    tracing::info!("JWT keys loaded.");

    // 启动服务器
    let addr = SocketAddr::from(([127, 0, 0, 1], 3001));
    tracing::info!("OAuth service listening on {}", addr);
    let listener = TcpListener::bind(&addr).await?;
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .await?;

    Ok(())
}
