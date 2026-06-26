// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
/**
 * Load-bearing frontmatter schema (Phase 2 — agentic vault).
 *
 * Operationalizes the "load-bearing frontmatter" pattern from
 * docs/research/agentic-pkm-architecture.md: every note in an agentic vault
 * carries a strict YAML header whose ~150-char `description` lets an agent judge
 * a file's relevance from an index scan alone — without reading the whole note —
 * keeping the startup context small (the hot.md / progressive-disclosure model).
 *
 * Pure and dependency-free (no @platform, no DOM) so it is unit-testable and can
 * run from a PostToolUse-style validator, the Properties panel, or the scaffold.
 */

import { parseFrontmatter, serializeFrontmatter, type FrontmatterProperty } from '../frontmatter';

/** The five required load-bearing fields, in canonical order. */
export const REQUIRED_FIELDS = ['id', 'description', 'tags', 'domain', 'updated'] as const;
export type RequiredField = (typeof REQUIRED_FIELDS)[number];

/** A description longer than this defeats the "scan, don't read" purpose. */
export const DESCRIPTION_MAX = 150;
/** Too-short descriptions carry no signal; flagged (not hard-failed) under this. */
export const DESCRIPTION_MIN = 12;

export interface NoteFrontmatter {
  /** Stable, rename-surviving id (never reused). */
  id: string;
  /** <= ~150 chars; the load-bearing one-line summary. */
  description: string;
  /** Topic tags. */
  tags: string[];
  /** The owning domain silo (e.g. "engineering", "atproto"). */
  domain: string;
  /** ISO date (YYYY-MM-DD) of last meaningful update. */
  updated: string;
  /** Any extra user properties are preserved. */
  [key: string]: unknown;
}

export interface FieldIssue {
  field: string;
  severity: 'error' | 'warning';
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: FieldIssue[];
  warnings: FieldIssue[];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Validate a frontmatter object against the load-bearing schema. */
export function validateFrontmatterObject(fm: unknown): ValidationResult {
  const errors: FieldIssue[] = [];
  const warnings: FieldIssue[] = [];

  if (!isPlainObject(fm)) {
    return {
      valid: false,
      errors: [{ field: '(root)', severity: 'error', message: 'Frontmatter is missing or is not a YAML mapping.' }],
      warnings: [],
    };
  }

  // id — required, non-empty string
  if (typeof fm.id !== 'string' || fm.id.trim() === '') {
    errors.push({ field: 'id', severity: 'error', message: 'A stable, non-empty `id` is required.' });
  }

  // description — required, string, length-bounded
  if (typeof fm.description !== 'string' || fm.description.trim() === '') {
    errors.push({ field: 'description', severity: 'error', message: 'A `description` is required.' });
  } else {
    const len = fm.description.trim().length;
    if (len > DESCRIPTION_MAX) {
      errors.push({
        field: 'description',
        severity: 'error',
        message: `description is ${len} chars; keep it <= ${DESCRIPTION_MAX} so it stays scannable.`,
      });
    } else if (len < DESCRIPTION_MIN) {
      warnings.push({
        field: 'description',
        severity: 'warning',
        message: `description is only ${len} chars; a fuller summary helps relevance scoring.`,
      });
    }
  }

  // tags — required array of non-empty strings
  if (!Array.isArray(fm.tags)) {
    errors.push({ field: 'tags', severity: 'error', message: '`tags` must be a list.' });
  } else if (!fm.tags.every((t) => typeof t === 'string' && t.trim() !== '')) {
    errors.push({ field: 'tags', severity: 'error', message: 'every tag must be a non-empty string.' });
  } else if (fm.tags.length === 0) {
    warnings.push({ field: 'tags', severity: 'warning', message: 'no tags — at least one aids retrieval.' });
  }

  // domain — required non-empty string
  if (typeof fm.domain !== 'string' || fm.domain.trim() === '') {
    errors.push({ field: 'domain', severity: 'error', message: 'A `domain` is required (the owning silo).' });
  }

  // updated — required ISO date
  if (typeof fm.updated !== 'string' || !ISO_DATE.test(fm.updated.trim())) {
    errors.push({ field: 'updated', severity: 'error', message: '`updated` must be an ISO date (YYYY-MM-DD).' });
  }

  return { valid: errors.length === 0, errors, warnings };
}

/** Convert parsed frontmatter properties into a plain object for validation. */
export function propertiesToObject(properties: FrontmatterProperty[]): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  for (const p of properties) obj[p.key] = p.value;
  return obj;
}

