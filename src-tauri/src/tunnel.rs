//! Publish the LAN HTTP server to the public internet using free tunnels.
//!
//! Methods:
//!  1. "localhostrun" — ssh -R via Windows' built-in OpenSSH client (zero download,
//!     free, no signup; gives https://<sub>.lhr.life)
//!  2. "trycloudflare" — cloudflared quick tunnel (free, no account). Downloads
//!     cloudflared.exe into the app's runtime dir on first use and runs
//!     `cloudflared tunnel --url http://127.0.0.1:<port>` (gives a trycloudflare.com URL)
//!  3. "custom" — user-supplied reverse-proxy URL, displayed as-is (for users
//!     running their own tunnel / port-forward).

use std::io::Read;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use tauri::Manager;

use crate::state::{now_ms, runtime_dir, AppState};
use crate::types::TunnelStatus;

const CREATE_NO_WINDOW: u32 = 0x0800_0000;

pub fn start(
    app: &tauri::AppHandle,
    state: &AppState,
    method: &str,
    http_port: u16,
    custom_url: Option<String>,
) -> Result<(), String> {
    use crate::logs;
    stop(state, true);
    state.tunnel_cancel.store(false, Ordering::Relaxed);

    match method {
        "custom" => {
            let url = custom_url.unwrap_or_default();
            if url.is_empty() {
                return Err("no custom URL provided".into());
            }
            let mut t = state.tunnel.lock().unwrap();
            t.method = method.into();
            t.state = "active".into();
            t.public_url = Some(url.clone());
            t.detail = "user-provided reverse proxy".into();
            t.started_at = Some(now_ms());
            drop(t);
            logs::ok(app, "NET", format!("publish point set: {url}"));
            Ok(())
        }
        "localhostrun" => {
            {
                let mut t = state.tunnel.lock().unwrap();
                t.method = method.into();
                t.state = "starting".into();
                t.public_url = None;
                t.detail = "connecting via ssh to localhost.run".into();
                t.started_at = None;
            }
            logs::info(app, "NET", "opening reverse tunnel via localhost.run (ssh)");
            let port = http_port;
            let app2 = app.clone();
            std::thread::spawn(move || {
                let mut cmd = Command::new("ssh");
                cmd.args([
                    "-o",
                    "StrictHostKeyChecking=no",
                    "-o",
                    "UserKnownHostsFile=NUL",
                    "-o",
                    "ServerAliveInterval=30",
                    "-o",
                    "ExitOnForwardFailure=yes",
                    "-R",
                    &format!("80:127.0.0.1:{port}"),
                    "nokey@localhost.run",
                ]);
                #[cfg(windows)]
                {
                    use std::os::windows::process::CommandExt;
                    let _ = cmd.creation_flags(CREATE_NO_WINDOW);
                }
                cmd.stdout(Stdio::piped()).stderr(Stdio::piped());
                match cmd.spawn() {
                    Ok(child) => watch_child(&app2, port, "localhostrun", child),
                    Err(e) => fail(
                        &app2,
                        "localhostrun",
                        &format!(
                            "ssh.exe not available ({e}). Windows OpenSSH client is required — or use the Cloudflare method."
                        ),
                    ),
                }
            });
            Ok(())
        }
        "trycloudflare" => {
            {
                let mut t = state.tunnel.lock().unwrap();
                t.method = method.into();
                t.state = "starting".into();
                t.public_url = None;
                t.detail = "preparing cloudflared".into();
                t.started_at = None;
            }
            let port = http_port;
            let app2 = app.clone();
            std::thread::spawn(move || {
                let exe = runtime_dir().join("cloudflared.exe");
                if !exe.exists() {
                    logs::info(&app2, "NET", "downloading cloudflared (~28 MB, one-time)…");
                    if !download_cloudflared(&app2, &exe) {
                        fail(&app2, "trycloudflare", "cloudflared download failed — check your internet connection");
                        return;
                    }
                    logs::ok(&app2, "NET", "cloudflared ready");
                }
                let mut cmd = Command::new(&exe);
                cmd.args([
                    "tunnel",
                    "--url",
                    &format!("http://127.0.0.1:{port}"),
                    "--no-autoupdate",
                    "--protocol",
                    "http2",
                ]);
                #[cfg(windows)]
                {
                    use std::os::windows::process::CommandExt;
                    let _ = cmd.creation_flags(CREATE_NO_WINDOW);
                }
                cmd.stdout(Stdio::piped()).stderr(Stdio::piped());
                match cmd.spawn() {
                    Ok(child) => watch_child(&app2, port, "trycloudflare", child),
                    Err(e) => fail(&app2, "trycloudflare", &format!("failed to launch cloudflared: {e}")),
                }
            });
            Ok(())
        }
        _ => Err(format!("unknown tunnel method: {method}")),
    }
}

static TUNNEL_CHILD: Mutex<Option<Child>> = Mutex::new(None);
static URL_FOUND: AtomicBool = AtomicBool::new(false);

