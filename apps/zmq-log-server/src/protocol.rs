//! Optimized ZMQ Protocol Implementation
//! 
//! This module provides an enhanced protocol with versioning, compression,
//! and better error handling for production use.

use std::collections::HashMap;
use bytes::{Bytes, BytesMut, BufMut};
use serde::{Serialize, Deserialize};
use crate::error::{LogServerError, Result};
use crate::types::{LogEntry, LogLevel};
use crate::memory::ZeroCopyBuffer;

/// Protocol version
pub const PROTOCOL_VERSION: u8 = 1;

/// Message types supported by the protocol
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum MessageType {
    /// Single log entry
    LogEntry = 1,
    /// Batch of log entries
    LogBatch = 2,
    /// Heartbeat/ping
    Heartbeat = 3,
    /// Control/command message
    Control = 4,
    /// Error message
    Error = 5,
    /// Protocol handshake
    Handshake = 6,
    /// Acknowledgment
    Ack = 7,
    /// Statistics request/response
    Stats = 8,
}

impl MessageType {
    pub fn from_u8(value: u8) -> Option<Self> {
        match value {
            1 => Some(MessageType::LogEntry),
            2 => Some(MessageType::LogBatch),
            3 => Some(MessageType::Heartbeat),
            4 => Some(MessageType::Control),
            5 => Some(MessageType::Error),
            6 => Some(MessageType::Handshake),
            7 => Some(MessageType::Ack),
            8 => Some(MessageType::Stats),
            _ => None,
        }
    }
    
    pub fn as_u8(self) -> u8 {
        self as u8
    }
}

/// Protocol flags for message metadata
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct MessageFlags {
    pub compressed: bool,
    pub encrypted: bool,
    pub batched: bool,
    pub urgent: bool,
    pub requires_ack: bool,
}

impl MessageFlags {
    pub const NONE: u8 = 0b00000000;
    pub const COMPRESSED: u8 = 0b00000001;
    pub const ENCRYPTED: u8 = 0b00000010;
    pub const BATCHED: u8 = 0b00000100;
    pub const URGENT: u8 = 0b00001000;
    pub const REQUIRES_ACK: u8 = 0b00010000;
    
    pub fn from_u8(value: u8) -> Self {
        Self {
            compressed: (value & Self::COMPRESSED) != 0,
            encrypted: (value & Self::ENCRYPTED) != 0,
            batched: (value & Self::BATCHED) != 0,
            urgent: (value & Self::URGENT) != 0,
            requires_ack: (value & Self::REQUIRES_ACK) != 0,
        }
    }
    
    pub fn as_u8(self) -> u8 {
        let mut flags = 0;
        if self.compressed { flags |= Self::COMPRESSED; }
        if self.encrypted { flags |= Self::ENCRYPTED; }
        if self.batched { flags |= Self::BATCHED; }
        if self.urgent { flags |= Self::URGENT; }
        if self.requires_ack { flags |= Self::REQUIRES_ACK; }
        flags
    }
}

impl Default for MessageFlags {
    fn default() -> Self {
        Self {
            compressed: false,
            encrypted: false,
            batched: false,
            urgent: false,
            requires_ack: false,
        }
    }
}

/// Message header for protocol
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessageHeader {
    /// Protocol version
    pub version: u8,
    /// Message type
    pub message_type: MessageType,
    /// Message flags
    pub flags: MessageFlags,
    /// Message ID (for acknowledgments)
    pub message_id: u64,
    /// Sequence number (for ordering)
    pub sequence: u64,
    /// Timestamp
    pub timestamp: chrono::DateTime<chrono::Utc>,
    /// Payload size
    pub payload_size: u32,
    /// Checksum (optional)
    pub checksum: Option<u32>,
}

impl MessageHeader {
    pub fn new(message_type: MessageType, payload_size: u32) -> Self {
        Self {
            version: PROTOCOL_VERSION,
            message_type,
            flags: MessageFlags::default(),
            message_id: rand::random(),
            sequence: 0,
            timestamp: chrono::Utc::now(),
            payload_size,
            checksum: None,
        }
    }
    
    pub fn with_flags(mut self, flags: MessageFlags) -> Self {
        self.flags = flags;
        self
    }
    
    pub fn with_sequence(mut self, sequence: u64) -> Self {
        self.sequence = sequence;
        self
    }
    
    pub fn with_checksum(mut self, checksum: u32) -> Self {
        self.checksum = Some(checksum);
        self
    }
    
