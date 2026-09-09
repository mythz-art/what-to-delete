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
} from "lucide-react";
import { api } from "@/lib/api";
import { useApp } from "@/lib/store";
import { formatBytes, formatDate } from "@/lib/format";
import type { DirListing, FileEntry, ItemProps } from "@/lib/types";
import { Button, EmptyState, Modal } from "@/components/ui";

/* ------------------------------ file icons ------------------------------ */

function iconFor(entry: FileEntry, size = "size-9") {
  if (entry.isDir) return <Folder className={`${size} text-amber-300/90`} />;
  const name = entry.name.toLowerCase();
  if (/\.(png|jpe?g|gif|webp|svg|bmp|ico|heic)$/.test(name))
    return <ImageIcon className={`${size} text-fuchsia-300/80`} />;
  if (/\.(mp4|mkv|avi|mov|webm|flv|wmv)$/.test(name))
    return <Film className={`${size} text-rose-300/80`} />;
  if (/\.(mp3|wav|flac|ogg|m4a|wma)$/.test(name))
    return <Music className={`${size} text-sky-300/80`} />;
  if (/\.(zip|rar|7z|tar|gz|iso|cab)$/.test(name))
    return <Archive className={`${size} text-lime-300/80`} />;
  if (/\.(js|ts|tsx|jsx|py|rs|c|cpp|cs|java|html|css|json|xml|yml|yaml|sh|ps1|bat)$/.test(name))
    return <FileCode2 className={`${size} text-emerald-300/80`} />;
  if (/\.(txt|md|pdf|docx?|xlsx?|pptx?|csv|log|ini|cfg)$/.test(name))
    return <FileText className={`${size} text-slate-300/80`} />;
  return <File className={`${size} text-slate-400/70`} />;
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
        <div className="flex items-center gap-0.5 rounded-xl border border-white/10 bg-white/[0.04] p-1">
          <button onClick={back} disabled={history.length === 0} className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-white/10 hover:text-slate-200 disabled:opacity-30" title="Back">
            <ArrowLeft className="size-4" />
          </button>
          <button onClick={forward} disabled={future.length === 0} className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-white/10 hover:text-slate-200 disabled:opacity-30" title="Forward">
            <ArrowRight className="size-4" />
          </button>
          <button onClick={up} disabled={!listing?.parent} className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-white/10 hover:text-slate-200 disabled:opacity-30" title="Up">
            <ArrowUp className="size-4" />
          </button>
          <button onClick={() => navigate(path ?? null, false)} disabled={!path} className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-white/10 hover:text-slate-200 disabled:opacity-30" title="Refresh">
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* breadcrumbs */}
        <div className="flex min-w-[180px] flex-1 items-center gap-1 overflow-x-auto scroll-thin rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
          <button onClick={() => navigate(null)} className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-slate-300 hover:text-white" title="This PC">
            <HardDrive className="size-3.5" />
            PC
          </button>
          {crumbs.map((c, i) => (
            <span key={c.path + i} className="flex shrink-0 items-center gap-1">
              <ChevronRight className="size-3 text-slate-600" />
              <button
                onClick={() => navigate(c.path)}
                className={`text-xs font-medium ${i === crumbs.length - 1 ? "text-white" : "text-slate-400 hover:text-slate-200"}`}
              >
                {c.name}
              </button>
            </span>
          ))}
          {showRoots && <span className="ml-2 text-xs text-slate-500">quick access</span>}
        </div>

        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
          <Search className="size-3.5 text-slate-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={path ? "Search this folder…" : "Open a drive first"}
            disabled={!path}
            className="w-28 bg-transparent text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:w-44 transition-all sm:w-36 sm:focus:w-56"
          />
        </div>

        <div className="flex items-center gap-0.5 rounded-xl border border-white/10 bg-white/[0.04] p-1">
          <button onClick={() => setView("grid")} className={`rounded-lg p-2 transition-colors ${view === "grid" ? "bg-white/10 text-white" : "text-slate-400 hover:text-slate-200"}`} title="Grid view">
            <LayoutGrid className="size-4" />
          </button>
          <button onClick={() => setView("list")} className={`rounded-lg p-2 transition-colors ${view === "list" ? "bg-white/10 text-white" : "text-slate-400 hover:text-slate-200"}`} title="List view">
            <List className="size-4" />
          </button>
        </div>

        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortMode)}
          className="rounded-xl border border-white/10 bg-white/[0.04] px-2.5 py-2 text-xs text-slate-300 focus:outline-none"
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
      <div className="relative min-h-[340px] flex-1 overflow-y-auto scroll-thin rounded-2xl border border-white/[0.07] bg-black/20 p-3">
        {loading && (
          <div className="absolute inset-0 z-10 grid place-items-center bg-slate-950/40 backdrop-blur-[2px]">
            <Loader2 className="size-6 animate-spin text-indigo-300" />
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
                className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.03] p-4 text-left transition-all hover:border-indigo-300/30 hover:bg-indigo-400/10"
              >
                {iconFor(r, "size-10")}
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-slate-200">{r.name}</div>
                  <div className="truncate text-[11px] text-slate-500">{r.path}</div>
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
          <div className="mt-3 rounded-lg border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-[11px] text-amber-300">
            Large folder — showing first {listing.entries.length} of {listing.total} entries. Use search to find specific items.
          </div>
        )}
      </div>

      {/* status bar */}
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
        <span>{entries.length} items</span>
        {selectedEntries.length > 0 && (
          <>
            <span className="text-slate-400">· {selectedEntries.length} selected</span>
            <span className="text-slate-400">· {formatBytes(selectedEntries.reduce((s, e) => s + e.bytes, 0))}</span>
          </>
        )}
        {searchResults && <span className="text-indigo-300">· search results for "{search}"</span>}
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
            className="fixed z-50 w-48 overflow-hidden rounded-xl border border-white/10 bg-slate-900/95 py-1 shadow-2xl backdrop-blur"
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
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
              >
                <item.icon className="size-3.5 text-slate-500" />
                {item.label}
              </button>
            ))}
            <button
              onClick={() => {
                setSelected(new Set([menu.entry.path]));
                setMenu(null);
                setTimeout(doDelete, 30);
              }}
              className="flex w-full items-center gap-2.5 border-t border-white/10 px-3 py-2 text-left text-xs text-rose-300 transition-colors hover:bg-rose-500/15"
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
                <div className="truncate text-base font-semibold text-slate-100">{propsItem.name}</div>
                <div className="truncate text-[11px] text-slate-500">{propsItem.path}</div>
              </div>
            </div>
            <div className="space-y-2 rounded-xl border border-white/[0.07] bg-black/20 p-4 text-xs">
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
                  <span className="text-slate-500">{k}</span>
                  <span className="text-right text-slate-200">{v}</span>
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
  if (view === "grid") {
    return (
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10">
        {entries.map((e) => {
          const isSel = selected.has(e.path);
          return (
            <motion.button
              key={e.path}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.18 }}
              onClick={(ev) => {
                if (renaming === e.path) return;
                onToggle(e, ev, ev.ctrlKey || ev.metaKey);
              }}
              onDoubleClick={() => onOpen(e)}
              onContextMenu={(ev) => {
                ev.preventDefault();
                onMenu(ev.clientX, ev.clientY, e);
              }}
              className={`group flex flex-col items-center gap-1.5 rounded-xl border p-3 transition-all ${
                isSel
                  ? "border-indigo-300/50 bg-indigo-400/15"
                  : "border-white/[0.05] bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.06]"
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
                  className="w-full rounded bg-black/50 px-1 text-center text-[11px] text-white focus:outline-none"
                />
              ) : (
                <span className="w-full truncate text-center text-[11px] font-medium text-slate-300">{e.name}</span>
              )}
              {!e.isDir && e.bytes > 0 && (
                <span className="text-[10px] tabular-nums text-slate-600">{formatBytes(e.bytes, 0)}</span>
              )}
            </motion.button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="sticky top-0 z-10 mb-1 grid grid-cols-[minmax(0,1fr)_90px_120px_90px] gap-2 border-b border-white/[0.07] bg-slate-950/80 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500 backdrop-blur">
        <span>Name</span>
        <span className="text-right">Size</span>
        <span className="text-right">Modified</span>
        <span className="text-right">Actions</span>
      </div>
      {entries.map((e) => {
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
              isSel ? "bg-indigo-400/15" : "hover:bg-white/[0.04]"
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
                  className="min-w-0 flex-1 rounded bg-black/50 px-2 py-0.5 text-xs text-white focus:outline-none"
                />
              ) : (
                <span className="truncate text-xs font-medium text-slate-300">{e.name}</span>
              )}
              {searchMode && <span className="hidden max-w-[40%] truncate text-[10px] text-slate-600 lg:block">{e.path}</span>}
              {e.readonly && <span className="shrink-0 rounded border border-amber-400/30 px-1 text-[9px] text-amber-300">RO</span>}
            </div>
            <span className="text-right text-[11px] tabular-nums text-slate-500">{e.isDir ? "—" : formatBytes(e.bytes)}</span>
            <span className="text-right text-[11px] tabular-nums text-slate-500">{e.modified ? formatDate(e.modified) : "—"}</span>
            <div className="flex justify-end gap-1">
              <button
                onClick={(ev) => {
                  ev.stopPropagation();
                  onOpen(e);
                }}
                className="rounded p-1.5 text-slate-500 transition-colors hover:bg-white/10 hover:text-slate-200"
                title="Open"
              >
                <ExternalLink className="size-3.5" />
              </button>
              <button
                onClick={(ev) => {
                  ev.stopPropagation();
                  onMenu(ev.clientX, ev.clientY, e);
                }}
                className="rounded p-1.5 text-slate-500 transition-colors hover:bg-white/10 hover:text-slate-200"
                title="More"
              >
                <Pencil className="size-3.5" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
