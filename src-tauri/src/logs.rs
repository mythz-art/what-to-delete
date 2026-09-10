use tauri::Emitter;
use tauri::Manager;

use crate::state::{now_ms, AppState};
use crate::types::LogEntry;

const MAX_LOGS: usize = 4000;
const MAX_TASK_LOGS: usize = 2500;

/// Append one entry to the global log ring buffer and broadcast it
/// to every open window (main + detached terminal).
pub fn log(app: &tauri::AppHandle, level: &str, tag: &str, msg: impl AsRef<str>) {
    let entry = LogEntry {
        t: now_ms(),
        level: level.into(),
        tag: tag.into(),
        msg: msg.as_ref().to_string(),
        task: None,
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

/// Task-scoped log: appends to BOTH the global stream (tagged with the task id)
/// and the task's private ring buffer, then emits on the task's own channel
/// `log://task/<id>` so each terminal tab receives only its own lines.
pub fn task_log(
    app: &tauri::AppHandle,
    task_id: &str,
    level: &str,
    tag: &str,
    msg: impl AsRef<str>,
) {
    let entry = LogEntry {
        t: now_ms(),
        level: level.into(),
        tag: tag.into(),
        msg: msg.as_ref().to_string(),
        task: Some(task_id.to_string()),
    };
    if let Some(state) = app.try_state::<AppState>() {
        {
            let mut logs = state.logs.lock().unwrap();
            logs.push(entry.clone());
            let len = logs.len();
            if len > MAX_LOGS {
                logs.drain(0..len - MAX_LOGS);
            }
        }
        {
            let mut task_logs = state.task_logs.lock().unwrap();
            let buf = task_logs.entry(task_id.to_string()).or_default();
            buf.push(entry.clone());
            let len = buf.len();
            if len > MAX_TASK_LOGS {
                buf.drain(0..len - MAX_TASK_LOGS);
            }
        }
    }
    let _ = app.emit("log://line", entry.clone());
    let _ = app.emit(&format!("log://task/{task_id}"), entry);
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

/// Convenience wrappers for task-scoped logging.
pub fn t_info(app: &tauri::AppHandle, task: &str, tag: &str, msg: impl AsRef<str>) {
    task_log(app, task, "info", tag, msg);
}
pub fn t_ok(app: &tauri::AppHandle, task: &str, tag: &str, msg: impl AsRef<str>) {
    task_log(app, task, "ok", tag, msg);
}
pub fn t_warn(app: &tauri::AppHandle, task: &str, tag: &str, msg: impl AsRef<str>) {
    task_log(app, task, "warn", tag, msg);
}
#[allow(dead_code)]
pub fn t_error(app: &tauri::AppHandle, task: &str, tag: &str, msg: impl AsRef<str>) {
    task_log(app, task, "error", tag, msg);
}
pub fn t_dim(app: &tauri::AppHandle, task: &str, tag: &str, msg: impl AsRef<str>) {
    task_log(app, task, "dim", tag, msg);
}

/// Snapshot of the global ring buffer (for a freshly opened detached terminal).
pub fn buffer(state: &AppState, limit: usize) -> Vec<LogEntry> {
    let logs = state.logs.lock().unwrap();
    let skip = logs.len().saturating_sub(limit);
    logs.iter().skip(skip).cloned().collect()
}

/// Snapshot of one task's private ring buffer.
pub fn task_buffer(state: &AppState, task_id: &str, limit: usize) -> Vec<LogEntry> {
    let task_logs = state.task_logs.lock().unwrap();
    match task_logs.get(task_id) {
        Some(buf) => {
            let skip = buf.len().saturating_sub(limit);
            buf.iter().skip(skip).cloned().collect()
        }
        None => Vec::new(),
    }
}

/// Drop buffers for finished tasks once they are pruned from the registry.
#[allow(dead_code)]
pub fn prune_task_logs(state: &AppState, live_ids: &[String]) {
    let mut task_logs = state.task_logs.lock().unwrap();
    task_logs.retain(|k, _| live_ids.contains(k));
}
