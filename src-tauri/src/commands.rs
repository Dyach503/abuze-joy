use crate::app_routes::{AppRoutesConfig, AppRoutesManager};
use crate::config_gen::{generate_singbox_config, generate_singbox_full_vpn_config, generate_singbox_proxy_config, DpiStrategy, ServerConfig, VpnMode, ZapretConfig};
use crate::routes::{RoutesConfig, RoutesManager};
use crate::singbox_manager::SingBoxManager;
use crate::zapret_autotest::AutotestResult;
use crate::zapret_manager::ZapretManager;
use crate::zapret_routes::ZapretRoutesManager;
use serde::Serialize;
use std::sync::Mutex;
use tauri::State;

pub struct AppState {
    pub routes: RoutesManager,
    pub zapret_routes: ZapretRoutesManager,
    pub app_routes: AppRoutesManager,
    pub zapret: ZapretManager,
    pub singbox: SingBoxManager,
    pub server_config: Mutex<ServerConfig>,
    pub zapret_config: Mutex<ZapretConfig>,
    pub current_mode: Mutex<VpnMode>,
    pub data_dir: std::path::PathBuf,
}

#[derive(Serialize)]
pub struct StatusInfo {
    pub mode: VpnMode,
    pub zapret_running: bool,
    pub singbox_running: bool,
}

// ── Routes ──

#[tauri::command]
pub fn get_routes(state: State<AppState>) -> Result<RoutesConfig, String> {
    Ok(state.routes.get())
}

#[tauri::command]
pub fn add_domain(state: State<AppState>, value: String, note: String) -> Result<RoutesConfig, String> {
    state.routes.add_domain(value, note)
}

#[tauri::command]
pub fn add_ip(state: State<AppState>, value: String, note: String) -> Result<RoutesConfig, String> {
    state.routes.add_ip(value, note)
}

#[tauri::command]
pub fn remove_domain(state: State<AppState>, value: String) -> Result<RoutesConfig, String> {
    state.routes.remove_domain(&value)
}

#[tauri::command]
pub fn remove_ip(state: State<AppState>, value: String) -> Result<RoutesConfig, String> {
    state.routes.remove_ip(&value)
}

#[tauri::command]
pub fn toggle_domain(state: State<AppState>, value: String, enabled: bool) -> Result<RoutesConfig, String> {
    state.routes.toggle_domain(&value, enabled)
}

#[tauri::command]
pub fn toggle_ip(state: State<AppState>, value: String, enabled: bool) -> Result<RoutesConfig, String> {
    state.routes.toggle_ip(&value, enabled)
}

#[tauri::command]
pub fn import_routes(state: State<AppState>, json_str: String) -> Result<RoutesConfig, String> {
    state.routes.import_routes(&json_str)
}

#[tauri::command]
pub fn export_routes(state: State<AppState>) -> Result<String, String> {
    state.routes.export_routes()
}

// ── Zapret Routes ──

#[tauri::command]
pub fn get_zapret_routes(state: State<AppState>) -> Result<RoutesConfig, String> {
    Ok(state.zapret_routes.get())
}

#[tauri::command]
pub fn add_zapret_domain(state: State<AppState>, value: String, note: String) -> Result<RoutesConfig, String> {
    state.zapret_routes.add_domain(value, note)
}

#[tauri::command]
pub fn add_zapret_ip(state: State<AppState>, value: String, note: String) -> Result<RoutesConfig, String> {
    state.zapret_routes.add_ip(value, note)
}

#[tauri::command]
pub fn remove_zapret_domain(state: State<AppState>, value: String) -> Result<RoutesConfig, String> {
    state.zapret_routes.remove_domain(&value)
}

#[tauri::command]
pub fn remove_zapret_ip(state: State<AppState>, value: String) -> Result<RoutesConfig, String> {
    state.zapret_routes.remove_ip(&value)
}

#[tauri::command]
pub fn toggle_zapret_domain(state: State<AppState>, value: String, enabled: bool) -> Result<RoutesConfig, String> {
    state.zapret_routes.toggle_domain(&value, enabled)
}

#[tauri::command]
pub fn toggle_zapret_ip(state: State<AppState>, value: String, enabled: bool) -> Result<RoutesConfig, String> {
    state.zapret_routes.toggle_ip(&value, enabled)
}

