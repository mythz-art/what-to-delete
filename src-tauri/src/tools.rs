use std::fs;
use std::path::PathBuf;
use std::time::Duration;

use crate::types::{ToolInfo, ToolResult};

pub fn list_tools() -> Vec<ToolInfo> {
    vec![
        ToolInfo { id: "large-files".into(), name: "Large Files Finder".into(), description: "Hunt down files larger than 100 MB across all drives".into() },
        ToolInfo { id: "old-downloads".into(), name: "Old Downloads".into(), description: "Find downloads you have not touched in 90+ days".into() },
        ToolInfo { id: "empty-folders".into(), name: "Empty Folders".into(), description: "Detect and remove empty folder skeletons".into() },
        ToolInfo { id: "browser-caches".into(), name: "Browser Caches".into(), description: "Deep-scan every browser cache profile".into() },
        ToolInfo { id: "update-cache".into(), name: "Windows Update Cache".into(), description: "Clear leftover update packages safely".into() },
        ToolInfo { id: "crash-dumps".into(), name: "Crash Dumps".into(), description: "Remove memory dumps from failed apps".into() },
        ToolInfo { id: "app-sizes".into(), name: "App Disk Usage".into(), description: "See which installed apps eat the most space".into() },
        ToolInfo { id: "startup-audit".into(), name: "Startup Audit".into(), description: "Review what slows down your boot time".into() },
    ]
}

struct WalkStat {
    found: u64,
    bytes: u64,
    note: String,
    budget: std::time::Instant,
}

fn walk(
    dir: PathBuf,
    min_size: u64,
    min_age_days: u64,
    skip_dirs: &[&str],
    stat: &mut WalkStat,
) {
    if stat.budget.elapsed().as_secs() > 60 {
        return;
    }
    let rd = match fs::read_dir(&dir) {
        Ok(r) => r,
        Err(_) => return,
    };
    for entry in rd.flatten() {
        let path = entry.path();
        if let Ok(ft) = entry.file_type() {
            if ft.is_dir() {
                let name = path
                    .file_name()
                    .map(|n| n.to_string_lossy().to_lowercase())
                    .unwrap_or_default();
                if !skip_dirs.contains(&name.as_str()) {
                    walk(path, min_size, min_age_days, skip_dirs, stat);
                }
            } else if ft.is_file() {
                let len = entry.metadata().map(|m| m.len()).unwrap_or(0);
                if len >= min_size {
                    let old_enough = match fs::metadata(&path).and_then(|m| m.modified()) {
                        Ok(t) => {
                            let age = t
                                .elapsed()
                                .unwrap_or(Duration::from_secs(0))
                                .as_secs()
                                / 86_400;
                            age >= min_age_days
                        }
                        Err(_) => false,
                    };
                    if old_enough || min_age_days == 0 {
                        stat.found += 1;
                        stat.bytes += len;
                        if len > 0 {
                            let p = path.to_string_lossy().to_string();
                            if !p.contains("$Recycle") && stat.note.len() < 120 {
                                stat.note = format!("largest offender: {}", p);
                            }
                        }
                    }
                }
            }
        }
    }
}

fn dir_size(p: &std::path::Path, stat: &mut WalkStat) -> u64 {
    let mut total = 0u64;
    let rd = match fs::read_dir(p) {
        Ok(r) => r,
        Err(_) => return 0,
    };
    for entry in rd.flatten() {
        if let Ok(ft) = entry.file_type() {
            if ft.is_dir() {
                total += dir_size(&entry.path(), stat);
            } else {
                let len = entry.metadata().map(|m| m.len()).unwrap_or(0);
                total += len;
                stat.found += 1;
                if stat.found > 400_000 {
                    return total;
                }
            }
        }
    }
    total
}

