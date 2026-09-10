#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod dedup;
mod files;
mod finders;
mod ftp;
mod junk;
mod logs;
mod share;
mod state;
mod sys;
mod tasks;
mod tools;
mod tunnel;
mod types;
mod vault;

use serde::Deserialize;
use tauri::{Emitter, Manager};

use state::AppState;
use types::*;

// ------------------------------ result shims ------------------------------

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct FreedResult {
    freed_bytes: u64,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct HttpStartResult {
    url: String,
}

// Force early references to the MSVC shim symbols so the shim archive is
// scanned before the webview2-com-sys rlib pulls WebView2LoaderStatic objects.
#[unsafe(no_mangle)]
extern "C" fn __wtd_force_shim_ref() -> usize {
    extern "C" {
        fn __security_check_cookie(cookie: u64);
        fn _Init_thread_header(p: *mut i32);
        fn _Init_thread_footer(p: *mut i32);
    }
    (__security_check_cookie as unsafe extern "C" fn(u64)) as usize
        | (_Init_thread_header as unsafe extern "C" fn(*mut i32)) as usize
        | (_Init_thread_footer as unsafe extern "C" fn(*mut i32)) as usize
}

// ------------------------------ system ------------------------------

#[tauri::command]
fn get_system_status(state: tauri::State<AppState>) -> SystemStatus {
    sys::system_status(&state)
}

#[tauri::command]
fn get_settings(state: tauri::State<AppState>) -> AppSettings {
    state.settings.lock().unwrap().clone()
}

#[tauri::command]
fn save_settings(state: tauri::State<AppState>, settings: AppSettings) -> Result<(), String> {
    *state.settings.lock().unwrap() = settings.clone();
    let path = state::settings_path();
    let json = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    std::fs::write(path, json).map_err(|e| e.to_string())?;
    Ok(())
}

// ------------------------------ logs / terminal ------------------------------

#[tauri::command]
fn get_log_buffer(state: tauri::State<AppState>, limit: Option<usize>) -> Vec<LogEntry> {
    logs::buffer(&state, limit.unwrap_or(500))
}

#[tauri::command]
fn get_tasks(state: tauri::State<AppState>) -> Vec<TaskInfo> {
    tasks::list(&state)
}

#[tauri::command]
fn get_task_buffer(
    state: tauri::State<AppState>,
    task_id: String,
    limit: Option<usize>,
) -> Vec<LogEntry> {
    logs::task_buffer(&state, &task_id, limit.unwrap_or(500))
}

// ------------------------------ junk scan ------------------------------

#[tauri::command]
async fn scan_start(app: tauri::AppHandle) -> Result<ScanReport, String> {
    let task_id = tasks::begin(&app, "scan", "Junk Scan");
    let app2 = app.clone();
    let tid = task_id.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let state = app2.state::<AppState>();
        junk::scan(&app2, state.inner(), &tid)
    })
    .await
    .map_err(|e| format!("scan task failed: {e:?}"))?;
    match &result {
        Ok(report) => tasks::finish(
            &app,
            &task_id,
            "done",
            &format!(
                "{} reclaimable · {} files · {:.1}s",
                tasks::fmt_bytes(report.total_bytes),
                report.total_files,
                report.duration_ms as f64 / 1000.0
            ),
        ),
        Err(e) if e == "cancelled" => tasks::finish(&app, &task_id, "cancelled", "cancelled by operator"),
        Err(e) => tasks::finish(&app, &task_id, "error", &format!("scan failed: {e}")),
    }
    result
}

#[tauri::command]
fn scan_cancel(state: tauri::State<AppState>) {
    state.scan_cancel.store(true, std::sync::atomic::Ordering::Relaxed);
}

