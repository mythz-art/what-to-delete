import type { DriveInfo, JunkItem, DuplicateGroup, ToolInfo, VaultItem } from "@/lib/types";

const DAY = 86_400_000;
const now = () => Date.now();

export const DRIVES: DriveInfo[] = [
  { letter: "C:", label: "OS", kind: "nvme", totalBytes: 512_110_190_592, usedBytes: 331_247_718_400 },
  { letter: "D:", label: "Media", kind: "hdd", totalBytes: 2_000_398_934_016, usedBytes: 1_412_318_208_000 },
  { letter: "E:", label: "Projects", kind: "ssd", totalBytes: 512_110_190_592, usedBytes: 201_695_178_752 },
];

export const SCAN_PATHS: string[] = [
  "C:\\Windows\\Temp\\~DF8A21.tmp",
  "C:\\Windows\\Temp\\cab_5123_4",
  "C:\\Users\\Sora\\AppData\\Local\\Temp\\chrome_BITS_2841",
  "C:\\Users\\Sora\\AppData\\Local\\Temp\\is-7A21C.tmp\\setup.tmp",
  "C:\\Windows\\SoftwareDistribution\\Download\\a3f8d2e1\\windows10.0-kb5034441.cab",
  "C:\\Windows\\Prefetch\\CHROME.EXE-8F2D1B9A.pf",
  "C:\\Users\\Sora\\AppData\\Local\\Google\\Chrome\\User Data\\Default\\Cache\\Cache_Data\\f_00421a",
  "C:\\Users\\Sora\\AppData\\Local\\Microsoft\\Edge\\User Data\\Default\\Cache\\data_1",
  "C:\\Windows\\Logs\\CBS\\CbsPersist_20260701184231.log",
  "C:\\Windows\\Logs\\DISM\\dism.log",
  "C:\\Windows\\Minidump\\082426-41233-01.dmp",
  "C:\\$Recycle.Bin\\S-1-5-21-1004336348-1177238915-682003330-1013\\$R7KJ3L9.exe",
  "C:\\Users\\Sora\\Downloads\\python-3.12.3-amd64.exe.tmp",
  "C:\\Users\\Sora\\AppData\\Local\\pip\\cache\\wheels\\a3\\f8\\d2\\numpy-1.26.4",
  "C:\\Users\\Sora\\AppData\\Local\\npm-cache\\_cacache\\content-v2\\sha512\\9d\\4a",
  "C:\\Windows\\Installer\\PatchCache\\7.2.6190.0\\mso.dll",
  "C:\\ProgramData\\Package Cache\\{e4f2a1b8-...}\\vc_redist.x64.exe",
  "C:\\Users\\Sora\\AppData\\Local\\CrashDumps\\wtd-app.exe.8842.dmp",
  "C:\\Windows\\Temp\\WER\\ReportQueue\\q_0_7_1\\report.wer",
  "C:\\Users\\Sora\\AppData\\Local\\Thumbnails\\thumbcache_256.db",
];

const MB = 1024 * 1024;
const GB = 1024 * MB;

function item(id: string, path: string, bytes: number, category: JunkItem["category"], daysAgo: number): JunkItem {
  return { id, path, bytes, category, modified: now() - daysAgo * DAY };
}

