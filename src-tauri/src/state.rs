use std::sync::atomic::AtomicBool;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::types::{
    AppSettings, FtpStats, JunkItem, LogEntry, TunnelStatus, TransferItem, VaultItem,
};

pub struct AppState {
    pub scan_cancel: AtomicBool,
    pub dup_cancel: AtomicBool,
    /// junk items found by the last scan, so clean_items can map ids -> paths
    pub scan_session: Mutex<Vec<JunkItem>>,
    pub last_scan_at: Mutex<Option<u64>>,
    pub settings: Mutex<AppSettings>,
    /// derived vault key when unlocked
    pub vault_key: Mutex<Option<[u8; 32]>>,
    pub vault_items: Mutex<Vec<VaultItem>>,
    pub transfers: std::sync::Arc<Mutex<Vec<TransferItem>>>,
    pub http_port: Mutex<Option<u16>>,
    /* ---------------- v2.1 ---------------- */
    /// global log ring buffer feeding the hacker terminal
    pub logs: Mutex<Vec<LogEntry>>,
    /// full-hash cache for dedup: "path|size|mtime" -> sha256 hex
    pub hash_cache: Mutex<std::collections::HashMap<String, String>>,
    /// running task registry: task id -> human label (reserved for future use)
    #[allow(dead_code)]
    pub active_task: Mutex<Option<String>>,
    pub ftp: Mutex<FtpStats>,
    /// child process + bookkeeping for the public URL tunnel
    pub tunnel: Mutex<TunnelStatus>,
    /// tunnel process kill switch
    pub tunnel_cancel: AtomicBool,
}

pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// %APPDATA%\WhatToDelete (created on demand). Falls back to a local dir.
pub fn data_dir() -> std::path::PathBuf {
    let base = std::env::var("APPDATA")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|_| {
            std::env::var("HOME")
                .map(|h| std::path::PathBuf::from(h).join(".local/share"))
                .unwrap_or_else(|_| std::path::PathBuf::from("."))
        });
    let dir = base.join("WhatToDelete");
    let _ = std::fs::create_dir_all(&dir);
    dir
}

pub fn vault_dir() -> std::path::PathBuf {
    let dir = data_dir().join("vault_data");
    let _ = std::fs::create_dir_all(&dir);
    dir
}

pub fn share_dir() -> std::path::PathBuf {
    let dir = data_dir().join("shared");
    let _ = std::fs::create_dir_all(&dir);
    dir
}

pub fn runtime_dir() -> std::path::PathBuf {
    let dir = data_dir().join("runtime");
    let _ = std::fs::create_dir_all(&dir);
    dir
}

pub fn settings_path() -> std::path::PathBuf {
    data_dir().join("settings.json")
}

pub fn vault_index_path() -> std::path::PathBuf {
    data_dir().join("vault.bin")
}

impl AppState {
    pub fn new() -> Self {
        let settings = std::fs::read_to_string(settings_path())
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default();
        AppState {
            scan_cancel: AtomicBool::new(false),
            dup_cancel: AtomicBool::new(false),
            scan_session: Mutex::new(Vec::new()),
            last_scan_at: Mutex::new(None),
            settings: Mutex::new(settings),
            vault_key: Mutex::new(None),
            vault_items: Mutex::new(Vec::new()),
            transfers: std::sync::Arc::new(Mutex::new(Vec::new())),
            http_port: Mutex::new(None),
            logs: Mutex::new(Vec::new()),
            hash_cache: Mutex::new(std::collections::HashMap::new()),
            active_task: Mutex::new(None),
            ftp: Mutex::new(FtpStats {
                running: false,
                port: 0,
                root: String::new(),
                anonymous: true,
                sessions_total: 0,
                sessions_active: 0,
                bytes_out: 0,
                bytes_in: 0,
            }),
            tunnel: Mutex::new(TunnelStatus {
                method: String::new(),
                state: "stopped".into(),
                public_url: None,
                detail: String::new(),
                started_at: None,
            }),
            tunnel_cancel: AtomicBool::new(false),
        }
    }
}
