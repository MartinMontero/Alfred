# Claude Code Prompt — Integrating the Epistemic Map into the Non-Dev Builder OS

**Target:** Claude Code Desktop (Opus 4.8), repo access to all three projects
**Author of record:** Martin Montero / AOS
**Companion source:** `Wisdom, Intuition, Knowledge, and Judgment: A Multidisciplinary Map for Prompt Design` (v3.0 — third QA pass; mechanics-integrated) — referred to below as **the Map**
**Working protocol:** Plan-first. Rule 9 throughout (announce + explicit go-ahead before any commit, push, destructive action, or outward action). Step-0 re-verification before touching any volatile/live-spec surface. Read-only until the plan is endorsed.

**v1.1 (2026-07-13) — concordance patch.** Section references retargeted to the shipped Map (v3 — “third QA pass; mechanics-integrated”, sha256 5da35695…): old §7 fork → §6 Gaps item 1 + the §2.5 note; old §8 → §6; old §9 Stage 5 → §7 Stage 5; old §10 subsections → §8. Zero content changes otherwise. Note: the word “fork” does not appear in the shipped Map — its framing is “a substantive position, not a universal.”

---

## 0. Paste-ready brief for Claude Code

> You are working across three repos that together form the **Non-Dev Builder OS** (the "Triad"):
>
> - **WCJBT** — `wecanjustbuildthings.dev` (Astro 6 + Starlight + Cloudflare Workers; catalog + policy + intent flow). The Architect. Owns *what to build* and *what is admissible*.
> - **Holmes** — the research/evidence/reasoning agent (goose/ACP/MCP; six-phase case method + Structured Analytic Techniques). The Detective. Owns *what is true / best-supported*.
> - **Alfred** — the sovereign local-first Nostr-native PKM + build agent (Tauri 2 + SolidJS; goose via ACP; MCP server with path-confined tools). The Builder. Owns *how it's implemented*.
>
> You are integrating a completed multidisciplinary epistemology document (**the Map**) into these three projects. **This is not a documentation drop.** The Map is a *design critique* that exposes one specific structural gap in the Triad, and your job is to instrument the fix across all three repos. The rest of this prompt tells you exactly what the gap is, why it matters, and what to build.
>
> **Before writing anything:** read the three project constitutions / standing-context files, locate where each project currently defines its cognitive role and boundaries, and produce a plan. Do not commit. Rule 9 is in force.

---

## 1. The thesis you are implementing

A podcast listener raised the question that motivates this entire work item. Paraphrased:

> *"AI tools are fracturing into hyper-disciplined experts that cite evidence, use structured analytic techniques, and refuse to guess. In that world, what happens to human intuition? If every decision is scrutinized by a multi-agent court of evidence, does the human stop being a* creator *and become only a* judge *running a pre-flight checklist? Building things that matter is a murky, intuitive process. Maybe the real superpower is using AI to ruthlessly verify the truth of what you want to build before you lay the first brick."*

**The Map resolves this — and the resolution is the spec.** The worry rests on a category error that the Map's central distinction dissolves. Read these four claims as the conceptual foundation for everything below:

1. **Intuition and judgment are different faculties from different families.** The Map establishes two families along an explicit/tacit axis: *knowledge + analytic judgment* (explicit, propositional, rule-based, verifiable) versus *wisdom + intuition* (tacit, holistic, experience-based, generative). The listener's fear collapses *intuition* (the generative leap) into *judgment* (the verification faculty) and concludes that strengthening one must replace the other. The Map shows they are **interdependent, not substitutes** (Map §Executive Summary; §1; §8 "On the four-way separation").

2. **The Triad as currently built is a magnificent *knowledge-and-judgment engine* — and nothing else.** Holmes = knowledge + evidence (the Detective verifies what is true). WCJBT = analytic judgment encoded as a deterministic policy gate (the Architect decides what is admissible). Alfred = execution under guardrails. Every one of these lives on the **explicit/propositional** side of the Map's axis. **No component of the Triad owns intuition or wisdom.** That is the gap.

3. **A system that maximizes the judgment axis while leaving the intuition axis unsupported does not promote the human to judge — it strands them.** Because the generative, experience-driven, pre-verbal move that *originates* what is worth building has no home in the architecture, the human is left to supply it with zero scaffolding, and then watch it get scrutinized. The fix is not to weaken Holmes. It is to **give intuition a first-class seat** so that the verification engine has something worthy to verify.