#[tauri::command]
pub fn import_zapret_routes(state: State<AppState>, json_str: String) -> Result<RoutesConfig, String> {
    state.zapret_routes.import_routes(&json_str)
}

#[tauri::command]
pub fn export_zapret_routes(state: State<AppState>) -> Result<String, String> {
    state.zapret_routes.export_routes()
}

#[tauri::command]
pub fn import_zapret_domains_from_file(state: State<AppState>, file_path: String) -> Result<RoutesConfig, String> {
    log::info!("Importing Zapret domains from file: {}", file_path);

    let content = std::fs::read_to_string(&file_path)
        .map_err(|e| format!("Failed to read file: {}", e))?;

    let mut added_count = 0;
    let mut skipped_count = 0;

    for line in content.lines() {
        let domain = line.trim();

        if domain.is_empty() || domain.starts_with('#') || domain.starts_with("//") {
            continue;
        }

        if let Err(e) = state.zapret_routes.add_domain(domain.to_string(), "Imported from file".to_string()) {
            skipped_count += 1;
            log::warn!("Skipped domain {}: {}", domain, e);
        } else {
            added_count += 1;
            log::info!("Added domain: {}", domain);
        }
    }

    log::info!(
        "Import completed: {} domains added, {} skipped",
        added_count,
        skipped_count
    );

    Ok(state.zapret_routes.get())
}

// ── App Routes ──

#[tauri::command]
pub fn get_app_routes(state: State<AppState>) -> Result<AppRoutesConfig, String> {
    Ok(state.app_routes.get())
}

#[tauri::command]
pub fn add_app(state: State<AppState>, path: String, note: String) -> Result<AppRoutesConfig, String> {
    state.app_routes.add_app(path, note)
}

#[tauri::command]
pub fn remove_app(state: State<AppState>, path: String) -> Result<AppRoutesConfig, String> {
    state.app_routes.remove_app(&path)
}

#[tauri::command]
pub fn toggle_app(state: State<AppState>, path: String, enabled: bool) -> Result<AppRoutesConfig, String> {
    state.app_routes.toggle_app(&path, enabled)
}

// ── Server Config ──

#[tauri::command]
pub fn get_server_config(state: State<AppState>) -> Result<ServerConfig, String> {
    Ok(state.server_config.lock().unwrap().clone())
}

#[tauri::command]
pub fn save_server_config(state: State<AppState>, config: ServerConfig) -> Result<(), String> {
    let json = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    let path = state.data_dir.join("server.json");
    std::fs::write(&path, json).map_err(|e| e.to_string())?;
    *state.server_config.lock().unwrap() = config;
    Ok(())
}

#[tauri::command]
pub fn parse_vless_uri(uri: String) -> Result<ServerConfig, String> {
    ServerConfig::parse_vless_uri(&uri)
}

// ── Zapret Config ──

#[tauri::command]
pub fn get_zapret_config(state: State<AppState>) -> Result<ZapretConfig, String> {
    Ok(state.zapret_config.lock().unwrap().clone())
}

#[tauri::command]
pub fn save_zapret_config(state: State<AppState>, config: ZapretConfig) -> Result<(), String> {
    let json = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    let path = state.data_dir.join("zapret_config.json");
    std::fs::write(&path, json).map_err(|e| e.to_string())?;
    *state.zapret_config.lock().unwrap() = config;
    Ok(())
}

#[tauri::command]
pub fn list_zapret_blobs(state: State<AppState>) -> Result<Vec<String>, String> {
    Ok(state.zapret.list_blobs())
}

#[tauri::command]
pub fn get_zapret_log(state: State<AppState>) -> Result<String, String> {
    state.zapret.get_log()
}

#[tauri::command]
pub fn get_singbox_log(state: State<AppState>) -> Result<String, String> {
    state.singbox.get_log()
}

// ── VPN Control ──

#[tauri::command]
pub fn get_status(state: State<AppState>) -> StatusInfo {
    StatusInfo {
        mode: *state.current_mode.lock().unwrap(),
        zapret_running: state.zapret.is_running(),
        singbox_running: state.singbox.is_running(),
    }
}

