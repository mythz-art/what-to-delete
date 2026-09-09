import type {
  AppSettings,
  DirListing,
  DuplicateGroup,
  FeedbackResponse,
  FileEntry,
  FileOpResult,
  FinderItem,
  FtpStats,
  InstalledApp,
  ItemProps,
  LogEntry,
  RecycleBinStats,
  ScanProgress,
  ScanReport,
  SystemStatus,
  ToolInfo,
  ToolResult,
  TransferItem,
  TunnelStatus,
  VaultItem,
} from "@/lib/types";
import { mockEngine } from "@/lib/mock/engine";

export const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export interface Api {
  getSystemStatus(): Promise<SystemStatus>;
  getSettings(): Promise<AppSettings>;
  saveSettings(s: AppSettings): Promise<void>;

  startScan(): { promise: Promise<ScanReport>; cancel: () => void };
  onScanProgress(cb: (p: ScanProgress) => void): () => void;
  cleanItems(ids: string[]): Promise<{ freedBytes: number }>;

  findDuplicates(): { promise: Promise<DuplicateGroup[]>; cancel: () => void };
  onDuplicateProgress(cb: (p: ScanProgress) => void): () => void;
  removeDuplicates(removedPaths: string[]): Promise<{ freedBytes: number }>;

  listTools(): Promise<ToolInfo[]>;
  runTool(toolId: string): Promise<ToolResult>;

  sendFeedback(message: string, rating: string): Promise<FeedbackResponse>;

  vaultUnlock(passphrase: string): Promise<boolean>;
  vaultLock(): Promise<void>;
  vaultList(): Promise<VaultItem[]>;
  vaultAdd(names: string[]): Promise<VaultItem[]>;
  vaultRemove(id: string): Promise<void>;

  // logs / hacker terminal
  onLogLine(cb: (l: LogEntry) => void): () => void;
  getLogBuffer(limit?: number): Promise<LogEntry[]>;

  // share: http + ftp + public tunnel
  shareHttpStart(port: number): Promise<{ url: string }>;
  shareHttpStop(): Promise<void>;
  shareFtpStart(cfg: {
    port: number;
    root?: string;
    anonymous?: boolean;
    user?: string;
    pass?: string;
  }): Promise<{ port: number; host: string }>;
  shareFtpStop(): Promise<void>;
  shareFtpStatus(): Promise<FtpStats>;
  tunnelStart(cfg: { method: string; port?: number; customUrl?: string }): Promise<void>;
  tunnelStop(): Promise<void>;
  tunnelStatus(): Promise<TunnelStatus>;
  startTransfer(items: { name: string; bytes: number; mode: "p2p" | "http" | "ftp"; peer: string }[]): void;
  onTransfers(cb: (t: TransferItem[]) => void): () => void;
  cancelTransfer(id: string): void;

  // file manager
  filesList(path: string): Promise<DirListing>;
  filesRoots(): Promise<FileEntry[]>;
  filesMkdir(parent: string, name: string): Promise<string>;
  filesRename(path: string, newName: string): Promise<string>;
  filesCopy(paths: string[], dest: string): Promise<FileOpResult>;
  filesMove(paths: string[], dest: string): Promise<FileOpResult>;
  filesDelete(paths: string[]): Promise<FileOpResult>;
  filesProps(path: string): Promise<ItemProps>;
  filesSearch(root: string, query: string, max?: number): Promise<FileEntry[]>;
  filesOpen(path: string): Promise<boolean>;

  // finders
  finderLargeFiles(roots?: string[], minMb?: number): Promise<FinderItem[]>;
  finderOldFiles(roots?: string[], days?: number, minMb?: number): Promise<FinderItem[]>;
  finderEmptyDirs(root?: string): Promise<FinderItem[]>;
  finderRecycleBin(): Promise<RecycleBinStats>;
  finderEmptyRecycleBin(): Promise<boolean>;
  finderInstalledApps(): Promise<InstalledApp[]>;

  windowMinimize(): void;
  windowToggleMaximize(): void;
  windowClose(): void;

  // terminal window controls (detached hacker terminal)
  terminalWindowShow(): void;
  terminalWindowHide(): void;
  isTerminalWindow(): boolean;
  terminalWindowFullscreen(): void;
  terminalWindowDrag(): void;
}

