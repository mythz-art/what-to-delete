use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use rayon::prelude::*;

use crate::types::{DirListing, FileEntry, FileOpResult, ItemProps};

const LIST_CAP: usize = 4000;

fn mtime_ms(p: &Path) -> u64 {
    fs::metadata(p)
        .and_then(|m| m.modified())
        .map(|t| t.duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0))
        .unwrap_or(0)
}

fn ctime_ms(p: &Path) -> u64 {
    fs::metadata(p)
        .and_then(|m| m.created())
        .map(|t| t.duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0))
        .unwrap_or(0)
}

fn is_hidden(p: &Path) -> bool {
    #[cfg(windows)]
    {
        use windows_sys::Win32::Storage::FileSystem::{
            GetFileAttributesW, FILE_ATTRIBUTE_HIDDEN,
        };
        let w: Vec<u16> = p
            .as_os_str()
            .to_string_lossy()
            .encode_utf16()
            .chain(std::iter::once(0))
            .collect();
        let attrs = unsafe { GetFileAttributesW(w.as_ptr()) };
        attrs != u32::MAX && (attrs & FILE_ATTRIBUTE_HIDDEN) != 0
    }
    #[cfg(not(windows))]
    {
        p.file_name()
            .map(|n| n.to_string_lossy().starts_with('.'))
            .unwrap_or(false)
    }
}

fn is_readonly(p: &Path) -> bool {
    #[cfg(windows)]
    {
        use windows_sys::Win32::Storage::FileSystem::{
            GetFileAttributesW, FILE_ATTRIBUTE_READONLY,
        };
        let w: Vec<u16> = p
            .as_os_str()
            .to_string_lossy()
            .encode_utf16()
            .chain(std::iter::once(0))
            .collect();
        let attrs = unsafe { GetFileAttributesW(w.as_ptr()) };
        attrs != u32::MAX && (attrs & FILE_ATTRIBUTE_READONLY) != 0
    }
    #[cfg(not(windows))]
    {
        false
    }
}

/// Sanitize user-supplied paths: keep them absolute and on-disk.
fn canon(p: &str) -> PathBuf {
    let path = PathBuf::from(p);
    if path.is_absolute() {
        path
    } else {
        PathBuf::from(p)
    }
}

pub fn list_dir(path: &str) -> Result<DirListing, String> {
    let dir = canon(path);
    if !dir.is_dir() {
        return Err(format!("not a directory: {}", dir.display()));
    }
    let rd = fs::read_dir(&dir).map_err(|e| e.to_string())?;
    let mut entries: Vec<FileEntry> = Vec::new();
    let mut total: u64 = 0;
    for entry in rd.flatten() {
        total += 1;
        if entries.len() >= LIST_CAP {
            continue;
        }
        let path = entry.path();
        let Ok(ft) = entry.file_type() else { continue };
        let is_dir = ft.is_dir();
        let bytes = entry.metadata().map(|m| m.len()).unwrap_or(0);
        entries.push(FileEntry {
            name: entry.file_name().to_string_lossy().to_string(),
            path: path.to_string_lossy().to_string(),
            is_dir,
            bytes: if is_dir { 0 } else { bytes },
            modified: mtime_ms(&path),
            hidden: is_hidden(&path),
            readonly: is_readonly(&path),
        });
    }
    // dirs first, then case-insensitive name order
    entries.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });
    let truncated = entries.len() as u64 >= LIST_CAP as u64 && total > LIST_CAP as u64;
    Ok(DirListing {
        path: dir.to_string_lossy().to_string(),
        parent: dir
            .parent()
            .map(|p| p.to_string_lossy().to_string()),
        entries,
        total,
        truncated,
    })
}

pub fn create_dir(parent: &str, name: &str) -> Result<String, String> {
    let name = sanitize_name(name)?;
    let target = canon(parent).join(&name);
    fs::create_dir_all(&target).map_err(|e| e.to_string())?;
    Ok(target.to_string_lossy().to_string())
}

fn sanitize_name(name: &str) -> Result<String, String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("empty name".into());
    }
    if name.contains("..") || name.contains('\\') || name.contains('/') || name.contains(':') {
        return Err("invalid characters in name".into());
    }
    Ok(name.to_string())
}

pub fn rename(path: &str, new_name: &str) -> Result<String, String> {
    let src = canon(path);
    let name = sanitize_name(new_name)?;
    let parent = src.parent().ok_or("no parent")?;
    let target = parent.join(&name);
    if target.exists() {
        return Err("target already exists".into());
    }
    fs::rename(&src, &target).map_err(|e| e.to_string())?;
    Ok(target.to_string_lossy().to_string())
}

