pub mod app_routes;
pub mod commands;
pub mod config_gen;
pub mod routes;
pub mod singbox_manager;
pub mod zapret_autotest;
pub mod zapret_manager;
pub mod zapret_routes;

use app_routes::AppRoutesManager;
use commands::AppState;
use config_gen::{ServerConfig, VpnMode, ZapretConfig};
use routes::RoutesManager;
use singbox_manager::SingBoxManager;
use std::sync::Mutex;
use tauri::Manager;
use zapret_manager::ZapretManager;
use zapret_routes::ZapretRoutesManager;

pub fn run() {
    env_logger::Builder::from_default_env()
        .filter_level(log::LevelFilter::Info)
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // Portable layout: `resources/` and `data/` live next to the .exe, so a
            // user can drop the folder anywhere and nothing is written outside it.
            // In dev the exe lives in src-tauri/target/<profile>/, so resolve the
            // project root instead (up 4: profile -> target -> src-tauri -> root).
            let base_dir = if cfg!(debug_assertions) {
                std::env::current_exe()
                    .ok()
                    .and_then(|p| Some(p.parent()?.parent()?.parent()?.parent()?.to_path_buf()))
                    .unwrap_or_else(|| std::path::PathBuf::from("."))
            } else {
                std::env::current_exe()
                    .ok()
                    .and_then(|p| p.parent().map(|p| p.to_path_buf()))
                    .unwrap_or_else(|| std::path::PathBuf::from("."))
            };

            let resources_dir = base_dir.join("resources");
            let data_dir = base_dir.join("data");

            std::fs::create_dir_all(&data_dir).ok();
            std::fs::create_dir_all(&resources_dir).ok();
            log::info!("resources_dir = {}", resources_dir.display());
            log::info!("data_dir = {}", data_dir.display());

            // Create discord_list.txt if it doesn't exist (required for NormalPlus strategy)
            let discord_list = data_dir.join("discord_list.txt");
            if !discord_list.exists() {
                let default_discord_domains = "discord.com\ndiscordapp.com\ndiscord.gg\ndiscord.media\n";
                std::fs::write(&discord_list, default_discord_domains).ok();
            }

            // Load server config
            let server_path = data_dir.join("server.json");
            let server_config = if server_path.exists() {
                let content = std::fs::read_to_string(&server_path).unwrap_or_default();
                serde_json::from_str(&content).unwrap_or_default()
            } else {
                ServerConfig::default()
            };

            // Load zapret config
            let zapret_config_path = data_dir.join("zapret_config.json");
            let zapret_config = if zapret_config_path.exists() {
                let content = std::fs::read_to_string(&zapret_config_path).unwrap_or_default();
                serde_json::from_str(&content).unwrap_or_default()
            } else {
                ZapretConfig::default()
            };

            // Create discord_list.txt if it doesn't exist
            let discord_list_path = data_dir.join("discord_list.txt");
            if !discord_list_path.exists() {
                const DEFAULT_DISCORD_LIST: &str = include_str!("../discord_list.txt");
                std::fs::write(&discord_list_path, DEFAULT_DISCORD_LIST).ok();
            }

            let state = AppState {
                routes: RoutesManager::new(data_dir.clone()),
                zapret_routes: ZapretRoutesManager::new(data_dir.clone()),
                app_routes: AppRoutesManager::new(data_dir.clone()),
                zapret: ZapretManager::new(resources_dir.clone(), data_dir.clone()),
                singbox: SingBoxManager::new(resources_dir, data_dir.clone()),
                server_config: Mutex::new(server_config),
                zapret_config: Mutex::new(zapret_config),
                current_mode: Mutex::new(VpnMode::Off),
                data_dir,
            };

            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_routes,
            commands::add_domain,
            commands::add_ip,
            commands::remove_domain,
            commands::remove_ip,
            commands::toggle_domain,
            commands::toggle_ip,
            commands::import_routes,
            commands::export_routes,
            commands::get_zapret_routes,
            commands::add_zapret_domain,
            commands::add_zapret_ip,
            commands::remove_zapret_domain,
            commands::remove_zapret_ip,
            commands::toggle_zapret_domain,
            commands::toggle_zapret_ip,
            commands::import_zapret_routes,
            commands::export_zapret_routes,
            commands::import_zapret_domains_from_file,
            commands::get_app_routes,
            commands::add_app,
            commands::remove_app,
            commands::toggle_app,
            commands::get_server_config,
            commands::save_server_config,
            commands::parse_vless_uri,
            commands::get_zapret_config,
            commands::save_zapret_config,
            commands::list_zapret_blobs,
            commands::get_zapret_log,
            commands::get_singbox_log,
            commands::get_status,
            commands::set_mode,
            commands::apply_routes,
            commands::run_zapret_autotest,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
