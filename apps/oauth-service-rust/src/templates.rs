// Askama 模板配置和类型定义
use askama::Template;

/// 登录页面模板上下文
#[derive(Template, Clone)]
#[template(path = "login.html")]
pub struct LoginTemplate {
    pub company_name: String,
    pub error_message: Option<String>,
    pub redirect_url: Option<String>,
}

/// 同意授权页面模板上下文
#[derive(Template, Clone)]
#[template(path = "consent.html")]
pub struct ConsentTemplate {
    pub client_name: String,
    pub user_email: String,
    pub scope_list: Vec<String>,
}

/// 错误页面模板上下文
#[derive(Template, Clone)]
#[template(path = "error.html")]
pub struct ErrorTemplate {
    pub error_code: String,
    pub error_message: String,
}

/// 成功页面模板上下文
#[derive(Template, Clone)]
#[template(path = "success.html")]
pub struct SuccessTemplate {
    pub message: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_login_template_renders() {
        let template = LoginTemplate {
            company_name: "Test Company".to_string(),
            error_message: None,
            redirect_url: Some("http://localhost:3002/callback".to_string()),
        };
        let rendered = template.render().expect("Failed to render template");
        assert!(rendered.contains("Test Company"));
        assert!(rendered.contains("登录"));
    }

    #[test]
    fn test_login_template_with_error() {
        let template = LoginTemplate {
            company_name: "Test Company".to_string(),
            error_message: Some("Invalid credentials".to_string()),
            redirect_url: None,
        };
        let rendered = template.render().expect("Failed to render template");
        assert!(rendered.contains("Invalid credentials"));
    }
}