export const JUNK_ITEMS: JunkItem[] = [
  // temp
  item("t1", "C:\\Windows\\Temp\\~DF8A21.tmp", 3.2 * MB, "temp", 1),
  item("t2", "C:\\Windows\\Temp\\cab_5123_4", 412 * MB, "temp", 3),
  item("t3", "C:\\Users\\Sora\\AppData\\Local\\Temp\\chrome_BITS_2841", 96 * MB, "temp", 0),
  item("t4", "C:\\Users\\Sora\\AppData\\Local\\Temp\\is-7A21C.tmp\\setup.tmp", 148 * MB, "temp", 12),
  item("t5", "C:\\Users\\Sora\\AppData\\Local\\Temp\\vscode-crash-5521.dmp", 84 * MB, "temp", 6),
  item("t6", "C:\\Windows\\Temp\\WER\\ReportQueue\\q_0_7_1\\report.wer", 2.1 * MB, "temp", 9),
  // system
  item("s1", "C:\\Windows\\Prefetch\\CHROME.EXE-8F2D1B9A.pf", 0.8 * MB, "system", 0),
  item("s2", "C:\\Windows\\Prefetch\\WTD-APP.EXE-A71C3E04.pf", 0.3 * MB, "system", 0),
  item("s3", "C:\\Windows\\Prefetch\\CODE.EXE-11F8DA22.pf", 0.9 * MB, "system", 1),
  item("s4", "C:\\Windows\\Installer\\PatchCache\\7.2.6190.0\\mso.dll", 224 * MB, "system", 87),
  item("s5", "C:\\ProgramData\\Package Cache\\{e4f2a1b8-3c9d-4f8a}\\vc_redist.x64.exe", 24.6 * MB, "system", 141),
  // browser
  item("b1", "C:\\Users\\Sora\\AppData\\Local\\Google\\Chrome\\User Data\\Default\\Cache\\Cache_Data\\f_00421a", 41 * MB, "browser", 0),
  item("b2", "C:\\Users\\Sora\\AppData\\Local\\Google\\Chrome\\User Data\\Default\\Cache\\Cache_Data\\data_1", 312 * MB, "browser", 0),
  item("b3", "C:\\Users\\Sora\\AppData\\Local\\Microsoft\\Edge\\User Data\\Default\\Cache\\data_1", 198 * MB, "browser", 1),
  item("b4", "C:\\Users\\Sora\\AppData\\Local\\Mozilla\\Firefox\\Profiles\\x9k2.default\\cache2\\entries\\1B2F", 74 * MB, "browser", 2),
  item("b5", "C:\\Users\\Sora\\AppData\\Local\\Google\\Chrome\\User Data\\Default\\Code Cache\\js\\9a4f1c2d_1", 56 * MB, "browser", 0),
  // recycle
  item("r1", "C:\\$Recycle.Bin\\S-1-5-21-...\\$R7KJ3L9.exe", 1.1 * GB, "recycle", 4),
  item("r2", "C:\\$Recycle.Bin\\S-1-5-21-...\\$R9XK2M4.zip", 348 * MB, "recycle", 11),
  item("r3", "C:\\$Recycle.Bin\\S-1-5-21-...\\$R2DL8P1.iso", 4.7 * GB, "recycle", 26),
  // updates
  item("u1", "C:\\Windows\\SoftwareDistribution\\Download\\a3f8d2e1\\windows10.0-kb5034441.cab", 824 * MB, "updates", 9),
  item("u2", "C:\\Windows\\SoftwareDistribution\\Download\\b7e1c4f9\\windows10.0-kb5039211.msu", 610 * MB, "updates", 21),
  item("u3", "C:\\Windows\\SoftwareDistribution\\Download\\c1d9f2a6\\PSFX.cab", 1.9 * GB, "updates", 33),
  // logs
  item("l1", "C:\\Windows\\Logs\\CBS\\CbsPersist_20260701184231.log", 18 * MB, "logs", 68),
  item("l2", "C:\\Windows\\Logs\\CBS\\CbsPersist_20260602133902.log", 22 * MB, "logs", 98),
  item("l3", "C:\\Windows\\Logs\\DISM\\dism.log", 6.4 * MB, "logs", 71),
  item("l4", "C:\\Windows\\Minidump\\082426-41233-01.dmp", 96 * MB, "logs", 15),
  item("l5", "C:\\Users\\Sora\\AppData\\Local\\CrashDumps\\wtd-app.exe.8842.dmp", 112 * MB, "logs", 6),
];

