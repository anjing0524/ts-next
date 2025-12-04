/**
 * OAuth Service NAPI - Node.js Binding
 *
 * This module provides access to the Rust-based OAuth Service
 * via Node-API (napi-rs)
 */

// Try to load the prebuilt binary
let nativeModule;

try {
  // Try loading from the parent directory (where index.node is built)
  nativeModule = require('../index.node');
} catch (err) {
  // Fallback: Try the dist directory if it exists
  try {
    nativeModule = require('./dist/index.node');
  } catch (fallbackErr) {
    console.error('Failed to load oauth-service-napi native module:', err.message);
    console.error('Fallback also failed:', fallbackErr.message);
    throw new Error(
      'oauth-service-napi: Failed to load native module. ' +
      'The module may need to be compiled. Run: npm run build in apps/oauth-service-rust'
    );
  }
}

// Export the native module
module.exports = nativeModule;
