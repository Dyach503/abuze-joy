use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppRouteEntry {
    pub path: String,
    pub enabled: bool,
    pub note: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AppRoutesConfig {
    pub apps: Vec<AppRouteEntry>,
}

pub struct AppRoutesManager {
    path: PathBuf,
    config: Mutex<AppRoutesConfig>,
}

impl AppRoutesManager {
    pub fn new(data_dir: PathBuf) -> Self {
        let path = data_dir.join("app_routes.json");
        let config = if path.exists() {
            let content = fs::read_to_string(&path).unwrap_or_default();
            serde_json::from_str(&content).unwrap_or_default()
        } else {
            AppRoutesConfig::default()
        };
        Self {
            path,
            config: Mutex::new(config),
        }
    }

    pub fn get(&self) -> AppRoutesConfig {
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

    pub fn add_app(&self, path: String, note: String) -> Result<AppRoutesConfig, String> {
        let path = path.trim().to_string();
        if path.is_empty() {
            return Err("Application path cannot be empty".into());
        }
        let mut config = self.config.lock().unwrap();
        if config.apps.iter().any(|a| a.path.eq_ignore_ascii_case(&path)) {
            return Err(format!("Application '{}' already exists", path));
        }
        config.apps.push(AppRouteEntry {
            path,
            enabled: true,
            note,
        });
        drop(config);
        self.save()?;
        Ok(self.get())
    }

    pub fn remove_app(&self, path: &str) -> Result<AppRoutesConfig, String> {
        let mut config = self.config.lock().unwrap();
        config.apps.retain(|a| !a.path.eq_ignore_ascii_case(path));
        drop(config);
        self.save()?;
        Ok(self.get())
    }

    pub fn toggle_app(&self, path: &str, enabled: bool) -> Result<AppRoutesConfig, String> {
        let mut config = self.config.lock().unwrap();
        if let Some(entry) = config.apps.iter_mut().find(|a| a.path.eq_ignore_ascii_case(path)) {
            entry.enabled = enabled;
        }
        drop(config);
        self.save()?;
        Ok(self.get())
    }

    /// Returns enabled app paths for sing-box process_path rules
    pub fn get_enabled_paths(&self) -> Vec<String> {
        self.config
            .lock()
            .unwrap()
            .apps
            .iter()
            .filter(|a| a.enabled)
            .map(|a| a.path.clone())
            .collect()
    }

    /// Returns true if there are any enabled app routes
    pub fn has_enabled_apps(&self) -> bool {
        self.config
            .lock()
            .unwrap()
            .apps
            .iter()
            .any(|a| a.enabled)
    }
}