export const CATEGORY_META: Record<JunkItem["category"], { name: string; description: string; risky?: boolean }> = {
  temp: { name: "Temporary Files", description: "Leftover temp data from installers, apps and the OS" },
  system: { name: "System Cache", description: "Prefetch, patch caches and installer caches" },
  browser: { name: "Browser Cache", description: "Chrome, Edge and Firefox caches" },
  recycle: { name: "Recycle Bin", description: "Files already deleted by you" },
  updates: { name: "Windows Update Cache", description: "Downloaded update packages" },
  logs: { name: "Logs & Dumps", description: "CBS/DISM logs and crash dumps" },
};

export const DUPLICATE_GROUPS: DuplicateGroup[] = [
  {
    id: "g1",
    hash: "9f2c81ab4e77d3",
    files: [
      { path: "C:\\Users\\Sora\\Pictures\\Camera\\IMG_2043.jpg", bytes: 8.4 * MB, modified: now() - 23 * DAY },
      { path: "C:\\Users\\Sora\\Pictures\\Backup\\IMG_2043.jpg", bytes: 8.4 * MB, modified: now() - 23 * DAY },
      { path: "D:\\Photos\\2026\\May\\IMG_2043.jpg", bytes: 8.4 * MB, modified: now() - 12 * DAY },
    ],
    wastedBytes: 16.8 * MB,
  },
  {
    id: "g2",
    hash: "c7a93e12f8b2d4",
    files: [
      { path: "C:\\Users\\Sora\\Downloads\\blender-4.2.zip", bytes: 386 * MB, modified: now() - 41 * DAY },
      { path: "D:\\Installers\\blender-4.2.zip", bytes: 386 * MB, modified: now() - 41 * DAY },
    ],
    wastedBytes: 386 * MB,
  },
  {
    id: "g3",
    hash: "e4b8da291c7f36",
    files: [
      { path: "C:\\Users\\Sora\\Documents\\invoice_2026_04.pdf", bytes: 2.1 * MB, modified: now() - 90 * DAY },
      { path: "C:\\Users\\Sora\\Documents\\archive\\invoice_2026_04 (copy).pdf", bytes: 2.1 * MB, modified: now() - 90 * DAY },
    ],
    wastedBytes: 2.1 * MB,
  },
  {
    id: "g4",
    hash: "a1f7c3b92e5d84",
    files: [
      { path: "D:\\Video\\clip_0423.mp4", bytes: 1.4 * GB, modified: now() - 60 * DAY },
      { path: "D:\\Video\\render\\clip_0423_final.mp4", bytes: 1.4 * GB, modified: now() - 58 * DAY },
      { path: "E:\\Projects\\video\\clip_0423_export.mp4", bytes: 1.4 * GB, modified: now() - 55 * DAY },
    ],
    wastedBytes: 2.8 * GB,
  },
  {
    id: "g5",
    hash: "5d9e2a7c4b8f13",
    files: [
      { path: "C:\\Users\\Sora\\Music\\ambient_loop.wav", bytes: 96 * MB, modified: now() - 200 * DAY },
      { path: "D:\\Audio\\samples\\ambient_loop.wav", bytes: 96 * MB, modified: now() - 198 * DAY },
    ],
    wastedBytes: 96 * MB,
  },
  {
    id: "g6",
    hash: "3b7f9e2d1a6c54",
    files: [
      { path: "C:\\Users\\Sora\\Documents\\taxes_2025.xlsx", bytes: 4.7 * MB, modified: now() - 150 * DAY },
      { path: "C:\\Users\\Sora\\OneDrive\\Documents\\taxes_2025.xlsx", bytes: 4.7 * MB, modified: now() - 150 * DAY },
    ],
    wastedBytes: 4.7 * MB,
  },
];

