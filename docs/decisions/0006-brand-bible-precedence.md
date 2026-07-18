# 0006 — Brand-bible precedence: Pass 1 overrules on every conflict

- **Status:** Accepted (Martin, 2026-07-17)
- **Context:** A locally-held brand bible ("ALFRED: Brand Bible & Design Guidelines," generated from the mascot/logo assets) surfaced 2026-07-17; it was never fed to the project or Claude Code. Reconciliation against the Pass 1 design direction ("Study & Instrument" Calm-HUD, session 2026-07-13) found ~70% complement and 4 hard clashes (Cosmic Purple AI accent, magic/aura AI framing, absence of the Holmes register, silence on the trademark risk).
- **Decision:** The Pass 1 design direction overrules the brand bible on **every** conflict, categorically — no per-item relitigation. Resolved state:
  1. **Accent:** `--accent: #b8863d` is canonical (contrast gates green on main). `#C59B5F` is not adopted in-app.
  2. **Cosmic Purple `#7A42B8`:** prohibited in-app. No glowing borders, no "AI-active" glow states. AI activity renders as evidence/gate badges plus the lab steel accent, per Pass 1. (Pass 3 purged violet to zero residual; this stays purged.)
  3. **Two registers stand:** workshop (warm brass) + lab (muted steel/cyan, not glowing). The Holmes register is not collapsible into a one-room brand.
  4. **Typography:** Pass 1 intent governs. Concrete families adopted from the doc's complements: serif = Merriweather or Playfair Display (OFL); grotesque = Inter (OFL); **mono mandatory** for badges + timestamps. SF Pro excluded (Apple-platform license — not bundleable in a cross-platform Tauri app). Script faces excluded from app UI.
  5. **AI framing:** "smarts over sentience" / honesty-as-interface. "Magic," auras, and "AI brain coming to life" framing excluded from product copy.
  6. **Trademark:** the Running with Crayons Ltd collision remains the highest-priority pre-public-beta item. The brand doc's public-branding asset checklist is gated on clearance.
  7. **Surviving scope of the brand doc:** marketing/asset layer only — logo semantics, icon export sizes, empty-state art direction, splash treatment — subordinate to Pass 1 and to this decision. It is not a product-design source.
- **Consequences:** The design-execution stage consumes the Pass 1 condensed brief + this decision as its complete design inputs. The About-dialog defects (MIT-license string `Settings.tsx:2860` vs AGPL canon; "agentic AI development" tagline drift `Settings.tsx:2795/2836`) align to this decision when fixed. Any future brand asset that contradicts Pass 1 is rejected at review without a new decision.
