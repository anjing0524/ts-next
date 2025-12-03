use crate::napi::http_client::HttpClient;

pub struct RbacModule {
    #[allow(dead_code)]
    http_client: HttpClient,
}

impl RbacModule {
    pub fn new(http_client: HttpClient) -> Self {
        Self { http_client }
    }
}
