//! Minimal but complete FTP server (RFC 959 subset) used for LAN file sharing.
//! Control connections on a TCP port, passive-mode data connections,
//! anonymous or credential auth, and full file management (LIST / RETR / STOR /
//! MKD / RMD / DELE / RNFR / RNTO). Windows Explorer, FileZilla and browsers
//! can connect. Live stats + hacker-terminal logs included.

use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::sync::atomic::Ordering;
use std::sync::Arc;

use tauri::{Emitter, Manager};

use crate::state::{now_ms, AppState};
use crate::types::{FtpStats, TransferItem};

pub struct FtpConfig {
    pub port: u16,
    pub root: PathBuf,
    pub anonymous: bool,
    pub user: String,
    pub pass: String,
}

/// Start the FTP server. Returns the bound port.
///
/// v2.2 fix: the previous stop only flipped a flag — the accept loop stayed
/// blocked in `accept()` holding the port, so a restart failed with
/// "address already in use". Now `ftp_stop` force-closes the listener
/// (non-blocking flip + loopback knock), and start waits for the OS to
/// actually release the port before binding again.
pub fn ftp_start(app: &tauri::AppHandle, state: &AppState, cfg: FtpConfig) -> Result<u16, String> {
    use crate::logs;
    ftp_stop(app, state);

    // wait for the old listener to be released by the accept thread
    for _ in 0..20 {
        let still_bound = state.ftp_listener.lock().unwrap().is_some();
        if !still_bound {
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(50));
    }

    // bind with a short retry window (port release is async in edge cases)
    let mut listener = None;
    let mut last_err = String::new();
    for attempt in 0..4 {
        match TcpListener::bind(("0.0.0.0", cfg.port)) {
            Ok(l) => {
                listener = Some(l);
                break;
            }
            Err(e) => {
                last_err = e.to_string();
                if attempt == 0 {
                    logs::warn(app, "FTP", format!("port {} busy — retrying: {e}", cfg.port));
                }
                std::thread::sleep(std::time::Duration::from_millis(300));
            }
        }
    }
    let listener = listener.ok_or_else(|| format!("cannot bind port {} — is another FTP server running? ({last_err})", cfg.port))?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let listener = Arc::new(listener);

    // register the handle BEFORE spawning the accept loop so a fast
    // ftp_stop can always find and close it
    *state.ftp_listener.lock().unwrap() = Some(listener.clone());

    {
        let mut f = state.ftp.lock().unwrap();
        f.running = true;
        f.port = port;
        f.root = cfg.root.to_string_lossy().to_string();
        f.anonymous = cfg.anonymous;
        f.sessions_total = 0;
        f.sessions_active = 0;
        f.bytes_out = 0;
        f.bytes_in = 0;
    }
    emit_status(app, state);

    let root = cfg.root.clone();
    let anonymous = cfg.anonymous;
    let user = cfg.user.clone();
    let pass = cfg.pass.clone();

    // accept loop thread
    let app2 = app.clone();
    let listener2 = listener.clone();
    std::thread::spawn(move || {
        let sessions: Arc<std::sync::atomic::AtomicU64> =
            Arc::new(std::sync::atomic::AtomicU64::new(0));
        for stream in listener2.incoming() {
            let Ok(stream) = stream else { break };
            // stop flag check: if no longer running, drop the wake-up knock
            // connection and exit the loop (releases the port)
            let running = app2
                .try_state::<AppState>()
                .map(|s| s.ftp.lock().unwrap().running)
                .unwrap_or(false);
            if !running {
                break;
            }
            let Ok(peer) = stream.peer_addr() else { continue };
            let sid = sessions.fetch_add(1, Ordering::Relaxed) + 1;
            let cfg2 = FtpConfig {
                port,
                root: root.clone(),
                anonymous,
                user: user.clone(),
                pass: pass.clone(),
            };
            let app3 = app2.clone();
            std::thread::spawn(move || {
                let state = app3.state::<AppState>();
                {
                    let mut f = state.ftp.lock().unwrap();
                    f.sessions_total += 1;
                    f.sessions_active += 1;
                }
                emit_status(&app3, state.inner());
                crate::logs::info(&app3, "FTP", format!("session #{sid} opened from {peer}"));
                let _ = handle_session(&app3, state.inner(), stream, &cfg2, sid, peer.to_string());
                {
                    let mut f = state.ftp.lock().unwrap();
                    f.sessions_active = f.sessions_active.saturating_sub(1);
                }
                emit_status(&app3, state.inner());
                crate::logs::dim(&app3, "FTP", format!("session #{sid} closed"));
            });
        }
        // loop ended (stop or error): detach our handle and free the port
        if let Some(state) = app2.try_state::<AppState>() {
            let mut l = state.ftp_listener.lock().unwrap();
            // only clear if it is still OUR listener (a new server may have
            // already replaced it after the wait window above)
            if l
                .as_ref()
                .map(|cur| Arc::ptr_eq(cur, &listener2))
                .unwrap_or(false)
            {
                *l = None;
            }
        }
    });

    logs::info(app, "FTP", format!("server listening on 0.0.0.0:{port} — root {}", cfg.root.display()));
    let lan_ip = local_ip().unwrap_or_else(|| "127.0.0.1".into());
    logs::dim(app, "FTP", format!("reachable at ftp://{lan_ip}:{port}"));
    Ok(port)
}

