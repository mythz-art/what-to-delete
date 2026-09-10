//! v2.3 — Power-user & developer toolkit.
//!
//! Everything a sysadmin / developer reaches for weekly, without opening a
//! browser or a shell:
//!  - folder_sizes      : "what is eating my disk" — parallel top-N folder sizes
//!  - path_audit        : PATH environment auditor (missing dirs + duplicates)
//!  - startup_list      : real autoruns from registry Run keys + Startup folders
//!  - startup_remove    : delete one autorun entry (HKCU values / folder files)
//!  - dns_flush         : ipconfig /flushdns + /renew helper
//!  - hash_file         : streaming SHA-256 of any file
//!  - open_terminal     : Windows Terminal / PowerShell / cmd at any folder
//!  - shred_paths       : secure delete (random overwrite passes, no recycle)
//!  - delete_on_reboot  : MoveFileEx MOVEFILE_DELAY_UNTIL_REBOOT for locked files

use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use rayon::prelude::*;
use sha2::{Digest, Sha256};

use crate::state::now_ms;
use crate::types::{FileOpResult, FolderSize, HashResult, PathAuditEntry, PathAuditReport, StartupEntry};

const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/* ------------------------------- folder sizes ------------------------------- */

/// Measure a directory tree: (bytes, file_count). Iterative, budgeted.
fn measure_tree(p: &Path, deadline: std::time::Instant) -> (u64, u64) {
    let mut bytes = 0u64;
    let mut files = 0u64;
    let mut stack = vec![p.to_path_buf()];
    while let Some(dir) = stack.pop() {
        if std::time::Instant::now() > deadline {
            return (bytes, files);
        }
        if let Ok(rd) = fs::read_dir(&dir) {
            for entry in rd.flatten() {
                match entry.file_type() {
                    Ok(ft) if ft.is_dir() => stack.push(entry.path()),
                    Ok(_) => {
                        files += 1;
                        bytes += entry.metadata().map(|m| m.len()).unwrap_or(0);
                    }
                    Err(_) => {}
                }
            }
        }
    }
    (bytes, files)
}

/// Top-N folder sizes under `root` (default: user profile). Parallel across
/// the top-level children, 45s global budget, results sorted by size.
pub fn folder_sizes(root: Option<String>, limit: usize) -> Vec<FolderSize> {
    let root: PathBuf = match root {
        Some(r) if !r.is_empty() && Path::new(&r).is_dir() => PathBuf::from(r),
        _ => std::env::var("USERPROFILE")
            .map(PathBuf::from)
            .unwrap_or_else(|_| PathBuf::from("C:\\")),
    };
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(45);
    let limit = limit.clamp(5, 60);

    let children: Vec<PathBuf> = fs::read_dir(&root)
        .map(|rd| rd.flatten().map(|e| e.path()).collect())
        .unwrap_or_default();

    let mut out: Vec<FolderSize> = children
        .par_iter()
        .map(|c| {
            let (bytes, files) = if c.is_dir() {
                measure_tree(c, deadline)
            } else {
                (
                    fs::metadata(c).map(|m| m.len()).unwrap_or(0),
                    if c.is_file() { 1 } else { 0 },
                )
            };
            FolderSize {
                path: c.to_string_lossy().to_string(),
                bytes,
                files,
            }
        })
        .collect();

    out.sort_by(|a, b| b.bytes.cmp(&a.bytes));
    out.truncate(limit);
    out
}

/* --------------------------------- PATH audit -------------------------------- */

pub fn path_audit() -> PathAuditReport {
    let raw = std::env::var("PATH").unwrap_or_default();
    let entries: Vec<PathBuf> = raw
        .split(';')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(PathBuf::from)
        .collect();

    let mut seen: Vec<String> = Vec::new();
    let mut out: Vec<PathAuditEntry> = Vec::new();
    let mut missing = 0u32;
    let mut dups = 0u32;

    for p in &entries {
        let norm = p.to_string_lossy().to_lowercase().trim_end_matches('\\').to_string();
        let duplicate = seen.contains(&norm);
        if duplicate {
            dups += 1;
        } else {
            seen.push(norm);
        }
        // only stat-check absolute paths (skip %VAR% expansions that came out weird)
        let exists = if p.is_absolute() {
            p.exists()
        } else {
            true // relative entries are legal but rare — do not flag
        };
        if !exists {
            missing += 1;
        }
        out.push(PathAuditEntry {
            path: p.to_string_lossy().to_string(),
            exists,
            duplicate,
        });
    }

    PathAuditReport {
        total_count: out.len() as u32,
        missing_count: missing,
        duplicate_count: dups,
        entries: out,
    }
}