/** Real Tauri IPC adapter — used when running inside the desktop shell. */
function createRealApi(): Api {
  type Unlisten = () => void;

  const invoke = async <T>(cmd: string, args?: Record<string, unknown>): Promise<T> => {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<T>(cmd, args);
  };

  const makeListener = <T>(event: string, cb: (p: T) => void): (() => void) => {
    let stop: Unlisten | null = null;
    let stopped = false;
    void import("@tauri-apps/api/event").then(({ listen }) =>
      listen<T>(event, (e) => cb(e.payload)).then((u) => {
        if (stopped) u();
        else stop = u;
      }),
    );
    return () => {
      stopped = true;
      stop?.();
    };
  };

  return {
    getSystemStatus: () => invoke<SystemStatus>("get_system_status"),
    getSettings: () => invoke<AppSettings>("get_settings"),
    saveSettings: (s) => invoke<void>("save_settings", { settings: s }),

    startScan: () => ({
      promise: invoke<ScanReport>("scan_start"),
      cancel: () => void invoke("scan_cancel"),
    }),
    onScanProgress: (cb) => makeListener<ScanProgress>("scan://progress", cb),
    cleanItems: (ids) => invoke<{ freedBytes: number }>("clean_items", { ids }),

    findDuplicates: () => ({
      promise: invoke<DuplicateGroup[]>("duplicates_start"),
      cancel: () => void invoke("duplicates_cancel"),
    }),
    onDuplicateProgress: (cb) => makeListener<ScanProgress>("dup://progress", cb),
    removeDuplicates: (removedPaths) =>
      invoke<{ freedBytes: number }>("remove_duplicates", { removedPaths }),

    listTools: () => invoke<ToolInfo[]>("list_tools"),
    runTool: (toolId) => invoke<ToolResult>("run_tool", { toolId }),

    sendFeedback: (message, rating) =>
      invoke<FeedbackResponse>("send_feedback", { message, rating }),

    vaultUnlock: (passphrase) => invoke<boolean>("vault_unlock", { passphrase }),
    vaultLock: () => invoke<void>("vault_lock"),
    vaultList: () => invoke<VaultItem[]>("vault_list"),
    vaultAdd: (names) => invoke<VaultItem[]>("vault_add", { names }),
    vaultRemove: (id) => invoke<void>("vault_remove", { id }),

    onLogLine: (cb) => makeListener<LogEntry>("log://line", cb),
    getLogBuffer: (limit) => invoke<LogEntry[]>("get_log_buffer", { limit }),

    shareHttpStart: (port) => invoke<{ url: string }>("share_http_start", { port }),
    shareHttpStop: () => invoke<void>("share_http_stop"),
    shareFtpStart: (cfg) => invoke<{ port: number; host: string }>("share_ftp_start", { cfg }),
    shareFtpStop: () => invoke<void>("share_ftp_stop"),
    shareFtpStatus: () => invoke<FtpStats>("share_ftp_status"),
    tunnelStart: (cfg) => invoke<void>("tunnel_start", { cfg }),
    tunnelStop: () => invoke<void>("tunnel_stop"),
    tunnelStatus: () => invoke<TunnelStatus>("tunnel_status"),
    startTransfer: (items) => void invoke("transfer_start", { items }),
    onTransfers: (cb) => makeListener<TransferItem[]>("transfer://progress", cb),
    cancelTransfer: (id) => void invoke("transfer_cancel", { id }),

    filesList: (path) => invoke<DirListing>("files_list", { path }),
    filesRoots: () => invoke<FileEntry[]>("files_roots"),
    filesMkdir: (parent, name) => invoke<string>("files_mkdir", { parent, name }),
    filesRename: (path, newName) => invoke<string>("files_rename", { path, newName }),
    filesCopy: (paths, dest) => invoke<FileOpResult>("files_copy", { paths, dest }),
    filesMove: (paths, dest) => invoke<FileOpResult>("files_move", { paths, dest }),
    filesDelete: (paths) => invoke<FileOpResult>("files_delete", { paths }),
    filesProps: (path) => invoke<ItemProps>("files_props", { path }),
    filesSearch: (root, query, max) => invoke<FileEntry[]>("files_search", { root, query, max }),
    filesOpen: (path) => invoke<boolean>("files_open", { path }),

    finderLargeFiles: (roots, minMb) => invoke<FinderItem[]>("finder_large_files", { roots, minMb }),
    finderOldFiles: (roots, days, minMb) => invoke<FinderItem[]>("finder_old_files", { roots, days, minMb }),
    finderEmptyDirs: (root) => invoke<FinderItem[]>("finder_empty_dirs", { root }),
    finderRecycleBin: () => invoke<RecycleBinStats>("finder_recycle_bin"),
    finderEmptyRecycleBin: () => invoke<boolean>("finder_empty_recycle_bin"),
    finderInstalledApps: () => invoke<InstalledApp[]>("finder_installed_apps"),

    windowMinimize: () => {
      void import("@tauri-apps/api/window").then((m) => m.getCurrentWindow().minimize());
    },
    windowToggleMaximize: () => {
      void import("@tauri-apps/api/window").then((m) => m.getCurrentWindow().toggleMaximize());
    },
    windowClose: () => {
      void import("@tauri-apps/api/window").then((m) => m.getCurrentWindow().close());
    },

    terminalWindowShow: () => {
      void import("@tauri-apps/api/webviewWindow").then(async (m) => {
        const win = await m.WebviewWindow.getByLabel("terminal");
        if (win) {
          await win.show();
          await win.setFocus();
        }
      });
    },
    terminalWindowHide: () => {
      void import("@tauri-apps/api/webviewWindow").then(async (m) => {
        const win = await m.WebviewWindow.getByLabel("terminal");
        if (win) await win.hide();
      });
    },
    isTerminalWindow: () =>
      typeof window !== "undefined" && window.location.hash.includes("terminal"),
    terminalWindowFullscreen: () => {
      void import("@tauri-apps/api/window").then(async (m) => {
        const w = m.getCurrentWindow();
        const fs = await w.isFullscreen();
        await w.setFullscreen(!fs);
      });
    },
    terminalWindowDrag: () => {
      void import("@tauri-apps/api/window").then((m) => m.getCurrentWindow().startDragging());
    },
  };
}

export const api: Api = isTauri ? createRealApi() : (mockEngine as unknown as Api);
