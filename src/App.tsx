import { AnimatePresence, motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { useCallback, useEffect, useState, type ComponentType } from "react";
import { AppProvider, useApp } from "@/lib/store";
import { AppShell } from "@/components/chrome";
import { Toasts } from "@/components/ui";
import { FeedbackModal } from "@/components/FeedbackModal";
import { TerminalDrawer, TerminalFAB } from "@/components/TerminalConsole";
import { DashboardPage } from "@/pages/Dashboard";
import { CleanupPage } from "@/pages/Cleanup";
import { DuplicatesPage } from "@/pages/Duplicates";
import { FilesPage } from "@/pages/Files";
import { SharePage } from "@/pages/Share";
import { ToolsPage } from "@/pages/Tools";
import { SettingsPage } from "@/pages/Settings";
import { VaultPage } from "@/pages/Vault";
import { AboutPage } from "@/pages/About";
import { api } from "@/lib/api";
import type { PageId } from "@/lib/types";

const PAGES: Record<PageId, ComponentType> = {
  dashboard: DashboardPage,
  cleanup: CleanupPage,
  duplicates: DuplicatesPage,
  files: FilesPage,
  share: SharePage,
  tools: ToolsPage,
  settings: SettingsPage,
  vault: VaultPage,
  about: AboutPage,
};

function BootSplash() {
  return (
    <motion.div
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.04 }}
      transition={{ duration: 0.5, ease: "easeInOut" }}
      className="fixed inset-0 z-[100] grid place-items-center bg-slate-950"
    >
      <div className="flex flex-col items-center">
        <div className="relative">
          <motion.div
            className="absolute -inset-6 rounded-full border border-indigo-300/20"
            animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0.15, 0.5] }}
            transition={{ duration: 2.2, repeat: Infinity }}
          />
          <motion.div
            initial={{ scale: 0.6, opacity: 0, rotate: -12 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 200, damping: 16 }}
            className="grid size-20 place-items-center rounded-3xl bg-gradient-to-br from-indigo-500 to-cyan-400 shadow-2xl shadow-indigo-500/30"
          >
            <Sparkles className="size-9 text-white" />
          </motion.div>
        </div>
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.5 }}
          className="mt-7 text-xl font-semibold tracking-tight"
        >
          What to Delete?
        </motion.div>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.45 }}
          className="mt-1.5 text-[12px] font-medium tracking-[0.2em] text-slate-500"
        >
          DISK&nbsp;GUARDIAN&nbsp;v2.1
        </motion.div>
      </div>
    </motion.div>
  );
}

function Router() {
  const { page, booting, toasts } = useApp();
  const Page = PAGES[page];
  const [terminalOpen, setTerminalOpen] = useState(false);

  // any page can request the terminal (e.g. dashboard quick action)
  useEffect(() => {
    const open = () => setTerminalOpen(true);
    window.addEventListener("wtd:open-terminal", open);
    return () => window.removeEventListener("wtd:open-terminal", open);
  }, []);

  const detach = useCallback(() => {
    api.terminalWindowShow();
    setTerminalOpen(false);
  }, []);

  return (
    <>
      <AnimatePresence>{booting && <BootSplash key="splash" />}</AnimatePresence>
      <AppShell bottom={
        <TerminalDrawer open={terminalOpen} onClose={() => setTerminalOpen(false)} onDetach={detach} />
      }>
        <AnimatePresence mode="wait">
          <Page key={page} />
        </AnimatePresence>
      </AppShell>
      {!terminalOpen && <TerminalFAB onClick={() => setTerminalOpen(true)} />}
      <FeedbackModal />
      <Toasts toasts={toasts} />
    </>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Router />
    </AppProvider>
  );
}