    /// Serialize header to bytes
    pub fn to_bytes(&self) -> Result<Vec<u8>> {
        let mut buffer = Vec::with_capacity(32); // Estimated size
        
        // Version (1 byte)
        buffer.push(self.version);
        
        // Message type (1 byte)
        buffer.push(self.message_type.as_u8());
        
        // Flags (1 byte)
        buffer.push(self.flags.as_u8());
        
        // Message ID (8 bytes)
        buffer.extend_from_slice(&self.message_id.to_le_bytes());
        
        // Sequence (8 bytes)
        buffer.extend_from_slice(&self.sequence.to_le_bytes());
        
        // Timestamp (8 bytes)
        buffer.extend_from_slice(&self.timestamp.timestamp().to_le_bytes());
        
        // Payload size (4 bytes)
        buffer.extend_from_slice(&self.payload_size.to_le_bytes());
        
        // Checksum (4 bytes, optional)
        if let Some(checksum) = self.checksum {
            buffer.extend_from_slice(&checksum.to_le_bytes());
        }
        
        Ok(buffer)
    }
    
    /// Deserialize header from bytes
    pub fn from_bytes(bytes: &[u8]) -> Result<Self> {
        if bytes.len() < 27 {
            return Err(LogServerError::validation("header_size", "Header too short"));
        }
        
        let mut pos = 0;
        
        // Version
        let version = bytes[pos];
        pos += 1;
        
        // Message type
        let message_type = MessageType::from_u8(bytes[pos])
            .ok_or_else(|| LogServerError::validation("message_type", "Invalid message type"))?;
        pos += 1;
        
        // Flags
        let flags = MessageFlags::from_u8(bytes[pos]);
        pos += 1;
        
        // Message ID
        let message_id = u64::from_le_bytes([
            bytes[pos], bytes[pos + 1], bytes[pos + 2], bytes[pos + 3],
            bytes[pos + 4], bytes[pos + 5], bytes[pos + 6], bytes[pos + 7]
        ]);
        pos += 8;
        
        // Sequence
        let sequence = u64::from_le_bytes([
            bytes[pos], bytes[pos + 1], bytes[pos + 2], bytes[pos + 3],
            bytes[pos + 4], bytes[pos + 5], bytes[pos + 6], bytes[pos + 7]
        ]);
        pos += 8;
        
        // Timestamp
        let timestamp_secs = i64::from_le_bytes([
            bytes[pos], bytes[pos + 1], bytes[pos + 2], bytes[pos + 3],
            bytes[pos + 4], bytes[pos + 5], bytes[pos + 6], bytes[pos + 7]
        ]);
        pos += 8;
        
        let timestamp = chrono::DateTime::from_timestamp(timestamp_secs, 0)
            .ok_or_else(|| LogServerError::validation("timestamp", "Invalid timestamp"))?;
        
        // Payload size
        let payload_size = u32::from_le_bytes([bytes[pos], bytes[pos + 1], bytes[pos + 2], bytes[pos + 3]]);
        pos += 4;
        
        // Checksum (optional)
        let checksum = if bytes.len() > pos {
            let checksum_bytes = &bytes[pos..pos + 4];
            Some(u32::from_le_bytes([
                checksum_bytes[0], checksum_bytes[1], checksum_bytes[2], checksum_bytes[3]
            ]))
        } else {
            None
        };
        
        Ok(Self {
            version,
            message_type,
            flags,
            message_id,
            sequence,
            timestamp,
            payload_size,
            checksum,
        })
    }
    
    /// Calculate checksum for payload
    pub fn calculate_checksum(&self, payload: &[u8]) -> u32 {
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};
        
        let mut hasher = DefaultHasher::new();
        self.version.hash(&mut hasher);
        self.message_type.as_u8().hash(&mut hasher);
        self.flags.as_u8().hash(&mut hasher);
        self.message_id.hash(&mut hasher);
        self.sequence.hash(&mut hasher);
        self.timestamp.timestamp().hash(&mut hasher);
        self.payload_size.hash(&mut hasher);
        payload.hash(&mut hasher);
        
        hasher.finish() as u32
    }
}

/// Complete protocol message
#[derive(Debug, Clone)]
pub struct ProtocolMessage {
    pub header: MessageHeader,
    pub payload: ZeroCopyBuffer,
    pub metadata: HashMap<String, serde_json::Value>,
}

impl ProtocolMessage {
    pub fn new(header: MessageHeader, payload: ZeroCopyBuffer) -> Self {
        Self {
            header,
            payload,
            metadata: HashMap::new(),
        }
    }
    
