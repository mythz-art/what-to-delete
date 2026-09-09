import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  LayoutDashboard,
  Sparkles,
  Files,
  Share2,
  Wrench,
  Settings,
  Lock,
  Minus,
  Square,
  X,
  MessageSquareHeart,
  HardDrive,
  ShieldCheck,
  FolderOpen,
  Info,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { api } from "@/lib/api";
import { useApp } from "@/lib/store";
import { formatBytes, percent } from "@/lib/format";
import type { PageId } from "@/lib/types";
import { GaugeBar } from "@/components/ui";

/* -------------------------------- background ------------------------------- */

export function BackgroundFX() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0">
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(900px 500px at 12% -10%, rgba(99,102,241,0.16), transparent 60%),
                      radial-gradient(800px 600px at 95% 110%, rgba(34,211,238,0.10), transparent 55%)`,
        }}
      />
      <div className="dot-grid absolute inset-0 opacity-60" />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-300/40 to-transparent" />
    </div>
  );
}

/* --------------------------------- title bar -------------------------------- */

function TitleBtn({
  onClick,
  danger = false,
  children,
  title,
}: {
  onClick: () => void;
  danger?: boolean;
  children: ReactNode;
  title: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`grid h-8 w-11 place-items-center rounded-lg text-slate-400 transition-colors duration-150 focus-ring ${
        danger ? "hover:bg-rose-500/80 hover:text-white" : "hover:bg-white/10 hover:text-slate-100"
      }`}
    >
      {children}
    </button>
  );
}

export function TitleBar() {
  return (
    <div
      data-tauri-drag-region
      className="relative z-20 flex h-10 shrink-0 select-none items-center justify-between border-b border-white/[0.06] bg-white/[0.02] px-3"
    >
      <div data-tauri-drag-region className="flex items-center gap-2.5">
        <div className="grid size-5 place-items-center rounded-md bg-gradient-to-br from-indigo-500 to-cyan-400 shadow shadow-indigo-500/30">
          <Sparkles className="size-3 text-white" />
        </div>
        <span className="text-xs font-medium tracking-wide text-slate-400">What to Delete?</span>
        <span className="rounded-full border border-white/10 bg-white/[0.04] px-1.5 py-px text-[10px] text-slate-500">
          v2.1
        </span>
      </div>
      <div className="flex items-center gap-0.5">
        <TitleBtn onClick={api.windowMinimize} title="Minimize">
          <Minus className="size-3.5" />
        </TitleBtn>
        <TitleBtn onClick={api.windowToggleMaximize} title="Maximize">
          <Square className="size-3" />
        </TitleBtn>
        <TitleBtn onClick={api.windowClose} title="Close" danger>
          <X className="size-4" />
        </TitleBtn>
      </div>
    </div>
  );
}

/* ---------------------------------- sidebar --------------------------------- */

const NAV: { page: PageId; label: string; icon: typeof LayoutDashboard }[] = [
  { page: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { page: "cleanup", label: "Cleanup", icon: Sparkles },
  { page: "duplicates", label: "Duplicates", icon: Files },
  { page: "files", label: "Files", icon: FolderOpen },
  { page: "share", label: "Share", icon: Share2 },
  { page: "tools", label: "Tools", icon: Wrench },
  { page: "settings", label: "Settings", icon: Settings },
  { page: "about", label: "About", icon: Info },
];

function NavItem({
  active,
  label,
  icon: Icon,
  onClick,
  badge,
  collapsed,
}: {
  active: boolean;
  label: string;
  icon: typeof LayoutDashboard;
  onClick: () => void;
  badge?: ReactNode;
  collapsed?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={`relative flex w-full items-center ${collapsed ? "justify-center" : "gap-3"} rounded-xl ${collapsed ? "px-0" : "px-3"} py-2.5 text-sm transition-colors duration-200 focus-ring ${
        active ? "text-white" : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-200"
      }`}
    >
      {active && (
        <motion.span
          layoutId="nav-active-pill"
          transition={{ type: "spring", stiffness: 380, damping: 34 }}
          className="absolute inset-0 rounded-xl border border-indigo-300/20 bg-gradient-to-r from-indigo-500/[0.16] to-cyan-400/[0.06]"
        />
      )}
      {active && (
        <motion.span
          layoutId="nav-active-bar"
          transition={{ type: "spring", stiffness: 380, damping: 34 }}
          className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-gradient-to-b from-indigo-400 to-cyan-400"
        />
      )}
      <Icon className={`relative z-10 size-[18px] transition-colors ${active ? "text-indigo-300" : ""}`} />
      {!collapsed && <span className="relative z-10 flex-1 text-left font-medium">{label}</span>}
      {!collapsed && badge}
    </button>
  );
}

export function Sidebar() {
  const { page, navigate, status, vaultUnlocked, openFeedback } = useApp();
  const cDrive = status?.drives.find((d) => d.letter === "C:");
  const [collapsed, setCollapsed] = useState(false);

  // auto-collapse on narrow windows; manual toggle overrides
  const [manual, setManual] = useState<boolean | null>(null);
  useEffect(() => {
    const onResize = () => {
      if (manual === null) setCollapsed(window.innerWidth < 1080);
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [manual]);
  const isCollapsed = manual ?? collapsed;

  return (
    <aside
      className={`relative z-10 flex shrink-0 flex-col border-r border-white/[0.06] bg-white/[0.015] p-3 transition-[width] duration-200 ${
        isCollapsed ? "w-[64px]" : "w-[248px] max-lg:w-[220px]"
      }`}
    >
      {/* logo */}
      <div className={`flex items-center gap-3 px-1 pb-4 pt-2 ${isCollapsed ? "justify-center px-0" : ""}`}>
        <div className="relative">
          <div className="grid size-10 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-400 shadow-lg shadow-indigo-500/25">
            <Sparkles className="size-5 text-white" />
          </div>
          <div className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full border border-slate-950 bg-emerald-400">
            <ShieldCheck className="size-2.5 text-slate-950" />
          </div>
        </div>
        {!isCollapsed && (
          <div className="min-w-0">
            <div className="text-[15px] font-semibold leading-tight tracking-tight">What to Delete?</div>
            <div className="text-[11px] font-medium text-slate-500">Disk Guardian</div>
          </div>
        )}
      </div>

      {/* collapse toggle */}
      <button
        onClick={() => setManual(!isCollapsed)}
        className={`mb-2 flex items-center ${isCollapsed ? "justify-center" : "justify-end px-2"} rounded-lg py-1.5 text-slate-500 transition-colors hover:bg-white/[0.04] hover:text-slate-300`}
        title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {isCollapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
      </button>

      {/* nav */}
      <nav className="flex flex-col gap-1">
        {NAV.map((n) => (
          <NavItem
            key={n.page}
            active={page === n.page}
            label={n.label}
            icon={n.icon}
            collapsed={isCollapsed}
            onClick={() => navigate(n.page)}
          />
        ))}
        <AnimatePresence>
          {vaultUnlocked && (
            <motion.div
              initial={{ opacity: 0, height: 0, marginTop: 0 }}
              animate={{ opacity: 1, height: "auto", marginTop: 4 }}
              exit={{ opacity: 0, height: 0, marginTop: 0 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <button
                onClick={() => navigate("vault")}
                title={isCollapsed ? "Vault" : undefined}
                className={`relative flex w-full items-center ${isCollapsed ? "justify-center" : "gap-3"} rounded-xl border px-3 py-2.5 text-sm transition-colors focus-ring ${
                  page === "vault"
                    ? "border-indigo-300/30 bg-gradient-to-r from-indigo-500/20 to-cyan-400/10 text-white"
                    : "border-indigo-400/20 bg-indigo-400/[0.07] text-indigo-200 hover:bg-indigo-400/15"
                } ${isCollapsed ? "!px-0" : ""}`}
              >
                <Lock className="size-[18px]" />
                {!isCollapsed && <span className="flex-1 text-left font-medium">Vault</span>}
                {!isCollapsed && (
                  <span className="rounded-full border border-indigo-300/30 px-1.5 py-px text-[10px] tracking-wide text-indigo-300">
                    SECRET
                  </span>
                )}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      <div className="flex-1" />

      {/* feedback */}
      <button
        onClick={openFeedback}
        hidden={isCollapsed}
        className="group mb-3 flex items-center gap-3 rounded-xl border border-white/[0.08] bg-gradient-to-r from-indigo-500/[0.12] to-cyan-400/[0.06] px-3 py-3 text-left transition-all duration-200 hover:border-indigo-300/30 hover:from-indigo-500/20 focus-ring"
      >
        <div className="grid size-8 place-items-center rounded-lg bg-white/[0.06] text-indigo-300 transition-transform group-hover:scale-110">
          <MessageSquareHeart className="size-4" />
        </div>
        <div>
          <div className="text-[13px] font-medium text-slate-200">Send feedback</div>
          <div className="text-[11px] text-slate-500">Ideas, bugs, secrets…</div>
        </div>
      </button>

      {/* mini disk meter */}
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3" hidden={isCollapsed}>
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
            <HardDrive className="size-3.5" />
            {cDrive ? `C: · ${formatBytes(cDrive.usedBytes)} / ${formatBytes(cDrive.totalBytes, 0)}` : "C:"}
          </div>
          <span className="text-[11px] font-semibold tabular-nums text-slate-300">
            {cDrive ? percent(cDrive.usedBytes, cDrive.totalBytes) : 0}%
          </span>
        </div>
        <GaugeBar percent={cDrive ? percent(cDrive.usedBytes, cDrive.totalBytes) : 0} />
      </div>
    </aside>
  );
}

/* --------------------------------- app shell -------------------------------- */

export function AppShell({ children, bottom }: { children: ReactNode; bottom?: ReactNode }) {
  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-slate-950 text-slate-100">
      <BackgroundFX />
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="relative z-10 min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
          <div className="mx-auto max-w-6xl px-5 py-6 pb-24 sm:px-8 sm:py-7">{children}</div>
        </main>
      </div>
      {bottom}
    </div>
  );
}

/* -------------------------------- page shell -------------------------------- */

export function PageShell({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18, filter: "blur(4px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      exit={{ opacity: 0, y: -12, filter: "blur(3px)" }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