export const VAULT_ITEMS: VaultItem[] = [
  { id: "v1", name: "passwords.kdbx", bytes: 1.2 * MB, addedAt: now() - 30 * DAY },
  { id: "v2", name: "taxes_2025_archive.zip", bytes: 84 * MB, addedAt: now() - 92 * DAY },
  { id: "v3", name: "wallet_seed_backup.dat", bytes: 4 * 1024, addedAt: now() - 12 * DAY },
  { id: "v4", name: "private_notes.txt", bytes: 18 * 1024, addedAt: now() - 3 * DAY },
];

export const TOOLS: ToolInfo[] = [
  { id: "large-files", name: "Large Files Finder", description: "Hunt down files larger than 100 MB across all drives" },
  { id: "old-downloads", name: "Old Downloads", description: "Find downloads you have not touched in 90+ days" },
  { id: "empty-folders", name: "Empty Folders", description: "Detect and remove empty folder skeletons" },
  { id: "browser-caches", name: "Browser Caches", description: "Deep-scan every browser cache profile" },
  { id: "update-cache", name: "Windows Update Cache", description: "Clear leftover update packages safely" },
  { id: "crash-dumps", name: "Crash Dumps", description: "Remove memory dumps from failed apps" },
  { id: "app-sizes", name: "App Disk Usage", description: "See which installed apps eat the most space" },
  { id: "startup-audit", name: "Startup Audit", description: "Review what slows down your boot time" },
];

export const TOOL_RESULTS: Record<string, { found: number; bytes: number; note: string }> = {
  "large-files": { found: 47, bytes: 138 * GB, note: "47 files over 100 MB, top offender is a 18.2 GB VM image" },
  "old-downloads": { found: 62, bytes: 21.3 * GB, note: "62 downloads older than 90 days" },
  "empty-folders": { found: 214, bytes: 0, note: "214 empty folders found" },
  "browser-caches": { found: 1206, bytes: 3.1 * GB, note: "Chrome 1.9 GB, Edge 0.9 GB, Firefox 0.3 GB" },
  "update-cache": { found: 38, bytes: 3.3 * GB, note: "Safe to clear — Windows re-downloads if needed" },
  "crash-dumps": { found: 9, bytes: 1.2 * GB, note: "Memory dumps from 4 different apps" },
  "app-sizes": { found: 118, bytes: 96 * GB, note: "118 apps measured, top: game studio 32 GB" },
  "startup-audit": { found: 23, bytes: 0, note: "23 startup entries, 6 rated high impact" },
};

/* ============================== v2.1 mock data ============================== */

import type { FinderItem, FileEntry, InstalledApp, FtpStats, TunnelStatus } from "@/lib/types";

export const RAM = { totalBytes: 34_359_738_368, usedBytes: 15_820_937_216 };

export const OS_NAME = "Windows NT · 12 cores";

export const LARGE_FILES: FinderItem[] = [
  { path: "E:\\VMs\\win11-dev.vhdx", bytes: 18.2 * 1024 ** 3, modified: now() - 41 * DAY, extra: "" },
  { path: "D:\\Media\\raw-footage-4k.tar", bytes: 12.8 * 1024 ** 3, modified: now() - 96 * DAY, extra: "" },
  { path: "D:\\Backups\\system-image-2026-07.bak", bytes: 8.4 * 1024 ** 3, modified: now() - 62 * DAY, extra: "" },
  { path: "C:\\Users\\Sora\\Downloads\\blender-4.6-win64.msi", bytes: 3.9 * 1024 ** 3, modified: now() - 12 * DAY, extra: "" },
  { path: "D:\\Games\\shader-cache.pak", bytes: 2.1 * 1024 ** 3, modified: now() - 4 * DAY, extra: "" },
  { path: "E:\\dev\\target\\release\\deps\\libwtd-7f7ae0a3.rlib", bytes: 1.4 * 1024 ** 3, modified: now() - 1 * DAY, extra: "" },
];