    pub fn with_metadata<K, V>(mut self, key: K, value: V) -> Self 
    where 
        K: Into<String>,
        V: Into<serde_json::Value>,
    {
        self.metadata.insert(key.into(), value.into());
        self
    }
    
    /// Serialize complete message
    pub fn serialize(&self) -> Result<Bytes> {
        let header_bytes = self.header.to_bytes()?;
        let mut buffer = BytesMut::with_capacity(header_bytes.len() + self.payload.len());
        
        buffer.put_slice(&header_bytes);
        buffer.put_slice(self.payload.as_slice());
        
        Ok(buffer.freeze())
    }
    
    /// Deserialize message from bytes
    pub fn deserialize(bytes: &[u8]) -> Result<Self> {
        if bytes.len() < 27 {
            return Err(LogServerError::validation("message_size", "Message too short"));
        }
        
        // Parse header
        let header = MessageHeader::from_bytes(bytes)?;
        
        // Extract payload
        let header_size = if header.checksum.is_some() { 31 } else { 27 };
        if bytes.len() < header_size + header.payload_size as usize {
            return Err(LogServerError::validation("payload_size", "Payload size mismatch"));
        }
        
        let payload = &bytes[header_size..header_size + header.payload_size as usize];
        
        // Verify checksum if present
        if let Some(expected_checksum) = header.checksum {
            let actual_checksum = header.calculate_checksum(payload);
            if actual_checksum != expected_checksum {
                return Err(LogServerError::validation("checksum", "Checksum mismatch"));
            }
        }
        
        let payload_buffer = ZeroCopyBuffer::new(Bytes::copy_from_slice(payload));
        
        Ok(Self {
            header,
            payload: payload_buffer,
            metadata: HashMap::new(),
        })
    }
    
    /// Create log entry message
    pub fn log_entry(entry: &LogEntry) -> Result<Self> {
        let payload = serde_json::to_vec(entry)
            .map_err(|e| LogServerError::processing(
                crate::error::ProcessingErrorKind::Serialization,
                e.to_string()
            ))?;
        
        let header = MessageHeader::new(
            MessageType::LogEntry,
            payload.len() as u32,
        );
        
        Ok(Self::new(header, ZeroCopyBuffer::new(Bytes::from(payload))))
    }
    
    /// Create log batch message
    pub fn log_batch(entries: &[LogEntry]) -> Result<Self> {
        let payload = serde_json::to_vec(entries)
            .map_err(|e| LogServerError::processing(
                crate::error::ProcessingErrorKind::Serialization,
                e.to_string()
            ))?;
        
        let header = MessageHeader::new(
            MessageType::LogBatch,
            payload.len() as u32,
        ).with_flags(MessageFlags {
            batched: true,
            ..Default::default()
        });
        
        Ok(Self::new(header, ZeroCopyBuffer::new(Bytes::from(payload))))
    }
    
    /// Create heartbeat message
    pub fn heartbeat(uptime_seconds: u64) -> Result<Self> {
        let heartbeat_data = serde_json::json!({
            "uptime_seconds": uptime_seconds,
            "timestamp": chrono::Utc::now(),
        });
        
        let payload = serde_json::to_vec(&heartbeat_data)
            .map_err(|e| LogServerError::processing(
                crate::error::ProcessingErrorKind::Serialization,
                e.to_string()
            ))?;
        
        let header = MessageHeader::new(
            MessageType::Heartbeat,
            payload.len() as u32,
        );
        
        Ok(Self::new(header, ZeroCopyBuffer::new(Bytes::from(payload))))
    }
    
    /// Create acknowledgment message
    pub fn ack(original_message_id: u64, status: AckStatus) -> Result<Self> {
        let ack_data = serde_json::json!({
            "original_message_id": original_message_id,
            "status": status,
            "timestamp": chrono::Utc::now(),
        });
        
        let payload = serde_json::to_vec(&ack_data)
            .map_err(|e| LogServerError::processing(
                crate::error::ProcessingErrorKind::Serialization,
                e.to_string()
            ))?;
        
        let header = MessageHeader::new(
            MessageType::Ack,
            payload.len() as u32,
        );
        
        Ok(Self::new(header, ZeroCopyBuffer::new(Bytes::from(payload))))
    }
    
    /// Parse as log entry
    pub fn as_log_entry(&self) -> Result<LogEntry> {
        if self.header.message_type != MessageType::LogEntry {
            return Err(LogServerError::validation("message_type", "Expected log entry"));
        }
        
        serde_json::from_slice(self.payload.as_slice())
            .map_err(|e| LogServerError::processing(
                crate::error::ProcessingErrorKind::Deserialization,
                e.to_string()
            ))
    }
    
