use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::Ordering;
use std::time::UNIX_EPOCH;

use rayon::prelude::*;
use sha2::{Digest, Sha256};
use tauri::Emitter;

use crate::state::AppState;
use crate::types::{DuplicateFile, DuplicateGroup, ScanProgress};

const MIN_SIZE: u64 = 1024 * 1024; // 1 MB
const MAX_FILES: u64 = 250_000;
const TIME_BUDGET_MS: u128 = 120_000;
const FULL_HASH_CAP: usize = 10; // max files fully hashed per candidate group

fn scan_roots() -> Vec<PathBuf> {
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
    for extra in ["D:\\", "E:\\"] {
        let p = PathBuf::from(extra);
        if p.is_dir() {
            roots.push(p);
        }
    }
    roots
}

fn mtime(p: &std::path::Path) -> u64 {
    fs::metadata(p)
        .and_then(|m| m.modified())
        .map(|t| {
            t.duration_since(UNIX_EPOCH)
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0)
        })
        .unwrap_or(0)
}

fn partial_hash(p: &std::path::Path) -> Option<[u8; 32]> {
    use std::io::{Read, Seek, SeekFrom};
    let mut f = fs::File::open(p).ok()?;
    let mut head = vec![0u8; 64 * 1024];
    let n1 = f.read(&mut head).ok()?;
    let mut mid = vec![0u8; 64 * 1024];
    // also sample from the middle and the tail for cheap uniqueness
    let len = f.metadata().ok()?.len();
    if len > 512 * 1024 {
        let _ = f.seek(SeekFrom::Start(len / 2));
        let _ = f.read(&mut mid);
    }
    let mut tail = vec![0u8; 64 * 1024];
    if len > 256 * 1024 {
        let _ = f.seek(SeekFrom::Start(len.saturating_sub(256 * 1024)));
        let _ = f.read(&mut tail);
    }
    let mut h = Sha256::new();
    h.update(&head[..n1]);
    if n1 == 64 * 1024 {
        h.update(&mid);
        h.update(&tail);
    }
    Some(h.finalize().into())
}

fn full_hash(p: &std::path::Path) -> Option<[u8; 32]> {
    use std::io::Read;
    let mut f = fs::File::open(p).ok()?;
    let mut h = Sha256::new();
    let mut buf = vec![0u8; 512 * 1024];
    loop {
        let n = f.read(&mut buf).ok()?;
        if n == 0 {
            break;
        }
        h.update(&buf[..n]);
    }
    Some(h.finalize().into())
}

struct HashJob {
    path: PathBuf,
    partial: Option<[u8; 32]>,
}

