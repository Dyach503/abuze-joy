use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

// Reuse RoutesConfig structure from routes.rs
use crate::routes::{RouteEntry, RoutesConfig};

pub struct ZapretRoutesManager {
    path: PathBuf,
    config: Mutex<RoutesConfig>,
}

impl ZapretRoutesManager {
    pub fn new(data_dir: PathBuf) -> Self {
        let path = data_dir.join("zapret_routes.json");
        let config = if path.exists() {
            let content = fs::read_to_string(&path).unwrap_or_default();
            serde_json::from_str(&content).unwrap_or_else(|_| Self::default_config())
        } else {
            Self::default_config()
        };
        Self {
            path,
            config: Mutex::new(config),
        }
    }

    fn default_config() -> RoutesConfig {
                // Load default zapret routes from embedded JSON
        const DEFAULT_ZAPRET_ROUTES: &str = include_str!("../default_zapret_routes.json");
        serde_json::from_str(DEFAULT_ZAPRET_ROUTES).unwrap_or(RoutesConfig {

            domains: Vec::new(),
            ips: Vec::new(),
        })
    }

    pub fn get(&self) -> RoutesConfig {
        self.config.lock().unwrap().clone()
    }

    pub fn save(&self) -> Result<(), String> {
        let config = self.config.lock().unwrap();
        let json = serde_json::to_string_pretty(&*config).map_err(|e| e.to_string())?;
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        fs::write(&self.path, json).map_err(|e| e.to_string())
    }

    pub fn add_domain(&self, value: String, note: String) -> Result<RoutesConfig, String> {
        let value = value.trim().to_lowercase();
        if value.is_empty() {
            return Err("Domain cannot be empty".into());
        }
        let mut config = self.config.lock().unwrap();
        if config.domains.iter().any(|d| d.value == value) {
            return Err(format!("Domain '{}' already exists", value));
        }
        config.domains.push(RouteEntry {
            value,
            enabled: true,
            note,
        });
        drop(config);
        self.save()?;
        Ok(self.get())
    }

    pub fn add_ip(&self, value: String, note: String) -> Result<RoutesConfig, String> {
        let value = value.trim().to_string();
        if value.is_empty() {
            return Err("IP cannot be empty".into());
        }
        let mut config = self.config.lock().unwrap();
        if config.ips.iter().any(|i| i.value == value) {
            return Err(format!("IP '{}' already exists", value));
        }
        config.ips.push(RouteEntry {
            value,
            enabled: true,
            note,
        });
        drop(config);
        self.save()?;
        Ok(self.get())
    }

    pub fn remove_domain(&self, value: &str) -> Result<RoutesConfig, String> {
        let mut config = self.config.lock().unwrap();
        config.domains.retain(|d| d.value != value);
        drop(config);
        self.save()?;
        Ok(self.get())
    }

    pub fn remove_ip(&self, value: &str) -> Result<RoutesConfig, String> {
        let mut config = self.config.lock().unwrap();
        config.ips.retain(|i| i.value != value);
        drop(config);
        self.save()?;
        Ok(self.get())
    }

    pub fn toggle_domain(&self, value: &str, enabled: bool) -> Result<RoutesConfig, String> {
        let mut config = self.config.lock().unwrap();
        if let Some(entry) = config.domains.iter_mut().find(|d| d.value == value) {
            entry.enabled = enabled;
        }
        drop(config);
        self.save()?;
        Ok(self.get())
    }

    pub fn toggle_ip(&self, value: &str, enabled: bool) -> Result<RoutesConfig, String> {
        let mut config = self.config.lock().unwrap();
        if let Some(entry) = config.ips.iter_mut().find(|i| i.value == value) {
            entry.enabled = enabled;
        }
        drop(config);
        self.save()?;
        Ok(self.get())
    }

    pub fn import_routes(&self, json_str: &str) -> Result<RoutesConfig, String> {
        let imported: RoutesConfig =
            serde_json::from_str(json_str).map_err(|e| format!("Invalid JSON: {}", e))?;
        let mut config = self.config.lock().unwrap();
        *config = imported;
        drop(config);
        self.save()?;
        Ok(self.get())
    }

    pub fn export_routes(&self) -> Result<String, String> {
        let config = self.config.lock().unwrap();
        serde_json::to_string_pretty(&*config).map_err(|e| e.to_string())
    }
}
