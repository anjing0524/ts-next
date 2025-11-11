use napi_derive::napi;
use std::sync::Arc;
use tokio::runtime::Runtime;
use zmq;
use serde_json;
use chrono::{DateTime, Utc};
use uuid::Uuid;
use anyhow::Result;

/// Simple log entry structure
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
struct LogEntry {
    id: String,
    timestamp: DateTime<Utc>,
    level: String,
    message: String,
    fields: Option<serde_json::Value>,
    tags: Option<Vec<String>>,
    trace_id: Option<String>,
}

impl LogEntry {
    pub fn new(level: String, message: String) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            timestamp: Utc::now(),
            level,
            message,
            fields: None,
            tags: None,
            trace_id: None,
        }
    }
    
    pub fn with_fields(mut self, fields: serde_json::Value) -> Self {
        self.fields = Some(fields);
        self
    }
    
    pub fn with_tags(mut self, tags: Vec<String>) -> Self {
        self.tags = Some(tags);
        self
    }
    
    pub fn with_trace_id(mut self, trace_id: Option<String>) -> Self {
        self.trace_id = trace_id;
        self
    }
}

/// ZMQ client for sending log messages
struct ZmqClient {
    socket: zmq::Socket,
    runtime: Arc<Runtime>,
}

impl ZmqClient {
    pub async fn new(server_address: String) -> Result<Self> {
        let runtime = Arc::new(Runtime::new()?);
        
        let socket = runtime.block_on(async {
            let context = zmq::Context::new();
            let socket = context.socket(zmq::PUSH)?;
            socket.set_sndhwm(1000)?;
            socket.set_ipv6(true)?;
            socket.set_sndtimeo(1000)?;
            
            // Connect to server
            socket.connect(&server_address)?;
            
            Ok::<zmq::Socket, anyhow::Error>(socket)
        })?;
        
        Ok(Self {
            socket,
            runtime,
        })
    }
    
    pub async fn send_message(&self, message: &str) -> Result<()> {
        self.runtime.block_on(async {
            self.socket.send(message.as_bytes(), 0)?;
            Ok::<(), anyhow::Error>(())
        })
    }
    
    pub fn is_connected(&self) -> bool {
        // Simple connection check
        true
    }
}

/// Node.js Logger binding
#[napi]
pub struct Logger {
    client: Arc<ZmqClient>,
    runtime: Arc<Runtime>,
}

#[napi]
impl Logger {
    /// Create a new Logger instance
    #[napi(constructor)]
    pub fn new(server_address: String) -> napi::Result<Self> {
        let runtime = Arc::new(Runtime::new().map_err(|e| {
            napi::Error::from_reason(format!("Failed to create runtime: {}", e))
        })?);
        
        let client = runtime.block_on(async {
            ZmqClient::new(server_address).await
                .map_err(|e| napi::Error::from_reason(format!("Failed to create client: {}", e)))
        })?;
        
        Ok(Self {
            client: Arc::new(client),
            runtime,
        })
    }
    
    /// Log an info message
    #[napi]
    pub fn info(&self, message: String) -> napi::Result<()> {
        self.send_log("info", message, None, None, None)
    }
    
    /// Log an error message
    #[napi]
    pub fn error(&self, message: String) -> napi::Result<()> {
        self.send_log("error", message, None, None, None)
    }
    
    /// Log a warning message
    #[napi]
    pub fn warn(&self, message: String) -> napi::Result<()> {
        self.send_log("warn", message, None, None, None)
    }
    
    /// Log a debug message
    #[napi]
    pub fn debug(&self, message: String) -> napi::Result<()> {
        self.send_log("debug", message, None, None, None)
    }
    
    /// Log a trace message
    #[napi]
    pub fn trace(&self, message: String) -> napi::Result<()> {
        self.send_log("trace", message, None, None, None)
    }
    
    /// Log a message with structured fields
    #[napi]
    pub fn log_with_fields(
        &self, 
        level: String, 
        message: String, 
        fields_json: Option<String>,
        tags: Option<Vec<String>>
    ) -> napi::Result<()> {
        let fields = fields_json
            .and_then(|json| serde_json::from_str(&json).ok());
        
        self.send_log(&level, message, fields, tags, None)
    }
    
    /// Log a message with trace ID
    #[napi]
    pub fn log_with_trace(
        &self,
        level: String,
        message: String,
        trace_id: String,
        fields_json: Option<String>,
    ) -> napi::Result<()> {
        let fields = fields_json
            .and_then(|json| serde_json::from_str(&json).ok());
        
        self.send_log(&level, message, fields, None, Some(trace_id))
    }
    
    /// Check connection status
    #[napi]
    pub fn is_connected(&self) -> bool {
        self.client.is_connected()
    }
    
    /// Get client stats
    #[napi]
    pub fn get_stats(&self) -> napi::Result<ClientStats> {
        Ok(ClientStats {
            is_connected: self.client.is_connected(),
        })
    }
    
    /// Internal log method
    fn send_log(
        &self,
        level: &str,
        message: String,
        fields: Option<serde_json::Value>,
        tags: Option<Vec<String>>,
        trace_id: Option<String>,
    ) -> napi::Result<()> {
        let entry = LogEntry::new(level.to_string(), message)
            .with_fields(fields.unwrap_or(serde_json::Value::Object(serde_json::Map::new())))
            .with_tags(tags.unwrap_or_default())
            .with_trace_id(trace_id);
        
        let json = serde_json::to_string(&entry)
            .map_err(|e| napi::Error::from_reason(format!("Failed to serialize log entry: {}", e)))?;
        
        self.runtime.block_on(async {
            self.client.send_message(&json).await
                .map_err(|e| napi::Error::from_reason(format!("Failed to send log: {}", e)))
        })
    }
}

/// Client stats
#[napi]
pub struct ClientStats {
    pub is_connected: bool,
}