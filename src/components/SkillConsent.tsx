// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
/**
 * Install-time skill consent (Stage C, Lock 2 — ADR-0003).
 *
 * A skill NEVER installs silently. This surfaces the skill's identity, its
 * source trust tier, the declared surface it grants, a readable excerpt of the
 * (sanitized) instruction body, and every high-severity scan warning — then
 * requires an explicit approval through the shared ActionPreview ack gate. It is
 * the same acknowledgement discipline the recipe pre-flight uses.
 */
import { Show, type Component } from 'solid-js';
import ActionPreview from './ActionPreview';
import type { SkillConsentModel, TrustTier } from '../lib/skills/skill-scan';

const TRUST_LABEL: Record<TrustTier, string> = {
  unknown: 'Unknown source — treat with caution',
  community: 'Community',
  verified: 'Verified',
  'first-party': 'First-party',
};

export interface SkillConsentProps {
  model: SkillConsentModel;
  onApprove: () => void;
  onCancel: () => void;
}

const SkillConsent: Component<SkillConsentProps> = (props) => {
  return (
    <div class="skill-consent" style={{ border: '1px solid var(--border, #444)', 'border-radius': '6px', padding: '10px', margin: '8px 0' }}>
      <div style={{ 'font-weight': 600, 'font-size': '1.05em' }}>Install skill: {props.model.name}</div>
      <Show when={props.model.description}>
        <div style={{ opacity: 0.85, 'font-size': '0.9em' }}>{props.model.description}</div>
      </Show>
      <div style={{ 'margin-top': '4px', 'font-size': '0.85em' }}>
        <span>Source trust: <strong>{TRUST_LABEL[props.model.trust]}</strong></span>
        <Show when={props.model.license}>
          <span> · License: {props.model.license}</span>
        </Show>
      </div>

      <div style={{ 'margin-top': '8px', 'font-weight': 600, 'font-size': '0.9em' }}>What the skill says (sanitized)</div>
      <pre
        style={{
          'white-space': 'pre-wrap',
          'word-break': 'break-word',
          background: 'var(--code-bg, #1e1e1e)',
          padding: '6px',
          'border-radius': '4px',
          'max-height': '160px',
          overflow: 'auto',
          'font-size': '0.85em',
        }}
      >
        {props.model.bodyExcerpt}
      </pre>

      {/* The shared ack gate: every warning must be explicitly acknowledged before Approve. */}
      <ActionPreview
        title="This skill grants / will do:"
        actions={props.model.actions}
        notices={props.model.notices}
        warnings={props.model.warnings}
        runLabel="Approve & install"
        onRun={props.onApprove}
        onCancel={props.onCancel}
      />
    </div>
  );
};

export default SkillConsent;
