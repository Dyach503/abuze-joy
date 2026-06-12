use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutotestResult {
    pub strategy: String,
    pub success: bool,
    pub response_time_ms: u64,
    pub error: Option<String>,
}