#[tauri::command]
pub fn set_mode(state: State<AppState>, mode: VpnMode) -> Result<StatusInfo, String> {
    let server = state.server_config.lock().unwrap().clone();
    let vpn_routes = state.routes.get();
    let zapret_routes = state.zapret_routes.get();
    let zapret_config = state.zapret_config.lock().unwrap().clone();

    match mode {
        VpnMode::Off => {
            log::info!("Switching to OFF mode - stopping all services");
            set_system_proxy(false)?;
            state.zapret.stop()?;
            state.singbox.stop()?;
        }

        VpnMode::VpnSelective => {
            log::info!("Switching to VPN Selective mode");
            if server.address.is_empty() || server.uuid.is_empty() {
                return Err("Server not configured. Please set VLESS server settings first.".into());
            }

            let app_routes_config = state.app_routes.get();
            let has_app_routes = state.app_routes.has_enabled_apps();

            if has_app_routes {
                // Per-app mode: use sing-box with TUN + WFP process routing
                log::info!("App routes detected — using sing-box for per-app VPN routing");
                state.zapret.stop()?;
                set_system_proxy(false)?;

                let singbox_config = generate_singbox_config(&server, &vpn_routes, &app_routes_config);
                let config_str = serde_json::to_string_pretty(&singbox_config).map_err(|e| e.to_string())?;

                log::info!("sing-box config: {}", config_str);
                state.singbox.restart(&config_str)?;
                log::info!("✓ VPN Selective mode enabled (per-app via sing-box TUN)");
            } else {
                // No app routes: use sing-box in proxy mode (mixed+HTTP inbound, no TUN)
                state.zapret.stop()?;

                let singbox_config = generate_singbox_proxy_config(&server, &vpn_routes);
                let config_str = serde_json::to_string_pretty(&singbox_config).map_err(|e| e.to_string())?;

                log::debug!("sing-box proxy config: {}", config_str);
                state.singbox.restart(&config_str)?;

                std::thread::sleep(std::time::Duration::from_millis(1000));
                set_system_proxy(true)?;
                log::info!("✓ VPN Selective mode enabled (sing-box proxy)");
            }
        }

        VpnMode::Zapret => {
            log::info!("Switching to Zapret mode");
            state.singbox.stop()?;
            set_system_proxy(false)?;

            let domains: Vec<String> = zapret_routes
                .domains
                .iter()
                .filter(|d| d.enabled)
                .map(|d| d.value.clone())
                .collect();
            let ips: Vec<String> = zapret_routes
                .ips
                .iter()
                .filter(|i| i.enabled)
                .map(|i| i.value.clone())
                .collect();

            if domains.is_empty() && ips.is_empty() {
                return Err("No Zapret routes configured. Please add domains or IPs to Zapret routes.".into());
            }

            state.zapret.restart(&domains, &ips, &zapret_config)?;
            log::info!("✓ Zapret mode enabled");
        }

        VpnMode::VpnZapret => {
            log::info!("Switching to VPN + Zapret mode");
            if server.address.is_empty() || server.uuid.is_empty() {
                return Err("Server not configured. Please set VLESS server settings first.".into());
            }

            let app_routes_config = state.app_routes.get();
            let has_app_routes = state.app_routes.has_enabled_apps();

            if has_app_routes {
                // Per-app mode: use sing-box + zapret
                log::info!("App routes detected — using sing-box for per-app VPN routing + Zapret");
                set_system_proxy(false)?;

                let singbox_config = generate_singbox_config(&server, &vpn_routes, &app_routes_config);
                let config_str = serde_json::to_string_pretty(&singbox_config).map_err(|e| e.to_string())?;

                log::info!("sing-box config: {}", config_str);
                state.singbox.restart(&config_str)?;
            } else {
                // No app routes: use sing-box in proxy mode (mixed+HTTP inbound, no TUN)

                let singbox_config = generate_singbox_proxy_config(&server, &vpn_routes);
                let config_str = serde_json::to_string_pretty(&singbox_config).map_err(|e| e.to_string())?;

                log::debug!("sing-box proxy config: {}", config_str);
                state.singbox.restart(&config_str)?;

                std::thread::sleep(std::time::Duration::from_millis(1000));
                set_system_proxy(true)?;
            }

            let domains: Vec<String> = zapret_routes
                .domains
                .iter()
                .filter(|d| d.enabled)
                .map(|d| d.value.clone())
                .collect();
            let ips: Vec<String> = zapret_routes
                .ips
                .iter()
                .filter(|i| i.enabled)
                .map(|i| i.value.clone())
                .collect();

            if !domains.is_empty() || !ips.is_empty() {
                state.zapret.restart(&domains, &ips, &zapret_config)?;
                log::info!("✓ VPN + Zapret mode enabled");
            } else {
                log::warn!("No Zapret routes configured, running VPN only");
            }
        }

        VpnMode::VpnFull => {
            log::info!("Switching to Full VPN mode (via sing-box)");
            if server.address.is_empty() || server.uuid.is_empty() {
                return Err("Server not configured. Please set VLESS server settings first.".into());
            }

            state.zapret.stop()?;
            set_system_proxy(false)?;

            let singbox_config = generate_singbox_full_vpn_config(&server);
            let config_str = serde_json::to_string_pretty(&singbox_config).map_err(|e| e.to_string())?;

            log::info!("sing-box Full VPN config: {}", config_str);
            state.singbox.start(&config_str)?;
            log::info!("✓ Full VPN mode enabled (sing-box auto_route)");
        }
    }

    *state.current_mode.lock().unwrap() = mode;

    Ok(StatusInfo {
        mode,
        zapret_running: state.zapret.is_running(),
        singbox_running: state.singbox.is_running(),
    })
}

