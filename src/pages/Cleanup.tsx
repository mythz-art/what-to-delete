import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Sparkles,
  Trash2,
  ChevronDown,
  CheckCircle2,
  ShieldCheck,
  X,
  RefreshCw,
  FileWarning,
  ScanLine,
} from "lucide-react";
import { api } from "@/lib/api";
import { useApp } from "@/lib/store";
import { formatBytes, formatCount, formatDuration } from "@/lib/format";
import {
  AnimatedNumber,
  Badge,
  Button,
  FileGridPulse,
  GlassCard,
  Modal,
  ProgressRing,
} from "@/components/ui";
import { PageShell } from "@/components/chrome";
import type { JunkItem, ScanProgress, ScanReport, JunkCategory } from "@/lib/types";

type Stage = "idle" | "scanning" | "results" | "cleaning" | "done";

const CATEGORY_ICONS: Record<string, string> = {
  temp: "Temp",
  system: "System",
  browser: "Browser",
  recycle: "Recycle",
  updates: "Updates",
  logs: "Logs",
};

export function CleanupPage() {
  const { navContext, pushToast, refreshStatus } = useApp();
  const [stage, setStage] = useState<Stage>("idle");
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [report, setReport] = useState<ScanReport | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openCategory, setOpenCategory] = useState<string | null>(
    (navContext?.category as string) ?? null
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [freed, setFreed] = useState(0);
  const cancelRef = useRef<(() => void) | null>(null);

  // scan progress subscription
  useEffect(() => api.onScanProgress(setProgress), []);

  const startScan = () => {
    setStage("scanning");
    setReport(null);
    setSelected(new Set());
    const { promise, cancel } = api.startScan();
    cancelRef.current = cancel;
    promise
      .then((r) => {
        setReport(r);
        setStage("results");
        setOpenCategory(r.categories[0]?.id ?? null);
      })
      .catch(() => {
        setStage("idle");
        pushToast({ kind: "info", title: "Scan cancelled" });
      });
  };

  const itemsByCategory = useMemo(() => {
    const map = new Map<string, JunkItem[]>();
    report?.items.forEach((i) => {
      if (!map.has(i.category)) map.set(i.category, []);
      map.get(i.category)!.push(i);
    });
    return map;
  }, [report]);

  const selectedBytes = useMemo(
    () => report?.items.filter((i) => selected.has(i.id)).reduce((s, i) => s + i.bytes, 0) ?? 0,
    [report, selected]
  );

  const toggleItem = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selectCategory = (cat: JunkCategory, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      itemsByCategory.get(cat.id)?.forEach((i) => (on ? next.add(i.id) : next.delete(i.id)));
      return next;
    });

  const executeClean = async () => {
    if (selected.size === 0) return;
    setConfirmOpen(false);
    setStage("cleaning");
    try {
      const res = await api.cleanItems([...selected]);
      setFreed(res.freedBytes);
      setStage("done");
      await refreshStatus();
    } catch {
      pushToast({ kind: "error", title: "Cleanup failed", message: "Some files could not be removed" });
      setStage("results");
    }
  };

  /* --------------------------------- scanning -------------------------------- */

  if (stage === "scanning" || stage === "cleaning") {
    const pct = progress ? (progress.processed / Math.max(1, progress.total)) * 100 : 0;
    const cleaning = stage === "cleaning";
    return (
      <PageShell>
        <div className="flex flex-col items-center pt-6">
          <ProgressRing percent={pct} size={180}>
            <div className="text-3xl font-semibold tabular-nums tracking-tight">
              {cleaning ? "···" : <AnimatedNumber value={pct} format={(n) => `${Math.round(n)}%`} />}
            </div>
            <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              {cleaning ? "Deleting" : "Scanning"}
            </div>
          </ProgressRing>

          <GlassCard delay={0.1} className="relative mt-8 w-full max-w-2xl overflow-hidden p-6">
            <div className="pointer-events-none absolute inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-indigo-400/70 to-transparent animate-scanline" />
            <FileGridPulse cells={28} />
            <div className="mt-6">
              <div className="mb-2 flex items-end justify-between">
                <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">
                  {cleaning ? "Removing" : "Now scanning"}
                </span>
                <span className="font-mono text-xs tabular-nums text-slate-500">
                  {formatCount(progress?.processed ?? 0)} / {formatCount(progress?.total ?? 0)} files
                </span>
              </div>
              <div className="h-9 overflow-hidden rounded-lg border border-white/[0.06] bg-black/30 px-3 py-2">
                <AnimatePresence mode="popLayout">
                  <motion.div
                    key={progress?.currentPath ?? "none"}
                    initial={{ y: 14, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -14, opacity: 0 }}
                    transition={{ duration: 0.12 }}
                    className="truncate font-mono text-[11px] text-indigo-300/80"
                  >
                    {progress?.currentPath || "…"}
                  </motion.div>
                </AnimatePresence>
              </div>
              <div className="mt-4 flex items-center justify-between">
                <div className="text-sm text-slate-400">
                  {cleaning ? "Freeing" : "Junk found"}:{" "}
                  <span className="font-semibold text-slate-100">
                    <AnimatedNumber
                      value={progress?.foundBytes ?? 0}
                      format={(n) => formatBytes(Math.max(0, n))}
                    />
                  </span>
                </div>
                <span className="text-sm tabular-nums text-slate-400">
                  {formatCount(progress?.foundFiles ?? 0)} junk files
                </span>
              </div>
            </div>
          </GlassCard>

          {!cleaning && (
            <Button
              variant="ghost"
              className="mt-6"
              icon={<X className="size-4" />}
              onClick={() => cancelRef.current?.()}
            >
              Cancel scan
            </Button>
          )}
        </div>
      </PageShell>
    );
  }

  /* ----------------------------------- done ---------------------------------- */

  if (stage === "done") {
    return (
      <PageShell>
        <div className="flex flex-col items-center pt-10">
          <motion.div
            initial={{ scale: 0, rotate: -20 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 220, damping: 15 }}
            className="grid size-20 place-items-center rounded-3xl bg-gradient-to-br from-emerald-400 to-cyan-400 shadow-xl shadow-emerald-400/25"
          >
            <CheckCircle2 className="size-10 text-white" />
          </motion.div>
          <h1 className="mt-6 text-2xl font-semibold tracking-tight">
            <AnimatedNumber value={freed} format={(n) => formatBytes(n)} /> freed
          </h1>
          <p className="mt-2 max-w-sm text-center text-sm leading-relaxed text-slate-400">
            Your disk just got lighter. Windows may take a moment to reflect the new free space.
          </p>
          <div className="mt-7 flex gap-3">
            <Button variant="primary" icon={<RefreshCw className="size-4" />} onClick={startScan}>
              Rescan
            </Button>
            <Button
              onClick={() => {
                setStage("idle");
                setReport(null);
              }}
            >
              Back to overview
            </Button>
          </div>
        </div>
      </PageShell>
    );
  }

  /* ---------------------------------- idle ----------------------------------- */

  if (stage === "idle" || !report) {
    return (
      <PageShell>
        <GlassCard className="relative overflow-hidden p-9">
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background: `radial-gradient(480px 240px at 85% 0%, rgba(34,211,238,0.12), transparent 70%),
                          radial-gradient(380px 200px at 0% 100%, rgba(99,102,241,0.12), transparent 70%)`,
            }}
          />
          <div className="flex items-start justify-between gap-8">
            <div className="max-w-md">
              <Badge tone="indigo">
                <ScanLine className="size-3" />
                Deep scan
              </Badge>
              <h1 className="mt-4 text-[26px] font-semibold leading-tight tracking-tight">
                Find every byte you don't need
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-slate-400">
                Sweeps temp folders, browser caches, update leftovers, logs and crash dumps across all
                drives — with USN journal acceleration. Nothing is deleted until you approve it.
              </p>
              <div className="mt-6 flex items-center gap-3">
                <Button variant="primary" icon={<Sparkles className="size-4" />} onClick={startScan}>
                  Analyze disk
                </Button>
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <ShieldCheck className="size-3.5 text-emerald-400" />
                  Read-only pass
                </div>
              </div>
            </div>
            <div className="hidden w-[300px] shrink-0 md:block">
              <FileGridPulse cells={21} />
              <div className="mt-4 space-y-2">
                {Object.values(CATEGORY_ICONS).map((c, i) => (
                  <motion.div
                    key={c}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.15 + i * 0.07 }}
                    className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-1.5 text-[11px] text-slate-400"
                  >
                    <span>{c} files</span>
                    <span className="tabular-nums text-slate-500">· · ·</span>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </GlassCard>
      </PageShell>
    );
  }

  /* --------------------------------- results --------------------------------- */

  return (
    <PageShell>
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Scan results</h1>
          <p className="mt-1 text-[13px] text-slate-500">
            {formatBytes(report.totalBytes)} of junk in {formatCount(report.totalFiles)} files ·
            finished in {formatDuration(report.durationMs)}
          </p>
        </div>
        <Button icon={<RefreshCw className="size-4" />} onClick={startScan}>
          Rescan
        </Button>
      </div>

      <div className="mt-6 space-y-3">
        {report.categories.map((cat, idx) => {
          const catItems = itemsByCategory.get(cat.id) ?? [];
          const catSelected = catItems.filter((i) => selected.has(i.id));
          const open = openCategory === cat.id;
          return (
            <GlassCard key={cat.id} delay={0.04 * idx} className="overflow-hidden">
              <button
                onClick={() => setOpenCategory(open ? null : cat.id)}
                className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-white/[0.02]"
              >
                <div
                  className={`grid size-10 shrink-0 place-items-center rounded-xl border text-[11px] font-bold tracking-wide ${
                    cat.risky
                      ? "border-amber-300/25 bg-amber-400/10 text-amber-300"
                      : "border-indigo-300/25 bg-indigo-400/10 text-indigo-300"
                  }`}
                >
                  {CATEGORY_ICONS[cat.id]?.slice(0, 3).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{cat.name}</span>
                    {cat.risky && (
                      <Badge tone="amber">
                        <FileWarning className="size-3" />
                        Review first
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-slate-500">{cat.description}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold tabular-nums">{formatBytes(cat.bytes)}</div>
                  <div className="text-[11px] tabular-nums text-slate-500">{cat.fileCount} files</div>
                </div>
                <div className="ml-2 flex items-center gap-3">
                  <label
                    className="relative flex size-5 shrink-0 cursor-pointer items-center"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={catSelected.length === catItems.length && catItems.length > 0}
                      onChange={(e) => selectCategory(cat, e.target.checked)}
                      className="peer sr-only"
                    />
                    <div
                      className={`size-5 rounded-md border transition-all duration-150 peer-checked:border-transparent peer-checked:bg-gradient-to-br peer-checked:from-indigo-500 peer-checked:to-cyan-400 ${
                        catSelected.length > 0 && catSelected.length < catItems.length
                          ? "border-indigo-300/60 bg-indigo-400/20"
                          : "border-white/20 bg-white/[0.04]"
                      }`}
                    />
                    {catSelected.length > 0 && catSelected.length < catItems.length && (
                      <div className="absolute inset-0 grid place-items-center text-[10px] font-bold text-indigo-200">
                        {catSelected.length}
                      </div>
                    )}
                  </label>
                  <ChevronDown
                    className={`size-4 text-slate-500 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
                  />
                </div>
              </button>

              <AnimatePresence initial={false}>
                {open && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                    className="overflow-hidden"
                  >
                    <div className="max-h-64 overflow-y-auto border-t border-white/[0.05] px-5 py-3">
                      {catItems.map((item) => {
                        const on = selected.has(item.id);
                        return (
                          <label
                            key={item.id}
                            className="group flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-white/[0.03]"
                          >
                            <input
                              type="checkbox"
                              checked={on}
                              onChange={() => toggleItem(item.id)}
                              className="peer sr-only"
                            />
                            <div
                              className={`size-4 shrink-0 rounded-[5px] border transition-all duration-150 peer-checked:border-transparent peer-checked:bg-gradient-to-br peer-checked:from-indigo-500 peer-checked:to-cyan-400 ${
                                on ? "border-transparent" : "border-white/20 bg-white/[0.04]"
                              }`}
                            />
                            <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-slate-400 group-hover:text-slate-300">
                              {item.path}
                            </span>
                            <span className="shrink-0 text-xs tabular-nums text-slate-500">
                              {formatBytes(item.bytes)}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </GlassCard>
          );
        })}
      </div>

      {/* selection bar */}
      <AnimatePresence>
        {selected.size > 0 && stage === "results" && (
          <motion.div
            initial={{ y: 90, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 90, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-8 pb-6"
          >
            <div
              className="glass flex items-center gap-5 px-6 py-4"
              style={{ background: "rgba(12, 17, 33, 0.94)" }}
            >
              <div>
                <div className="text-lg font-semibold tabular-nums tracking-tight">
                  {formatBytes(selectedBytes)}
                </div>
                <div className="text-[11px] text-slate-500">
                  {formatCount(selected.size)} files selected
                </div>
              </div>
              <div className="h-8 w-px bg-white/10" />
              <Button variant="ghost" onClick={() => setSelected(new Set())}>
                Clear
              </Button>
              <Button
                variant="danger"
                icon={<Trash2 className="size-4" />}
                onClick={() => setConfirmOpen(true)}
              >
                Clean now
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* confirm dialog */}
      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} width="max-w-sm">
        <div className="flex items-start gap-4">
          <div className="grid size-11 shrink-0 place-items-center rounded-2xl border border-rose-400/30 bg-rose-400/10">
            <Trash2 className="size-5 text-rose-300" />
          </div>
          <div>
            <div className="text-base font-semibold">Delete {formatCount(selected.size)} files?</div>
            <p className="mt-1.5 text-[13px] leading-relaxed text-slate-400">
              This frees <span className="font-semibold text-slate-200">{formatBytes(selectedBytes)}</span>.
              Files go to the Recycle Bin first, so you can still undo.
            </p>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2.5">
          <Button onClick={() => setConfirmOpen(false)}>Keep them</Button>
          <Button variant="danger" icon={<Trash2 className="size-4" />} onClick={executeClean}>
            Delete
          </Button>
        </div>
      </Modal>
    </PageShell>
  );
}
