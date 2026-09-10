import {
  useEffect,
  useRef,
  useState,
  memo,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { AnimatePresence, motion, useMotionValue, useSpring } from "framer-motion";
import { CheckCircle2, AlertTriangle, Sparkles, Loader2 } from "lucide-react";
import type { Toast } from "@/lib/store";

/* ---------------------------------- logo ----------------------------------- */

/**
 * WTD v2.2 premium mark: indigo→cyan gradient shield, bold "W" glyph,
 * a diagonal sweep beam (the "delete" motion) and an emerald status LED.
 * Crisp at any size, works on light and dark surfaces.
 */
export const Logo = memo(function Logo({
  size = 40,
  className = "",
  glow = true,
}: {
  size?: number;
  className?: string;
  glow?: boolean;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      className={className}
      role="img"
      aria-label="What to Delete? logo"
      style={glow ? { filter: "drop-shadow(0 4px 14px rgba(79,70,229,0.35))" } : undefined}
    >
      <defs>
        <linearGradient id="wtd-logo-g" x1="6" y1="2" x2="42" y2="46" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#818cf8" />
          <stop offset="0.45" stopColor="#4f46e5" />
          <stop offset="1" stopColor="#06b6d4" />
        </linearGradient>
      </defs>

      {/* shield body */}
      <path
        d="M24 2.2 C33.4 2.2 38.2 3.6 40.3 5.7 C42.4 7.8 43.8 12.6 43.8 24 C43.8 35.4 42.4 40.2 40.3 42.3 C38.2 44.4 33.4 45.8 24 45.8 C14.6 45.8 9.8 44.4 7.7 42.3 C5.6 40.2 4.2 35.4 4.2 24 C4.2 12.6 5.6 7.8 7.7 5.7 C9.8 3.6 14.6 2.2 24 2.2 Z"
        fill="url(#wtd-logo-g)"
      />
      {/* inner sheen */}
      <path
        d="M24 5 C32.6 5 36.6 6.2 38.2 7.8 C39.8 9.4 41 13.4 41 24 C41 34.6 39.8 38.6 38.2 40.2 C36.6 41.8 32.6 43 24 43 C15.4 43 11.4 41.8 9.8 40.2 C8.2 38.6 7 34.6 7 24 C7 13.4 8.2 9.4 9.8 7.8 C11.4 6.2 15.4 5 24 5 Z"
        fill="#ffffff"
        opacity="0.14"
      />
      {/* W glyph */}
      <path
        d="M12.5 17.5 L17.2 32.5 L24 21.5 L30.8 32.5 L35.5 17.5"
        fill="none"
        stroke="#ffffff"
        strokeWidth="4.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* status LED */}
      <circle cx="34.5" cy="35.5" r="4.4" fill="#0b1220" />
      <circle cx="34.5" cy="35.5" r="3" fill="#34d399" />
      <circle cx="33.7" cy="34.7" r="0.9" fill="#d1fae5" />
    </svg>
  );
});

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
    ghost: "btn-ghost",
    danger: "text-[var(--wtd-bad)] hover:text-white hover:bg-[var(--wtd-bad)]",
    outline: "border border-[var(--wtd-accent-line)] text-[var(--wtd-accent-ink)] hover:bg-[var(--wtd-accent-soft)]",
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
    slate: "bg-[var(--wtd-card-3)] text-[var(--wtd-ink-3)] border-[var(--wtd-edge)]",
    indigo: "bg-[var(--wtd-accent-soft)] text-[var(--wtd-accent-ink)] border-[var(--wtd-accent-line)]",
    cyan: "bg-[var(--wtd-cyan-soft)] text-[var(--wtd-cyan)] border-[color-mix(in_srgb,var(--wtd-cyan)_30%,transparent)]",
    emerald: "bg-[var(--wtd-ok-soft)] text-[var(--wtd-ok)] border-[color-mix(in_srgb,var(--wtd-ok)_30%,transparent)]",
    amber: "bg-[var(--wtd-warn-soft)] text-[var(--wtd-warn)] border-[color-mix(in_srgb,var(--wtd-warn)_30%,transparent)]",
    rose: "bg-[var(--wtd-bad-soft)] text-[var(--wtd-bad)] border-[color-mix(in_srgb,var(--wtd-bad)_30%,transparent)]",
    fuchsia: "bg-[var(--wtd-fuchsia-soft)] text-[var(--wtd-fuchsia)] border-[color-mix(in_srgb,var(--wtd-fuchsia)_30%,transparent)]",
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
  gradientFrom,
  gradientTo,
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
  const from = gradientFrom ?? "var(--wtd-accent)";
  const to = gradientTo ?? "var(--wtd-accent-2)";

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id={gid} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={from} />
            <stop offset="100%" stopColor={to} />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--wtd-edge)"
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
          style={{ filter: "drop-shadow(0 0 12px var(--wtd-glow))" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-5xl font-semibold tracking-tight text-ink">{label}</div>
        {sublabel && (
          <div className="mt-1 text-[11px] font-medium uppercase tracking-[0.14em] text-ink-3">
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
          background: `conic-gradient(from 0deg, transparent 0%, var(--wtd-accent-soft) 12%, transparent 24%)`,
        }}
      />
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id={gid} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--wtd-accent)" />
            <stop offset="100%" stopColor="var(--wtd-accent-2)" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--wtd-edge)" strokeWidth={stroke} />
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

