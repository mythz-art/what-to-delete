import type {
  AppSettings,
  DirListing,
  DuplicateGroup,
  FeedbackResponse,
  FileEntry,
  FileOpResult,
  FinderItem,
  FolderSize,
  FtpStats,
  HashResult,
  HttpStats,
  InstalledApp,
  ItemProps,
  JunkCategory,
  JunkItem,
  LogEntry,
  PathAuditReport,
  RecycleBinStats,
  ScanProgress,
  ScanReport,
  ShareMode,
  StartupEntry,
  SystemStatus,
  TaskInfo,
  ToolInfo,
  ToolResult,
  TransferItem,
  TunnelStatus,
  VaultItem,
} from "@/lib/types";
import {
  CATEGORY_META,
  DRIVES,
  DUPLICATE_GROUPS,
  EMPTY_DIRS,
  INSTALLED_APPS,
  JUNK_ITEMS,
  LARGE_FILES,
  MOCK_FTP_STATS,
  MOCK_TUNNEL,
  OLD_FILES,
  OS_NAME,
  QUICK_ROOTS,
  RAM,
  RECYCLE_STATS,
  SCAN_PATHS,
  TOOLS,
  TOOL_RESULTS,
  VAULT_ITEMS,
  mockList,
  mockSearch,
} from "@/lib/mock/data";

type Handler = (payload: unknown) => void;

class Emitter {
  private handlers = new Map<string, Set<Handler>>();

  on(event: string, handler: Handler): () => void {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(handler);
    return () => this.handlers.get(event)?.delete(handler);
  }

