//! PKCE (Proof Key for Code Exchange) utilities
//!
//! Helper functions for generating PKCE code verifiers and challenges.

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use rand::Rng;
use sha2::{Digest, Sha256};

/// PKCE code verifier and challenge pair
#[derive(Debug, Clone)]
pub struct PkceChallenge {
    pub code_verifier: String,
    pub code_challenge: String,
    pub code_challenge_method: String,
}

impl PkceChallenge {
    /// Generate a new PKCE challenge using S256 method
    pub fn generate() -> Self {
        let code_verifier = Self::generate_code_verifier();
        let code_challenge = Self::generate_code_challenge(&code_verifier);

        Self {
            code_verifier,
            code_challenge,
            code_challenge_method: "S256".to_string(),
        }
    }

    /// Generate a random code verifier (43-128 characters)
    fn generate_code_verifier() -> String {
        let mut rng = rand::thread_rng();
        let random_bytes: Vec<u8> = (0..32).map(|_| rng.gen()).collect();
        URL_SAFE_NO_PAD.encode(&random_bytes)
    }

    /// Generate S256 code challenge from verifier
    /// code_challenge = BASE64URL(SHA256(code_verifier))
    fn generate_code_challenge(code_verifier: &str) -> String {
        let mut hasher = Sha256::new();
        hasher.update(code_verifier.as_bytes());
        let hash = hasher.finalize();
        URL_SAFE_NO_PAD.encode(&hash)
    }

    /// Create a PKCE challenge with a specific verifier (for testing)
    pub fn with_verifier(code_verifier: String) -> Self {
        let code_challenge = Self::generate_code_challenge(&code_verifier);

        Self {
            code_verifier,
            code_challenge,
            code_challenge_method: "S256".to_string(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pkce_challenge_generation() {
        let pkce = PkceChallenge::generate();

        // Verify code verifier length (base64 of 32 bytes = 43 chars without padding)
        assert_eq!(pkce.code_verifier.len(), 43);
        assert_eq!(pkce.code_challenge_method, "S256");

        // Verify challenge is different from verifier
        assert_ne!(pkce.code_verifier, pkce.code_challenge);
    }

    #[test]
    fn test_pkce_challenge_deterministic() {
        let verifier = "test_verifier_12345678901234567890123".to_string();
        let pkce1 = PkceChallenge::with_verifier(verifier.clone());
        let pkce2 = PkceChallenge::with_verifier(verifier);

        // Same verifier should produce same challenge
        assert_eq!(pkce1.code_challenge, pkce2.code_challenge);
    }

    #[test]
    fn test_pkce_challenge_unique() {
        let pkce1 = PkceChallenge::generate();
        let pkce2 = PkceChallenge::generate();

        // Different generations should produce different verifiers
        assert_ne!(pkce1.code_verifier, pkce2.code_verifier);
        assert_ne!(pkce1.code_challenge, pkce2.code_challenge);
    }
}