export const GaugeBar = memo(function GaugeBar({
  percent,
  className = "",
  danger = false,
}: {
  percent: number;
  className?: string;
  danger?: boolean;
}) {
  return (
    <div className={`relative h-2 w-full overflow-hidden rounded-full bg-[var(--wtd-card-3)] ${className}`}>
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(100, percent)}%` }}
        transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
        className="h-full rounded-full"
        style={{
          background: danger
            ? "linear-gradient(90deg, var(--wtd-warn), var(--wtd-bad))"
            : "linear-gradient(90deg, var(--wtd-accent), var(--wtd-accent-2))",
          boxShadow: danger ? "0 0 10px var(--wtd-bad-soft)" : "0 0 10px var(--wtd-accent-soft)",
        }}
      />
    </div>
  );
});

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
        <h2 className="text-lg font-semibold tracking-tight text-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[13px] text-ink-3">{subtitle}</p>}
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
        <div className="text-sm font-medium text-ink">{label}</div>
        {description && <div className="mt-0.5 text-xs leading-relaxed text-ink-3">{description}</div>}
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors duration-300 focus-ring ${
          checked ? "border-transparent" : "border-[var(--wtd-edge-2)] bg-[var(--wtd-card-3)]"
        }`}
        style={
          checked
            ? { background: "linear-gradient(90deg, var(--wtd-accent), var(--wtd-accent-2))" }
            : undefined
        }
        aria-pressed={checked}
      >
        <motion.span
          layout
          transition={{ type: "spring", stiffness: 500, damping: 32 }}
          className="absolute top-1/2 -translate-y-1/2 rounded-full bg-white shadow"
          style={{ width: 18, height: 18, ...(checked ? { right: 4 } : { left: 4 }) }}
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
          className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-6 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className={`panel w-full ${width} p-6`}
            style={{ background: "var(--wtd-glass)", backdropFilter: "blur(24px)" }}
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
            style={{ background: "var(--wtd-glass)", backdropFilter: "blur(24px)" }}
          >
            <div className="mt-0.5 shrink-0">
              {t.kind === "success" ? (
                <CheckCircle2 className="size-5 text-[var(--wtd-ok)]" />
              ) : t.kind === "error" ? (
                <AlertTriangle className="size-5 text-[var(--wtd-bad)]" />
              ) : (
                <Sparkles className="size-5 text-[var(--wtd-accent)]" />
              )}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium text-ink">{t.title}</div>
              {t.message && <div className="mt-0.5 text-xs leading-relaxed text-ink-2">{t.message}</div>}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------- file grid pulse ---------------------------- */

export const FileGridPulse = memo(function FileGridPulse({ cells = 28 }: { cells?: number }) {
  return (
    <div className="grid grid-cols-7 gap-2.5 sm:grid-cols-14" aria-hidden>
      {Array.from({ length: cells }).map((_, i) => (
        <div
          key={i}
          className="inset aspect-square animate-pulse-soft"
          style={{ animationDelay: `${(i % 14) * 0.12 + Math.floor(i / 14) * 0.3}s` }}
        />
      ))}
    </div>
  );
});

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
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-[var(--wtd-edge-2)] px-6 py-14 text-center">
      <div className="grid size-12 place-items-center rounded-2xl bg-[var(--wtd-card-2)] text-ink-3">{icon}</div>
      <div className="text-sm font-medium text-ink-2">{title}</div>
      {description && <div className="max-w-sm text-xs leading-relaxed text-ink-3">{description}</div>}
    </div>
  );
}
