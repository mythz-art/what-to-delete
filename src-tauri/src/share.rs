use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use tauri::{Emitter, Manager};

use crate::state::{now_ms, share_dir, AppState};
use crate::types::TransferItem;

static HTTP_RUNNING: AtomicBool = AtomicBool::new(false);

pub fn http_start(app: &tauri::AppHandle, state: &AppState, port: u16) -> Result<String, String> {
    use crate::logs;
    // stop previous instance
    http_stop(state);

    let listener = TcpListener::bind(("0.0.0.0", port)).map_err(|e| e.to_string())?;
    *state.http_port.lock().unwrap() = Some(port);
    HTTP_RUNNING.store(true, Ordering::Relaxed);

    let app2 = app.clone();
    std::thread::spawn(move || {
        for stream in listener.incoming() {
            if !HTTP_RUNNING.load(Ordering::Relaxed) {
                break;
            }
            let Ok(mut stream) = stream else { continue };
            let _ = stream.set_nodelay(true);
            let Ok(peer) = stream.peer_addr() else { continue };
            let app3 = app2.clone();
            std::thread::spawn(move || {
                let state = app3.state::<AppState>();
                handle_http(&app3, state.inner(), &mut stream, peer.to_string());
            });
        }
    });

    // report the LAN address
    let lan_ip = local_ip().unwrap_or_else(|| "127.0.0.1".into());
    let url = format!("http://{}:{}", lan_ip, port);
    logs::info(app, "NET", format!("HTTP server live on {url}"));
    Ok(url)
}

fn handle_http(app: &tauri::AppHandle, state: &AppState, stream: &mut TcpStream, peer: String) {
    use crate::logs;
    // read request head
    let mut buf = [0u8; 4096];
    let Ok(n) = stream.read(&mut buf) else { return };
    let req = String::from_utf8_lossy(&buf[..n]).to_string();
    let get_line = req.lines().next().unwrap_or_default().to_string();

    // only GET supported
    let target = get_line
        .split_whitespace()
        .nth(1)
        .unwrap_or("/")
        .to_string();

    logs::dim(app, "NET", format!("GET {target} from {peer}"));

    let shared = share_dir();
    if target == "/" || target.is_empty() {
        // directory listing
        let mut entries: Vec<String> = Vec::new();
        if let Ok(rd) = std::fs::read_dir(&shared) {
            for e in rd.flatten() {
                let name = e.file_name().to_string_lossy().to_string();
                let size = e.metadata().map(|m| m.len()).unwrap_or(0);
                entries.push(format!(
                    "<li><a href='/f/{0}'>{0}</a> <span>{1} bytes</span></li>",
                    html_escape(&name),
                    size
                ));
            }
        }
        let body = format!(
            "<!doctype html><html><head><meta charset='utf-8'><title>What to Delete? — Share</title>\
             <style>body{{font-family:system-ui;background:#0b1120;color:#e2e8f0;max-width:640px;margin:48px auto;padding:0 16px}}\
             h1{{font-weight:600;font-size:20px}} li{{margin:10px 0;list-style:none;display:flex;justify-content:space-between;border:1px solid #1e293b;border-radius:10px;padding:10px 14px}}\
             a{{color:#818cf8;text-decoration:none}} span{{color:#64748b;font-size:12px}}</style></head>\
             <body><h1>Shared by What to Delete?</h1><ul>{}</ul>\
             <p style='color:#64748b;font-size:12px'>Drop files into the app's shared folder to serve them.</p></body></html>",
            entries.join("")
        );
        let resp = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            body.len(),
            body
        );
        let _ = stream.write_all(resp.as_bytes());
    } else if let Some(name) = target.strip_prefix("/f/") {
        let name = name.replace("..", "").replace('/', "");
        let path = shared.join(&name);
        if path.is_file() {
            let len = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
            let head = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/octet-stream\r\nContent-Disposition: attachment; filename=\"{}\"\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                name, len
            );
            if stream.write_all(head.as_bytes()).is_ok() {
                let tid = emit_transfer(app, state, &name, len, "http", &peer, "out");
                let t0 = std::time::Instant::now();
                if let Ok(mut f) = std::fs::File::open(&path) {
                    let mut chunk = [0u8; 64 * 1024];
                    let mut sent = 0u64;
                    let mut last_tick = t0;
                    loop {
                        let Ok(n) = f.read(&mut chunk) else { break };
                        if n == 0 {
                            break;
                        }
                        if stream.write_all(&chunk[..n]).is_err() {
                            break;
                        }
                        sent += n as u64;
                        if last_tick.elapsed().as_millis() > 200 {
                            last_tick = std::time::Instant::now();
                            let speed = sent / t0.elapsed().as_secs().max(1);
                            update_transfer(app, state, &tid, sent, speed, false);
                        }
                    }
                    update_transfer(app, state, &tid, sent, 0, true);
                    logs::ok(app, "NET", format!("served {name} ({sent} bytes) to {peer}"));
                }
            }
        } else {
            let body = "not found";
            let resp = format!(
                "HTTP/1.1 404 Not Found\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                body.len(),
                body
            );
            let _ = stream.write_all(resp.as_bytes());
        }
    }
}

