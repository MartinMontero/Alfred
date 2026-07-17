// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
/**
 * Evidence badge — renders a note/claim's provenance state from parsed
 * evidence frontmatter (src/lib/evidence.ts). Design rules (LOOP-DESIGN.md):
 * color band + TEXT label + glyph, never color alone; mono type; dated when a
 * validity window is known; invalidation is a visible non-destructive label;
 * unmarked notes render nothing (unknown ≠ marked). Presentation only — no
 * model calls, no state mutation.
 */
import { Show, type Component } from 'solid-js';
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
}

const EvidenceBadge: Component<EvidenceBadgeProps> = (props) => {
  const meta = () => props.meta ?? parseEvidence(props.frontmatter);

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

  return (
    <Show when={!meta().unmarked}>
      <span class={`ev-badge ${stateClass()}`} title={title()}>
        <span aria-hidden="true">{meta().invalidated !== null ? '⊘' : GLYPH[meta().band]}</span>
        <span class="ev-badge__label">{label()}</span>
        <Show when={meta().invalidated}>
          <span class="ev-badge__reason">{meta().invalidated}</span>
        </Show>
        <span class="ev-badge__label">{flagsSuffix()}</span>
        <Show when={meta().validUntil}>
          <span class="ev-badge__date">→ {meta().validUntil}</span>
        </Show>
      </span>
    </Show>
  );
};

export default EvidenceBadge;
