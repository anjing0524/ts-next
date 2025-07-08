//! 请求路由与上游选择逻辑

use pingora::prelude::*;
use std::collections::HashMap;
use std::sync::Arc;

/// 根据请求路径选择最合适的上游服务
///
/// 使用最长前缀匹配算法。
pub fn select_upstream(
    session: &Session,
    upstream_map: &HashMap<String, Arc<LoadBalancer<RoundRobin>>>,
) -> Result<Arc<LoadBalancer<RoundRobin>>> {
    let path = session.req_header().uri.path();
    let mut selected: Option<&Arc<LoadBalancer<RoundRobin>>> = None;
    let mut max_len = 0;

    for (prefix, lb) in upstream_map {
        if path.starts_with(prefix) && prefix.len() > max_len {
            selected = Some(lb);
            max_len = prefix.len();
        }
    }

    selected
        .cloned()
        .ok_or_else(|| Error::new_str("未找到匹配的上游服务"))
}