    /// Parse as log batch
    pub fn as_log_batch(&self) -> Result<Vec<LogEntry>> {
        if self.header.message_type != MessageType::LogBatch {
            return Err(LogServerError::validation("message_type", "Expected log batch"));
        }
        
        serde_json::from_slice(self.payload.as_slice())
            .map_err(|e| LogServerError::processing(
                crate::error::ProcessingErrorKind::Deserialization,
                e.to_string()
            ))
    }
    
    /// Parse as heartbeat
    pub fn as_heartbeat(&self) -> Result<HeartbeatData> {
        if self.header.message_type != MessageType::Heartbeat {
            return Err(LogServerError::validation("message_type", "Expected heartbeat"));
        }
        
        serde_json::from_slice(self.payload.as_slice())
            .map_err(|e| LogServerError::processing(
                crate::error::ProcessingErrorKind::Deserialization,
                e.to_string()
            ))
    }
}

/// Acknowledgment status
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum AckStatus {
    Success = 0,
    InvalidFormat = 1,
    ProcessingError = 2,
    RateLimited = 3,
    ServerError = 4,
}

impl AckStatus {
    pub fn from_u8(value: u8) -> Option<Self> {
        match value {
            0 => Some(AckStatus::Success),
            1 => Some(AckStatus::InvalidFormat),
            2 => Some(AckStatus::ProcessingError),
            3 => Some(AckStatus::RateLimited),
            4 => Some(AckStatus::ServerError),
            _ => None,
        }
    }
    
    pub fn as_u8(self) -> u8 {
        self as u8
    }
}

/// Heartbeat data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HeartbeatData {
    pub uptime_seconds: u64,
    pub timestamp: chrono::DateTime<chrono::Utc>,
    pub memory_usage_mb: Option<f64>,
    pub message_count: Option<u64>,
    pub error_count: Option<u64>,
}

/// Protocol codec for encoding/decoding messages
pub struct ProtocolCodec {
    compression_threshold: usize,
    enable_checksums: bool,
}

impl ProtocolCodec {
    pub fn new(compression_threshold: usize, enable_checksums: bool) -> Self {
        Self {
            compression_threshold,
            enable_checksums,
        }
    }
    
    /// Encode a message with optional compression and checksum
    pub fn encode(&self, message: &mut ProtocolMessage) -> Result<Bytes> {
        // Apply compression if needed
        if message.payload.len() > self.compression_threshold {
            message.header.flags.compressed = true;
            message.payload = self.compress_payload(&message.payload)?;
        }
        
        // Calculate checksum if enabled
        if self.enable_checksums {
            let checksum = message.header.calculate_checksum(message.payload.as_slice());
            message.header.checksum = Some(checksum);
        }
        
        message.serialize()
    }
    
    /// Decode a message with validation
    pub fn decode(&self, bytes: &[u8]) -> Result<ProtocolMessage> {
        let mut message = ProtocolMessage::deserialize(bytes)?;
        
        // Decompress if needed
        if message.header.flags.compressed {
            message.payload = self.decompress_payload(&message.payload)?;
        }
        
        Ok(message)
    }
    
    /// Compress payload
    fn compress_payload(&self, payload: &ZeroCopyBuffer) -> Result<ZeroCopyBuffer> {
        use flate2::{write::GzEncoder, Compression};
        use std::io::Write;
        
        let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
        encoder.write_all(payload.as_slice())
            .map_err(|e| LogServerError::processing(
                crate::error::ProcessingErrorKind::Serialization,
                e.to_string()
            ))?;
        
        let compressed_data = encoder.finish()
            .map_err(|e| LogServerError::processing(
                crate::error::ProcessingErrorKind::Serialization,
                e.to_string()
            ))?;
        
        Ok(ZeroCopyBuffer::new(Bytes::from(compressed_data)))
    }
    
    /// Decompress payload
    fn decompress_payload(&self, payload: &ZeroCopyBuffer) -> Result<ZeroCopyBuffer> {
        use flate2::read::GzDecoder;
        use std::io::Read;
        
        let mut decoder = GzDecoder::new(payload.as_slice());
        let mut decompressed = Vec::new();
        
        decoder.read_to_end(&mut decompressed)
            .map_err(|e| LogServerError::processing(
                crate::error::ProcessingErrorKind::Deserialization,
                e.to_string()
            ))?;
        
        Ok(ZeroCopyBuffer::new(Bytes::from(decompressed)))
    }
}

