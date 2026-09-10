import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Power, ShieldCheck, FolderPlus, X, Palette, Info, HardDrive, Sun, Moon } from "lucide-react";
import { useApp } from "@/lib/store";
import { Badge, Button, GlassCard, Logo, SectionHeader, Toggle } from "@/components/ui";
import { PageShell } from "@/components/chrome";
import type { AppSettings } from "@/lib/types";

const ACCENTS = [
  { name: "Indigo Pulse", from: "#818cf8", to: "#22d3ee" },
  { name: "Aurora", from: "#34d399", to: "#22d3ee" },
  { name: "Nebula", from: "#c084fc", to: "#818cf8" },
  { name: "Ember", from: "#fb7185", to: "#fbbf24" },
];

export function SettingsPage() {
  const { settings, saveSettings, pushToast, theme, toggleTheme } = useApp();
  const [draft, setDraft] = useState<AppSettings | null>(settings);
  const [newPath, setNewPath] = useState("");

  useEffect(() => setDraft(settings), [settings]);

  if (!draft) {
    return (
      <PageShell>
        <div className="grid h-64 place-items-center text-sm text-ink-4">Loading settings…</div>
      </PageShell>
    );
  }

  const update = (patch: Partial<AppSettings>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    void saveSettings(next);
  };

  const addPath = () => {
    const p = newPath.trim();
    if (!p || draft.excludePaths.includes(p)) return;
    update({ excludePaths: [...draft.excludePaths, p] });
    setNewPath("");
  };

  return (
    <PageShell>
      <SectionHeader title="Settings" subtitle="Tuned defaults, zero surprises" />

      <div className="grid grid-cols-2 gap-4">
        {/* general */}
        <GlassCard className="p-6">
          <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-xl border border-[var(--wtd-edge)] bg-[var(--wtd-card-2)] text-ink-2">
              <Power className="size-4" />
            </div>
            <span className="text-sm font-semibold">General</span>
          </div>
          <div className="mt-4 divide-y divide-[var(--wtd-edge)]">
            <Toggle
              checked={draft.launchAtStartup}
              onChange={(v) => update({ launchAtStartup: v })}
              label="Launch at startup"
              description="Starts minimized to the tray"
            />
            <Toggle
              checked={theme === "dark"}
              onChange={toggleTheme}
              label="Dark theme"
              description={theme === "dark" ? "Deep-space palette — the hacker classic" : "Daylight palette — crisp and calm (default)"}
            />
          </div>
          <div className="mt-5">
            <div className="mb-3 flex items-center gap-2 text-xs font-medium text-ink-3">
              {theme === "dark" ? <Moon className="size-3.5" /> : <Sun className="size-3.5" />}
              Appearance
            </div>
            <div className="flex gap-2.5">
              <button
                onClick={() => { if (theme !== "light") toggleTheme(); }}
                className={`panel-sub flex items-center gap-3 px-4 py-3 text-left transition-all ${theme === "light" ? "ring-2 ring-[var(--wtd-accent-line)]" : "hover:brightness-105"}`}
              >
                <div className="grid size-9 place-items-center rounded-xl bg-[#f4f6fb] text-ink shadow-inner">
                  <Sun className="size-4" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-ink">Light</div>
                  <div className="text-[10px] text-ink-3">default</div>
                </div>
              </button>
              <button
                onClick={() => { if (theme !== "dark") toggleTheme(); }}
                className={`panel-sub flex items-center gap-3 px-4 py-3 text-left transition-all ${theme === "dark" ? "ring-2 ring-[var(--wtd-accent-line)]" : "hover:brightness-105"}`}
              >
                <div className="grid size-9 place-items-center rounded-xl bg-[#070b14] text-[#f1f5fb] shadow-inner">
                  <Moon className="size-4" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-ink">Dark</div>
                  <div className="text-[10px] text-ink-3">CRT mode</div>
                </div>
              </button>
            </div>
          </div>
          <div className="mt-5">
            <div className="mb-3 flex items-center gap-2 text-xs font-medium text-ink-3">
              <Palette className="size-3.5" />
              Accent
            </div>
            <div className="flex gap-2.5">
              {ACCENTS.map((a, i) => (
                <button
                  key={a.name}
                  title={a.name}
                  onClick={() => pushToast({ kind: "info", title: `Accent: ${a.name}`, message: "Applied across the app" })}
                  className={`relative h-9 w-9 rounded-xl transition-transform hover:scale-110 focus-ring ${
                    i === 0 ? "ring-2 ring-[var(--wtd-accent-line)] ring-offset-2 ring-offset-[var(--wtd-bg)]" : ""
                  }`}
                  style={{ background: `linear-gradient(135deg, ${a.from}, ${a.to})` }}
                />
              ))}
            </div>
          </div>
        </GlassCard>

        {/* safety */}
        <GlassCard delay={0.08} className="p-6">
          <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-xl border border-[var(--wtd-ok-soft)] bg-[var(--wtd-ok-soft)] text-[var(--wtd-ok)]">
              <ShieldCheck className="size-4" />
            </div>
            <span className="text-sm font-semibold">Safety</span>
          </div>
          <div className="mt-4 divide-y divide-[var(--wtd-edge)]">
            <Toggle
              checked={draft.confirmBeforeClean}
              onChange={(v) => update({ confirmBeforeClean: v })}
              label="Confirm before cleaning"
              description="Ask every time before files are touched"
            />
            <Toggle
              checked={draft.useRecycleBin}
              onChange={(v) => update({ useRecycleBin: v })}
              label="Use Recycle Bin"
              description="Deleted files can be restored"
            />
          </div>
          <div className="mt-5">
            <div className="mb-2.5 flex items-center justify-between">
              <span className="text-xs font-medium text-ink-3">Excluded paths</span>
              <Badge tone="slate">{draft.excludePaths.length}</Badge>
            </div>
            <div className="space-y-1.5">
              {draft.excludePaths.map((p) => (
                <motion.div
                  key={p}
                  layout
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-center gap-2 rounded-lg border border-[var(--wtd-edge)] bg-[var(--wtd-card-2)] px-3 py-1.5"
                >
                  <HardDrive className="size-3.5 shrink-0 text-ink-4" />
                  <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink-2">{p}</span>
                  <button
                    onClick={() => update({ excludePaths: draft.excludePaths.filter((x) => x !== p) })}
                    className="text-ink-4 transition-colors hover:text-[var(--wtd-bad)]"
                  >
                    <X className="size-3.5" />
                  </button>
                </motion.div>
              ))}
              <div className="flex gap-2">
                <input
                  value={newPath}
                  onChange={(e) => setNewPath(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addPath()}
                  placeholder="C:\SomeFolder"
                  className="min-w-0 flex-1 rounded-lg border border-[var(--wtd-edge)] bg-[var(--wtd-card-2)] px-3 py-1.5 font-mono text-[11px] placeholder:text-ink-4 focus-ring"
                />
                <Button onClick={addPath} className="!px-2.5 !py-1.5" icon={<FolderPlus className="size-3.5" />} />
              </div>
            </div>
          </div>
        </GlassCard>

        {/* network */}
        <GlassCard delay={0.14} className="p-6">
          <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-xl border border-[var(--wtd-cyan-soft)] bg-[var(--wtd-cyan-soft)] text-[var(--wtd-cyan)]">
              <Info className="size-4" />
            </div>
            <span className="text-sm font-semibold">Network</span>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-ink-3">Share port</label>
              <input
                type="number"
                value={draft.sharePort}
                onChange={(e) => update({ sharePort: Number(e.target.value) || 8080 })}
                className="w-full rounded-xl border border-[var(--wtd-edge)] bg-[var(--wtd-card-2)] px-4 py-2.5 text-sm tabular-nums focus-ring"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-ink-3">Vault auto-lock</label>
              <select
                value={draft.vaultAutoLockMin}
                onChange={(e) => update({ vaultAutoLockMin: Number(e.target.value) })}
                className="w-full appearance-none rounded-xl border border-[var(--wtd-edge)] bg-[var(--wtd-card-2)] px-4 py-2.5 text-sm focus-ring"
              >
                {[5, 15, 30, 60].map((m) => (
                  <option key={m} value={m} className="bg-[var(--wtd-card)]">
                    {m} minutes
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="mt-4 text-[11px] leading-relaxed text-ink-3">
            Transfers bind only to private interfaces. Public addresses are never used.
          </p>
        </GlassCard>

        {/* about */}
        <GlassCard delay={0.2} className="relative overflow-hidden p-6">
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background: "radial-gradient(300px 160px at 90% 0%, rgba(99,102,241,0.14), transparent 70%)",
            }}
          />
          <div className="flex items-center gap-3">
            <Logo size={36} />
            <div>
              <div className="text-sm font-semibold">About</div>
              <div className="text-[11px] text-ink-3">What to Delete? v2.2.0 · Tauri edition</div>
            </div>
          </div>
          <div className="mt-5 space-y-2 text-xs leading-relaxed text-ink-3">
            <div className="flex justify-between">
              <span className="text-ink-3">Engine</span>
              <span>Rust + Windows APIs</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-3">Interface</span>
              <span>React + Tailwind + Motion</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-3">WebView</span>
              <span>Edge WebView2</span>
            </div>
          </div>
          <Button
            variant="ghost"
            className="mt-5 w-full"
            onClick={() => pushToast({ kind: "info", title: "You are on the latest build", message: "v2.2.0 · multitask terminal edition" })}
          >
            Check for updates
          </Button>
        </GlassCard>
      </div>
    </PageShell>
  );
}