/* --------------------------------- DNS flush --------------------------------- */

pub fn dns_flush() -> Result<String, String> {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let output = std::process::Command::new("ipconfig.exe")
            .args(["/flushdns"])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map_err(|e| format!("ipconfig failed: {e}"))?;
        let text = String::from_utf8_lossy(&output.stdout);
        let first = text
            .lines()
            .map(str::trim)
            .find(|l| !l.is_empty())
            .unwrap_or("DNS resolver cache flushed");
        Ok(first.to_string())
    }
    #[cfg(not(windows))]
    {
        Err("Windows only".into())
    }
}

/* --------------------------------- file hash --------------------------------- */

pub fn hash_file(path: &str) -> Result<HashResult, String> {
    let p = Path::new(path);
    let len = fs::metadata(p).map_err(|e| format!("cannot stat: {e}"))?.len();
    let mut f = fs::File::open(p).map_err(|e| format!("cannot open: {e}"))?;
    let t0 = std::time::Instant::now();
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; 1024 * 1024];
    loop {
        let n = f.read(&mut buf).map_err(|e| format!("read failed: {e}"))?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    let hex: String = hasher.finalize().iter().map(|b| format!("{b:02x}")).collect();
    Ok(HashResult {
        algo: "SHA-256".into(),
        hex,
        bytes: len,
        ms: t0.elapsed().as_millis() as u64,
    })
}

/* ------------------------------- open terminal ------------------------------- */

/// Open a terminal at `path` — prefers Windows Terminal, falls back to
/// PowerShell, then cmd.
pub fn open_terminal(path: &str) -> bool {
    let p = PathBuf::from(path);
    let dir = if p.is_dir() { p } else { p.parent().map(Path::to_path_buf).unwrap_or(p) };
    let dir_str = dir.to_string_lossy().to_string();
    #[allow(unused_mut)]
    let attempts: Vec<(&str, Vec<String>)> = vec![
        ("wt.exe", vec!["-d".into(), dir_str.clone()]),
        (
            "powershell.exe",
            vec!["-NoExit".into(), "-Command".into(), format!("Set-Location -LiteralPath '{dir_str}'")],
        ),
        ("cmd.exe", vec!["/K".into(), format!("cd /d \"{dir_str}\"")]),
    ];
    for (exe, mut args) in attempts {
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            // we WANT the window: no CREATE_NO_WINDOW flag here
            let _ = &mut args;
            if std::process::Command::new(exe)
                .args(&args)
                .creation_flags(0x0000_0010) // CREATE_NEW_CONSOLE (harmless for wt/pwsh)
                .spawn()
                .is_ok()
            {
                return true;
            }
        }
        #[cfg(not(windows))]
        {
            let _ = (exe, args);
        }
    }
    false
}

/* --------------------------------- secure shred -------------------------------- */

fn shred_one(path: &Path) -> bool {
    if !path.is_file() {
        return false;
    }
    let len = match fs::metadata(path) {
        Ok(m) => m.len(),
        Err(_) => return false,
    };
    // 3 overwrite passes: random, random, zeros
    let open_rw = || {
        #[cfg(windows)]
        {
            #[allow(clippy::needless_return)]
            {
                return fs::OpenOptions::new().write(true).open(path);
            }
        }
        #[cfg(not(windows))]
        {
            fs::OpenOptions::new().write(true).open(path)
        }
    };
    for pass in 0..3 {
        if let Ok(mut f) = open_rw() {
            use rand::RngCore;
            let mut buf = vec![0u8; 256 * 1024];
            let mut written = 0u64;
            while written < len {
                let chunk = (len - written).min(buf.len() as u64) as usize;
                if pass < 2 {
                    rand::thread_rng().fill_bytes(&mut buf[..chunk]);
                } else {
                    for b in buf[..chunk].iter_mut() {
                        *b = 0;
                    }
                }
                if f.write_all(&buf[..chunk]).is_err() {
                    return false;
                }
                written += chunk as u64;
            }
            let _ = f.sync_all();
        } else {
            return false;
        }
    }
    // one more rename to break the original filename link before deleting
    let ghost = path.with_extension(format!("wtdshred{}", now_ms() % 1_000_000));
    let _ = fs::rename(path, &ghost);
    fs::remove_file(&ghost).is_ok()
}

