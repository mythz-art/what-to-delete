import { motion } from "framer-motion";
import {
  Sparkles,
  Files,
  HardDrive,
  Zap,
  ChevronRight,
  ArrowUpRight,
  ShieldCheck,
  Clock,
  FolderOpen,
  Cpu,
  FileSearch,
  TerminalSquare,
  Globe,
} from "lucide-react";
import { useApp } from "@/lib/store";
import { formatBytes, formatCount, percent, timeAgo } from "@/lib/format";
import { AnimatedNumber, Badge, GaugeBar, GlassCard, SectionHeader, StatRing } from "@/components/ui";
import { PageShell } from "@/components/chrome";
import type { DriveInfo, JunkCategory } from "@/lib/types";

const DRIVE_ACCENT: Record<DriveInfo["kind"], string> = {
  nvme: "from-indigo-500/80 to-cyan-400/80",
  ssd: "from-sky-500/80 to-indigo-400/80",
  hdd: "from-violet-500/80 to-indigo-400/80",
};

function DriveCard({ drive, delay, onOpen }: { drive: DriveInfo; delay: number; onOpen: () => void }) {
  const pct = percent(drive.usedBytes, drive.totalBytes);
  const free = drive.totalBytes - drive.usedBytes;
  return (
    <GlassCard hover delay={delay} className="flex-1 p-5">
      <button onClick={onOpen} className="w-full text-left focus-ring" title={`Open ${drive.letter} in file manager`}>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="relative">
              {/* stack motif */}
              <div className="absolute -left-1.5 -top-1.5 size-11 rotate-[-8deg] rounded-xl border border-[var(--wtd-edge)]" />
              <div className="absolute -left-1 -top-1 size-11 rotate-[-4deg] rounded-xl border border-[var(--wtd-edge-2)] bg-[var(--wtd-card-2)]" />
              <div
                className={`relative grid size-11 place-items-center rounded-xl bg-gradient-to-br ${DRIVE_ACCENT[drive.kind]} shadow-lg shadow-black/40`}
              >
                <HardDrive className="size-5 text-white" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-semibold tracking-tight">{drive.letter}</span>
                <span className="text-sm text-ink-3">{drive.label}</span>
              </div>
              <div className="mt-1 flex items-center gap-1.5">
                <Badge tone={drive.kind === "nvme" ? "cyan" : "slate"}>{drive.kind.toUpperCase()}</Badge>
                {drive.fsType && <Badge tone="slate">{drive.fsType}</Badge>}
              </div>
            </div>
          </div>
          <span className="text-sm font-semibold tabular-nums text-ink-2">{pct}%</span>
        </div>
        <div className="mt-5">
          <GaugeBar percent={pct} danger={pct > 85} />
          <div className="mt-2.5 flex justify-between text-[11px] text-ink-3">
            <span>
              <span className="font-medium tabular-nums text-ink-2">{formatBytes(drive.usedBytes)}</span> used
            </span>
            <span>
              <span className="font-medium tabular-nums text-ink-2">{formatBytes(free)}</span> free
            </span>
          </div>
        </div>
      </button>
      <button
        onClick={onOpen}
        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-[var(--wtd-edge)] bg-[var(--wtd-card-2)] py-1.5 text-[11px] font-medium text-ink-3 transition-all hover:border-[var(--wtd-accent-line)] hover:bg-[var(--wtd-accent-soft)] hover:text-[var(--wtd-accent-ink)]"
      >
        <FolderOpen className="size-3.5" />
        Open in File Manager
      </button>
    </GlassCard>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  format,
  hint,
  delay,
  tone = "indigo",
}: {
  icon: typeof Zap;
  label: string;
  value: number;
  format: (n: number) => string;
  hint: string;
  delay: number;
  tone?: "indigo" | "cyan" | "violet";
}) {
  const tones = {
    indigo: "text-[var(--wtd-accent-ink)] bg-[var(--wtd-accent-soft)] border-[var(--wtd-accent-line)]",
    cyan: "text-[var(--wtd-cyan)] bg-[var(--wtd-cyan-soft)] border-[var(--wtd-cyan-soft)]",
    violet: "text-[var(--wtd-violet)] bg-[var(--wtd-violet-soft)] border-[var(--wtd-violet-soft)]",
  };
  return (
    <GlassCard hover delay={delay} className="flex-1 p-5">
      <div className="flex items-center gap-3">
        <div className={`grid size-9 place-items-center rounded-xl border ${tones[tone]}`}>
          <Icon className="size-4.5" style={{ width: 18, height: 18 }} />
        </div>
        <span className="text-[12px] font-medium text-ink-3">{label}</span>
      </div>
      <div className="mt-4 text-[28px] font-semibold tracking-tight">
        <AnimatedNumber value={value} format={format} />
      </div>
      <div className="mt-1 text-[11px] leading-relaxed text-ink-3">{hint}</div>
    </GlassCard>
  );
}

