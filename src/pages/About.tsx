import { useEffect, useRef } from "react";
import { motion, useAnimationFrame } from "framer-motion";
import {
  Sparkles,
  Github,
  ShieldCheck,
  Cpu,
  TerminalSquare,
  Layers,
  Zap,
  Lock,
  ScanSearch,
  Copy,
  Trash2,
  Wrench,
  Send,
} from "lucide-react";
import { useApp } from "@/lib/store";
import { PageShell } from "@/components/chrome";
import { Badge, Logo } from "@/components/ui";

/* ------------------------------ orbiting rings ------------------------------ */

function OrbitRings() {
  const rot1 = useRef(0);
  const rot2 = useRef(180);
  const g1 = useRef<HTMLDivElement>(null);
  const g2 = useRef<HTMLDivElement>(null);

  useAnimationFrame((_, delta) => {
    if (document.hidden) return;
    rot1.current += delta * 0.012;
    rot2.current -= delta * 0.008;
    if (g1.current) g1.current.style.transform = `rotate(${rot1.current}deg)`;
    if (g2.current) g2.current.style.transform = `rotate(${rot2.current}deg)`;
  });

  return (
    <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
      <div ref={g1} className="relative size-[460px] max-sm:size-[320px]">
        <div className="absolute inset-0 rounded-full border border-[var(--wtd-accent-line)]" />
        <div className="absolute left-1/2 top-0 size-2 -translate-x-1/2 rounded-full bg-[var(--wtd-accent-2)] shadow-[0_0_14px_var(--wtd-accent-2)]" />
        <div className="absolute bottom-8 left-1/2 size-1.5 -translate-x-1/2 rounded-full bg-[var(--wtd-fuchsia)] shadow-[0_0_10px_var(--wtd-fuchsia)]" />
      </div>
      <div ref={g2} className="absolute inset-[-70px]">
        <div className="absolute inset-0 rounded-full border border-dashed border-[var(--wtd-accent-line)]" />
        <div className="absolute left-[12%] top-[12%] size-2 rounded-full bg-[var(--wtd-accent)] shadow-[0_0_12px_var(--wtd-accent)]" />
      </div>
    </div>
  );
}

/* ------------------------------ typewriter ------------------------------ */

function Typewriter({ text, className = "" }: { text: string; className?: string }) {
  const spanRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = spanRef.current;
    if (!el) return;
    let i = 0;
    let timer: ReturnType<typeof setInterval>;
    const start = () => {
      timer = setInterval(() => {
        i = (i + 1) % (text.length + 26); // pause at end
        el.textContent = text.slice(0, Math.min(i, text.length));
        el.classList.toggle("cursor-blink", true);
      }, 55);
    };
    const t = setTimeout(start, 400);
    return () => {
      clearTimeout(t);
      clearInterval(timer);
    };
  }, [text]);
  return <span ref={spanRef} className={`font-mono ${className}`} />;
}

/* ------------------------------ about page ------------------------------ */

const STACK = [
  { name: "Tauri 2", icon: Layers },
  { name: "React 19", icon: Zap },
  { name: "Rust", icon: Cpu },
  { name: "TypeScript", icon: TerminalSquare },
  { name: "Tailwind 4", icon: Sparkles },
  { name: "WebView2", icon: ShieldCheck },
];

const TASK_KINDS = [
  { name: "Junk scans", icon: ScanSearch },
  { name: "Duplicate hunts", icon: Copy },
  { name: "Wipe jobs", icon: Trash2 },
  { name: "Tool runs", icon: Wrench },
  { name: "Transfers", icon: Send },
];

const TIMELINE = [
  { v: "1.1.0", note: "first public drop — junk scanner + vault" },
  { v: "2.0.0", note: "full redesign, real Rust engine, single-exe research" },
  { v: "2.1.0", note: "FTP server, public tunnels, file manager, hacker terminal" },
  { v: "2.2.0", note: "multi-task terminal with per-task logs, FTP fix, premium light/dark redesign" },
];