  emit(event: string, payload: unknown) {
    this.handlers.get(event)?.forEach((h) => h(payload));
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function aggregateCategories(items: JunkItem[]): JunkCategory[] {
  const order: JunkItem["category"][] = ["temp", "browser", "updates", "system", "recycle", "logs"];
  return order
    .map((id) => {
      const catItems = items.filter((i) => i.category === id);
      return {
        id,
        ...CATEGORY_META[id],
        bytes: catItems.reduce((s, i) => s + i.bytes, 0),
        fileCount: catItems.length,
      } satisfies JunkCategory;
    })
    .filter((c) => c.fileCount > 0);
}

/** The feedback secret code from v1.1.0 — unchanged. */
const SECRET_CODE = "1234";

export class MockEngine {
  private emitter = new Emitter();
  private settings: AppSettings = {
    launchAtStartup: false,
    confirmBeforeClean: true,
    useRecycleBin: true,
    excludePaths: ["C:\\Windows\\System32", "D:\\VMs"],
    sharePort: 8080,
    vaultAutoLockMin: 15,
    ftpPort: 2121,
    tunnelMethod: "localhostrun",
  };
  private vaultItems: VaultItem[] = [...VAULT_ITEMS];
  private vaultOpen = false;
  private junk: JunkItem[] = JUNK_ITEMS;
  private lastScanAt: number | null = Date.now() - 3_600_000 * 5;
  private transfers: TransferItem[] = [];
  private transferTimer: ReturnType<typeof setInterval> | null = null;
  private cancelled = { scan: false, dupes: false };

  // v2.1 state
  private logs: LogEntry[] = [];
  private httpRunning = false;
  private httpPort = 8080;
  private ftpStats: FtpStats = { ...MOCK_FTP_STATS };
  private tunnel: TunnelStatus = { ...MOCK_TUNNEL };
  private tunnelTimer: ReturnType<typeof setTimeout> | null = null;
  private recycle: RecycleBinStats = { ...RECYCLE_STATS };

  private log(level: LogEntry["level"], tag: string, msg: string) {
    const entry: LogEntry = { t: Date.now(), level, tag, msg };
    this.logs.push(entry);
    if (this.logs.length > 2000) this.logs.splice(0, this.logs.length - 2000);
    this.emitter.emit("log:line", entry);
  }

  // ---------- status ----------

  async getSystemStatus(): Promise<SystemStatus> {
    await sleep(300);
    const reclaimable = this.junk.reduce((s, i) => s + i.bytes, 0);
    return {
      drives: DRIVES.map((d) => ({ ...d, fsType: d.kind === "hdd" ? "NTFS" : "NTFS" })),
      healthScore: 71,
      lastScanAt: this.lastScanAt,
      reclaimableBytes: reclaimable,
      ram: { ...RAM },
      osName: OS_NAME,
    };
  }

  async getSettings(): Promise<AppSettings> {
    await sleep(120);
    return { ...this.settings };
  }

  async saveSettings(s: AppSettings): Promise<void> {
    this.settings = { ...s };
    await sleep(180);
  }

  // ---------- logs / terminal ----------

  onLogLine(cb: (l: LogEntry) => void): () => void {
    return this.emitter.on("log:line", cb as Handler);
  }

  async getLogBuffer(limit = 500): Promise<LogEntry[]> {
    await sleep(50);
    return this.logs.slice(-limit);
  }

  // ---------- v2.2: multi-task terminal ----------

  private tasks: TaskInfo[] = [];
  private taskLogs = new Map<string, LogEntry[]>();

  async getTasks(): Promise<TaskInfo[]> {
    await sleep(30);
    return [...this.tasks];
  }

  async getTaskBuffer(taskId: string, limit = 500): Promise<LogEntry[]> {
    await sleep(30);
    return (this.taskLogs.get(taskId) ?? []).slice(-limit);
  }

  onTaskUpdate(cb: (t: TaskInfo) => void): () => void {
    return this.emitter.on("task:update", cb as Handler);
  }

  onTaskLog(taskId: string, cb: (l: LogEntry) => void): () => void {
    return this.emitter.on(`task:log:${taskId}`, cb as Handler);
  }

  onFtpStatus(cb: (s: FtpStats) => void): () => void {
    return this.emitter.on("ftp:status", cb as Handler);
  }

  private mockTaskBegin(kind: string, title: string): string {
    const id = `${kind}-${Date.now()}`;
    const task: TaskInfo = {
      id,
      kind,
      title,
      state: "running",
      startedAt: Date.now(),
      endedAt: null,
      summary: null,
    };
    this.tasks.push(task);
    if (this.tasks.length > 12) this.tasks.shift();
    this.emitter.emit("task:update", { ...task });
    return id;
  }

  private mockTaskLog(taskId: string, level: LogEntry["level"], tag: string, msg: string): void {
    const entry: LogEntry = { t: Date.now(), level, tag, msg, task: taskId };
    const buf = this.taskLogs.get(taskId) ?? [];
    buf.push(entry);
    this.taskLogs.set(taskId, buf.slice(-1500));
    this.logs.push(entry);
    this.emitter.emit(`task:log:${taskId}`, entry);
    this.emitter.emit("log:line", entry);
  }

  private mockTaskEnd(taskId: string, state: string, summary: string): void {
    const task = this.tasks.find((t) => t.id === taskId);
    if (!task) return;
    task.state = state;
    task.endedAt = Date.now();
    task.summary = summary;
    this.emitter.emit("task:update", { ...task });
  }

  // ---------- junk scanning ----------

  onScanProgress(cb: (p: ScanProgress) => void): () => void {
    return this.emitter.on("scan:progress", cb as Handler);
  }

  startScan(): { promise: Promise<ScanReport>; cancel: () => void } {
    this.cancelled.scan = false;
    const started = Date.now();
    const total = 143_220;
    const reportItems = this.junk;

    const run = async (): Promise<ScanReport> => {
      const taskId = this.mockTaskBegin("scan", "Junk Scan");
      this.log("info", "SCAN", "junk sweep initiated — acquiring targets");
      const steps = 72;
      for (let i = 0; i <= steps; i++) {
        if (this.cancelled.scan) throw new Error("cancelled");
        const processed = Math.round((i / steps) * total);
        const foundFiles = Math.round((i / steps) * reportItems.length * 82);
        const foundBytes = Math.round((i / steps) * reportItems.reduce((s, x) => s + x.bytes, 0));
        const path = SCAN_PATHS[i % SCAN_PATHS.length];
        if (i % 6 === 0) {
          this.mockTaskLog(taskId, "dim", "SCAN", `probe ${path}`);
        }
        this.emitter.emit("scan:progress", {
          phase: i < steps * 0.85 ? "scanning" : "analyzing",
          currentPath: path,
          processed,
          total,
          foundBytes,
          foundFiles,
        } satisfies ScanProgress);
        await sleep(52 + Math.random() * 30);
      }
      const categories = aggregateCategories(reportItems);
      this.log("ok", "SCAN", `sweep complete :: ${reportItems.reduce((s, i) => s + i.bytes, 0)} bytes reclaimable`);
      this.mockTaskEnd(taskId, "done", `${reportItems.length} items found`);
      return {
        categories,
        items: reportItems,
        totalBytes: reportItems.reduce((s, i) => s + i.bytes, 0),
        totalFiles: reportItems.length * 82,
        durationMs: Date.now() - started,
      };
    };

    const promise = run().then((report) => {
      this.lastScanAt = Date.now();
      return report;
    });
    return { promise, cancel: () => (this.cancelled.scan = true) };
  }

  async cleanItems(ids: string[]): Promise<{ freedBytes: number }> {
    const selected = this.junk.filter((i) => ids.includes(i.id));
    const freed = selected.reduce((s, i) => s + i.bytes, 0);
    this.log("info", "SCAN", `wipe requested for ${ids.length} targets`);
    for (let p = 0; p <= 100; p += 12) {
      this.emitter.emit("scan:progress", {
        phase: "cleaning",
        currentPath: selected[Math.floor((p / 112) * selected.length)]?.path ?? "",
        processed: p,
        total: 100,
        foundBytes: freed,
        foundFiles: selected.length,
      } satisfies ScanProgress);
      await sleep(90);
    }
    this.junk = this.junk.filter((i) => !ids.includes(i.id));
    this.log("ok", "SCAN", `wipe complete — ${freed} bytes reclaimed`);
    return { freedBytes: freed };
  }

  // ---------- duplicates ----------

  onDuplicateProgress(cb: (p: ScanProgress) => void): () => void {
    return this.emitter.on("dup:progress", cb as Handler);
  }

  findDuplicates(): { promise: Promise<DuplicateGroup[]>; cancel: () => void } {
    this.cancelled.dupes = false;
    const run = async (): Promise<DuplicateGroup[]> => {
      this.log("info", "DEDUP", "content-aware duplicate hunt initiated");
      const total = 84_120;
      const steps = 48;
      for (let i = 0; i <= steps; i++) {
        if (this.cancelled.dupes) throw new Error("cancelled");
        this.emitter.emit("dup:progress", {
          phase: i < steps * 0.7 ? "scanning" : "analyzing",
          currentPath: SCAN_PATHS[(i * 3) % SCAN_PATHS.length],
          processed: Math.round((i / steps) * total),
          total,
          foundBytes: (i / steps) * 5.2 * 1024 ** 3,
          foundFiles: Math.round((i / steps) * 14),
        } satisfies ScanProgress);
        await sleep(58 + Math.random() * 26);
      }
      this.log("ok", "DEDUP", "hunt complete :: 6 groups, 5.6 GB wasted");
      return DUPLICATE_GROUPS;
    };
    return { promise: run(), cancel: () => (this.cancelled.dupes = true) };
  }

  async removeDuplicates(removedPaths: string[]): Promise<{ freedBytes: number }> {
    await sleep(900);
    const freed = DUPLICATE_GROUPS
      .flatMap((g) => g.files)
      .filter((f) => removedPaths.includes(f.path))
      .reduce((s, f) => s + f.bytes, 0);
    this.log("ok", "DEDUP", `duplicates removed — ${freed} bytes`);
    return { freedBytes: freed };
  }

  // ---------- tools ----------

  async listTools(): Promise<ToolInfo[]> {
    await sleep(150);
    return TOOLS;
  }

  async runTool(toolId: string): Promise<ToolResult> {
    this.log("info", "TOOL", `executing ${toolId}`);
    const steps = 5;
    for (let i = 0; i <= steps; i++) {
      this.emitter.emit("scan:progress", {
        phase: "scanning",
        currentPath: SCAN_PATHS[(i * 5) % SCAN_PATHS.length],
        processed: i,
        total: steps,
        foundBytes: 0,
        foundFiles: 0,
      } satisfies ScanProgress);
      await sleep(220);
    }
    const r = TOOL_RESULTS[toolId] ?? { found: 0, bytes: 0, note: "No results" };
    this.log("ok", "TOOL", `${toolId} done — ${r.note}`);
    return { toolId, ...r };
  }

  // ---------- feedback (secret vault gate) ----------

  async sendFeedback(message: string, _rating: string): Promise<FeedbackResponse> {
    await sleep(650);
    if (message.trim() === SECRET_CODE) {
      return { ok: true, unlockToken: "vault" };
    }
    return { ok: true };
  }

  // ---------- vault ----------

  async vaultUnlock(passphrase: string): Promise<boolean> {
    await sleep(500);
    this.vaultOpen = passphrase === SECRET_CODE;
    if (this.vaultOpen) this.log("ok", "APP", "vault unlocked — welcome, operator");
    return this.vaultOpen;
  }

  async vaultLock(): Promise<void> {
    this.vaultOpen = false;
    await sleep(120);
  }

  async vaultList(): Promise<VaultItem[]> {
    if (!this.vaultOpen) return [];
    await sleep(200);
    return [...this.vaultItems];
  }

  async vaultAdd(names: string[]): Promise<VaultItem[]> {
    await sleep(500);
    const added: VaultItem[] = names.map((name, i) => ({
      id: `v${Date.now()}_${i}`,
      name,
      bytes: Math.round(Math.random() * 400 * 1024 * 1024) + 1024,
      addedAt: Date.now(),
    }));
    this.vaultItems = [...this.vaultItems, ...added];
    return added;
  }

  async vaultRemove(id: string): Promise<void> {
    await sleep(250);
    this.vaultItems = this.vaultItems.filter((v) => v.id !== id);
  }

  // ---------- share: http + ftp + tunnel ----------

  async shareHttpStart(port: number): Promise<{ url: string }> {
    await sleep(700);
    this.httpRunning = true;
    this.log("info", "NET", `HTTP server live on http://192.168.1.42:${port}`);
    return { url: `http://192.168.1.42:${port}` };
  }

  async shareHttpStop(): Promise<void> {
    await sleep(300);
    this.httpRunning = false;
    this.log("dim", "NET", "HTTP server stopped");
  }

  async shareHttpStatus(): Promise<HttpStats> {
    await sleep(60);
    return {
      running: this.httpRunning,
      port: this.httpRunning ? this.httpPort ?? 8080 : 0,
      url: this.httpRunning ? `http://192.168.1.42:${this.httpPort ?? 8080}` : "",
      peersServed: 4,
      downloads: 17,
      bytesOut: 12.6 * 1024 ** 3,
    };
  }

  async shareFtpStart(cfg: { port: number; root?: string; anonymous?: boolean }): Promise<{ port: number; host: string }> {
    await sleep(700);
    this.ftpStats = {
      running: true,
      port: cfg.port,
      host: "192.168.1.42",
      root: cfg.root ?? "C:\\Users\\Sora\\AppData\\Roaming\\WhatToDelete\\shared",
      anonymous: cfg.anonymous ?? true,
      sessionsTotal: 0,
      sessionsActive: 0,
      bytesOut: 0,
      bytesIn: 0,
    };
    this.log("info", "FTP", `server listening on 0.0.0.0:${cfg.port}`);
    // simulate a session later
    setTimeout(() => {
      this.ftpStats = { ...this.ftpStats, sessionsTotal: 1, sessionsActive: 1 };
      this.log("info", "FTP", "session #1 opened from 192.168.1.51");
      setTimeout(() => {
        this.ftpStats = { ...this.ftpStats, sessionsActive: 0, bytesOut: 96 * 1024 * 1024 };
        this.log("ok", "FTP", "sent project-archive.zip (100663296 bytes)");
        this.log("dim", "FTP", "session #1 closed");
      }, 3200);
    }, 1800);
    return { port: cfg.port, host: "192.168.1.42" };
  }

  async shareFtpStop(): Promise<void> {
    await sleep(300);
    this.ftpStats = { ...this.ftpStats, running: false, sessionsActive: 0 };
    this.log("dim", "FTP", "server stopped");
  }

  async shareFtpStatus(): Promise<FtpStats> {
    await sleep(80);
    return { ...this.ftpStats };
  }

  async tunnelStart(cfg: { method: string; customUrl?: string }): Promise<void> {
    await sleep(400);
    if (cfg.method === "custom") {
      const url = cfg.customUrl?.trim();
      if (!url) throw new Error("no custom URL provided");
      this.tunnel = { method: "custom", state: "active", publicUrl: url, detail: "user-provided reverse proxy", startedAt: Date.now() };
      this.log("ok", "NET", `publish point set: ${url}`);
      return;
    }
    this.tunnel = {
      method: cfg.method,
      state: "starting",
      publicUrl: null,
      detail: cfg.method === "trycloudflare" ? "preparing cloudflared" : "connecting via ssh to localhost.run",
      startedAt: null,
    };
    this.log("info", "NET", cfg.method === "trycloudflare" ? "downloading cloudflared (~28 MB, one-time)…" : "opening reverse tunnel via localhost.run (ssh)");
    if (this.tunnelTimer) clearTimeout(this.tunnelTimer);
    this.tunnelTimer = setTimeout(() => {
      const url =
        cfg.method === "trycloudflare"
          ? "https://crazy-words-lane.trycloudflare.com"
          : "https://wtd-demo-42.lhr.life";
      this.tunnel = { method: cfg.method, state: "active", publicUrl: url, detail: "tunnel up → local http://127.0.0.1:8080", startedAt: Date.now() };
      this.log("ok", "NET", `PUBLIC URL: ${url}`);
    }, 2800);
  }

  async tunnelStop(): Promise<void> {
    await sleep(300);
    if (this.tunnelTimer) clearTimeout(this.tunnelTimer);
    this.tunnel = { method: "", state: "stopped", publicUrl: null, detail: "tunnel stopped", startedAt: null };
    this.log("dim", "NET", "tunnel closed");
  }

  async tunnelStatus(): Promise<TunnelStatus> {
    await sleep(80);
    return { ...this.tunnel };
  }

  startTransfer(items: { name: string; bytes: number; mode: ShareMode; peer: string }[]): void {
    const newTransfers: TransferItem[] = items.map((t, i) => ({
      id: `t${Date.now()}_${i}`,
      name: t.name,
      bytes: t.bytes,
      transferred: 0,
      speed: 0,
      mode: t.mode,
      state: "active",
      peer: t.peer,
    }));
    this.transfers = [...newTransfers, ...this.transfers].slice(0, 12);

    if (this.transferTimer) clearInterval(this.transferTimer);
    this.transferTimer = setInterval(() => {
      let changed = false;
      this.transfers = this.transfers.map((t) => {
        if (t.state !== "active") return t;
        changed = true;
        const speed = (6 + Math.random() * 34) * 1024 * 1024;
        const delta = speed * 0.5;
        const transferred = Math.min(t.bytes, t.transferred + delta);
        return {
          ...t,
          transferred,
          speed,
          state: transferred >= t.bytes ? "done" : "active",
        };
      });
      if (changed) this.emitter.emit("transfers", this.transfers);
    }, 500);
    this.emitter.emit("transfers", this.transfers);
  }

  onTransfers(cb: (t: TransferItem[]) => void): () => void {
    return this.emitter.on("transfers", cb as Handler);
  }

  cancelTransfer(id: string): void {
    this.transfers = this.transfers.filter((t) => t.id !== id);
    this.emitter.emit("transfers", this.transfers);
  }

  // ---------- file manager ----------

  async filesList(path: string): Promise<DirListing> {
    await sleep(180);
    const { entries, parent } = mockList(path);
    return { path, parent, entries, total: entries.length, truncated: false };
  }

  async filesRoots(): Promise<FileEntry[]> {
    await sleep(120);
    return QUICK_ROOTS;
  }

  async filesMkdir(parent: string, name: string): Promise<string> {
    await sleep(250);
    if (name.includes("\\")) throw new Error("invalid characters");
    this.log("dim", "FS", `mkdir ${parent}\\${name}`);
    return `${parent}\\${name}`;
  }

  async filesRename(path: string, newName: string): Promise<string> {
    await sleep(250);
    this.log("dim", "FS", `rename ${path.split("\\").pop()} → ${newName}`);
    const parent = path.slice(0, path.lastIndexOf("\\")) + "\\";
    return `${parent}${newName}`;
  }

  async filesCopy(paths: string[], dest: string): Promise<FileOpResult> {
    await sleep(600);
    this.log("info", "FS", `copy ${paths.length} item(s) → ${dest}`);
    return { ok: true, affected: paths.length, freedBytes: 0 };
  }

  async filesMove(paths: string[], dest: string): Promise<FileOpResult> {
    await sleep(600);
    this.log("info", "FS", `move ${paths.length} item(s) → ${dest}`);
    return { ok: true, affected: paths.length, freedBytes: 0 };
  }

  async filesDelete(paths: string[]): Promise<FileOpResult> {
    await sleep(500);
    const freed = 84.2 * 1024 * 1024 * paths.length;
    this.log("ok", "FS", `deleted ${paths.length} items (${Math.round(freed)} bytes)`);
    return { ok: true, affected: paths.length, freedBytes: freed };
  }

  async filesProps(path: string): Promise<ItemProps> {
    await sleep(250);
    const name = path.split("\\").pop() ?? path;
    const isDir = !name.includes(".");
    return {
      path,
      name,
      isDir,
      bytes: isDir ? 412.5 * 1024 * 1024 : 84.2 * 1024 * 1024,
      fileCount: isDir ? 382 : 1,
      dirCount: isDir ? 12 : 0,
      modified: Date.now() - 3 * 86_400_000,
      created: Date.now() - 90 * 86_400_000,
      readonly: false,
    };
  }

  async filesSearch(root: string, query: string, max = 300): Promise<FileEntry[]> {
    await sleep(500);
    return mockSearch(root, query).slice(0, max);
  }

  async filesOpen(path: string): Promise<boolean> {
    await sleep(200);
    this.log("dim", "FS", `open in explorer: ${path}`);
    return true;
  }

  // ---------- finders ----------

  async finderLargeFiles(): Promise<FinderItem[]> {
    await sleep(900);
    this.log("ok", "TOOL", `large-files scan done — ${LARGE_FILES.length} results`);
    return LARGE_FILES;
  }

  async finderOldFiles(): Promise<FinderItem[]> {
    await sleep(900);
    this.log("ok", "TOOL", `old-files scan done — ${OLD_FILES.length} results`);
    return OLD_FILES;
  }

  async finderEmptyDirs(): Promise<FinderItem[]> {
    await sleep(700);
    this.log("ok", "TOOL", `empty-dirs scan done — ${EMPTY_DIRS.length} skeletons`);
    return EMPTY_DIRS;
  }

  async finderRecycleBin(): Promise<RecycleBinStats> {
    await sleep(300);
    return { ...this.recycle };
  }

  async finderEmptyRecycleBin(): Promise<boolean> {
    await sleep(800);
    this.recycle = { count: 0, bytes: 0 };
    this.log("ok", "SYS", "recycle bin emptied");
    return true;
  }

  async finderInstalledApps(): Promise<InstalledApp[]> {
    await sleep(1100);
    this.log("ok", "SYS", `registry scan done — ${INSTALLED_APPS.length} apps`);
    return INSTALLED_APPS;
  }

  // ---------- v2.3: dev & power tools ----------

  async folderSizes(): Promise<FolderSize[]> {
    await sleep(1400);
    const sizes = [
      { path: "C:\\Users\\Sora\\Videos", bytes: 82.4 * 1024 ** 3, files: 214 },
      { path: "C:\\Users\\Sora\\Downloads", bytes: 41.2 * 1024 ** 3, files: 1180 },
      { path: "C:\\Users\\Sora\\Documents", bytes: 12.8 * 1024 ** 3, files: 4210 },
      { path: "C:\\Users\\Sora\\Pictures", bytes: 9.6 * 1024 ** 3, files: 3320 },
      { path: "C:\\Users\\Sora\\Music", bytes: 6.2 * 1024 ** 3, files: 890 },
    ];
    this.log("ok", "TOOL", `folder sizes measured — top: ${sizes[0].path}`);
    return sizes;
  }

  async pathAudit(): Promise<PathAuditReport> {
    await sleep(700);
    const entries = [
      { path: "C:\\Windows\\system32", exists: true, duplicate: false },
      { path: "C:\\Program Files\nodejs", exists: true, duplicate: false },
      { path: "C:\\tools\\cargo\\bin", exists: true, duplicate: true },
      { path: "C:\\tools\\cargo\\bin\\", exists: true, duplicate: true },
      { path: "D:\\gone\\sdk", exists: false, duplicate: false },
    ];
    return {
      totalCount: entries.length,
      missingCount: entries.filter((e) => !e.exists).length,
      duplicateCount: entries.filter((e) => e.duplicate).length,
      entries,
    };
  }

  async dnsFlush(): Promise<string> {
    await sleep(900);
    this.log("ok", "NET", "DNS resolver cache flushed");
    return "Successfully flushed the DNS Resolver Cache.";
  }

  async hashFile(path: string): Promise<HashResult> {
    await sleep(1200);
    let h = 0xcbf29ce484222325n;
    for (const b of path.split("").map((c) => c.charCodeAt(0))) {
      h ^= BigInt(b);
      h = BigInt.asUintN(64, h * 0x100000001b3n);
    }
    const hex = h.toString(16).padStart(64, "0");
    return { algo: "SHA-256", hex, bytes: 1024 * 4096, ms: 120 };
  }

  async openTerminal(path: string): Promise<boolean> {
    await sleep(200);
    this.log("dim", "SYS", `open terminal at: ${path}`);
    return true;
  }

  async shredPaths(paths: string[]): Promise<FileOpResult> {
    await sleep(1500);
    this.log("ok", "TOOL", `shredded ${paths.length} target(s) — 3-pass overwrite`);
    return { ok: true, affected: paths.length, freedBytes: 64 * 1024 * 1024 };
  }

  async deleteOnReboot(paths: string[]): Promise<FileOpResult> {
    await sleep(600);
    this.log("ok", "FS", `${paths.length} file(s) scheduled for deletion on next reboot`);
    return { ok: true, affected: paths.length, freedBytes: 0 };
  }

  async startupList(): Promise<StartupEntry[]> {
    await sleep(800);
    return [
      { id: "hkcu-run|Run|Steam", name: "Steam", command: "\"C:\\Program Files (x86)\\Steam\\steam.exe\" -silent", location: "Registry · Run · HKCU", removable: true },
      { id: "hkcu-run|Run|Discord", name: "Discord", command: "C:\\Users\\Sora\\AppData\\Local\\Discord\\Update.exe --processStart Discord", location: "Registry · Run · HKCU", removable: true },
      { id: "hklm-run|Run|OneDrive", name: "OneDrive", command: "C:\\Program Files\\Microsoft OneDrive\\OneDrive.exe /background", location: "Registry · Run · HKLM", removable: false },
    ];
  }

  async startupRemove(id: string): Promise<void> {
    await sleep(500);
    this.log("ok", "SYS", `startup entry removed: ${id.split("|").pop() ?? id}`);
  }

  // ---------- window controls (no-ops in the browser) ----------

  windowMinimize(): void {}
  windowToggleMaximize(): void {}
  windowClose(): void {}
  terminalWindowShow(): void {}
  terminalWindowHide(): void {}
  isTerminalWindow(): boolean {
    return typeof window !== "undefined" && window.location.hash.includes("terminal");
  }
  terminalWindowFullscreen(): void {}
  terminalWindowDrag(): void {}
}

export const mockEngine = new MockEngine();
