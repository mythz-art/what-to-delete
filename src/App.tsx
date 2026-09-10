import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useState, type ComponentType } from "react";
import { AppProvider, useApp } from "@/lib/store";
import { AppShell } from "@/components/chrome";
import { Toasts } from "@/components/ui";
import { FeedbackModal } from "@/components/FeedbackModal";
import { TerminalFAB } from "@/components/TerminalConsole";
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
import { Logo } from "@/components/ui";
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
      className="fixed inset-0 z-[100] grid place-items-center bg-[var(--wtd-bg)]"
    >
      <div className="flex flex-col items-center">
        <div className="relative">
          <motion.div
            className="absolute -inset-6 rounded-full border border-[var(--wtd-accent-line)]"
            animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0.15, 0.5] }}
            transition={{ duration: 2.2, repeat: Infinity }}
          />
          <motion.div
            initial={{ scale: 0.6, opacity: 0, rotate: -12 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 200, damping: 16 }}
          >
            <Logo size={80} />
          </motion.div>
        </div>
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.5 }}
          className="mt-7 text-xl font-semibold tracking-tight text-ink"
        >
          What to Delete?
        </motion.div>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.45 }}
          className="mt-1.5 text-[12px] font-medium tracking-[0.2em] text-ink-3"
        >
          DISK&nbsp;GUARDIAN&nbsp;v2.2
        </motion.div>
      </div>
    </motion.div>
  );
}

function Router() {
  const { page, booting, toasts } = useApp();
  const Page = PAGES[page];

  // v2.2: the terminal opens as a DETACHED window by default.
  // On boot we reveal it once (it is pre-created hidden in tauri.conf.json),
  // every "open terminal" action afterwards just shows/focuses it.
  useEffect(() => {
    const t = setTimeout(() => api.terminalWindowShow(), 900);
    const open = () => api.terminalWindowShow();
    window.addEventListener("wtd:open-terminal", open);
    return () => {
      clearTimeout(t);
      window.removeEventListener("wtd:open-terminal", open);
    };
  }, []);

  const openTerminal = useCallback(() => api.terminalWindowShow(), []);

  return (
    <>
      <AnimatePresence>{booting && <BootSplash key="splash" />}</AnimatePresence>
      <AppShell>
        <AnimatePresence mode="wait">
          <Page key={page} />
        </AnimatePresence>
      </AppShell>
      <TerminalFAB onClick={openTerminal} />
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
