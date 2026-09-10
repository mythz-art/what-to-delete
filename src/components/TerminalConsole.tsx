import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  TerminalSquare,
  Pause,
  Play,
  Trash2,
  Copy,
  Check,
  Maximize2,
  Minimize2,
  X,
  Radar,
  Copy as CopyIcon,
  Trash2 as TrashIcon,
  Wrench,
  Send,
  Lock,
  Sparkles,
} from "lucide-react";
import { api } from "@/lib/api";
import type { LogEntry, TaskInfo } from "@/lib/types";

/* ------------------------------ matrix rain bg ------------------------------ */
/* v2.2 perf: 12fps budget, paused while the window is hidden */

function MatrixRain({ opacity = 0.2 }: { opacity?: number }) {
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
      if (document.hidden) return; // hard pause when window is hidden
      if (t - last < 84) return; // ~12 fps
      last = t;
      ctx.fillStyle = "rgba(1, 8, 5, 0.14)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.font = `${fontSize}px ui-monospace, monospace`;
      for (let i = 0; i < cols.length; i++) {
        const ch = chars[Math.floor(Math.random() * chars.length)];
        const x = i * fontSize;
        const yy = cols[i] * fontSize;
        ctx.fillStyle = Math.random() > 0.975 ? "#d2fbdc" : "#0aff62";
        ctx.fillText(ch, x, yy);
        cols[i] = yy > canvas.height + Math.random() * 200 ? 0 : cols[i] + 1;
      }
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
  CLEAN: "text-teal-300",
  FTP: "text-yellow-300",
  NET: "text-sky-300",
  FS: "text-teal-300",
  SYS: "text-violet-300",
  APP: "text-white",
  TOOL: "text-orange-300",
  VAULT: "text-indigo-300",
};

function stamp(t: number): string {
  const d = new Date(t);
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
}

const LogLineView = memo(function LogLineView({ entry }: { entry: LogEntry }) {
  return (
    <div className="perf-row whitespace-pre-wrap break-all font-mono text-[12.5px] leading-relaxed">
      <span className="text-emerald-800">[{stamp(entry.t)}]</span>
      <span className={`ml-2 font-bold ${TAG_COLOR[entry.tag] ?? "text-emerald-400"}`}>
        {entry.tag.padEnd(5, " ")}
        <span className="text-emerald-800">::</span>
      </span>
      <span className={`ml-2 ${LEVEL_COLOR[entry.level] ?? "text-emerald-200"}`}>{entry.msg}</span>
    </div>
  );
});

/* ------------------------------ stream (one channel) ------------------------------ */
/**
 * Renders ONE log channel:
 *  - taskId == null  -> the global kernel feed (every line, incl. task lines)
 *  - taskId != null  -> that task's private real-time stream (log://task/<id>)
 *
 * v2.2 perf: incoming lines are buffered in a ref and flushed on an 80ms
 * cadence — one setState per batch instead of one per line; rendering is
 * capped at MAX lines and each row opts into content-visibility.
 */
