use crate::napi::http_client::HttpClient;

pub struct ClientModule {
    #[allow(dead_code)]
    http_client: HttpClient,
}

impl ClientModule {
    pub fn new(http_client: HttpClient) -> Self {
        Self { http_client }
    }
}
