// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
/**
 * Evidence badge — renders a note/claim's provenance state from parsed
 * evidence frontmatter (src/lib/evidence.ts). Design rules (LOOP-DESIGN.md):
 * color band + TEXT label + glyph, never color alone; mono type; dated when a
 * validity window is known; invalidation is a visible non-destructive label;
 * unmarked notes render nothing (unknown ≠ marked). Presentation only — no
 * model calls, no state mutation.
 *
 * Calm-HUD provenance breakdown: when `interactive`, the badge is a button and
 * clicking it opens the provenance card (confidence, window, sources, issues)
 * — the "click a badge, see the chain" behavior from the design brief.
 */
import { For, Show, createSignal, onCleanup, type Component } from 'solid-js';
import { parseEvidence, type EvidenceMeta } from '../lib/evidence';

const GLYPH: Record<string, string> = {
  high: '◆',
  mid: '◈',
  low: '◇',
  unknown: '○',
};

export interface EvidenceBadgeProps {
  /** Raw frontmatter mapping (preferred) — parsed internally. */
  frontmatter?: unknown;
  /** Or a pre-parsed meta, if the caller already has one. */
  meta?: EvidenceMeta;
  /** Click-to-open provenance breakdown card. */
  interactive?: boolean;
}

const EvidenceBadge: Component<EvidenceBadgeProps> = (props) => {
  const meta = () => props.meta ?? parseEvidence(props.frontmatter);
  const [open, setOpen] = createSignal(false);

  const stateClass = () => {
    const m = meta();
    if (m.invalidated !== null) return 'ev-badge--invalid';
    if (m.directional || m.needsCaveat) {
      // Flags share one visual treatment; the text differentiates them.
      if (m.band === 'unknown') return 'ev-badge--flag';
    }
    switch (m.band) {
      case 'high':
        return 'ev-badge--high';
      case 'mid':
        return 'ev-badge--mid';
      case 'low':
        return 'ev-badge--low';
      default:
        return '';
    }
  };

  const label = () => {
    const m = meta();
    if (m.invalidated !== null) return 'invalidated';
    if (m.confidence !== null) return `${m.confidence.toFixed(2)} · ${m.band}`;
    if (m.directional) return 'directional';
    if (m.needsCaveat) return 'needs caveat';
    return 'unrated';
  };

  const flagsSuffix = () => {
    const m = meta();
    if (m.invalidated !== null || m.confidence === null) return '';
    const f: string[] = [];
    if (m.directional) f.push('directional');
    if (m.needsCaveat) f.push('needs caveat');
    return f.length ? ` · ${f.join(' · ')}` : '';
  };

  const title = () => {
    const m = meta();
    const parts: string[] = [];
    if (m.invalidated) parts.push(`Invalidated: ${m.invalidated}`);
    else if (m.invalidated === '') parts.push('Invalidated (no reason recorded)');
    if (m.confidence !== null) parts.push(`Confidence ${m.confidence}`);
    if (m.validFrom || m.validUntil)
      parts.push(`Valid ${m.validFrom ?? '…'} → ${m.validUntil ?? '…'}`);
    if (m.sources.length) parts.push(`Sources: ${m.sources.join(', ')}`);
    for (const i of m.issues) parts.push(`Check ${i.field}: ${i.message}`);
    return parts.join(' · ') || 'No provenance recorded';
  };

  const closeOnOutside = (e: MouseEvent) => {
    const t = e.target as HTMLElement;
    if (!t.closest('.ev-badge-wrap')) setOpen(false);
  };
  const toggle = () => {
    const next = !open();
    setOpen(next);
    if (next) document.addEventListener('click', closeOnOutside);
    else document.removeEventListener('click', closeOnOutside);
  };
  onCleanup(() => document.removeEventListener('click', closeOnOutside));

  const badgeBody = () => (
    <>
      <span aria-hidden="true">{meta().invalidated !== null ? '⊘' : GLYPH[meta().band]}</span>
      <span class="ev-badge__label">{label()}</span>
      <Show when={meta().invalidated}>
        <span class="ev-badge__reason">{meta().invalidated}</span>
      </Show>
      <span class="ev-badge__label">{flagsSuffix()}</span>
      <Show when={meta().validUntil}>
        <span class="ev-badge__date">→ {meta().validUntil}</span>
      </Show>
    </>
  );

  return (
    <Show when={!meta().unmarked}>
      <Show
        when={props.interactive}
        fallback={
          <span class={`ev-badge ${stateClass()}`} title={title()}>
            {badgeBody()}
          </span>
        }
      >
        <span class="ev-badge-wrap">
          <button
            type="button"
            class={`ev-badge ev-badge--button ${stateClass()}`}
            aria-expanded={open()}
            title="Show provenance"
            onClick={toggle}
          >
            {badgeBody()}
          </button>
          <Show when={open()}>
            <div class="ev-pop" role="dialog" aria-label="Provenance">
              <div class="ev-pop__row">
                <span class="ev-pop__key">state</span>
                <span class="ev-pop__val">{label()}{flagsSuffix()}</span>
              </div>
              <Show when={meta().invalidated !== null}>
                <div class="ev-pop__row">
                  <span class="ev-pop__key">invalidated</span>
                  <span class="ev-pop__val">{meta().invalidated || 'no reason recorded'}</span>
                </div>
              </Show>
              <Show when={meta().validFrom || meta().validUntil}>
                <div class="ev-pop__row">
                  <span class="ev-pop__key">window</span>
                  <span class="ev-pop__val">
                    {meta().validFrom ?? '…'} → {meta().validUntil ?? '…'}
                  </span>
                </div>
              </Show>
              <div class="ev-pop__row">
                <span class="ev-pop__key">sources</span>
                <Show when={meta().sources.length > 0} fallback={<span class="ev-pop__val ev-pop__val--dim">none recorded</span>}>
                  <ul class="ev-pop__sources">
                    <For each={meta().sources}>{(s) => <li>{s}</li>}</For>
                  </ul>
                </Show>
              </div>
              <Show when={meta().issues.length > 0}>
                <div class="ev-pop__row">
                  <span class="ev-pop__key">data issues</span>
                  <ul class="ev-pop__sources">
                    <For each={meta().issues}>{(i) => <li>{i.field}: {i.message}</li>}</For>
                  </ul>
                </div>
              </Show>
            </div>
          </Show>
        </span>
      </Show>
    </Show>
  );
};

export default EvidenceBadge;
