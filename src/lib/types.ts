export type ShareMode = "p2p" | "http" | "ftp";

export interface DriveInfo {
  letter: string;
  label: string;
  kind: "nvme" | "ssd" | "hdd";
  totalBytes: number;
  usedBytes: number;
  fsType?: string;
}

export interface RamInfo {
  totalBytes: number;
  usedBytes: number;
}

export interface SystemStatus {
  drives: DriveInfo[];
  healthScore: number;
  lastScanAt: number | null;
  reclaimableBytes: number;
  ram?: RamInfo;
  osName?: string;
}

export type JunkCategoryId = "system" | "temp" | "browser" | "recycle" | "updates" | "logs";

export interface JunkCategory {
  id: JunkCategoryId;
  name: string;
  description: string;
  bytes: number;
  fileCount: number;
  risky?: boolean;
}

export interface JunkItem {
  id: string;
  path: string;
  bytes: number;
  category: JunkCategoryId;
  modified: number;
}

export type ScanPhase = "idle" | "scanning" | "analyzing" | "cleaning" | "done" | "cancelled";

export interface ScanProgress {
  phase: ScanPhase;
  currentPath: string;
  processed: number;
  total: number;
  foundBytes: number;
  foundFiles: number;
}

export interface ScanReport {
  categories: JunkCategory[];
  items: JunkItem[];
  totalBytes: number;
  totalFiles: number;
  durationMs: number;
}

export interface DuplicateFile {
  path: string;
  bytes: number;
  modified: number;
}

export interface DuplicateGroup {
  id: string;
  hash: string;
  files: DuplicateFile[];
  wastedBytes: number;
}

export interface ToolResult {
  toolId: string;
  found: number;
  bytes: number;
  note: string;
}

export interface ToolInfo {
  id: string;
  name: string;
  description: string;
}

export interface TransferItem {
  id: string;
  name: string;
  bytes: number;
  transferred: number;
  speed: number;
  mode: ShareMode;
  state: "queued" | "active" | "done" | "error";
  peer: string;
}

export interface AppSettings {
  launchAtStartup: boolean;
  confirmBeforeClean: boolean;
  useRecycleBin: boolean;
  excludePaths: string[];
  sharePort: number;
  vaultAutoLockMin: number;
  ftpPort: number;
  tunnelMethod: string;
}

export interface VaultItem {
  id: string;
  name: string;
  bytes: number;
  addedAt: number;
}

export interface FeedbackResponse {
  ok: boolean;
  unlockToken?: string;
}

export type PageId =
  | "dashboard"
  | "cleanup"
  | "duplicates"
  | "files"
  | "share"
  | "tools"
  | "settings"
  | "vault"
  | "about";

export interface NavContext {
  category?: JunkCategoryId;
  toolId?: string;
  explorerPath?: string;
  filesTab?: string;
}

/* ============================== v2.1 additions ============================== */

export type LogLevel = "info" | "ok" | "warn" | "error" | "dim";

export interface LogEntry {
  t: number;
  level: LogLevel;
  tag: string;
  msg: string;
  /** owning task id — set when the line belongs to a tracked task */
  task?: string;
}

/* ============================== v2.2 additions ============================== */

export type TaskKind = "scan" | "dedup" | "clean" | "tool" | "transfer" | "vault";
export type TaskState = "running" | "done" | "error" | "cancelled";

/** One tab in the multi-tab terminal: a tracked unit of work with its own log stream. */
export interface TaskInfo {
  id: string;
  kind: TaskKind | string;
  title: string;
  state: TaskState | string;
  startedAt: number;
  endedAt?: number | null;
  summary?: string | null;
}

export interface FtpStats {
  running: boolean;
  port: number;
  root: string;
  anonymous: boolean;
  sessionsTotal: number;
  sessionsActive: number;
  bytesOut: number;
  bytesIn: number;
}

export interface TunnelStatus {
  method: string;
  state: "stopped" | "starting" | "active" | "error";
  publicUrl: string | null;
  detail: string;
  startedAt: number | null;
}

export interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
  bytes: number;
  modified: number;
  hidden: boolean;
  readonly: boolean;
}

export interface DirListing {
  path: string;
  parent: string | null;
  entries: FileEntry[];
  total: number;
  truncated: boolean;
}

export interface ItemProps {
  path: string;
  name: string;
  isDir: boolean;
  bytes: number;
  fileCount: number;
  dirCount: number;
  modified: number;
  created: number;
  readonly: boolean;
}

export interface FileOpResult {
  ok: boolean;
  affected: number;
  freedBytes: number;
  error?: string;
}

export interface FinderItem {
  path: string;
  bytes: number;
  modified: number;
  extra: string;
}

export interface RecycleBinStats {
  count: number;
  bytes: number;
}

export interface InstalledApp {
  name: string;
  version: string;
  publisher: string;
  bytes: number;
  installLocation: string;
  uninstallString: string;
}