4. **The correct frame is augmentation, not adjudication** — and it is already on your own epistemic timeline. Engelbart (1962), "augmenting human intellect," sits on slide 4 of the builder-OS deck between Bacon's "knowledge is power" and "the Triad, today." The human stays the **creator**. The Triad is the augmentation that lets a builder's intuition *survive contact with reality* — exactly the deck's stated purpose ("ensuring a builder's intent survives contact with reality through facts, surfaced assumptions, and weighed alternatives"). The listener's "judge running a checklist" is what the Triad becomes *if you forget to build the intuition seat*. This work item builds it.

**One-line statement of intent for the whole change:** *The Triad must augment the builder's intuition, not replace it with judgment — and that requires three concrete additions the Map specifies and the current architecture lacks.*

---

## 2. The three upgrades (what to build)

Each upgrade is grounded in a specific section of the Map, mapped to a specific project, with a concrete artifact and a definition of done.

### Upgrade A — Name the missing axis and build the Intuition Intake (WCJBT)

**Map grounding:** §2.2 (Kahneman–Klein détente — the boundary conditions under which intuition is reliable), §2.3 (Klein's RPD — expert intuition as recognition), §6 (the user's own definition centers experience + intuition), §1.4 (Bergson — intuition as a cultivated method, not a hunch).

**The problem in the current architecture:** WCJBT's intake runs raw builder input straight into Socratic Intent Engineering, which immediately begins *structuring* and *interrogating* it. The muddy, generative, intuitive leap — the thing the listener rightly says drives innovation — is treated as noise to be refined away, when the Map says it is the **generative source** that the rest of the pipeline exists to serve.

**What to build:** An **Intuition Intake** stage that sits *before* Socratic Intent Engineering in the PIE flow. It does three things:

1. **Captures the leap before hardening it.** A deliberately unstructured first step that lets the builder express the pre-verbal "I want to build X and I think it matters because…" *without* immediate interrogation. This is the "playing in the mud" the listener defends — preserved on purpose, then carried forward (not discarded) into Socratic engineering. Per the Map's §6 strengths analysis, experience is the *transforming lens*; the intake must capture the builder's experiential conviction, not just their feature list.

2. **Classifies the validity of the domain — the Kahneman–Klein gate.** This is the single most important mechanism in the whole change. The Map (§2.2) establishes that intuition is *conditionally* reliable: trustworthy in **high-validity environments with rapid, unequivocal feedback**, systematically misleading outside them. So the intake must ask a small set of deterministic questions that classify whether the builder's gut is operating in a domain where it deserves trust:
   - Has the builder done this kind of thing before, many times, with fast feedback? (→ high-validity → *trust the intuition, verify lightly*)
   - Is this a domain of slow, noisy, or absent feedback — long-horizon bets, markets, one-off decisions? (→ low-validity → *Holmes verification is mandatory before the brick is laid*)
   - This classification sets a **`intuition_validity` field** on the emerging intent brief that travels with it through the whole pipeline and tells Holmes how hard to scrutinize.

3. **Refuses the illusion of validity.** The Map (§2.2) names Kahneman's finding that *subjective confidence is not a valid cue to accuracy*. The intake must record the builder's confidence **separately** from the domain-validity classification, and must never let high stated confidence downgrade the verification requirement. Confidence is logged, not trusted.