function TerminalStream({ taskId }: { taskId: string | null }) {
  const [lines, setLines] = useState<LogEntry[]>([]);
  const [paused, setPaused] = useState(false);
  const [copied, setCopied] = useState(false);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const pausedRef = useRef(false);
  const linesRef = useRef<LogEntry[]>([]);
  const pendingRef = useRef<LogEntry[]>([]);
  const stickRef = useRef(true);
  const MAX = 900;

  pausedRef.current = paused;
  linesRef.current = lines;

  const push = useCallback((l: LogEntry) => {
    pendingRef.current.push(l);
  }, []);

  // initial snapshot for this channel
  useEffect(() => {
    let alive = true;
    setLines([]);
    pendingRef.current = [];
    const fetcher = taskId ? api.getTaskBuffer(taskId, MAX) : api.getLogBuffer(MAX);
    void fetcher.then((buf) => {
      if (alive) setLines(buf.slice(-MAX));
    });
    return () => {
      alive = false;
    };
  }, [taskId]);

  // live subscription
  useEffect(() => {
    if (taskId) {
      return api.onTaskLog(taskId, push);
    }
    return api.onLogLine(push);
  }, [taskId, push]);

  // batched flush (v2.2 perf fix for scroll lag)
  useEffect(() => {
    const id = setInterval(() => {
      if (pausedRef.current || pendingRef.current.length === 0) return;
      const batch = pendingRef.current;
      pendingRef.current = [];
      setLines((prev) => {
        const next = prev.concat(batch);
        return next.length > MAX ? next.slice(next.length - MAX) : next;
      });
    }, 80);
    return () => clearInterval(id);
  }, []);

  // autoscroll — only when the user is parked at the bottom
  useEffect(() => {
    const el = scrollerRef.current;
    if (el && stickRef.current && !paused) {
      el.scrollTop = el.scrollHeight;
    }
  }, [lines, paused]);

  const onScroll = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }, []);

  const copyAll = useCallback(() => {
    const text = linesRef.current
      .map((l) => `[${stamp(l.t)}] ${l.tag} :: ${l.msg}`)
      .join("\n");
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, []);

  const channelLabel = taskId ? `task:${taskId}` : "kernel";

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-[#02060a]">
      <MatrixRain opacity={0.13} />
      <div className="crt-scanlines pointer-events-none absolute inset-0" />
      <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_120px_rgba(0,0,0,0.85)]" />

      <div
        ref={scrollerRef}
        onScroll={onScroll}
        className="scroll-thin perf-contain relative z-10 min-h-0 flex-1 overflow-y-auto px-4 py-3 text-emerald-200 [text-shadow:0_0_6px_rgba(16,185,129,0.35)]"
      >
        <div className="mb-3 select-none font-mono text-[11px] text-emerald-600">
          ┌─[ WTD://{channelLabel.toUpperCase()} ]──────────────────────────────┐
        </div>
        {lines.length === 0 && (
          <div className="font-mono text-[12px] text-emerald-700">
            {taskId ? "tuning channel… awaiting task events" : "booting teletype… awaiting kernel events"}
          </div>
        )}
        {lines.map((l, i) => (
          <LogLineView key={`${l.t}-${i}-${l.msg.slice(0, 12)}`} entry={l} />
        ))}
        {!paused && lines.length > 0 && (
          <div className="mt-1 font-mono text-[12.5px] text-emerald-300">
            <span className="cursor-blink" />
          </div>
        )}
      </div>

      {/* control strip */}
      <div className="relative z-20 flex items-center gap-1 border-t border-emerald-500/20 bg-black/60 px-2 py-1.5 backdrop-blur">
        <span className="mr-auto flex items-center gap-2 font-mono text-[11px] text-emerald-500">
          <span
            className={`inline-block size-2 rounded-full ${paused ? "bg-amber-400" : "animate-pulse bg-emerald-400 shadow-[0_0_8px_#34d399]"}`}
          />
          wtd@{channelLabel}:~$ {paused ? "PAUSED" : "LIVE"} · {lines.length} lines
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

/* ------------------------------ task tabs ------------------------------ */

const TASK_ICON: Record<string, typeof Radar> = {
  scan: Radar,
  dedup: CopyIcon,
  clean: TrashIcon,
  tool: Wrench,
  transfer: Send,
  vault: Lock,
};

const STATE_DOT: Record<string, string> = {
  running: "bg-emerald-400 animate-pulse shadow-[0_0_8px_#34d399]",
  done: "bg-cyan-300",
  error: "bg-rose-400",
  cancelled: "bg-amber-400",
};

function TabIcon({ task }: { task: TaskInfo }) {
  const Icon = TASK_ICON[task.kind] ?? Sparkles;
  return <Icon className="size-3.5 shrink-0" />;
}

function useTaskTabs() {
  const [tasks, setTasks] = useState<TaskInfo[]>([]);
  const [active, setActive] = useState<string>("all");
  const closedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let alive = true;
    void api.getTasks().then((list) => {
      if (!alive) return;
      // hide tabs the user closed in a previous window session is not tracked —
      // fresh window shows all live tasks
      setTasks(list);
    });
    const un = api.onTaskUpdate((t) => {
      if (!alive) return;
      setTasks((prev) => {
        const idx = prev.findIndex((x) => x.id === t.id);
        if (idx === -1) return [...prev, t];
        const next = [...prev];
        next[idx] = t;
        return next;
      });
      // Windows-Terminal behavior: a NEW running task gets focus
      if (t.state === "running" && !closedRef.current.has(t.id)) {
        setActive(t.id);
      }
    });
    return () => {
      alive = false;
      un();
    };
  }, []);

  const visible = useMemo(
    () => tasks.filter((t) => !closedRef.current.has(t.id)),
    [tasks],
  );

  const closeTab = useCallback((id: string) => {
    closedRef.current.add(id);
    setTasks((prev) => prev.filter((t) => t.id !== id));
    setActive((cur) => (cur === id ? "all" : cur));
  }, []);

  return { tasks: visible, allTasks: tasks, active, setActive, closeTab };
}