fn recursive_copy(src: &Path, dst: &Path) -> std::io::Result<()> {
    if src.is_dir() {
        fs::create_dir_all(dst)?;
        for entry in fs::read_dir(src)?.flatten() {
            let s = entry.path();
            let d = dst.join(entry.file_name());
            recursive_copy(&s, &d)?;
        }
    } else {
        if let Some(p) = dst.parent() {
            let _ = fs::create_dir_all(p);
        }
        fs::copy(src, dst)?;
    }
    Ok(())
}

pub fn copy_items(paths: Vec<String>, dest: &str) -> FileOpResult {
    let dest_dir = canon(dest);
    if !dest_dir.is_dir() {
        return FileOpResult {
            ok: false,
            affected: 0,
            freed_bytes: 0,
            error: Some("destination is not a directory".into()),
        };
    }
    let mut affected = 0u64;
    let mut errors = Vec::new();
    for p in &paths {
        let src = canon(p);
        let Some(file_name) = src.file_name() else { continue };
        let mut target = dest_dir.join(file_name);
        // avoid clobbering: append " (2)", " (3)"…
        let mut counter = 2u32;
        while target.exists() {
            let stem = file_name.to_string_lossy().to_string();
            let (base, ext) = match stem.rfind('.') {
                Some(i) if i > 0 => (stem[..i].to_string(), stem[i..].to_string()),
                _ => (stem.clone(), String::new()),
            };
            let cand = format!("{base} ({counter}){ext}");
            target = dest_dir.join(cand);
            counter += 1;
            if counter > 999 {
                break;
            }
        }
        match recursive_copy(&src, &target) {
            Ok(_) => affected += 1,
            Err(e) => errors.push(format!("{}: {e}", src.display())),
        }
    }
    FileOpResult {
        ok: errors.is_empty(),
        affected,
        freed_bytes: 0,
        error: if errors.is_empty() {
            None
        } else {
            Some(errors.join("; "))
        },
    }
}

pub fn move_items(paths: Vec<String>, dest: &str) -> FileOpResult {
    let dest_dir = canon(dest);
    if !dest_dir.is_dir() {
        return FileOpResult {
            ok: false,
            affected: 0,
            freed_bytes: 0,
            error: Some("destination is not a directory".into()),
        };
    }
    let mut affected = 0u64;
    let mut errors = Vec::new();
    for p in &paths {
        let src = canon(p);
        let Some(file_name) = src.file_name() else { continue };
        let target = dest_dir.join(file_name);
        if target.exists() {
            errors.push(format!("{}: already exists", target.display()));
            continue;
        }
        // fast path: same volume rename
        if fs::rename(&src, &target).is_ok() {
            affected += 1;
            continue;
        }
        // cross-volume: copy + delete
        if recursive_copy(&src, &target).is_ok() {
            let removed = if src.is_dir() {
                fs::remove_dir_all(&src).is_ok()
            } else {
                fs::remove_file(&src).is_ok()
            };
            if removed {
                affected += 1;
            } else {
                errors.push(format!("{}: copied but source removal failed", src.display()));
            }
        } else {
            errors.push(format!("{}: copy failed", src.display()));
        }
    }
    FileOpResult {
        ok: errors.is_empty(),
        affected,
        freed_bytes: 0,
        error: if errors.is_empty() {
            None
        } else {
            Some(errors.join("; "))
        },
    }
}

pub fn delete_items(paths: Vec<String>, use_recycle: bool) -> FileOpResult {
    let mut freed = 0u64;
    for p in &paths {
        let path = canon(p);
        if let Ok(m) = fs::metadata(&path) {
            freed += if m.is_dir() { dir_bytes(&path) } else { m.len() };
        }
    }
    let removed = crate::junk::delete_paths(&paths, use_recycle);
    FileOpResult {
        ok: removed as usize == paths.len(),
        affected: removed,
        freed_bytes: freed,
        error: if removed as usize == paths.len() {
            None
        } else {
            Some(format!("{} of {} items could not be removed", paths.len() - removed as usize, paths.len()))
        },
    }
}

fn dir_bytes(p: &Path) -> u64 {
    let mut total = 0u64;
    let mut stack = vec![p.to_path_buf()];
    while let Some(dir) = stack.pop() {
        if let Ok(rd) = fs::read_dir(&dir) {
            for entry in rd.flatten() {
                if let Ok(ft) = entry.file_type() {
                    if ft.is_dir() {
                        stack.push(entry.path());
                    } else {
                        total += entry.metadata().map(|m| m.len()).unwrap_or(0);
                    }
                }
            }
        }
    }
    total
}