/// Broadcast the current FTP stats so the UI reacts instantly.
fn emit_status(app: &tauri::AppHandle, state: &AppState) {
    let snap = state.ftp.lock().unwrap().clone();
    let _ = app.emit("ftp://status", snap);
}

/// v2.2 fix: actually KILL the server, not just flip a flag.
/// 1. mark stopped  2. flip the listener to non-blocking (wakes accept)
/// 3. knock on the port (wakes blocking accepts on Windows)
/// The accept thread then exits and drops the socket, releasing the port.
pub fn ftp_stop(app: &tauri::AppHandle, state: &AppState) {
    use crate::logs;
    let (was_running, port) = {
        let mut f = state.ftp.lock().unwrap();
        let was = f.running;
        f.running = false;
        (was, f.port)
    };

    let listener = state.ftp_listener.lock().unwrap().take();
    if let Some(l) = &listener {
        // wake the blocked accept(): WSAEWOULDBLOCK breaks the incoming() loop
        let _ = l.set_nonblocking(true);
        // belt & braces: a loopback connect also unblocks accept on Windows
        if port > 0 {
            let _ = TcpStream::connect(("127.0.0.1", port))
                .and_then(|s| s.shutdown(std::net::Shutdown::Both));
        }
    }

    if was_running {
        logs::warn(app, "FTP", "server stopped — listener closed, port released");
    }
    emit_status(app, state);
}

pub fn ftp_status(state: &AppState) -> FtpStats {
    state.ftp.lock().unwrap().clone()
}

/// Sanitize FTP paths: must resolve inside the root.
fn safe_join(root: &Path, virtual_path: &str) -> PathBuf {
    let cleaned = virtual_path.replace('\\', "/");
    let mut rel = PathBuf::new();
    for part in cleaned.split('/') {
        match part {
            "" | "." => continue,
            ".." => {
                rel.pop();
            }
            p => rel.push(p),
        }
    }
    let mut abs = root.to_path_buf();
    let _ = abs.pop(); // placeholder; real join below
    let _ = &rel;
    root.join(&rel)
}

fn fmt_list_line(entry_name: &str, is_dir: bool, size: u64, mtime_ms: u64) -> String {
    let dt = ms_to_list_date(mtime_ms);
    let perms = if is_dir { "drw-rw-rw-" } else { "-rw-rw-rw-" };
    format!("{perms}   1 user group {size:>12} {dt} {entry_name}\r\n")
}

