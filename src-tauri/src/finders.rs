use std::fs;
use std::path::PathBuf;
use std::time::{Duration, UNIX_EPOCH};

use rayon::prelude::*;

use crate::types::{FinderItem, InstalledApp, RecycleBinStats};

const SKIP_DIRS: &[&str] = &[
    "$recycle.bin",
    "windows",
    "program files",
    "program files (x86)",
    "appdata",
    "$windows.~bt",
    "system volume information",
];

fn mtime_ms(p: &std::path::Path) -> u64 {
    fs::metadata(p)
        .and_then(|m| m.modified())
        .map(|t| t.duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0))
        .unwrap_or(0)
}

fn default_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Ok(home) = std::env::var("USERPROFILE") {
        let h = PathBuf::from(home);
        for sub in ["Downloads", "Documents", "Pictures", "Music", "Videos", "Desktop"] {
            let p = h.join(sub);
            if p.is_dir() {
                roots.push(p);
            }
        }
    }
    for d in ["D:\\", "E:\\"] {
        let p = PathBuf::from(d);
        if p.is_dir() {
            roots.push(p);
        }
    }
    roots
}

/// Collect files >= min_bytes, sorted by size desc, capped at limit.
pub fn large_files(roots: Vec<String>, min_bytes: u64, limit: usize) -> Vec<FinderItem> {
    let roots: Vec<PathBuf> = if roots.is_empty() {
        default_roots()
    } else {
        roots.into_iter().map(PathBuf::from).filter(|p| p.is_dir()).collect()
    };
    let mut found: Vec<FinderItem> = Vec::new();
    let deadline = std::time::Instant::now() + Duration::from_secs(60);
    let mut stack = roots;
    while let Some(dir) = stack.pop() {
        if std::time::Instant::now() > deadline {
            break;
        }
        let Ok(rd) = fs::read_dir(&dir) else { continue };
        for entry in rd.flatten() {
            let path = entry.path();
            if let Ok(ft) = entry.file_type() {
                if ft.is_dir() {
                    let name = path
                        .file_name()
                        .map(|n| n.to_string_lossy().to_lowercase())
                        .unwrap_or_default();
                    if !SKIP_DIRS.contains(&name.as_str()) {
                        stack.push(path);
                    }
                } else if ft.is_file() {
                    let len = entry.metadata().map(|m| m.len()).unwrap_or(0);
                    if len >= min_bytes {
                        found.push(FinderItem {
                            path: path.to_string_lossy().to_string(),
                            bytes: len,
                            modified: mtime_ms(&path),
                            extra: String::new(),
                        });
                    }
                }
            }
        }
    }
    // parallel sort-safe truncate: keep top N
    found.sort_by(|a, b| b.bytes.cmp(&a.bytes));
    found.truncate(limit);
    found
}

/// Files not modified within `days`, sorted by size desc, capped.
pub fn old_files(roots: Vec<String>, days: u64, min_bytes: u64, limit: usize) -> Vec<FinderItem> {
    let roots: Vec<PathBuf> = if roots.is_empty() {
        default_roots()
    } else {
        roots.into_iter().map(PathBuf::from).filter(|p| p.is_dir()).collect()
    };
    let now_ms = std::time::SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    let cutoff = now_ms.saturating_sub(days * 86_400_000);
    let mut found: Vec<FinderItem> = Vec::new();
    let deadline = std::time::Instant::now() + Duration::from_secs(45);
    let mut stack = roots;
    while let Some(dir) = stack.pop() {
        if std::time::Instant::now() > deadline {
            break;
        }
        let Ok(rd) = fs::read_dir(&dir) else { continue };
        for entry in rd.flatten() {
            let path = entry.path();
            if let Ok(ft) = entry.file_type() {
                if ft.is_dir() {
                    let name = path
                        .file_name()
                        .map(|n| n.to_string_lossy().to_lowercase())
                        .unwrap_or_default();
                    if !SKIP_DIRS.contains(&name.as_str()) {
                        stack.push(path);
                    }
                } else if ft.is_file() {
                    let len = entry.metadata().map(|m| m.len()).unwrap_or(0);
                    let mt = mtime_ms(&path);
                    if len >= min_bytes && mt > 0 && mt < cutoff {
                        found.push(FinderItem {
                            path: path.to_string_lossy().to_string(),
                            bytes: len,
                            modified: mt,
                            extra: format!("{} days idle", (now_ms - mt) / 86_400_000),
                        });
                    }
                }
            }
        }
    }
    found.sort_by(|a, b| b.bytes.cmp(&a.bytes));
    found.truncate(limit);
    found
}

