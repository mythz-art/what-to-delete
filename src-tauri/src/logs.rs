use tauri::Emitter;
use tauri::Manager;

use crate::state::{now_ms, AppState};
use crate::types::LogEntry;

const MAX_LOGS: usize = 4000;

/// Append one entry to the global log ring buffer and broadcast it
/// to every open window (main + detached terminal).
pub fn log(app: &tauri::AppHandle, level: &str, tag: &str, msg: impl AsRef<str>) {
    let entry = LogEntry {
        t: now_ms(),
        level: level.into(),
        tag: tag.into(),
        msg: msg.as_ref().to_string(),
    };
    if let Some(state) = app.try_state::<AppState>() {
        let mut logs = state.logs.lock().unwrap();
        logs.push(entry.clone());
        let len = logs.len();
        if len > MAX_LOGS {
            logs.drain(0..len - MAX_LOGS);
        }
    }
    let _ = app.emit("log://line", entry);
}

pub fn info(app: &tauri::AppHandle, tag: &str, msg: impl AsRef<str>) {
    log(app, "info", tag, msg);
}
pub fn ok(app: &tauri::AppHandle, tag: &str, msg: impl AsRef<str>) {
    log(app, "ok", tag, msg);
}
pub fn warn(app: &tauri::AppHandle, tag: &str, msg: impl AsRef<str>) {
    log(app, "warn", tag, msg);
}
pub fn error(app: &tauri::AppHandle, tag: &str, msg: impl AsRef<str>) {
    log(app, "error", tag, msg);
}
pub fn dim(app: &tauri::AppHandle, tag: &str, msg: impl AsRef<str>) {
    log(app, "dim", tag, msg);
}

/// Snapshot of the ring buffer (for a freshly opened detached terminal).
pub fn buffer(state: &AppState, limit: usize) -> Vec<LogEntry> {
    let logs = state.logs.lock().unwrap();
    let skip = logs.len().saturating_sub(limit);
    logs.iter().skip(skip).cloned().collect()
}
