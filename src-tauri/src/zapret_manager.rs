use crate::config_gen::ZapretConfig;
use std::fs::File;
use std::io::Write as IoWrite;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

pub struct ZapretManager {
    process: Mutex<Option<Child>>,
    winws_path: PathBuf,
    resources_dir: PathBuf,
    data_dir: PathBuf,
    log_path: PathBuf,
}

impl ZapretManager {
    pub fn new(resources_dir: PathBuf, data_dir: PathBuf) -> Self {
        let zapret_base = resources_dir.join("zapret2");
        let winws_path = zapret_base
            .join("binaries")
            .join("windows-x86_64")
            .join("winws2.exe");
        let log_path = data_dir.join("zapret_output.log");

        // Create an empty log file on startup so the Logs tab can always open it
        // even before zapret has ever been started.
        std::fs::create_dir_all(&data_dir).ok();
        if !log_path.exists() {
            std::fs::write(&log_path, "").ok();
        }

        Self {
            process: Mutex::new(None),
            winws_path,
            resources_dir,
            data_dir,
            log_path,
        }
    }

    /// List available fake-packet blob filenames (zapret2/files/fake/*.bin),
    /// sorted alphabetically. Used by the visual strategy builder.
    pub fn list_blobs(&self) -> Vec<String> {
        let dir = self.resources_dir.join("zapret2").join("files").join("fake");
        let mut names: Vec<String> = std::fs::read_dir(&dir)
            .map(|rd| {
                rd.filter_map(|e| e.ok())
                    .filter_map(|e| e.file_name().into_string().ok())
                    .filter(|n| n.ends_with(".bin"))
                    .collect()
            })
            .unwrap_or_default();
        names.sort();
        names
    }

    pub fn is_running(&self) -> bool {
        let mut proc = self.process.lock().unwrap();
        match proc.as_mut() {
            Some(child) => match child.try_wait() {
                Ok(Some(_)) => {
                    *proc = None;
                    false
                }
                Ok(None) => true,
                Err(_) => {
                    *proc = None;
                    false
                }
            },
            None => false,
        }
    }

    pub fn restart(
        &self,
        domains: &[String],
        ips: &[String],
        config: &ZapretConfig,
    ) -> Result<(), String> {
        self.stop()?;
        std::thread::sleep(std::time::Duration::from_millis(500));
        self.start(domains, ips, config)
    }