#[tauri::command]
pub fn apply_routes(state: State<AppState>) -> Result<StatusInfo, String> {
    let mode = *state.current_mode.lock().unwrap();
    if mode == VpnMode::Off {
        return Ok(get_status(state));
    }
    set_mode(state, mode)
}

// ── System Proxy Management ──

#[cfg(windows)]
fn set_system_proxy(enable: bool) -> Result<(), String> {
    use std::process::Command;

    if enable {
        log::info!("Enabling Windows system proxy...");

        // Enable proxy
        let output = Command::new("reg")
            .args(&[
                "add",
                "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings",
                "/v", "ProxyEnable",
                "/t", "REG_DWORD",
                "/d", "1",
                "/f"
            ])
            .output()
            .map_err(|e| format!("Failed to enable proxy: {}", e))?;

        if !output.status.success() {
            return Err("Failed to enable proxy in registry".into());
        }

        // Set proxy server
        let output = Command::new("reg")
            .args(&[
                "add",
                "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings",
                "/v", "ProxyServer",
                "/t", "REG_SZ",
                "/d", "http=127.0.0.1:10809;https=127.0.0.1:10809",
                "/f"
            ])
            .output()
            .map_err(|e| format!("Failed to set proxy server: {}", e))?;

        if !output.status.success() {
            return Err("Failed to set proxy server in registry".into());
        }

        // Set proxy bypass for local addresses
        let output = Command::new("reg")
            .args(&[
                "add",
                "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings",
                "/v", "ProxyOverride",
                "/t", "REG_SZ",
                "/d", "localhost;127.*;10.*;172.16.*;172.17.*;172.18.*;172.19.*;172.20.*;172.21.*;172.22.*;172.23.*;172.24.*;172.25.*;172.26.*;172.27.*;172.28.*;172.29.*;172.30.*;172.31.*;192.168.*;<local>",
                "/f"
            ])
            .output()
            .map_err(|e| format!("Failed to set proxy bypass: {}", e))?;

        if !output.status.success() {
            return Err("Failed to set proxy bypass in registry".into());
        }

        log::info!("✓ System proxy enabled");
    } else {
        log::info!("Disabling Windows system proxy...");

        // Disable proxy
        let output = Command::new("reg")
            .args(&[
                "add",
                "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings",
                "/v", "ProxyEnable",
                "/t", "REG_DWORD",
                "/d", "0",
                "/f"
            ])
            .output()
            .map_err(|e| format!("Failed to disable proxy: {}", e))?;

        if !output.status.success() {
            return Err("Failed to disable proxy in registry".into());
        }

        log::info!("✓ System proxy disabled");
    }

    // Notify system of proxy changes
    let _ = Command::new("rundll32.exe")
        .args(&["wininet.dll,InternetSetOption", "0", "39", "0", "0"])
        .output();

    Ok(())
}

