<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors -->

# MCP SEP-414 Trace-Context Re-verification — 2026-09-07

Packet P5. Alfred adopted W3C Trace Context propagation pre-release for
forward-compat with MCP SEP-414. The MCP 2026-07-28 spec release mandated a
re-verify pass; this document is that pass. All disposition claims below are
taken from primary sources only (modelcontextprotocol.io spec pages and
github.com/modelcontextprotocol), fetched live on 2026-09-07.

## Alfred's adopted keys (EXECUTED — read from source on 2026-09-07)

Alfred injects/extracts exactly three reserved `_meta` keys:
`traceparent`, `tracestate`, `baggage`.

| Location | Content |
|---|---|
| `mcp/server.ts:34` | `export const TRACE_CONTEXT_KEYS = ['traceparent', 'tracestate', 'baggage'] as const;` |
| `mcp/server.ts:42,50` | server consumes/propagates `TRACE_CONTEXT_KEYS[0]` (`traceparent`) |
| `src/lib/telemetry/trace.ts:22` | `export const TRACE_CONTEXT_KEYS = ['traceparent', 'tracestate', 'baggage'] as const;` |
| `src/lib/telemetry/trace.ts:102-104` | `TraceMeta { traceparent: string; tracestate?: string; baggage?: string }` |
| `src/lib/telemetry/trace.ts:8` | header comment: keys carried in MCP/ACP `_meta` as "SEP-414's exception to the `_meta` key-prefix rule" |

Supporting behavior in `src/lib/telemetry/trace.ts`: `traceparent` values are
parsed/validated against the W3C `00-<32hex>-<16hex>-<2hex>` shape with
all-zero id rejection (lines 57-65); `baggage` is a born-redacted allowlist
(correlation-only fields, W3C Baggage wire format, lines 68-96); injection is
opt-in inert — no trace context, no `_meta` keys (lines 121-145).

## Released spec version (VERIFIED-LIVE — fetched 2026-09-07)

- `https://modelcontextprotocol.io/specification/latest` returns
  `HTTP 307 → /specification/2026-07-28` (HTTP 200).
- Latest released MCP spec version today: **2026-07-28**.
- URL: https://modelcontextprotocol.io/specification/2026-07-28
  (trace-context section: https://modelcontextprotocol.io/specification/2026-07-28/basic)

## SEP-414 disposition (VERIFIED-LIVE — fetched 2026-09-07)

SEP-414 is **accepted and merged (state: Final)**.

- GitHub API for `modelcontextprotocol/modelcontextprotocol` issue/PR #414:
  - title: `SEP-414: Document OpenTelemetry Trace Context Propagation Conventions`
  - state: `closed`, labels: `SEP, final`
  - PR: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/414
  - merged/closed at: 2026-02-26T12:06:26Z

The merged content is present in the released 2026-07-28 spec. The Basic spec
page's `_meta` section lists `traceparent`, `tracestate`, `baggage` as reserved
keys for "OpenTelemetry trace context propagation" and states, verbatim:

> "As an exception to the prefix requirement above, the keys `traceparent`,
> `tracestate`, and `baggage` are reserved for OpenTelemetry trace context
> propagation. When present, their values MUST follow W3C Trace Context and
> W3C Baggage formats respectively. This exception exists to maintain
> compatibility with existing implementations and OpenTelemetry semantic
> conventions for MCP."

The page also carries a non-normative example of `_meta` containing
`"traceparent": "00-0af7651916cd43dd8448eb211c80319c-00f067aa0ba902b7-01"`.

## Per-key verdict

| `_meta` key | Released 2026-07-28 spec mandates | Alfred uses | Verdict |
|---|---|---|---|
| `traceparent` | Reserved key; value MUST follow W3C Trace Context | `traceparent` (`mcp/server.ts:34`, `trace.ts:22,102`) | **MATCH** |
| `tracestate` | Reserved key; value MUST follow W3C Trace Context | `tracestate` (`mcp/server.ts:34`, `trace.ts:22,103`) | **MATCH** |
| `baggage` | Reserved key; value MUST follow W3C Baggage | `baggage` (`mcp/server.ts:34`, `trace.ts:22,104`) | **MATCH** |

No key has a NO-SPEC-SECTION verdict: the released spec has a dedicated
"OpenTelemetry trace context" subsection under the `_meta` documentation.

Format conformance cross-check (from the source reads above, EXECUTED):
Alfred's `traceparent` validation enforces the W3C header shape; Alfred's
`baggage` is emitted in W3C Baggage list-member format. Both are consistent
with the spec's "MUST follow W3C Trace Context and W3C Baggage formats
respectively" requirement.

## Required actions

**None.** No renames are required: all three adopted `_meta` key names match
the released 2026-07-28 spec exactly. The pre-release adoption was
forward-compatible as intended, and the header comments in
`src/lib/telemetry/trace.ts` (which cite SEP-414 and describe the key-prefix
exception) remain accurate against the released spec text.

Optional follow-up (not a correction): none of the spec text requires changes
to Alfred's opt-in behavior; the spec reserves the keys "when present" and
does not mandate propagation, so Alfred's tracing-off path (no `_meta` keys
injected) is conformant.

## Labels used

- **VERIFIED-LIVE**: fetched from the primary source on 2026-09-07
  (spec version/redirect, spec quote, SEP-414 PR state via GitHub API).
- **EXECUTED**: Alfred source fragments read directly from the working tree
  on 2026-09-07.
- **UNVERIFIED**: not used — every disposition claim above was confirmable
  from primary sources.