    fn start(
        &self,
        domains: &[String],
        ips: &[String],
        config: &ZapretConfig,
    ) -> Result<(), String> {
        let mut proc = self.process.lock().unwrap();

        if proc.is_some() {
            return Err("Zapret is already running".into());
        }

        // Check admin privileges
        #[cfg(windows)]
        if !is_elevated() {
            return Err("Zapret (winws2) requires administrator privileges to run. Please restart the application as administrator.".into());
        }

        // Cleanup orphaned processes
        #[cfg(windows)]
        {
            log::info!("Cleaning up any orphaned winws2 processes...");
            let _ = Command::new("taskkill")
                .args(&["/F", "/IM", "winws2.exe", "/T"])
                .output();
            std::thread::sleep(std::time::Duration::from_millis(500));
        }

        // Validate winws2.exe exists
        if !self.winws_path.exists() {
            return Err(format!(
                "winws2.exe not found at: {}",
                self.winws_path.display()
            ));
        }

        // Create data directory if needed
        if let Some(parent) = self.data_dir.parent() {
            std::fs::create_dir_all(parent).ok();
        }

        // Generate domains and IPs list files
        let domains_file = self.data_dir.join("zapret_domains.txt");
        let ips_file = self.data_dir.join("zapret_ips.txt");

        if !domains.is_empty() {
            let mut file = File::create(&domains_file)
                .map_err(|e| format!("Failed to create domains file: {}", e))?;
            for domain in domains {
                writeln!(file, "{}", domain)
                    .map_err(|e| format!("Failed to write domain: {}", e))?;
            }
        }

        if !ips.is_empty() {
            let mut file =
                File::create(&ips_file).map_err(|e| format!("Failed to create ips file: {}", e))?;
            for ip in ips {
                writeln!(file, "{}", ip).map_err(|e| format!("Failed to write IP: {}", e))?;
            }
        }

        // Convert a path to a short (8.3) Windows path with forward slashes.
        // winws2 is Cygwin-based; long paths with spaces ("Program Files", etc.)
        // can cause Cygwin argument-parsing issues. 8.3 short paths are space-free.
        fn path_to_string(path: &std::path::Path) -> String {
            #[cfg(windows)]
            {
                use std::ffi::OsString;
                use std::os::windows::ffi::{OsStrExt, OsStringExt};

                #[link(name = "kernel32")]
                extern "system" {
                    fn GetShortPathNameW(
                        lpszLongPath: *const u16,
                        lpszShortPath: *mut u16,
                        cchBuffer: u32,
                    ) -> u32;
                }

                let wide: Vec<u16> = path.as_os_str()
                    .encode_wide()
                    .chain(std::iter::once(0))
                    .collect();
                let mut buf = vec![0u16; 1024];
                let len = unsafe {
                    GetShortPathNameW(wide.as_ptr(), buf.as_mut_ptr(), buf.len() as u32)
                };
                if len > 0 && (len as usize) < buf.len() {
                    let short = OsString::from_wide(&buf[..len as usize]);
                    let s = short.to_string_lossy().replace('\\', "/");
                    log::debug!("short path: {} → {}", path.display(), s);
                    return s;
                }
            }
            path.to_string_lossy().replace('\\', "/")
        }

        // Build command arguments.
        // Capture both directions: the `circular` orchestrator (Auto strategy / builder
        // profiles using circular) requires inbound traffic to cache RST/HTTP replies for
        // its failure detector, and `--in-range` filters only work on captured inbound.
        let mut args = vec![
            format!("--wf-tcp-out={}", config.tcp_ports),
            format!("--wf-udp-out={}", config.udp_ports),
            format!("--wf-tcp-in={}", config.tcp_ports),
            format!("--wf-udp-in={}", config.udp_ports),
        ];

        // The injected hostlist/ipset attaches to the first profile in winws2 (the TLS/TCP
        // 443 profile), gating its desync to listed domains/IPs only. This keeps zapret
        // selective and — importantly — leaves the VPN server's own connection (not in the
        // list) untouched, so zapret can run alongside the VPN without breaking the tunnel.
        if !domains.is_empty() {
            args.push(format!("--hostlist={}", path_to_string(&domains_file)));
        }

        if !ips.is_empty() {
            args.push(format!("--ipset={}", path_to_string(&ips_file)));
        }

        // Add filter for TCP/UDP protocols
        //args.push(format!("--filter-tcp={}", ports_to_string(&config.tcp_ports)));
        //if !config.udp_ports.is_empty() {
        //    args.push(format!("--filter-udp={}", ports_to_string(&config.udp_ports)));
        //}

        // Add strategy arguments (includes lua init, blob files, etc.)
        // For the Builder strategy these are generated from config.profiles.
        args.extend(config.strategy_args(&self.resources_dir, &self.data_dir));

        // Add custom arguments if strategy is Custom
        if config.strategy == crate::config_gen::DpiStrategy::Custom
            && !config.custom_args.is_empty()
        {
            args.extend(
                config
                    .custom_args
                    .split_whitespace()
                    .map(String::from)
                    .collect::<Vec<String>>(),
            );
        }

        log::info!("Starting winws2 with args: {:?}", args);

        // Write startup info to log file (winws2 itself produces no stdout/stderr output)
        {
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs();
            let timestamp = format_unix_timestamp(now);
            let log_header = format!(
                "[{}] Starting zapret (winws2)\nCommand: {}\nArgs: {}\n\n",
                timestamp,
                self.winws_path.display(),
                args.join(" ")
            );
            std::fs::write(&self.log_path, &log_header).ok();
        }

        // Open log file for appending winws2 output (usually empty, but just in case)
        let log_file = std::fs::OpenOptions::new()
            .append(true)
            .open(&self.log_path)
            .map_err(|e| format!("Failed to open log file: {}", e))?;

        // Start winws2 process
        #[cfg(windows)]
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        // Set working directory to the folder containing winws2.exe so that
        // WinDivert.dll can locate WinDivert64.sys regardless of the app's cwd.
        let winws_dir = self.winws_path.parent().unwrap_or(&self.winws_path);

        #[cfg(windows)]
        let child = Command::new(&self.winws_path)
            .args(&args)
            .current_dir(winws_dir)
            .stdout(Stdio::from(log_file.try_clone().unwrap()))
            .stderr(Stdio::from(log_file))
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| format!("Failed to start winws2: {}", e))?;

        #[cfg(not(windows))]
        let child = Command::new(&self.winws_path)
            .args(&args)
            .current_dir(winws_dir)
            .stdout(Stdio::from(log_file.try_clone().unwrap()))
            .stderr(Stdio::from(log_file))
            .spawn()
            .map_err(|e| format!("Failed to start winws2: {}", e))?;

