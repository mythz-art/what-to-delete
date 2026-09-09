import { useEffect, useRef } from "react";
import { motion, useAnimationFrame } from "framer-motion";
import {
  Sparkles,
  Github,
  ShieldCheck,
  Cpu,
  Heart,
  TerminalSquare,
  Layers,
  Zap,
  Lock,
} from "lucide-react";
import { useApp } from "@/lib/store";
import { PageShell } from "@/components/chrome";
import { Badge } from "@/components/ui";
import devAvatar from "@/assets/dev-avatar.jpg";

/* ------------------------------ animated starfield ------------------------------ */

function Starfield() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let stars: { x: number; y: number; z: number }[] = [];

    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      stars = Array.from({ length: 160 }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        z: Math.random() * 1.6 + 0.2,
      }));
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const draw = () => {
      raf = requestAnimationFrame(draw);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const s of stars) {
        s.y += s.z * 0.22;
        if (s.y > canvas.height) {
          s.y = -2;
          s.x = Math.random() * canvas.width;
        }
        const glow = s.z / 1.8;
        ctx.fillStyle = `rgba(${140 + glow * 100},${160 + glow * 80},255,${0.25 + glow * 0.55})`;
        ctx.fillRect(s.x, s.y, s.z, s.z);
      }
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />;
}

/* ------------------------------ orbiting rings ------------------------------ */

