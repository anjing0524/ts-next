/**
 * OAuth Service NAPI - Node.js Binding
 *
 * This module provides access to the Rust-based OAuth Service
 * via Node-API (napi-rs)
 */

// Try to load the prebuilt binary
let nativeModule;

try {
  // Try loading from the current directory (oauth-service-napi.node)
  nativeModule = require('./oauth-service-napi.node');
} catch (err) {
  // Fallback: Try loading with different naming patterns
  try {
    nativeModule = require('../index.node');
  } catch (fallbackErr1) {
    try {
      nativeModule = require('./dist/index.node');
    } catch (fallbackErr2) {
      console.error('Failed to load oauth-service-napi native module:', err.message);
      console.error('Fallback 1 failed:', fallbackErr1.message);
      console.error('Fallback 2 failed:', fallbackErr2.message);
      throw new Error(
        'oauth-service-napi: Failed to load native module. ' +
        'The module may need to be compiled. Run: npm run build in apps/oauth-service-rust'
      );
    }
  }
}

// Export the native module
module.exports = nativeModule;
