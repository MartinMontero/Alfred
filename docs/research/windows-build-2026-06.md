# Windows 11 build — current facts (June 2026)

Operational distillation of the Windows 11 build research (run 24 Jun 2026). **Authoritative for the Windows build target.** Everything below is verified against official sources (v2.tauri.app, goose-docs.ai, github.com/aaif-goose/goose, code.claude.com, GitHub docs). Re-verify the fast-moving goose/Tauri items at build time.

## The headline: everything is native — no WSL2

Tauri 2.x, goose v1.38.0, and Claude Code all run as **native Windows 11 apps**. goose's install docs now say plainly: run the goose CLI natively on Windows (WSL optional, not required). goose ships a native `goose-x86_64-pc-windows-msvc` binary, so it embeds as a normal Tauri sidecar. **Take the native path for everything; only consider WSL2 if a Linux-only MCP extension later forces it.**

## macOS → Windows 11 translation

| macOS | Windows 11 |
|---|---|
| Xcode Command Line Tools | **Visual Studio Build Tools** → workload **"Desktop development with C++"** |
| WebView (built in) | **WebView2** — preinstalled on Windows 11 (skip unless missing) |
| `.app` / `.dmg` | **`.msi`** (WiX) + **`-setup.exe`** (NSIS) |
| Homebrew / `curl … \| bash` | **PowerShell** installers (`irm …\|iex`, `download_cli.ps1`) |
| sidecar `goose-aarch64-apple-darwin` | **`goose-x86_64-pc-windows-msvc.exe`** (note the `.exe`) |
| `~/.config/goose/config.yaml` | **`%APPDATA%\Block\goose\config\config.yaml`** |
| macOS Keychain | Windows Credential Manager — **but prefer env vars** (keyring is flaky) |
| `grep` / `cut` in shell | **`Select-String`** in PowerShell, or run in **Git Bash** |
| `~/dev/...` | **`%USERPROFILE%\dev\...`** (i.e. `C:\Users\<you>\dev`) |

## Prerequisites (install once, in this order)

