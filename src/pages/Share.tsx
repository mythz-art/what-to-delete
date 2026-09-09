import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Wifi,
  Server,
  CloudUpload,
  Magnet,
  Copy,
  Check,
  X,
  Link2,
  Upload,
  Download,
  Users,
  Power,
  ArrowRight,
  Globe,
  FolderOpen,
  Zap,
} from "lucide-react";
import { api } from "@/lib/api";
import { useApp } from "@/lib/store";
import { formatBytes, formatSpeed, percent } from "@/lib/format";
import { Badge, Button, GlassCard, GaugeBar, SectionHeader, Toggle } from "@/components/ui";
import { PageShell } from "@/components/chrome";
import type { FtpStats, TransferItem, TunnelStatus } from "@/lib/types";

type Tab = "p2p" | "http" | "ftp" | "publish" | "bt";

const TABS: { id: Tab; label: string; icon: typeof Wifi }[] = [
  { id: "p2p", label: "LAN Transfer", icon: Wifi },
  { id: "http", label: "HTTP Server", icon: Server },
  { id: "ftp", label: "FTP Server", icon: CloudUpload },
  { id: "publish", label: "Publish Online", icon: Globe },
  { id: "bt", label: "BitTorrent", icon: Magnet },
];

const MOCK_FILES = [
  { name: "project-archive.zip", bytes: 412 * 1024 * 1024 },
  { name: "design-assets_v3.7z", bytes: 96 * 1024 * 1024 },
  { name: "backup-2026-09.img", bytes: 2.1 * 1024 ** 3 },
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
      className="grid size-8 place-items-center rounded-lg border border-white/10 bg-white/[0.04] text-slate-400 transition-colors hover:text-slate-100 focus-ring"
      title="Copy"
    >
      {copied ? <Check className="size-4 text-emerald-400" /> : <Copy className="size-4" />}
    </button>
  );
}

function PeerDots() {
  return (
    <span className="inline-flex items-center gap-1.5">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="size-1.5 rounded-full bg-indigo-300"
          animate={{ opacity: [0.25, 1, 0.25] }}
          transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.2 }}
        />
      ))}
    </span>
  );
}

