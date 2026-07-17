// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
/**
 * Pre-flight action preview + acknowledgement gate. Reusable: the recipe safety
 * scanner (Step 1) and the tool-permission gating (Step 2) both render their
 * action surface through this. Routine `notices` proceed on a plain Run; every
 * `warning` must be EXPLICITLY acknowledged before Run is enabled.
 *
 * Design pass: presentation only — inline styles moved to token classes
 * (styles.css, "Study & Instrument" section); optional `reversibility` line
 * added to the evidence pack. Gating logic and API are otherwise unchanged.
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
  /** Plain-language reversibility/rollback note, when the caller knows it. */
  reversibility?: string;
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
    <div class="action-preview">
      <strong>{props.title}</strong>
      <Show when={props.summary}>
        <div class="action-preview__summary">{props.summary}</div>
      </Show>

      <div class="action-preview__section-title">Actions this will take</div>
      <Show
        when={props.actions.length}
        fallback={<div class="action-preview__empty">(none enumerated)</div>}
      >
        <ul class="action-preview__list">
          <For each={props.actions}>
            {(a) => (
              <li>
                <span class="action-preview__label">{a.label}</span>
                <Show when={a.detail}>
                  <span class="action-preview__detail"> — {a.detail}</span>
                </Show>
              </li>
            )}
          </For>
        </ul>
      </Show>

      <Show when={props.reversibility}>
        <div class="action-preview__reversibility">Reversibility — {props.reversibility}</div>
      </Show>

      <Show when={props.notices && props.notices.length > 0}>
        <For each={props.notices}>{(n) => <div class="action-preview__notice">• {n}</div>}</For>
      </Show>

      <Show when={props.warnings.length > 0}>
        <div class="action-preview__warnings-head">
          ⚠ {props.warnings.length} warning(s) — acknowledge each to proceed
        </div>
        <For each={props.warnings}>
          {(w) => (
            <label class="action-preview__warning">
              <input type="checkbox" checked={acked().has(w.id)} onChange={() => toggle(w.id)} /> {w.label}
              <Show when={w.detail}>
                <span class="action-preview__warning-detail"> — {w.detail}</span>
              </Show>
            </label>
          )}
        </For>
      </Show>

      <div class="action-preview__buttons">
        <button disabled={!allAcked()} onClick={() => props.onRun()}>
          {props.runLabel ?? 'Run'}
        </button>
        <button onClick={() => props.onCancel()}>Cancel</button>
      </div>
    </div>
  );
};

export default ActionPreview;
