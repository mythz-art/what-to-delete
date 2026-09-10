import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  FileSearch,
  Clock,
  FolderX,
  Globe,
  RefreshCw,
  Bug,
  Package,
  Gauge,
  Loader2,
  ChevronRight,
  Sparkles,
  FolderTree,
  Route,
  Rocket,
  Network,
  Trash2,
  ShieldAlert,
} from "lucide-react";
import { api } from "@/lib/api";
import { useApp } from "@/lib/store";
import { formatBytes } from "@/lib/format";
import { Badge, Button, GlassCard, GaugeBar, SectionHeader } from "@/components/ui";
import { PageShell } from "@/components/chrome";
import type { FolderSize, PathAuditReport, StartupEntry, ToolInfo, ToolResult } from "@/lib/types";

const TOOL_ICONS: Record<string, typeof FileSearch> = {
  "large-files": FileSearch,
  "old-downloads": Clock,
  "empty-folders": FolderX,
  "browser-caches": Globe,
  "update-cache": RefreshCw,
  "crash-dumps": Bug,
  "app-sizes": Package,
  "startup-audit": Gauge,
  "folder-sizes": FolderTree,
  "path-audit": Route,
  autoruns: Rocket,
  "dns-flush": Network,
};

const TOOL_TONES: Record<string, string> = {
  "large-files": "border-[var(--wtd-accent-line)] bg-[var(--wtd-accent-soft)] text-[var(--wtd-accent-ink)]",
  "old-downloads": "border-[var(--wtd-cyan-soft)] bg-[var(--wtd-cyan-soft)] text-[var(--wtd-cyan)]",
  "empty-folders": "border-[var(--wtd-edge)] bg-[var(--wtd-card-2)] text-ink-2",
  "browser-caches": "border-[var(--wtd-cyan-soft)] bg-[var(--wtd-cyan-soft)] text-[var(--wtd-cyan)]",
  "update-cache": "border-[var(--wtd-accent-line)] bg-[var(--wtd-accent-soft)] text-[var(--wtd-accent-ink)]",
  "crash-dumps": "border-[var(--wtd-bad-soft)] bg-[var(--wtd-bad-soft)] text-[var(--wtd-bad)]",
  "app-sizes": "border-[var(--wtd-violet-soft)] bg-[var(--wtd-violet-soft)] text-[var(--wtd-violet)]",
  "startup-audit": "border-[var(--wtd-warn-soft)] bg-[var(--wtd-warn-soft)] text-[var(--wtd-warn)]",
  "folder-sizes": "border-[var(--wtd-violet-soft)] bg-[var(--wtd-violet-soft)] text-[var(--wtd-violet)]",
  "path-audit": "border-[var(--wtd-accent-line)] bg-[var(--wtd-accent-soft)] text-[var(--wtd-accent-ink)]",
  autoruns: "border-[var(--wtd-warn-soft)] bg-[var(--wtd-warn-soft)] text-[var(--wtd-warn)]",
  "dns-flush": "border-[var(--wtd-cyan-soft)] bg-[var(--wtd-cyan-soft)] text-[var(--wtd-cyan)]",
};

/** Tool cards whose rich panel lives in the Power Tools section below. */
const POWER_TOOL_IDS = new Set(["folder-sizes", "path-audit", "autoruns", "dns-flush"]);

