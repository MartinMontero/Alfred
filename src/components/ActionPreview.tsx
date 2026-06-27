// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
/**
 * Pre-flight action preview + acknowledgement gate. Reusable: the recipe safety
 * scanner (Step 1) and the tool-permission gating (Step 2) both render their
 * action surface through this. Routine `notices` proceed on a plain Run; every
 * `warning` must be EXPLICITLY acknowledged before Run is enabled.
 */
import { createSignal, For, Show, type Component } from 'solid-js';

export interface PreviewAction {
  label: string;
  detail?: string;
}

export interface PreviewWarningItem {
  id: string;
  label: string;
  detail?: string;
}

export interface ActionPreviewProps {
  title: string;
  summary?: string;
  actions: PreviewAction[];
  notices?: string[];
  warnings: PreviewWarningItem[];
  runLabel?: string;
  onRun: () => void;
  onCancel: () => void;
}

const ActionPreview: Component<ActionPreviewProps> = (props) => {
  const [acked, setAcked] = createSignal<Set<string>>(new Set());
  const allAcked = () => props.warnings.every((w) => acked().has(w.id));
  const toggle = (id: string) =>
    setAcked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div class="action-preview" style={{ border: '1px solid var(--border, #444)', 'border-radius': '6px', padding: '10px', margin: '8px 0' }}>
      <strong>{props.title}</strong>
      <Show when={props.summary}>
        <div style={{ opacity: 0.8, 'font-size': '0.9em' }}>{props.summary}</div>
      </Show>

      <div style={{ 'margin-top': '6px', 'font-weight': 600 }}>Actions this will take</div>
      <Show when={props.actions.length} fallback={<div style={{ opacity: 0.6 }}>(none enumerated)</div>}>
        <ul style={{ margin: '2px 0', 'padding-left': '18px' }}>
          <For each={props.actions}>
            {(a) => (
              <li>
                <span style={{ 'white-space': 'pre' }}>{a.label}</span>
                <Show when={a.detail}>
                  <span style={{ opacity: 0.7 }}> — {a.detail}</span>
                </Show>
              </li>
            )}
          </For>
        </ul>
      </Show>

      <Show when={props.notices && props.notices.length > 0}>
        <For each={props.notices}>
          {(n) => <div style={{ opacity: 0.75, 'font-size': '0.9em' }}>• {n}</div>}
        </For>
      </Show>

      <Show when={props.warnings.length > 0}>
        <div style={{ 'margin-top': '8px', color: 'var(--error, #c0392b)', 'font-weight': 600 }}>
          ⚠ {props.warnings.length} warning(s) — acknowledge each to proceed
        </div>
        <For each={props.warnings}>
          {(w) => (
            <label style={{ display: 'block', color: 'var(--error, #c0392b)', 'font-size': '0.9em', margin: '2px 0' }}>
              <input type="checkbox" checked={acked().has(w.id)} onChange={() => toggle(w.id)} /> {w.label}
              <Show when={w.detail}>
                <span style={{ opacity: 0.85 }}> — {w.detail}</span>
              </Show>
            </label>
          )}
        </For>
      </Show>

      <div style={{ display: 'flex', gap: '6px', 'margin-top': '8px' }}>
        <button disabled={!allAcked()} onClick={() => props.onRun()}>
          {props.runLabel ?? 'Run'}
        </button>
        <button onClick={() => props.onCancel()}>Cancel</button>
      </div>
    </div>
  );
};

export default ActionPreview;