export function AboutPage() {
  const { status } = useApp();
  return (
    <PageShell>
      {/* hero */}
      <div className="panel relative mb-8 overflow-hidden px-6 py-12 text-center sm:px-10 sm:py-16">
        <OrbitRings />
        <div
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            background:
              "radial-gradient(600px 300px at 20% 0%, var(--wtd-accent-soft), transparent 60%), radial-gradient(500px 260px at 85% 100%, var(--wtd-cyan-soft), transparent 55%)",
          }}
        />
        <div className="relative z-10 flex flex-col items-center">
          <motion.div
            initial={{ scale: 0.6, opacity: 0, rotate: -10 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 200, damping: 15 }}
            className="relative"
          >
            <Logo size={88} />
            <motion.div
              className="absolute -inset-3 rounded-[26px] border border-[var(--wtd-accent-line)]"
              animate={{ rotate: 360 }}
              transition={{ duration: 14, repeat: Infinity, ease: "linear" }}
            />
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="text-gradient mt-6 text-4xl font-bold tracking-tight"
          >
            What to Delete?
          </motion.h1>
          <div className="mt-3 text-sm text-ink-3">
            <Typewriter text="reclaim your disk · guard your bytes · stay minimal" />
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <Badge tone="indigo">v2.2.0</Badge>
            <Badge tone="cyan">single-file exe</Badge>
            <Badge tone="emerald">free & open</Badge>
            {status?.osName && <Badge tone="slate">{status.osName}</Badge>}
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* author card — mythz only */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="panel group relative overflow-hidden p-6"
        >
          <div
            className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full blur-3xl transition-opacity duration-700"
            style={{ background: "var(--wtd-accent-soft)" }}
          />
          <div className="relative z-10">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-3">
              Author
            </div>
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
              <div className="relative mx-auto sm:mx-0">
                <motion.div
                  className="absolute -inset-1 rounded-2xl blur-[6px]"
                  style={{
                    background:
                      "linear-gradient(135deg, var(--wtd-accent), var(--wtd-accent-2), var(--wtd-fuchsia))",
                    opacity: 0.55,
                  }}
                  animate={{ opacity: [0.35, 0.7, 0.35] }}
                  transition={{ duration: 3, repeat: Infinity }}
                />
                <div className="relative grid size-24 place-items-center rounded-2xl bg-[var(--wtd-card)]">
                  <span className="text-gradient text-4xl font-bold tracking-tight">m</span>
                </div>
                <motion.div
                  className="absolute -bottom-2 -right-2 grid size-7 place-items-center rounded-full bg-[var(--wtd-card)] text-[var(--wtd-ok)]"
                  animate={{ rotate: [0, 14, 0] }}
                  transition={{ duration: 2.4, repeat: Infinity }}
                >
                  <ShieldCheck className="size-4" />
                </motion.div>
              </div>
              <div className="min-w-0 text-center sm:text-left">
                <div className="truncate text-lg font-semibold tracking-tight text-ink">mythz</div>
                <div className="mt-0.5 text-xs text-ink-3">builder · disk guardian maintainer</div>
                <a
                  href="https://github.com/mythz-art"
                  target="_blank"
                  rel="noreferrer"
                  className="btn-ghost mt-3 inline-flex items-center gap-2 rounded-xl border border-[var(--wtd-edge)] px-3.5 py-2 text-xs font-medium text-ink-2 transition-all hover:border-[var(--wtd-accent-line)] hover:text-ink"
                >
                  <Github className="size-3.5" />
                  github.com/mythz-art
                </a>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-3 border-t border-[var(--wtd-edge)] pt-4 text-[11px] text-ink-3">
              <span>no accounts</span>
              <span>·</span>
              <span>no telemetry</span>
              <span>·</span>
              <span>local-first</span>
            </div>
          </div>
        </motion.div>

        {/* stack grid */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18 }}
          className="panel p-6"
        >
          <div className="mb-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-3">
            Tech stack
          </div>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {STACK.map((s, i) => (
              <motion.div
                key={s.name}
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.22 + i * 0.06 }}
                whileHover={{ y: -3, scale: 1.03 }}
                className="inset flex flex-col items-center gap-2 p-4"
              >
                <s.icon className="size-6 text-[var(--wtd-accent-ink)]" />
                <span className="text-xs font-medium text-ink-2">{s.name}</span>
              </motion.div>
            ))}
          </div>
          <div className="inset mt-4 flex items-start gap-2 px-3.5 py-3 text-[11px] leading-relaxed text-[var(--wtd-ok)]">
            <Lock className="size-4 shrink-0" />
            No telemetry, no cloud, no accounts. Everything runs locally on your machine.
          </div>
        </motion.div>
      </div>

      {/* v2.2 multitask terminal feature strip */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.22 }}
        className="panel mt-5 p-6"
      >
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-3">
            v2.2 — multitask terminal
          </div>
          <Badge tone="cyan">
            <TerminalSquare className="size-3" />
            per-task log channels
          </Badge>
        </div>
        <p className="mt-3 text-[13px] leading-relaxed text-ink-2">
          Every job now opens its own tab in the detached terminal window — like a Windows Terminal for
          your disk. Parallel scans, hunts, wipes and transfers each stream a private, real-time log
          with process detail and a final result summary.
        </p>
        <div className="mt-4 flex flex-wrap gap-2.5">
          {TASK_KINDS.map((k) => (
            <span
              key={k.name}
              className="inset inline-flex items-center gap-2 px-3 py-2 text-[11px] font-medium text-ink-2"
            >
              <k.icon className="size-3.5 text-[var(--wtd-accent-ink)]" />
              {k.name}
            </span>
          ))}
        </div>
      </motion.div>

      {/* version timeline */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.26 }}
        className="panel mt-5 p-6"
      >
        <div className="mb-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-3">
          Release timeline
        </div>
        <div className="relative space-y-4 pl-5">
          <div
            className="absolute bottom-2 left-1 top-2 w-px"
            style={{
              background: "linear-gradient(180deg, var(--wtd-accent), var(--wtd-accent-2), transparent)",
            }}
          />
          {TIMELINE.map((t, i) => (
            <motion.div
              key={t.v}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 + i * 0.1 }}
              className="relative flex items-center gap-3"
            >
              <span
                className={`absolute -left-5 size-2.5 rounded-full ${
                  i === TIMELINE.length - 1
                    ? "bg-[var(--wtd-accent-2)] shadow-[0_0_10px_var(--wtd-accent-2)]"
                    : "bg-[var(--wtd-accent)]"
                }`}
              />
              <Badge tone={i === TIMELINE.length - 1 ? "cyan" : "indigo"}>v{t.v}</Badge>
              <span className="text-xs text-ink-3">{t.note}</span>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </PageShell>
  );
}
