# The External Mind: A Personal Knowledge Management Framework for Solo Builders and Non-Developers in the Age of Agentic Software Development

## TL;DR

- For a solo builder or non-developer using AI to build software, the highest-leverage skill in 2026 is **context engineering** — deliberately curating what an agent sees — and the practical implementation is a layered, mostly file-based "external mind": persistent context files (AGENTS.md/CLAUDE.md/.goosehints), spec-driven artifacts, and a self-hostable memory/retrieval layer (MCP memory servers + an open-source vector database), all stored as plain Markdown you own.
- The tooling has converged on open standards under neutral governance: **AGENTS.md, the Model Context Protocol (MCP), and Block's goose were all donated to the Linux Foundation's new Agentic AI Foundation (AAIF) on December 9, 2025**, which materially reduces vendor lock-in risk and makes an open-source, data-sovereign stack realistic rather than aspirational.
- The durable architecture is decidedly *not* a single magic tool. It is: (1) a "ground truth" specification layer, (2) persistent context files at the repo root, (3) an agent memory layer with human-readable storage, (4) retrieval over your own documents, and (5) local-first PKM (Obsidian/plain Markdown + Git) as the substrate — favoring tools that keep your data as files on disk rather than in a vendor's database.

---

## Key Findings

1. **"Context engineering" is the organizing concept, and it has a documented origin.** The term was popularized in June 2025 by Shopify CEO Tobi Lütke and former Tesla/OpenAI researcher Andrej Karpathy, and Anthropic formalized it in a September 29, 2025 engineering post. It reframes the work from writing one clever prompt to continuously curating the whole context window. Prompt engineering is now treated as a subset of context engineering.

2. **The file-convention layer has a clear winner emerging but a messy present.** AGENTS.md is the closest thing to a vendor-neutral baseline (60,000+ projects per OpenAI; donated to AAIF). Claude Code still uses CLAUDE.md; goose uses .goosehints. As of 2026 these coexist, and many builders use a symlink or short pointer file to keep one source of truth.

3. **Agent "memory" is mostly Markdown files, not magic.** Claude Code's memory is a four-layer, file-based system; goose splits static .goosehints from a dynamic Memory extension (an MCP server); the official MCP memory server stores a knowledge graph as a JSONL file. This is good news for data sovereignty — your "memory" is portable text you can read, edit, and version.

4. **Retrieval (RAG) is solvable with self-hostable, open-source components.** pgvector, Qdrant, Chroma, and Weaviate are all open-source and self-hostable; for a solo builder, pgvector (if already on Postgres) or local Chroma/Qdrant covers the realistic scale.

5. **Spec-driven development is the maturity step beyond "vibe coding."** GitHub's Spec Kit (MIT-licensed, open source) and Amazon's Kiro are the two anchors; Spec Kit's open, agent-agnostic workflow (Constitution → Specify → Plan → Tasks → Implement) is the better fit for an open-source, no-lock-in ethos.

6. **The classic PKM canon translates directly.** Tiago Forte's "Building a Second Brain" (CODE + PARA) and the older Zettelkasten method map cleanly onto AI-development context management; the core premise — "the brain is for having ideas, not storing them" — is exactly the argument for giving an agent an external, structured store of ground truth.

---

## Details

### 1. The problem: why AI development demands an external mind

The rationale the user provided is well-supported by primary and reputable secondary sources, with two important nuances.

**The pace of change is real, and context windows are the binding constraint.** Every agent session begins with a fresh, finite context window. Anthropic's own documentation ("Effective context engineering for AI agents") frames it precisely: "Context, therefore, must be treated as a finite resource with diminishing marginal returns. Like humans, who have limited working memory capacity, LLMs have an 'attention budget' that they draw on when parsing large volumes of context." The discipline is finding the smallest set of high-signal tokens that maximize the likelihood of your desired outcome. Crucially, more context is not better context: in "Context Rot: How Increasing Input Tokens Impacts LLM Performance" (Chroma Research, July 14, 2025, authored by Kelly Hong, Anton Troynikov, and Jeff Huber), an evaluation across 18 LLMs revealed nonuniform performance with increasing input length — performance degraded as input grew, well before the window filled, and models even performed better on shuffled "haystacks" than on logically structured ones. This is the technical substance behind the "AI information explosion": you cannot simply dump everything into the model; you must curate. The engineering question, as Anthropic puts it, becomes "What configuration of context is most likely to generate our model's desired behavior?"