function OrbitRings() {
  const rot1 = useRef(0);
  const rot2 = useRef(180);
  const g1 = useRef<HTMLDivElement>(null);
  const g2 = useRef<HTMLDivElement>(null);

  useAnimationFrame((_, delta) => {
    rot1.current += delta * 0.012;
    rot2.current -= delta * 0.008;
    if (g1.current) g1.current.style.transform = `rotate(${rot1.current}deg)`;
    if (g2.current) g2.current.style.transform = `rotate(${rot2.current}deg)`;
  });

  return (
    <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
      <div ref={g1} className="relative size-[460px] max-sm:size-[320px]">
        <div className="absolute inset-0 rounded-full border border-indigo-300/20" />
        <div className="absolute left-1/2 top-0 size-2 -translate-x-1/2 rounded-full bg-cyan-300 shadow-[0_0_14px_#67e8f9]" />
        <div className="absolute bottom-8 left-1/2 size-1.5 -translate-x-1/2 rounded-full bg-fuchsia-300 shadow-[0_0_10px_#f0abfc]" />
      </div>
      <div ref={g2} className="absolute inset-[-70px]">
        <div className="absolute inset-0 rounded-full border border-dashed border-cyan-300/15" />
        <div className="absolute left-[12%] top-[12%] size-2 rounded-full bg-indigo-300 shadow-[0_0_12px_#a5b4fc]" />
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
  { name: "Tauri 2", icon: Layers, tone: "indigo" as const },
  { name: "React 19", icon: Zap, tone: "cyan" as const },
  { name: "Rust", icon: Cpu, tone: "fuchsia" as const },
  { name: "TypeScript", icon: TerminalSquare, tone: "emerald" as const },
  { name: "Tailwind 4", icon: Sparkles, tone: "amber" as const },
  { name: "WebView2", icon: ShieldCheck, tone: "rose" as const },
];

const TIMELINE = [
  { v: "1.1.0", note: "first public drop — junk scanner + vault" },
  { v: "2.0.0", note: "full redesign, real Rust engine, single-exe research" },
  { v: "2.1.0", note: "FTP server, public tunnels, file manager, hacker terminal" },
];

export function AboutPage() {
  const { status } = useApp();
  return (
    <PageShell>
      {/* hero */}
      <div className="relative mb-8 overflow-hidden rounded-3xl border border-white/[0.08] bg-gradient-to-b from-indigo-500/[0.12] via-slate-950 to-slate-950 px-6 py-12 sm:px-10 sm:py-16">
        <Starfield />
        <OrbitRings />
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            background:
              "radial-gradient(600px 300px at 20% 0%, rgba(99,102,241,0.25), transparent 60%), radial-gradient(500px 260px at 85% 100%, rgba(34,211,238,0.18), transparent 55%)",
          }}
        />
        <div className="relative z-10 flex flex-col items-center text-center">
          <motion.div
            initial={{ scale: 0.6, opacity: 0, rotate: -10 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 200, damping: 15 }}
            className="relative"
          >
            <div className="grid size-20 place-items-center rounded-3xl bg-gradient-to-br from-indigo-500 to-cyan-400 shadow-2xl shadow-indigo-500/40">
              <Sparkles className="size-9 text-white" />
            </div>
            <motion.div
              className="absolute -inset-3 rounded-[26px] border border-indigo-300/30"
              animate={{ rotate: 360 }}
              transition={{ duration: 14, repeat: Infinity, ease: "linear" }}
            />
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="mt-6 bg-gradient-to-r from-white via-indigo-100 to-cyan-200 bg-clip-text text-4xl font-bold tracking-tight text-transparent"
          >
            What to Delete?
          </motion.h1>
          <div className="mt-3 text-sm text-slate-400">
            <Typewriter text="reclaim your disk · guard your bytes · stay minimal" />
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <Badge tone="indigo">v2.1.0</Badge>
            <Badge tone="cyan">single-file exe</Badge>
            <Badge tone="emerald">free & open</Badge>
            {status?.osName && <Badge tone="slate">{status.osName}</Badge>}
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* developer card */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6"
        >
          <div className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-indigo-500/10 blur-3xl transition-opacity duration-700 group-hover:opacity-100" />
          <div className="relative z-10">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
              Developer
            </div>
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
              <div className="relative mx-auto sm:mx-0">
                <motion.div
                  className="absolute -inset-1 rounded-2xl bg-gradient-to-br from-indigo-500 via-cyan-400 to-fuchsia-500 opacity-70 blur-[6px]"
                  animate={{ opacity: [0.4, 0.85, 0.4] }}
                  transition={{ duration: 3, repeat: Infinity }}
                />
                <img
                  src={devAvatar}
                  alt="MOHAMMAD TAMIM HOSSEN"
                  className="relative size-24 rounded-2xl object-cover"
                />
                <motion.div
                  className="absolute -bottom-2 -right-2 grid size-7 place-items-center rounded-full border border-slate-950 bg-emerald-400"
                  animate={{ rotate: [0, 14, 0] }}
                  transition={{ duration: 2.4, repeat: Infinity }}
                >
                  <ShieldCheck className="size-4 text-slate-950" />
                </motion.div>
              </div>
              <div className="min-w-0 text-center sm:text-left">
                <div className="truncate text-lg font-semibold tracking-tight">MOHAMMAD TAMIM HOSSEN</div>
                <div className="mt-0.5 text-xs text-slate-500">@tamim65k · full-stack builder</div>
                <a
                  href="https://github.com/tamim65k"
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2 text-xs font-medium text-slate-200 transition-all hover:border-indigo-300/40 hover:bg-indigo-400/10 hover:text-white"
                >
                  <Github className="size-3.5" />
                  github.com/tamim65k
                  <span className="text-slate-500">↗</span>
                </a>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-4 border-t border-white/[0.06] pt-4 text-[11px] text-slate-500">
              <span>20 public repos</span>
              <span>·</span>
              <span>shipping since 2024</span>
              <span>·</span>
              <span className="inline-flex items-center gap-1">
                built with <Heart className="size-3 text-rose-400" /> and caffeine
              </span>
            </div>
          </div>
        </motion.div>

        {/* stack grid */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18 }}
          className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6"
        >
          <div className="mb-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
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
                className="flex flex-col items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.03] p-4"
              >
                <s.icon className="size-6 text-indigo-300" />
                <span className="text-xs font-medium text-slate-300">{s.name}</span>
              </motion.div>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] px-3.5 py-3 text-[11px] leading-relaxed text-emerald-200">
            <Lock className="size-4 shrink-0" />
            No telemetry, no cloud, no accounts. Everything runs locally on your machine.
          </div>
        </motion.div>
      </div>

      {/* version timeline */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.26 }}
        className="mt-5 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6"
      >
        <div className="mb-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
          Release timeline
        </div>
        <div className="relative space-y-4 pl-5">
          <div className="absolute bottom-2 left-1 top-2 w-px bg-gradient-to-b from-indigo-400/60 via-cyan-400/40 to-transparent" />
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
                    ? "bg-cyan-300 shadow-[0_0_10px_#67e8f9]"
                    : "bg-indigo-400/70"
                }`}
              />
              <Badge tone={i === TIMELINE.length - 1 ? "cyan" : "indigo"}>v{t.v}</Badge>
              <span className="text-xs text-slate-400">{t.note}</span>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </PageShell>
  );
}
