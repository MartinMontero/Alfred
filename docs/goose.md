# goose — Alfred's embedded harness

Alfred embeds **goose** (AAIF, Apache-2.0) as its agentic harness. goose is the
hands; Alfred is the memory. Alfred drives goose over the **Agent Client Protocol
(ACP)** on stdio and registers the vault as goose's ground truth.

> Desktop only. The harness panel, ACP SDK, and xterm terminal are excluded from
> the web/PWA bundle.

## How it works

```
SolidJS UI ──ACP/stdio──> goose acp (sidecar)
  (ClientSideConnection)        │
                                ├─ MCP extension: alfred-vault  ──> Alfred MCP server ──> vault (.md)
                                └─ provider: Anthropic | Google | Ollama | … (never Meta/OpenAI/xAI)
```

- **Transport:** `goose acp` runs as a Tauri sidecar (`externalBin: binaries/goose`).
  Its raw stdout/stdin are bridged into Web streams and driven with
  `@agentclientprotocol/sdk` 1.0 (`ClientSideConnection` + `ndJsonStream`,
  `PROTOCOL_VERSION` 1, `session/new` + `session/prompt`).
- **Lifecycle:** the goose child is killed on window close / reload.
- **Sidecar staging:** `npm run stage:goose` copies the locally-installed goose into
  `src-tauri/binaries/goose-<host-triple>.exe`. It runs automatically before
  `tauri dev`/`tauri build`. The binary is git-ignored (regenerated, ~236 MB).

## Provider lockdown (denylist, no fork)

goose ships **every** provider compiled in (OpenAI/xAI/Codex included). Alfred does
**not** fork or recompile it. Instead it makes the excluded vendors unreachable:

- runs goose under an isolated `GOOSE_PATH_ROOT` with `GOOSE_DISABLE_KEYRING=1`;
- pins `GOOSE_PROVIDER`/`GOOSE_MODEL` to a permitted provider and passes the key via
  env only (never persisted by goose);
- routes every provider/credential/model decision through the **same denylist** as
  the app (`resolveExcludedVendor` — exclude only Meta/OpenAI/xAI, permit the rest);
- filters the provider picker so the UI never offers an excluded vendor.

See [`docs/audit/phase4.md`](audit/phase4.md) for the "present-in-binary but
unreachable-through-Alfred" posture in full.

## The vault as a goose extension

Alfred writes an isolated `config.yaml` registering the Phase-3 MCP server:

```yaml
GOOSE_PROVIDER: "anthropic"
GOOSE_MODEL: "claude-sonnet-4-6"
extensions:
  alfred-vault:
    type: stdio
    cmd: "npx"
    args: ["tsx", "<vault>/mcp/run.ts", "<vault>"]
    enabled: true
    timeout: 300
```

To register the vault with a goose CLI **outside** Alfred, use the snippet in
[`docs/mcp-server.md`](mcp-server.md). (goose expects Node at
`C:\Program Files\nodejs\` for Node-based stdio extensions.)

## Recipes

Recipes are YAML workflows in [`goose-recipes/`](../goose-recipes). From Alfred you
can author one (it's a note editor), **validate** it (`goose recipe validate`), and
**run** it (`goose run --recipe … --no-session`, streamed to the chat + terminal).

- `vault-summary.yaml` — summarize the vault from `hot.md` + Memory Bank.
- `vault-research.yaml` — delegates the summary to a **sub-recipe** (a subagent in an
  isolated session), keeping the main context clean.

## Subagents

Subagents are invoked by **natural-language delegation** ("research X in parallel
with Y") — goose decides when to spawn them and they inherit the session's
extensions. Sub-recipes (`sub_recipes:`) run isolated subagent sessions. Subagent
activity surfaces in the terminal pane via ACP `session/update` notifications.
