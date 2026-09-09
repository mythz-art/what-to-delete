import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api } from "@/lib/api";
import type { AppSettings, PageId, SystemStatus } from "@/lib/types";

export interface Toast {
  id: number;
  kind: "success" | "info" | "error";
  title: string;
  message?: string;
}

interface AppStore {
  page: PageId;
  navContext: Record<string, unknown> | null;
  navigate: (page: PageId, ctx?: Record<string, unknown>) => void;
  status: SystemStatus | null;
  refreshStatus: () => Promise<void>;
  settings: AppSettings | null;
  saveSettings: (s: AppSettings) => Promise<void>;
  vaultUnlocked: boolean;
  unlockVault: () => void;
  lockVault: () => void;
  feedbackOpen: boolean;
  openFeedback: () => void;
  closeFeedback: () => void;
  toasts: Toast[];
  pushToast: (t: Omit<Toast, "id">) => void;
  booting: boolean;
}

const StoreContext = createContext<AppStore | null>(null);

export function useApp(): AppStore {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useApp must be used inside <AppProvider>");
  return ctx;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [page, setPage] = useState<PageId>("dashboard");
  const [navContext, setNavContext] = useState<Record<string, unknown> | null>(null);
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [vaultUnlocked, setVaultUnlocked] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [booting, setBooting] = useState(true);
  const toastId = useRef(0);

  const pushToast = useCallback((t: Omit<Toast, "id">) => {
    const id = ++toastId.current;
    setToasts((prev) => [...prev, { ...t, id }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== id));
    }, 4200);
  }, []);

  const refreshStatus = useCallback(async () => {
    try {
      const s = await api.getSystemStatus();
      setStatus(s);
    } catch {
      /* keep previous status */
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
    void api.getSettings().then(setSettings).catch(() => undefined);
    const t = setTimeout(() => setBooting(false), 1500);
    return () => clearTimeout(t);
  }, [refreshStatus]);

  const navigate = useCallback((p: PageId, ctx?: Record<string, unknown>) => {
    setPage(p);
    setNavContext(ctx ?? null);
  }, []);

  const saveSettings = useCallback(async (s: AppSettings) => {
    setSettings(s);
    await api.saveSettings(s);
  }, []);

  const unlockVault = useCallback(() => setVaultUnlocked(true), []);
  const lockVault = useCallback(() => {
    setVaultUnlocked(false);
    void api.vaultLock();
  }, []);

  const value: AppStore = {
    page,
    navContext,
    navigate,
    status,
    refreshStatus,
    settings,
    saveSettings,
    vaultUnlocked,
    unlockVault,
    lockVault,
    feedbackOpen,
    openFeedback: () => setFeedbackOpen(true),
    closeFeedback: () => setFeedbackOpen(false),
    toasts,
    pushToast,
    booting,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