**The "second brain" argument is grounded in an established PKM movement.** Tiago Forte's *Building a Second Brain* (2022, a Wall Street Journal bestseller translated into 25+ languages) is built on the premise — borrowed from David Allen's GTD — that "our brains are for having ideas, not storing them." Forte's CODE method (Capture, Organize, Distill, Express) and PARA system (Projects, Areas, Resources, Archives) are the canonical structures. The connection to AI development is direct: if humans should offload storage to a trusted external system and reserve cognition for connecting ideas, then in agentic development that external system must serve *two* readers — the human and the agent. This is the precise insight behind the AGENTS.md convention ("a README for machines").

**Honest caveat on the productivity claims.** The evidence base for spec/context files improving outcomes is early and partially contradictory — some controlled studies show efficiency gains, others show higher cost and weak or negative performance gains. The defensible position is to *measure within your own workflow* (is the file reducing search thrash, token usage, and failed runs?) rather than assuming benefit.

### 2. Foundational PKM concepts translated to AI development

| Classic PKM concept | Origin | Translation to agentic development |
|---|---|---|
| Second Brain / external storage | Forte (2022); Allen's GTD | Persistent context files + memory/retrieval as the agent's (and your) ground truth |
| CODE (Capture→Organize→Distill→Express) | Forte | Capture decisions/specs → organize into repo files → distill into a lean CLAUDE.md/AGENTS.md → express as working software |
| PARA (Projects/Areas/Resources/Archives) | Forte | Organize a vault/repo by actionability: active specs (Projects), ongoing standards (Areas), reference docs (Resources), completed work (Archives) |
| Zettelkasten / atomic notes | Niklas Luhmann | Atomic, linked Markdown notes; one idea per file; bidirectional links form a knowledge graph an agent can traverse |
| Progressive summarization | Forte | Compaction/summarization of agent context; distilling long sessions into durable memory entries |

The local-first PKM tool that best fits the ethos is **Obsidian**: notes are plain Markdown files on your own disk, with bidirectional `[[links]]` and an emergent graph view. Its caveat: Obsidian itself is free but *not* open source, though the `.md` file format is open and portable. For a fully open-source posture, **Logseq** (open-source outliner) and plain Git-tracked Markdown are the alternatives. The key property for AI work is that LLMs read Markdown natively, so a local Markdown vault doubles as a retrieval corpus (e.g., via the Smart Connections plugin for local embeddings, or by pointing a memory MCP server at the folder).

### 3. The memory/context engineering layer (the technical core)

#### Context engineering: origin and best practices

The terminological shift is well-documented. On June 19, 2025, Tobi Lütke wrote on X (verified verbatim at x.com/tobi/status/1935533422589399127): "I really like the term 'context engineering' over prompt engineering. It describes the core skill better: the art of providing all the context for the task to be plausibly solvable by the LLM." On June 25, 2025, Karpathy amplified it (x.com/karpathy/status/1937902205765607626): "context engineering is the delicate art and science of filling the context window with just the right information for the next step." Simon Willison predicted the term would stick. Anthropic's September 29, 2025 post ("Effective context engineering for AI agents") defined it as "the set of strategies for curating and maintaining the optimal set of tokens during LLM inference."

