import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Server,
  CloudUpload,
  Copy,
  Check,
  Link2,
  Download,
  Upload,
  Users,
  Power,
  Globe,
  FolderOpen,
  Zap,
  Wifi,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { useApp } from "@/lib/store";
import { formatBytes, formatSpeed, percent } from "@/lib/format";
import { Badge, Button, GlassCard, GaugeBar, SectionHeader, Toggle } from "@/components/ui";
import { PageShell } from "@/components/chrome";
import type { FtpStats, HttpStats, TransferItem, TunnelStatus } from "@/lib/types";

type Tab = "http" | "ftp" | "publish";

const TABS: { id: Tab; label: string; icon: typeof Server }[] = [
  { id: "http", label: "HTTP Server", icon: Server },
  { id: "ftp", label: "FTP Server", icon: CloudUpload },
  { id: "publish", label: "Publish Online", icon: Globe },
];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        void navigator.clipboard?.writeText(text).catch(() => undefined);
        setCopied(true);
        setTimeout(() => setCopied(false), 1400);
      }}
      className="grid size-8 place-items-center rounded-lg border border-[var(--wtd-edge)] bg-[var(--wtd-card-2)] text-ink-3 transition-colors hover:text-ink focus-ring"
      title="Copy"
    >
      {copied ? <Check className="size-4 text-[var(--wtd-ok)]" /> : <Copy className="size-4" />}
    </button>
  );
}

