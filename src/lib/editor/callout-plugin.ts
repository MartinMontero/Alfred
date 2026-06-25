// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
import { $prose } from '@milkdown/utils';
import { Plugin, PluginKey } from '@milkdown/prose/state';
import { Decoration, DecorationSet } from '@milkdown/prose/view';

export const calloutPluginKey = new PluginKey('callout');

// Callout type mapping with icons and colors
// Follows Obsidian's callout types and aliases
const CALLOUT_TYPES: Record<string, { icon: string; color: string }> = {
  // Note types
  note: { icon: '📝', color: '#448aff' },

  // Abstract/Summary types
  abstract: { icon: '📋', color: '#00b8d4' },
  summary: { icon: '📋', color: '#00b8d4' },
  tldr: { icon: '📋', color: '#00b8d4' },

  // Info types
  info: { icon: 'ℹ️', color: '#448aff' },
  todo: { icon: '☑️', color: '#448aff' },

  // Tip types
  tip: { icon: '💡', color: '#00bfa5' },
  hint: { icon: '💡', color: '#00bfa5' },
  important: { icon: '💡', color: '#00bfa5' },

  // Success types
  success: { icon: '✅', color: '#00c853' },
  check: { icon: '✅', color: '#00c853' },
  done: { icon: '✅', color: '#00c853' },

  // Question types
  question: { icon: '❓', color: '#ffab00' },
  help: { icon: '❓', color: '#ffab00' },
  faq: { icon: '❓', color: '#ffab00' },

  // Warning types
  warning: { icon: '⚠️', color: '#ff9100' },
  caution: { icon: '⚠️', color: '#ff9100' },
  attention: { icon: '⚠️', color: '#ff9100' },

  // Failure types
  failure: { icon: '❌', color: '#ff5252' },
  fail: { icon: '❌', color: '#ff5252' },
  missing: { icon: '❌', color: '#ff5252' },

  // Danger types
  danger: { icon: '⚡', color: '#ff5252' },
  error: { icon: '⚡', color: '#ff5252' },

  // Bug type
  bug: { icon: '🐛', color: '#ff5252' },

  // Example type
  example: { icon: '📖', color: '#7c4dff' },

  // Quote types
  quote: { icon: '💬', color: '#9e9e9e' },
  cite: { icon: '💬', color: '#9e9e9e' },
};

// Regex to match [!type] at start of text content
// Captures: type, optional foldable (+/-), optional title
const CALLOUT_REGEX = /^\[!(\w+)\]([+-])?\s*(.*)/;

// Find all callouts in the document and create decorations
function findCallouts(doc: any): DecorationSet {
  const decorations: Decoration[] = [];

  doc.descendants((node: any, pos: number) => {
    // Look for blockquote nodes
    if (node.type.name === 'blockquote') {
      // Get first child of blockquote
      const firstChild = node.firstChild;
      if (firstChild && firstChild.isTextblock) {
        const textContent = firstChild.textContent;
        const match = CALLOUT_REGEX.exec(textContent);

        if (match) {
          const [fullMatch, type, foldable, title] = match;
          const calloutType = type.toLowerCase();
          const typeInfo = CALLOUT_TYPES[calloutType] || CALLOUT_TYPES.note;

          // Add node decoration to the blockquote
          decorations.push(Decoration.node(pos, pos + node.nodeSize, {
            class: `callout callout-${calloutType}`,
            style: `--callout-color: ${typeInfo.color}`,
            'data-callout-type': calloutType,
            'data-callout-icon': typeInfo.icon,
            'data-callout-foldable': foldable || '',
            'data-callout-title': title || '',
          }));

          // Find position of the [!type] marker to hide it
          // The marker is at the start of the first paragraph inside blockquote
          const paragraphPos = pos + 1; // +1 to enter blockquote
          const markerLength = fullMatch.indexOf(']') + 1; // Include the ]

          // Only hide up to the ] to keep any title visible
          if (markerLength > 0) {
            const textStart = paragraphPos + 1; // +1 to enter paragraph
            decorations.push(Decoration.inline(textStart, textStart + markerLength, {
              class: 'callout-type-marker',
              'data-icon': typeInfo.icon,
            }));
          }
        }
      }
    }
  });

  return DecorationSet.create(doc, decorations);
}

// Create the ProseMirror plugin for callouts
export const calloutPlugin = $prose(() => {
  return new Plugin({
    key: calloutPluginKey,

    state: {
      init(_, { doc }) {
        return findCallouts(doc);
      },
      apply(tr, oldState) {
        // Only recalculate if the document changed
        if (tr.docChanged) {
          return findCallouts(tr.doc);
        }
        return oldState.map(tr.mapping, tr.doc);
      },
    },

    props: {
      decorations(state) {
        return this.getState(state);
      },
    },
  });
});
