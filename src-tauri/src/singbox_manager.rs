use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

pub struct SingBoxManager {
    process: Mutex<Option<Child>>,
    singbox_path: PathBuf,
    config_path: PathBuf,
    log_path: PathBuf,
}

impl SingBoxManager {
    pub fn new(resources_dir: PathBuf, data_dir: PathBuf) -> Self {
        let log_path = data_dir.join("singbox_output.log");
        std::fs::create_dir_all(&data_dir).ok();
        if !log_path.exists() {
            std::fs::write(&log_path, "").ok();
        }
        Self {
            process: Mutex::new(None),
            singbox_path: resources_dir.join("sing-box.exe"),
            config_path: data_dir.join("singbox_config.json"),
            log_path,
        }
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

    pub fn start(&self, config_json: &str) -> Result<(), String> {
        if self.is_running() {
            self.stop()?;
        }

        // Kill any orphaned sing-box processes
        #[cfg(windows)]
        {
            log::info!("Cleaning up any orphaned sing-box processes...");
            let _ = Command::new("taskkill")
                .args(&["/F", "/IM", "sing-box.exe", "/T"])
                .output();
            std::thread::sleep(std::time::Duration::from_millis(500));
        }

        if !self.singbox_path.exists() {
            return Err(format!(
                "sing-box.exe not found at {}. Download from https://github.com/SagerNet/sing-box/releases",
                self.singbox_path.display()
            ));
        }

        // Check admin privileges (required for TUN + WFP)
        if !is_elevated() {
            return Err("Per-app VPN mode requires administrator privileges. Please restart the app as administrator.".into());
        }

        // Write config
        if let Some(parent) = self.config_path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        std::fs::write(&self.config_path, config_json).map_err(|e| e.to_string())?;

        // Create log file
        let log_handle = std::fs::File::create(&self.log_path)
            .map_err(|e| format!("Failed to create log file: {}", e))?;

        let mut cmd = Command::new(&self.singbox_path);
        cmd.args(["run", "-c", &self.config_path.to_string_lossy()])
            .stdout(Stdio::from(log_handle.try_clone().unwrap()))
            .stderr(Stdio::from(log_handle));

        // Set working directory to resources dir so sing-box can find wintun.dll
        if let Some(parent) = self.singbox_path.parent() {
            cmd.current_dir(parent);
        }

        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }

        let mut child = cmd
            .spawn()
            .map_err(|e| format!("Failed to start sing-box: {}", e))?;

        // Wait and check if process is still running
        std::thread::sleep(std::time::Duration::from_millis(1500));
        match child.try_wait() {
            Ok(Some(status)) => {
                // Read log for error details
                let log_content = std::fs::read_to_string(&self.log_path).unwrap_or_default();
                log::error!("sing-box exited immediately with status {}: {}", status, log_content);
                return Err(format!(
                    "sing-box failed to start (exit code {}). Check logs for details.",
                    status.code().unwrap_or(-1)
                ));
            }
            Ok(None) => {
                log::info!("sing-box started successfully (TUN + per-app routing)");

                // Log output
                if let Ok(content) = std::fs::read_to_string(&self.log_path) {
                    if !content.trim().is_empty() {
                        log::info!("sing-box output:\n{}", content);
                    }
                }
            }
            Err(e) => {
                log::warn!("Could not check sing-box status: {}", e);
            }
        }

        *self.process.lock().unwrap() = Some(child);
        Ok(())
    }

