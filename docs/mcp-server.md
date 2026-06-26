# Alfred MCP server — register the vault as ground truth

The Alfred MCP server exposes a Phase-2 **agentic vault** to any MCP harness
(goose, Claude Code) so the agent reads your specs, decisions, memory, and
`hot.md` as ground truth.

> **This is a desktop / filesystem capability.** It runs as a local Node process
> the harness spawns over **stdio**, reading and writing real `.md` files on
> disk. The Alfred **PWA is the human surface**; this server is the machine
> surface. Default transport is stdio only — there is no network listener unless
> you explicitly opt in (see "HTTP" below).

- Spec **2025-11-25** · `@modelcontextprotocol/sdk` **v1.29.0** · Zod (strict).
- Every tool input is treated as untrusted; every path is confined to the vault
  root (traversal — `../`, `..\`, `C:\…`, `\\UNC`, drive-relative — is refused);
  every tool schema is `additionalProperties:false`; durable Memory Bank writes
  are provenance-stamped.

## Run it

```powershell
# From the Alfred repo. Vault root as the argument (or ALFRED_VAULT env).
npm run mcp -- "C:\Users\<you>\Documents\My Vault"
```

## Register with goose (stdio extension)

Add to `%APPDATA%\Block\goose\config\config.yaml` (Windows). goose expects Node at
`C:\Program Files\nodejs\`.

```yaml
extensions:
  alfred-vault:
    type: stdio
    cmd: npx
    args:
      - tsx
      - C:/Users/<you>/dev/Alfred/mcp/run.ts
      - C:/Users/<you>/Documents/My Vault
    enabled: true
    timeout: 300
    # Optional instead of the path arg:
    # envs: { ALFRED_VAULT: "C:/Users/<you>/Documents/My Vault" }
```

## Register with Claude Code (stdio)

`claude mcp add`:

```powershell
claude mcp add alfred-vault -- npx tsx C:/Users/<you>/dev/Alfred/mcp/run.ts "C:/Users/<you>/Documents/My Vault"
```

…or a project `.mcp.json` entry:

```json
{
  "mcpServers": {
    "alfred-vault": {
      "type": "stdio",
      "command": "npx",
      "args": ["tsx", "C:/Users/<you>/dev/Alfred/mcp/run.ts", "C:/Users/<you>/Documents/My Vault"]
    }
  }
}
```

## Capabilities

**Resources (read-only)** — addressable by path and by NIP-19 `naddr`:
`alfred://hot`, `alfred://note/{path}`, `alfred://naddr/{naddr}`.

**Tools** — `vault_search`, `vault_read`, `vault_append`, `vault_patch`,
`vault_write`, `frontmatter_get`, `frontmatter_set`, `memory_bank_read`,
`memory_bank_update`, `hot_read`, `spec_read`.

## HTTP (opt-in only)

stdio is the default and the only thing enabled by default. To expose Streamable
HTTP locally, set `ALFRED_MCP_HTTP=1` (optionally `ALFRED_MCP_HTTP_HOST` /
`ALFRED_MCP_HTTP_PORT`). When enabled it binds to **loopback** with
**DNS-rebinding protection on** (Host/Origin pinned to localhost). Do not expose
it to a network; remote MCP over HTTP is a stop-and-ask decision.