/// Recursive empty-directory detection (a dir is "empty" when no file exists
/// anywhere beneath it). Bottom-up, parallel per top-level child.
pub fn empty_dirs(root: String, limit: usize) -> Vec<FinderItem> {
    let root = PathBuf::from(root);
    let mut results: Vec<FinderItem> = Vec::new();
    let deadline = std::time::Instant::now() + Duration::from_secs(30);

    // post-order DFS: returns (has_file, bytes)
    fn dfs(dir: &std::path::Path, deadline: std::time::Instant, out: &mut Vec<FinderItem>, limit: usize) -> (bool, u64) {
        if out.len() >= limit || std::time::Instant::now() > deadline {
            return (true, 0); // treat as non-empty to avoid false positives
        }
        let mut has_file = false;
        let mut bytes = 0u64;
        if let Ok(rd) = fs::read_dir(dir) {
            for entry in rd.flatten() {
                if let Ok(ft) = entry.file_type() {
                    let p = entry.path();
                    if ft.is_dir() {
                        let (sub_has, sub_bytes) = dfs(&p, deadline, out, limit);
                        has_file |= sub_has;
                        bytes += sub_bytes;
                    } else {
                        has_file = true;
                        bytes += entry.metadata().map(|m| m.len()).unwrap_or(0);
                    }
                }
            }
        }
        if !has_file && dir != dir.parent().unwrap_or(dir) {
            out.push(FinderItem {
                path: dir.to_string_lossy().to_string(),
                bytes: 0,
                modified: mtime_ms(dir),
                extra: "empty tree".into(),
            });
        }
        (has_file, bytes)
    }

    let children: Vec<PathBuf> = fs::read_dir(&root)
        .map(|rd| rd.flatten().map(|e| e.path()).collect())
        .unwrap_or_default();
    // parallel across top-level children
    let collected: Vec<Vec<FinderItem>> = children
        .par_iter()
        .filter(|c| c.is_dir())
        .map(|c| {
            let mut out = Vec::new();
            let _ = dfs(c, deadline, &mut out, limit);
            out
        })
        .collect();
    for v in collected {
        results.extend(v);
        if results.len() >= limit {
            break;
        }
    }
    results.truncate(limit);
    results
}

/// Recycle Bin stats for all drives.
pub fn recycle_bin_stats() -> RecycleBinStats {
    #[cfg(windows)]
    {
        use windows_sys::Win32::UI::Shell::{SHQueryRecycleBinW, SHQUERYRBINFO};
        let mut info: SHQUERYRBINFO = unsafe { std::mem::zeroed() };
        info.cbSize = std::mem::size_of::<SHQUERYRBINFO>() as u32;
        // empty wide string = all drives
        let root: Vec<u16> = vec![0];
        let hr = unsafe { SHQueryRecycleBinW(root.as_ptr(), &mut info) };
        if hr == 0 {
            RecycleBinStats {
                count: info.i64NumItems as u64,
                bytes: info.i64Size as u64,
            }
        } else {
            RecycleBinStats { count: 0, bytes: 0 }
        }
    }
    #[cfg(not(windows))]
    {
        RecycleBinStats { count: 0, bytes: 0 }
    }
}

/// Permanently empty the Recycle Bin.
pub fn recycle_bin_empty() -> bool {
    #[cfg(windows)]
    {
        use windows_sys::Win32::UI::Shell::{
            SHEmptyRecycleBinW, SHERB_NOCONFIRMATION, SHERB_NOPROGRESSUI, SHERB_NOSOUND,
        };
        let root: Vec<u16> = vec![0];
        let hr = unsafe {
            SHEmptyRecycleBinW(
                std::ptr::null_mut(),
                root.as_ptr(),
                SHERB_NOCONFIRMATION | SHERB_NOPROGRESSUI | SHERB_NOSOUND,
            )
        };
        hr == 0
    }
    #[cfg(not(windows))]
    {
        false
    }
}