export const OLD_FILES: FinderItem[] = [
  { path: "C:\\Users\\Sora\\Downloads\\python-3.12.3-amd64.exe", bytes: 26.1 * MB, modified: now() - 320 * DAY, extra: "320 days idle" },
  { path: "C:\\Users\\Sora\\Downloads\\wtd-v1.1.0.zip", bytes: 9.4 * MB, modified: now() - 240 * DAY, extra: "240 days idle" },
  { path: "C:\\Users\\Sora\\Documents\\tax-2024-final.pdf", bytes: 8.2 * MB, modified: now() - 400 * DAY, extra: "400 days idle" },
  { path: "D:\\Media\\old-playlist-backup.json", bytes: 64 * MB, modified: now() - 510 * DAY, extra: "510 days idle" },
  { path: "C:\\Users\\Sora\\Pictures\\2019-export.zip", bytes: 1.8 * 1024 ** 3, modified: now() - 700 * DAY, extra: "700 days idle" },
];

export const EMPTY_DIRS: FinderItem[] = [
  { path: "C:\\Users\\Sora\\Downloads\\unpacked-old-driver", bytes: 0, modified: now() - 90 * DAY, extra: "empty tree" },
  { path: "C:\\Users\\Sora\\AppData\\Local\\Temp\\is-7A21C.tmp", bytes: 0, modified: now() - 12 * DAY, extra: "empty tree" },
  { path: "D:\\Projects\\legacy-frontend\\node_modules\\deprecated", bytes: 0, modified: now() - 200 * DAY, extra: "empty tree" },
  { path: "E:\\dev\\old-branch\\out\\debug", bytes: 0, modified: now() - 55 * DAY, extra: "empty tree" },
  { path: "C:\\Users\\Sora\\Videos\\render-cache-old", bytes: 0, modified: now() - 30 * DAY, extra: "empty tree" },
];

export const INSTALLED_APPS: InstalledApp[] = [
  { name: "Blender Foundation Blender", version: "4.6.1", publisher: "Blender Foundation", bytes: 3.9 * 1024 ** 3, installLocation: "C:\\Program Files\\Blender Foundation\\Blender 4.6", uninstallString: "MsiExec.exe /I{blender}" },
  { name: "Microsoft Visual Studio Code", version: "1.96.2", publisher: "Microsoft Corporation", bytes: 412 * MB, installLocation: "C:\\Program Files\\Microsoft VS Code", uninstallString: "" },
  { name: "Google Chrome", version: "141.0.7390.65", publisher: "Google LLC", bytes: 880 * MB, installLocation: "C:\\Program Files\\Google\\Chrome", uninstallString: "" },
  { name: "OBS Studio", version: "31.0.0", publisher: "OBS Project", bytes: 520 * MB, installLocation: "C:\\Program Files\\obs-studio", uninstallString: "" },
  { name: "7-Zip 24.09", version: "24.09", publisher: "Igor Pavlov", bytes: 12 * MB, installLocation: "C:\\Program Files\\7-Zip", uninstallString: "" },
  { name: "Node.js", version: "22.14.0", publisher: "OpenJS Foundation", bytes: 96 * MB, installLocation: "C:\\Program Files\\nodejs", uninstallString: "" },
];

export const RECYCLE_STATS = { count: 312, bytes: 6.1 * 1024 ** 3 };

/* ---- in-memory mock filesystem ---- */

interface MockNode {
  name: string;
  isDir: boolean;
  bytes: number;
  modified: number;
  children?: MockNode[];
}