#[tauri::command]
async fn clean_items(app: tauri::AppHandle, ids: Vec<String>) -> Result<FreedResult, String> {
    let task_id = tasks::begin(&app, "clean", format!("Wipe {} targets", ids.len()));
    logs::t_info(&app, &task_id, "CLEAN", format!("wipe requested for {} targets", ids.len()));
    let app2 = app.clone();
    let (paths, sizes): (Vec<String>, Vec<u64>) = {
        let state = app.state::<AppState>();
        let session = state.scan_session.lock().unwrap();
        let filtered: Vec<&JunkItem> = session.iter().filter(|i| ids.contains(&i.id)).collect();
        (
            filtered.iter().map(|i| i.path.clone()).collect(),
            filtered.iter().map(|i| i.bytes).collect(),
        )
    };

    let _ = app.emit(
        "scan://progress",
        ScanProgress {
            phase: "cleaning".into(),
            current_path: paths.first().cloned().unwrap_or_default(),
            processed: 0,
            total: paths.len() as u64,
            found_bytes: sizes.iter().sum(),
            found_files: paths.len() as u64,
        },
    );

    let use_recycle = app
        .state::<AppState>()
        .settings
        .lock()
        .unwrap()
        .use_recycle_bin;
    logs::t_dim(&app, &task_id, "CLEAN", format!("mode :: {}", if use_recycle { "recycle bin (restorable)" } else { "permanent delete" }));

    let app3 = app.clone();
    let tid2 = task_id.clone();
    let freed = tauri::async_runtime::spawn_blocking(move || {
        logs::t_info(&app3, &tid2, "CLEAN", "engaging deletion pipeline…");
        junk::delete_paths(&paths, use_recycle);
        let freed: u64 = paths
            .iter()
            .zip(sizes.iter())
            .filter(|(p, _)| !std::path::Path::new(p.as_str()).exists())
            .map(|(_, s)| *s)
            .sum();
        let _ = app3;
        freed
    })
    .await
    .map_err(|e| format!("clean task failed: {e:?}"))?;

    {
        let state = app2.state::<AppState>();
        state.scan_session.lock().unwrap().retain(|i| !ids.contains(&i.id));
    }

    logs::t_ok(&app2, &task_id, "CLEAN", format!("wipe complete — {} reclaimed", tasks::fmt_bytes(freed)));
    tasks::finish(
        &app2,
        &task_id,
        "done",
        &format!("{} reclaimed from {} targets", tasks::fmt_bytes(freed), ids.len()),
    );
    Ok(FreedResult { freed_bytes: freed })
}

// ------------------------------ duplicates ------------------------------

#[tauri::command]
async fn duplicates_start(app: tauri::AppHandle) -> Result<Vec<DuplicateGroup>, String> {
    let task_id = tasks::begin(&app, "dedup", "Duplicate Hunt");
    let app2 = app.clone();
    let tid = task_id.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let state = app2.state::<AppState>();
        dedup::find_duplicates(&app2, state.inner(), &tid)
    })
    .await
    .map_err(|e| format!("dedup task failed: {e:?}"))?;
    match &result {
        Ok(groups) => {
            let wasted: u64 = groups.iter().map(|g| g.wasted_bytes).sum();
            tasks::finish(
                &app,
                &task_id,
                "done",
                &format!("{} groups · {} wasted", groups.len(), tasks::fmt_bytes(wasted)),
            );
        }
        Err(e) if e == "cancelled" => tasks::finish(&app, &task_id, "cancelled", "cancelled by operator"),
        Err(e) => tasks::finish(&app, &task_id, "error", &format!("dedup failed: {e}")),
    }
    result
}

#[tauri::command]
fn duplicates_cancel(state: tauri::State<AppState>) {
    state.dup_cancel.store(true, std::sync::atomic::Ordering::Relaxed);
}

#[tauri::command]
async fn remove_duplicates(app: tauri::AppHandle, removed_paths: Vec<String>) -> Result<FreedResult, String> {
    let task_id = tasks::begin(&app, "clean", format!("Remove {} duplicates", removed_paths.len()));
    let app2 = app.clone();
    let tid = task_id.clone();
    let paths = removed_paths.clone();
    logs::t_info(&app, &task_id, "DEDUP", format!("removing {} duplicate files…", paths.len()));
    let freed = tauri::async_runtime::spawn_blocking(move || {
        let mut freed = 0u64;
        for p in &paths {
            let size = std::fs::metadata(p).map(|m| m.len()).unwrap_or(0);
            if junk::delete_path(p, false) {
                freed += size;
                logs::t_ok(&app2, &tid, "DEDUP", format!("removed :: {p}"));
            } else {
                logs::t_warn(&app2, &tid, "DEDUP", format!("failed to remove :: {p}"));
            }
        }
        freed
    })
    .await
    .map(|freed| FreedResult { freed_bytes: freed })
    .map_err(|e| format!("remove task failed: {e:?}"))?;
    let bytes = freed.freed_bytes;
    logs::t_ok(&app, &task_id, "DEDUP", format!("duplicates removed — {} reclaimed", tasks::fmt_bytes(bytes)));
    tasks::finish(&app, &task_id, "done", &format!("{} reclaimed", tasks::fmt_bytes(bytes)));
    Ok(freed)
}