/// Securely delete files (and every file inside directories).
pub fn shred_paths(paths: &[String]) -> FileOpResult {
    let mut freed = 0u64;
    let mut shredded = 0u64;
    let mut errors: Vec<String> = Vec::new();

    let mut queue: Vec<PathBuf> = paths.iter().map(PathBuf::from).collect();
    // expand directories into their files
    let mut expanded: Vec<PathBuf> = Vec::new();
    while let Some(p) = queue.pop() {
        if p.is_dir() {
            if let Ok(rd) = fs::read_dir(&p) {
                for e in rd.flatten() {
                    queue.push(e.path());
                }
            }
        } else {
            expanded.push(p);
        }
    }

    for p in &expanded {
        let size = fs::metadata(p).map(|m| m.len()).unwrap_or(0);
        if shred_one(p) {
            shredded += 1;
            freed += size;
        } else {
            errors.push(p.to_string_lossy().to_string());
        }
    }
    // now remove the (now empty) directories that were passed
    for p in paths.iter().map(PathBuf::from) {
        if p.is_dir() {
            let _ = fs::remove_dir_all(&p);
        }
    }

    FileOpResult {
        ok: errors.is_empty(),
        affected: shredded,
        freed_bytes: freed,
        error: if errors.is_empty() {
            None
        } else {
            Some(format!("could not shred {} file(s)", errors.len()))
        },
    }
}

/* ------------------------------ delete on reboot ------------------------------ */

/// Schedule locked files for deletion at next boot (registry PendingFileRenameOperations).
pub fn delete_on_reboot(paths: &[String]) -> FileOpResult {
    #[cfg(windows)]
    {
        use windows_sys::Win32::Storage::FileSystem::{MoveFileExW, MOVEFILE_DELAY_UNTIL_REBOOT};
        let mut scheduled = 0u64;
        let mut failures: Vec<String> = Vec::new();
        for p in paths {
            let wide: Vec<u16> = p.encode_utf16().chain(std::iter::once(0)).collect();
            let rc = unsafe { MoveFileExW(wide.as_ptr(), std::ptr::null(), MOVEFILE_DELAY_UNTIL_REBOOT) };
            if rc != 0 {
                scheduled += 1;
            } else {
                failures.push(format!("{} (error {})", p, unsafe {
                    windows_sys::Win32::Foundation::GetLastError()
                }));
            }
        }
        FileOpResult {
            ok: failures.is_empty(),
            affected: scheduled,
            freed_bytes: 0,
            error: if failures.is_empty() {
                None
            } else {
                Some(format!(
                    "needs administrator rights for: {}",
                    failures.first().cloned().unwrap_or_default()
                ))
            },
        }
    }
    #[cfg(not(windows))]
    {
        let _ = paths;
        FileOpResult {
            ok: false,
            affected: 0,
            freed_bytes: 0,
            error: Some("Windows only".into()),
        }
    }
}

/* -------------------------------- autoruns ----------------------------------- */

#[cfg(windows)]
fn reg_run_values(root: windows_sys::Win32::System::Registry::HKEY, subkey: &str) -> Vec<(String, String)> {
    use windows_sys::Win32::System::Registry::{
        RegCloseKey, RegEnumValueW, RegOpenKeyExW, RegQueryValueExW, KEY_READ, REG_EXPAND_SZ, REG_SZ,
    };
    let mut out: Vec<(String, String)> = Vec::new();
    let sub_w: Vec<u16> = subkey.encode_utf16().chain(std::iter::once(0)).collect();
    let mut hkey = std::ptr::null_mut();
    if unsafe { RegOpenKeyExW(root, sub_w.as_ptr(), 0, KEY_READ, &mut hkey) } != 0 {
        return out;
    }
    // First: how many values?
    let mut name_buf = [0u16; 512];
    let mut data_buf = [0u16; 1024];
    let mut index: u32 = 0;
    loop {
        let mut name_len = name_buf.len() as u32;
        let mut ty = 0u32;
        let mut data_len = data_buf.len() as u32 * 2;
        let rc = unsafe {
            RegEnumValueW(
                hkey,
                index,
                name_buf.as_mut_ptr(),
                &mut name_len,
                std::ptr::null_mut(),
                &mut ty,
                data_buf.as_mut_ptr() as *mut u8,
                &mut data_len,
            )
        };
        if rc != 0 {
            break; // ERROR_NO_MORE_ITEMS or error
        }
        if ty == REG_SZ || ty == REG_EXPAND_SZ {
            let name = String::from_utf16_lossy(&name_buf[..name_len as usize]);
            let data = String::from_utf16_lossy(&data_buf[..(data_len as usize) / 2]);
            if !data.ends_with('\0') {
                // ensure no stray NUL
            }
            out.push((name.trim_end_matches('\0').to_string(), data.trim_end_matches('\0').to_string()));
        }
        index += 1;
        if index > 500 {
            break;
        }
    }
    let _ = unsafe { RegCloseKey(hkey) };
    let _ = RegQueryValueExW; // keep import referenced
    out
}

