// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
/**
 * AnalyticalPanel — the lab-register surface for the Holmes analytical embed
 * (D-14 Option A). It renders ONLY an emitted evidence pack (the compiled
 * projection builds the DTO solely from an EmittedEvidencePack); a gate denial
 * is rendered as the crate's own honest refusal, never hidden. Verdict-first,
 * muted-steel lab register (ADR-0006); the three-part limits, uncertainty, and
 * [eliminated] labels all reach the screen. Desktop only.
 *
 * Two-layer rule (ADR-0005): no loop/build vocabulary appears in this UI.
 */
import { createSignal, For, Show, type Component } from 'solid-js';
import {
  analyticalEmit,
  knowabilityLabel,
  isEliminated,
  hypothesisText,
  limitsSections,
  type EmittedPackDto,
} from '../lib/analytical';

// A worked, non-personal example: the operator provides the brief and evidence;
// nothing here is fetched or model-inferred. It demonstrates the emission gate
// and the honesty rendering without shipping the collection surface.
const EXAMPLE = {
  question: 'Did the transit authority redirect the maintenance fund?',
  scope: 'public office conduct',
  knowability: 'high_validity' as const,
  findings: [
    {
      claim: 'The maintenance line was drawn down into an unrelated account before the audit.',
      confidence: 0.6,
      validFrom: '2026-07-22',
      provenance: [
        { source: 'https://sec.gov/filing/transit-2026', quote: 'the transfer of $2.1M is recorded on p.14' },
        { source: 'https://courtlistener.com/docket/transit-88', quote: 'the deposition confirms the redirection' },
      ],
    },
  ],
  limits: {
    whatWouldChangeTheConclusion: ['A signed board authorization for the transfer.'],
    whatCouldNotBeChecked: ['Internal emails not entered into the public record.'],
    whereTheEvidenceRunsOut: ['After the close of the 2026 fiscal year.'],
  },
  competingHypotheses: [
    'The transfer was a board-authorized reallocation.',
    '[eliminated] The maintenance fund never held that balance.',
  ],
  keyAssumptions: ['The filing and docket are authentic public records.'],
  recommendation: 'Route to a journalist for independent verification before any public claim.',
};

const AnalyticalPanel: Component<{ onClose?: () => void }> = (props) => {
  const [pack, setPack] = createSignal<EmittedPackDto | null>(null);
  const [denial, setDenial] = createSignal<{ reason: string; class: string } | null>(null);
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    setDenial(null);
    setPack(null);
    try {
      const out = await analyticalEmit(EXAMPLE);
      if (out.outcome === 'emitted') setPack(out.pack);
      else setDenial({ reason: out.reason, class: out.class });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="analytical-panel" data-register="evidence">
      <div class="analytical-panel__header">
        <strong class="analytical-panel__title">Evidence review</strong>
        <Show when={props.onClose}>
          <button class="icon-btn" title="Close" aria-label="Close the evidence panel" onClick={() => props.onClose?.()}>
            ✕
          </button>
        </Show>
      </div>

      {/* Rider (b), steward register: testers see the scope plainly. */}
      <p class="analytical-panel__scope-note">
        This is the analytical review surface. It shows findings that have passed the evidence gate,
        with their limits stated in full. Collecting evidence for you — the investigative mode — is
        not part of this beta; it sits behind separate safety gates and is not switched on.
      </p>

      <Show when={!pack() && !denial()}>
        <button class="btn btn--primary" disabled={busy()} onClick={run}>
          {busy() ? 'Running the evidence gate…' : 'Review a worked example'}
        </button>
      </Show>

      <Show when={error()}>
        <p class="analytical-panel__error">{error()}</p>
      </Show>

      {/* The gate's honest refusal, rendered — not swallowed. */}
      <Show when={denial()}>
        {(d) => (
          <div class="analytical-denial" role="status">
            <span class="ev-badge ev-badge--invalid">
              <span aria-hidden="true">⊘</span> not emitted
            </span>
            <p class="analytical-denial__reason">{d().reason}</p>
          </div>
        )}
      </Show>

      <Show when={pack()}>
        {(p) => (
          <article class="evidence-pack">
            {/* Verdict-first: the question, then the current findings. */}
            <h3 class="evidence-pack__question">{p().question}</h3>

            <Show when={p().knowability}>
              <p class="evidence-pack__knowability" data-k={p().knowability ?? ''}>
                {knowabilityLabel(p().knowability)}
              </p>
            </Show>

            <For each={p().findings}>
              {(f) => (
                <section class={`finding ${f.isCurrent ? '' : 'finding--superseded'}`}>
                  <p class="finding__claim">{f.claim}</p>
                  <span
                    class="ev-badge ev-badge--flag"
                    title="Confidence — held below the calibration ceiling unless calibration evidence exists"
                  >
                    <span aria-hidden="true">◆</span> confidence {f.confidence.toFixed(2)}
                  </span>
                  <Show when={!f.isCurrent}>
                    <span class="ev-badge ev-badge--invalid">
                      <span aria-hidden="true">↺</span> superseded {f.validUntil}
                    </span>
                  </Show>
                  <ul class="finding__provenance">
                    <For each={f.provenance}>
                      {(pr) => (
                        <li class="provenance">
                          <span class="provenance__source">{pr.source}</span>
                          <Show when={pr.quote}>
                            <blockquote class="provenance__quote">“{pr.quote}”</blockquote>
                          </Show>
                        </li>
                      )}
                    </For>
                  </ul>
                </section>
              )}
            </For>

            {/* The three-part limits statement — rendered in full, never truncated. */}
            <Show when={limitsSections(p().limitsOfThisFinding).length > 0}>
              <section class="limits">
                <h4 class="limits__title">The limits of this finding</h4>
                <For each={limitsSections(p().limitsOfThisFinding)}>
                  {(s) => (
                    <div class="limits__part">
                      <span class="limits__label">{s.label}</span>
                      <ul>
                        <For each={s.items}>{(item) => <li>{item}</li>}</For>
                      </ul>
                    </div>
                  )}
                </For>
              </section>
            </Show>

            <Show when={p().uncertaintyStatement}>
              <p class="evidence-pack__uncertainty">{p().uncertaintyStatement}</p>
            </Show>

            <Show when={p().competingHypotheses.length > 0}>
              <section class="hypotheses">
                <h4 class="hypotheses__title">Competing explanations</h4>
                <ul>
                  <For each={p().competingHypotheses}>
                    {(h) => (
                      <li class={isEliminated(h) ? 'hypothesis hypothesis--eliminated' : 'hypothesis'}>
                        <Show when={isEliminated(h)}>
                          <span class="ev-badge ev-badge--invalid">
                            <span aria-hidden="true">✕</span> eliminated
                          </span>
                        </Show>
                        {hypothesisText(h)}
                      </li>
                    )}
                  </For>
                </ul>
              </section>
            </Show>

            <Show when={p().riskFlags.length > 0}>
              <ul class="risk-flags">
                <For each={p().riskFlags}>
                  {(r) => (
                    <li class="risk-flags__item">
                      <span class="ev-badge ev-badge--mid">
                        <span aria-hidden="true">△</span> note
                      </span>
                      {r}
                    </li>
                  )}
                </For>
              </ul>
            </Show>

            <Show when={p().recommendation}>
              <p class="evidence-pack__recommendation">
                <span class="evidence-pack__rec-label">Next step (yours to take): </span>
                {p().recommendation}
              </p>
            </Show>
          </article>
        )}
      </Show>
    </div>
  );
};

export default AnalyticalPanel;