impl Default for ProtocolCodec {
    fn default() -> Self {
        Self::new(1024, true) // 1KB compression threshold, enable checksums
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_message_type_conversion() {
        assert_eq!(MessageType::LogEntry.as_u8(), 1);
        assert_eq!(MessageType::from_u8(1), Some(MessageType::LogEntry));
        assert_eq!(MessageType::from_u8(99), None);
    }
    
    #[test]
    fn test_message_flags() {
        let flags = MessageFlags {
            compressed: true,
            encrypted: false,
            batched: true,
            urgent: false,
            requires_ack: true,
        };
        
        let serialized = flags.as_u8();
        let deserialized = MessageFlags::from_u8(serialized);
        
        assert_eq!(flags.compressed, deserialized.compressed);
        assert_eq!(flags.encrypted, deserialized.encrypted);
        assert_eq!(flags.batched, deserialized.batched);
        assert_eq!(flags.urgent, deserialized.urgent);
        assert_eq!(flags.requires_ack, deserialized.requires_ack);
    }
    
    #[test]
    fn test_message_header_serialization() {
        let header = MessageHeader::new(MessageType::LogEntry, 100)
            .with_sequence(42)
            .with_checksum(0x12345678);
        
        let serialized = header.to_bytes().unwrap();
        let deserialized = MessageHeader::from_bytes(&serialized).unwrap();
        
        assert_eq!(header.version, deserialized.version);
        assert_eq!(header.message_type, deserialized.message_type);
        assert_eq!(header.flags.as_u8(), deserialized.flags.as_u8());
        assert_eq!(header.message_id, deserialized.message_id);
        assert_eq!(header.sequence, deserialized.sequence);
        assert_eq!(header.payload_size, deserialized.payload_size);
        assert_eq!(header.checksum, deserialized.checksum);
    }
    
    #[test]
    fn test_protocol_message_log_entry() {
        let entry = LogEntry::new(LogLevel::Info, "Test message".to_string())
            .with_field("test".to_string(), serde_json::Value::String("value".to_string()));
        
        let message = ProtocolMessage::log_entry(&entry).unwrap();
        
        assert_eq!(message.header.message_type, MessageType::LogEntry);
        assert_eq!(message.header.payload_size > 0, true);
        
        let parsed_entry = message.as_log_entry().unwrap();
        assert_eq!(entry.message, parsed_entry.message);
        assert_eq!(entry.level, parsed_entry.level);
    }
    
    #[test]
    fn test_protocol_message_batch() {
        let entries = vec![
            LogEntry::new(LogLevel::Info, "Message 1".to_string()),
            LogEntry::new(LogLevel::Error, "Message 2".to_string()),
        ];
        
        let message = ProtocolMessage::log_batch(&entries).unwrap();
        
        assert_eq!(message.header.message_type, MessageType::LogBatch);
        assert!(message.header.flags.batched);
        
        let parsed_entries = message.as_log_batch().unwrap();
        assert_eq!(entries.len(), parsed_entries.len());
        assert_eq!(entries[0].message, parsed_entries[0].message);
    }
    
    #[test]
    fn test_protocol_codec() {
        let codec = ProtocolCodec::default();
        
        let entry = LogEntry::new(LogLevel::Info, "Codec test message".to_string());
        let mut message = ProtocolMessage::log_entry(&entry).unwrap();
        
        // Encode
        let encoded = codec.encode(&mut message).unwrap();
        
        // Decode
        let decoded = codec.decode(&encoded).unwrap();
        
        // Verify
        assert_eq!(message.header.message_type, decoded.header.message_type);
        assert_eq!(message.header.version, decoded.header.version);
        
        let decoded_entry = decoded.as_log_entry().unwrap();
        assert_eq!(entry.message, decoded_entry.message);
        assert_eq!(entry.level, decoded_entry.level);
    }
    
    #[test]
    fn test_checksum_validation() {
        let entry = LogEntry::new(LogLevel::Info, "Checksum test".to_string());
        let mut message = ProtocolMessage::log_entry(&entry).unwrap();
        
        // Enable checksum
        let checksum = message.header.calculate_checksum(message.payload.as_slice());
        message.header.checksum = Some(checksum);
        
        // Serialize and deserialize
        let serialized = message.serialize().unwrap();
        let deserialized = ProtocolMessage::deserialize(&serialized).unwrap();
        
        // Should succeed with valid checksum
        assert_eq!(deserialized.header.checksum, Some(checksum));
        
        // Test invalid checksum
        let mut tampered = serialized.to_vec();
        tampered[30] ^= 0xFF; // Flip a bit in the payload
        
        let result = ProtocolMessage::deserialize(&tampered);
        assert!(result.is_err());
    }
}