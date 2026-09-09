import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  FolderTree,
  FileSearch,
  Clock,
  FolderMinus,
  Trash2,
  LayoutGrid,
  RefreshCw,
  HardDriveDownload,
  Package,
  Loader2,
} from "lucide-react";
import { api } from "@/lib/api";
import { useApp } from "@/lib/store";
import { formatBytes, formatDate } from "@/lib/format";
import type { FinderItem, InstalledApp, RecycleBinStats } from "@/lib/types";
import { PageShell } from "@/components/chrome";
import { Button, EmptyState, SectionHeader } from "@/components/ui";
import { FileExplorer } from "@/components/FileExplorer";

const TABS = [
  { id: "explorer", label: "Explorer", icon: FolderTree },
  { id: "large", label: "Large Files", icon: FileSearch },
  { id: "old", label: "Old Files", icon: Clock },
  { id: "empty", label: "Empty Folders", icon: FolderMinus },
  { id: "apps", label: "Installed Apps", icon: Package },
  { id: "recycle", label: "Recycle Bin", icon: Trash2 },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function FilesPage() {
  const { navContext, navigate } = useApp();
  const [tab, setTab] = useState<TabId>((navContext?.filesTab as TabId) ?? "explorer");
  const explorerPath = (navContext?.explorerPath as string) ?? undefined;

  return (
    <PageShell>
      <div className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight">Files</h1>
        <p className="mt-1 text-sm text-slate-500">
          Browse, manage and hunt files — every drive, one workspace.
        </p>
      </div>

      {/* tab bar */}
      <div className="mb-5 flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`relative flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-medium transition-all ${
              tab === t.id
                ? "border-indigo-300/40 bg-indigo-400/15 text-white"
                : "border-white/[0.07] bg-white/[0.03] text-slate-400 hover:border-white/15 hover:text-slate-200"
            }`}
          >
            <t.icon className="size-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      <motion.div key={tab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
        {tab === "explorer" && <FileExplorer initialPath={explorerPath} />}
        {tab === "large" && <LargeFilesTab />}
        {tab === "old" && <OldFilesTab />}
        {tab === "empty" && <EmptyDirsTab />}
        {tab === "apps" && <AppsTab />}
        {tab === "recycle" && <RecycleTab />}
      </motion.div>
    </PageShell>
  );
}

/* ------------------------------ shared finder list ------------------------------ */

function FinderList({
  items,
  onRemove,
  removeLabel,
  emptyTitle,
  emptyDesc,
}: {
  items: FinderItem[];
  onRemove?: (item: FinderItem) => void;
  removeLabel?: string;
  emptyTitle: string;
  emptyDesc: string;
}) {
  if (items.length === 0) {
    return <EmptyState icon={<FileSearch className="size-6" />} title={emptyTitle} description={emptyDesc} />;
  }
  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-black/20">
      {items.map((f, i) => (
        <div
          key={f.path}
          className={`grid grid-cols-[minmax(0,1fr)_100px_130px_auto] items-center gap-3 px-4 py-2.5 transition-colors hover:bg-white/[0.04] ${
            i > 0 ? "border-t border-white/[0.05]" : ""
          }`}
        >
          <div className="min-w-0">
            <div className="truncate text-xs font-medium text-slate-200">{f.path.split("\\").pop()}</div>
            <div className="truncate text-[10px] text-slate-600">{f.path}</div>
          </div>
          <span className="text-right text-xs font-semibold tabular-nums text-indigo-300">{formatBytes(f.bytes)}</span>
          <span className="text-right text-[11px] tabular-nums text-slate-500">
            {f.modified ? `${formatDate(f.modified)}${f.extra ? ` · ${f.extra}` : ""}` : f.extra || "—"}
          </span>
          {onRemove && (
            <Button variant="danger" onClick={() => onRemove(f)} className="!px-3 !py-1.5 !text-[11px]">
              {removeLabel ?? "Delete"}
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}

function ScanButton({ onClick, loading, label }: { onClick: () => void; loading: boolean; label: string }) {
  return (
    <Button variant="primary" onClick={onClick} loading={loading} icon={loading ? undefined : <RefreshCw className="size-4" />}>
      {label}
    </Button>
  );
}

/* ------------------------------ large files ------------------------------ */

function LargeFilesTab() {
  const { pushToast, refreshStatus } = useApp();
  const [items, setItems] = useState<FinderItem[] | null>(null);
  const [loading, setLoading] = useState(false);

  const scan = async () => {
    setLoading(true);
    try {
      setItems(await api.finderLargeFiles(undefined, 100));
    } finally {
      setLoading(false);
    }
  };

  const remove = async (f: FinderItem) => {
    if (!confirm(`Delete ${f.path} (${formatBytes(f.bytes)})?`)) return;
    const r = await api.filesDelete([f.path]);
    if (r.ok) {
      pushToast({ kind: "success", title: "Deleted", message: `${formatBytes(r.freedBytes)} freed` });
      setItems((prev) => prev?.filter((x) => x.path !== f.path) ?? null);
      void refreshStatus();
    }
  };

  return (
    <div>
      <SectionHeader
        title="Large Files"
        subtitle="Files over 100 MB across your drives and user folders"
        right={<ScanButton onClick={scan} loading={loading} label="Scan" />}
      />
      {items === null ? (
        <EmptyState icon={<FileSearch className="size-6" />} title="Ready to hunt" description="Run a scan to list the biggest space eaters." />
      ) : (
        <FinderList items={items} onRemove={remove} emptyTitle="No large files" emptyDesc="Nothing over 100 MB found." />
      )}
    </div>
  );
}

/* ------------------------------ old files ------------------------------ */

function OldFilesTab() {
  const { pushToast, refreshStatus } = useApp();
  const [items, setItems] = useState<FinderItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [days, setDays] = useState(90);

  const scan = async () => {
    setLoading(true);
    try {
      setItems(await api.finderOldFiles(undefined, days, 10));
    } finally {
      setLoading(false);
    }
  };

  const remove = async (f: FinderItem) => {
    if (!confirm(`Delete ${f.path}?`)) return;
    const r = await api.filesDelete([f.path]);
    if (r.ok) {
      pushToast({ kind: "success", title: "Deleted", message: `${formatBytes(r.freedBytes)} freed` });
      setItems((prev) => prev?.filter((x) => x.path !== f.path) ?? null);
      void refreshStatus();
    }
  };

  return (
    <div>
      <SectionHeader
        title="Old Files"
        subtitle="Big files you haven't touched in a while"
        right={
          <div className="flex items-center gap-2">
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-slate-300 focus:outline-none"
            >
              {[30, 60, 90, 180, 365].map((d) => (
                <option key={d} value={d}>{d} days</option>
              ))}
            </select>
            <ScanButton onClick={scan} loading={loading} label="Scan" />
          </div>
        }
      />
      {items === null ? (
        <EmptyState icon={<Clock className="size-6" />} title="Ready when you are" description="Find forgotten downloads and stale media." />
      ) : (
        <FinderList items={items} onRemove={remove} emptyTitle="Nothing old found" emptyDesc={`No large files idle for ${days}+ days.`} />
      )}
    </div>
  );
}

/* ------------------------------ empty folders ------------------------------ */

function EmptyDirsTab() {
  const { pushToast } = useApp();
  const [items, setItems] = useState<FinderItem[] | null>(null);
  const [loading, setLoading] = useState(false);

  const scan = async () => {
    setLoading(true);
    try {
      setItems(await api.finderEmptyDirs());
    } finally {
      setLoading(false);
    }
  };

  const removeOne = async (f: FinderItem) => {
    const r = await api.filesDelete([f.path]);
    if (r.ok) {
      pushToast({ kind: "success", title: "Folder removed" });
      setItems((prev) => prev?.filter((x) => x.path !== f.path) ?? null);
    }
  };

  return (
    <div>
      <SectionHeader
        title="Empty Folders"
        subtitle="Folder skeletons with no files anywhere beneath them"
        right={
          <div className="flex gap-2">
            <ScanButton onClick={scan} loading={loading} label="Scan" />
            {items && items.length > 0 && (
              <Button
                variant="danger"
                onClick={async () => {
                  if (!confirm(`Remove all ${items.length} empty folders?`)) return;
                  const r = await api.filesDelete(items.map((i) => i.path));
                  pushToast({
                    kind: r.ok ? "success" : "error",
                    title: `Removed ${r.affected} folders`,
                    message: r.ok ? undefined : r.error,
                  });
                  setItems([]);
                }}
                icon={<FolderMinus className="size-4" />}
              >
                Remove all
              </Button>
            )}
          </div>
        }
      />
      {items === null ? (
        <EmptyState icon={<FolderMinus className="size-6" />} title="Scan for skeletons" description="Empty folders accumulate over years of installs and updates." />
      ) : (
        <FinderList items={items} onRemove={removeOne} removeLabel="Remove" emptyTitle="No empty folders" emptyDesc="Your tree is clean." />
      )}
    </div>
  );
}

/* ------------------------------ installed apps ------------------------------ */

function AppsTab() {
  const [apps, setApps] = useState<InstalledApp[] | null>(null);
  const [loading, setLoading] = useState(false);

  const scan = async () => {
    setLoading(true);
    try {
      setApps(await api.finderInstalledApps());
    } finally {
      setLoading(false);
    }
  };

  if (apps === null) {
    return (
      <div>
        <SectionHeader
          title="Installed Apps"
          subtitle="What's installed and how much space it claims"
          right={<ScanButton onClick={scan} loading={loading} label="Scan registry" />}
        />
        <EmptyState icon={<Package className="size-6" />} title="Registry scan" description="Reads Windows uninstall keys (read-only) and sorts apps by size." />
      </div>
    );
  }

  const total = apps.reduce((s, a) => s + a.bytes, 0);
  return (
    <div>
      <SectionHeader
        title="Installed Apps"
        subtitle={`${apps.length} apps · ${formatBytes(total)} total`}
        right={<ScanButton onClick={scan} loading={loading} label="Rescan" />}
      />
      {apps.length === 0 ? (
        <EmptyState icon={<Package className="size-6" />} title="No apps found" />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-black/20">
          {apps.map((a, i) => (
            <div
              key={a.name + i}
              className={`grid grid-cols-[minmax(0,1fr)_110px_140px_36px] items-center gap-3 px-4 py-2.5 transition-colors hover:bg-white/[0.04] ${
                i > 0 ? "border-t border-white/[0.05]" : ""
              }`}
            >
              <div className="min-w-0">
                <div className="truncate text-xs font-medium text-slate-200">{a.name}</div>
                <div className="truncate text-[10px] text-slate-600">
                  {a.publisher}
                  {a.installLocation ? ` · ${a.installLocation}` : ""}
                </div>
              </div>
              <span className="text-right text-xs font-semibold tabular-nums text-indigo-300">
                {a.bytes > 0 ? formatBytes(a.bytes) : "—"}
              </span>
              <span className="text-right text-[11px] tabular-nums text-slate-500">{a.version || "—"}</span>
              <button
                onClick={() => a.installLocation && void api.filesOpen(a.installLocation)}
                disabled={!a.installLocation}
                className="justify-self-end rounded p-1.5 text-slate-500 transition-colors hover:bg-white/10 hover:text-slate-200 disabled:opacity-30"
                title="Open install location"
              >
                <HardDriveDownload className="size-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------ recycle bin ------------------------------ */

function RecycleTab() {
  const { pushToast, refreshStatus } = useApp();
  const [stats, setStats] = useState<RecycleBinStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [emptying, setEmptying] = useState(false);

  const scan = useCallback(async () => {
    setLoading(true);
    try {
      setStats(await api.finderRecycleBin());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void scan();
  }, [scan]);

  const empty = async () => {
    if (!stats || stats.count === 0) return;
    if (!confirm(`Permanently delete ${stats.count} items (${formatBytes(stats.bytes)}) from the Recycle Bin?`)) return;
    setEmptying(true);
    try {
      const ok = await api.finderEmptyRecycleBin();
      if (ok) {
        pushToast({ kind: "success", title: "Recycle Bin emptied", message: `${formatBytes(stats.bytes)} freed` });
        void refreshStatus();
      } else {
        pushToast({ kind: "error", title: "Empty failed", message: "The bin may be in use by Explorer." });
      }
      await scan();
    } finally {
      setEmptying(false);
    }
  };

  return (
    <div>
      <SectionHeader
        title="Recycle Bin"
        subtitle="What's sitting in your trash right now"
        right={
          <div className="flex gap-2">
            <Button variant="ghost" onClick={scan} loading={loading} icon={<RefreshCw className="size-4" />}>
              Refresh
            </Button>
            <Button
              variant="danger"
              disabled={!stats || stats.count === 0}
              loading={emptying}
              onClick={empty}
              icon={<Trash2 className="size-4" />}
            >
              Empty bin
            </Button>
          </div>
        }
      />
      <div className="grid gap-3 sm:grid-cols-2">
        {[
          { label: "Items", value: stats ? stats.count.toLocaleString() : "—", icon: LayoutGrid },
          { label: "Reclaimable", value: stats ? formatBytes(stats.bytes) : "—", icon: Trash2 },
        ].map((c) => (
          <div key={c.label} className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
            <div className="flex items-center gap-3 text-xs font-medium text-slate-500">
              <c.icon className="size-4" />
              {c.label}
            </div>
            <div className="mt-2 text-3xl font-semibold tabular-nums tracking-tight">
              {loading && !stats ? <Loader2 className="size-6 animate-spin text-indigo-300" /> : c.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