Anthropic's documented best practices, which a solo builder can apply directly:
- **Keep tool sets small** — keep your three-to-five most-used tools loaded; a useful test is that if a human engineer can't say which tool to use, the agent can't either.
- **Compaction vs. summarization** — compaction strips redundant info that exists elsewhere (reversible); summarization is lossy compression. Push exploration to subagents whose only return to the main context is a condensed summary.
- **Durable memory should be disciplined** — store only information that continues to constrain future reasoning (persistent preferences, decisions, failed approaches); over-storing creates "context pollution."

#### Persistent context files: the standards and their exact conventions

This is the layer a non-developer touches most, so exact filenames matter:

**AGENTS.md** — The emerging neutral standard. Proposed/championed by an OpenAI-led collaboration (with Google, Cursor, Factory, Sourcegraph) and formalized in August 2025; per OpenAI's December 9, 2025 AAIF announcement it has been "adopted by more than 60,000 open-source projects and agent frameworks including Amp, Codex, Cursor, Devin, Factory, Gemini CLI, GitHub Copilot, Jules and VS Code"; it was donated to the AAIF in December 2025. It is intentionally schema-free — plain Markdown at the repo root, a "README for machines" covering setup, tests, code style, and gotchas. GitHub Copilot added native support in August 2025.

**CLAUDE.md** — Claude Code's persistent instruction file, loaded at the start of every session and re-injected after compaction (project-root CLAUDE.md survives `/compact`). Scopes: project root, personal (`~/.claude/CLAUDE.md`), and enterprise/managed policy. Best practice from production teams is to keep it short — under 200 lines, with some teams (e.g., HumanLayer) keeping the root file near 60 lines, because every line is reloaded every session. Use `/init` to generate a starter file (then delete most of it), and `/memory` to view/edit memory files. The `#` inline-memory shortcut was discontinued; use `/memory` or conversational "remember that…" requests. Non-critical, path-specific rules go in `.claude/rules/*.md` with glob scoping so they load only when relevant files are touched.

**.goosehints** — goose's static context file, loaded in its entirety on every request (so keep it lean). Lives in the project root (and/or `~/.config/goose/`). goose explicitly distinguishes this user-authored static file from its dynamic Memory extension.

**Other conventions in the wild:** `.cursorrules` (Cursor), `GEMINI.md`, `.github/copilot-instructions.md`, and `SKILL.md` manifests. The 2025 AGENT.md (singular) proposal from Sourcegraph/Amp lost to AGENTS.md (plural).

**llms.txt** — A related but distinct standard: proposed by Jeremy Howard (Answer.AI) on September 3, 2024, it is a Markdown file at a website's root (`/llms.txt`) that gives LLMs a curated, link-based map of a site's most important content, plus an optional `/llms-full.txt` with the full corpus. Adopted by Anthropic, Stripe, Cursor, Cloudflare, Vercel, Mintlify, Supabase, and others; Mintlify auto-generates it for hosted docs. It is explicitly *not* an official standard and adoption is uneven (~10% of sites; SEO community is skeptical). For a builder, its practical use is to point your agent at clean docs for the frameworks you depend on.

**State of convergence (June 2026):** AGENTS.md is the de facto cross-tool baseline; tool-specific files (CLAUDE.md, .goosehints) persist for tool-specific features. The pragmatic pattern is a single canonical AGENTS.md with a short CLAUDE.md/.goosehints that points to it (often via symlink, since these are all plain Markdown).

#### Agent memory systems

**Claude Code** runs a layered, file-based memory architecture:
- *CLAUDE.md* (static, user-authored, always loaded).
- *Auto memory* (introduced/expanded in 2026; requires v2.1.59+): Claude writes its own notes across sessions to `~/.claude/projects/<project>/memory/`, with a `MEMORY.md` entrypoint (first 200 lines loaded at session start) and topic files loaded on demand. It is plain Markdown, on by default, toggleable via `/memory` or `autoMemoryEnabled`.
- *Subagent memory* (the `memory:` frontmatter field, introduced v2.1.33, February 2026): each named subagent gets a persistent directory (`~/.claude/agent-memory/<name>/` for user scope, `.claude/agent-memory/<name>/` for project) with its own `MEMORY.md`; Read/Write/Edit tools are auto-enabled so it curates its own notes. Caveat: each subagent's memory is siloed from other subagents.
- *The Memory tool* (API-level): a client-side `/memories` directory the model views/creates/edits, designed for long-horizon tasks where context may reset; the docs stress path-traversal validation as a security requirement.

