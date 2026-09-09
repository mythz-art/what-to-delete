import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  FileSearch,
  Clock,
  FolderX,
  Globe,
  RefreshCw,
  Bug,
  Package,
  Gauge,
  Loader2,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import { api } from "@/lib/api";
import { useApp } from "@/lib/store";
import { formatBytes } from "@/lib/format";
import { Badge, Button, GlassCard, GaugeBar, SectionHeader } from "@/components/ui";
import { PageShell } from "@/components/chrome";
import type { ToolInfo, ToolResult } from "@/lib/types";

const TOOL_ICONS: Record<string, typeof FileSearch> = {
  "large-files": FileSearch,
  "old-downloads": Clock,
  "empty-folders": FolderX,
  "browser-caches": Globe,
  "update-cache": RefreshCw,
  "crash-dumps": Bug,
  "app-sizes": Package,
  "startup-audit": Gauge,
};

const TOOL_TONES: Record<string, string> = {
  "large-files": "border-indigo-300/25 bg-indigo-400/10 text-indigo-300",
  "old-downloads": "border-sky-300/25 bg-sky-400/10 text-sky-300",
  "empty-folders": "border-slate-300/20 bg-white/[0.05] text-slate-300",
  "browser-caches": "border-cyan-300/25 bg-cyan-400/10 text-cyan-300",
  "update-cache": "border-blue-300/25 bg-blue-400/10 text-blue-300",
  "crash-dumps": "border-rose-300/25 bg-rose-400/10 text-rose-300",
  "app-sizes": "border-violet-300/25 bg-violet-400/10 text-violet-300",
  "startup-audit": "border-amber-300/25 bg-amber-400/10 text-amber-300",
};

export function ToolsPage() {
  const { navContext, pushToast } = useApp();
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [running, setRunning] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, ToolResult>>({});

  useEffect(() => {
    void api.listTools().then(setTools).catch(() => undefined);
  }, []);

  const run = async (id: string) => {
    if (running) return;
    setRunning(id);
    try {
      const res = await api.runTool(id);
      setResults((r) => ({ ...r, [id]: res }));
      pushToast({
        kind: "success",
        title: `${res.found} items found`,
        message: res.note,
      });
    } catch {
      pushToast({ kind: "error", title: "Tool run failed" });
    } finally {
      setRunning(null);
    }
  };

  const autoRun = navContext?.toolId as string | undefined;
  useEffect(() => {
    if (autoRun && tools.length > 0 && !results[autoRun] && !running) {
      void run(autoRun);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRun, tools.length]);

  return (
    <PageShell>
      <SectionHeader
        title="Toolbox"
        subtitle="Focused sweeps for specific space hogs"
        right={<Badge tone="indigo">{tools.length} tools</Badge>}
      />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-3">
        {tools.map((tool, i) => {
          const Icon = TOOL_ICONS[tool.id] ?? FileSearch;
          const tone = TOOL_TONES[tool.id] ?? TOOL_TONES["empty-folders"];
          const isRunning = running === tool.id;
          const res = results[tool.id];
          return (
            <GlassCard key={tool.id} hover delay={0.05 * i} className="relative flex flex-col p-5">
              <div className="flex items-start justify-between">
                <div className={`grid size-11 place-items-center rounded-xl border ${tone}`}>
                  <Icon className="size-5" />
                </div>
                {res && (
                  <Badge tone={res.bytes > 0 ? "cyan" : "slate"}>
                    {res.bytes > 0 ? formatBytes(res.bytes) : `${res.found} items`}
                  </Badge>
                )}
              </div>
              <div className="mt-4 text-[15px] font-semibold tracking-tight">{tool.name}</div>
              <p className="mt-1.5 min-h-[36px] text-xs leading-relaxed text-slate-500">
                {tool.description}
              </p>

              <AnimatePresence>
                {res && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-500">{res.found} results</span>
                        <span className="font-semibold tabular-nums text-slate-300">
                          {formatBytes(res.bytes)}
                        </span>
                      </div>
                      <div className="mt-1.5 text-[11px] leading-relaxed text-slate-500">{res.note}</div>
                      <div className="mt-2">
                        <GaugeBar percent={Math.min(100, (res.bytes / (150 * 1024 ** 3)) * 100)} className="h-1" />
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="mt-auto flex items-center justify-between pt-4">
                <span className="text-[11px] text-slate-600">
                  {res ? "Scan complete" : "Ready to run"}
                </span>
                <Button
                  variant={res ? "ghost" : "primary"}
                  loading={isRunning}
                  onClick={() => run(tool.id)}
                  className="!px-3.5 !py-2 text-xs"
                  icon={res ? undefined : <Sparkles className="size-3.5" />}
                >
                  {isRunning ? "Running" : res ? "Run again" : "Run"}
                </Button>
              </div>

              {isRunning && (
                <motion.div
                  className="absolute inset-x-5 bottom-0 h-[2px] rounded-full bg-gradient-to-r from-indigo-400 to-cyan-300"
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  style={{ originX: 0 }}
                  transition={{ duration: 1.8, repeat: Infinity, ease: "linear" }}
                />
              )}
            </GlassCard>
          );
        })}
      </div>

      {running && (
        <div className="mt-6 flex items-center justify-center gap-2 text-xs text-slate-500">
          <Loader2 className="size-3.5 animate-spin text-indigo-300" />
          Sweeping your drives with the {tools.find((t) => t.id === running)?.name ?? "tool"}…
        </div>
      )}

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="mt-8 flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3"
      >
        <ChevronRight className="size-4 text-slate-600" />
        <p className="text-xs leading-relaxed text-slate-500">
          Every tool is read-only until you confirm an action. Large-file results can be sent straight to
          Cleanup for safe removal.
        </p>
      </motion.div>
    </PageShell>
  );
}
