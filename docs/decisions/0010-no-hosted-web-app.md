# 0010 — No hosted web app: Alfred ships desktop-only; the web build is an internal harness

- Status: Accepted
- Date: 2026-07-23
- Decider: Martin Montero (direct ruling)
- Supersedes: the "PWA deploy mode → Cloudflare Workers (`alfred-pwa`)" entry in
  `CLAUDE.md` DECISIONS, and the "PWA live at the subdomain" MVP item in `LOOP.md`.

## Decision

Alfred has **no user-facing web version**. It is a native desktop application,
distributed as a Windows installer, and that is the only form users ever receive.
The concept of a hosted PWA/browser app for users is **retired**.

The `BUILD_TARGET=web` build (`dist-web/`, `vite-plugin-pwa`, `src/platform/web/*`)
is **kept, but strictly as an internal development and test harness**:

- CI runs the axe-core and Lighthouse gates against it because the Linux CI/dev
  container cannot build the Tauri desktop app; the web build is the only browser
  surface available for those checks.
- It is used for fast UI probing during development (this container can't run Tauri).
- It is **never deployed, never published to any host, never shipped inside a release,
  and never positioned or offered to a user.** `release.yml` builds and uploads the
  Tauri Windows installers + `latest.json` only; it does not touch `dist-web/`.

## Why

- **Local-first is the thesis, not a feature.** A desktop app keeps the program and the
  notes on the user's own machine as plain files they own. A hosted web app stores notes
  in the browser's private storage (OPFS/IndexedDB) — not plain `.md` files openable in
  any editor — which contradicts the core promise (and the About-page copy that says
  every file would still open in any text editor).
- **Wayne Manor vs the Batcave.** `wecanjustbuildthings.dev` is the public face. If the
  `alfred-pwa` Cloudflare Worker slot is ever used, it serves a **public explainer /
  landing page** for the project that links to the desktop download — never the
  application itself. The app stays private to the user's machine.

## Consequences

- README, `CLAUDE.md`, and `LOOP.md` no longer present a web/PWA build as a product
  surface or an MVP deliverable; "PWA deploy" leaves the ship path.
- The `dev:web` / `build:web` / `preview:web` scripts and `vite-plugin-pwa` remain for
  the internal harness; the web manifest is labeled a dev harness so a stray load never
  presents as the shipping product.
- No `wrangler.jsonc` for the app is added. Any future landing-page Worker is a separate,
  content-only deliverable, explicitly not the app.
- A grep guard (`src/lib/no-web-ship.test.ts`) asserts the release workflow never builds
  or uploads the web bundle, so the internal harness can't drift into a shipped surface.