        *proc = Some(child);
        drop(proc);

        // Check if process started successfully
        std::thread::sleep(std::time::Duration::from_millis(500));
        if !self.is_running() {
            let log_content = std::fs::read_to_string(&self.log_path).unwrap_or_default();
            log::error!("winws2 failed to start. Log:\n{}", log_content);
            // Append failure info to log
            let mut f = std::fs::OpenOptions::new().append(true).open(&self.log_path).ok();
            if let Some(ref mut f) = f {
                let _ = writeln!(f, "[ERROR] winws2 failed to start");
            }
            return Err(format!("winws2 failed to start. Check logs for details: {}", log_content.lines().take(5).collect::<Vec<_>>().join("\n")));
        }

        // Append success message
        {
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs();
            let timestamp = format_unix_timestamp(now);
            if let Ok(mut f) = std::fs::OpenOptions::new().append(true).open(&self.log_path) {
                let _ = writeln!(f, "[{}] ✓ zapret started successfully. Intercepting traffic...", timestamp);
            }
        }

        log::info!("✓ winws2 started successfully");
        Ok(())
    }

    pub fn stop(&self) -> Result<(), String> {
        let mut proc = self.process.lock().unwrap();
        if let Some(mut child) = proc.take() {
            log::info!("Stopping winws2...");
            // winws2 is Cygwin-based and forks child processes that hold WinDivert
            // handles. Killing only the tracked parent leaves children alive (and the
            // filter active). Use taskkill /T to kill the entire process tree first.
            #[cfg(windows)]
            {
                use std::os::windows::process::CommandExt;
                const NO_WINDOW: u32 = 0x08000000;
                let _ = Command::new("taskkill")
                    .args(&["/F", "/IM", "winws2.exe", "/T"])
                    .creation_flags(NO_WINDOW)
                    .output();
                std::thread::sleep(std::time::Duration::from_millis(300));
            }
            let _ = child.kill();
            let _ = child.wait();
            log::info!("✓ winws2 stopped");
            // Append stop message to log
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs();
            let timestamp = format_unix_timestamp(now);
            if let Ok(mut f) = std::fs::OpenOptions::new().append(true).open(&self.log_path) {
                let _ = writeln!(f, "[{}] zapret stopped.", timestamp);
            }
        }
        Ok(())
    }

    pub fn get_log(&self) -> Result<String, String> {
        std::fs::read_to_string(&self.log_path)
            .map_err(|e| format!("Failed to read log: {}", e))
    }
}

impl Drop for ZapretManager {
    fn drop(&mut self) {
        let _ = self.stop();
    }
}

#[cfg(windows)]
fn is_elevated() -> bool {
    use std::mem;
    use windows::Win32::Foundation::{CloseHandle, HANDLE};
    use windows::Win32::Security::{GetTokenInformation, TokenElevation, TOKEN_ELEVATION, TOKEN_QUERY};
    use windows::Win32::System::Threading::{GetCurrentProcess, OpenProcessToken};

    unsafe {
        let mut token: HANDLE = HANDLE::default();
        if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token).is_err() {
            return false;
        }

        let mut elevation = TOKEN_ELEVATION::default();
        let size = mem::size_of::<TOKEN_ELEVATION>() as u32;
        let mut ret_size = 0u32;

        let result = GetTokenInformation(
            token,
            TokenElevation,
            Some(&mut elevation as *mut _ as *mut _),
            size,
            &mut ret_size,
        );

        let _ = CloseHandle(token);

        result.is_ok() && elevation.TokenIsElevated != 0
    }
}

#[cfg(not(windows))]
fn is_elevated() -> bool {
    true // On non-Windows, assume privileges are OK
}

/// Format a Unix timestamp as a simple human-readable string.
/// We avoid the chrono crate dependency here for simplicity.
fn format_unix_timestamp(secs: u64) -> String {
    // secs since 1970-01-01 UTC
    let s = secs % 60;
    let m = (secs / 60) % 60;
    let h = (secs / 3600) % 24;
    let days = secs / 86400;
    // rough date calculation (good enough for log display, ignores leap years precisely)
    let year = 1970 + days / 365;
    let day_of_year = days % 365;
    let month = day_of_year / 30 + 1;
    let day = day_of_year % 30 + 1;
    format!("{:04}-{:02}-{:02} {:02}:{:02}:{:02} UTC", year, month.min(12), day.min(31), h, m, s)
}