const TREE: MockNode[] = [
  {
    name: "C:",
    isDir: true,
    bytes: 0,
    modified: now() - DAY,
    children: [
      { name: "Windows", isDir: true, bytes: 0, modified: now() - 2 * DAY, children: [
        { name: "Temp", isDir: true, bytes: 0, modified: now() - DAY, children: [] },
        { name: "notepad.exe", isDir: false, bytes: 361 * 1024, modified: now() - 400 * DAY },
      ] },
      { name: "Users", isDir: true, bytes: 0, modified: now() - DAY, children: [
        { name: "Sora", isDir: true, bytes: 0, modified: now() - DAY, children: [
          { name: "Desktop", isDir: true, bytes: 0, modified: now() - 3 * DAY, children: [
            { name: "todo.txt", isDir: false, bytes: 2 * 1024, modified: now() - 3 * DAY },
            { name: "screenshot-2026-09-08.png", isDir: false, bytes: 2.2 * MB, modified: now() - 2 * DAY },
          ] },
          { name: "Downloads", isDir: true, bytes: 0, modified: now(), children: [
            { name: "blender-4.6-win64.msi", isDir: false, bytes: 3.9 * 1024 ** 3, modified: now() - 12 * DAY },
            { name: "wtd-v2.0.0.zip", isDir: false, bytes: 9.4 * MB, modified: now() - 30 * DAY },
            { name: "rustup-init.exe", isDir: false, bytes: 8.1 * MB, modified: now() - 60 * DAY },
          ] },
          { name: "Documents", isDir: true, bytes: 0, modified: now() - 10 * DAY, children: [
            { name: "budget.xlsx", isDir: false, bytes: 340 * 1024, modified: now() - 10 * DAY },
            { name: "notes.md", isDir: false, bytes: 12 * 1024, modified: now() - DAY },
          ] },
          { name: "Pictures", isDir: true, bytes: 0, modified: now() - 20 * DAY, children: [
            { name: "vacation.jpg", isDir: false, bytes: 8.2 * MB, modified: now() - 90 * DAY },
            { name: "cat.png", isDir: false, bytes: 1.1 * MB, modified: now() - 5 * DAY },
          ] },
        ] },
      ] },
      { name: "Program Files", isDir: true, bytes: 0, modified: now() - 15 * DAY, children: [
        { name: "obs-studio", isDir: true, bytes: 0, modified: now() - 15 * DAY, children: [] },
        { name: "7-Zip", isDir: true, bytes: 0, modified: now() - 200 * DAY, children: [] },
      ] },
    ],
  },
  {
    name: "D:",
    isDir: true,
    bytes: 0,
    modified: now() - 2 * DAY,
    children: [
      { name: "Media", isDir: true, bytes: 0, modified: now() - 96 * DAY, children: [
        { name: "raw-footage-4k.tar", isDir: false, bytes: 12.8 * 1024 ** 3, modified: now() - 96 * DAY },
        { name: "movie.mkv", isDir: false, bytes: 4.1 * 1024 ** 3, modified: now() - 30 * DAY },
      ] },
      { name: "Backups", isDir: true, bytes: 0, modified: now() - 62 * DAY, children: [
        { name: "system-image-2026-07.bak", isDir: false, bytes: 8.4 * 1024 ** 3, modified: now() - 62 * DAY },
      ] },
      { name: "Games", isDir: true, bytes: 0, modified: now() - 4 * DAY, children: [
        { name: "shader-cache.pak", isDir: false, bytes: 2.1 * 1024 ** 3, modified: now() - 4 * DAY },
      ] },
    ],
  },
  {
    name: "E:",
    isDir: true,
    bytes: 0,
    modified: now() - DAY,
    children: [
      { name: "dev", isDir: true, bytes: 0, modified: now() - DAY, children: [
        { name: "target", isDir: true, bytes: 0, modified: now(), children: [
          { name: "release", isDir: true, bytes: 0, modified: now(), children: [] },
        ] },
        { name: "main.rs", isDir: false, bytes: 9 * 1024, modified: now() - DAY },
        { name: "Cargo.toml", isDir: false, bytes: 1 * 1024, modified: now() - 2 * DAY },
      ] },
      { name: "VMs", isDir: true, bytes: 0, modified: now() - 41 * DAY, children: [
        { name: "win11-dev.vhdx", isDir: false, bytes: 18.2 * 1024 ** 3, modified: now() - 41 * DAY },
      ] },
    ],
  },
];

