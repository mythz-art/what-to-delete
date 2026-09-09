import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  TerminalSquare,
  Pause,
  Play,
  Trash2,
  Copy,
  Check,
  PictureInPicture2,
  Maximize2,
  Minimize2,
  X,
  ChevronUp,
} from "lucide-react";
import { api } from "@/lib/api";
import type { LogEntry } from "@/lib/types";

/* ------------------------------ matrix rain bg ------------------------------ */

function MatrixRain({ opacity = 0.22 }: { opacity?: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let cols: number[] = [];
    const fontSize = 14;
    const chars = "アイウエオカキクケコサシスセソ0123456789ABCDEF$#@%&*+=";

    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      const n = Math.ceil(canvas.width / fontSize);
      cols = Array.from({ length: n }, () => Math.random() * -50);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    let last = 0;
    const draw = (t: number) => {
      raf = requestAnimationFrame(draw);
      if (t - last < 50) return;
      last = t;
      ctx.fillStyle = "rgba(1, 8, 5, 0.14)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.font = `${fontSize}px ui-monospace, monospace`;
      cols.forEach((y, i) => {
        const ch = chars[Math.floor(Math.random() * chars.length)];
        const x = i * fontSize;
        const yy = y * fontSize;
        ctx.fillStyle = Math.random() > 0.975 ? "#d2fbdc" : "#0aff62";
        ctx.fillText(ch, x, yy);
        cols[i] = yy > canvas.height + Math.random() * 200 ? 0 : y + 1;
      });
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" style={{ opacity }} />;
}

/* ------------------------------ log line render ------------------------------ */

const LEVEL_COLOR: Record<string, string> = {
  info: "text-emerald-300",
  ok: "text-lime-300",
  warn: "text-amber-300",
  error: "text-rose-400",
  dim: "text-emerald-700/80",
};

const TAG_COLOR: Record<string, string> = {
  SCAN: "text-cyan-300",
  DEDUP: "text-fuchsia-300",
  FTP: "text-yellow-300",
  NET: "text-sky-300",
  FS: "text-teal-300",
  SYS: "text-violet-300",
  APP: "text-white",
  TOOL: "text-orange-300",
};

function stamp(t: number): string {
  const d = new Date(t);
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
}

function LogLineView({ entry, tick }: { entry: LogEntry; tick: number }) {
  const dimmed = tick % 2 === 0;
  return (
    <div className="whitespace-pre-wrap break-all font-mono text-[12.5px] leading-relaxed">
      <span className="text-emerald-800">[{stamp(entry.t)}]</span>
      <span className={`ml-2 font-bold ${TAG_COLOR[entry.tag] ?? "text-emerald-400"}`}>
        {entry.tag.padEnd(5, " ")}
        <span className="text-emerald-800">::</span>
      </span>
      <span className={`ml-2 ${LEVEL_COLOR[entry.level] ?? "text-emerald-200"}`}>{entry.msg}</span>
      <span className={`ml-1 inline-block h-[13px] w-[7px] translate-y-[2px] ${dimmed ? "bg-emerald-400/90" : "bg-emerald-400/30"}`} />
    </div>
  );
}

/* ------------------------------ core terminal ------------------------------ */

export function TerminalCore({ className = "" }: { className?: string }) {
  const [lines, setLines] = useState<LogEntry[]>([]);
  const [paused, setPaused] = useState(false);
  const [copied, setCopied] = useState(false);
  const [tick, setTick] = useState(0);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const pausedRef = useRef(false);
  const linesRef = useRef<LogEntry[]>([]);
  const MAX = 600;

  pausedRef.current = paused;
  linesRef.current = lines;

  useEffect(() => {
    void api.getLogBuffer(400).then((buf) => setLines(buf.slice(-MAX)));
  }, []);

  useEffect(() => api.onLogLine((l) => {
    if (pausedRef.current) return;
    setLines((prev) => {
      const next = [...prev, l];
      return next.length > MAX ? next.slice(next.length - MAX) : next;
    });
  }), []);

  // blinking cursor tick
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 530);
    return () => clearInterval(id);
  }, []);

  // autoscroll
  useEffect(() => {
    const el = scrollerRef.current;
    if (el && !paused) {
      el.scrollTop = el.scrollHeight;
    }
  }, [lines, paused]);

  const copyAll = useCallback(() => {
    const text = linesRef.current
      .map((l) => `[${stamp(l.t)}] ${l.tag} :: ${l.msg}`)
      .join("\n");
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, []);

  return (
    <div className={`relative flex h-full min-h-0 flex-col overflow-hidden bg-[#02060a] ${className}`}>
      <MatrixRain opacity={0.16} />
      {/* scanlines + vignette */}
      <div className="crt-scanlines pointer-events-none absolute inset-0" />
      <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_120px_rgba(0,0,0,0.85)]" />

      <div
        ref={scrollerRef}
        className="scroll-thin relative z-10 min-h-0 flex-1 overflow-y-auto px-4 py-3 text-emerald-200 [text-shadow:0_0_6px_rgba(16,185,129,0.35)]"
      >
        <div className="mb-3 select-none font-mono text-[11px] text-emerald-600">
          ┌─[ WTD://KERNEL-LOG ]────────────────────────────┐
        </div>
        {lines.length === 0 && (
          <div className="font-mono text-[12px] text-emerald-700">
            booting teletype… awaiting kernel events
          </div>
        )}
        {lines.map((l, i) => (
          <LogLineView key={`${l.t}-${i}-${l.msg.slice(0, 12)}`} entry={l} tick={tick} />
        ))}
      </div>

      {/* control strip */}
      <div className="relative z-20 flex items-center gap-1 border-t border-emerald-500/20 bg-black/60 px-2 py-1.5 backdrop-blur">
        <span className="mr-auto flex items-center gap-2 font-mono text-[11px] text-emerald-500">
          <span className="inline-block size-2 animate-pulse rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
          wtd@kernel:~$ {paused ? "PAUSED" : "LIVE"} · {lines.length} lines
        </span>
        <button
          onClick={() => setPaused((p) => !p)}
          title={paused ? "Resume" : "Pause"}
          className="rounded p-1.5 text-emerald-400/80 transition-colors hover:bg-emerald-400/10 hover:text-emerald-300"
        >
          {paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
        </button>
        <button
          onClick={() => setLines([])}
          title="Clear"
          className="rounded p-1.5 text-emerald-400/80 transition-colors hover:bg-emerald-400/10 hover:text-emerald-300"
        >
          <Trash2 className="size-3.5" />
        </button>
        <button
          onClick={copyAll}
          title="Copy log"
          className="rounded p-1.5 text-emerald-400/80 transition-colors hover:bg-emerald-400/10 hover:text-emerald-300"
        >
          {copied ? <Check className="size-3.5 text-lime-300" /> : <Copy className="size-3.5" />}
        </button>
        {api.isTerminalWindow() && (
          <button
            onClick={api.terminalWindowFullscreen}
            title="Toggle fullscreen"
            className="rounded p-1.5 text-emerald-400/80 transition-colors hover:bg-emerald-400/10 hover:text-emerald-300"
          >
            <Maximize2 className="size-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------ drawer (main window) ------------------------------ */

export function TerminalDrawer({
  open,
  onClose,
  onDetach,
}: {
  open: boolean;
  onClose: () => void;
  onDetach: () => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "42vh", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          className="relative z-30 shrink-0 overflow-hidden border-t border-emerald-400/30 shadow-[0_-8px_40px_rgba(16,185,129,0.15)]"
        >
          <div className="flex h-9 items-center justify-between border-b border-emerald-500/20 bg-black/70 px-3">
            <div
              data-tauri-drag-region
              className="flex flex-1 items-center gap-2 font-mono text-[11px] font-bold tracking-[0.18em] text-emerald-400"
            >
              <TerminalSquare className="size-3.5" />
              WTD://TERMINAL — LIVE KERNEL FEED
            </div>
            <div className="flex items-center gap-0.5">
              <button
                onClick={onDetach}
                title="Detach to resizable window"
                className="rounded p-1.5 text-emerald-400/80 transition-colors hover:bg-emerald-400/10 hover:text-emerald-200"
              >
                <PictureInPicture2 className="size-4" />
              </button>
              <button
                onClick={onClose}
                title="Hide terminal"
                className="rounded p-1.5 text-emerald-400/80 transition-colors hover:bg-rose-500/20 hover:text-rose-300"
              >
                <ChevronUp className="size-4" />
              </button>
            </div>
          </div>
          <div className="h-[calc(42vh-36px)] min-h-0">
            <TerminalCore />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ------------------------------ floating open button ------------------------------ */

export function TerminalFAB({ onClick }: { onClick: () => void }) {
  return (
    <motion.button
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.94 }}
      onClick={onClick}
      title="Open hacker terminal"
      className="fixed bottom-6 right-6 z-40 grid size-12 place-items-center rounded-2xl border border-emerald-400/40 bg-black/80 text-emerald-300 shadow-[0_0_28px_rgba(16,185,129,0.35)] backdrop-blur"
    >
      <TerminalSquare className="size-5" />
      <span className="absolute -right-1 -top-1 inline-block size-3 animate-pulse rounded-full bg-emerald-400 shadow-[0_0_10px_#34d399]" />
    </motion.button>
  );
}

/* ------------------------------ detached window shell ------------------------------ */

export function TerminalWindowApp() {
  const [fs, setFs] = useState(false);
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#02060a]">
      <div
        data-tauri-drag-region
        className="flex h-10 shrink-0 select-none items-center justify-between border-b border-emerald-500/25 bg-black/80 px-3"
      >
        <div className="flex items-center gap-2 font-mono text-[11px] font-bold tracking-[0.18em] text-emerald-400">
          <TerminalSquare className="size-4" />
          WTD://TERMINAL
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              api.terminalWindowFullscreen();
              setFs((f) => !f);
            }}
            className="rounded p-2 text-emerald-400/80 transition-colors hover:bg-emerald-400/10 hover:text-emerald-200"
            title="Fullscreen"
          >
            {fs ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </button>
          <button
            onClick={api.windowClose}
            className="rounded p-2 text-emerald-400/80 transition-colors hover:bg-rose-500/20 hover:text-rose-300"
            title="Close"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <TerminalCore />
      </div>
    </div>
  );
}