// ------------------------------ tools ------------------------------

#[tauri::command]
fn list_tools() -> Vec<ToolInfo> {
    tools::list_tools()
}

#[tauri::command]
async fn run_tool(app: tauri::AppHandle, tool_id: String) -> Result<ToolResult, String> {
    let title = tools::list_tools()
        .into_iter()
        .find(|t| t.id == tool_id)
        .map(|t| t.name)
        .unwrap_or_else(|| tool_id.clone());
    let task_id = tasks::begin(&app, "tool", title);
    logs::t_info(&app, &task_id, "TOOL", format!("executing {tool_id}"));
    let app2 = app.clone();
    let tid = task_id.clone();
    let id2 = tool_id.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let r = tools::run_tool(&id2);
        logs::t_ok(&app2, &tid, "TOOL", format!("{} — {} found, {}", id2, r.found, tasks::fmt_bytes(r.bytes)));
        r
    })
    .await
    .map_err(|e| format!("tool task failed: {e:?}"))?;
    tasks::finish(
        &app,
        &task_id,
        "done",
        &format!("{} · {}", result.note, tasks::fmt_bytes(result.bytes)),
    );
    Ok(result)
}

// ------------------------------ feedback / vault ------------------------------

#[tauri::command]
async fn send_feedback(message: String, rating: String) -> Result<FeedbackResponse, String> {
    tauri::async_runtime::spawn_blocking(move || {
        std::thread::sleep(std::time::Duration::from_millis(400));
        let resp = if vault::secret_matches(&message) {
            FeedbackResponse {
                ok: true,
                unlock_token: Some("vault".into()),
            }
        } else {
            FeedbackResponse {
                ok: true,
                unlock_token: None,
            }
        };
        let _ = rating;
        resp
    })
    .await
    .map_err(|e| format!("feedback failed: {e:?}"))
}

#[tauri::command]
async fn vault_unlock(app: tauri::AppHandle, passphrase: String) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        vault::vault_unlock(state.inner(), &passphrase)
    })
    .await
    .map_err(|e| format!("vault unlock failed: {e:?}"))?
}

#[tauri::command]
fn vault_lock(state: tauri::State<AppState>) {
    vault::vault_lock(&state);
}

#[tauri::command]
fn vault_list(state: tauri::State<AppState>) -> Vec<VaultItem> {
    vault::vault_list(&state)
}

#[tauri::command]
async fn vault_add(app: tauri::AppHandle, names: Vec<String>) -> Result<Vec<VaultItem>, String> {
    let task_id = tasks::begin(&app, "vault", format!("Vault import ({} files)", names.len()));
    let app2 = app.clone();
    let tid = task_id.clone();
    let names2 = names.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        logs::t_dim(&app2, &tid, "VAULT", "encrypting with AES-256-GCM (PBKDF2 120k)…");
        let state = app2.state::<AppState>();
        vault::vault_add(state.inner(), &names2)
    })
    .await
    .map_err(|e| format!("vault add failed: {e:?}"))?;
    match &result {
        Ok(items) => tasks::finish(
            &app,
            &task_id,
            "done",
            &format!("{} files encrypted into the vault", items.len()),
        ),
        Err(e) => tasks::finish(&app, &task_id, "error", &format!("vault import failed: {e}")),
    }
    result
}

#[tauri::command]
async fn vault_remove(app: tauri::AppHandle, id: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        vault::vault_remove(state.inner(), &id)
    })
    .await
    .map_err(|e| format!("vault remove failed: {e:?}"))?
}

// ------------------------------ share: http + ftp + tunnel ------------------------------

#[tauri::command]
async fn share_http_start(app: tauri::AppHandle, port: u16) -> Result<HttpStartResult, String> {
    let url = {
        let state = app.state::<AppState>();
        share::http_start(&app, state.inner(), port)?
    };
    Ok(HttpStartResult { url })
}

