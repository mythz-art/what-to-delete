use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::Ordering;
use std::time::UNIX_EPOCH;

use rayon::prelude::*;
use tauri::Emitter;

use crate::state::{now_ms, AppState};
use crate::types::{JunkCategory, JunkItem, ScanProgress, ScanReport};

pub struct CategoryDef {
    pub id: &'static str,
    pub name: &'static str,
    pub description: &'static str,
    pub risky: bool,
    /// (root env-var name, sub path); root "" means literal path in sub
    pub roots: &'static [(&'static str, &'static str)],
    /// only count entries whose path contains this filter (browser caches)
    pub path_filter: Option<&'static str>,
}

pub const CATEGORIES: &[CategoryDef] = &[
    CategoryDef {
        id: "temp",
        name: "Temporary Files",
        description: "Leftover temp data from installers, apps and the OS",
        risky: false,
        roots: &[("", r"C:\Windows\Temp"), ("%TEMP%", "")],
        path_filter: None,
    },
    CategoryDef {
        id: "browser",
        name: "Browser Cache",
        description: "Chrome, Edge and Firefox caches",
        risky: false,
        roots: &[
            ("%LOCALAPPDATA%", r"Google\Chrome\User Data"),
            ("%LOCALAPPDATA%", r"Microsoft\Edge\User Data"),
            ("%LOCALAPPDATA%", r"Mozilla\Firefox\Profiles"),
        ],
        path_filter: Some("cache"),
    },
    CategoryDef {
        id: "updates",
        name: "Windows Update Cache",
        description: "Downloaded update packages",
        risky: false,
        roots: &[("", r"C:\Windows\SoftwareDistribution\Download")],
        path_filter: None,
    },
    CategoryDef {
        id: "system",
        name: "System Cache",
        description: "Prefetch, patch caches and installer caches",
        risky: false,
        roots: &[
            ("", r"C:\Windows\Prefetch"),
            ("", r"C:\Windows\Installer\PatchCache"),
            ("%ProgramData%", r"Package Cache"),
        ],
        path_filter: None,
    },
    CategoryDef {
        id: "recycle",
        name: "Recycle Bin",
        description: "Files already deleted by you",
        risky: true,
        roots: &[("", r"C:\$Recycle.Bin")],
        path_filter: None,
    },
    CategoryDef {
        id: "logs",
        name: "Logs & Dumps",
        description: "CBS/DISM logs and crash dumps",
        risky: false,
        roots: &[
            ("", r"C:\Windows\Logs"),
            ("", r"C:\Windows\Minidump"),
            ("%LOCALAPPDATA%", r"CrashDumps"),
        ],
        path_filter: None,
    },
];

pub fn fnv1a(s: &str) -> u64 {
    let mut h: u64 = 0xcbf29ce484222325;
    for b in s.as_bytes() {
        h ^= *b as u64;
        h = h.wrapping_mul(0x100000001b3);
    }
    h
}

fn mtime_ms(p: &Path) -> u64 {
    fs::metadata(p)
        .and_then(|m| m.modified())
        .map(|t| {
            t.duration_since(UNIX_EPOCH)
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0)
        })
        .unwrap_or(0)
}

/// recursively measure a directory: (total bytes, file count, latest mtime)
fn measure_dir(p: &Path) -> (u64, u64, u64) {
    let mut bytes = 0u64;
    let mut files = 0u64;
    let mut latest = 0u64;
    let mut stack = vec![p.to_path_buf()];
    while let Some(dir) = stack.pop() {
        match fs::read_dir(&dir) {
            Ok(rd) => {
                for entry in rd.flatten() {
                    let path = entry.path();
                    match entry.file_type() {
                        Ok(ft) if ft.is_dir() => stack.push(path),
                        Ok(ft) if ft.is_file() => {
                            files += 1;
                            let len = entry.metadata().map(|m| m.len()).unwrap_or(0);
                            bytes += len;
                            let mt = mtime_ms(&path);
                            if mt > latest {
                                latest = mt;
                            }
                        }
                        _ => {}
                    }
                }
            }
            Err(_) => continue,
        }
    }
    (bytes, files, latest)
}