**Key behavioral rule (this is the resolution of the listener's fear, encoded):** The Intuition Intake exists so the builder remains the **creator**. WCJBT does **not** generate the intent. It receives the human's intuitive leap, classifies how much that leap can be trusted on its own, and routes accordingly. High-validity intuition is *honored and lightly checked*; low-validity intuition is *honored and rigorously verified*. Either way the leap is the human's, and either way it is augmented, never pre-empted.

**Definition of done (Upgrade A):**
- A documented Intuition Intake stage in the PIE flow, upstream of Socratic Intent Engineering, with the three functions above.
- An `intuition_validity` classification field on the intent brief, set deterministically (no inference — consistent with WCJBT's established model-free Path A; do not quietly add an API call to interpret the builder's input).
- A separate `stated_confidence` field that is recorded but explicitly firewalled from the verification-routing logic, with a code comment citing the illusion-of-validity rationale.
- A short canon doc — `docs/intuition-intake.md` — explaining the stage, citing the Map sections, and stating the creator-not-judge principle in plain language.

### Upgrade B — The metacognitive-humility layer (Holmes)

**Map grounding:** §2.5 (every flagship wisdom model — Berlin's "management of uncertainty," Grossmann's intellectual humility — treats *awareness of the limits of one's knowledge* as constitutive of wisdom), §2.2 (the illusion of validity applies to verification too), and §8 "On wisdom measurement" (measurement is scale-dependent and weakly convergent — verification has known soft spots).

**The problem in the current architecture:** Holmes has confidence scores (0 to 1) and cited provenance. That is necessary but, by the Map's standard, incomplete. Confidence-on-a-finding answers "how sure am I of this answer?" It does **not** answer the deeper metacognitive question every wisdom framework requires: *"Is this even a domain where confident verification is possible, or am I about to manufacture false certainty?"* A Holmes that returns a crisp 0.9 confidence inside a fundamentally low-validity domain is committing the illusion of validity *in the name of rigor* — which is precisely the failure mode the listener intuitively fears about disciplined AI.

**What to build:** A **metacognitive-humility layer** on Holmes's output, distinct from the existing confidence score. Concretely:

1. **A `knowability` assessment** separate from `confidence`. Before Holmes returns a confidence-marked finding, it must classify the *domain*: is this a high-validity question (stable regularities, good data, the kind of question that *can* be resolved) or a low-validity one (irreducible uncertainty, contested evidence, prediction under noise)? This mirrors, on the verification side, the `intuition_validity` gate built into WCJBT in Upgrade A — the two must use a shared vocabulary so a brief's domain classification flows coherently from intent through verification.

2. **An explicit "limits of this finding" field** in every Evidence Pack. Not hedging — a structured statement of what would change the conclusion, what could not be checked, and where the evidence runs out. The Map (§7, Stage 5) calls for building in the failure modes; this operationalizes it for Holmes.

3. **A guard against false precision in low-knowability domains.** When `knowability` is low, Holmes must be *prevented* from emitting a high confidence score without an accompanying, prominent uncertainty statement — the structural analogue of the WCJBT confidence firewall. A 0.9 in a low-validity domain should be impossible to express without the caveat attached.

**Definition of done (Upgrade B):**
- A `knowability` field on Holmes Evidence Packs, classified before confidence is assigned, sharing vocabulary with WCJBT's `intuition_validity`.
- A structured "limits of this finding" component in the Evidence Pack schema.
- A validation rule that couples low `knowability` to a mandatory uncertainty statement (cannot emit high confidence in a low-validity domain bare).
- Holmes's spec/canon updated to cite the Map's intellectual-humility grounding (§2.5) and the illusion-of-validity rationale (§2.2). This *extends* Holmes's existing confidence/provenance model; it does not replace it, and it must not weaken the existing Structured Analytic Techniques.

### Upgrade C — Preserve the generative loop; resolve the creator/judge binary in the architecture (cross-cutting, all three repos)

**Map grounding:** §8 "On the four-way separation" (the four faculties are interdependent and interpenetrating, not a partition — Boyd, Grossmann 2025, Mega/Gigerenzer/Volz all argue analysis and intuition are *intertwined*), §3.5 (Graybiel — knowledge becomes intuition via chunking, so verified findings *feed* future intuition), the deck's own "Synthesis: Continuous Learning Cycle" (slide 18) and "Symbiotic Feedback Loops" (slide 13).

**The problem in the current architecture:** The Triad's feedback loops (deck slide 13: Loops A–D) currently move *intent → evidence → build → catalog learning*. Every arrow lives on the explicit/judgment side. There is no loop that closes back to **intuition** — no mechanism by which verified knowledge *sharpens the builder's future gut*, which the Map (§3.5, Graybiel's chunking) says is exactly how expertise forms: explicit knowledge, repeated with feedback, becomes fast intuitive recognition. Without this loop the human's intuition never compounds; the system gets smarter while the builder stays static, which is the deeper version of the listener's fear.

**What to build:** A **fifth loop** and the framing that resolves the binary.

1. **Loop E — "evidence sharpens intuition."** When Holmes resolves a question in a builder's domain, and when WCJBT's catalog gains a verified, provenance-bearing label, that learning must be surfaced back to the builder *as intuition-training*, not just as a catalog fact. Concretely: a lightweight mechanism (a note type in Alfred's Project Memory, or a digest surfaced at the next Intuition Intake) that tells the builder "here is what turned out to be true in the kind of decision you're about to make again" — so their next intuitive leap in that domain is better-calibrated. This is the Kahneman–Klein loop run deliberately: the system manufactures the *rapid, unequivocal feedback* that turns gut into expertise.

2. **A single canon document that states the resolution** — `docs/creator-not-judge.md`, shared across all three repos (or in WCJBT with references from Holmes and Alfred). It must say, in plain builder-facing language:
   - The human is the **creator**. The intuitive leap is theirs and originates the work. (Map §6; Engelbart frame.)
   - The Triad is **augmentation**, not a court. Holmes's scrutiny exists to let the builder's intuition *survive contact with reality* — the deck's own stated purpose — not to replace the leap with a checklist.
   - Intuition and verification are **interdependent** (Map §8): the leap gives the verification engine something worth verifying; the verification gives the next leap better ground to stand on. Neither is sovereign.
   - The "judge running a pre-flight checklist" is a **failure mode to design against**, not the destination. It happens precisely when the intuition seat (Upgrade A) and the compounding loop (this upgrade) are missing.

**Definition of done (Upgrade C):**
- Loop E documented in the Triad's feedback-loop canon (extend the deck's slide-13 model), with a concrete surfacing mechanism specified in Alfred's Project Memory or the WCJBT intake.
- `docs/creator-not-judge.md` written and cross-referenced from all three projects' top-level docs.
- The existing Loops A–D left intact; this is additive.

---

## 3. The moral-grounding fork (Map §6, Gaps item 1; §2.5 note) — wire it to the vendor policy

**Map grounding:** §6 Gaps item 1 + the §2.5 note (the moral-grounding question — is wisdom necessarily oriented toward a good, or is there a morally-neutral "strategic prudence" / Aristotle's *deinotēs*?).

This is a smaller but important integration. The Map establishes a genuine fork (§6, Gaps item 1; §2.5 note): "wisdom" can be defined as *morally grounded* (oriented toward a shared good) or as morally-neutral *strategic prudence* (effective means to any end). The Map's recommendation is to **surface the fork, not resolve it by fiat**.

**Your OS has already taken a side — and should say so.** The vendor-exclusion denylist (Meta/OpenAI/xAI excluded across the dependency and model tree) and the Trust & Safety posture (NIP-32 labeling, CSAM escalation) are **moral-grounding commitments encoded as deterministic gates**. The Non-Dev Builder OS is not a neutral strategic-prudence engine; it is a *morally grounded* one, and the denylist is the proof. This is the strongest existing evidence that the OS sits on the moral-grounding side of the Map's fork.

**What to build:** A short addition to WCJBT's policy/constitution canon that *names* this explicitly — that the exclusion engine and T&S posture are the OS's answer to the Map's moral-grounding question, distinguishing this OS from a value-neutral "build anything effectively" tool. This makes a previously implicit philosophical commitment legible, and gives the denylist a principled grounding beyond preference. Cite Map §6 (Gaps item 1) and the §2.5 note.

**Definition of done (moral-grounding fork):** A documented statement in WCJBT's policy canon connecting the denylist + T&S posture to the moral-grounding side of the Map's fork, framed as a deliberate, principled choice.

---

## 4. Hard constraints (non-negotiable — these define WCJBT/AOS/Alfred values)

These are carried from the established project constitutions and must hold throughout:

- **Rule 9.** No commit, push, destructive action, or outward action without explicit human go-ahead. Proactivity may only *draft and surface*. Announce before any environment change.
- **Vendor exclusion (denylist, NOT allowlist).** Exclude only Meta, OpenAI, xAI across the dependency/model tree. Google explicitly permitted. Open-weight models on permitted infrastructure explicitly allowed (Qwen3, Mistral/Magistral, DeepSeek-class, Gemma). Do not re-derive this as an allowlist — it was built wrong once as an allowlist and corrected; the principle is settled and encoded as a regression guard.
- **Model-free where it is already model-free.** WCJBT's Path A intake is deterministic. The Intuition Intake (Upgrade A) and its validity classification must use deterministic logic (keyword/heuristic/structured templates), **not** a quiet API call to interpret builder input. Open-ended interpretation stays deferred to the builder's own downstream agent. Do not add inference to make the intake "smarter."
- **Local-first / sovereign by default.** No community/user query forced through a corporate server. Two-tier model strategy (frontier cloud, denylist-compliant; sovereign local open-weight non-Meta).
- **Open standards.** MCP for tools, ACP for agent interop, Nostr-native where relevant (NIP-07/NIP-46 auth, NIP-32 labeling), AT Protocol awareness.
- **Supply-chain hygiene.** Syft SBOMs, OSV-Scanner, Grype acceptable; Trivy excluded (March 2026 compromise). Pin, provenance, security-gate CI.
- **AGPL-3.0-or-later**, upstream attribution preserved. No React (Meta). No Soapbox.
- **Zero fabrication.** Primary-source verification only. Mark design intent as design intent; do not assert unverified claims as fact. The Map itself models this discipline (its §7 recommendations and §8 caveats — the verification thresholds) — mirror it.
- **Step-0 re-verification** before wiring any volatile/live-spec surface (goose, ACP SDK, MCP spec, atproto). Cite version and primary source. Current anchors: goose v1.39.0, ACP SDK v1.0.0 (kit files may carry stale numbers — the settled decisions override).

---

## 5. Working protocol and division of labor

- **You (Claude Code Desktop)** have repo access and execute. **The chat session** authors prompts and pressure-tests readouts; it does not pretend to verify what it cannot see. Do not ask the human to re-supply context retrievable from the repos or prior context.
- **Plan first.** Before any change: (1) read the three constitutions / standing-context files; (2) locate where each project defines its role, boundaries, intake, and output schema; (3) map each of the four upgrades (A, B, C, and the moral-grounding fork) to specific files; (4) produce a written plan with the exact edits proposed and the definitions of done restated against real file paths; (5) **stop and get go-ahead.** No commits before the plan is endorsed.
- **Respect the System Invariants** (deck slide 10): Holmes never authors the blueprint or decides product direction; WCJBT never asserts an unverified fact as true; Alfred never makes a sourcing/evidentiary judgment. The upgrades must not blur these roles. In particular: the Intuition Intake (Upgrade A) belongs to WCJBT because it concerns *what to build*; the metacognitive-humility layer (Upgrade B) belongs to Holmes because it concerns *what is true / knowable*; Loop E (Upgrade C) crosses all three but must respect each boundary at each hop.
- **Additive, not destructive.** Every upgrade extends existing structure (PIE flow, Evidence Pack schema, Loops A–D, policy canon). Do not rewrite working components; instrument them.

---

## 6. Deliverables

1. A **written integration plan** (read-only, pre-commit) mapping upgrades A / B / C / the moral-grounding fork to exact files across the three repos, with restated definitions of done. **Gate here for go-ahead.**
2. On endorsement, the implementation of each upgrade, Rule-9-gated per commit.
3. The four canon docs: `docs/intuition-intake.md` (WCJBT), the Holmes metacognitive-humility spec addition, `docs/creator-not-judge.md` (shared), and the moral-grounding statement in WCJBT policy canon.
4. A short **`EPISTEMIC-INTEGRATION.md`** at the root of each repo (or one shared, referenced from each) that states the thesis of §1 above — why the Triad needed an intuition seat, and how these upgrades answer the creator-vs-judge question — so the rationale survives for the next contributor.

---

## Appendix — the resolution in one paragraph (for the canon docs)

> The Non-Dev Builder OS was, by design, a knowledge-and-judgment engine: Holmes verifies what is true, WCJBT decides what is admissible, Alfred builds under guardrails. Every one of those is the explicit, analytic, *judgment* side of reasoning. But building something that matters begins with an intuitive leap — the murky, experience-driven conviction that a thing is worth making. The fear that disciplined AI turns the human from creator into judge is real, but it misreads the situation: intuition and judgment are different faculties, and they are interdependent, not interchangeable. The answer is not to make the AI guess. It is to give the human's intuition a first-class seat — captured before it is interrogated, trusted in proportion to how much the domain earns that trust, verified rigorously where the ground is uncertain, and sharpened over time as verified knowledge compounds into better instinct. The human stays the creator. The Triad is the augmentation that lets their intuition survive contact with reality. The pre-flight checklist is what you get only if you forget to build the cockpit.