fn ms_to_list_date(ms: u64) -> String {
    // "MMM DD YYYY" — widely parsed by FTP clients
    let secs = ms / 1000;
    let days = secs / 86_400;
    // civil-from-days algorithm (Howard Hinnant)
    let z = days as i64 + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    const MONTHS: [&str; 12] = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];
    let mi = m.clamp(1, 12) as usize - 1;
    format!("{} {:02} {}", MONTHS[mi], d, y)
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
    let id = format!("ftp-{}-{}", now_ms(), direction);
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

fn update_transfer(
    app: &tauri::AppHandle,
    state: &AppState,
    id: &str,
    transferred: u64,
    speed: u64,
    done: bool,
) {
    {
        let mut q = state.transfers.lock().unwrap();
        for t in q.iter_mut() {
            if t.id == id {
                t.transferred = transferred.min(t.bytes);
                t.speed = speed;
                t.state = if done { "done".into() } else { "active".into() };
            }
        }
        let snap = q.clone();
        drop(q);
        let _ = app.emit("transfer://progress", snap);
    }
}

fn handle_session(
    app: &tauri::AppHandle,
    state: &AppState,
    stream: TcpStream,
    cfg: &FtpConfig,
    sid: u64,
    peer: String,
) -> std::io::Result<()> {
    use crate::logs;
    let mut control = stream.try_clone()?;
    let mut reader = BufReader::new(stream);

    let write_line = |s: &mut TcpStream, line: &str| -> std::io::Result<()> {
        s.write_all(format!("{line}\r\n").as_bytes())
    };

    write_line(&mut control, "220 What to Delete? FTP ready")?;

    let root = cfg.root.clone();
    let mut cwd = String::new(); // virtual cwd, "" = root
    let mut authed = false;
    let mut passive: Option<TcpListener> = None;
    let mut rename_from: Option<PathBuf> = None;

    loop {
        let mut line = String::new();
        if reader.read_line(&mut line)? == 0 {
            break; // client closed
        }
        // server stopped under us? end the session gracefully
        if !state.ftp.lock().unwrap().running {
            let _ = write_line(&mut control, "421 Server shutting down");
            break;
        }
        let line = line.trim_end_matches(['\r', '\n']);
        let mut parts = line.splitn(2, ' ');
        let cmd = parts.next().unwrap_or("").to_uppercase();
        let arg = parts.next().unwrap_or("").trim().to_string();

        if !authed && cmd != "USER" && cmd != "PASS" && cmd != "QUIT" && cmd != "SYST" && cmd != "FEAT" && cmd != "NOOP" {
            write_line(&mut control, "530 Please login with USER and PASS")?;
            continue;
        }

        match cmd.as_str() {
            "USER" => {
                let u = arg.to_lowercase();
                if cfg.anonymous || u == cfg.user.to_lowercase() || u == "anonymous" || u == "ftp" {
                    if cfg.anonymous || u == "anonymous" || u == "ftp" {
                        write_line(&mut control, "230 Anonymous login accepted")?;
                        authed = true;
                        logs::dim(app, "FTP", format!("#{sid} anonymous auth ok"));
                    } else {
                        write_line(&mut control, "331 Password required")?;
                    }
                } else {
                    write_line(&mut control, "530 Unknown user")?;
                }
            }
            "PASS" => {
                if cfg.anonymous {
                    authed = true;
                    write_line(&mut control, "230 Logged in")?;
                } else if arg == cfg.pass {
                    authed = true;
                    write_line(&mut control, "230 Logged in")?;
                    logs::dim(app, "FTP", format!("#{sid} user auth ok"));
                } else {
                    write_line(&mut control, "530 Login incorrect")?;
                }
            }
            "SYST" => write_line(&mut control, "215 UNIX Type: L8")?,
            "FEAT" => {
                control.write_all(b"211-Features:\r\n SIZE\r\n MDTM\r\n TYPE\r\n PASV\r\n REST STREAM\r\n211 End\r\n")?;
            }
            "NOOP" => write_line(&mut control, "200 NOOP ok")?,
            "TYPE" => {
                let _ = arg.trim().to_uppercase() != "A";
                write_line(&mut control, "200 Type set (binary)")?;
            }
            "PWD" | "XPWD" => {
                let shown = if cwd.is_empty() { "/".into() } else { format!("/{cwd}") };
                write_line(&mut control, &format!("257 \"{shown}\" is current directory"))?;
            }
            "CWD" | "XCWD" => {
                let joined = join_virtual(&cwd, &arg);
                let real = safe_join(&root, &joined);
                if real.is_dir() {
                    cwd = joined;
                    write_line(&mut control, "250 Directory changed")?;
                } else {
                    write_line(&mut control, "550 Directory not found")?;
                }
            }
            "CDUP" => {
                let mut parts: Vec<&str> = cwd.split('/').filter(|p| !p.is_empty()).collect();
                parts.pop();
                cwd = parts.join("/");
                write_line(&mut control, "250 Directory changed")?;
            }
            "PASV" => {
                // drop any stale passive listener (dropped implicitly)
                let listener = TcpListener::bind(("0.0.0.0", 0))?;
                let port = listener.local_addr()?.port();
                let ip: Vec<u16> = local_ip()
                    .unwrap_or_else(|| "127.0.0.1".into())
                    .split('.')
                    .map(|p| p.parse::<u16>().unwrap_or(127))
                    .collect();
                let p1 = port / 256;
                let p2 = port % 256;
                write_line(
                    &mut control,
                    &format!("227 Entering Passive Mode ({},{},{},{},{},{})", ip[0], ip[1], ip[2], ip[3], p1, p2),
                )?;
                passive = Some(listener);
            }
            "LIST" | "NLST" => {
                let joined = join_virtual(&cwd, &arg);
                let real = safe_join(&root, &joined);
                let data = accept_data(&mut passive, &mut control)?;
                let Some(mut data) = data else { continue };
                write_line(&mut control, "150 Here comes the directory listing")?;
                if real.is_dir() {
                    let mut names: Vec<(String, bool, u64, u64)> = Vec::new();
                    if let Ok(rd) = std::fs::read_dir(&real) {
                        for e in rd.flatten() {
                            let name = e.file_name().to_string_lossy().to_string();
                            let (is_dir, size, mt) = match e.file_type() {
                                Ok(ft) if ft.is_dir() => (true, 0, 0u64),
                                Ok(_) => (
                                    false,
                                    e.metadata().map(|m| m.len()).unwrap_or(0),
                                    e.metadata()
                                        .and_then(|m| m.modified())
                                        .ok()
                                        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                                        .map(|d| d.as_millis() as u64)
                                        .unwrap_or(0),
                                ),
                                Err(_) => (false, 0, 0),
                            };
                            names.push((name, is_dir, size, mt));
                        }
                    }
                    let count = names.len();
                    names.sort_by(|a, b| b.1.cmp(&a.1).then(a.0.to_lowercase().cmp(&b.0.to_lowercase())));
                    let mut body = String::new();
                    for (name, is_dir, size, mt) in &names {
                        body.push_str(&fmt_list_line(name, *is_dir, *size, *mt));
                    }
                    let _ = data.write_all(body.as_bytes());
                    logs::dim(app, "FTP", format!("#{sid} LIST {} ({} entries)", if joined.is_empty() { "/".to_string() } else { joined.clone() }, count));
                }
                drop(data);
                write_line(&mut control, "226 Directory send OK")?;
            }
            "SIZE" => {
                let joined = join_virtual(&cwd, &arg);
                let real = safe_join(&root, &joined);
                if real.is_file() {
                    let len = std::fs::metadata(&real).map(|m| m.len()).unwrap_or(0);
                    write_line(&mut control, &format!("213 {len}"))?;
                } else {
                    write_line(&mut control, "550 No such file")?;
                }
            }
            "MDTM" => {
                let joined = join_virtual(&cwd, &arg);
                let real = safe_join(&root, &joined);
                let mt = std::fs::metadata(&real)
                    .and_then(|m| m.modified())
                    .ok()
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_secs())
                    .unwrap_or(0);
                // YYYYMMDDHHMMSS
                write_line(&mut control, &format!("213 {}", unix_to_ftp_time(mt)))?;
            }
            "RETR" => {
                let joined = join_virtual(&cwd, &arg);
                let real = safe_join(&root, &joined);
                if !real.is_file() {
                    write_line(&mut control, "550 File not found")?;
                    continue;
                }
                let len = std::fs::metadata(&real).map(|m| m.len()).unwrap_or(0);
                let data = accept_data(&mut passive, &mut control)?;
                let Some(mut data) = data else { continue };
                write_line(&mut control, &format!("150 Opening data connection ({len} bytes)"))?;
                let name = real.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
                let tid = emit_transfer(app, state, &name, len, "ftp", &peer, "out");
                logs::info(app, "FTP", format!("#{sid} RETR {name} -> {peer}"));
                let Ok(mut f) = std::fs::File::open(&real) else {
                    write_line(&mut control, "550 Cannot open file")?;
                    continue;
                };
                let mut buf = vec![0u8; 128 * 1024];
                let mut sent = 0u64;
                let t0 = std::time::Instant::now();
                let mut last_tick = t0;
                loop {
                    let n = match f.read(&mut buf) {
                        Ok(0) => break,
                        Ok(n) => n,
                        Err(_) => break,
                    };
                    if data.write_all(&buf[..n]).is_err() {
                        break;
                    }
                    sent += n as u64;
                    if last_tick.elapsed().as_millis() > 200 {
                        last_tick = std::time::Instant::now();
                        let speed = sent / t0.elapsed().as_secs().max(1);
                        update_transfer(app, state, &tid, sent, speed, false);
                    }
                }
                {
                    let mut fstat = state.ftp.lock().unwrap();
                    fstat.bytes_out += sent;
                }
                let speed = if t0.elapsed().as_secs() > 0 { sent / t0.elapsed().as_secs() } else { sent };
                update_transfer(app, state, &tid, sent, speed, true);
                drop(data);
                write_line(&mut control, "226 Transfer complete")?;
                logs::ok(app, "FTP", format!("#{sid} sent {name} ({sent} bytes)"));
            }
            "STOR" => {
                let joined = join_virtual(&cwd, &arg);
                let real = safe_join(&root, &joined);
                if let Some(parent) = real.parent() {
                    let _ = std::fs::create_dir_all(parent);
                }
                let data = accept_data(&mut passive, &mut control)?;
                let Some(mut data) = data else { continue };
                write_line(&mut control, "150 Ok to send data")?;
                let name = real.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
                let tid = emit_transfer(app, state, &name, 0, "ftp", &peer, "in");
                logs::info(app, "FTP", format!("#{sid} STOR {name} <- {peer}"));
                let Ok(mut f) = std::fs::File::create(&real) else {
                    write_line(&mut control, "550 Cannot create file")?;
                    continue;
                };
                let mut buf = vec![0u8; 128 * 1024];
                let mut received = 0u64;
                let t0 = std::time::Instant::now();
                let mut last_tick = t0;
                loop {
                    let n = match data.read(&mut buf) {
                        Ok(0) => break,
                        Ok(n) => n,
                        Err(_) => break,
                    };
                    if f.write_all(&buf[..n]).is_err() {
                        break;
                    }
                    received += n as u64;
                    if last_tick.elapsed().as_millis() > 200 {
                        last_tick = std::time::Instant::now();
                        let speed = received / t0.elapsed().as_secs().max(1);
                        update_transfer(app, state, &tid, received, speed, false);
                    }
                }
                {
                    let mut fstat = state.ftp.lock().unwrap();
                    fstat.bytes_in += received;
                }
                update_transfer(app, state, &tid, received, 0, true);
                drop(data);
                write_line(&mut control, "226 Transfer complete")?;
                logs::ok(app, "FTP", format!("#{sid} received {name} ({received} bytes)"));
            }
            "MKD" | "XMKD" => {
                let joined = join_virtual(&cwd, &arg);
                let real = safe_join(&root, &joined);
                if std::fs::create_dir_all(&real).is_ok() {
                    write_line(&mut control, "257 Directory created")?;
                    logs::dim(app, "FTP", format!("#{sid} MKD {joined}"));
                } else {
                    write_line(&mut control, "550 Cannot create directory")?;
                }
            }
            "RMD" | "XRMD" => {
                let joined = join_virtual(&cwd, &arg);
                let real = safe_join(&root, &joined);
                if real == root {
                    write_line(&mut control, "550 Cannot remove root")?;
                } else if std::fs::remove_dir_all(&real).is_ok() {
                    write_line(&mut control, "250 Directory removed")?;
                    logs::warn(app, "FTP", format!("#{sid} RMD {joined}"));
                } else {
                    write_line(&mut control, "550 Cannot remove directory")?;
                }
            }
            "DELE" => {
                let joined = join_virtual(&cwd, &arg);
                let real = safe_join(&root, &joined);
                if real.is_file() && std::fs::remove_file(&real).is_ok() {
                    write_line(&mut control, "250 File deleted")?;
                    logs::warn(app, "FTP", format!("#{sid} DELE {joined}"));
                } else {
                    write_line(&mut control, "550 Cannot delete file")?;
                }
            }
            "RNFR" => {
                let joined = join_virtual(&cwd, &arg);
                let real = safe_join(&root, &joined);
                if real.exists() {
                    rename_from = Some(real);
                    write_line(&mut control, "350 Ready for RNTO")?;
                } else {
                    write_line(&mut control, "550 File not found")?;
                }
            }
            "RNTO" => {
                let joined = join_virtual(&cwd, &arg);
                let real = safe_join(&root, &joined);
                match rename_from.take() {
                    Some(src) if std::fs::rename(&src, &real).is_ok() => {
                        write_line(&mut control, "250 Rename successful")?;
                        logs::dim(app, "FTP", format!("#{sid} RNTO {joined}"));
                    }
                    _ => write_line(&mut control, "550 Rename failed")?,
                }
            }
            "ABOR" => write_line(&mut control, "226 Aborted")?,
            "QUIT" => {
                write_line(&mut control, "221 Goodbye")?;
                break;
            }
            _ => write_line(&mut control, "502 Command not implemented")?,
        }
    }
    Ok(())
}