export function ToolsPage() {
  const { navContext, pushToast } = useApp();
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [running, setRunning] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, ToolResult>>({});

  useEffect(() => {
    void api.listTools().then(setTools).catch(() => undefined);
  }, []);

  const run = async (id: string) => {
    if (running) return;
    if (POWER_TOOL_IDS.has(id)) {
      // power tools run through their rich panels below
      document.getElementById(`power-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    setRunning(id);
    try {
      const res = await api.runTool(id);
      setResults((r) => ({ ...r, [id]: res }));
      pushToast({
        kind: "success",
        title: `${res.found} items found`,
        message: res.note,
      });
    } catch {
      pushToast({ kind: "error", title: "Tool run failed" });
    } finally {
      setRunning(null);
    }
  };

  const autoRun = navContext?.toolId as string | undefined;
  useEffect(() => {
    if (autoRun && tools.length > 0 && !results[autoRun] && !running) {
      void run(autoRun);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRun, tools.length]);

  return (
    <PageShell>
      <SectionHeader
        title="Toolbox"
        subtitle="Focused sweeps for specific space hogs"
        right={<Badge tone="indigo">{tools.length} tools</Badge>}
      />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-3">
        {tools.map((tool, i) => {
          const Icon = TOOL_ICONS[tool.id] ?? FileSearch;
          const tone = TOOL_TONES[tool.id] ?? TOOL_TONES["empty-folders"];
          const isRunning = running === tool.id;
          const res = results[tool.id];
          const isPower = POWER_TOOL_IDS.has(tool.id);
          return (
            <GlassCard key={tool.id} hover delay={0.05 * i} className="relative flex flex-col p-5">
              <div className="flex items-start justify-between">
                <div className={`grid size-11 place-items-center rounded-xl border ${tone}`}>
                  <Icon className="size-5" />
                </div>
                {isPower ? (
                  <Badge tone="indigo">power tool</Badge>
                ) : (
                  res && (
                    <Badge tone={res.bytes > 0 ? "cyan" : "slate"}>
                      {res.bytes > 0 ? formatBytes(res.bytes) : `${res.found} items`}
                    </Badge>
                  )
                )}
              </div>
              <div className="mt-4 text-[15px] font-semibold tracking-tight">{tool.name}</div>
              <p className="mt-1.5 min-h-[36px] text-xs leading-relaxed text-ink-3">{tool.description}</p>

              <AnimatePresence>
                {res && !isPower && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-3 rounded-xl border border-[var(--wtd-edge)] bg-[var(--wtd-card-2)] px-3.5 py-2.5">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-ink-3">{res.found} results</span>
                        <span className="font-semibold tabular-nums text-ink-2">{formatBytes(res.bytes)}</span>
                      </div>
                      <div className="mt-1.5 text-[11px] leading-relaxed text-ink-3">{res.note}</div>
                      <div className="mt-2">
                        <GaugeBar percent={Math.min(100, (res.bytes / (150 * 1024 ** 3)) * 100)} className="h-1" />
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="mt-auto flex items-center justify-between pt-4">
                <span className="text-[11px] text-ink-4">
                  {isPower ? "Interactive panel below" : res ? "Scan complete" : "Ready to run"}
                </span>
                <Button
                  variant={res ? "ghost" : "primary"}
                  loading={isRunning}
                  onClick={() => run(tool.id)}
                  className="!px-3.5 !py-2 text-xs"
                  icon={res || isPower ? undefined : <Sparkles className="size-3.5" />}
                >
                  {isPower ? "Open" : isRunning ? "Running" : res ? "Run again" : "Run"}
                </Button>
              </div>

              {isRunning && (
                <motion.div
                  className="absolute inset-x-5 bottom-0 h-[2px] rounded-full bg-gradient-to-r from-indigo-400 to-cyan-300"
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  style={{ originX: 0 }}
                  transition={{ duration: 1.8, repeat: Infinity, ease: "linear" }}
                />
              )}
            </GlassCard>
          );
        })}
      </div>

      {running && (
        <div className="mt-6 flex items-center justify-center gap-2 text-xs text-ink-3">
          <Loader2 className="size-3.5 animate-spin text-[var(--wtd-accent-ink)]" />
          Sweeping your drives with the {tools.find((t) => t.id === running)?.name ?? "tool"}…
        </div>
      )}

      {/* ============================ v2.3 POWER TOOLS ============================ */}

      <div className="mt-10">
        <SectionHeader
          title="Power Tools"
          subtitle="The developer & sysadmin pack — live, interactive, no mock data"
          right={<Badge tone="indigo">v2.3</Badge>}
        />
        <div className="mt-4 space-y-4">
          <FolderSizesPanel />
          <PathAuditPanel />
          <StartupPanel />
          <DnsFlushPanel />
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="mt-8 flex items-center gap-3 rounded-xl border border-[var(--wtd-edge)] bg-[var(--wtd-card-2)] px-4 py-3"
      >
        <ChevronRight className="size-4 text-ink-4" />
        <p className="text-xs leading-relaxed text-ink-3">
          Every tool is read-only until you confirm an action. Large-file results can be sent straight to
          Cleanup for safe removal. Right-click any file in the manager for SHA-256, secure shred,
          delete-on-reboot and open-terminal.
        </p>
      </motion.div>
    </PageShell>
  );
}

/* ------------------------------ folder sizes ------------------------------ */

function FolderSizesPanel() {
  const { pushToast } = useApp();
  const [root, setRoot] = useState("");
  const [sizes, setSizes] = useState<FolderSize[] | null>(null);
  const [loading, setLoading] = useState(false);

  const measure = async () => {
    setLoading(true);
    try {
      const r = await api.folderSizes(root.trim() || undefined, 20);
      setSizes(r);
    } catch (e) {
      pushToast({ kind: "error", title: "Folder scan failed", message: String(e) });
    } finally {
      setLoading(false);
    }
  };

  const max = sizes?.[0]?.bytes ?? 1;
  const total = sizes?.reduce((s, x) => s + x.bytes, 0) ?? 0;

  return (
    <div id="power-folder-sizes"><GlassCard className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid size-9 place-items-center rounded-xl border border-[var(--wtd-violet-soft)] bg-[var(--wtd-violet-soft)] text-[var(--wtd-violet)]">
            <FolderTree className="size-4" />
          </div>
          <div>
            <div className="text-sm font-semibold">Folder Size Analyzer</div>
            <div className="text-[11px] text-ink-3">Rank top-level folders by real, recursively-measured size</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={root}
            onChange={(e) => setRoot(e.target.value)}
            placeholder="C:\Users\you  (empty = your profile)"
            className="input w-56 px-3 py-2 font-mono text-[11px]"
          />
          <Button variant="primary" loading={loading} onClick={measure} icon={<FolderTree className="size-4" />}>
            Measure
          </Button>
        </div>
      </div>

      {sizes && (
        <div className="mt-5 space-y-2.5">
          <div className="flex justify-between text-[11px] text-ink-3">
            <span>{sizes.length} folders measured{total > 0 ? ` · ${formatBytes(total)} total` : ""}</span>
            <span>45s budget · parallel walk</span>
          </div>
          {sizes.map((s) => (
            <div key={s.path} className="perf-row">
              <div className="flex items-center justify-between gap-4 text-xs">
                <span className="min-w-0 truncate font-mono text-ink-2">{s.path}</span>
                <span className="shrink-0 font-semibold tabular-nums text-[var(--wtd-violet)]">{formatBytes(s.bytes)}</span>
              </div>
              <div className="mt-1 flex items-center gap-3">
                <GaugeBar percent={(s.bytes / max) * 100} className="h-1" />
                <span className="w-24 shrink-0 text-right text-[10px] tabular-nums text-ink-4">
                  {s.files.toLocaleString()} files
                </span>
              </div>
            </div>
          ))}
          {sizes.length === 0 && <div className="py-4 text-center text-xs text-ink-4">Nothing measured — check the path.</div>}
        </div>
      )}
    </GlassCard>
    </div>
  );
}

/* ------------------------------- PATH audit ------------------------------- */

function PathAuditPanel() {
  const { pushToast } = useApp();
  const [report, setReport] = useState<PathAuditReport | null>(null);
  const [loading, setLoading] = useState(false);

  const audit = async () => {
    setLoading(true);
    try {
      setReport(await api.pathAudit());
    } catch (e) {
      pushToast({ kind: "error", title: "PATH audit failed", message: String(e) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="power-path-audit"><GlassCard className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid size-9 place-items-center rounded-xl border border-[var(--wtd-accent-line)] bg-[var(--wtd-accent-soft)] text-[var(--wtd-accent-ink)]">
            <Route className="size-4" />
          </div>
          <div>
            <div className="text-sm font-semibold">PATH Auditor</div>
            <div className="text-[11px] text-ink-3">Dead directories, duplicates and total length of your PATH</div>
          </div>
        </div>
        <Button variant="primary" loading={loading} onClick={audit} icon={<Route className="size-4" />}>
          Audit PATH
        </Button>
      </div>

      {report && (
        <div className="mt-5">
          <div className="grid grid-cols-3 gap-2.5">
            {[
              { label: "Entries", value: report.totalCount, tone: "text-ink-2" },
              { label: "Missing dirs", value: report.missingCount, tone: "text-[var(--wtd-bad)]" },
              { label: "Duplicates", value: report.duplicateCount, tone: "text-[var(--wtd-warn)]" },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-[var(--wtd-edge)] bg-[var(--wtd-card-2)] p-3.5 text-center">
                <div className={`text-xl font-semibold tabular-nums ${s.tone}`}>{s.value}</div>
                <div className="mt-0.5 text-[10px] uppercase tracking-wide text-ink-3">{s.label}</div>
              </div>
            ))}
          </div>
          <div className="scroll-thin mt-4 max-h-72 overflow-y-auto rounded-xl border border-[var(--wtd-edge)] bg-black/20">
            {report.entries.map((e, i) => (
              <div
                key={e.path + i}
                className={`perf-row flex items-center justify-between gap-3 px-3.5 py-2 text-[11px] ${
                  i > 0 ? "border-t border-[var(--wtd-edge)]" : ""
                }`}
              >
                <span className="min-w-0 truncate font-mono text-ink-2">{e.path}</span>
                <span className="flex shrink-0 gap-1.5">
                  {!e.exists && (
                    <span className="rounded border border-[var(--wtd-bad-soft)] bg-[var(--wtd-bad-soft)] px-1.5 py-px text-[9px] font-semibold text-[var(--wtd-bad)]">
                      MISSING
                    </span>
                  )}
                  {e.duplicate && (
                    <span className="rounded border border-[var(--wtd-warn-soft)] bg-[var(--wtd-warn-soft)] px-1.5 py-px text-[9px] font-semibold text-[var(--wtd-warn)]">
                      DUP
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </GlassCard>
    </div>
  );
}

/* ----------------------------- startup manager ----------------------------- */

function StartupPanel() {
  const { pushToast, refreshStatus } = useApp();
  const [entries, setEntries] = useState<StartupEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  const scan = async () => {
    setLoading(true);
    try {
      setEntries(await api.startupList());
    } catch (e) {
      pushToast({ kind: "error", title: "Startup scan failed", message: String(e) });
    } finally {
      setLoading(false);
    }
  };

  const remove = async (entry: StartupEntry) => {
    if (!confirm(`Remove "${entry.name}" from startup?\n\n${entry.command}`)) return;
    setRemoving(entry.id);
    try {
      await api.startupRemove(entry.id);
      setEntries((prev) => prev?.filter((x) => x.id !== entry.id) ?? null);
      pushToast({ kind: "success", title: "Startup entry removed", message: entry.name });
      void refreshStatus();
    } catch (e) {
      pushToast({ kind: "error", title: "Remove failed", message: String(e) });
    } finally {
      setRemoving(null);
    }
  };

  return (
    <div id="power-autoruns"><GlassCard className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid size-9 place-items-center rounded-xl border border-[var(--wtd-warn-soft)] bg-[var(--wtd-warn-soft)] text-[var(--wtd-warn)]">
            <Rocket className="size-4" />
          </div>
          <div>
            <div className="text-sm font-semibold">Startup Manager</div>
            <div className="text-[11px] text-ink-3">Live autoruns — registry Run keys (HKCU/HKLM) + Startup folders</div>
          </div>
        </div>
        <Button variant="primary" loading={loading} onClick={scan} icon={<Rocket className="size-4" />}>
          Scan autoruns
        </Button>
      </div>

      {entries && (
        <div className="mt-5 overflow-hidden rounded-2xl border border-[var(--wtd-edge)] bg-black/20">
          {entries.map((s, i) => (
            <div
              key={s.id}
              className={`perf-row-lg grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 ${
                i > 0 ? "border-t border-[var(--wtd-edge)]" : ""
              }`}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-xs font-semibold text-ink">{s.name}</span>
                  <span className="rounded border border-[var(--wtd-edge)] bg-[var(--wtd-card-2)] px-1.5 py-px text-[9px] text-ink-3">
                    {s.location}
                  </span>
                </div>
                <div className="mt-1 truncate font-mono text-[10px] text-ink-4" title={s.command}>
                  {s.command}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!s.removable && (
                  <span className="hidden items-center gap-1 text-[10px] text-ink-4 sm:flex">
                    <ShieldAlert className="size-3" /> admin
                  </span>
                )}
                <Button
                  variant="danger"
                  disabled={!s.removable}
                  loading={removing === s.id}
                  onClick={() => void remove(s)}
                  className="!px-3 !py-1.5 !text-[11px]"
                  icon={<Trash2 className="size-3.5" />}
                >
                  {s.removable ? "Remove" : "Locked"}
                </Button>
              </div>
            </div>
          ))}
          {entries.length === 0 && (
            <div className="px-4 py-6 text-center text-xs text-ink-4">No autorun entries found.</div>
          )}
        </div>
      )}
    </GlassCard>
    </div>
  );
}

/* -------------------------------- dns flush -------------------------------- */

function DnsFlushPanel() {
  const { pushToast } = useApp();
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const flush = async () => {
    setLoading(true);
    try {
      const msg = await api.dnsFlush();
      setResult(msg);
      pushToast({ kind: "success", title: "DNS cache flushed", message: msg });
    } catch (e) {
      pushToast({ kind: "error", title: "Flush failed", message: String(e) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="power-dns-flush"><GlassCard className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid size-9 place-items-center rounded-xl border border-[var(--wtd-cyan-soft)] bg-[var(--wtd-cyan-soft)] text-[var(--wtd-cyan)]">
            <Network className="size-4" />
          </div>
          <div>
            <div className="text-sm font-semibold">Flush DNS Cache</div>
            <div className="text-[11px] text-ink-3">
              Runs ipconfig /flushdns — fixes stale DNS lookups after VPN / DNS changes
            </div>
          </div>
        </div>
        <Button variant="primary" loading={loading} onClick={flush} icon={<Network className="size-4" />}>
          Flush now
        </Button>
      </div>
      {result && (
        <div className="mt-4 rounded-xl border border-[var(--wtd-ok-soft)] bg-emerald-400/[0.05] px-4 py-3 font-mono text-[11px] text-[var(--wtd-ok)]">
          {result}
        </div>
      )}
    </GlassCard>
    </div>
  );
}