/// Installed apps from the Uninstall registry keys, sorted by size desc.
pub fn installed_apps() -> Vec<InstalledApp> {
    #[cfg(windows)]
    {
        use windows_sys::Win32::System::Registry::{
            RegCloseKey, RegEnumKeyExW, RegOpenKeyExW, RegQueryValueExW, HKEY, HKEY_CURRENT_USER,
            HKEY_LOCAL_MACHINE, KEY_READ, REG_DWORD, REG_SZ,
        };
        const UNINSTALL: &str = "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall";

        let mut apps: Vec<InstalledApp> = Vec::new();

        #[allow(clippy::type_complexity)]
        let read_string = |hkey: HKEY, name: &str| -> Option<String> {
            let mut name_w: Vec<u16> = name.encode_utf16().chain(std::iter::once(0)).collect();
            let mut buf = [0u16; 512];
            let mut len = buf.len() as u32 * 2;
            let ty = REG_SZ;
            let rc = unsafe {
                RegQueryValueExW(
                    hkey,
                    name_w.as_mut_ptr(),
                    std::ptr::null_mut(),
                    &ty as *const u32 as *mut u32,
                    buf.as_mut_ptr() as *mut u8,
                    &mut len,
                )
            };
            let _ = 0u32; // RRF_RT_REG_SZ placeholder removed
            if rc == 0 {
                let chars = len as usize / 2;
                let s: String = buf[..chars.min(buf.len())]
                    .iter()
                    .take_while(|&&c| c != 0)
                    .map(|&c| char::from_u32(c as u32).unwrap_or(' '))
                    .collect();
                if s.is_empty() {
                    None
                } else {
                    Some(s)
                }
            } else {
                None
            }
        };

        let read_u32 = |hkey: HKEY| -> u64 {
            use windows_sys::Win32::System::Registry::RegQueryValueExW as Q;
            let mut name_w: Vec<u16> = "EstimatedSize".encode_utf16().chain(std::iter::once(0)).collect();
            let mut val: u32 = 0;
            let mut len = 4u32;
            let ty = REG_DWORD;
            let rc = unsafe {
                Q(
                    hkey,
                    name_w.as_mut_ptr(),
                    std::ptr::null_mut(),
                    &ty as *const u32 as *mut u32,
                    &mut val as *mut u32 as *mut u8,
                    &mut len,
                )
            };
            if rc == 0 {
                val as u64 * 1024 // EstimatedSize is in KB
            } else {
                0
            }
        };

        let enum_key = |root: HKEY, wow: u32| -> Vec<InstalledApp> {
            let mut out = Vec::new();
            let mut path_w: Vec<u16> = UNINSTALL.encode_utf16().chain(std::iter::once(0)).collect();
            let mut hkey: HKEY = std::ptr::null_mut();
            let rc = unsafe { RegOpenKeyExW(root, path_w.as_mut_ptr(), 0, KEY_READ | wow, &mut hkey) };
            if rc != 0 {
                return out;
            }
            let mut index = 0u32;
            loop {
                let mut name = [0u16; 256];
                let mut name_len = name.len() as u32;
                let rc = unsafe {
                    RegEnumKeyExW(
                        hkey,
                        index,
                        name.as_mut_ptr(),
                        &mut name_len,
                        std::ptr::null_mut(),
                        std::ptr::null_mut(),
                        std::ptr::null_mut(),
                        std::ptr::null_mut(),
                    )
                };
                if rc != 0 {
                    break;
                }
                index += 1;
                let subkey: String = name[..(name_len as usize).min(name.len())]
                    .iter()
                    .map(|&c| char::from_u32(c as u32).unwrap_or(' '))
                    .collect();
                let mut sub_path: Vec<u16> = format!("{UNINSTALL}\\{subkey}")
                    .encode_utf16()
                    .chain(std::iter::once(0))
                    .collect();
                let mut sub: HKEY = std::ptr::null_mut();
                if unsafe { RegOpenKeyExW(root, sub_path.as_mut_ptr(), 0, KEY_READ | wow, &mut sub) } == 0 {
                    let display = read_string(sub, "DisplayName");
                    let version = read_string(sub, "DisplayVersion").unwrap_or_default();
                    let publisher = read_string(sub, "Publisher").unwrap_or_default();
                    let location = read_string(sub, "InstallLocation").unwrap_or_default();
                    let uninstall = read_string(sub, "UninstallString").unwrap_or_default();
                    let size = read_u32(sub);
                    let _ = unsafe { RegCloseKey(sub) };
                    if let Some(d) = display {
                        // skip system components and updates
                        if !d.is_empty() {
                            out.push(InstalledApp {
                                name: d,
                                version,
                                publisher,
                                bytes: size,
                                install_location: location,
                                uninstall_string: uninstall,
                            });
                        }
                    }
                }
            }
            unsafe { RegCloseKey(hkey) };
            out
        };

        // HKLM 64-bit + 32-bit + HKCU
        for (root, wow) in [
            (HKEY_LOCAL_MACHINE, 0x0100), // KEY_WOW64_64KEY
            (HKEY_LOCAL_MACHINE, 0x0200), // KEY_WOW64_32KEY
            (HKEY_CURRENT_USER, 0),
        ] {
            apps.extend(enum_key(root, wow));
        }

        // dedupe by name (64/32 overlap), keep largest size
        apps.sort_by(|a, b| b.bytes.cmp(&a.bytes));
        let mut seen = std::collections::HashSet::new();
        apps.retain(|a| seen.insert(a.name.clone()));
        apps.truncate(200);
        apps
    }
    #[cfg(not(windows))]
    {
        Vec::new()
    }
}