fn expand_root(env: &str, sub: &str) -> Option<PathBuf> {
    let base = if env.is_empty() {
        PathBuf::from(sub)
    } else {
        let val = std::env::var(env).ok()?;
        if sub.is_empty() {
            PathBuf::from(val)
        } else {
            PathBuf::from(val).join(sub)
        }
    };
    Some(base)
}

/// counts paths matching the category's cache filter (case-insensitive)
fn path_allowed(p: &Path, filter: Option<&str>) -> bool {
    match filter {
        Some(f) => p
            .to_string_lossy()
            .to_lowercase()
            .contains(&f.to_lowercase()),
        None => true,
    }
}

struct ChildJob {
    path: String,
    item: Option<JunkItem>,
    files: u64,
}

pub fn scan(app: &tauri::AppHandle, state: &AppState) -> Result<ScanReport, String> {
    use crate::logs;
    let started = std::time::Instant::now();
    state.scan_cancel.store(false, Ordering::Relaxed);
    logs::info(app, "SCAN", "junk sweep initiated — acquiring targets");

    let exclude: Vec<String> = state
        .settings
        .lock()
        .map(|s| s.exclude_paths.clone())
        .unwrap_or_default();

    let mut all_items: Vec<JunkItem> = Vec::new();
    let mut processed: u64 = 0;
    let mut total_budget: u64 = 60_000;
    let mut found_bytes: u64 = 0;
    let mut found_files: u64 = 0;
    let mut last_emit = std::time::Instant::now() - std::time::Duration::from_secs(1);

    for cat in CATEGORIES {
        if state.scan_cancel.load(Ordering::Relaxed) {
            logs::warn(app, "SCAN", "cancelled by operator");
            return Err("cancelled".into());
        }
        logs::dim(app, "SCAN", format!("sector {} :: {}", cat.id, cat.name));
        for &(env, sub) in cat.roots {
            let Some(root) = expand_root(env, sub) else {
                continue;
            };
            if !root.exists() {
                continue;
            }
            // per top-level child of the root -> one aggregated item.
            // children are measured in PARALLEL (rayon) — this is the big speedup.
            let children: Vec<PathBuf> = match fs::read_dir(&root) {
                Ok(rd) => rd.flatten().map(|e| e.path()).collect(),
                Err(_) => continue,
            };
            let filtered: Vec<PathBuf> = children
                .into_iter()
                .filter(|child| {
                    let path_str = child.to_string_lossy().to_string();
                    if exclude.iter().any(|x| path_str.starts_with(x.as_str())) {
                        return false;
                    }
                    path_allowed(child, cat.path_filter)
                })
                .collect();

            let results: Vec<ChildJob> = filtered
                .par_iter()
                .map(|child| {
                    let path_str = child.to_string_lossy().to_string();
                    let (bytes, files, latest) = if child.is_dir() {
                        measure_dir(child)
                    } else {
                        (
                            fs::metadata(child).map(|m| m.len()).unwrap_or(0),
                            1,
                            mtime_ms(child),
                        )
                    };
                    ChildJob {
                        path: path_str.clone(),
                        files,
                        item: if bytes > 0 {
                            Some(JunkItem {
                                id: format!("{:016x}", fnv1a(&child.to_string_lossy())),
                                path: path_str,
                                bytes,
                                category: cat.id.to_string(),
                                modified: latest,
                            })
                        } else {
                            None
                        },
                    }
                })
                .collect();

            processed += results.len() as u64;
            for job in results {
                if let Some(item) = job.item {
                    let bytes = item.bytes;
                    found_bytes += bytes;
                    found_files += job.files;
                    if all_items.len() < 900 {
                        all_items.push(item);
                    }
                }
                // throttled progress (max ~12 emits/sec)
                if last_emit.elapsed().as_millis() > 80 {
                    last_emit = std::time::Instant::now();
                    if processed > total_budget * 95 / 100 {
                        total_budget += 30_000;
                    }
                    let _ = app.emit(
                        "scan://progress",
                        ScanProgress {
                            phase: "scanning".into(),
                            current_path: job.path.clone(),
                            processed,
                            total: total_budget,
                            found_bytes,
                            found_files,
                        },
                    );
                }
            }
        }
    }

    if state.scan_cancel.load(Ordering::Relaxed) {
        return Err("cancelled".into());
    }

    // final emit so the bar completes
    let _ = app.emit(
        "scan://progress",
        ScanProgress {
            phase: "analyzing".into(),
            current_path: "validating safety rules".into(),
            processed,
            total: processed,
            found_bytes,
            found_files,
        },
    );

    // aggregate categories
    let mut categories: Vec<JunkCategory> = CATEGORIES
        .iter()
        .map(|c| {
            let items = all_items.iter().filter(|i| i.category == c.id);
            let bytes = items.clone().map(|i| i.bytes).sum();
            let file_count = items.count() as u64;
            JunkCategory {
                id: c.id.to_string(),
                name: c.name.to_string(),
                description: c.description.to_string(),
                bytes,
                file_count,
                risky: if c.risky { Some(true) } else { None },
            }
        })
        .filter(|c| c.file_count > 0)
        .collect();
    categories.sort_by(|a, b| b.bytes.cmp(&a.bytes));

    let total_bytes: u64 = categories.iter().map(|c| c.bytes).sum();
    let report = ScanReport {
        categories,
        items: all_items.clone(),
        total_bytes,
        total_files: found_files,
        duration_ms: started.elapsed().as_millis() as u64,
    };

    *state.scan_session.lock().unwrap() = all_items;
    *state.last_scan_at.lock().unwrap() = Some(now_ms());
    logs::ok(
        app,
        "SCAN",
        format!(
            "sweep complete :: {} bytes reclaimable across {} files in {} ms",
            found_bytes,
            found_files,
            report.duration_ms
        ),
    );
    Ok(report)
}

