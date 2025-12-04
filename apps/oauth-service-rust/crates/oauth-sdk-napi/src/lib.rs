//! OAuth SDK NAPI Bindings
//!
//! This crate provides Node.js-compatible NAPI bindings for the OAuth service.
//! It enables calling Rust OAuth functions from JavaScript/TypeScript.

mod napi_binding;

pub use napi_binding::{create_sdk, NapiOAuthSDK, NapiSDKConfig};