#[cfg(not(windows))]
fn set_system_proxy(_enable: bool) -> Result<(), String> {
    Ok(())
}

// ── Zapret Autotest ──

#[tauri::command]
pub async fn run_zapret_autotest(
    state: State<'_, AppState>,
    test_domain: String,
) -> Result<Vec<AutotestResult>, String> {
    log::info!("Starting Zapret autotest for domain: {}", test_domain);

    let zapret_config = state.zapret_config.lock().unwrap().clone();
    let tcp_ports = zapret_config.tcp_ports.clone();
    let udp_ports = zapret_config.udp_ports.clone();

    let strategies = vec![
        DpiStrategy::Normal,
        DpiStrategy::NormalPlus,
        DpiStrategy::NormalDiscord,
        DpiStrategy::Auto,
    ];

    let mut results = Vec::new();

    for strategy in strategies {
        log::info!("Testing strategy: {:?}", strategy);

        let result = test_strategy_command(
            &state,
            &test_domain,
            strategy,
            &tcp_ports,
            &udp_ports,
        )
        .await;

        results.push(result);

        tokio::time::sleep(std::time::Duration::from_secs(2)).await;
    }

    log::info!("Autotest completed. Results: {:?}", results);
    Ok(results)
}

async fn test_strategy_command(
    state: &State<'_, AppState>,
    domain: &str,
    strategy: DpiStrategy,
    tcp_ports: &str,
    udp_ports: &str,
) -> AutotestResult {
    let strategy_name = format!("{:?}", strategy);
    let start_time = std::time::Instant::now();

    let config = ZapretConfig {
        strategy,
        tcp_ports: tcp_ports.to_string(),
        udp_ports: udp_ports.to_string(),
        custom_args: String::new(),
        profiles: Vec::new(),
    };

    let domains = vec![domain.to_string()];
    let ips: Vec<String> = vec![];

    match state.zapret.restart(&domains, &ips, &config) {
        Ok(_) => {
            log::info!("Zapret started with strategy {:?}", strategy);

            tokio::time::sleep(std::time::Duration::from_millis(1000)).await;

            let test_result = test_http_request_command(domain).await;

            let _ = state.zapret.stop();

            let response_time = start_time.elapsed().as_millis() as u64;

            match test_result {
                Ok(_) => AutotestResult {
                    strategy: strategy_name,
                    success: true,
                    response_time_ms: response_time,
                    error: None,
                },
                Err(e) => AutotestResult {
                    strategy: strategy_name,
                    success: false,
                    response_time_ms: response_time,
                    error: Some(e),
                },
            }
        }
        Err(e) => AutotestResult {
            strategy: strategy_name,
            success: false,
            response_time_ms: 0,
            error: Some(format!("Failed to start zapret: {}", e)),
        },
    }
}

async fn test_http_request_command(domain: &str) -> Result<(), String> {
    let url = format!("https://{}", domain);

    log::info!("Testing request to: {}", url);

    let output = tokio::task::spawn_blocking(move || {
        std::process::Command::new("curl")
            .args(&[
                "-I", // HEAD request
                "-s", // silent
                "-L", // follow redirects
                "--max-time",
                "10",
                "--connect-timeout",
                "5",
                "-k", // allow insecure (for testing)
                &url,
            ])
            .output()
    })
    .await
    .map_err(|e| format!("Task error: {}", e))?
    .map_err(|e| format!("Failed to execute curl: {}", e))?;

    if output.status.success() {
        let response = String::from_utf8_lossy(&output.stdout);
        if response.contains("HTTP")
            && (response.contains("200")
                || response.contains("301")
                || response.contains("302")
                || response.contains("304"))
        {
            log::info!("Request successful!");
            Ok(())
        } else {
            Err(format!("Unexpected response: {}", response))
        }
    } else {
        let error = String::from_utf8_lossy(&output.stderr);
        Err(format!("Request failed: {}", error))
    }
}