/// Store the child, then read stdout+stderr on dedicated threads until the
/// public URL appears (or the process dies / 45s elapse).
fn watch_child(app: &tauri::AppHandle, http_port: u16, method: &str, mut child: Child) {
    use crate::logs;
    URL_FOUND.store(false, Ordering::Relaxed);

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    // keep the child globally so stop() can kill it
    {
        let mut guard = TUNNEL_CHILD.lock().unwrap();
        // reap any previous zombie
        if let Some(mut old) = guard.take() {
            let _ = old.kill();
            let _ = old.wait();
        }
        *guard = Some(child);
    }

    // reader threads: one per pipe (separate types, so two explicit spawns)
    if let Some(pipe) = stdout {
        spawn_pipe_reader(pipe, app, method.to_string(), http_port);
    }
    if let Some(pipe) = stderr {
        spawn_pipe_reader(pipe, app, method.to_string(), http_port);
    }

    // timeout watcher: if no URL within 60s, mark error
    let app4 = app.clone();
    let method3 = method.to_string();
    std::thread::spawn(move || {
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(62);
        while std::time::Instant::now() < deadline {
            if URL_FOUND.load(Ordering::Relaxed) {
                return;
            }
            std::thread::sleep(std::time::Duration::from_millis(500));
        }
        if !URL_FOUND.load(Ordering::Relaxed) {
            // maybe the child died
            let alive = {
                let mut guard = TUNNEL_CHILD.lock().unwrap();
                match guard.as_mut() {
                    Some(c) => matches!(c.try_wait(), Ok(None)),
                    None => false,
                }
            };
            let state = app4.state::<AppState>();
            let mut t = state.tunnel.lock().unwrap();
            if t.state == "starting" {
                t.method = method3.clone();
                t.state = "error".into();
                t.public_url = None;
                t.detail = if alive {
                    "tunnel started but no public URL was reported".into()
                } else {
                    "tunnel process exited unexpectedly".into()
                };
                drop(t);
                logs::error(&app4, "NET", "no public URL within timeout");
            }
        }
    });
}

fn spawn_pipe_reader(
    mut pipe: impl Read + Send + 'static,
    app: &tauri::AppHandle,
    method: String,
    http_port: u16,
) {
    use crate::logs;
    let app2 = app.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 2048];
        let mut text = String::new();
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(60);
        loop {
            if URL_FOUND.load(Ordering::Relaxed) || std::time::Instant::now() > deadline {
                return;
            }
            match pipe.read(&mut buf) {
                Ok(0) => return,
                Ok(n) => {
                    text.push_str(&String::from_utf8_lossy(&buf[..n]));
                    if text.len() > 32_768 {
                        text.drain(0..16_384);
                    }
                    if let Some(url) = find_url(&text, "https://") {
                        let state = app2.state::<AppState>();
                        let mut t = state.tunnel.lock().unwrap();
                        if t.state != "active" {
                            t.method = method.clone();
                            t.state = "active".into();
                            t.public_url = Some(url.clone());
                            t.detail = format!("tunnel up → local http://127.0.0.1:{http_port}");
                            t.started_at = Some(now_ms());
                            drop(t);
                            logs::ok(&app2, "NET", format!("PUBLIC URL: {url}"));
                        }
                        URL_FOUND.store(true, Ordering::Relaxed);
                        return;
                    }
                }
                Err(_) => return,
            }
        }
    });
}

fn fail(app: &tauri::AppHandle, method: &str, msg: &str) {
    use crate::logs;
    let state = app.state::<AppState>();
    let mut t = state.tunnel.lock().unwrap();
    t.method = method.into();
    t.state = "error".into();
    t.public_url = None;
    t.detail = msg.to_string();
    drop(t);
    logs::error(app, "NET", msg);
}

/// Scan accumulated pipe text for an https URL that points at a known tunnel host.
fn find_url(haystack: &str, scheme: &str) -> Option<String> {
    const HOSTS: &[&str] = &["lhr.life", "localhost.run", "trycloudflare.com"];
    let mut idx = 0usize;
    while let Some(pos) = haystack[idx..].find(scheme) {
        let start = idx + pos;
        let rest = &haystack[start..];
        let end = rest
            .find(|c: char| c.is_whitespace() || c == '"' || c == '\'' || c == ')' || c == ']')
            .unwrap_or(rest.len());
        let url = &rest[..end];
        if HOSTS.iter().any(|h| url.contains(h)) && url.len() > scheme.len() + 8 {
            // strip trailing punctuation
            let url = url.trim_end_matches(['.', ',']).to_string();
            return Some(url);
        }
        idx = start + 1;
    }
    None
}

fn download_cloudflared(app: &tauri::AppHandle, dest: &std::path::Path) -> bool {
    use crate::logs;
    const URL: &str = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe";
    // use PowerShell (present on every Windows box) for the download
    let mut cmd = Command::new("powershell.exe");
    cmd.args([
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        &format!(
            "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; \
             Invoke-WebRequest -Uri '{URL}' -OutFile '{}'",
            dest.display()
        ),
    ]);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let _ = cmd.creation_flags(CREATE_NO_WINDOW);
    }
    match cmd.output() {
        Ok(out) => {
            let size = dest.metadata().map(|m| m.len()).unwrap_or(0);
            if dest.exists() && size > 1_000_000 {
                logs::dim(app, "NET", format!("cloudflared saved: {size} bytes"));
                true
            } else {
                let stderr = String::from_utf8_lossy(&out.stderr);
                logs::dim(
                    app,
                    "NET",
                    format!("powershell: {}", stderr.chars().take(300).collect::<String>()),
                );
                false
            }
        }
        Err(_) => false,
    }
}

pub fn stop(state: &AppState, silent: bool) {
    state.tunnel_cancel.store(true, Ordering::Relaxed);
    let mut guard = TUNNEL_CHILD.lock().unwrap();
    if let Some(mut child) = guard.take() {
        let _ = child.kill();
        let _ = child.wait();
    }
    let _ = silent;
    let mut t = state.tunnel.lock().unwrap();
    t.state = "stopped".into();
    t.public_url = None;
    t.detail = "tunnel stopped".into();
    t.started_at = None;
}

pub fn status(state: &AppState) -> TunnelStatus {
    state.tunnel.lock().unwrap().clone()
}
