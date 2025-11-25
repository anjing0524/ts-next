use anyhow::Result;
use rustls::pki_types::{CertificateDer, PrivateKeyDer};
use std::fs;
use std::io::BufReader;

use crate::config::TlsConfig;

/// 从 PEM 文件加载证书
pub fn load_certificates(path: &str) -> Result<Vec<CertificateDer<'static>>> {
    let cert_file = fs::File::open(path)?;
    let mut reader = BufReader::new(cert_file);
    let certs = rustls_pemfile::certs(&mut reader)
        .collect::<std::io::Result<Vec<_>>>()?;
    Ok(certs)
}

/// 从 PEM 文件加载私钥
pub fn load_private_key(path: &str) -> Result<PrivateKeyDer<'static>> {
    let key_file = fs::File::open(path)?;
    let mut reader = BufReader::new(key_file);

    // 尝试加载私钥 - 只支持 Pkcs8 格式
    let keys: Vec<_> = rustls_pemfile::read_all(&mut reader)
        .collect::<std::io::Result<Vec<_>>>()
        .map_err(|e| anyhow::anyhow!("Failed to read private key file: {}", e))?
        .into_iter()
        .filter_map(|item| {
            match item {
                rustls_pemfile::Item::Pkcs8Key(key) => Some(PrivateKeyDer::Pkcs8(key)),
                _ => None,
            }
        })
        .collect();

    if keys.is_empty() {
        anyhow::bail!("No PKCS8 private keys found in {}. Please convert your key to PKCS8 format using: openssl pkcs8 -topk8 -in key.pem -out key_pkcs8.pem -nocrypt", path);
    }

    Ok(keys.into_iter().next().unwrap())
}

/// 验证 TLS 配置文件是否可用
/// 注意: 实际的 TLS 配置由 pingora 直接处理
pub fn validate_tls_config(tls_cfg: &TlsConfig) -> Result<()> {
    // 验证证书文件
    load_certificates(&tls_cfg.cert_path)?;
    // 验证私钥文件
    load_private_key(&tls_cfg.key_path)?;
    Ok(())
}

/// 校验 TLS 版本字符串
pub fn validate_tls_version(version_str: &str) -> Result<()> {
    match version_str {
        "1.2" | "1.3" => Ok(()),
        _ => Err(anyhow::anyhow!(
            "Unsupported TLS version: {}. Supported versions: 1.2, 1.3",
            version_str
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_tls_version() {
        assert!(validate_tls_version("1.3").is_ok());
        assert!(validate_tls_version("1.2").is_ok());
        assert!(validate_tls_version("1.0").is_err());
    }
}
