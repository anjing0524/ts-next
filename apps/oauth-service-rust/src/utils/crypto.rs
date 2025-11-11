use crate::error::ServiceError;
use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use rand::{
    distributions::{Alphanumeric, DistString},
    thread_rng,
};

/// Hashes a password using Argon2.
pub fn hash_password(password: &str) -> Result<String, ServiceError> {
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();

    let password_hash = argon2
        .hash_password(password.as_bytes(), &salt)
        .map_err(|e| ServiceError::PasswordError(e.to_string()))?;

    Ok(password_hash.to_string())
}

/// Verifies a password against either a bcrypt or Argon2 hash.
/// Automatically detects the hash format and uses the appropriate algorithm.
pub fn verify_password(password: &str, hash: &str) -> Result<bool, ServiceError> {
    // Detect hash format
    if hash.starts_with("$2a$") || hash.starts_with("$2b$") || hash.starts_with("$2y$") {
        // bcrypt hash
        bcrypt::verify(password, hash)
            .map_err(|e| ServiceError::PasswordError(format!("bcrypt verification error: {e}")))
    } else if hash.starts_with("$argon2") {
        // Argon2 hash
        let parsed_hash =
            PasswordHash::new(hash).map_err(|e| ServiceError::PasswordError(e.to_string()))?;

        let argon2 = Argon2::default();

        Ok(argon2
            .verify_password(password.as_bytes(), &parsed_hash)
            .is_ok())
    } else {
        Err(ServiceError::PasswordError(
            "Unknown hash format. Expected bcrypt ($2a$/$2b$/$2y$) or Argon2 ($argon2)".to_string(),
        ))
    }
}

/// Generates a cryptographically secure random string of a given length.
/// The string contains ASCII alphanumeric characters: a-z, A-Z, 0-9.
pub fn generate_random_string(len: usize) -> String {
    Alphanumeric.sample_string(&mut thread_rng(), len)
}

#[cfg(test)]
mod tests {
    use super::*; // Import everything from the outer module

    #[test]
    fn test_password_hashing_and_verification() {
        let password = "mySecurePassword123";

        // Test hashing
        let hash_result = hash_password(password);
        assert!(hash_result.is_ok());
        let hash = hash_result.unwrap();

        // Test successful verification
        let verification_result = verify_password(password, &hash);
        assert!(verification_result.is_ok());
        assert!(verification_result.unwrap());
    }

    #[test]
    fn test_incorrect_password_verification() {
        let password = "mySecurePassword123";
        let incorrect_password = "wrongPassword";

        let hash = hash_password(password).unwrap();

        // Test verification with incorrect password
        let verification_result = verify_password(incorrect_password, &hash);
        assert!(verification_result.is_ok());
        assert!(!verification_result.unwrap());
    }

    #[test]
    fn test_invalid_hash_verification() {
        let password = "mySecurePassword123";
        let invalid_hash = "this_is_not_a_valid_hash";

        // Test verification with an invalid hash format
        let verification_result = verify_password(password, invalid_hash);
        assert!(verification_result.is_err());
    }

    #[test]
    fn test_generate_random_string_length() {
        let length = 32;
        let random_string = generate_random_string(length);
        assert_eq!(random_string.len(), length);
    }
}