fn join_virtual(cwd: &str, arg: &str) -> String {
    if arg.starts_with('/') {
        arg.trim_start_matches('/').to_string()
    } else if arg.is_empty() {
        cwd.to_string()
    } else if cwd.is_empty() {
        arg.to_string()
    } else {
        format!("{cwd}/{arg}")
    }
}

fn accept_data(passive: &mut Option<TcpListener>, control: &mut TcpStream) -> std::io::Result<Option<TcpStream>> {
    let Some(listener) = passive.take() else {
        control.write_all(b"425 Use PASV first\r\n")?;
        return Ok(None);
    };
    // 30s accept timeout via set nonblocking poll
    listener.set_nonblocking(true)?;
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(30);
    loop {
        match listener.accept() {
            Ok((stream, _)) => {
                let _ = stream.set_nonblocking(false);
                let _ = stream.set_nodelay(true);
                return Ok(Some(stream));
            }
            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                if std::time::Instant::now() > deadline {
                    control.write_all(b"425 No data connection\r\n")?;
                    return Ok(None);
                }
                std::thread::sleep(std::time::Duration::from_millis(25));
            }
            Err(_) => {
                control.write_all(b"425 Data connection failed\r\n")?;
                return Ok(None);
            }
        }
    }
}

fn unix_to_ftp_time(secs: u64) -> String {
    let days = secs / 86_400;
    let z = days as i64 + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    let rem = secs % 86_400;
    let hh = rem / 3600;
    let mm = (rem % 3600) / 60;
    let ss = rem % 60;
    format!("{:04}{:02}{:02}{:02}{:02}{:02}", y, m, d, hh, mm, ss)
}

pub fn local_ip() -> Option<String> {
    let s = std::net::UdpSocket::bind("0.0.0.0:0").ok()?;
    s.connect("8.8.8.8:80").ok()?;
    Some(s.local_addr().ok()?.ip().to_string())
}