function TerminalTabs({
  tasks,
  active,
  onSelect,
  onClose,
}: {
  tasks: TaskInfo[];
  active: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
}) {
  const runningCount = tasks.filter((t) => t.state === "running").length;
  return (
    <div className="scroll-thin flex h-9 shrink-0 select-none items-stretch gap-1 overflow-x-auto border-b border-emerald-500/20 bg-black/70 px-2">
      {/* ALL tab */}
      <button
        onClick={() => onSelect("all")}
        className={`group relative my-1 flex shrink-0 items-center gap-2 rounded-lg px-3 font-mono text-[11px] font-bold tracking-wide transition-colors ${
          active === "all"
            ? "bg-emerald-400/15 text-emerald-200 shadow-[inset_0_0_0_1px_rgba(52,211,153,0.3)]"
            : "text-emerald-600 hover:bg-emerald-400/8 hover:text-emerald-300"
        }`}
        title="All kernel events"
      >
        <TerminalSquare className="size-3.5" />
        ALL
        {runningCount > 0 && (
          <span className="inline-block size-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_#34d399]" />
        )}
      </button>

      {/* task tabs */}
      {tasks.map((t) => {
        const isActive = active === t.id;
        const closable = t.state !== "running";
        return (
          <div
            key={t.id}
            className={`relative my-1 flex shrink-0 items-center gap-2 rounded-lg px-3 font-mono text-[11px] font-bold tracking-wide transition-colors ${
              isActive
                ? "bg-emerald-400/15 text-emerald-200 shadow-[inset_0_0_0_1px_rgba(52,211,153,0.3)]"
                : t.state === "running"
                  ? "text-emerald-500 hover:bg-emerald-400/8 hover:text-emerald-300"
                  : "text-emerald-800 hover:bg-emerald-400/8 hover:text-emerald-600"
            }`}
          >
            <button onClick={() => onSelect(t.id)} className="flex items-center gap-2" title={t.title}>
              <span className={`inline-block size-2 shrink-0 rounded-full ${STATE_DOT[t.state] ?? "bg-emerald-800"}`} />
              <TabIcon task={t} />
              <span className="max-w-44 truncate">{t.title}</span>
              {t.state !== "running" && t.summary && (
                <span className="hidden max-w-56 truncate font-normal text-emerald-700 xl:inline">
                  — {t.summary}
                </span>
              )}
            </button>
            {closable && (
              <button
                onClick={() => onClose(t.id)}
                title="Close tab"
                className="rounded p-0.5 text-emerald-700 transition-colors hover:bg-rose-500/20 hover:text-rose-300"
              >
                <X className="size-3" />
              </button>
            )}
          </div>
        );
      })}
    </div>
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
      title="Open terminal (detached window)"
      className="fixed bottom-6 right-6 z-40 grid size-12 place-items-center rounded-2xl border border-[var(--wtd-accent-line)] bg-[var(--wtd-glass)] text-[var(--wtd-accent-ink)] shadow-[var(--wtd-shadow-lg)] backdrop-blur-xl"
    >
      <TerminalSquare className="size-5" />
      <span className="absolute -right-1 -top-1 inline-block size-3 animate-pulse rounded-full bg-[var(--wtd-ok)] shadow-[0_0_10px_#34d399]" />
    </motion.button>
  );
}

/* ------------------------------ detached window shell ------------------------------ */

export function TerminalWindowApp() {
  const [fs, setFs] = useState(false);
  const { tasks, active, setActive, closeTab } = useTaskTabs();
  const activeTask = active === "all" ? null : active;

  return (
    <div className="crt flex h-screen flex-col overflow-hidden">
      <div
        data-tauri-drag-region
        className="flex h-10 shrink-0 select-none items-center justify-between border-b border-emerald-500/25 bg-black/80 px-3"
      >
        <div className="flex items-center gap-2 font-mono text-[11px] font-bold tracking-[0.18em] text-emerald-400">
          <TerminalSquare className="size-4" />
          WTD://TERMINAL — MULTITASK
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

      <TerminalTabs tasks={tasks} active={active} onSelect={setActive} onClose={closeTab} />

      <div className="min-h-0 flex-1">
        {activeTask === null ? (
          <TerminalStream taskId={null} />
        ) : (
          <TerminalStream key={activeTask} taskId={activeTask} />
        )}
      </div>
    </div>
  );
}