**goose** provides two complementary mechanisms: the static `.goosehints` file and the **Memory extension** — "a dynamic storage system using the Model Context Protocol" that stores/retrieves tagged information on demand, living in `~/.goose/memory` (local) or `~/.config/goose/memory` (global). The practitioner guidance is to keep frequently-changing or large detail in the Memory extension (retrieved on demand) rather than bloating `.goosehints` (sent every request). goose is Apache-2.0 licensed, local-first, multi-provider (Anthropic, OpenAI, Google, Ollama for fully-local models, and more), and built around MCP extensions; it also supports **Recipes** (portable YAML workflows packaging prompts, extensions, parameters, and sub-recipes) and **sub-recipes/subagents** that run in isolation.

**MCP memory servers** (the retrieval/memory ecosystem): The official `@modelcontextprotocol/server-memory` (MIT-licensed) stores a knowledge graph of entities, relations, and observations in a JSONL file — fully local and human-readable, ~45,000 weekly npm downloads. Notable alternatives, with their tradeoffs: **Basic Memory** (stores memory as Markdown files you can read/edit directly; hybrid local search via FastEmbed — the best fit for the local-first ethos); **Chroma** and **Engram** (local); **mem0/OpenMemory** (semantic search, open-source, can be exposed as an MCP server); **Zep/Graphiti** (temporal knowledge graphs). Security note: OWASP published an "MCP Top 10" in 2026 identifying *memory poisoning* (injecting malicious instructions into long-term storage) as a key threat, and specific servers have disclosed CVEs — so memory is an attack surface to treat with care.

#### The Model Context Protocol (MCP) itself

MCP is the open standard (introduced by Anthropic, November 2024) that lets agents connect to tools and data — described as "USB-C for AI." Architecture: a client-server model over JSON-RPC, with three server-side primitives (Tools, Resources, Prompts) and transports for local (stdio) and remote (Streamable HTTP, which replaced SSE in the 2025-03-26 spec) use. As of June 2026, the **stable spec is 2025-11-25** (the prior stable was 2025-06-18, which added structured tool output, OAuth-based authorization with Resource Indicators per RFC 8707, elicitation for server-initiated user input, and resource links; it removed JSON-RPC batching). The 2025-11-25 release added an official server registry, OpenID Connect discovery, and tool-calling in sampling, and introduced a formal governance model (the SEP — Specification Enhancement Proposal — process). Per the Linux Foundation AAIF press release (December 9, 2025), there are "more than 10,000 published MCP servers now covering everything from developer tools to Fortune 500 deployments," and MCP's maintainers report 97M+ monthly SDK downloads. MCP was donated to the AAIF on December 9, 2025; its maintainers retain technical autonomy.

#### Spec-driven development (specs as ground truth)

Spec-driven development (SDD) makes a specification the central, continuously-referenced artifact rather than after-the-fact documentation — directly substantiating the user's "architectural blueprint / big-picture anchor" point.