pub fn run_tool(id: &str) -> ToolResult {
    let mut stat = WalkStat {
        found: 0,
        bytes: 0,
        note: String::new(),
        budget: std::time::Instant::now(),
    };

    match id {
        "large-files" => {
            for root in ["C:\\", "D:\\", "E:\\"] {
                let p = PathBuf::from(root);
                if p.is_dir() {
                    walk(
                        p,
                        100 * 1024 * 1024,
                        0,
                        &["$recycle.bin", "windows", "program files", "program files (x86)"],
                        &mut stat,
                    );
                }
            }
            if stat.note.is_empty() {
                stat.note = format!("{} files over 100 MB", stat.found);
            }
        }
        "old-downloads" => {
            if let Ok(home) = std::env::var("USERPROFILE") {
                let p = PathBuf::from(home).join("Downloads");
                walk(p, 1024, 90, &[], &mut stat);
            }
            stat.note = format!("{} untouched downloads", stat.found);
        }
        "empty-folders" => {
            if let Ok(home) = std::env::var("USERPROFILE") {
                count_empty(&PathBuf::from(home), &mut stat, 0);
            }
            stat.note = format!("{} empty folders found", stat.found);
        }
        "browser-caches" => {
            if let Ok(la) = std::env::var("LOCALAPPDATA") {
                for sub in [
                    r"Google\Chrome\User Data",
                    r"Microsoft\Edge\User Data",
                    r"Mozilla\Firefox\Profiles",
                ] {
                    let p = PathBuf::from(&la).join(sub);
                    if p.exists() {
                        measure_filtered(&p, "cache", &mut stat);
                    }
                }
            }
            stat.note = format!("{} cached files", stat.found);
        }
        "update-cache" => {
            let p = PathBuf::from(r"C:\Windows\SoftwareDistribution\Download");
            if p.exists() {
                measure_filtered(&p, "", &mut stat);
            }
            stat.note = "Safe to clear — Windows re-downloads if needed".into();
        }
        "crash-dumps" => {
            for path in [
                r"C:\Windows\Minidump",
                r"C:\Windows\MEMORY.DMP",
            ] {
                let p = PathBuf::from(path);
                if p.is_file() {
                    stat.found += 1;
                    stat.bytes += fs::metadata(&p).map(|m| m.len()).unwrap_or(0);
                } else if p.is_dir() {
                    measure_filtered(&p, "", &mut stat);
                }
            }
            if let Ok(la) = std::env::var("LOCALAPPDATA") {
                let p = PathBuf::from(&la).join("CrashDumps");
                if p.exists() {
                    measure_filtered(&p, "", &mut stat);
                }
            }
            stat.note = format!("{} dumps from failed apps", stat.found);
        }
        "app-sizes" => {
            for root in [r"C:\Program Files", r"C:\Program Files (x86)"] {
                let p = PathBuf::from(root);
                if let Ok(rd) = fs::read_dir(&p) {
                    for entry in rd.flatten() {
                        if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                            stat.bytes += dir_size(&entry.path(), &mut stat);
                            stat.found += 1;
                        }
                    }
                }
            }
            stat.note = format!("{} apps measured", stat.found);
        }
        "startup-audit" => {
            for root in [
                r"%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup",
                r"%ProgramData%\Microsoft\Windows\Start Menu\Programs\Startup",
            ] {
                let expanded = root.replace("%APPDATA%", &std::env::var("APPDATA").unwrap_or_default())
                    .replace("%ProgramData%", &std::env::var("ProgramData").unwrap_or_default());
                let p = PathBuf::from(expanded);
                if let Ok(rd) = fs::read_dir(&p) {
                    for entry in rd.flatten() {
                        stat.found += 1;
                        let _ = entry;
                    }
                }
            }
            stat.note = format!("{} startup entries detected", stat.found);
        }
        _ => {
            stat.note = "Unknown tool".into();
        }
    }

    ToolResult {
        tool_id: id.to_string(),
        found: stat.found,
        bytes: stat.bytes,
        note: stat.note,
    }
}

fn measure_filtered(root: &std::path::Path, filter: &str, stat: &mut WalkStat) {
    let rd = match fs::read_dir(root) {
        Ok(r) => r,
        Err(_) => return,
    };
    for entry in rd.flatten() {
        let path = entry.path();
        let pstr = path.to_string_lossy().to_lowercase();
        if !filter.is_empty() && !pstr.contains(filter) {
            if let Ok(ft) = entry.file_type() {
                if ft.is_dir() {
                    measure_filtered(&path, filter, stat);
                }
            }
            continue;
        }
        if let Ok(ft) = entry.file_type() {
            if ft.is_dir() {
                measure_filtered(&path, filter, stat);
            } else {
                stat.found += 1;
                stat.bytes += entry.metadata().map(|m| m.len()).unwrap_or(0);
            }
        }
    }
}

fn count_empty(dir: &std::path::Path, stat: &mut WalkStat, depth: u32) {
    if depth > 6 || stat.budget.elapsed().as_secs() > 60 {
        return;
    }
    let rd = match fs::read_dir(dir) {
        Ok(r) => r,
        Err(_) => return,
    };
    let mut has_child = false;
    for entry in rd.flatten() {
        has_child = true;
        if let Ok(ft) = entry.file_type() {
            if ft.is_dir() {
                count_empty(&entry.path(), stat, depth + 1);
            }
        }
    }
    if !has_child {
        stat.found += 1;
    }
}