#[tauri::command]
fn share_http_stop(state: tauri::State<AppState>) {
    share::http_stop(&state);
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FtpStartConfig {
    port: u16,
    root: Option<String>,
    anonymous: Option<bool>,
    user: Option<String>,
    pass: Option<String>,
}

#[tauri::command]
async fn share_ftp_start(app: tauri::AppHandle, cfg: FtpStartConfig) -> Result<serde_json::Value, String> {
    let root = cfg
        .root
        .filter(|r| !r.is_empty())
        .map(std::path::PathBuf::from)
        .filter(|p| p.is_dir())
        .unwrap_or_else(state::share_dir);
    let anonymous = cfg.anonymous.unwrap_or(true);
    let fcfg = ftp::FtpConfig {
        port: cfg.port,
        root,
        anonymous,
        user: cfg.user.unwrap_or_else(|| "user".into()),
        pass: cfg.pass.unwrap_or_default(),
    };
    let port = {
        let state = app.state::<AppState>();
        ftp::ftp_start(&app, state.inner(), fcfg)?
    };
    let lan_ip = share::local_ip().unwrap_or_else(|| "127.0.0.1".into());
    Ok(serde_json::json!({ "port": port, "host": lan_ip }))
}

#[tauri::command]
fn share_ftp_stop(app: tauri::AppHandle, state: tauri::State<AppState>) {
    ftp::ftp_stop(&app, state.inner());
}

#[tauri::command]
fn share_ftp_status(state: tauri::State<AppState>) -> FtpStats {
    ftp::ftp_status(&state)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TunnelConfig {
    method: String,
    port: Option<u16>,
    custom_url: Option<String>,
}

#[tauri::command]
async fn tunnel_start(app: tauri::AppHandle, cfg: TunnelConfig) -> Result<(), String> {
    let http_port = match cfg.port {
        Some(p) => p,
        None => {
            let state = app.state::<AppState>();
            let from_state = *state.http_port.lock().unwrap();
            let from_settings = state.settings.lock().unwrap().share_port;
            from_state.unwrap_or(from_settings)
        }
    };
    let state = app.state::<AppState>();
    tunnel::start(&app, state.inner(), &cfg.method, http_port, cfg.custom_url)
}

#[tauri::command]
fn tunnel_stop(state: tauri::State<AppState>) {
    tunnel::stop(&state, false);
}

#[tauri::command]
fn tunnel_status(state: tauri::State<AppState>) -> TunnelStatus {
    tunnel::status(&state)
}

#[tauri::command]
async fn transfer_start(
    app: tauri::AppHandle,
    items: Vec<share::IncomingItem>,
) -> Result<(), String> {
    let n = items.len();
    let task_id = tasks::begin(&app, "transfer", format!("Share transfer ({n} items)"));
    for it in &items {
        logs::t_dim(&app, &task_id, "NET", format!("queue :: {} — {} via {}", it.name, tasks::fmt_bytes(it.bytes), it.mode));
    }
    let app2 = app.clone();
    let tid = task_id.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app2.state::<AppState>();
        share::transfer_start(&app2, state.inner(), items);
        tasks::finish(&app2, &tid, "done", &format!("{n} transfers queued"));
    })
    .await
    .map_err(|e| format!("transfer start failed: {e:?}"))
}

#[tauri::command]
fn transfer_cancel(app: tauri::AppHandle, state: tauri::State<AppState>, id: String) {
    share::transfer_cancel(&app, &state, &id);
}

// ------------------------------ file manager ------------------------------

#[tauri::command]
fn files_list(path: String, state: tauri::State<AppState>) -> Result<DirListing, String> {
    let _ = state;
    files::list_dir(&path)
}

#[tauri::command]
fn files_roots() -> Vec<FileEntry> {
    files::quick_roots()
}

#[tauri::command]
fn files_mkdir(parent: String, name: String) -> Result<String, String> {
    files::create_dir(&parent, &name)
}

#[tauri::command]
fn files_rename(path: String, new_name: String) -> Result<String, String> {
    files::rename(&path, &new_name)
}

