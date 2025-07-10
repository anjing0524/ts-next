use anyhow::Result;
use clap::Parser;
use pingora::prelude::*;
use pingora::server::configuration::Opt;
use pingora::lb::health_check::TcpHealthCheck;
use pingora::lb::selection::RoundRobin;
use std::sync::Arc;
use std::time::Duration;
use tracing::info;

mod config;
mod proxy;

use config::Settings;
use proxy::ProxyService;

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
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();
    
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
        let mut lb = LoadBalancer::<RoundRobin>::try_from_iter(&service_config.upstreams)?;

        let mut health_check = TcpHealthCheck::new();
        health_check.peer_template.options.connection_timeout =
            Some(Duration::from_millis(service_config.health_check.timeout_ms));
        lb.set_health_check(health_check);
        lb.health_check_frequency =
            Some(Duration::from_secs(service_config.health_check.frequency_secs));

        let proxy_service = ProxyService {
            upstreams: Arc::new(lb),
            service_name: Arc::from(service_config.name.as_str()),
            use_tls: service_config.tls,
        };

        let mut service = http_proxy_service(&my_server.configuration, proxy_service);
        service.add_tcp(&service_config.bind_address);
        my_server.add_service(service);
        info!(
            "Starting service '{}' at {}",
            service_config.name, service_config.bind_address
        );
    }

    my_server.run_forever();
}
