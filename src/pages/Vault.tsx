import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Lock, KeyRound, Plus, RotateCcw, Trash2, ShieldCheck, FileLock2, Power, Search } from "lucide-react";
import { api } from "@/lib/api";
import { useApp } from "@/lib/store";
import { formatBytes, timeAgo } from "@/lib/format";
import { Badge, Button, GlassCard, Modal, SectionHeader } from "@/components/ui";
import { PageShell } from "@/components/chrome";
import type { VaultItem } from "@/lib/types";

const VAULT_MOCK_FILES = ["seed-phrase.pdf", "id-scan-front.jpg", "contract-signed.docx"];

export function VaultPage() {
  const { vaultUnlocked, lockVault, navigate, pushToast, settings } = useApp();
  const [pass, setPass] = useState("");
  const [checking, setChecking] = useState(false);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<VaultItem[]>([]);
  const [confirmRemove, setConfirmRemove] = useState<VaultItem | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (open) void api.vaultList().then(setItems).catch(() => undefined);
  }, [open]);

  // If the session dropped the unlock flag, gracefully return home.
  useEffect(() => {
    if (!vaultUnlocked) navigate("dashboard");
  }, [vaultUnlocked, navigate]);

  if (!vaultUnlocked) {
    return null;
  }

  const tryUnlock = async () => {
    if (!pass) return;
    setChecking(true);
    const ok = await api.vaultUnlock(pass);
    setChecking(false);
    if (ok) {
      setOpen(true);
      setPass("");
    } else {
      pushToast({ kind: "error", title: "Wrong passphrase", message: "Hint: it found its way here via feedback…" });
    }
  };

  /* --------------------------------- locked ---------------------------------- */

  if (!open) {
    return (
      <PageShell>
        <div className="flex min-h-[460px] items-center justify-center">
          <GlassCard className="w-full max-w-sm p-8">
            <div className="flex flex-col items-center">
              <motion.div
                animate={{ rotate: [0, -4, 4, 0] }}
                transition={{ duration: 5, repeat: Infinity }}
                className="grid size-16 place-items-center rounded-3xl border border-indigo-300/25 bg-gradient-to-br from-indigo-500/20 to-cyan-400/10 text-indigo-300"
              >
                <Lock className="size-7" />
              </motion.div>
              <div className="mt-5 text-lg font-semibold tracking-tight">The Vault</div>
              <p className="mt-1.5 text-center text-[13px] leading-relaxed text-slate-500">
                Encrypted storage for files that matter. Enter the passphrase to decrypt.
              </p>
              <div className="mt-6 w-full">
                <div className="relative">
                  <KeyRound className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-slate-600" />
                  <input
                    type="password"
                    value={pass}
                    onChange={(e) => setPass(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && tryUnlock()}
                    placeholder="Passphrase"
                    className="w-full rounded-xl border border-white/10 bg-white/[0.03] py-2.5 pl-11 pr-4 text-sm focus:border-indigo-300/40 focus-ring"
                  />
                </div>
                <Button
                  variant="primary"
                  loading={checking}
                  className="mt-4 w-full"
                  onClick={tryUnlock}
                  icon={<FileLock2 className="size-4" />}
                >
                  Decrypt vault
                </Button>
              </div>
            </div>
          </GlassCard>
        </div>
      </PageShell>
    );
  }

  /* -------------------------------- unlocked --------------------------------- */

  const addFiles = async () => {
    const added = await api.vaultAdd(VAULT_MOCK_FILES);
    setItems((prev) => [...prev, ...added]);
    pushToast({ kind: "success", title: `${added.length} files encrypted`, message: "AES-256-GCM · sealed on disk" });
  };

  const removeItem = async (item: VaultItem) => {
    setConfirmRemove(null);
    await api.vaultRemove(item.id);
    setItems((prev) => prev.filter((v) => v.id !== item.id));
    pushToast({ kind: "info", title: "Removed from vault", message: item.name });
  };

  const filtered = items.filter((v) => v.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <PageShell>
      <SectionHeader
        title="Vault"
        subtitle="Sealed storage · AES-256-GCM"
        right={
          <div className="flex items-center gap-2">
            <Badge tone="emerald">
              <ShieldCheck className="size-3" />
              Unlocked · auto-locks in {settings?.vaultAutoLockMin ?? 15}m
            </Badge>
            <Button variant="danger" icon={<Power className="size-4" />} onClick={() => { setOpen(false); lockVault(); }}>
              Lock
            </Button>
          </div>
        }
      />

      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-600" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search sealed files…"
            className="w-full rounded-xl border border-white/[0.08] bg-white/[0.02] py-2.5 pl-10 pr-4 text-sm placeholder:text-slate-600 focus-ring"
          />
        </div>
        <Button variant="primary" icon={<Plus className="size-4" />} onClick={addFiles}>
          Seal files
        </Button>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-4 xl:grid-cols-3">
        <AnimatePresence initial={false}>
          {filtered.map((item) => (
            <motion.div
              key={item.id}
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.22 }}
              className="glass glass-hover group relative overflow-hidden p-5"
            >
              <div
                className="pointer-events-none absolute inset-0 opacity-40"
                style={{ background: "radial-gradient(240px 120px at 100% 0%, rgba(99,102,241,0.12), transparent 70%)" }}
              />
              <div className="flex items-start justify-between">
                <div className="grid size-11 place-items-center rounded-xl border border-indigo-300/25 bg-indigo-400/10 text-indigo-300">
                  <FileLock2 className="size-5" />
                </div>
                <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    onClick={() => pushToast({ kind: "success", title: "Restored to original path", message: item.name })}
                    className="grid size-7 place-items-center rounded-lg text-slate-500 hover:bg-white/10 hover:text-cyan-300"
                    title="Restore"
                  >
                    <RotateCcw className="size-3.5" />
                  </button>
                  <button
                    onClick={() => setConfirmRemove(item)}
                    className="grid size-7 place-items-center rounded-lg text-slate-500 hover:bg-rose-400/10 hover:text-rose-300"
                    title="Remove"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
              <div className="relative mt-4 min-w-0 truncate font-mono text-[13px] text-slate-200">
                {item.name}
              </div>
              <div className="relative mt-1.5 flex items-center justify-between text-[11px] text-slate-500">
                <span className="tabular-nums">{formatBytes(item.bytes)}</span>
                <span>{timeAgo(item.addedAt)}</span>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {filtered.length === 0 && (
          <div className="col-span-full rounded-2xl border border-dashed border-white/10 px-6 py-14 text-center">
            <Lock className="mx-auto size-6 text-slate-700" />
            <div className="mt-3 text-sm text-slate-500">Nothing sealed yet</div>
          </div>
        )}
      </div>

      <div className="mt-8 flex items-center gap-3 rounded-xl border border-indigo-300/15 bg-indigo-400/[0.04] px-4 py-3">
        <ShieldCheck className="size-4.5 shrink-0 text-indigo-300" style={{ width: 18, height: 18 }} />
        <p className="text-xs leading-relaxed text-slate-400">
          Vault contents live encrypted at{" "}
          <span className="font-mono text-slate-300">%APPDATA%\WhatToDelete\vault.bin</span> — even with disk
          access, files stay sealed without your passphrase.
        </p>
      </div>

      <Modal open={confirmRemove !== null} onClose={() => setConfirmRemove(null)} width="max-w-sm">
        <div className="flex items-start gap-4">
          <div className="grid size-11 shrink-0 place-items-center rounded-2xl border border-rose-400/30 bg-rose-400/10">
            <Trash2 className="size-5 text-rose-300" />
          </div>
          <div>
            <div className="text-base font-semibold">Unseal and remove?</div>
            <p className="mt-1.5 text-[13px] leading-relaxed text-slate-400">
              <span className="font-mono text-slate-200">{confirmRemove?.name}</span> will be decrypted back
              to its original path ({formatBytes(confirmRemove?.bytes ?? 0)}).
            </p>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2.5">
          <Button onClick={() => setConfirmRemove(null)}>Cancel</Button>
          <Button variant="danger" onClick={() => confirmRemove && removeItem(confirmRemove)}>
            Remove
          </Button>
        </div>
      </Modal>
    </PageShell>
  );
}
