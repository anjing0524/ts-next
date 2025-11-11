use anyhow::Result;
use clap::Parser;
use pingora::prelude::*;
use pingora::server::configuration::Opt;
use pingora::lb::health_check::TcpHealthCheck;
use pingora::lb::selection::RoundRobin;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tracing::info;

mod config;
mod proxy;

use config::Settings;
use proxy::{ProxyService, Backend};

#[derive(Parser)]
#[command(name = "pingora-proxy")]
#[command(about = "A high-performance reverse proxy based on Pingora")]
struct Args {
    #[arg(short, long, default_value = "config/default.yaml")]
    config: String,
    #[arg(long)]
    daemon: bool,
}

fn main() -> Result<()> {
    let log_file = std::fs::File::create("pingora.log")?;
    let subscriber = tracing_subscriber::fmt()
        .with_writer(log_file)
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .finish();
    tracing::subscriber::set_global_default(subscriber)?;

    let args = Args::parse();

    let settings = Settings::from_file(&args.config)?;
    settings.validate()?;
    info!("Configuration loaded and validated from {}", args.config);

    let opt = Opt {
        daemon: args.daemon,
        ..Default::default()
    };

    let mut my_server = Server::new(Some(opt))?;
    my_server.bootstrap();

    for service_config in settings.services {
        let mut backends = HashMap::new();

        // 为每个后端创建负载均衡器
        for (backend_name, backend_config) in service_config.backends.iter() {
            let mut lb = LoadBalancer::<RoundRobin>::try_from_iter(&backend_config.upstreams)?;

            let mut health_check = TcpHealthCheck::new();
            health_check.peer_template.options.connection_timeout =
                Some(Duration::from_millis(service_config.health_check.timeout_ms));
            lb.set_health_check(health_check);
            lb.health_check_frequency =
                Some(Duration::from_secs(service_config.health_check.frequency_secs));

            backends.insert(
                backend_name.clone(),
                Backend {
                    name: backend_name.clone(),
                    load_balancer: Arc::new(lb),
                    use_tls: backend_config.tls,
                },
            );

            info!(
                "Backend '{}' configured with {} upstreams",
                backend_name,
                backend_config.upstreams.len()
            );
        }

        let proxy_service = ProxyService {
            service_name: Arc::from(service_config.name.as_str()),
            routes: Arc::new(service_config.routes.clone()),
            backends: Arc::new(backends),
            default_backend: Arc::from(service_config.default_backend.as_str()),
        };

        let mut service = http_proxy_service(&my_server.configuration, proxy_service);
        service.add_tcp(&service_config.bind_address);
        my_server.add_service(service);
        info!(
            "Starting service '{}' at {} with {} routes and default backend '{}'",
            service_config.name,
            service_config.bind_address,
            service_config.routes.len(),
            service_config.default_backend
        );
    }

    my_server.run_forever();
}