export function SharePage() {
  const { pushToast, settings, saveSettings } = useApp();
  const [tab, setTab] = useState<Tab>("http");
  const [transfers, setTransfers] = useState<TransferItem[]>([]);
  const [httpUrl, setHttpUrl] = useState<string | null>(null);
  const [httpBusy, setHttpBusy] = useState(false);
  const [httpStats, setHttpStats] = useState<HttpStats | null>(null);

  // ---- FTP server state ----
  const [ftpPort, setFtpPort] = useState(2121);
  const [ftpAnonymous, setFtpAnonymous] = useState(true);
  const [ftpAccUser, setFtpAccUser] = useState("user");
  const [ftpAccPass, setFtpAccPass] = useState("");
  const [ftpBusy, setFtpBusy] = useState(false);
  const [ftpStats, setFtpStats] = useState<FtpStats | null>(null);

  // ---- tunnel state ----
  const [tunnelBusy, setTunnelBusy] = useState(false);
  const [tunnelMethod, setTunnelMethod] = useState("localhostrun");
  const [customUrl, setCustomUrl] = useState("");
  const [tunnel, setTunnel] = useState<TunnelStatus | null>(null);

  useEffect(() => api.onTransfers(setTransfers), []);

  // v2.3: poll REAL server stats (http + ftp + tunnel) while the page is open
  useEffect(() => {
    let alive = true;
    const poll = () => {
      if (!alive) return;
      void api.shareHttpStatus().then((s) => {
        if (!alive) return;
        setHttpStats(s);
        // sync the start/stop button with reality (e.g. server started elsewhere)
        setHttpUrl((cur) => (s.running ? cur ?? s.url : null));
      }).catch(() => undefined);
      void api.shareFtpStatus().then((s) => alive && setFtpStats(s)).catch(() => undefined);
      void api.tunnelStatus().then((s) => alive && setTunnel(s)).catch(() => undefined);
    };
    poll();
    const id = setInterval(poll, 1400);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const httpToggle = async () => {
    if (httpUrl) {
      await api.shareHttpStop();
      setHttpUrl(null);
      setHttpStats(await api.shareHttpStatus().catch(() => null));
      pushToast({ kind: "info", title: "HTTP server stopped" });
    } else {
      setHttpBusy(true);
      try {
        const res = await api.shareHttpStart(settings?.sharePort ?? 8080);
        setHttpUrl(res.url);
        setHttpStats(await api.shareHttpStatus().catch(() => null));
        pushToast({ kind: "success", title: "Serving on your LAN", message: res.url });
      } catch {
        pushToast({ kind: "error", title: "Could not start server" });
      } finally {
        setHttpBusy(false);
      }
    }
  };

  const ftpServerToggle = async () => {
    if (ftpStats?.running) {
      await api.shareFtpStop();
      setFtpStats(await api.shareFtpStatus());
      pushToast({ kind: "info", title: "FTP server stopped" });
    } else {
      setFtpBusy(true);
      try {
        const res = await api.shareFtpStart({
          port: ftpPort,
          anonymous: ftpAnonymous,
          user: ftpAccUser,
          pass: ftpAccPass,
        });
        setFtpStats(await api.shareFtpStatus());
        pushToast({
          kind: "success",
          title: "FTP server live",
          message: `ftp://${res.host}:${res.port}`,
        });
      } catch (e) {
        pushToast({ kind: "error", title: "FTP start failed", message: String(e) });
      } finally {
        setFtpBusy(false);
      }
    }
  };

  const tunnelToggle = async () => {
    if (tunnel?.state === "active" || tunnel?.state === "starting") {
      await api.tunnelStop();
      setTunnel(await api.tunnelStatus());
      pushToast({ kind: "info", title: "Tunnel closed" });
    } else {
      setTunnelBusy(true);
      try {
        await api.tunnelStart({ method: tunnelMethod, customUrl });
        // status will arrive via polling
        pushToast({
          kind: "info",
          title: "Tunnel opening…",
          message: "Watch the terminal for your public URL",
        });
      } catch (e) {
        pushToast({ kind: "error", title: "Tunnel failed", message: String(e) });
      } finally {
        setTunnelBusy(false);
      }
    }
  };

  return (
    <PageShell>
      {/* tabs */}
      <div className="flex items-center gap-1.5 rounded-2xl border border-[var(--wtd-edge)] bg-[var(--wtd-card-2)] p-1.5 backdrop-blur-xl">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`relative flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors focus-ring ${
                active ? "text-white" : "text-ink-3 hover:text-ink-2"
              }`}
            >
              {active && (
                <motion.span
                  layoutId="share-tab"
                  transition={{ type: "spring", stiffness: 400, damping: 32 }}
                  className="absolute inset-0 rounded-xl border border-[var(--wtd-accent-line)] bg-gradient-to-r from-indigo-500/20 to-cyan-400/10"
                />
              )}
              <Icon className={`relative z-10 size-4 ${active ? "text-[var(--wtd-accent-ink)]" : ""}`} />
              <span className="relative z-10">{t.label}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22 }}
          >
            {/* ------------------------------- HTTP ------------------------------- */}
            {tab === "http" && (
              <GlassCard className="p-7">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <motion.div
                      animate={httpUrl ? { boxShadow: "0 0 24px rgba(79,70,229,0.35)" } : {}}
                      className={`grid size-12 place-items-center rounded-2xl border ${
                        httpUrl
                          ? "border-[var(--wtd-accent-line)] bg-[var(--wtd-accent-soft)] text-[var(--wtd-accent-ink)]"
                          : "border-[var(--wtd-edge)] bg-[var(--wtd-card-2)] text-ink-3"
                      }`}
                    >
                      <Server className="size-5" />
                    </motion.div>
                    <div>
                      <div className="text-base font-semibold">{httpUrl ? "HTTP server live" : "LAN HTTP server"}</div>
                      <div className="mt-0.5 text-[13px] text-ink-3">
                        {httpUrl
                          ? "Anyone on your network can browse and download your shared folder"
                          : "Serve the shared folder to phones and laptops on your LAN"}
                      </div>
                    </div>
                  </div>
                  <Button
                    variant={httpUrl ? "danger" : "primary"}
                    loading={httpBusy}
                    icon={<Power className="size-4" />}
                    onClick={httpToggle}
                  >
                    {httpUrl ? "Stop" : "Start"}
                  </Button>
                </div>

                <AnimatePresence>
                  {httpUrl && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-6 flex items-center gap-3 rounded-xl border border-[var(--wtd-ok-soft)] bg-emerald-400/[0.05] px-4 py-3">
                        <Link2 className="size-4 shrink-0 text-[var(--wtd-ok)]" />
                        <span className="min-w-0 flex-1 truncate font-mono text-sm text-[var(--wtd-ok)]">
                          {httpUrl}
                        </span>
                        <CopyButton text={httpUrl} />
                      </div>
                      {/* v2.3: REAL live stats from the Rust server — no mock numbers */}
                      <div className="mt-4 grid grid-cols-3 gap-3">
                        {[
                          { icon: Users, label: "Requests", value: (httpStats?.peersServed ?? 0).toLocaleString() },
                          { icon: Download, label: "Downloads", value: (httpStats?.downloads ?? 0).toLocaleString() },
                          { icon: Upload, label: "Bytes out", value: formatBytes(httpStats?.bytesOut ?? 0) },
                        ].map((s) => (
                          <div key={s.label} className="rounded-xl border border-[var(--wtd-edge)] bg-[var(--wtd-card-2)] p-4">
                            <s.icon className="size-4 text-ink-3" />
                            <div className="mt-2 text-lg font-semibold tabular-nums">{s.value}</div>
                            <div className="text-[11px] text-ink-3">{s.label}</div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-4 flex items-center gap-2 rounded-xl border border-[var(--wtd-edge)] bg-[var(--wtd-card-2)] px-4 py-3 text-[11px] text-ink-3">
                        <FolderOpen className="size-3.5 shrink-0 text-[var(--wtd-accent-ink)]" />
                        Serving from:{" "}
                        <span className="truncate font-mono text-ink-3">
                          %APPDATA%\WhatToDelete\shared
                        </span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="mt-6 max-w-xs">
                  <Toggle
                    checked={settings?.sharePort === 8443}
                    onChange={(v) => settings && saveSettings({ ...settings, sharePort: v ? 8443 : 8080 })}
                    label="Use port 8443 instead"
                    description="Some networks block 8080 — try 8443"
                  />
                </div>
              </GlassCard>
            )}

            {/* ------------------------------ FTP SERVER ------------------------------ */}
            {tab === "ftp" && (
              <GlassCard className="p-7">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <motion.div
                      animate={ftpStats?.running ? { boxShadow: "0 0 24px rgba(56,189,248,0.35)" } : {}}
                      className={`grid size-12 place-items-center rounded-2xl border ${
                        ftpStats?.running
                          ? "border-[var(--wtd-cyan-soft)] bg-[var(--wtd-cyan-soft)] text-[var(--wtd-cyan)]"
                          : "border-[var(--wtd-edge)] bg-[var(--wtd-card-2)] text-ink-3"
                      }`}
                    >
                      <CloudUpload className="size-5" />
                    </motion.div>
                    <div>
                      <div className="text-base font-semibold">
                        {ftpStats?.running ? "FTP server live" : "FTP file server"}
                      </div>
                      <div className="mt-0.5 text-[13px] text-ink-3">
                        {ftpStats?.running
                          ? "Windows Explorer, FileZilla or any FTP client can connect"
                          : "Full FTP server with uploads, downloads and folder management"}
                      </div>
                    </div>
                  </div>
                  <Button
                    variant={ftpStats?.running ? "danger" : "primary"}
                    loading={ftpBusy}
                    icon={<Power className="size-4" />}
                    onClick={ftpServerToggle}
                  >
                    {ftpStats?.running ? "Stop" : "Start"}
                  </Button>
                </div>

                <AnimatePresence>
                  {ftpStats?.running && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      {/* v2.3 fix: real connectable address (was a broken "anonymous@2121" string) */}
                      <div className="mt-6 flex items-center gap-3 rounded-xl border border-[var(--wtd-cyan-soft)] bg-sky-400/[0.05] px-4 py-3">
                        <Link2 className="size-4 shrink-0 text-[var(--wtd-cyan)]" />
                        <span className="min-w-0 flex-1 truncate font-mono text-sm text-[var(--wtd-cyan)]">
                          ftp://{ftpStats.host || "your-ip"}:{ftpStats.port}
                        </span>
                        <CopyButton text={`ftp://${ftpStats.host || "localhost"}:${ftpStats.port}`} />
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                        {[
                          { label: "Sessions", value: String(ftpStats.sessionsTotal) },
                          { label: "Active now", value: String(ftpStats.sessionsActive) },
                          { label: "Sent", value: formatBytes(ftpStats.bytesOut) },
                          { label: "Received", value: formatBytes(ftpStats.bytesIn) },
                        ].map((s) => (
                          <div key={s.label} className="rounded-xl border border-[var(--wtd-edge)] bg-[var(--wtd-card-2)] p-4">
                            <div className="text-lg font-semibold tabular-nums">{s.value}</div>
                            <div className="text-[11px] text-ink-3">{s.label}</div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-4 flex items-center gap-2 rounded-xl border border-[var(--wtd-edge)] bg-[var(--wtd-card-2)] px-4 py-3 text-[11px] text-ink-3">
                        <FolderOpen className="size-3.5 shrink-0 text-[var(--wtd-cyan)]" />
                        Serving from: <span className="truncate font-mono text-ink-3">{ftpStats.root}</span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-ink-3">Port</label>
                    <input
                      type="number"
                      value={ftpPort}
                      onChange={(e) => setFtpPort(Number(e.target.value) || 2121)}
                      disabled={ftpStats?.running}
                      className="w-full rounded-xl border border-[var(--wtd-edge)] bg-[var(--wtd-card-2)] px-4 py-2.5 text-sm tabular-nums focus:border-[var(--wtd-accent-line)] focus-ring disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-ink-3">Mode</label>
                    <div className="flex items-center gap-2 rounded-xl border border-[var(--wtd-edge)] bg-[var(--wtd-card-2)] px-4 py-2.5">
                      <button
                        onClick={() => setFtpAnonymous(true)}
                        className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${ftpAnonymous ? "bg-[var(--wtd-cyan-soft)] text-[var(--wtd-cyan)]" : "text-ink-3 hover:text-ink-2"}`}
                      >
                        Anonymous
                      </button>
                      <button
                        onClick={() => setFtpAnonymous(false)}
                        className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${!ftpAnonymous ? "bg-[var(--wtd-cyan-soft)] text-[var(--wtd-cyan)]" : "text-ink-3 hover:text-ink-2"}`}
                      >
                        Credentials
                      </button>
                    </div>
                  </div>
                  {!ftpAnonymous && (
                    <>
                      <div>
                        <label className="mb-1.5 block text-xs font-medium text-ink-3">Username</label>
                        <input
                          value={ftpAccUser}
                          onChange={(e) => setFtpAccUser(e.target.value)}
                          disabled={ftpStats?.running}
                          className="w-full rounded-xl border border-[var(--wtd-edge)] bg-[var(--wtd-card-2)] px-4 py-2.5 text-sm focus:border-[var(--wtd-accent-line)] focus-ring disabled:opacity-50"
                        />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-xs font-medium text-ink-3">Password</label>
                        <input
                          type="password"
                          value={ftpAccPass}
                          onChange={(e) => setFtpAccPass(e.target.value)}
                          disabled={ftpStats?.running}
                          placeholder="empty = any password"
                          className="w-full rounded-xl border border-[var(--wtd-edge)] bg-[var(--wtd-card-2)] px-4 py-2.5 text-sm focus:border-[var(--wtd-accent-line)] focus-ring disabled:opacity-50"
                        />
                      </div>
                    </>
                  )}
                </div>
                <div className="mt-4 rounded-xl border border-sky-300/15 bg-sky-400/[0.04] px-4 py-3 text-[11px] leading-relaxed text-ink-3">
                  <span className="font-medium text-[var(--wtd-cyan)]">How to connect:</span> in Windows Explorer type
                  <span className="mx-1 rounded bg-black/40 px-1.5 py-0.5 font-mono text-[10px] text-[var(--wtd-cyan)]">ftp://your-ip:{ftpPort}</span>
                  in the address bar, or use FileZilla. Shared folder = the app's share directory.
                </div>
              </GlassCard>
            )}

            {/* ------------------------------ PUBLISH ONLINE ----------------------------- */}
            {tab === "publish" && (
              <div className="space-y-4">
                <GlassCard className="p-7">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <motion.div
                        animate={
                          tunnel?.state === "active"
                            ? { boxShadow: "0 0 26px rgba(52,211,153,0.4)" }
                            : tunnel?.state === "starting"
                              ? { boxShadow: "0 0 18px rgba(56,189,248,0.3)" }
                              : {}
                        }
                        className={`grid size-12 place-items-center rounded-2xl border ${
                          tunnel?.state === "active"
                            ? "border-[var(--wtd-ok-soft)] bg-[var(--wtd-ok-soft)] text-[var(--wtd-ok)]"
                            : tunnel?.state === "starting"
                              ? "border-[var(--wtd-cyan-soft)] bg-[var(--wtd-cyan-soft)] text-[var(--wtd-cyan)]"
                              : "border-[var(--wtd-edge)] bg-[var(--wtd-card-2)] text-ink-3"
                        }`}
                      >
                        <Globe className="size-5" />
                      </motion.div>
                      <div>
                        <div className="flex items-center gap-2 text-base font-semibold">
                          Publish online
                          {tunnel?.state === "active" && <Badge tone="emerald">LIVE</Badge>}
                          {tunnel?.state === "starting" && (
                            <Badge tone="cyan">
                              <span className="animate-pulse">connecting…</span>
                            </Badge>
                          )}
                          {tunnel?.state === "error" && <Badge tone="rose">error</Badge>}
                        </div>
                        <div className="mt-0.5 text-[13px] text-ink-3">
                          {tunnel?.state === "active"
                            ? "Your HTTP server is reachable from anywhere on the internet"
                            : "Expose your LAN HTTP server through a free public tunnel"}
                        </div>
                      </div>
                    </div>
                    <Button
                      variant={tunnel?.state === "active" || tunnel?.state === "starting" ? "danger" : "primary"}
                      loading={tunnelBusy}
                      icon={<Power className="size-4" />}
                      onClick={tunnelToggle}
                    >
                      {tunnel?.state === "active" || tunnel?.state === "starting" ? "Stop tunnel" : "Go public"}
                    </Button>
                  </div>

                  <AnimatePresence>
                    {tunnel?.publicUrl && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-6 flex items-center gap-3 rounded-xl border border-[var(--wtd-ok-soft)] bg-emerald-400/[0.06] px-4 py-3.5">
                          <Zap className="size-4 shrink-0 animate-pulse text-[var(--wtd-ok)]" />
                          <span className="min-w-0 flex-1 truncate font-mono text-sm text-[var(--wtd-ok)]">
                            {tunnel.publicUrl}
                          </span>
                          <CopyButton text={tunnel.publicUrl} />
                        </div>
                        <div className="mt-2 text-[11px] text-ink-3">{tunnel.detail}</div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {tunnel?.state === "error" && (
                    <div className="mt-4 rounded-xl border border-[var(--wtd-bad-soft)] bg-rose-500/[0.08] px-4 py-3 text-[11px] leading-relaxed text-[var(--wtd-bad)]">
                      {tunnel.detail}
                    </div>
                  )}

                  <div className="mt-6 grid gap-2.5">
                    <label className="mb-0.5 block text-xs font-medium text-ink-3">Tunnel method</label>
                    {[
                      {
                        id: "localhostrun",
                        title: "localhost.run",
                        desc: "Free · no signup · uses Windows' built-in ssh — fastest to start",
                      },
                      {
                        id: "trycloudflare",
                        title: "Cloudflare quick tunnel",
                        desc: "Free · no account · downloads cloudflared once (~28 MB)",
                      },
                      {
                        id: "custom",
                        title: "Custom URL",
                        desc: "You run your own tunnel / port-forward — just display the link",
                      },
                    ].map((m) => (
                      <button
                        key={m.id}
                        onClick={() => setTunnelMethod(m.id)}
                        disabled={tunnel?.state === "active" || tunnel?.state === "starting"}
                        className={`rounded-xl border p-4 text-left transition-all disabled:opacity-60 ${
                          tunnelMethod === m.id
                            ? "border-indigo-300/40 bg-[var(--wtd-accent-soft)]"
                            : "border-[var(--wtd-edge)] bg-[var(--wtd-card-2)] hover:border-[var(--wtd-edge-2)]"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className={`grid size-4 place-items-center rounded-full border ${
                              tunnelMethod === m.id ? "border-indigo-300 bg-indigo-400/30" : "border-[var(--wtd-edge-2)]"
                            }`}
                          >
                            {tunnelMethod === m.id && <div className="size-1.5 rounded-full bg-indigo-200" />}
                          </div>
                          <span className="text-sm font-medium text-ink-2">{m.title}</span>
                        </div>
                        <div className="mt-1 pl-6 text-[11px] text-ink-3">{m.desc}</div>
                      </button>
                    ))}
                    {tunnelMethod === "custom" && (
                      <input
                        value={customUrl}
                        onChange={(e) => setCustomUrl(e.target.value)}
                        placeholder="https://your-domain.tunnel.dev"
                        className="rounded-xl border border-[var(--wtd-edge)] bg-[var(--wtd-card-2)] px-4 py-2.5 font-mono text-xs text-ink-2 placeholder:text-ink-4 focus:border-[var(--wtd-accent-line)] focus-ring"
                      />
                    )}
                  </div>

                  <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-[var(--wtd-edge)] bg-[var(--wtd-card-2)] px-4 py-3 text-[11px] leading-relaxed text-ink-3">
                    <Server className="mt-0.5 size-4 shrink-0 text-ink-3" />
                    The tunnel forwards to your local HTTP server. Start it on the HTTP tab first —
                    the tunnel reuses its port automatically. Anyone with the public link can
                    download your shared files from anywhere.
                  </div>
                </GlassCard>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* transfer queue */}
      <div className="mt-8">
        <SectionHeader
          title="Transfers"
          subtitle="Live queue across every mode"
          right={
            transfers.filter((t) => t.state === "active").length > 0 ? (
              <Badge tone="cyan">{transfers.filter((t) => t.state === "active").length} active</Badge>
            ) : undefined
          }
        />
        <GlassCard delay={0.1} className="divide-y divide-[var(--wtd-edge)]">
          {transfers.length === 0 && (
            <div className="px-5 py-10 text-center text-sm text-ink-4">
              No transfers yet — every download from the HTTP and FTP servers streams here in real time.
            </div>
          )}
          <AnimatePresence initial={false}>
            {transfers.map((t) => (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, x: 30 }}
                className="flex items-center gap-4 px-5 py-3.5"
              >
                <div
                  className={`grid size-9 shrink-0 place-items-center rounded-xl border ${
                    t.state === "done"
                      ? "border-[var(--wtd-ok-soft)] bg-[var(--wtd-ok-soft)] text-[var(--wtd-ok)]"
                      : "border-[var(--wtd-accent-line)] bg-[var(--wtd-accent-soft)] text-[var(--wtd-accent-ink)]"
                  }`}
                >
                  {t.mode === "http" ? (
                    <Server className="size-4" />
                  ) : t.mode === "ftp" ? (
                    <CloudUpload className="size-4" />
                  ) : (
                    <Wifi className="size-4" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate font-mono text-[12px] text-ink-2">{t.name}</span>
                    <span className="shrink-0 text-[11px] tabular-nums text-ink-3">
                      {t.state === "active" ? formatSpeed(t.speed) : ""}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-3">
                    <GaugeBar
                      percent={percent(t.transferred, t.bytes)}
                      className="h-1"
                      danger={t.state === "error"}
                    />
                    <span className="w-24 shrink-0 text-right text-[11px] tabular-nums text-ink-3">
                      {formatBytes(t.transferred)} / {formatBytes(t.bytes, 0)}
                    </span>
                  </div>
                </div>
                {t.state === "done" ? (
                  <Badge tone="emerald">Done</Badge>
                ) : (
                  <button
                    onClick={() => api.cancelTransfer(t.id)}
                    className="grid size-7 place-items-center rounded-lg text-ink-4 transition-colors hover:bg-[var(--wtd-bad-soft)] hover:text-[var(--wtd-bad)]"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </GlassCard>
      </div>
    </PageShell>
  );
}
