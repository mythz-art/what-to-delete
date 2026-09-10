import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  RefreshCw,
  Search,
  LayoutGrid,
  List,
  FolderPlus,
  Scissors,
  Clipboard,
  Trash2,
  Pencil,
  Folder,
  FileText,
  Image as ImageIcon,
  Film,
  Music,
  Archive,
  FileCode2,
  File,
  ExternalLink,
  X,
  HardDrive,
  ChevronRight,
  Loader2,
  TerminalSquare,
  Hash,
  Flame,
  RotateCcw,
} from "lucide-react";
import { api } from "@/lib/api";
import { useApp } from "@/lib/store";
import { formatBytes, formatDate } from "@/lib/format";
import type { DirListing, FileEntry, ItemProps } from "@/lib/types";
import { Button, EmptyState, Modal } from "@/components/ui";

/* ------------------------------ file icons ------------------------------ */

function iconFor(entry: FileEntry, size = "size-9") {
  if (entry.isDir) return <Folder className={`${size} text-[var(--wtd-warn)]/90`} />;
  const name = entry.name.toLowerCase();
  if (/\.(png|jpe?g|gif|webp|svg|bmp|ico|heic)$/.test(name))
    return <ImageIcon className={`${size} text-[var(--wtd-fuchsia)]/80`} />;
  if (/\.(mp4|mkv|avi|mov|webm|flv|wmv)$/.test(name))
    return <Film className={`${size} text-[var(--wtd-bad)]/80`} />;
  if (/\.(mp3|wav|flac|ogg|m4a|wma)$/.test(name))
    return <Music className={`${size} text-[var(--wtd-cyan)]/80`} />;
  if (/\.(zip|rar|7z|tar|gz|iso|cab)$/.test(name))
    return <Archive className={`${size} text-[var(--wtd-ok)]/80`} />;
  if (/\.(js|ts|tsx|jsx|py|rs|c|cpp|cs|java|html|css|json|xml|yml|yaml|sh|ps1|bat)$/.test(name))
    return <FileCode2 className={`${size} text-[var(--wtd-ok)]/80`} />;
  if (/\.(txt|md|pdf|docx?|xlsx?|pptx?|csv|log|ini|cfg)$/.test(name))
    return <FileText className={`${size} text-ink-2/80`} />;
  return <File className={`${size} text-ink-3/70`} />;
}

type SortMode = "name" | "size" | "modified";

/* ------------------------------ explorer ------------------------------ */