#[tauri::command]
fn files_copy(paths: Vec<String>, dest: String) -> FileOpResult {
    files::copy_items(paths, &dest)
}

#[tauri::command]
fn files_move(paths: Vec<String>, dest: String) -> FileOpResult {
    files::move_items(paths, &dest)
}

#[tauri::command]
fn files_delete(app: tauri::AppHandle, state: tauri::State<AppState>, paths: Vec<String>) -> FileOpResult {
    let use_recycle = state.settings.lock().unwrap().use_recycle_bin;
    let result = files::delete_items(paths, use_recycle);
    if result.ok {
        logs::ok(&app, "FS", format!("deleted {} items ({} bytes)", result.affected, result.freed_bytes));
    } else {
        logs::warn(&app, "FS", result.error.clone().unwrap_or_default());
    }
    result
}

#[tauri::command]
fn files_props(path: String) -> Result<ItemProps, String> {
    files::item_props(&path)
}

#[tauri::command]
fn files_search(root: String, query: String, max: Option<u64>) -> Vec<FileEntry> {
    files::search_dir(&root, &query, max.unwrap_or(300))
}

#[tauri::command]
fn files_open(path: String) -> bool {
    files::open_in_explorer(&path)
}

// ------------------------------ finders ------------------------------

#[tauri::command]
fn finder_large_files(roots: Option<Vec<String>>, min_mb: Option<u64>) -> Vec<FinderItem> {
    let min = min_mb.unwrap_or(100).max(1) * 1024 * 1024;
    finders::large_files(roots.unwrap_or_default(), min, 150)
}

#[tauri::command]
fn finder_old_files(roots: Option<Vec<String>>, days: Option<u64>, min_mb: Option<u64>) -> Vec<FinderItem> {
    let d = days.unwrap_or(90).max(1);
    let min = min_mb.unwrap_or(10) * 1024 * 1024;
    finders::old_files(roots.unwrap_or_default(), d, min, 200)
}

#[tauri::command]
fn finder_empty_dirs(root: String) -> Vec<FinderItem> {
    let r = if root.is_empty() {
        std::env::var("USERPROFILE").unwrap_or_default()
    } else {
        root
    };
    finders::empty_dirs(r, 400)
}

#[tauri::command]
fn finder_recycle_bin() -> RecycleBinStats {
    finders::recycle_bin_stats()
}

#[tauri::command]
fn finder_empty_recycle_bin(app: tauri::AppHandle) -> bool {
    let ok = finders::recycle_bin_empty();
    if ok {
        logs::ok(&app, "SYS", "recycle bin emptied");
    } else {
        logs::warn(&app, "SYS", "recycle bin empty failed");
    }
    ok
}

#[tauri::command]
fn finder_installed_apps() -> Vec<InstalledApp> {
    finders::installed_apps()
}

fn main() {
    let _ = __wtd_force_shim_ref;

    tauri::Builder::default()
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            get_system_status,
            get_settings,
            save_settings,
            get_log_buffer,
            get_tasks,
            get_task_buffer,
            scan_start,
            scan_cancel,
            clean_items,
            duplicates_start,
            duplicates_cancel,
            remove_duplicates,
            list_tools,
            run_tool,
            send_feedback,
            vault_unlock,
            vault_lock,
            vault_list,
            vault_add,
            vault_remove,
            share_http_start,
            share_http_stop,
            share_ftp_start,
            share_ftp_stop,
            share_ftp_status,
            tunnel_start,
            tunnel_stop,
            tunnel_status,
            transfer_start,
            transfer_cancel,
            files_list,
            files_roots,
            files_mkdir,
            files_rename,
            files_copy,
            files_move,
            files_delete,
            files_props,
            files_search,
            files_open,
            finder_large_files,
            finder_old_files,
            finder_empty_dirs,
            finder_recycle_bin,
            finder_empty_recycle_bin,
            finder_installed_apps
        ])
        .setup(|app| {
            logs::info(app.handle(), "APP", "What to Delete? v2.2.0 — kernel online");
            logs::dim(app.handle(), "APP", "multi-task terminal online — per-task log channels active");
            logs::dim(app.handle(), "APP", "single-exe mode: WebView2 loader statically linked");
            logs::dim(app.handle(), "SYS", format!("host: {}", sys::computer_name()));
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