function findNode(path: string): MockNode | null {
  const norm = path.replace(/\\+$/, "").toUpperCase();
  if (norm === "" || norm === "PC") return { name: "", isDir: true, bytes: 0, modified: 0, children: TREE } as MockNode;
  for (const drive of TREE) {
    if (norm === drive.name.toUpperCase()) return drive;
    if (norm.startsWith(drive.name + "\\")) {
      const parts = norm.slice(drive.name.length + 1).split("\\");
      let cur: MockNode | undefined = drive;
      for (const p of parts) {
        cur = cur?.children?.find((c) => c.name.toUpperCase() === p);
        if (!cur) return null;
      }
      return cur ?? null;
    }
  }
  return null;
}

export function mockList(path: string): { entries: FileEntry[]; parent: string | null } {
  const node = findNode(path);
  if (!node?.children) return { entries: [], parent: null };
  const norm = path.replace(/\\+$/, "");
  const entries: FileEntry[] = node.children.map((c) => ({
    name: c.name,
    path: `${norm}\\${c.name}`,
    isDir: c.isDir,
    bytes: c.isDir ? 0 : c.bytes,
    modified: c.modified,
    hidden: c.name.startsWith("."),
    readonly: c.name.endsWith(".exe"),
  }));
  entries.sort((a, b) => (b.isDir ? 1 : 0) - (a.isDir ? 1 : 0) || a.name.localeCompare(b.name));
  const parent = norm.includes("\\") ? (norm.lastIndexOf("\\") === norm.length - 1 ? norm.slice(0, -1).split("\\").slice(0, -1).join("\\") + "\\" || null : norm.slice(0, norm.lastIndexOf("\\")) + "\\") : null;
  return { entries, parent };
}

export function mockSearch(root: string, query: string): FileEntry[] {
  const out: FileEntry[] = [];
  const q = query.toLowerCase();
  const walk = (nodes: MockNode[], prefix: string) => {
    for (const n of nodes) {
      const p = `${prefix}${n.name}`;
      if (n.name.toLowerCase().includes(q)) {
        out.push({ name: n.name, path: p, isDir: n.isDir, bytes: n.isDir ? 0 : n.bytes, modified: n.modified, hidden: false, readonly: false });
      }
      if (n.children && out.length < 200) walk(n.children, `${p}\\`);
    }
  };
  const node = findNode(root);
  if (node?.children) walk(node.children, root.replace(/\\+$/, "") + "\\");
  return out;
}

export const QUICK_ROOTS: FileEntry[] = [
  { name: "Desktop", path: "C:\\Users\\Sora\\Desktop", isDir: true, bytes: 0, modified: 0, hidden: false, readonly: false },
  { name: "Downloads", path: "C:\\Users\\Sora\\Downloads", isDir: true, bytes: 0, modified: 0, hidden: false, readonly: false },
  { name: "Documents", path: "C:\\Users\\Sora\\Documents", isDir: true, bytes: 0, modified: 0, hidden: false, readonly: false },
  { name: "Pictures", path: "C:\\Users\\Sora\\Pictures", isDir: true, bytes: 0, modified: 0, hidden: false, readonly: false },
  ...DRIVES.map((d) => ({
    name: `${d.label} (${d.letter})`,
    path: `${d.letter}\\`,
    isDir: true,
    bytes: 0,
    modified: 0,
    hidden: false,
    readonly: false,
  })),
];

export const MOCK_FTP_STATS: FtpStats = {
  running: false,
  port: 2121,
  root: "",
  anonymous: true,
  sessionsTotal: 0,
  sessionsActive: 0,
  bytesOut: 0,
  bytesIn: 0,
};

export const MOCK_TUNNEL: TunnelStatus = {
  method: "",
  state: "stopped",
  publicUrl: null,
  detail: "",
  startedAt: null,
};
