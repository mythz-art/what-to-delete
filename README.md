# What to Delete? 🧹

**Windows disk cleanup app — rebuilt as a single portable EXE.**
Tauri 2 · React 19 · TypeScript · Tailwind CSS 4 · Rust

[![Release](https://img.shields.io/badge/release-v2.2.0-6366f1?style=flat-square)](../../releases) [![License](https://img.shields.io/badge/license-MIT-22d3ee?style=flat-square)](#license) [![Windows](https://img.shields.io/badge/platform-Windows%2010%2F11%20x64-0078D6?style=flat-square)](#requirements)

## ✨ Features

| Area | What you get |
|------|--------------|
| 🧹 **Junk Cleanup** | 6-category scanner (temp, browser caches, update cache, system cache, logs, recycle bin) with parallel (rayon) scanning and one-click wipe |
| 🔍 **Duplicates** | Content-aware finder: size → multi-sample partial hash → full SHA-256, with session hash caching |
| 📁 **File Manager** | Browse every drive: cut/copy/paste, rename, delete-to-recycle-bin, search, properties, grid & list views, breadcrumbs, windowed rendering for huge folders |
| 🕵️ **Finders** | Large files · old files · empty folders · installed apps (registry) · recycle-bin manager |
| 🌐 **Share** | LAN **HTTP server** + full **FTP server** (Explorer/FileZilla compatible) with live transfer queue and instant start/stop |
| 🚀 **Publish Online** | Free public tunnels: localhost.run (built-in ssh) or Cloudflare quick tunnel — share files with anyone, anywhere |
| 🖥 **Multitask Terminal** | Detached hacker-terminal window with **one tab per task** (Windows-Terminal style): every scan, hunt, wipe, tool run and transfer streams its own private real-time log with process detail + result summary — matrix rain, CRT scanlines, pause/clear/copy, fullscreen |
| 🎨 **Light + Dark Themes** | Premium token-based design system — light by default, one-click dark, new gradient shield logo |
| 📊 **Dashboard** | Health ring, RAM monitor, per-drive filesystem info, quick actions, drive cards open the file manager |
| 🔐 **Vault** | AES-256-GCM encrypted file vault (PBKDF2 120k) — plus the classic feedback easter egg |
| 🦾 **Responsive** | Auto-collapsing sidebar, adaptive grids — comfortable from 880px to ultrawide |

## 📦 Download

Grab **`WhatToDelete.exe`** from [Releases](../../releases) — it is a **single 5.6 MB portable executable**.
No installer, no DLLs, no dependencies to manage. (WebView2Loader is statically linked.)

Direct download (permanent): [onlyfiles.com/wCwGwwAVE6xi](https://onlyfiles.com/wCwGwwAVE6xi)

## ⚡ Quick start

1. Run `WhatToDelete.exe`
2. **Dashboard → Scan & Clean** for your first junk sweep
3. Watch the **multitask terminal** window — each running job opens its own tab with live logs
4. Click any **drive card → Open in File Manager**
5. **Share → FTP Server / Publish Online** to share files anywhere

## 🔧 Build from source

```bash
# frontend
npm install && npm run build          # -> dist/

# backend (cross-compile from Linux; mingw-w64 required)
source scripts/env.sh                 # or set CC/AR/LD for x86_64-pc-windows-gnu
cd src-tauri
cargo build --release --target x86_64-pc-windows-gnu
# output: target/x86_64-pc-windows-gnu/release/what-to-delete.exe (single file)
```

> The repo vendors `src-tauri/third_party/webview2-com-sys` (patched for static
> WebView2Loader linking) plus the MSVC runtime shim in `third_party/shim` —
> together they produce the DLL-free single executable.

## 🗂 Structure

```
wtd-tauri/
├── src/                    # React frontend (pages, components, mock engine)
│   ├── pages/              # Dashboard, Cleanup, Duplicates, Files, Share, Tools, Settings, Vault, About
│   ├── components/         # chrome (sidebar/titlebar), ui kit, FileExplorer, TerminalConsole, FeedbackModal
│   └── lib/                # api adapter, store, types, mock engine
└── src-tauri/
    ├── src/                # Rust backend
    │   ├── junk.rs         # parallel junk scanner
    │   ├── dedup.rs        # content-aware duplicate finder
    │   ├── files.rs        # file manager operations
    │   ├── finders.rs      # large/old/empty/apps/recycle
    │   ├── ftp.rs          # complete FTP server (PASV, RETR/STOR, MKD/RMD/DELE) with force-close stop
    │   ├── share.rs        # HTTP server + transfer queue
    │   ├── tunnel.rs       # localhost.run / cloudflared public tunnels
    │   ├── logs.rs         # global + per-task log ring buffers (terminal feed)
    │   ├── tasks.rs        # task registry driving the multi-tab terminal
    │   ├── sys.rs          # drives, RAM, volume info
    │   ├── vault.rs        # AES-256-GCM vault
    │   └── ...
    ├── third_party/
    │   ├── webview2-com-sys/   # patched: static WebView2Loader linking
    │   └── shim/               # MSVC runtime shims for mingw static linking
    └── tauri.conf.json
```

## 🧠 How the single-exe trick works

`webview2-com-sys` normally links `WebView2Loader.dll` on the GNU toolchain.
This repo patches the crate (see `third_party/`) to link **WebView2LoaderStatic.lib**
instead, and ships a small C/asm shim providing the MSVC runtime bits the static
library expects (`__security_cookie`, `_Init_thread_*` magic statics with a real
COFF TLS epoch, nothrow new/delete, CFG dispatch thunk). Result: the loader code
is compiled straight into the exe and no external file is needed.

## 👤 Author

**mythz** — [github.com/mythz-art](https://github.com/mythz-art)

## Changelog

- **v2.2.0** — multitask terminal (one tab per task, per-task log channels), FTP
  start/stop force-close fix, performance overhaul (batched log rendering,
  windowed file lists, memoized components), premium light/dark redesign with
  new logo, About page slimmed to `mythz`
- **v2.1.0** — FTP server, public tunnels, file manager, hacker terminal
- **v2.0.0** — full redesign, real Rust engine, single-exe research

## Requirements

- Windows 10/11 x64
- Microsoft Edge WebView2 Runtime (preinstalled on modern Windows; otherwise
  offered automatically — see [aka.ms/webview2](https://aka.ms/webview2))

## License

MIT
