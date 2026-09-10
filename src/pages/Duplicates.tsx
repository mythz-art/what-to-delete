import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Files, Copy, Crown, Trash2, ShieldCheck, RefreshCw, CheckCircle2, Hash } from "lucide-react";
import { api } from "@/lib/api";
import { useApp } from "@/lib/store";
import { formatBytes, formatDate, shortHash } from "@/lib/format";
import { AnimatedNumber, Badge, Button, FileGridPulse, GlassCard, Modal, ProgressRing } from "@/components/ui";
import { PageShell } from "@/components/chrome";
import type { DuplicateGroup, ScanProgress } from "@/lib/types";

type Stage = "idle" | "scanning" | "results" | "cleaning" | "done";

type Strategy = "keep-newest" | "keep-oldest" | "keep-path";

export function DuplicatesPage() {
  const { pushToast } = useApp();
  const [stage, setStage] = useState<Stage>("idle");
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [keepMap, setKeepMap] = useState<Record<string, string>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [freed, setFreed] = useState(0);

  useEffect(() => api.onDuplicateProgress(setProgress), []);

  const start = () => {
    setStage("scanning");
    const { promise } = api.findDuplicates();
    promise
      .then((gs) => {
        setGroups(gs);
        const initial: Record<string, string> = {};
        gs.forEach((g) => {
          initial[g.id] = [...g.files].sort((a, b) => b.modified - a.modified)[0].path;
        });
        setKeepMap(initial);
        setStage("results");
      })
      .catch(() => setStage("idle"));
  };

  const applyStrategy = (strategy: Strategy) => {
    const next: Record<string, string> = {};
    groups.forEach((g) => {
      const sorted = [...g.files].sort((a, b) => b.modified - a.modified);
      if (strategy === "keep-newest") next[g.id] = sorted[0].path;
      else if (strategy === "keep-oldest") next[g.id] = sorted[sorted.length - 1].path;
      else next[g.id] = [...g.files].sort((a, b) => a.path.localeCompare(b.path))[0].path;
    });
    setKeepMap(next);
    pushToast({ kind: "info", title: "Smart selection applied" });
  };

  const removedPaths = useMemo(() => {
    const paths: string[] = [];
    groups.forEach((g) => g.files.forEach((f) => f.path !== keepMap[g.id] && paths.push(f.path)));
    return paths;
  }, [groups, keepMap]);

  const totalWaste = useMemo(
    () => groups.reduce((s, g) => s + g.wastedBytes, 0),
    [groups]
  );

  const execute = async () => {
    setConfirmOpen(false);
    setStage("cleaning");
    try {
      const res = await api.removeDuplicates(removedPaths);
      setFreed(res.freedBytes);
      setStage("done");
    } catch {
      pushToast({ kind: "error", title: "Could not remove duplicates" });
      setStage("results");
    }
  };

  if (stage === "scanning") {
    const pct = progress ? (progress.processed / Math.max(1, progress.total)) * 100 : 0;
    return (
      <PageShell>
        <div className="flex flex-col items-center pt-6">
          <ProgressRing percent={pct} size={180}>
            <div className="text-3xl font-semibold tabular-nums tracking-tight">
              <AnimatedNumber value={pct} format={(n) => `${Math.round(n)}%`} />
            </div>
            <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-3">
              Hashing
            </div>
          </ProgressRing>
          <GlassCard delay={0.1} className="relative mt-8 w-full max-w-2xl overflow-hidden p-6">
            <div className="pointer-events-none absolute inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-400/70 to-transparent animate-scanline" />
            <FileGridPulse cells={28} />
            <div className="mt-6">
              <div className="mb-2 flex items-end justify-between">
                <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-3">
                  Comparing content hashes
                </span>
                <span className="font-mono text-xs tabular-nums text-ink-3">
                  {progress?.currentPath || "…"}
                </span>
              </div>
            </div>
          </GlassCard>
        </div>
      </PageShell>
    );
  }

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
            <AnimatedNumber value={freed} format={(n) => formatBytes(n)} /> recovered
          </h1>
          <p className="mt-2 text-sm text-ink-3">Only your keeper copies remain on disk.</p>
          <div className="mt-7">
            <Button variant="primary" icon={<RefreshCw className="size-4" />} onClick={start}>
              Scan again
            </Button>
          </div>
        </div>
      </PageShell>
    );
  }

  if (stage === "idle") {
    return (
      <PageShell>
        <GlassCard className="relative overflow-hidden p-9">
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background: `radial-gradient(480px 240px at 90% 10%, rgba(99,102,241,0.14), transparent 70%),
                          radial-gradient(360px 200px at 5% 100%, rgba(34,211,238,0.10), transparent 70%)`,
            }}
          />
          <div className="flex items-start justify-between gap-8">
            <div className="max-w-md">
              <Badge tone="cyan">
                <Hash className="size-3" />
                Content-aware
              </Badge>
              <h1 className="mt-4 text-[26px] font-semibold leading-tight tracking-tight">
                Two files, one soul
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-ink-3">
                Finds byte-identical files by size, partial and full SHA-256 hashes — not just by name.
                Keeps your keeper, frees the clones.
              </p>
              <div className="mt-6 flex items-center gap-3">
                <Button variant="primary" icon={<Files className="size-4" />} onClick={start}>
                  Find duplicates
                </Button>
                <div className="flex items-center gap-1.5 text-xs text-ink-3">
                  <ShieldCheck className="size-3.5 text-[var(--wtd-ok)]" />
                  1 file per group always survives
                </div>
              </div>
            </div>
            <div className="hidden w-[300px] shrink-0 md:block">
              <div className="relative">
                <div className="rounded-xl border border-[var(--wtd-edge)] bg-[var(--wtd-card-2)] p-4 font-mono text-[11px] text-ink-3">
                  <div>IMG_2043.jpg <span className="text-[var(--wtd-cyan)]">8.4 MB</span></div>
                  <div className="mt-1 opacity-60">C:\Pictures\Camera\</div>
                  <div className="mt-3">IMG_2043.jpg <span className="text-[var(--wtd-cyan)]">8.4 MB</span></div>
                  <div className="mt-1 opacity-60">C:\Pictures\Backup\</div>
                  <div className="mt-3">IMG_2043.jpg <span className="text-[var(--wtd-cyan)]">8.4 MB</span></div>
                  <div className="mt-1 opacity-60">D:\Photos\2026\May\</div>
                </div>
                <motion.div
                  className="absolute -right-3 -top-3 grid size-9 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-400 shadow-lg shadow-indigo-500/30"
                  animate={{ y: [0, -6, 0] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                >
                  <Copy className="size-4 text-white" />
                </motion.div>
              </div>
            </div>
          </div>
        </GlassCard>
      </PageShell>
    );
  }

  /* results */
  return (
    <PageShell>
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Duplicate groups</h1>
          <p className="mt-1 text-[13px] text-ink-3">
            {groups.length} groups ·{" "}
            <span className="font-semibold text-[var(--wtd-cyan)]">{formatBytes(totalWaste)}</span> recoverable
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => applyStrategy("keep-newest")} icon={<Crown className="size-4" />}>
            Keep newest
          </Button>
          <Button onClick={() => applyStrategy("keep-oldest")}>Keep oldest</Button>
          <Button variant="primary" icon={<RefreshCw className="size-4" />} onClick={start}>
            Rescan
          </Button>
        </div>
      </div>

      <div className="mt-6 space-y-4">
        {groups.map((g, idx) => (
          <GlassCard key={g.id} delay={0.05 * idx} className="overflow-hidden">
            <div className="flex items-center gap-4 border-b border-[var(--wtd-edge)] px-5 py-3.5">
              <div className="grid size-9 place-items-center rounded-xl border border-[var(--wtd-cyan-soft)] bg-[var(--wtd-cyan-soft)] text-[var(--wtd-cyan)]">
                <Copy className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">
                  {g.files[0].path.split("\\").pop() ?? "file"}
                </div>
                <div className="font-mono text-[11px] text-ink-3">
                  SHA-256 {shortHash(g.hash)}… · {g.files.length} copies
                </div>
              </div>
              <Badge tone="rose">−{formatBytes(g.wastedBytes)} if cleaned</Badge>
            </div>
            <div className="divide-y divide-[var(--wtd-edge)]">
              {g.files.map((f) => {
                const keeper = keepMap[g.id] === f.path;
                return (
                  <button
                    key={f.path}
                    onClick={() => setKeepMap((m) => ({ ...m, [g.id]: f.path }))}
                    className={`flex w-full items-center gap-4 px-5 py-3 text-left transition-colors ${
                      keeper ? "bg-emerald-400/[0.06]" : "hover:bg-[var(--wtd-card-2)]"
                    }`}
                  >
                    <div
                      className={`grid size-5 shrink-0 place-items-center rounded-full border transition-all ${
                        keeper
                          ? "border-emerald-400/60 bg-[var(--wtd-ok-soft)] text-[var(--wtd-ok)]"
                          : "border-[var(--wtd-edge-2)]"
                      }`}
                    >
                      {keeper && <Crown className="size-3" />}
                    </div>
                    <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink-3">
                      {f.path}
                    </span>
                    <span className="hidden shrink-0 text-[11px] tabular-nums text-ink-3 sm:block">
                      {formatDate(f.modified)}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-ink-2">
                      {formatBytes(f.bytes)}
                    </span>
                    {keeper ? (
                      <Badge tone="emerald">Keep</Badge>
                    ) : (
                      <Badge tone="rose">
                        <Trash2 className="size-3" />
                        Remove
                      </Badge>
                    )}
                  </button>
                );
              })}
            </div>
          </GlassCard>
        ))}
      </div>

      {/* action bar */}
      <AnimatePresence>
        {removedPaths.length > 0 && (
          <motion.div
            initial={{ y: 90, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 90, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-8 pb-6"
          >
            <div className="glass flex items-center gap-5 px-6 py-4" style={{ background: "rgba(12,17,33,0.94)" }}>
              <div>
                <div className="text-lg font-semibold tabular-nums tracking-tight">
                  {formatBytes(totalWaste)}
                </div>
                <div className="text-[11px] text-ink-3">{removedPaths.length} clones selected</div>
              </div>
              <div className="h-8 w-px bg-[var(--wtd-card-3)]" />
              <Button variant="danger" icon={<Trash2 className="size-4" />} onClick={() => setConfirmOpen(true)}>
                Remove duplicates
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} width="max-w-sm">
        <div className="flex items-start gap-4">
          <div className="grid size-11 shrink-0 place-items-center rounded-2xl border border-[var(--wtd-bad-soft)] bg-[var(--wtd-bad-soft)]">
            <Trash2 className="size-5 text-[var(--wtd-bad)]" />
          </div>
          <div>
            <div className="text-base font-semibold">Remove {removedPaths.length} duplicate copies?</div>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink-3">
              Frees <span className="font-semibold text-ink-2">{formatBytes(totalWaste)}</span>. One keeper
              copy stays for every group.
            </p>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2.5">
          <Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
          <Button variant="danger" onClick={execute}>
            Remove
          </Button>
        </div>
      </Modal>
    </PageShell>
  );
}