pub fn find_duplicates(app: &tauri::AppHandle, state: &AppState, task_id: &str) -> Result<Vec<DuplicateGroup>, String> {
    use crate::logs;
    let started = std::time::Instant::now();
    state.dup_cancel.store(false, Ordering::Relaxed);
    logs::t_info(app, task_id, "DEDUP", "content-aware duplicate hunt initiated");

    let roots = scan_roots();
    for r in &roots {
        logs::t_dim(app, task_id, "DEDUP", format!("root locked :: {}", r.display()));
    }
    logs::t_info(app, task_id, "DEDUP", format!("pass 1 — size index over {} roots (files >= 1 MB)", roots.len()));

    // pass 1: collect files >= 1MB grouped by size
    let mut by_size: HashMap<u64, Vec<PathBuf>> = HashMap::new();
    let mut processed: u64 = 0;
    let total_budget: u64 = 40_000;
    let mut last_emit = std::time::Instant::now() - std::time::Duration::from_secs(1);

    let mut stack: Vec<PathBuf> = roots;
    while let Some(dir) = stack.pop() {
        if state.dup_cancel.load(Ordering::Relaxed) {
            logs::t_warn(app, task_id, "DEDUP", "cancelled by operator");
            return Err("cancelled".into());
        }
        if started.elapsed().as_millis() > TIME_BUDGET_MS {
            logs::t_warn(app, task_id, "DEDUP", "time budget reached — returning partial results");
            break;
        }
        match fs::read_dir(&dir) {
            Ok(rd) => {
                for entry in rd.flatten() {
                    processed += 1;
                    let path = entry.path();
                    let path_str = path.to_string_lossy().to_string();
                    match entry.file_type() {
                        Ok(ft) if ft.is_dir() => {
                            let name = path
                                .file_name()
                                .map(|n| n.to_string_lossy().to_lowercase())
                                .unwrap_or_default();
                            if !name.starts_with('$')
                                && name != "windows"
                                && name != "program files"
                                && name != "program files (x86)"
                                && name != "appdata"
                            {
                                stack.push(path);
                            }
                        }
                        Ok(ft) if ft.is_file() => {
                            let len = entry.metadata().map(|m| m.len()).unwrap_or(0);
                            if len >= MIN_SIZE {
                                by_size.entry(len).or_default().push(path);
                            }
                        }
                        _ => {}
                    }
                    // throttled progress emit
                    if last_emit.elapsed().as_millis() > 90 {
                        last_emit = std::time::Instant::now();
                        let _ = app.emit(
                            "dup://progress",
                            ScanProgress {
                                phase: "scanning".into(),
                                current_path: path_str.clone(),
                                processed,
                                total: total_budget,
                                found_bytes: 0,
                                found_files: 0,
                            },
                        );
                    }
                    if processed > MAX_FILES {
                        break;
                    }
                }
            }
            Err(_) => continue,
        }
    }

    if state.dup_cancel.load(Ordering::Relaxed) {
        return Err("cancelled".into());
    }

    let candidates: Vec<(u64, Vec<PathBuf>)> = by_size
        .into_iter()
        .filter(|(_, v)| v.len() > 1)
        .collect();
    let cand_count: u64 = candidates.iter().map(|(_, v)| v.len() as u64).sum();
    logs::t_info(
        app,
        task_id,
        "DEDUP",
        format!(
            "pass 1 done :: {} entries walked, {} candidate files in {} size groups",
            processed, cand_count, candidates.len()
        ),
    );
    if candidates.is_empty() {
        logs::t_ok(app, task_id, "DEDUP", "no size collisions — nothing to hash, drive is clean");
        return Ok(Vec::new());
    }
    logs::t_info(app, task_id, "DEDUP", "pass 2 — parallel partial hashing (64KB head + mid + tail samples)");

    // pass 2: parallel partial hashes (rayon) over candidates
    let mut groups: Vec<DuplicateGroup> = Vec::new();
    let mut hashed = 0u64;
    let mut cache_hits = 0u64;
    let mut last_emit2 = std::time::Instant::now() - std::time::Duration::from_secs(1);

    for (size, paths) in candidates {
        if state.dup_cancel.load(Ordering::Relaxed) {
            return Err("cancelled".into());
        }
        // parallel partial hashing for this size group
        let jobs: Vec<HashJob> = paths
            .par_iter()
            .map(|p| HashJob {
                path: p.clone(),
                partial: partial_hash(p),
            })
            .collect();

        let mut by_partial: HashMap<[u8; 32], Vec<PathBuf>> = HashMap::new();
        for job in jobs {
            if let Some(h) = job.partial {
                by_partial.entry(h).or_default().push(job.path);
            }
            hashed += 1;
        }

        for (_ph, ppaths) in by_partial {
            if ppaths.len() < 2 {
                continue;
            }
            // verify with full hash (session cache + parallel)
            let keys: Vec<String> = ppaths
                .iter()
                .map(|p| {
                    let mt = mtime(p);
                    format!("{}|{}|{}", p.to_string_lossy(), size, mt)
                })
                .collect();
            let cached: HashMap<usize, String> = {
                let cache = state.hash_cache.lock().unwrap();
                keys.iter()
                    .enumerate()
                    .filter_map(|(i, k)| cache.get(k).cloned().map(|v| (i, v)))
                    .collect()
            };

            let to_hash: Vec<usize> = (0..ppaths.len())
                .take(FULL_HASH_CAP)
                .filter(|i| !cached.contains_key(i))
                .collect();

            let computed: Vec<(usize, String)> = to_hash
                .par_iter()
                .filter_map(|i| full_hash(&ppaths[*i]).map(|h| (*i, hex(&h))))
                .collect();

            {
                let mut cache = state.hash_cache.lock().unwrap();
                if cache.len() > 30_000 {
                    cache.clear();
                }
                for (i, h) in &computed {
                    cache.insert(keys[*i].clone(), h.clone());
                }
            }
            cache_hits += cached.len() as u64;

            let mut by_full: HashMap<String, Vec<usize>> = HashMap::new();
            for (i, h) in cached {
                by_full.entry(h).or_default().push(i);
            }
            for (i, h) in computed {
                by_full.entry(h).or_default().push(i);
            }

            for (fh, idxs) in by_full {
                if idxs.len() < 2 {
                    continue;
                }
                let files: Vec<DuplicateFile> = idxs
                    .iter()
                    .map(|i| DuplicateFile {
                        path: ppaths[*i].to_string_lossy().to_string(),
                        bytes: size,
                        modified: mtime(&ppaths[*i]),
                    })
                    .collect();
                let wasted = size * (files.len() as u64 - 1);
                groups.push(DuplicateGroup {
                    id: format!("g{:x}", fnv1a(&fh)),
                    hash: fh.clone(),
                    files,
                    wasted_bytes: wasted,
                });
            }
        }

        if last_emit2.elapsed().as_millis() > 90 {
            last_emit2 = std::time::Instant::now();
            let _ = app.emit(
                "dup://progress",
                ScanProgress {
                    phase: "analyzing".into(),
                    current_path: format!("hashing candidate set ({} hashed)", hashed),
                    processed: processed,
                    total: total_budget,
                    found_bytes: 0,
                    found_files: groups.len() as u64,
                },
            );
        }
    }

    groups.sort_by(|a, b| b.wasted_bytes.cmp(&a.wasted_bytes));
    groups.truncate(40);
    let wasted: u64 = groups.iter().map(|g| g.wasted_bytes).sum();

    // detailed result block for the task log
    for (i, g) in groups.iter().take(5).enumerate() {
        if let Some(first) = g.files.first() {
            logs::t_dim(
                app,
                task_id,
                "DEDUP",
                format!(
                    "group {} :: {} copies · {} wasted · {}",
                    i + 1,
                    g.files.len(),
                    fmt_bytes(g.wasted_bytes),
                    first.path
                ),
            );
        }
    }
    logs::t_ok(
        app,
        task_id,
        "DEDUP",
        format!(
            "hunt complete :: {} groups, {} wasted, {} partial hashes, {} cache hits, {:.1}s",
            groups.len(),
            fmt_bytes(wasted),
            hashed,
            cache_hits,
            started.elapsed().as_millis() as f64 / 1000.0
        ),
    );
    Ok(groups)
}

fn fmt_bytes(n: u64) -> String {
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

fn fnv1a(s: &str) -> u64 {
    let mut h: u64 = 0xcbf29ce484222325;
    for b in s.as_bytes() {
        h ^= *b as u64;
        h = h.wrapping_mul(0x100000001b3);
    }
    h
}

fn hex(h: &[u8; 32]) -> String {
    h.iter().map(|b| format!("{:02x}", b)).collect()
}