- **GitHub Spec Kit** (open source, MIT, Python CLI; ~111,000 GitHub stars and 9.8k forks as of June 11, 2026, up from ~71k in February, per the github/spec-kit releases page and Ry Walker Research; latest release v0.10.4 on June 16, 2026): workflow is **Constitution → Specify → Plan → Tasks → Implement**, each phase producing a Markdown artifact that feeds the next. It supports 30+ agents (Claude Code, Copilot, Gemini CLI, Cursor, etc.) with "no lock-in," installed via `uvx --from git+https://github.com/github/spec-kit.git specify init`. The "constitution" is a Markdown rules file of immutable project principles. This is the recommended SDD anchor for the open-source ethos.
- **Amazon Kiro** (AI IDE built on Code OSS; also has a CLI and web): workflow is **spec → design → tasks → implementation** using EARS-notation acceptance criteria and (in 2026) SMT-solver-based requirements analysis. Steering files default to `product.md`, `structure.md`, `tech.md` in `.kiro/steering/`; supports AGENTS.md, MCP, and hooks. It is a commercial AWS product (credit-based pricing), so it fits the ethos less well than Spec Kit, though it does not require an AWS account.
- **Lighter alternatives:** OpenSpec (proposal-first), BMAD-METHOD, and GSD ("get-shit-done," `npx get-shit-done-cc@latest`). Martin Fowler's hands-on assessment is a useful counterweight: for small tasks these tools can be "a sledgehammer to crack a nut," generating verbose Markdown that is tedious to review — so apply SDD proportionally to task size.

### 4. Tool-specific deep dives (2026 conventions)

**goose (Block) — the most ethos-aligned primary agent.** Open source (Apache-2.0), local-first, runs as desktop app or CLI (`goose` binary; `goosed` server). Multi-provider including local models via Ollama/RamaLama, so you can run fully offline. Context architecture: `.goosehints` (static) + Memory extension (dynamic, MCP-based) + Recipes (portable YAML) + sub-recipes (isolated subagents, parallelizable). 70+ MCP extensions. Now governed by the AAIF. Official sources: github.com/block/goose and block.github.io/goose (docs also at goose-docs.ai).

**Claude Code (Anthropic) — the most capable agentic CLI, with the richest memory model.** Not open source, and it depends on Anthropic's models (a lock-in consideration for the ethos), but it is the reference implementation for layered memory and context engineering. Key surface: CLAUDE.md + auto memory + subagent memory (above); `/init`, `/memory`, `/compact`, `/clear`, `/rewind` commands; **subagents** (Markdown files in `.claude/agents/` with YAML frontmatter; isolated context; only the final summary returns to the orchestrator); **skills** (folders with `SKILL.md`; unified with slash commands in 2026; auto- or manually invoked; can run in a subagent via `context: fork`); **hooks** (deterministic scripts on lifecycle/tool events — PreToolUse, PostToolUse, Stop, SubagentStop — used to block dangerous commands, run tests, inject context); **MCP** integration via scoped `.mcp.json`; and **plugins** (versioned bundles of skills/subagents/commands/hooks/MCP defs). The 1M-token context window for Opus is in beta. Official docs: docs.claude.com / code.claude.com/docs.

**MCP servers — the connective tissue.** For a solo builder the highest-value servers are: a memory server (Basic Memory for the local-Markdown ethos, or the official knowledge-graph server), a filesystem server, and servers for whatever external systems you use (GitHub, a database). Give each server the narrowest credential possible (read-only tokens), track your MCP config like dotfiles, and watch early sessions for servers returning more than expected.

**Open-source retrieval stack.** For RAG over your own docs: embed with an open model (e.g., a 384–1,536-dim model like BGE-small or text-embedding-3-small), store in **pgvector** (if you already run Postgres; good to ~10M vectors), **Chroma** (simplest local prototype), or **Qdrant** (Apache-2.0, Rust, best self-hosted price/performance; self-hostable on a ~$60–130/month VPS for 10M+ vectors). Weaviate and Milvus are heavier options for larger scale. All are open source and self-hostable.

### 5. A practical, layered blueprint a non-developer can implement

This is an opinionated, data-sovereign default stack. Each layer is plain text you own.

**Layer 0 — Substrate: local Markdown + Git.** Keep everything (specs, notes, context files, memory) as Markdown in a Git repository you control. This is your single source of truth and your backup. Optionally open the same folder as an Obsidian (or Logseq) vault for linking and graph view.