/// delete one path, optionally via the Recycle Bin
pub fn delete_path(path: &str, use_recycle: bool) -> bool {
    let p = std::path::Path::new(path);
    if !p.exists() {
        return true;
    }
    if use_recycle && delete_via_recycle_bin(&[path.to_string()]) {
        return true;
    }
    let meta = fs::metadata(p);
    match meta {
        Ok(m) if m.is_dir() => fs::remove_dir_all(p).is_ok(),
        Ok(_) => fs::remove_file(p).is_ok(),
        Err(_) => false,
    }
}

/// delete many paths; returns how many were removed
pub fn delete_paths(paths: &[String], use_recycle: bool) -> u64 {
    if paths.is_empty() {
        return 0;
    }
    // one-shot through the recycle bin when enabled
    if use_recycle && delete_via_recycle_bin(paths) {
        return paths
            .iter()
            .filter(|p| !std::path::Path::new(p.as_str()).exists())
            .count() as u64;
    }
    let mut removed = 0u64;
    for p in paths {
        if delete_path(p, use_recycle) {
            removed += 1;
        }
    }
    removed
}

fn delete_via_recycle_bin(paths: &[String]) -> bool {
    use windows_sys::Win32::UI::Shell::{
        SHFileOperationW, SHFILEOPSTRUCTW, FO_DELETE, FOF_ALLOWUNDO, FOF_NOCONFIRMATION,
        FOF_NOERRORUI, FOF_SILENT,
    };
    // double-null-terminated list of paths
    let mut buf: Vec<u16> = Vec::new();
    for p in paths {
        buf.extend(p.encode_utf16());
        buf.push(0);
    }
    buf.push(0);
    if buf.len() < 3 {
        return false;
    }
    unsafe {
        let mut op: SHFILEOPSTRUCTW = std::mem::zeroed();
        op.wFunc = FO_DELETE;
        op.pFrom = buf.as_ptr();
        op.fFlags = (FOF_ALLOWUNDO | FOF_NOCONFIRMATION | FOF_SILENT | FOF_NOERRORUI) as u16;
        let rc = SHFileOperationW(&mut op);
        rc == 0
    }
}