pub fn startup_list() -> Vec<StartupEntry> {
    let mut out: Vec<StartupEntry> = Vec::new();

    #[cfg(windows)]
    {
        use windows_sys::Win32::System::Registry::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
        const RUN: &str = "Software\\Microsoft\\Windows\\CurrentVersion\\Run";
        const RUN_ONCE: &str = "Software\\Microsoft\\Windows\\CurrentVersion\\RunOnce";

        for (root, loc, removable) in [
            (HKEY_CURRENT_USER, "hkcu-run", true),
            (HKEY_LOCAL_MACHINE, "hklm-run", false),
        ] {
            let subkeys = if loc == "hkcu-run" {
                vec![(RUN.to_string(), "Run".to_string()), (RUN_ONCE.to_string(), "RunOnce".to_string())]
            } else {
                vec![(RUN.to_string(), "Run".to_string())]
            };
            for (sub, label) in subkeys {
                for (name, command) in reg_run_values(root, &sub) {
                    out.push(StartupEntry {
                        id: format!("{loc}|{label}|{name}"),
                        name: name.clone(),
                        command,
                        location: format!("Registry · {label} · {}", if removable { "HKCU" } else { "HKLM" }),
                        removable,
                    });
                }
            }
        }

        // Startup folders (user + all users)
        let folders: Vec<(Option<String>, PathBuf, &str)> = {
            let mut v: Vec<(Option<String>, PathBuf, &str)> = Vec::new();
            if let Ok(home) = std::env::var("APPDATA") {
                v.push((
                    Some("User".into()),
                    PathBuf::from(&home).join(r"Microsoft\Windows\Start Menu\Programs\Startup"),
                    "folder",
                ));
            }
            if let Ok(pd) = std::env::var("ProgramData") {
                v.push((
                    Some("All users".into()),
                    PathBuf::from(&pd).join(r"Microsoft\Windows\Start Menu\Programs\Startup"),
                    "folder-all",
                ));
            }
            v
        };
        for (scope, dir, loc) in folders {
            if let Ok(rd) = fs::read_dir(&dir) {
                for e in rd.flatten() {
                    let name = e.file_name().to_string_lossy().to_string();
                    if name.is_empty() {
                        continue;
                    }
                    out.push(StartupEntry {
                        id: format!("{loc}|{}", e.path().to_string_lossy()),
                        name,
                        command: e.path().to_string_lossy().to_string(),
                        location: format!("Startup folder · {}", scope.as_deref().unwrap_or_default()),
                        removable: loc == "folder",
                    });
                }
            }
        }
    }

    out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    out
}

/// Remove one autorun entry. `id` is `location|name` as produced by startup_list.
pub fn startup_remove(id: &str) -> Result<(), String> {
    let (loc, rest) = id.split_once('|').ok_or("bad entry id")?;
    match loc {
        "hkcu-run" => {
            // rest = "Run|name" or "RunOnce|name"
            let (sub, name) = rest.split_once('|').ok_or("bad entry id")?;
            let sub_full = format!("Software\\Microsoft\\Windows\\CurrentVersion\\{sub}");
            #[cfg(windows)]
            {
                use windows_sys::Win32::System::Registry::{
                    RegDeleteValueW, RegOpenKeyExW, KEY_SET_VALUE, HKEY_CURRENT_USER,
                };
                let sub_w: Vec<u16> = sub_full.encode_utf16().chain(std::iter::once(0)).collect();
                let mut name_w: Vec<u16> = name.encode_utf16().chain(std::iter::once(0)).collect();
                let mut hkey = std::ptr::null_mut();
                let rc = unsafe { RegOpenKeyExW(HKEY_CURRENT_USER, sub_w.as_ptr(), 0, KEY_SET_VALUE, &mut hkey) };
                if rc != 0 {
                    return Err("cannot open registry key".into());
                }
                let rc = unsafe { RegDeleteValueW(hkey, name_w.as_mut_ptr()) };
                let _ = rc;
                if rc != 0 {
                    return Err("delete failed — value may be protected".into());
                }
                Ok(())
            }
            #[cfg(not(windows))]
            {
                let _ = (sub_full, name);
                Err("Windows only".into())
            }
        }
        "folder" => {
            let p = PathBuf::from(rest);
            if p.exists() {
                fs::remove_file(&p).map_err(|e| e.to_string())
            } else {
                Ok(())
            }
        }
        _ => Err("this entry needs administrator rights (HKLM)".into()),
    }
}