export function FileExplorer({ initialPath }: { initialPath?: string }) {
  const { pushToast, refreshStatus, settings } = useApp();
  const [roots, setRoots] = useState<FileEntry[]>([]);
  const [listing, setListing] = useState<DirListing | null>(null);
  const [path, setPath] = useState<string | null>(initialPath ?? null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<FileEntry[] | null>(null);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [sort, setSort] = useState<SortMode>("name");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [history, setHistory] = useState<string[]>([]);
  const [future, setFuture] = useState<string[]>([]);
  const [clipboard, setClipboard] = useState<{ entries: FileEntry[]; cut: boolean } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [propsItem, setPropsItem] = useState<ItemProps | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; entry: FileEntry } | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // load roots once
  useEffect(() => {
    void api.filesRoots().then(setRoots).catch(() => undefined);
  }, []);

  const navigate = useCallback(
    (p: string | null, pushHistory = true) => {
      setPath(p);
      setSelected(new Set());
      setSearchResults(null);
      setSearch("");
      if (p === null) {
        setListing(null);
        return;
      }
      if (pushHistory && path) {
        setHistory((h) => [...h, path]);
        setFuture([]);
      }
      setLoading(true);
      void api
        .filesList(p)
        .then((l) => setListing(l))
        .catch((e) => pushToast({ kind: "error", title: "Cannot open folder", message: String(e) }))
        .finally(() => setLoading(false));
    },
    [path, pushToast],
  );

  // respond to initialPath changes (dashboard disk click)
  useEffect(() => {
    if (initialPath && initialPath !== path) {
      navigate(initialPath, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPath]);

  const back = () => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    if (path) setFuture((f) => [path, ...f]);
    navigate(prev, false);
  };
  const forward = () => {
    if (future.length === 0) return;
    const next = future[0];
    setFuture((f) => f.slice(1));
    if (path) setHistory((h) => [...h, path]);
    navigate(next, false);
  };
  const up = () => {
    if (!listing?.parent) return;
    navigate(listing.parent);
  };

  // search with debounce
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!search.trim() || !path) {
      setSearchResults(null);
      return;
    }
    searchTimer.current = setTimeout(() => {
      void api
        .filesSearch(path, search.trim(), 200)
        .then(setSearchResults)
        .catch(() => setSearchResults([]));
    }, 350);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [search, path]);

  const entries = useMemo(() => {
    const list = searchResults ?? listing?.entries ?? [];
    const sorted = [...list];
    if (sort === "size") sorted.sort((a, b) => (b.isDir ? 1 : 0) - (a.isDir ? 1 : 0) || b.bytes - a.bytes);
    if (sort === "modified") sorted.sort((a, b) => (b.isDir ? 1 : 0) - (a.isDir ? 1 : 0) || b.modified - a.modified);
    return sorted;
  }, [searchResults, listing, sort]);

  const selectedEntries = useMemo(
    () => entries.filter((e) => selected.has(e.path)),
    [entries, selected],
  );

  const toggleSelect = (entry: FileEntry, e: React.MouseEvent, additive: boolean) => {
    e.stopPropagation();
    setSelected((prev) => {
      const next = additive ? new Set(prev) : new Set<string>();
      if (prev.has(entry.path) && additive) next.delete(entry.path);
      else next.add(entry.path);
      return next;
    });
  };

  const openEntry = (entry: FileEntry) => {
    if (entry.isDir) navigate(entry.path);
    else void api.filesOpen(entry.path);
  };

  const doDelete = async () => {
    const targets = selectedEntries;
    if (targets.length === 0) return;
    const useRecycle = settings?.useRecycleBin ?? true;
    if (useRecycle && !confirm(`Move ${targets.length} item(s) to the Recycle Bin?`)) return;
    if (!useRecycle && !confirm(`PERMANENTLY delete ${targets.length} item(s)? This cannot be undone.`)) return;
    const r = await api.filesDelete(targets.map((t) => t.path));
    if (r.ok) {
      pushToast({ kind: "success", title: `Deleted ${r.affected} item(s)`, message: `${formatBytes(r.freedBytes)} freed` });
      void refreshStatus();
      navigate(path, false);
    } else {
      pushToast({ kind: "error", title: "Delete failed", message: r.error ?? "" });
    }
  };

  const doPaste = async () => {
    if (!clipboard || !path) return;
    const r = clipboard.cut
      ? await api.filesMove(clipboard.entries.map((e) => e.path), path)
      : await api.filesCopy(clipboard.entries.map((e) => e.path), path);
    if (r.ok) {
      pushToast({ kind: "success", title: `Pasted ${r.affected} item(s)` });
      if (clipboard.cut) setClipboard(null);
      navigate(path, false);
    } else {
      pushToast({ kind: "error", title: "Paste failed", message: r.error ?? "" });
    }
  };

  const doMkdir = async () => {
    if (!path) return;
    const name = prompt("New folder name");
    if (!name?.trim()) return;
    try {
      await api.filesMkdir(path, name.trim());
      pushToast({ kind: "success", title: "Folder created" });
      navigate(path, false);
    } catch (e) {
      pushToast({ kind: "error", title: "Create failed", message: String(e) });
    }
  };

  const doRename = async () => {
    if (!renaming || !renameValue.trim()) {
      setRenaming(null);
      return;
    }
    try {
      await api.filesRename(renaming, renameValue.trim());
      pushToast({ kind: "success", title: "Renamed" });
      navigate(path, false);
    } catch (e) {
      pushToast({ kind: "error", title: "Rename failed", message: String(e) });
    }
    setRenaming(null);
  };

  const showProps = async (entry: FileEntry) => {
    try {
      const p = await api.filesProps(entry.path);
      setPropsItem(p);
    } catch (e) {
      pushToast({ kind: "error", title: "Properties failed", message: String(e) });
    }
  };

  /* ---------- v2.3 power-user actions ---------- */

  const openTerminalHere = async (entry: FileEntry) => {
    try {
      const ok = await api.openTerminal(entry.isDir ? entry.path : path ?? entry.path);
      if (!ok) pushToast({ kind: "error", title: "No terminal found", message: "wt.exe / powershell.exe / cmd.exe all failed" });
    } catch (e) {
      pushToast({ kind: "error", title: "Terminal failed", message: String(e) });
    }
  };

  const copyHash = async (entry: FileEntry) => {
    try {
      const r = await api.hashFile(entry.path);
      void navigator.clipboard?.writeText(r.hex);
      pushToast({
        kind: "success",
        title: `${r.algo} copied to clipboard`,
        message: `${r.hex.slice(0, 24)}… · ${formatBytes(r.bytes, 0)} hashed in ${r.ms} ms`,
      });
    } catch (e) {
      pushToast({ kind: "error", title: "Hash failed", message: String(e) });
    }
  };

  const shred = async (entry: FileEntry) => {
    if (
      !confirm(
        `SECURELY SHRED "${entry.name}"?\n\nThe file will be overwritten 3 times with random data, then destroyed. This is UNRECOVERABLE — worse than the Recycle Bin.`,
      )
    )
      return;
    try {
      const r = await api.shredPaths([entry.path]);
      if (r.ok) {
        pushToast({ kind: "success", title: `Shredded ${r.affected} file(s)`, message: `${formatBytes(r.freedBytes)} unrecoverably freed` });
        navigate(path, false);
        void refreshStatus();
      } else {
        pushToast({ kind: "error", title: "Shred incomplete", message: r.error ?? "" });
      }
    } catch (e) {
      pushToast({ kind: "error", title: "Shred failed", message: String(e) });
    }
  };

  const deleteOnReboot = async (entry: FileEntry) => {
    if (!confirm(`Schedule "${entry.name}" for deletion at next REBOOT?\n\nUse this for files that are locked / "in use" and refuse normal deletion.`))
      return;
    try {
      const r = await api.deleteOnReboot([entry.path]);
      if (r.ok) {
        pushToast({ kind: "success", title: "Scheduled", message: `${entry.name} will be deleted at next reboot` });
      } else {
        pushToast({ kind: "error", title: "Could not schedule", message: r.error ?? "try running the app as administrator" });
      }
    } catch (e) {
      pushToast({ kind: "error", title: "Schedule failed", message: String(e) });
    }
  };

  // close context menu on click anywhere
  useEffect(() => {
    const close = () => setMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  const crumbs = useMemo(() => {
    if (!path) return [];
    const norm = path.replace(/\\/g, "/").replace(/\/$/, "");
    const parts = norm.split("/").filter(Boolean);
    let acc = "";
    return parts.map((p) => {
      acc = acc ? `${acc}\\${p}` : `${p}\\`;
      return { name: p, path: parts.length === 1 ? acc : acc };
    });
  }, [path]);

  /* ------------------------------ render ------------------------------ */

  const showRoots = path === null;

  return (
    <div className="flex min-h-0 flex-col gap-3" onClick={() => setRenaming(null)}>
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-0.5 rounded-xl border border-[var(--wtd-edge)] bg-[var(--wtd-card-2)] p-1">
          <button onClick={back} disabled={history.length === 0} className="rounded-lg p-2 text-ink-3 transition-colors hover:bg-[var(--wtd-card-3)] hover:text-ink-2 disabled:opacity-30" title="Back">
            <ArrowLeft className="size-4" />
          </button>
          <button onClick={forward} disabled={future.length === 0} className="rounded-lg p-2 text-ink-3 transition-colors hover:bg-[var(--wtd-card-3)] hover:text-ink-2 disabled:opacity-30" title="Forward">
            <ArrowRight className="size-4" />
          </button>
          <button onClick={up} disabled={!listing?.parent} className="rounded-lg p-2 text-ink-3 transition-colors hover:bg-[var(--wtd-card-3)] hover:text-ink-2 disabled:opacity-30" title="Up">
            <ArrowUp className="size-4" />
          </button>
          <button onClick={() => navigate(path ?? null, false)} disabled={!path} className="rounded-lg p-2 text-ink-3 transition-colors hover:bg-[var(--wtd-card-3)] hover:text-ink-2 disabled:opacity-30" title="Refresh">
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* breadcrumbs */}
        <div className="flex min-w-[180px] flex-1 items-center gap-1 overflow-x-auto scroll-thin rounded-xl border border-[var(--wtd-edge)] bg-[var(--wtd-card-2)] px-3 py-2">
          <button onClick={() => navigate(null)} className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-ink-2 hover:text-ink" title="This PC">
            <HardDrive className="size-3.5" />
            PC
          </button>
          {crumbs.map((c, i) => (
            <span key={c.path + i} className="flex shrink-0 items-center gap-1">
              <ChevronRight className="size-3 text-ink-4" />
              <button
                onClick={() => navigate(c.path)}
                className={`text-xs font-medium ${i === crumbs.length - 1 ? "text-ink font-semibold" : "text-ink-3 hover:text-ink-2"}`}
              >
                {c.name}
              </button>
            </span>
          ))}
          {showRoots && <span className="ml-2 text-xs text-ink-3">quick access</span>}
        </div>

        <div className="flex items-center gap-2 rounded-xl border border-[var(--wtd-edge)] bg-[var(--wtd-card-2)] px-3 py-2">
          <Search className="size-3.5 text-ink-3" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={path ? "Search this folder…" : "Open a drive first"}
            disabled={!path}
            className="w-28 bg-transparent text-xs text-ink-2 placeholder:text-ink-4 focus:outline-none focus:w-44 transition-all sm:w-36 sm:focus:w-56"
          />
        </div>

        <div className="flex items-center gap-0.5 rounded-xl border border-[var(--wtd-edge)] bg-[var(--wtd-card-2)] p-1">
          <button onClick={() => setView("grid")} className={`rounded-lg p-2 transition-colors ${view === "grid" ? "bg-[var(--wtd-accent-soft)] text-ink" : "text-ink-3 hover:text-ink-2"}`} title="Grid view">
            <LayoutGrid className="size-4" />
          </button>
          <button onClick={() => setView("list")} className={`rounded-lg p-2 transition-colors ${view === "list" ? "bg-[var(--wtd-accent-soft)] text-ink" : "text-ink-3 hover:text-ink-2"}`} title="List view">
            <List className="size-4" />
          </button>
        </div>

        <Button
          variant="ghost"
          onClick={() => path && void api.openTerminal(path).then((ok) => {
            if (!ok) pushToast({ kind: "error", title: "No terminal found" });
          })}
          disabled={!path}
          icon={<TerminalSquare className="size-4" />}
          className="!px-3"
          title="Open terminal in this folder (wt / PowerShell / cmd)"
        >
          <span className="hidden sm:inline">Terminal</span>
        </Button>

        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortMode)}
          className="rounded-xl border border-[var(--wtd-edge)] bg-[var(--wtd-card-2)] px-2.5 py-2 text-xs text-ink-2 focus:outline-none"
          title="Sort"
        >
          <option value="name">Name</option>
          <option value="size">Size</option>
          <option value="modified">Modified</option>
        </select>

        <Button variant="ghost" onClick={doMkdir} disabled={!path} icon={<FolderPlus className="size-4" />} className="!px-3">
          <span className="hidden sm:inline">Folder</span>
        </Button>
        <Button
          variant="ghost"
          disabled={selectedEntries.length === 0 || !path}
          onClick={() => setClipboard({ entries: selectedEntries, cut: true })}
          icon={<Scissors className="size-4" />}
          className="!px-3"
        >
          <span className="hidden sm:inline">Cut</span>
        </Button>
        <Button
          variant="ghost"
          disabled={selectedEntries.length === 0}
          onClick={() => setClipboard({ entries: selectedEntries, cut: false })}
          icon={<Clipboard className="size-4" />}
          className="!px-3"
        >
          <span className="hidden sm:inline">Copy</span>
        </Button>
        <Button
          variant="ghost"
          disabled={!clipboard || !path}
          onClick={doPaste}
          className="!px-3"
        >
          <Clipboard className="size-4" />
          <span className="hidden sm:inline">Paste{clipboard ? (clipboard.cut ? " (cut)" : "") : ""}</span>
        </Button>
        <Button variant="danger" disabled={selectedEntries.length === 0} onClick={doDelete} icon={<Trash2 className="size-4" />} className="!px-3">
          <span className="hidden sm:inline">Delete</span>
        </Button>
      </div>

      {/* content */}
      <div className="relative min-h-[340px] flex-1 overflow-y-auto scroll-thin rounded-2xl border border-[var(--wtd-edge)] bg-black/20 p-3">
        {loading && (
          <div className="absolute inset-0 z-10 grid place-items-center bg-app/40 backdrop-blur-[2px]">
            <Loader2 className="size-6 animate-spin text-[var(--wtd-accent-ink)]" />
          </div>
        )}

        {showRoots ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {roots.map((r) => (
              <motion.button
                key={r.path}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={() => navigate(r.path)}
                className="flex items-center gap-3 rounded-xl border border-[var(--wtd-edge)] bg-[var(--wtd-card-2)] p-4 text-left transition-all hover:border-[var(--wtd-accent-line)] hover:bg-[var(--wtd-accent-soft)]"
              >
                {iconFor(r, "size-10")}
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-ink-2">{r.name}</div>
                  <div className="truncate text-[11px] text-ink-3">{r.path}</div>
                </div>
              </motion.button>
            ))}
            {roots.length === 0 && <EmptyState icon={<HardDrive className="size-6" />} title="No drives found" />}
          </div>
        ) : searchResults !== null ? (
          <FileRows
            entries={entries}
            view="list"
            selected={selected}
            renaming={renaming}
            renameValue={renameValue}
            setRenameValue={setRenameValue}
            onRenameSubmit={doRename}
            onToggle={toggleSelect}
            onOpen={openEntry}
            onMenu={(x, y, entry) => setMenu({ x, y, entry })}
            searchMode
          />
        ) : entries.length === 0 && !loading ? (
          <EmptyState icon={<Folder className="size-6" />} title="This folder is empty" description="Nothing to see here." />
        ) : (
          <FileRows
            entries={entries}
            view={view}
            selected={selected}
            renaming={renaming}
            renameValue={renameValue}
            setRenameValue={setRenameValue}
            onRenameSubmit={doRename}
            onToggle={toggleSelect}
            onOpen={openEntry}
            onMenu={(x, y, entry) => setMenu({ x, y, entry })}
          />
        )}

        {listing?.truncated && (
          <div className="mt-3 rounded-lg border border-[var(--wtd-warn-soft)] bg-[var(--wtd-warn-soft)] px-3 py-2 text-[11px] text-[var(--wtd-warn)]">
            Large folder — showing first {listing.entries.length} of {listing.total} entries. Use search to find specific items.
          </div>
        )}
      </div>

      {/* status bar */}
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-ink-3">
        <span>{entries.length} items</span>
        {selectedEntries.length > 0 && (
          <>
            <span className="text-ink-3">· {selectedEntries.length} selected</span>
            <span className="text-ink-3">· {formatBytes(selectedEntries.reduce((s, e) => s + e.bytes, 0))}</span>
          </>
        )}
        {searchResults && <span className="text-[var(--wtd-accent-ink)]">· search results for "{search}"</span>}
      </div>

      {/* context menu */}
      <AnimatePresence>
        {menu && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.12 }}
            style={{ left: menu.x, top: menu.y }}
            className="fixed z-50 w-48 overflow-hidden rounded-xl border border-[var(--wtd-edge)] bg-[var(--wtd-card)]/95 py-1 shadow-2xl backdrop-blur"
            onClick={(e) => e.stopPropagation()}
          >
            {[
              { label: "Open", icon: ExternalLink, fn: () => (menu.entry.isDir ? navigate(menu.entry.path) : void api.filesOpen(menu.entry.path)) },
              { label: "Rename", icon: Pencil, fn: () => { setRenaming(menu.entry.path); setRenameValue(menu.entry.name); } },
              { label: "Cut", icon: Scissors, fn: () => setClipboard({ entries: [menu.entry], cut: true }) },
              { label: "Copy", icon: Clipboard, fn: () => setClipboard({ entries: [menu.entry], cut: false }) },
              { label: "Properties", icon: FileText, fn: () => void showProps(menu.entry) },
            ].map((item) => (
              <button
                key={item.label}
                onClick={() => {
                  item.fn();
                  setMenu(null);
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs text-ink-2 transition-colors hover:bg-[var(--wtd-card-3)] hover:text-ink"
              >
                <item.icon className="size-3.5 text-ink-3" />
                {item.label}
              </button>
            ))}
            {/* v2.3 power-user pack */}
            <div className="my-1 border-t border-[var(--wtd-edge)]" />
            <button
              onClick={() => {
                void openTerminalHere(menu.entry);
                setMenu(null);
              }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs text-ink-2 transition-colors hover:bg-[var(--wtd-card-3)] hover:text-ink"
              title="Open Windows Terminal / PowerShell here"
            >
              <TerminalSquare className="size-3.5 text-ink-3" />
              Open Terminal Here
            </button>
            {!menu.entry.isDir && (
              <>
                <button
                  onClick={() => {
                    void copyHash(menu.entry);
                    setMenu(null);
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs text-ink-2 transition-colors hover:bg-[var(--wtd-card-3)] hover:text-ink"
                  title="Compute SHA-256 and copy to clipboard"
                >
                  <Hash className="size-3.5 text-ink-3" />
                  Copy SHA-256
                </button>
                <button
                  onClick={() => {
                    void shred(menu.entry);
                    setMenu(null);
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs text-[var(--wtd-warn)] transition-colors hover:bg-[var(--wtd-warn-soft)]"
                  title="Overwrite 3 times, then delete — unrecoverable"
                >
                  <Flame className="size-3.5" />
                  Secure Shred
                </button>
                <button
                  onClick={() => {
                    void deleteOnReboot(menu.entry);
                    setMenu(null);
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs text-ink-2 transition-colors hover:bg-[var(--wtd-card-3)] hover:text-ink"
                  title="For locked files — Windows deletes them during the next boot"
                >
                  <RotateCcw className="size-3.5 text-ink-3" />
                  Delete on Reboot
                </button>
              </>
            )}
            <button
              onClick={() => {
                setSelected(new Set([menu.entry.path]));
                setMenu(null);
                setTimeout(doDelete, 30);
              }}
              className="flex w-full items-center gap-2.5 border-t border-[var(--wtd-edge)] px-3 py-2 text-left text-xs text-[var(--wtd-bad)] transition-colors hover:bg-[var(--wtd-bad-soft)]"
            >
              <Trash2 className="size-3.5" />
              Delete
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* properties modal */}
      <Modal open={!!propsItem} onClose={() => setPropsItem(null)} width="max-w-md">
        {propsItem && (
          <div>
            <div className="mb-4 flex items-center gap-3">
              {iconFor({ ...propsItem, isDir: propsItem.isDir, name: propsItem.name, path: propsItem.path, bytes: propsItem.bytes, modified: propsItem.modified, hidden: false, readonly: false }, "size-11")}
              <div className="min-w-0">
                <div className="truncate text-base font-semibold text-ink">{propsItem.name}</div>
                <div className="truncate text-[11px] text-ink-3">{propsItem.path}</div>
              </div>
            </div>
            <div className="space-y-2 rounded-xl border border-[var(--wtd-edge)] bg-black/20 p-4 text-xs">
              {[
                ["Type", propsItem.isDir ? "Folder" : "File"],
                ["Size", formatBytes(propsItem.bytes, 2)],
                ...(propsItem.isDir
                  ? ([
                      ["Files", String(propsItem.fileCount)],
                      ["Subfolders", String(propsItem.dirCount)],
                    ] as [string, string][])
                  : []),
                ["Modified", propsItem.modified ? formatDate(propsItem.modified) : "—"],
                ["Created", propsItem.created ? formatDate(propsItem.created) : "—"],
                ["Read-only", propsItem.readonly ? "Yes" : "No"],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4">
                  <span className="text-ink-3">{k}</span>
                  <span className="text-right text-ink-2">{v}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-end">
              <Button variant="ghost" onClick={() => setPropsItem(null)} icon={<X className="size-4" />}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ------------------------------ rows / cells ------------------------------ */

/**
 * v2.2 perf: windowed rendering for huge directories — renders the first
 * chunk and grows via an IntersectionObserver sentinel. Keeps the DOM small
 * so scrolling stays smooth even with thousands of entries.
 */
function useWindowedEntries(entries: FileEntry[], chunk = 140) {
  const [visibleCount, setVisibleCount] = useState(chunk);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setVisibleCount(chunk);
  }, [entries, chunk]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (es) => {
        if (es[0]?.isIntersecting) {
          setVisibleCount((c) => Math.min(c + chunk, entries.length));
        }
      },
      { rootMargin: "600px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [entries.length, chunk]);

  const visible = entries.slice(0, visibleCount);
  const hasMore = visibleCount < entries.length;
  return { visible, hasMore, sentinelRef, hidden: entries.length - visibleCount };
}

function FileRows({
  entries,
  view,
  selected,
  renaming,
  renameValue,
  setRenameValue,
  onRenameSubmit,
  onToggle,
  onOpen,
  onMenu,
  searchMode,
}: {
  entries: FileEntry[];
  view: "grid" | "list";
  selected: Set<string>;
  renaming: string | null;
  renameValue: string;
  setRenameValue: (v: string) => void;
  onRenameSubmit: () => void;
  onToggle: (e: FileEntry, ev: React.MouseEvent, additive: boolean) => void;
  onOpen: (e: FileEntry) => void;
  onMenu: (x: number, y: number, e: FileEntry) => void;
  searchMode?: boolean;
}) {
  const { visible, hasMore, sentinelRef, hidden } = useWindowedEntries(entries);
  if (view === "grid") {
    return (
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10">
        {visible.map((e) => {
          const isSel = selected.has(e.path);
          return (
            <button
              key={e.path}
              onClick={(ev) => {
                if (renaming === e.path) return;
                onToggle(e, ev, ev.ctrlKey || ev.metaKey);
              }}
              onDoubleClick={() => onOpen(e)}
              onContextMenu={(ev) => {
                ev.preventDefault();
                onMenu(ev.clientX, ev.clientY, e);
              }}
              className={`perf-row group flex flex-col items-center gap-1.5 rounded-xl border p-3 transition-colors ${
                isSel
                  ? "border-indigo-300/50 bg-[var(--wtd-accent-soft)]"
                  : "border-[var(--wtd-edge)] bg-[var(--wtd-card-2)] hover:border-[var(--wtd-edge-2)] hover:bg-[var(--wtd-card-2)]"
              } ${e.hidden ? "opacity-50" : ""}`}
              title={e.path}
            >
              <div className="relative">
                {iconFor(e)}
                {e.readonly && <span className="absolute -right-1 -top-1 size-2 rounded-full bg-amber-400" />}
              </div>
              {renaming === e.path ? (
                <input
                  autoFocus
                  value={renameValue}
                  onChange={(ev) => setRenameValue(ev.target.value)}
                  onBlur={onRenameSubmit}
                  onKeyDown={(ev) => ev.key === "Enter" && onRenameSubmit()}
                  onClick={(ev) => ev.stopPropagation()}
                  className="input w-full px-1 text-center text-[11px] focus:outline-none"
                />
              ) : (
                <span className="w-full truncate text-center text-[11px] font-medium text-ink-2">{e.name}</span>
              )}
              {!e.isDir && e.bytes > 0 && (
                <span className="text-[10px] tabular-nums text-ink-4">{formatBytes(e.bytes, 0)}</span>
              )}
            </button>
          );
        })}
        {hasMore && (
          <div ref={sentinelRef} className="col-span-full py-6 text-center text-[11px] text-ink-4">
            loading {hidden} more…
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="sticky top-0 z-10 mb-1 grid grid-cols-[minmax(0,1fr)_90px_120px_90px] gap-2 border-b border-[var(--wtd-edge)] bg-app/80 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-ink-3 backdrop-blur">
        <span>Name</span>
        <span className="text-right">Size</span>
        <span className="text-right">Modified</span>
        <span className="text-right">Actions</span>
      </div>
      {visible.map((e) => {
        const isSel = selected.has(e.path);
        return (
          <div
            key={e.path}
            onClick={(ev) => onToggle(e, ev, ev.ctrlKey || ev.metaKey)}
            onDoubleClick={() => onOpen(e)}
            onContextMenu={(ev) => {
              ev.preventDefault();
              onMenu(ev.clientX, ev.clientY, e);
            }}
            className={`grid cursor-default grid-cols-[minmax(0,1fr)_90px_120px_90px] items-center gap-2 rounded-lg px-3 py-2 transition-colors ${
              isSel ? "bg-[var(--wtd-accent-soft)]" : "hover:bg-[var(--wtd-card-2)]"
            } ${e.hidden ? "opacity-50" : ""}`}
          >
            <div className="flex min-w-0 items-center gap-2.5">
              {iconFor(e, "size-5")}
              {renaming === e.path ? (
                <input
                  autoFocus
                  value={renameValue}
                  onChange={(ev) => setRenameValue(ev.target.value)}
                  onBlur={onRenameSubmit}
                  onKeyDown={(ev) => ev.key === "Enter" && onRenameSubmit()}
                  className="input min-w-0 flex-1 px-2 py-0.5 text-xs focus:outline-none"
                />
              ) : (
                <span className="truncate text-xs font-medium text-ink-2">{e.name}</span>
              )}
              {searchMode && <span className="hidden max-w-[40%] truncate text-[10px] text-ink-4 lg:block">{e.path}</span>}
              {e.readonly && <span className="shrink-0 rounded border border-[var(--wtd-warn-soft)] px-1 text-[9px] text-[var(--wtd-warn)]">RO</span>}
            </div>
            <span className="text-right text-[11px] tabular-nums text-ink-3">{e.isDir ? "—" : formatBytes(e.bytes)}</span>
            <span className="text-right text-[11px] tabular-nums text-ink-3">{e.modified ? formatDate(e.modified) : "—"}</span>
            <div className="flex justify-end gap-1">
              <button
                onClick={(ev) => {
                  ev.stopPropagation();
                  onOpen(e);
                }}
                className="rounded p-1.5 text-ink-3 transition-colors hover:bg-[var(--wtd-card-3)] hover:text-ink-2"
                title="Open"
              >
                <ExternalLink className="size-3.5" />
              </button>
              <button
                onClick={(ev) => {
                  ev.stopPropagation();
                  onMenu(ev.clientX, ev.clientY, e);
                }}
                className="rounded p-1.5 text-ink-3 transition-colors hover:bg-[var(--wtd-card-3)] hover:text-ink-2"
                title="More"
              >
                <Pencil className="size-3.5" />
              </button>
            </div>
          </div>
        );
      })}
      {hasMore && (
        <div ref={sentinelRef} className="py-6 text-center text-[11px] text-ink-4">
          loading {hidden} more entries…
        </div>
      )}
    </div>
  );
}
