// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
/**
 * Structure-preserving markdown edits (Phase 3 — Alfred MCP server).
 *
 * Pure helpers so vault_append / vault_patch can add to a note *under a specific
 * heading* without clobbering anything else. Unit-tested; no fs/SDK dependency.
 */

const HEADING = /^(#{1,6})\s+(.*)$/;

function headingMatch(line: string, heading: string): number | null {
  const m = line.match(HEADING);
  if (m && m[2].trim().toLowerCase() === heading.trim().toLowerCase()) return m[1].length;
  return null;
}

/** Index range [start, end) of a heading's section body (exclusive of the next peer/parent heading). */
function sectionRange(lines: string[], heading: string): { headingIdx: number; level: number; end: number } | null {
  let headingIdx = -1;
  let level = 0;
  for (let i = 0; i < lines.length; i++) {
    const lvl = headingMatch(lines[i], heading);
    if (lvl !== null) {
      headingIdx = i;
      level = lvl;
      break;
    }
  }
  if (headingIdx === -1) return null;

  let end = lines.length;
  for (let i = headingIdx + 1; i < lines.length; i++) {
    const m = lines[i].match(HEADING);
    if (m && m[1].length <= level) {
      end = i;
      break;
    }
  }
  return { headingIdx, level, end };
}

/**
 * Append `text` under `heading`, after that section's existing content. If the
 * heading is absent, a new `## heading` section is added at the end. Never
 * removes or overwrites existing content.
 */
export function appendUnderHeading(content: string, heading: string, text: string): string {
  const lines = content.split('\n');
  const range = sectionRange(lines, heading);

  if (!range) {
    const sep = content.endsWith('\n') ? '' : '\n';
    return `${content}${sep}\n## ${heading.trim()}\n\n${text.trim()}\n`;
  }

  // Insert just after the last non-blank line of the section body.
  let insertAt = range.end;
  while (insertAt > range.headingIdx + 1 && lines[insertAt - 1].trim() === '') insertAt--;

  const before = lines.slice(0, insertAt);
  const after = lines.slice(insertAt);
  return [...before, '', text.trim(), ...after].join('\n');
}

/**
 * Replace the body under `heading` with `newBody`, keeping the heading line and
 * everything outside the section intact. Throws if the heading is absent (patch
 * is for existing sections; append is for new content).
 */
export function replaceUnderHeading(content: string, heading: string, newBody: string): string {
  const lines = content.split('\n');
  const range = sectionRange(lines, heading);
  if (!range) {
    throw new Error(`Heading "${heading}" not found; use append to add a new section.`);
  }
  const before = lines.slice(0, range.headingIdx + 1);
  const after = lines.slice(range.end);
  return [...before, '', newBody.trim(), '', ...after].join('\n').replace(/\n{3,}/g, '\n\n');
}
