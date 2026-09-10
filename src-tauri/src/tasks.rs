//! Task registry driving the multi-tab terminal (v2.2).
//!
//! Every unit of work (junk scan, duplicate hunt, wipe, tool run, transfer
//! batch, vault import) becomes a TaskInfo with its own log channel. The
//! registry is capped; finished tasks are pruned FIFO so tabs and buffers
//! never grow unbounded.

use tauri::{Emitter, Manager};

use crate::state::{now_ms, AppState};
use crate::types::TaskInfo;

const MAX_TASKS: usize = 24;

fn emit_update(app: &tauri::AppHandle, task: &TaskInfo) {
    let _ = app.emit("task://update", task.clone());
}

/// Register a new running task and return its id.
pub fn begin(app: &tauri::AppHandle, kind: &str, title: impl Into<String>) -> String {
    let id = format!("{}-{}", kind, now_ms());
    let task = TaskInfo {
        id: id.clone(),
        kind: kind.to_string(),
        title: title.into(),
        state: "running".into(),
        started_at: now_ms(),
        ended_at: None,
        summary: None,
    };
    if let Some(state) = app.try_state::<AppState>() {
        let mut tasks = state.tasks.lock().unwrap();
        tasks.push(task.clone());
        if tasks.len() > MAX_TASKS {
            // drop the oldest FINISHED task (never a running one)
            if let Some(pos) = tasks.iter().position(|t| t.state != "running") {
                let removed = tasks.remove(pos);
                let id = removed.id;
                drop(tasks);
                let mut bufs = state.task_logs.lock().unwrap();
                bufs.remove(&id);
                drop(bufs);
            }
        }
    }
    emit_update(app, &task);
    id
}

/// Mark a task finished: `done` | `error` | `cancelled`.
pub fn finish(app: &tauri::AppHandle, task_id: &str, state_str: &str, summary: &str) {
    let updated = if let Some(state) = app.try_state::<AppState>() {
        let mut tasks = state.tasks.lock().unwrap();
        let Some(task) = tasks.iter_mut().find(|t| t.id == task_id) else {
            return;
        };
        task.state = state_str.to_string();
        task.ended_at = Some(now_ms());
        task.summary = Some(summary.to_string());
        task.clone()
    } else {
        return;
    };
    emit_update(app, &updated);
}

/// Full registry snapshot (for a freshly opened terminal window).
pub fn list(state: &AppState) -> Vec<TaskInfo> {
    state.tasks.lock().unwrap().clone()
}

/// Human summary helpers used by command wrappers.
pub fn fmt_bytes(n: u64) -> String {
    const UNITS: [&str; 5] = ["B", "KB", "MB", "GB", "TB"];
    let mut val = n as f64;
    let mut unit = 0usize;
    while val >= 1024.0 && unit < UNITS.len() - 1 {
        val /= 1024.0;
        unit += 1;
    }
    if unit == 0 {
        format!("{n} B")
    } else {
        format!("{val:.1} {}", UNITS[unit])
    }
}