    pub fn stop(&self) -> Result<(), String> {
        // Take the child out of the mutex immediately — we must not hold the lock
        // during the graceful-shutdown wait (it can block for up to 3 seconds).
        let child_opt = {
            let mut guard = self.process.lock().unwrap();
            guard.take()
        };

        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const NO_WINDOW: u32 = 0x08000000;

            if let Some(mut child) = child_opt {
                // Step 1: Ask sing-box to shut down gracefully.
                // taskkill without /F sends CTRL_CLOSE_EVENT to console processes,
                // giving the Go runtime a chance to run deferred cleanup (WFP filters,
                // TUN adapter, routing table entries).
                let _ = Command::new("taskkill")
                    .args(&["/IM", "sing-box.exe"])
                    .creation_flags(NO_WINDOW)
                    .output();

                // Step 2: Wait up to 3 s for the process to exit gracefully.
                let deadline = std::time::Instant::now() + std::time::Duration::from_secs(3);
                let exited = loop {
                    match child.try_wait() {
                        Ok(Some(_)) => break true,
                        Ok(None) if std::time::Instant::now() < deadline => {
                            std::thread::sleep(std::time::Duration::from_millis(200));
                        }
                        _ => break false,
                    }
                };

                if exited {
                    log::info!("sing-box exited gracefully");
                } else {
                    // Step 3: Graceful shutdown timed out — force kill.
                    log::warn!("sing-box did not exit gracefully within 3 s, force killing");
                    let _ = child.kill();
                    let _ = child.wait();
                }
            }

            // Step 4: Kill any orphaned sing-box instances (previous crash, etc.)
            let _ = Command::new("taskkill")
                .args(&["/F", "/IM", "sing-box.exe", "/T"])
                .creation_flags(NO_WINDOW)
                .output();
            std::thread::sleep(std::time::Duration::from_millis(500));

            // Step 5: Clean up any routes / TUN adapter that sing-box may not have
            // removed (happens when it was force-killed or crashed).
            // Stale routes via AbuzeJoyTun break WinDivert (zapret) in the next mode.
            let cleanup = concat!(
                "Remove-NetRoute -InterfaceAlias 'AbuzeJoyTun'",
                " -Confirm:$false -ErrorAction SilentlyContinue;",
                "Remove-NetRoute -InterfaceAlias 'AbuzeJoyTun'",
                " -AddressFamily IPv6 -Confirm:$false -ErrorAction SilentlyContinue;",
                "Remove-NetAdapter -Name 'AbuzeJoyTun'",
                " -Confirm:$false -ErrorAction SilentlyContinue"
            );
            let _ = Command::new("powershell")
                .args(&["-NoProfile", "-NonInteractive", "-Command", cleanup])
                .creation_flags(NO_WINDOW)
                .output();
            // Give the wintun driver a moment to release the adapter handle.
            std::thread::sleep(std::time::Duration::from_millis(500));
        }

        #[cfg(not(windows))]
        if let Some(mut child) = child_opt {
            let _ = child.kill();
            let _ = child.wait();
        }

        log::info!("sing-box stopped");
        Ok(())
    }

    pub fn restart(&self, config_json: &str) -> Result<(), String> {
        self.stop()?;
        std::thread::sleep(std::time::Duration::from_millis(500));
        self.start(config_json)
    }

    pub fn get_log(&self) -> Result<String, String> {
        std::fs::read_to_string(&self.log_path).map_err(|e| e.to_string())
    }
}

impl Drop for SingBoxManager {
    fn drop(&mut self) {
        let _ = self.stop();
    }
}

#[cfg(windows)]
fn is_elevated() -> bool {
    use std::ptr;
    use std::mem;

    unsafe {
        let mut token_handle: *mut std::ffi::c_void = ptr::null_mut();
        let current_process = -1isize as *mut std::ffi::c_void;

        #[link(name = "advapi32")]
        extern "system" {
            fn OpenProcessToken(
                ProcessHandle: *mut std::ffi::c_void,
                DesiredAccess: u32,
                TokenHandle: *mut *mut std::ffi::c_void,
            ) -> i32;
            fn GetTokenInformation(
                TokenHandle: *mut std::ffi::c_void,
                TokenInformationClass: u32,
                TokenInformation: *mut std::ffi::c_void,
                TokenInformationLength: u32,
                ReturnLength: *mut u32,
            ) -> i32;
            fn CloseHandle(hObject: *mut std::ffi::c_void) -> i32;
        }

        const TOKEN_QUERY: u32 = 0x0008;
        const TOKEN_ELEVATION: u32 = 20;

        if OpenProcessToken(current_process, TOKEN_QUERY, &mut token_handle) == 0 {
            return false;
        }

        let mut elevation: u32 = 0;
        let mut size: u32 = 0;

        let result = GetTokenInformation(
            token_handle,
            TOKEN_ELEVATION,
            &mut elevation as *mut u32 as *mut std::ffi::c_void,
            mem::size_of::<u32>() as u32,
            &mut size,
        );

        CloseHandle(token_handle);

        result != 0 && elevation != 0
    }
}

#[cfg(not(windows))]
fn is_elevated() -> bool {
    false
}
