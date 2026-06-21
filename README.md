# RAIN Desktop

A small, configurable **native desktop launcher** for your store/admin, built on
[Tauri v2](https://tauri.app) (the same lightweight Rust + system-webview approach
as [Pake](https://github.com/tw93/Pake) — ~5 MB apps, not Electron).

Unlike vanilla Pake (which bakes in **one fixed URL** at build time), this app
shows a **launcher screen**: you type a **URL**, optionally pre-fill your
**username + password**, and it opens the site in a clean native window where you
finish signing in — **including 2FA, which you always enter yourself**.

```
┌─ Launcher window ─────────┐        ┌─ Site window ─────────────┐
│  Site URL:  [__________]  │  Open  │  (your store/admin, you    │
│  ▸ pre-fill login          │ ─────▶ │   log in here: password +  │
│  [ Open site ]            │        │   2FA, like a browser)     │
└───────────────────────────┘        └───────────────────────────┘
```

## What it does / doesn't do
- ✅ Enter **any** URL at runtime; recent URLs are remembered.
- ✅ Optional **best-effort** username/password pre-fill (typed into the site's
  login form). Stored **only on your device**, only if you tick "remember".
- ✅ **2FA is never stored or auto-entered** — you type the code in the site window.
- ✅ Builds for **macOS** (`.dmg`/`.app`), **Windows** (`.msi` + NSIS `.exe`),
  **Linux** (`.deb` + `.AppImage` + `.rpm`).
- ⚠️ Auto-fill is *best-effort* — it targets common login-form fields and won't
  match every site. The robust path is always: log in normally in the site window.

---

## Build all three OSes with one command (recommended) — GitHub Actions

Cross-OS binaries **cannot** be compiled from a single machine. The reliable
"one command, all 3 versions" is CI:

1. Push this folder to a GitHub repo.
2. **Actions** tab → **build** → **Run workflow** → (optionally) type your
   **default URL** (e.g. `https://admin.mystore.com`) → **Run**.
3. When the three jobs finish, the installers are attached to a **draft Release**
   (Releases tab): macOS `.dmg`, Windows `.msi`/`.exe`, Linux `.deb`/`.AppImage`/`.rpm`.

Or just **push a tag** to build + publish in one step:
```bash
git tag v0.1.0 && git push origin v0.1.0
```
(In that mode the URL stays runtime-configurable in the launcher — no bake needed.)

The workflow auto-generates a placeholder icon if you haven't added one yet, so
the build works immediately. Add real artwork any time (see *Icon* below).

---

## Build locally (one OS at a time)

Prerequisites — install once:
- **Rust ≥ 1.77** → https://rustup.rs (`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`)
- **Node ≥ 18** (you have it) and **npm**
- Tauri's per-OS system deps → https://tauri.app/start/prerequisites
  - **macOS:** Xcode Command Line Tools (`xcode-select --install`).
  - **Linux:** `libwebkit2gtk-4.1-dev librsvg2-dev libayatana-appindicator3-dev patchelf` (+ build-essential).
  - **Windows:** the WebView2 runtime (preinstalled on Win 10/11) + MSVC Build Tools.

Then:
```bash
cd rain-desktop
npm install
npm run icons                 # generates the icon set (placeholder if no app-icon.png)

# optional: bake a default URL into the launcher
npm run set-url -- https://admin.mystore.com

npm run dev                   # run the app live (hot-ish reload)
npm run build                 # produce installers for THIS OS in src-tauri/target/release/bundle/
```

`npm run build` outputs to `src-tauri/target/release/bundle/` (e.g. `dmg/`, `msi/`,
`nsis/`, `deb/`, `appimage/`).

---

## Icon
Drop a **1024×1024 `app-icon.png`** in this folder and run `npm run icons` — Tauri
generates every platform icon (`.icns`, `.ico`, PNGs) into `src-tauri/icons/`.
With no `app-icon.png`, a plain placeholder is generated so builds never fail.

## Configure
- **App name / id / version:** `src-tauri/tauri.conf.json` (`productName`, `identifier`, `version`).
- **Launcher window size:** the `app.windows[0]` block in the same file.
- **Default URL at build time:** `npm run set-url -- <url>` (or the CI input).
- **Pre-fill field matching:** the selector list in `build_prefill_script()` in `src-tauri/src/lib.rs`.

## Layout
```
rain-desktop/
├─ src/                     # launcher UI (vanilla HTML/JS — no build step)
│  ├─ index.html · app.js · style.css
├─ src-tauri/               # the Tauri (Rust) app
│  ├─ src/lib.rs            # open_site command + credential pre-fill
│  ├─ src/main.rs
│  ├─ tauri.conf.json       # windows, bundle targets (all OSes), identifier
│  └─ capabilities/default.json
├─ scripts/                 # set-default-url + placeholder-icon generators
├─ .github/workflows/build.yml   # cross-OS build → draft release
└─ package.json
```

## Security notes
- The loaded website runs in its own window with **no access to native commands**
  (only the local launcher window has IPC — see `capabilities/default.json`).
- Stored credentials live in the launcher's local storage on your machine, only
  when you opt in. For a hardened version, move them to the OS keychain via
  `tauri-plugin-stronghold` / `keyring` (left out to keep v1 dependency-free).

---

*Built as a companion to the RAIN store. macOS/Windows/Linux installers come from
the GitHub Actions workflow above.*
