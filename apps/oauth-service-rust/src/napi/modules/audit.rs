use crate::napi::http_client::HttpClient;

pub struct AuditModule {
    #[allow(dead_code)]
    http_client: HttpClient,
}

impl AuditModule {
    pub fn new(http_client: HttpClient) -> Self {
        Self { http_client }
    }
}