**Layer 1 — Ground truth / specs.** Use GitHub Spec Kit to create a `constitution` (immutable principles) and per-feature specs (Specify → Plan → Tasks). For small changes, skip the ceremony and write a short spec by hand. These artifacts are the "architectural blueprint" that anchors the agent when the codebase moves fast.

**Layer 2 — Persistent context files.** Maintain one canonical **AGENTS.md** at the repo root (setup, test commands, architecture map, hard rules, scope boundaries — keep it lean). If you use Claude Code, add a short **CLAUDE.md** (or symlink it to AGENTS.md); if you use goose, add a lean **.goosehints**. Add an `llms.txt`-style pointer to clean docs for your key frameworks.

**Layer 3 — Agent memory.** Let your agent accumulate learnings: Claude Code auto memory and subagent memory, or goose's Memory extension, or a **Basic Memory** MCP server (Markdown-backed) shared across tools. Keep memory disciplined — decisions, preferences, failed approaches only.

**Layer 4 — Retrieval over your own knowledge.** When your project documentation outgrows what fits in context, stand up a local **Chroma** or **Qdrant** instance (or pgvector), embed your Markdown vault and docs, and expose it via an MCP retrieval server so the agent can pull only the relevant passages.

**Layer 5 — Workflow packaging.** Capture repeated workflows as goose **Recipes** (YAML) or Claude Code **skills**, and enforce safety with **hooks** (e.g., run tests before "done," block destructive commands). Use subagents to keep exploration out of the main context.

**Primary agent recommendation:** Start with **goose** if open-source/self-hostable/freedom-respecting is your top priority (Apache-2.0, local models, AAIF-governed). Use **Claude Code** when you need its superior agentic capability and richer memory model, accepting the model-vendor dependency. Both speak MCP and read AGENTS.md, so your external mind is portable between them.

### 6. Governance, ownership, and sustainability

**The standards are now under neutral governance, which is the single biggest de-risking event for this stack.** On December 9, 2025, the Linux Foundation announced the **Agentic AI Foundation (AAIF)**, with MCP (Anthropic), goose (Block), and AGENTS.md (OpenAI) as founding projects. Platinum members include AWS, Anthropic, Block, Bloomberg, Cloudflare, Google, Microsoft, and OpenAI. The stated aim is to keep these projects "open, neutral, and community-driven" and avoid single-vendor lock-in; projects retain technical autonomy while the foundation provides neutral stewardship (the model the Linux Foundation used for Kubernetes and PyTorch). For a builder who cares about not being captured by Big Tech, anchoring on AAIF projects (and open-source files/formats) is the defensible choice — your context files and Markdown memory remain yours regardless of any single vendor's roadmap.

**Data sovereignty in practice.** The whole point of the file-based approach is that your "external mind" is plain Markdown/JSONL on disk, version-controlled in Git, not locked in a proprietary database. This is the achievable form of sovereignty for an individual: data residency and portability you fully control, with a clear "Plan B" if any tool disappears. Note the realistic limits — full sovereignty over the *models* is harder (running local models via Ollama/RamaLama is possible but capability-constrained), so a pragmatic stance is sovereignty over your *data and context* while renting model intelligence as needed.

**Decentralized infrastructure (Nostr, AT Protocol).** For builders who want to extend sovereignty to publishing/identity, **Nostr** (signed events over relays, user-owned cryptographic keys; you can run your own relay) and the **AT Protocol** (portable identity and data) are the leading open, decentralized options. The honest caveat from within those communities: genuine self-sovereignty on Nostr today still requires running your own relay, and most users default to a handful of relays — so "decentralized" is a spectrum, not a guarantee.

**Commons governance framing.** The intellectual case for community-governed digital infrastructure draws on Elinor Ostrom's work on governing shared common-pool resources and Philip Pettit's republican conception of freedom as non-domination — i.e., that avoiding domination by extractive platforms, not merely non-interference, is the goal. The AAIF's neutral-governance model is a concrete, if imperfect, instantiation of commons-style stewardship for the tooling layer.