/** Validate the frontmatter embedded in a markdown document. */
export function validateNoteContent(content: string): ValidationResult {
  const parsed = parseFrontmatter(content);
  if (!parsed) {
    return {
      valid: false,
      errors: [{ field: '(root)', severity: 'error', message: 'No frontmatter block found at the top of the note.' }],
      warnings: [],
    };
  }
  return validateFrontmatterObject(propertiesToObject(parsed.properties));
}

/**
 * PostToolUse-style lint for a saved note: always checks wikilink syntax, and —
 * only when a frontmatter block is present — validates it against the schema.
 * Plain notes (no frontmatter) are allowed; this never fails them.
 */
export function lintNote(content: string): { errors: FieldIssue[]; warnings: FieldIssue[] } {
  const errors: FieldIssue[] = [];
  const warnings: FieldIssue[] = [];

  for (const m of findMalformedWikilinks(content)) {
    errors.push({ field: 'wikilink', severity: 'error', message: m });
  }

  if (parseFrontmatter(content)) {
    const v = validateNoteContent(content);
    errors.push(...v.errors);
    warnings.push(...v.warnings);
  }

  return { errors, warnings };
}

/** Build a canonical, schema-ordered frontmatter block from metadata. */
export function buildFrontmatter(meta: NoteFrontmatter): string {
  const ordered: FrontmatterProperty[] = [
    { key: 'id', value: meta.id, type: 'text' },
    { key: 'description', value: meta.description, type: 'text' },
    { key: 'tags', value: meta.tags, type: 'list' },
    { key: 'domain', value: meta.domain, type: 'text' },
    { key: 'updated', value: meta.updated, type: 'date' },
  ];
  for (const [key, value] of Object.entries(meta)) {
    if ((REQUIRED_FIELDS as readonly string[]).includes(key)) continue;
    if (value === undefined) continue;
    ordered.push({ key, value: value as FrontmatterProperty['value'], type: 'unknown' });
  }
  return serializeFrontmatter(ordered);
}

/**
 * Generate a stable, rename-surviving id. Deterministic when a clock value is
 * supplied (so tests are reproducible); otherwise time + entropy based.
 */
export function generateStableId(now: number = Date.now(), entropy?: string): string {
  const t = Math.floor(now).toString(36);
  const e = (entropy ?? Math.random().toString(36).slice(2, 8)).padEnd(6, '0').slice(0, 6);
  return `a-${t}-${e}`;
}

const WIKILINK = /\[\[([^\]]+?)\]\]/g;

/** Extract the targets of every [[wikilink]] (alias and heading stripped). */
export function extractWikilinks(content: string): string[] {
  const out: string[] = [];
  for (const m of content.matchAll(WIKILINK)) {
    const inner = m[1].split('|')[0].split('#')[0].trim();
    if (inner) out.push(inner);
  }
  return out;
}

/** Flag malformed wikilinks (unbalanced/empty brackets) anywhere in the content. */
export function findMalformedWikilinks(content: string): string[] {
  const issues: string[] = [];
  // Empty links: [[]] or [[  ]]
  if (/\[\[\s*\]\]/.test(content)) issues.push('Empty wikilink "[[]]".');
  // An opening [[ with no matching ]] before the next newline.
  for (const line of content.split('\n')) {
    const opens = (line.match(/\[\[/g) || []).length;
    const closes = (line.match(/\]\]/g) || []).length;
    if (opens !== closes) issues.push(`Unbalanced wikilink brackets: "${line.trim().slice(0, 60)}"`);
  }
  return issues;
}