export function SharePage() {
  const { pushToast, settings, saveSettings } = useApp();
  const [tab, setTab] = useState<Tab>("p2p");
  const [transfers, setTransfers] = useState<TransferItem[]>([]);
  const [httpUrl, setHttpUrl] = useState<string | null>(null);
  const [httpBusy, setHttpBusy] = useState(false);
  const [code] = useState(() => String(Math.floor(100000 + Math.random() * 900000)));
  const [recvCode, setRecvCode] = useState("");
  const [connected, setConnected] = useState(false);
  const [magnet, setMagnet] = useState("");
  const [magnets, setMagnets] = useState<{ id: string; name: string; progress: number }[]>([]);
  const codeRef = useRef(code);

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

  // poll ftp stats + tunnel status while on those tabs
  useEffect(() => {
    if (tab !== "ftp" && tab !== "publish") return;
    const id = setInterval(() => {
      void api.shareFtpStatus().then(setFtpStats).catch(() => undefined);
      void api.tunnelStatus().then(setTunnel).catch(() => undefined);
    }, 1200);
    void api.shareFtpStatus().then(setFtpStats).catch(() => undefined);
    void api.tunnelStatus().then(setTunnel).catch(() => undefined);
    return () => clearInterval(id);
  }, [tab]);

  const httpToggle = async () => {
    if (httpUrl) {
      await api.shareHttpStop();
      setHttpUrl(null);
      pushToast({ kind: "info", title: "HTTP server stopped" });
    } else {
      setHttpBusy(true);
      try {
        const res = await api.shareHttpStart(settings?.sharePort ?? 8080);
        setHttpUrl(res.url);
        pushToast({ kind: "success", title: "Serving on your LAN", message: res.url });
      } catch {
        pushToast({ kind: "error", title: "Could not start server" });
      } finally {
        setHttpBusy(false);
      }
    }
  };

  const sendFiles = () => {
    api.startTransfer(
      MOCK_FILES.map((f) => ({ ...f, mode: "p2p" as const, peer: `peer-${codeRef.current.slice(0, 3)}` }))
    );
    pushToast({ kind: "info", title: "Waiting for peer", message: `Share code ${code}` });
  };

  const connectPeer = async () => {
    if (recvCode.length !== 6) return;
    const ok = true; // demo peer connect
    setConnected(ok);
    if (ok) {
      api.startTransfer([{ name: "shared-photo-raw.zip", bytes: 380 * 1024 * 1024, mode: "p2p", peer: `peer-${recvCode.slice(0, 3)}` }]);
      pushToast({ kind: "success", title: "Connected to peer", message: recvCode });
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

  const addMagnet = () => {
    if (!magnet.trim()) return;
    const name = magnet.includes(":") ? magnet.split(":").pop()! : "download";
    setMagnets((m) => [{ id: `m${Date.now()}`, name: `${name}.iso`, progress: 0 }, ...m]);
    setMagnet("");
    pushToast({ kind: "info", title: "Magnet added to queue" });
  };

  return (
    <PageShell>
      {/* tabs */}
      <div className="flex items-center gap-1.5 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-1.5 backdrop-blur-xl">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`relative flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors focus-ring ${
                active ? "text-white" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {active && (
                <motion.span
                  layoutId="share-tab"
                  transition={{ type: "spring", stiffness: 400, damping: 32 }}
                  className="absolute inset-0 rounded-xl border border-indigo-300/25 bg-gradient-to-r from-indigo-500/20 to-cyan-400/10"
                />
              )}
              <Icon className={`relative z-10 size-4 ${active ? "text-indigo-300" : ""}`} />
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
            {/* ------------------------------- P2P ------------------------------- */}
            {tab === "p2p" && (
              <div className="grid grid-cols-2 gap-4">
                <GlassCard className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="grid size-9 place-items-center rounded-xl border border-indigo-300/25 bg-indigo-400/10 text-indigo-300">
                        <Upload className="size-4" />
                      </div>
                      <span className="text-sm font-semibold">Send</span>
                    </div>
                    <PeerDots />
                  </div>
                  <div className="mt-5 space-y-2">
                    {MOCK_FILES.map((f) => (
                      <div
                        key={f.name}
                        className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2"
                      >
                        <span className="min-w-0 truncate font-mono text-[11px] text-slate-300">{f.name}</span>
                        <span className="ml-3 shrink-0 text-[11px] tabular-nums text-slate-500">
                          {formatBytes(f.bytes)}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-5 flex items-center gap-3">
                    <div className="flex-1 rounded-xl border border-indigo-300/25 bg-indigo-400/[0.08] px-4 py-2.5 text-center">
                      <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-indigo-300/70">
                        Pairing code
                      </div>
                      <div className="mt-0.5 font-mono text-xl font-bold tracking-[0.3em] text-indigo-200">
                        {code}
                      </div>
                    </div>
                    <Button variant="primary" onClick={sendFiles} icon={<ArrowRight className="size-4" />}>
                      Beam
                    </Button>
                  </div>
                </GlassCard>

                <GlassCard delay={0.08} className="p-6">
                  <div className="flex items-center gap-3">
                    <div className="grid size-9 place-items-center rounded-xl border border-cyan-300/25 bg-cyan-400/10 text-cyan-300">
                      <Download className="size-4" />
                    </div>
                    <span className="text-sm font-semibold">Receive</span>
                    {connected && <Badge tone="emerald">Connected</Badge>}
                  </div>
                  <p className="mt-4 text-[13px] leading-relaxed text-slate-400">
                    Enter the 6-digit code shown on the sender's device. Transfers are end-to-end encrypted
                    and never leave your local network.
                  </p>
                  <div className="mt-5 flex gap-3">
                    <input
                      value={recvCode}
                      onChange={(e) => setRecvCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="000000"
                      className="flex-1 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-center font-mono text-xl tracking-[0.3em] text-slate-100 placeholder:text-slate-600 focus:border-cyan-300/40 focus-ring"
                    />
                    <Button variant="primary" onClick={connectPeer} disabled={recvCode.length !== 6}>
                      Connect
                    </Button>
                  </div>
                  <div className="mt-6 grid grid-cols-3 gap-3 text-center">
                    {[
                      { label: "Peers online", value: "3" },
                      { label: "Latency", value: "2 ms" },
                      { label: "Discovery", value: "mDNS" },
                    ].map((s) => (
                      <div key={s.label} className="rounded-xl border border-white/[0.06] bg-white/[0.02] py-2.5">
                        <div className="text-sm font-semibold text-slate-200">{s.value}</div>
                        <div className="text-[10px] uppercase tracking-wide text-slate-500">{s.label}</div>
                      </div>
                    ))}
                  </div>
                </GlassCard>
              </div>
            )}

            {/* ------------------------------- HTTP ------------------------------ */}
            {tab === "http" && (
              <GlassCard className="p-7">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <motion.div
                      animate={httpUrl ? { boxShadow: "0 0 24px rgba(52,211,153,0.35)" } : {}}
                      className={`grid size-12 place-items-center rounded-2xl border ${
                        httpUrl
                          ? "border-emerald-300/30 bg-emerald-400/10 text-emerald-300"
                          : "border-white/10 bg-white/[0.04] text-slate-500"
                      }`}
                    >
                      <Server className="size-5" />
                    </motion.div>
                    <div>
                      <div className="text-base font-semibold">
                        {httpUrl ? "Serving files on your LAN" : "HTTP file server"}
                      </div>
                      <div className="mt-0.5 text-[13px] text-slate-500">
                        {httpUrl
                          ? "Anyone on your network can browse and download"
                          : "Start a lightweight server to share files with any browser"}
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
                      <div className="mt-6 flex items-center gap-3 rounded-xl border border-emerald-300/20 bg-emerald-400/[0.05] px-4 py-3">
                        <Link2 className="size-4 shrink-0 text-emerald-300" />
                        <span className="min-w-0 flex-1 truncate font-mono text-sm text-emerald-200">
                          {httpUrl}
                        </span>
                        <CopyButton text={httpUrl} />
                      </div>
                      <div className="mt-4 grid grid-cols-3 gap-3">
                        {[
                          { icon: Users, label: "Peers served", value: "4" },
                          { icon: Download, label: "Downloads", value: "17" },
                          { icon: Upload, label: "Bytes out", value: "12.6 GB" },
                        ].map((s) => (
                          <div key={s.label} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                            <s.icon className="size-4 text-slate-500" />
                            <div className="mt-2 text-lg font-semibold tabular-nums">{s.value}</div>
                            <div className="text-[11px] text-slate-500">{s.label}</div>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="mt-6 max-w-xs">
                  <Toggle
                    checked={settings?.sharePort === 8443}
                    onChange={(v) => settings && saveSettings({ ...settings, sharePort: v ? 8443 : 8080 })}
                    label="Use HTTPS port (8443)"
                    description="Self-signed certificate, ideal for restricted networks"
                  />
                </div>
              </GlassCard>
            )}

            {/* -------------------------------- FTP SERVER ------------------------------ */}
            {tab === "ftp" && (
              <GlassCard className="p-7">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <motion.div
                      animate={ftpStats?.running ? { boxShadow: "0 0 24px rgba(56,189,248,0.35)" } : {}}
                      className={`grid size-12 place-items-center rounded-2xl border ${
                        ftpStats?.running
                          ? "border-sky-300/30 bg-sky-400/10 text-sky-300"
                          : "border-white/10 bg-white/[0.04] text-slate-500"
                      }`}
                    >
                      <CloudUpload className="size-5" />
                    </motion.div>
                    <div>
                      <div className="text-base font-semibold">
                        {ftpStats?.running ? "FTP server live" : "FTP file server"}
                      </div>
                      <div className="mt-0.5 text-[13px] text-slate-500">
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
                      <div className="mt-6 flex items-center gap-3 rounded-xl border border-sky-300/20 bg-sky-400/[0.05] px-4 py-3">
                        <Link2 className="size-4 shrink-0 text-sky-300" />
                        <span className="min-w-0 flex-1 truncate font-mono text-sm text-sky-200">
                          ftp://{ftpStats.anonymous ? "anonymous" : ftpAccUser}@{ftpStats.root ? "" : ""}
                          {ftpStats.port}
                        </span>
                        <CopyButton text={`ftp://localhost:${ftpStats.port}`} />
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                        {[
                          { label: "Sessions", value: String(ftpStats.sessionsTotal) },
                          { label: "Active now", value: String(ftpStats.sessionsActive) },
                          { label: "Sent", value: formatBytes(ftpStats.bytesOut) },
                          { label: "Received", value: formatBytes(ftpStats.bytesIn) },
                        ].map((s) => (
                          <div key={s.label} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                            <div className="text-lg font-semibold tabular-nums">{s.value}</div>
                            <div className="text-[11px] text-slate-500">{s.label}</div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-4 flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-[11px] text-slate-500">
                        <FolderOpen className="size-3.5 shrink-0 text-sky-300" />
                        Serving from: <span className="truncate font-mono text-slate-400">{ftpStats.root}</span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-400">Port</label>
                    <input
                      type="number"
                      value={ftpPort}
                      onChange={(e) => setFtpPort(Number(e.target.value) || 2121)}
                      disabled={ftpStats?.running}
                      className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm tabular-nums focus:border-sky-300/40 focus-ring disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-400">Mode</label>
                    <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5">
                      <button
                        onClick={() => setFtpAnonymous(true)}
                        className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${ftpAnonymous ? "bg-sky-400/20 text-sky-200" : "text-slate-500 hover:text-slate-300"}`}
                      >
                        Anonymous
                      </button>
                      <button
                        onClick={() => setFtpAnonymous(false)}
                        className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${!ftpAnonymous ? "bg-sky-400/20 text-sky-200" : "text-slate-500 hover:text-slate-300"}`}
                      >
                        Credentials
                      </button>
                    </div>
                  </div>
                  {!ftpAnonymous && (
                    <>
                      <div>
                        <label className="mb-1.5 block text-xs font-medium text-slate-400">Username</label>
                        <input
                          value={ftpAccUser}
                          onChange={(e) => setFtpAccUser(e.target.value)}
                          disabled={ftpStats?.running}
                          className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm focus:border-sky-300/40 focus-ring disabled:opacity-50"
                        />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-xs font-medium text-slate-400">Password</label>
                        <input
                          type="password"
                          value={ftpAccPass}
                          onChange={(e) => setFtpAccPass(e.target.value)}
                          disabled={ftpStats?.running}
                          placeholder="empty = any password"
                          className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm focus:border-sky-300/40 focus-ring disabled:opacity-50"
                        />
                      </div>
                    </>
                  )}
                </div>
                <div className="mt-4 rounded-xl border border-sky-300/15 bg-sky-400/[0.04] px-4 py-3 text-[11px] leading-relaxed text-slate-400">
                  <span className="font-medium text-sky-300">How to connect:</span> in Windows Explorer type
                  <span className="mx-1 rounded bg-black/40 px-1.5 py-0.5 font-mono text-[10px] text-sky-200">ftp://your-ip:{ftpPort}</span>
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
                            ? "border-emerald-300/30 bg-emerald-400/10 text-emerald-300"
                            : tunnel?.state === "starting"
                              ? "border-sky-300/30 bg-sky-400/10 text-sky-300"
                              : "border-white/10 bg-white/[0.04] text-slate-500"
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
                        <div className="mt-0.5 text-[13px] text-slate-500">
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
                        <div className="mt-6 flex items-center gap-3 rounded-xl border border-emerald-300/25 bg-emerald-400/[0.06] px-4 py-3.5">
                          <Zap className="size-4 shrink-0 animate-pulse text-emerald-300" />
                          <span className="min-w-0 flex-1 truncate font-mono text-sm text-emerald-200">
                            {tunnel.publicUrl}
                          </span>
                          <CopyButton text={tunnel.publicUrl} />
                        </div>
                        <div className="mt-2 text-[11px] text-slate-500">{tunnel.detail}</div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {tunnel?.state === "error" && (
                    <div className="mt-4 rounded-xl border border-rose-400/25 bg-rose-500/[0.08] px-4 py-3 text-[11px] leading-relaxed text-rose-200">
                      {tunnel.detail}
                    </div>
                  )}

                  <div className="mt-6 grid gap-2.5">
                    <label className="mb-0.5 block text-xs font-medium text-slate-400">Tunnel method</label>
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
                            ? "border-indigo-300/40 bg-indigo-400/10"
                            : "border-white/[0.07] bg-white/[0.02] hover:border-white/15"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className={`grid size-4 place-items-center rounded-full border ${
                              tunnelMethod === m.id ? "border-indigo-300 bg-indigo-400/30" : "border-white/20"
                            }`}
                          >
                            {tunnelMethod === m.id && <div className="size-1.5 rounded-full bg-indigo-200" />}
                          </div>
                          <span className="text-sm font-medium text-slate-200">{m.title}</span>
                        </div>
                        <div className="mt-1 pl-6 text-[11px] text-slate-500">{m.desc}</div>
                      </button>
                    ))}
                    {tunnelMethod === "custom" && (
                      <input
                        value={customUrl}
                        onChange={(e) => setCustomUrl(e.target.value)}
                        placeholder="https://your-domain.tunnel.dev"
                        className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 font-mono text-xs text-slate-200 placeholder:text-slate-600 focus:border-indigo-300/40 focus-ring"
                      />
                    )}
                  </div>

                  <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-[11px] leading-relaxed text-slate-500">
                    <Server className="mt-0.5 size-4 shrink-0 text-slate-400" />
                    The tunnel forwards to your local HTTP server. Start it on the HTTP tab first —
                    the tunnel reuses its port automatically. Anyone with the public link can
                    download your shared files from anywhere.
                  </div>
                </GlassCard>
              </div>
            )}

            {/* -------------------------------- BT ------------------------------- */}
            {tab === "bt" && (
              <GlassCard className="p-7">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="relative grid size-12 place-items-center rounded-2xl border border-fuchsia-300/25 bg-fuchsia-400/10 text-fuchsia-300">
                      <Magnet className="size-5" />
                    </div>
                    <div>
                      <div className="text-base font-semibold">BitTorrent</div>
                      <div className="mt-0.5 flex items-center gap-2 text-[13px] text-slate-500">
                        DHT + magnet links
                        <Badge tone="fuchsia" className="border-fuchsia-300/25 bg-fuchsia-400/10 text-fuchsia-300">
                          Experimental
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="mt-6 flex gap-3">
                  <input
                    value={magnet}
                    onChange={(e) => setMagnet(e.target.value)}
                    placeholder="magnet:?xt=urn:btih:…"
                    className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 font-mono text-xs text-slate-200 placeholder:text-slate-600 focus:border-fuchsia-300/40 focus-ring"
                  />
                  <Button variant="primary" onClick={addMagnet}>
                    Add
                  </Button>
                </div>
                <div className="mt-5 space-y-2">
                  <AnimatePresence initial={false}>
                    {magnets.map((m) => (
                      <motion.div
                        key={m.id}
                        layout
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4"
                      >
                        <div className="flex items-center justify-between">
                          <span className="min-w-0 truncate font-mono text-xs text-slate-300">{m.name}</span>
                          <button
                            onClick={() => setMagnets((prev) => prev.filter((x) => x.id !== m.id))}
                            className="text-slate-600 hover:text-rose-300"
                          >
                            <X className="size-4" />
                          </button>
                        </div>
                        <div className="mt-3">
                          <GaugeBar percent={64} className="h-1.5" />
                        </div>
                        <div className="mt-2 flex justify-between text-[11px] tabular-nums text-slate-500">
                          <span>64% · 12 seeds · 4 peers</span>
                          <span>↓ 4.2 MB/s</span>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                  {magnets.length === 0 && (
                    <p className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-xs text-slate-600">
                      No magnets queued. Paste a magnet link to begin.
                    </p>
                  )}
                </div>
              </GlassCard>
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
        <GlassCard delay={0.1} className="divide-y divide-white/[0.05]">
          {transfers.length === 0 && (
            <div className="px-5 py-10 text-center text-sm text-slate-600">
              No transfers yet — start one from any tab above.
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
                      ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-300"
                      : "border-indigo-300/25 bg-indigo-400/10 text-indigo-300"
                  }`}
                >
                  {t.mode === "p2p" ? (
                    <Wifi className="size-4" />
                  ) : t.mode === "http" ? (
                    <Server className="size-4" />
                  ) : (
                    <CloudUpload className="size-4" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate font-mono text-[12px] text-slate-300">{t.name}</span>
                    <span className="shrink-0 text-[11px] tabular-nums text-slate-500">
                      {t.state === "active" ? formatSpeed(t.speed) : ""}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-3">
                    <GaugeBar
                      percent={percent(t.transferred, t.bytes)}
                      className="h-1"
                      danger={t.state === "error"}
                    />
                    <span className="w-24 shrink-0 text-right text-[11px] tabular-nums text-slate-500">
                      {formatBytes(t.transferred)} / {formatBytes(t.bytes, 0)}
                    </span>
                  </div>
                </div>
                {t.state === "done" ? (
                  <Badge tone="emerald">Done</Badge>
                ) : (
                  <button
                    onClick={() => api.cancelTransfer(t.id)}
                    className="grid size-7 place-items-center rounded-lg text-slate-600 transition-colors hover:bg-rose-400/10 hover:text-rose-300"
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