---

## Recommendations

**Stage 1 — Set up the substrate (day one).** Create a Git repo. Add a lean **AGENTS.md** at the root (setup, test commands, architecture map, hard rules, scope boundaries). Pick one primary agent: **goose** for the open-source/self-hostable default, or **Claude Code** for maximum capability. Open the repo as an Obsidian/Logseq vault if you want linking and graph view. *Threshold to advance:* you are repeating the same explanations to the agent across sessions.

**Stage 2 — Add memory and specs.** Turn on your agent's memory (Claude Code auto memory / goose Memory extension) and keep it disciplined. Adopt **GitHub Spec Kit** for any non-trivial feature (Constitution + Specify/Plan/Tasks). *Threshold to advance:* your project docs no longer fit comfortably in the context window, or you are losing track of decisions across sessions.

**Stage 3 — Add retrieval.** Stand up a local **Chroma**/**Qdrant** (or **pgvector**) instance, embed your Markdown vault and key docs, and expose it via an MCP memory/retrieval server (Basic Memory if you want Markdown-backed storage). *Threshold to advance:* you have repeatable workflows worth packaging, or safety incidents (e.g., the agent running something destructive).

**Stage 4 — Package and harden.** Capture repeated workflows as goose Recipes or Claude Code skills; add hooks to run tests before completion and block dangerous commands; use subagents to isolate exploration. Apply least-privilege credentials to every MCP server and treat memory as an attack surface (guard against memory poisoning).

**Cross-cutting rules:** Keep every context file short — under 200 lines for CLAUDE.md, leaner for `.goosehints`. Measure whether the files actually reduce token use, search thrash, and failed runs in *your* workflow rather than assuming benefit. Prefer AGENTS.md as your one canonical file and point tool-specific files at it. Keep everything in Git so your external mind is always portable.

**What would change these recommendations:** If you need offline/air-gapped operation, weight goose + local Ollama models more heavily and avoid model-vendor-dependent tools. If you scale past ~10M vectors or need multi-tenancy, migrate from pgvector/Chroma to Qdrant/Weaviate/Milvus. If a future MCP spec or AGENTS.md revision changes conventions, re-check the AAIF projects' docs (they retain technical autonomy and iterate via the SEP process).

---

## Caveats

- **The wecanjustbuildthings.dev platform could not be independently verified.** Neither my searches nor a dedicated follow-up could retrieve or confirm the site's public content, vendor permit/exclude list (the reported exclusion of Meta/OpenAI/xAI and permission of Google), or its references to Ostrom/Pettit/Nostr/AT Protocol. I have therefore treated the ethos as a *design brief supplied by the user* and aligned the framework to it, rather than citing the platform as a source. The ethos itself (open-source, self-hostable, data-sovereign, anti-lock-in) is independently coherent and well-supported by the tooling landscape.
- **Version and feature details move fast.** Claude Code memory features (auto memory v2.1.59+, subagent memory v2.1.33) and version numbers come from a mix of official docs and reputable secondary write-ups; treat exact version numbers as point-in-time and verify against current docs before relying on them. Spec Kit's star count and release version in particular change weekly.
- **The productivity benefit of context/spec files is not settled.** Empirical evidence is early and mixed; some studies show gains, others show added cost with weak or negative effects. Measure in your own workflow.
- **Memory is a security surface.** OWASP's 2026 "MCP Top 10" flags memory poisoning; specific memory servers have disclosed CVEs. Use least-privilege credentials and review what gets written to memory.
- **"Decentralized" and "sovereign" are spectrums, not absolutes.** Nostr self-sovereignty in practice often still depends on running your own relay; full sovereignty over models (vs. data) remains hard for individuals.
- **Some adoption figures are vendor-reported.** AGENTS.md "60,000+ projects" (OpenAI) and MCP "10,000+ servers / 97M downloads" (Linux Foundation / MCP maintainers) are vendor/foundation telemetry, not independently audited.