const INSIGHTS: { title: string; bytes: number; category: JunkCategory["id"]; desc: string }[] = [
  { title: "Windows Update cache", bytes: 3.3 * 1024 ** 3, category: "updates", desc: "38 leftover update packages" },
  { title: "Recycle Bin", bytes: 6.1 * 1024 ** 3, category: "recycle", desc: "3 large items you deleted" },
  { title: "Browser caches", bytes: 3.1 * 1024 ** 3, category: "browser", desc: "Chrome, Edge and Firefox" },
  { title: "Crash dumps & logs", bytes: 1.2 * 1024 ** 3, category: "logs", desc: "9 dumps from failed apps" },
];

export function DashboardPage() {
  const { status, navigate } = useApp();
  const health = status?.healthScore ?? 0;
  const reclaimable = status?.reclaimableBytes ?? 0;
  const ram = status?.ram;
  const ramPct = ram && ram.totalBytes > 0 ? percent(ram.usedBytes, ram.totalBytes) : 0;

  const openDrive = (letter: string) =>
    navigate("files", { explorerPath: `${letter}\\`, filesTab: "explorer" });

  return (
    <PageShell>
      {/* hero */}
      <div className="grid gap-4 xl:grid-cols-[minmax(340px,460px)_minmax(0,1fr)]">
        <GlassCard className="relative flex min-w-0 items-center gap-7 overflow-hidden p-7 max-xl:justify-center max-xl:text-center">
          <div
            className="pointer-events-none absolute inset-0 opacity-50"
            style={{
              background: "radial-gradient(320px 200px at 30% 20%, rgba(99,102,241,0.14), transparent 70%)",
            }}
          />
          <StatRing
            value={health}
            label={<AnimatedNumber value={health} format={(n) => String(Math.round(n))} />}
            sublabel="Disk health"
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center justify-center gap-2 max-xl:justify-center">
              <Badge tone="amber">
                <Clock className="size-3" />
                {timeAgo(status?.lastScanAt ?? null)}
              </Badge>
              {status?.osName && <Badge tone="slate">{status.osName}</Badge>}
            </div>
            <h1 className="mt-3 text-xl font-semibold leading-snug tracking-tight">
              {health > 80 ? "Your disks are in great shape" : health > 55 ? "Room to breathe" : "Time for a cleanup"}
            </h1>
            <p className="mt-2 max-w-[260px] text-[13px] leading-relaxed text-ink-3 max-xl:mx-auto">
              {formatBytes(reclaimable)} of reclaimable space detected across your drives. One scan away
              from a lighter machine.
            </p>
            <div className="mt-5 flex flex-wrap gap-2.5 max-xl:justify-center">
              <button
                onClick={() => navigate("cleanup")}
                className="btn-gradient inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium focus-ring"
              >
                <Sparkles className="size-4" />
                Scan &amp; Clean
              </button>
              <button
                onClick={() => navigate("duplicates")}
                className="inline-flex items-center gap-2 rounded-xl border border-[var(--wtd-edge)] bg-[var(--wtd-card-2)] px-4 py-2.5 text-sm font-medium text-ink-2 transition-colors hover:border-[var(--wtd-edge-2)] hover:bg-[var(--wtd-card-3)] focus-ring"
              >
                <Files className="size-4" />
                Duplicates
              </button>
            </div>
          </div>
        </GlassCard>

        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          <StatTile
            icon={Zap}
            label="Reclaimable junk"
            value={reclaimable}
            format={(n) => formatBytes(n)}
            hint="Temp files, caches, update leftovers"
            delay={0.05}
          />
          <StatTile
            icon={Files}
            label="Duplicate waste"
            value={5.2 * 1024 ** 3}
            format={(n) => formatBytes(n)}
            hint="6 groups of identical files"
            delay={0.12}
            tone="cyan"
          />
          <StatTile
            icon={Cpu}
            label="Memory in use"
            value={ramPct}
            format={(n) => `${Math.round(n)}%`}
            hint={ram ? `${formatBytes(ram.usedBytes)} of ${formatBytes(ram.totalBytes, 0)} RAM` : "RAM monitor"}
            delay={0.19}
            tone="violet"
          />
          <StatTile
            icon={ArrowUpRight}
            label="Largest single file"
            value={18.2 * 1024 ** 3}
            format={(n) => formatBytes(n)}
            hint="E:\\VMs\\win11-dev.vhdx — untouched 41 days"
            delay={0.26}
            tone="cyan"
          />
        </div>
      </div>

      {/* quick actions */}
      <div className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {[
          { label: "File Manager", icon: FolderOpen, page: "files" as const, ctx: { filesTab: "explorer" } },
          { label: "Large Files", icon: FileSearch, page: "files" as const, ctx: { filesTab: "large" } },
          { label: "Share Online", icon: Globe, page: "share" as const, ctx: null },
          { label: "Terminal", icon: TerminalSquare, page: null, ctx: null, terminal: true },
        ].map((a) => (
          <button
            key={a.label}
            onClick={() => {
              if (a.terminal) {
                window.dispatchEvent(new CustomEvent("wtd:open-terminal"));
              } else if (a.page) {
                navigate(a.page, a.ctx ?? undefined);
              }
            }}
            className="flex items-center gap-2.5 rounded-xl border border-[var(--wtd-edge)] bg-[var(--wtd-card-2)] px-4 py-3 text-xs font-medium text-ink-2 transition-all hover:border-[var(--wtd-accent-line)] hover:bg-[var(--wtd-accent-soft)] hover:text-ink"
          >
            <a.icon className="size-4 text-[var(--wtd-accent-ink)]" />
            {a.label}
          </button>
        ))}
      </div>

      {/* drives */}
      <div className="mt-8">
        <SectionHeader
          title="Drives"
          subtitle="Live capacity across every volume"
          right={<Badge tone="slate">{formatCount(status?.drives.length ?? 0)} volumes</Badge>}
        />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {(status?.drives ?? []).map((d, i) => (
            <DriveCard key={d.letter} drive={d} delay={0.08 * i} onOpen={() => openDrive(d.letter)} />
          ))}
        </div>
      </div>

      {/* insights */}
      <div className="mt-8">
        <SectionHeader title="Insights" subtitle="What is eating your space right now" />
        <GlassCard delay={0.1} className="divide-y divide-[var(--wtd-edge)]">
          {INSIGHTS.map((ins, i) => (
            <motion.button
              key={ins.title}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 + i * 0.06, duration: 0.35 }}
              onClick={() => navigate("cleanup", { category: ins.category })}
              className="group flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-[var(--wtd-card-2)]"
            >
              <div className="grid size-9 shrink-0 place-items-center rounded-xl border border-[var(--wtd-edge)] bg-[var(--wtd-card-2)] text-ink-3 group-hover:text-[var(--wtd-accent-ink)]">
                <Sparkles className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-ink-2">{ins.title}</div>
                <div className="text-xs text-ink-3">{ins.desc}</div>
              </div>
              <span className="text-sm font-semibold tabular-nums text-ink-2">{formatBytes(ins.bytes)}</span>
              <ChevronRight className="size-4 text-ink-4 transition-transform group-hover:translate-x-1 group-hover:text-ink-2" />
            </motion.button>
          ))}
        </GlassCard>
      </div>

      {/* safety footer */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="mt-8 flex items-center gap-3 rounded-xl border border-emerald-400/15 bg-emerald-400/[0.04] px-4 py-3"
      >
        <ShieldCheck className="size-4.5 shrink-0 text-[var(--wtd-ok)]" style={{ width: 18, height: 18 }} />
        <p className="text-xs leading-relaxed text-ink-3">
          Safety guard active — every deletion asks first, and system-critical files are always excluded.
        </p>
      </motion.div>
    </PageShell>
  );
}