pub fn http_stop(state: &AppState) {
    HTTP_RUNNING.store(false, Ordering::Relaxed);
    *state.http_port.lock().unwrap() = None;
}

pub fn local_ip() -> Option<String> {
    // UDP connect trick to find the primary LAN address (no packets sent)
    let s = std::net::UdpSocket::bind("0.0.0.0:0").ok()?;
    s.connect("8.8.8.8:80").ok()?;
    Some(s.local_addr().ok()?.ip().to_string())
}

fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

/* ------------------------------ transfer queue ------------------------------ */

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IncomingItem {
    pub name: String,
    pub bytes: u64,
    pub mode: String,
    pub peer: String,
}

pub fn transfer_start(app: &tauri::AppHandle, state: &AppState, items: Vec<IncomingItem>) {
    let new_transfers: Vec<TransferItem> = items
        .into_iter()
        .enumerate()
        .map(|(i, t)| TransferItem {
            id: format!("t{}-{}", now_ms(), i),
            name: t.name,
            bytes: t.bytes,
            transferred: 0,
            speed: 0,
            mode: t.mode,
            state: "active".into(),
            peer: t.peer,
        })
        .collect();

    {
        let mut q = state.transfers.lock().unwrap();
        for t in new_transfers {
            q.insert(0, t);
        }
        q.truncate(12);
    }
    broadcast(app, state);

    // progress ticker (demo-mode pacing for p2p; http/ftp track their own bytes)
    let app2 = app.clone();
    let queue: Arc<std::sync::Mutex<Vec<TransferItem>>> = state.transfers.clone();
    std::thread::spawn(move || {
        for _tick in 0..240 {
            std::thread::sleep(std::time::Duration::from_millis(500));
            let done = {
                let mut q = queue.lock().unwrap();
                let mut any_active = false;
                let mut seed = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_millis() as u64)
                    .unwrap_or(42);
                for t in q.iter_mut() {
                    if t.state == "active" {
                        any_active = true;
                        seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1);
                        let boost = (seed >> 33) & 0x1F;
                        let speed: u64 = (6 + boost) * 1024 * 1024;
                        t.transferred = (t.transferred + speed / 2).min(t.bytes);
                        t.speed = speed;
                        if t.transferred >= t.bytes {
                            t.state = "done".into();
                        }
                    }
                }
                let _ = broadcast_snapshot(&app2, &q);
                !any_active
            };
            if done {
                break;
            }
        }
    });
}

fn emit_transfer(
    app: &tauri::AppHandle,
    state: &AppState,
    name: &str,
    bytes: u64,
    mode: &str,
    peer: &str,
    direction: &str,
) -> String {
    let id = format!("{}-{}-{}", mode, now_ms(), direction);
    let item = TransferItem {
        id: id.clone(),
        name: name.to_string(),
        bytes,
        transferred: 0,
        speed: 0,
        mode: mode.to_string(),
        state: "active".into(),
        peer: peer.to_string(),
    };
    {
        let mut q = state.transfers.lock().unwrap();
        q.insert(0, item);
        q.truncate(12);
    }
    let _ = app.emit("transfer://progress", state.transfers.lock().unwrap().clone());
    id
}

fn update_transfer(app: &tauri::AppHandle, state: &AppState, id: &str, transferred: u64, speed: u64, done: bool) {
    let snap = {
        let mut q = state.transfers.lock().unwrap();
        for t in q.iter_mut() {
            if t.id == id {
                t.transferred = transferred.min(t.bytes);
                t.speed = speed;
                t.state = if done { "done".into() } else { "active".into() };
            }
        }
        q.clone()
    };
    let _ = app.emit("transfer://progress", snap);
}

fn broadcast(app: &tauri::AppHandle, state: &AppState) {
    let snapshot = state.transfers.lock().unwrap().clone();
    let _ = app.emit("transfer://progress", snapshot);
}

fn broadcast_snapshot(app: &tauri::AppHandle, queue: &[TransferItem]) {
    let _ = app.emit("transfer://progress", queue.to_vec());
}

pub fn transfer_cancel(app: &tauri::AppHandle, state: &AppState, id: &str) {
    state.transfers.lock().unwrap().retain(|t| t.id != id);
    broadcast(app, state);
}
