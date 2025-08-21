use clap::{Parser, Subcommand};
use std::path::PathBuf;
use tracing::{error, info};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};
use zmq_log_server::{LogConfig, ZmqLogServer};

#[derive(Parser)]
#[command(name = "zmq-log-server")]
#[command(about = "High-performance ZMQ-based logging server")]
#[command(version = "0.1.0")]
struct Cli {
    #[command(subcommand)]
    command: Option<Commands>,
    
    /// Configuration file path
    #[arg(short, long, default_value = "config/config.toml")]
    config: PathBuf,
    
    /// Log level
    #[arg(short, long, default_value = "info")]
    log_level: String,
    
    /// Enable verbose logging
    #[arg(short, long)]
    verbose: bool,
}

#[derive(Subcommand)]
enum Commands {
    /// Start the server
    Start,
    /// Validate configuration
    Validate,
    /// Generate default configuration
    GenerateConfig,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();
    
    // Initialize logging
    init_logging(&cli.log_level, cli.verbose);
    
    match cli.command.unwrap_or(Commands::Start) {
        Commands::Start => {
            info!("Starting ZMQ Log Server");
            
            // Load configuration
            let config = load_config(&cli.config).await.unwrap_or_else(|_| LogConfig::default());
            info!("Configuration loaded successfully");
            
            // Create and start server
            let server = ZmqLogServer::new(config).await?;
            server.start().await?;
            
            info!("Server stopped");
        }
        Commands::Validate => {
            info!("Validating configuration");
            let config = load_config(&cli.config).await.unwrap_or_else(|_| LogConfig::default());
            info!("Configuration is valid: {:?}", config);
        }
        Commands::GenerateConfig => {
            info!("Generating default configuration");
            let config = LogConfig::default();
            let config_content = toml::to_string_pretty(&config)?;
            std::fs::write(&cli.config, config_content)?;
            info!("Default configuration written to: {:?}", cli.config);
        }
    }
    
    Ok(())
}

async fn load_config(path: &PathBuf) -> anyhow::Result<LogConfig> {
    if !path.exists() {
        error!("Configuration file not found: {:?}", path);
        return Err(anyhow::anyhow!("Configuration file not found"));
    }
    
    let config_content = tokio::fs::read_to_string(path).await?;
    let config: LogConfig = toml::from_str(&config_content)?;
    
    Ok(config)
}

fn init_logging(level: &str, verbose: bool) {
    let level = if verbose {
        "trace".to_string()
    } else {
        level.to_string()
    };
    
    let filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new(level));
    
    tracing_subscriber::registry()
        .with(filter)
        .with(tracing_subscriber::fmt::layer())
        .init();
}