/// parallel directory size: (bytes, files, dirs)
fn dir_measure(p: &Path) -> (u64, u64, u64) {
    let subs: Vec<PathBuf> = fs::read_dir(p)
        .map(|rd| rd.flatten().map(|e| e.path()).collect())
        .unwrap_or_default();
    let files = subs.iter().filter(|s| s.is_file()).count() as u64;
    let dirs = subs.iter().filter(|s| s.is_dir()).count() as u64;
    let file_bytes: u64 = subs
        .par_iter()
        .filter(|s| s.is_file())
        .map(|s| fs::metadata(s).map(|m| m.len()).unwrap_or(0))
        .sum();
    let dir_bytes: u64 = subs
        .par_iter()
        .filter(|s| s.is_dir())
        .map(|s| dir_measure(s).0)
        .sum();
    (file_bytes + dir_bytes, files, dirs)
}

pub fn item_props(path: &str) -> Result<ItemProps, String> {
    let p = canon(path);
    let meta = fs::metadata(&p).map_err(|e| e.to_string())?;
    let is_dir = meta.is_dir();
    let (bytes, files, dirs) = if is_dir {
        dir_measure(&p)
    } else {
        (meta.len(), 1, 0)
    };
    Ok(ItemProps {
        path: p.to_string_lossy().to_string(),
        name: p
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default(),
        is_dir,
        bytes,
        file_count: files,
        dir_count: dirs,
        modified: mtime_ms(&p),
        created: ctime_ms(&p),
        readonly: is_readonly(&p),
    })
}

pub fn search_dir(root: &str, query: &str, max_results: u64) -> Vec<FileEntry> {
    let root = canon(root);
    let q = query.to_lowercase();
    let mut results = Vec::new();
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(12);
    let mut stack = vec![root];
    while let Some(dir) = stack.pop() {
        if results.len() as u64 >= max_results || std::time::Instant::now() > deadline {
            break;
        }
        let Ok(rd) = fs::read_dir(&dir) else { continue };
        for entry in rd.flatten() {
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            let lower = name.to_lowercase();
            if lower.contains(&q) {
                if let Ok(ft) = entry.file_type() {
                    results.push(FileEntry {
                        name: name.clone(),
                        path: path.to_string_lossy().to_string(),
                        is_dir: ft.is_dir(),
                        bytes: if ft.is_dir() { 0 } else { entry.metadata().map(|m| m.len()).unwrap_or(0) },
                        modified: mtime_ms(&path),
                        hidden: is_hidden(&path),
                        readonly: is_readonly(&path),
                    });
                }
                if results.len() as u64 >= max_results {
                    break;
                }
            }
            if let Ok(ft) = entry.file_type() {
                if ft.is_dir() {
                    stack.push(path);
                }
            }
        }
    }
    results
}

/// Reveal a path in Windows Explorer (selects the item).
pub fn open_in_explorer(path: &str) -> bool {
    let p = canon(path);
    if !p.exists() {
        return false;
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let mut cmd = std::process::Command::new("explorer.exe");
        if p.is_dir() {
            cmd.arg(p.as_os_str());
        } else {
            cmd.arg(format!("/select,{}", p.display()));
        }
        let _ = cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
        cmd.spawn().is_ok()
    }
    #[cfg(not(windows))]
    {
        false
    }
}

/// Quick roots for the explorer start screen ("This PC" view).
pub fn quick_roots() -> Vec<FileEntry> {
    let mut roots = Vec::new();
    if let Ok(home) = std::env::var("USERPROFILE") {
        let h = PathBuf::from(&home);
        for (label, sub) in [
            ("Desktop", "Desktop"),
            ("Downloads", "Downloads"),
            ("Documents", "Documents"),
            ("Pictures", "Pictures"),
            ("Music", "Music"),
            ("Videos", "Videos"),
        ] {
            let p = h.join(sub);
            if p.is_dir() {
                roots.push(FileEntry {
                    name: label.to_string(),
                    path: p.to_string_lossy().to_string(),
                    is_dir: true,
                    bytes: 0,
                    modified: 0,
                    hidden: false,
                    readonly: false,
                });
            }
        }
    }
    for drive in crate::sys::list_drives() {
        roots.push(FileEntry {
            name: format!("{} ({})", drive.label, drive.letter),
            path: format!("{}\\", drive.letter),
            is_dir: true,
            bytes: 0,
            modified: 0,
            hidden: false,
            readonly: false,
        });
    }
    roots
}
