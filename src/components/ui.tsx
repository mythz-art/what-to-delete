import {
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { AnimatePresence, motion, useMotionValue, useSpring } from "framer-motion";
import { CheckCircle2, AlertTriangle, Sparkles, Loader2 } from "lucide-react";
import type { Toast } from "@/lib/store";

/* ---------------------------------- card ---------------------------------- */

export function GlassCard({
  children,
  className = "",
  hover = false,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] }}
      className={`glass ${hover ? "glass-hover" : ""} ${className}`}
    >
      {children}
    </motion.div>
  );
}

/* --------------------------------- button --------------------------------- */

type BtnVariant = "primary" | "ghost" | "danger" | "outline";

export function Button({
  variant = "ghost",
  loading = false,
  icon,
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: BtnVariant;
  loading?: boolean;
  icon?: ReactNode;
}) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium focus-ring transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98]";
  const styles: Record<BtnVariant, string> = {
    primary: "btn-gradient",
    ghost: "bg-white/[0.05] border border-white/10 text-slate-200 hover:bg-white/10 hover:border-white/20",
    danger:
      "bg-rose-500/15 border border-rose-400/30 text-rose-200 hover:bg-rose-500/25 hover:border-rose-400/50 shadow-lg shadow-rose-500/10",
    outline: "border border-indigo-400/40 text-indigo-200 hover:bg-indigo-400/10",
  };
  return (
    <button className={`${base} ${styles[variant]} ${className}`} {...rest}>
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

/* ---------------------------------- badge ---------------------------------- */

export function Badge({
  children,
  tone = "slate",
  className = "",
}: {
  children: ReactNode;
  tone?: "slate" | "indigo" | "cyan" | "emerald" | "amber" | "rose" | "fuchsia";
  className?: string;
}) {
  const tones: Record<string, string> = {
    slate: "bg-white/[0.06] text-slate-300 border-white/10",
    indigo: "bg-indigo-400/10 text-indigo-300 border-indigo-300/25",
    cyan: "bg-cyan-400/10 text-cyan-300 border-cyan-300/25",
    emerald: "bg-emerald-400/10 text-emerald-300 border-emerald-300/25",
    amber: "bg-amber-400/10 text-amber-300 border-amber-300/25",
    rose: "bg-rose-400/10 text-rose-300 border-rose-300/25",
    fuchsia: "bg-fuchsia-400/10 text-fuchsia-300 border-fuchsia-300/25",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium tracking-wide ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

/* ----------------------------- animated number ----------------------------- */

export function AnimatedNumber({
  value,
  format = (n: number) => String(Math.round(n)),
  className = "",
}: {
  value: number;
  format?: (n: number) => string;
  className?: string;
}) {
  const mv = useMotionValue(value);
  const spring = useSpring(mv, { stiffness: 80, damping: 22, mass: 0.8 });
  const [display, setDisplay] = useState(() => format(value));

  useEffect(() => {
    mv.set(value);
  }, [value, mv]);

  useEffect(() => {
    const unsub = spring.on("change", (v) => setDisplay(format(v)));
    return unsub;
  }, [spring, format]);

  return <span className={`tabular-nums ${className}`}>{display}</span>;
}

/* --------------------------------- stat ring -------------------------------- */

export function StatRing({
  value,
  size = 200,
  stroke = 10,
  label,
  sublabel,
  gradientFrom = "#818cf8",
  gradientTo = "#22d3ee",
}: {
  value: number; // 0..100
  size?: number;
  stroke?: number;
  label: ReactNode;
  sublabel?: string;
  gradientFrom?: string;
  gradientTo?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const gid = useRef(`g${Math.random().toString(36).slice(2, 8)}`).current;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id={gid} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={gradientFrom} />
            <stop offset="100%" stopColor={gradientTo} />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.07)"
          strokeWidth={stroke}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#${gid})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c - (c * Math.min(100, value)) / 100 }}
          transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
          style={{ filter: "drop-shadow(0 0 12px rgba(129,140,248,0.35))" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-5xl font-semibold tracking-tight">{label}</div>
        {sublabel && (
          <div className="mt-1 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">
            {sublabel}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------- progress ring ------------------------------ */

export function ProgressRing({
  percent,
  size = 160,
  stroke = 8,
  children,
}: {
  percent: number;
  size?: number;
  stroke?: number;
  children?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const gid = useRef(`p${Math.random().toString(36).slice(2, 8)}`).current;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <div
        className="absolute -inset-3 rounded-full opacity-40 animate-spin-slow"
        style={{
          background: `conic-gradient(from 0deg, transparent 0%, rgba(129,140,248,0.35) 12%, transparent 24%)`,
        }}
      />
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id={gid} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#818cf8" />
            <stop offset="100%" stopColor="#22d3ee" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#${gid})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          animate={{ strokeDashoffset: c - (c * Math.min(100, percent)) / 100 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}

/* --------------------------------- gauge bar -------------------------------- */

export function GaugeBar({
  percent,
  className = "",
  gradient = true,
  danger = false,
}: {
  percent: number;
  className?: string;
  gradient?: boolean;
  danger?: boolean;
}) {
  return (
    <div className={`relative h-2 w-full overflow-hidden rounded-full bg-white/[0.08] ${className}`}>
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(100, percent)}%` }}
        transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
        className={`h-full rounded-full ${
          danger
            ? "bg-gradient-to-r from-amber-400 to-rose-500"
            : gradient
              ? "bg-gradient-to-r from-indigo-400 to-cyan-400"
              : "bg-slate-300"
        }`}
        style={gradient && !danger ? { boxShadow: "0 0 10px rgba(56,189,248,0.35)" } : undefined}
      />
    </div>
  );
}

/* ------------------------------- section header ----------------------------- */

export function SectionHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-slate-100">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[13px] text-slate-500">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

/* ---------------------------------- toggle --------------------------------- */

export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <div className="min-w-0">
        <div className="text-sm font-medium text-slate-200">{label}</div>
        {description && <div className="mt-0.5 text-xs leading-relaxed text-slate-500">{description}</div>}
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors duration-300 focus-ring ${
          checked
            ? "border-transparent bg-gradient-to-r from-indigo-500 to-cyan-400 shadow-inner"
            : "border-white/15 bg-white/[0.06]"
        }`}
        aria-pressed={checked}
      >
        <motion.span
          layout
          transition={{ type: "spring", stiffness: 500, damping: 32 }}
          className={`absolute top-1/2 size-4.5 -translate-y-1/2 rounded-full bg-white shadow ${
            checked ? "right-1" : "left-1"
          }`}
          style={{ width: 18, height: 18 }}
        />
      </button>
    </div>
  );
}

/* ---------------------------------- modal ----------------------------------- */

export function Modal({
  open,
  onClose,
  children,
  width = "max-w-md",
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  width?: string;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-6 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className={`glass w-full ${width} p-6`}
            style={{ background: "rgba(10, 14, 28, 0.92)" }}
            onClick={(e) => e.stopPropagation()}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ---------------------------------- toasts --------------------------------- */

export function Toasts({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[60] flex w-80 flex-col gap-2.5">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, x: 60, scale: 0.96 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 40, scale: 0.95 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="glass pointer-events-auto flex items-start gap-3 p-4"
            style={{ background: "rgba(12, 17, 33, 0.9)" }}
          >
            <div className="mt-0.5 shrink-0">
              {t.kind === "success" ? (
                <CheckCircle2 className="size-5 text-emerald-400" />
              ) : t.kind === "error" ? (
                <AlertTriangle className="size-5 text-rose-400" />
              ) : (
                <Sparkles className="size-5 text-indigo-400" />
              )}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium text-slate-100">{t.title}</div>
              {t.message && <div className="mt-0.5 text-xs leading-relaxed text-slate-400">{t.message}</div>}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------- file grid pulse ---------------------------- */

export function FileGridPulse({ cells = 28 }: { cells?: number }) {
  return (
    <div className="grid grid-cols-7 gap-2.5 sm:grid-cols-14" aria-hidden>
      {Array.from({ length: cells }).map((_, i) => (
        <div
          key={i}
          className="aspect-square rounded-md border border-white/[0.06] bg-white/[0.03] animate-pulse-soft"
          style={{ animationDelay: `${(i % 14) * 0.12 + Math.floor(i / 14) * 0.3}s` }}
        />
      ))}
    </div>
  );
}

/* --------------------------------- empty state ------------------------------ */

export function EmptyState({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/10 px-6 py-14 text-center">
      <div className="grid size-12 place-items-center rounded-2xl bg-white/[0.04] text-slate-500">{icon}</div>
      <div className="text-sm font-medium text-slate-300">{title}</div>
      {description && <div className="max-w-sm text-xs leading-relaxed text-slate-500">{description}</div>}
    </div>
  );
}
