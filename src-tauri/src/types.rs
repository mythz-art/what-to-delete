use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DriveInfo {
    pub letter: String,
    pub label: String,
    pub kind: String,
    pub total_bytes: u64,
    pub used_bytes: u64,
    #[serde(default)]
    pub fs_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RamInfo {
    pub total_bytes: u64,
    pub used_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemStatus {
    pub drives: Vec<DriveInfo>,
    pub health_score: u64,
    pub last_scan_at: Option<u64>,
    pub reclaimable_bytes: u64,
    #[serde(default)]
    pub ram: Option<RamInfo>,
    #[serde(default)]
    pub os_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JunkCategory {
    pub id: String,
    pub name: String,
    pub description: String,
    pub bytes: u64,
    pub file_count: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub risky: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JunkItem {
    pub id: String,
    pub path: String,
    pub bytes: u64,
    pub category: String,
    pub modified: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanProgress {
    pub phase: String,
    pub current_path: String,
    pub processed: u64,
    pub total: u64,
    pub found_bytes: u64,
    pub found_files: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanReport {
    pub categories: Vec<JunkCategory>,
    pub items: Vec<JunkItem>,
    pub total_bytes: u64,
    pub total_files: u64,
    pub duration_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateFile {
    pub path: String,
    pub bytes: u64,
    pub modified: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateGroup {
    pub id: String,
    pub hash: String,
    pub files: Vec<DuplicateFile>,
    pub wasted_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolInfo {
    pub id: String,
    pub name: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolResult {
    pub tool_id: String,
    pub found: u64,
    pub bytes: u64,
    pub note: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferItem {
    pub id: String,
    pub name: String,
    pub bytes: u64,
    pub transferred: u64,
    pub speed: u64,
    pub mode: String,
    pub state: String,
    pub peer: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    #[serde(default)]
    pub launch_at_startup: bool,
    #[serde(default = "default_true")]
    pub confirm_before_clean: bool,
    #[serde(default = "default_true")]
    pub use_recycle_bin: bool,
    #[serde(default)]
    pub exclude_paths: Vec<String>,
    #[serde(default = "default_port")]
    pub share_port: u16,
    #[serde(default = "default_autolock")]
    pub vault_auto_lock_min: u32,
    #[serde(default = "default_ftp_port")]
    pub ftp_port: u16,
    #[serde(default = "default_tunnel_method")]
    pub tunnel_method: String,
}

fn default_true() -> bool {
    true
}
fn default_port() -> u16 {
    8080
}
fn default_autolock() -> u32 {
    15
}
fn default_ftp_port() -> u16 {
    2121
}
fn default_tunnel_method() -> String {
    "localhostrun".into()
}

impl Default for AppSettings {
    fn default() -> Self {
        AppSettings {
            launch_at_startup: false,
            confirm_before_clean: true,
            use_recycle_bin: true,
            exclude_paths: vec![],
            share_port: 8080,
            vault_auto_lock_min: 15,
            ftp_port: 2121,
            tunnel_method: "localhostrun".into(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultItem {
    pub id: String,
    pub name: String,
    pub bytes: u64,
    pub added_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FeedbackResponse {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub unlock_token: Option<String>,
}

/* ============================== v2.1 additions ============================== */

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogEntry {
    pub t: u64,
    pub level: String,
    pub tag: String,
    pub msg: String,
    /// owning task id — set when the line belongs to a tracked task
    #[serde(skip_serializing_if = "Option::is_none")]
    pub task: Option<String>,
}

/* ============================== v2.2 additions ============================== */

/// One tab in the multi-tab terminal: a tracked unit of work with its own
/// isolated log stream (scan / dedup / clean / tool / transfer …).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskInfo {
    pub id: String,
    /// scan | dedup | clean | tool | transfer | vault
    pub kind: String,
    pub title: String,
    /// running | done | error | cancelled
    pub state: String,
    pub started_at: u64,
    pub ended_at: Option<u64>,
    /// one-line result summary shown on the finished tab
    pub summary: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledApp {
    pub name: String,
    pub version: String,
    pub publisher: String,
    pub bytes: u64,
    pub install_location: String,
    pub uninstall_string: String,
}

/* ============================== v2.3 power tools ============================== */

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FtpStats {
    pub running: bool,
    pub port: u16,
    /// LAN host address clients should connect to
    #[serde(default)]
    pub host: String,
    pub root: String,
    pub anonymous: bool,
    pub sessions_total: u64,
    pub sessions_active: u64,
    pub bytes_out: u64,
    pub bytes_in: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpStats {
    pub running: bool,
    pub port: u16,
    pub url: String,
    pub peers_served: u64,
    pub downloads: u64,
    pub bytes_out: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderSize {
    pub path: String,
    pub bytes: u64,
    pub files: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PathAuditEntry {
    pub path: String,
    pub exists: bool,
    pub duplicate: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PathAuditReport {
    pub total_count: u32,
    pub missing_count: u32,
    pub duplicate_count: u32,
    pub entries: Vec<PathAuditEntry>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HashResult {
    pub algo: String,
    pub hex: String,
    pub bytes: u64,
    pub ms: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartupEntry {
    /// stable removal handle: "<location>|<name-or-path>"
    pub id: String,
    pub name: String,
    pub command: String,
    pub location: String,
    pub removable: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TunnelStatus {
    pub method: String,
    pub state: String, // stopped | starting | active | error
    pub public_url: Option<String>,
    pub detail: String,
    pub started_at: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub bytes: u64,
    pub modified: u64,
    pub hidden: bool,
    pub readonly: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirListing {
    pub path: String,
    pub parent: Option<String>,
    pub entries: Vec<FileEntry>,
    pub total: u64,
    pub truncated: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemProps {
    pub path: String,
    pub name: String,
    pub is_dir: bool,
    pub bytes: u64,
    pub file_count: u64,
    pub dir_count: u64,
    pub modified: u64,
    pub created: u64,
    pub readonly: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileOpResult {
    pub ok: bool,
    pub affected: u64,
    pub freed_bytes: u64,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FinderItem {
    pub path: String,
    pub bytes: u64,
    pub modified: u64,
    pub extra: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecycleBinStats {
    pub count: u64,
    pub bytes: u64,
}