1. **Git for Windows** — installer from git-scm.com; check "Add Git to PATH". Gives you Git Bash (where POSIX tools like `grep` work) and lets Claude Code use its Bash tool.
2. **Visual Studio Build Tools** — check **"Desktop development with C++"**. (Required by Tauri/Rust MSVC.)
3. **WebView2** — already on Windows 11; skip. (If ever missing, install Microsoft's Evergreen Bootstrapper.)
4. **Rust via rustup** (`winget install Rustlang.Rustup` or rustup.rs). Ensure default host triple is `x86_64-pc-windows-msvc`: `rustup default stable-msvc`. Restart the terminal.
5. **Node.js 22 LTS** (≥ 22.12) from nodejs.org. Verify `node -v`.
6. **(MSI only)** enable the **VBScript** Windows optional feature (Settings → Apps → Optional features → More Windows features) if `light.exe` fails during MSI bundling.
7. **Claude Code** (native): `irm https://claude.ai/install.ps1 | iex` (or `winget install Anthropic.ClaudeCode`). No admin, no Node required. Git for Windows recommended so it uses Bash, not PowerShell. (Windows quirk: paste images with **Alt+V**, not Ctrl+V.)
8. **goose CLI** (native, at Phase 4): in PowerShell —
   ```powershell
   Invoke-WebRequest -Uri "https://raw.githubusercontent.com/aaif-goose/goose/main/download_cli.ps1" -OutFile "download_cli.ps1"
   .\download_cli.ps1
   ```
   Installs `goose.exe` to `%USERPROFILE%\.local\bin` (add to PATH). Expect **v1.38.0+**. Configure a provider (Anthropic/Google/Ollama) via **environment variables**, not the keyring.

## Tauri build output on Windows

`npm run tauri build` →
- raw runnable binary: `src-tauri\target\release\<app>.exe` (runs locally, no signing needed)
- installers: `src-tauri\target\release\bundle\msi\` (WiX) and `src-tauri\target\release\bundle\nsis\` (`-setup.exe`)

MSI can only be built **on** Windows (WiX is Windows-only). **Code signing** isn't needed to build or run locally; it's needed for clean distribution (unsigned installers trigger SmartScreen). **Defer signing until you distribute.**

## goose sidecar on Windows (the #1 failure point — get the name exact)

- Place the binary at **`src-tauri\binaries\goose-x86_64-pc-windows-msvc.exe`** (copy from `%USERPROFILE%\.local\bin\goose.exe` and rename; on Windows the `.exe` extension is appended to the triple).
- `tauri.conf.json`: `"bundle": { "externalBin": ["binaries/goose"] }` (path is relative to `src-tauri`, stem only — no triple, no `.exe`).
- Register `tauri-plugin-shell`; grant a capability in `src-tauri\capabilities\*.json` allowing the sidecar with args `["acp"]` (e.g. `{"identifier":"shell:allow-execute","allow":[{"name":"binaries/goose","sidecar":true,"args":["acp"]}]}`).
- Spawn from Rust with `app.shell().sidecar("goose")` (stem only — Tauri adds the triple/`.exe`), or JS `Command.sidecar("binaries/goose")`. **You must kill the goose child process on app exit** (long-lived `goose acp` server → orphan risk).
- Compute the triple in a prebuild script: `rustc --print host-tuple` (Rust ≥ 1.84) or `rustc -Vv | Select-String "host:"`. Branch on `process.platform === 'win32'` to append `.exe`.
- **Caveat:** goose's docs document `goose acp` generically and flag it experimental; they do **not** include a Windows-specific `goose acp` statement. Recent releases include Windows console fixes, so it's expected to work — **test `goose acp` on the machine before depending on it.**

## goose provider lockdown on Windows

- Config/secrets live under `%APPDATA%\Block\goose\config\`. Keyring is flaky on Windows — set `GOOSE_DISABLE_KEYRING=1` and pass provider keys via env vars (`ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`); choose "do not store to keyring" in `goose configure`.
- Custom distribution (CUSTOM_DISTROS.md): provider JSON under `%APPDATA%\Block\goose\config\...`; recipe YAML `settings: { goose_provider: anthropic|google|ollama, goose_model: ... }`. Providers are increasingly **Cargo-feature-gated** — verify which are gated in v1.38.0 to strip OpenAI/xAI at compile time. Custom providers must use OpenAI-/Anthropic-/Ollama-compatible API formats.
- **Node-based MCP extensions** on Windows: goose expects Node at `C:\Program Files\nodejs\`; if elsewhere you may need `mklink /D`. Built-in `developer`/`computercontroller` extensions are unaffected.

## Shell / Git / path caveats

- **Line endings (critical for the sidecar `.exe`):** commit a `.gitattributes` with `* text=auto eol=lf` and `*.exe binary` (mark all of `src-tauri/binaries/*` as `binary`) so Git never mangles the goose binary or churns CRLF. This overrides per-developer `core.autocrlf`.
- **`grep` locally:** PowerShell has no `grep`. The zero-Soapbox check is `Get-ChildItem -Recurse -File | Select-String -Pattern soapbox` in PowerShell, or `grep -ri soapbox .` in **Git Bash**. (CI runs on Linux runners, where `grep` is fine.)
- **`npm run` scripts:** run via `cmd.exe` by default — `&&` chaining, `$VAR`, and `FOO=bar cmd` env syntax differ. Use `cross-env` for env vars, or set `npm config set script-shell "C:\\Program Files\\Git\\bin\\bash.exe"`. Audit Alfred's `build`/`build:web` scripts for bash-isms.
- **Relative tsx path:** `npx tsx ../wecanjustbuildthings.dev/enforcement/cli.ts all --tree .` works in both PowerShell and Git Bash (Node normalizes forward slashes). Run it from the Alfred repo root.

## Re-verify at build time

goose version + Windows asset filename + whether `goose acp` has Windows caveats; which providers are Cargo-feature-gated in the installed goose; exact Tauri CLI / `@tauri-apps/api` minor (`~2.9.x`); `@agentclientprotocol/sdk` (currently 0.25.0); Claude Code's PowerShell-tool state.
