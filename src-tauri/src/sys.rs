use std::path::Path;

use fs2::{available_space, total_space};
use windows_sys::Win32::Storage::FileSystem::{
    GetDiskFreeSpaceExW, GetDriveTypeW, GetLogicalDrives, GetVolumeInformationW,
};
use windows_sys::Win32::System::SystemInformation::{GlobalMemoryStatusEx, MEMORYSTATUSEX};

use crate::state::AppState;
use crate::types::{DriveInfo, RamInfo, SystemStatus};

const DRIVE_REMOVABLE: u32 = 2;
const DRIVE_FIXED: u32 = 3;

fn utf16(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

pub fn list_drives() -> Vec<DriveInfo> {
    let mut drives = Vec::new();
    let mask = unsafe { GetLogicalDrives() };
    if mask == 0 {
        return drives;
    }
    for i in 0..26u32 {
        if mask & (1 << i) == 0 {
            continue;
        }
        let letter = char::from(b'A' + i as u8);
        let root = format!("{}:\\", letter);
        let root_w: Vec<u16> = utf16(&root);

        let dtype = unsafe { GetDriveTypeW(root_w.as_ptr()) };
        if dtype != DRIVE_FIXED && dtype != DRIVE_REMOVABLE {
            continue;
        }

        // volume label + filesystem name
        let mut name_buf = [0u16; 261];
        let mut fs_buf = [0u16; 33];
        let mut serial = 0u32;
        let mut max_comp = 0u32;
        let mut flags = 0u32;
        let _ = unsafe {
            GetVolumeInformationW(
                root_w.as_ptr(),
                name_buf.as_mut_ptr(),
                name_buf.len() as u32,
                &mut serial,
                &mut max_comp,
                &mut flags,
                fs_buf.as_mut_ptr(),
                fs_buf.len() as u32,
            )
        };
        let label: String = name_buf
            .iter()
            .take_while(|&&c| c != 0)
            .map(|&c| char::from_u32(c as u32).unwrap_or(' '))
            .collect();
        let label = if label.is_empty() {
            "Local Disk".to_string()
        } else {
            label
        };
        let fs_type: String = fs_buf
            .iter()
            .take_while(|&&c| c != 0)
            .map(|&c| char::from_u32(c as u32).unwrap_or(' '))
            .collect();

        // capacity via GetDiskFreeSpaceExW
        let mut free: u64 = 0;
        let mut total: u64 = 0;
        let _ = unsafe {
            GetDiskFreeSpaceExW(
                root_w.as_ptr(),
                &mut free,
                &mut total,
                &mut std::mem::zeroed(),
            )
        };
        if total == 0 {
            let p = Path::new(&root);
            total = total_space(p).unwrap_or(0);
            free = available_space(p).unwrap_or(0);
        }

        let kind = match dtype {
            DRIVE_REMOVABLE => "hdd",
            _ => "ssd",
        };

        drives.push(DriveInfo {
            letter: format!("{}:", letter),
            label,
            kind: kind.to_string(),
            total_bytes: total,
            used_bytes: total.saturating_sub(free),
            fs_type,
        });
    }
    drives
}

pub fn ram_info() -> RamInfo {
    let mut st: MEMORYSTATUSEX = unsafe { std::mem::zeroed() };
    st.dwLength = std::mem::size_of::<MEMORYSTATUSEX>() as u32;
    let ok = unsafe { GlobalMemoryStatusEx(&mut st) };
    if ok == 0 {
        return RamInfo { total_bytes: 0, used_bytes: 0 };
    }
    RamInfo {
        total_bytes: st.ullTotalPhys as u64,
        used_bytes: (st.ullTotalPhys - st.ullAvailPhys) as u64,
    }
}

pub fn os_name() -> String {
    // Windows product name from the registry would need more plumbing; use the
    // documented RtlGetVersion shape via kernel32's GetVersionExW substitute:
    // we keep it simple and descriptive.
    let mut name = String::new();
    if let Ok(os) = std::env::var("OS") {
        name.push_str(&os);
    }
    if let Ok(cs) = std::env::var("NUMBER_OF_PROCESSORS") {
        name.push_str(&format!(" · {cs} cores"));
    }
    if name.is_empty() {
        name = "Windows".into();
    }
    name
}

pub fn computer_name() -> String {
    std::env::var("COMPUTERNAME").unwrap_or_else(|_| "localhost".into())
}

pub fn system_status(state: &AppState) -> SystemStatus {
    let drives = list_drives();
    let ram = ram_info();

    // health score from the OS drive pressure + reclaimable junk + RAM pressure
    let os = drives
        .iter()
        .find(|d| d.letter == "C:")
        .or_else(|| drives.first());
    let used_pct = os
        .map(|d| if d.total_bytes > 0 { (d.used_bytes * 100) / d.total_bytes } else { 0 })
        .unwrap_or(50);
    let ram_pct = if ram.total_bytes > 0 {
        (ram.used_bytes * 100) / ram.total_bytes
    } else {
        0
    };
    let reclaimable = state
        .scan_session
        .lock()
        .map(|s| s.iter().map(|i| i.bytes).sum())
        .unwrap_or(0);
    let reclaim_gb = reclaimable / (1024 * 1024 * 1024);
    let score = 100u64
        .saturating_sub((used_pct.saturating_sub(45)) / 2)
        .saturating_sub(reclaim_gb.min(10))
        .saturating_sub(ram_pct.saturating_sub(80) / 8)
        .clamp(25, 97);

    SystemStatus {
        drives,
        health_score: score,
        last_scan_at: *state.last_scan_at.lock().unwrap(),
        reclaimable_bytes: reclaimable,
        ram: Some(ram),
        os_name: os_name(),
    }
}
