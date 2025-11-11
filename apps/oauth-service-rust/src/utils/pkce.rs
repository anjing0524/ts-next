use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use rand::{thread_rng, Rng};
use sha2::{Digest, Sha256};
use thiserror::Error;

#[derive(Error, Debug, PartialEq)]
pub enum PkceError {
    #[error("PKCE verification failed: code challenge does not match verifier")]
    VerificationFailed,
}

/// Verifies a PKCE code challenge against a code verifier.
///
/// # Arguments
///
/// * `code_verifier` - The plain-text code verifier from the client.
/// * `code_challenge` - The base64url-encoded SHA256 hash of the verifier.
///
/// # Returns
///
/// `Ok(())` if the verification is successful, otherwise a `PkceError`.
pub fn verify_pkce(code_verifier: &str, code_challenge: &str) -> Result<(), PkceError> {
    let mut hasher = Sha256::new();
    hasher.update(code_verifier.as_bytes());
    let hash = hasher.finalize();

    let encoded_challenge = URL_SAFE_NO_PAD.encode(hash);

    if encoded_challenge != code_challenge {
        return Err(PkceError::VerificationFailed);
    }

    Ok(())
}

/// Generates a random PKCE code verifier (43-128 characters).
/// The verifier is a cryptographically random string using unreserved characters.
pub fn generate_code_verifier() -> String {
    let mut rng = thread_rng();
    let length = rng.gen_range(43..=128);
    const CHARSET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";

    (0..length)
        .map(|_| {
            let idx = rng.gen_range(0..CHARSET.len());
            CHARSET[idx] as char
        })
        .collect()
}

/// Generates a PKCE code challenge from a code verifier.
/// This is mainly useful for testing purposes.
pub fn generate_code_challenge(code_verifier: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(code_verifier.as_bytes());
    let hash = hasher.finalize();
    URL_SAFE_NO_PAD.encode(hash)
}

#[cfg(test)]
mod tests {
    use super::*; // Import everything from the outer module

    #[test]
    fn test_pkce_generation_and_verification() {
        // A sample verifier from RFC 7636
        let verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";

        // Expected challenge from RFC 7636
        let expected_challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

        // Test generation
        let generated_challenge = generate_code_challenge(verifier);
        assert_eq!(generated_challenge, expected_challenge);

        // Test successful verification
        let verification_result = verify_pkce(verifier, &generated_challenge);
        assert!(verification_result.is_ok());
    }

    #[test]
    fn test_pkce_verification_failure() {
        let verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
        let incorrect_challenge = "incorrect_challenge_string";

        // Test verification with an incorrect challenge
        let verification_result = verify_pkce(verifier, incorrect_challenge);
        assert!(verification_result.is_err());
        assert_eq!(
            verification_result.unwrap_err(),
            PkceError::VerificationFailed
        );
    }
}
