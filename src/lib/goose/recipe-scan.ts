// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
/**
 * Recipe safety scan (Pale Fire mitigation, Step 1).
 *
 * Reads a recipe's RAW text, runs the invisible-char {@link sanitize} on it
 * BEFORE any parse (so the parser and the LLM only ever see post-strip content),
 * then enumerates the action surface from the **real YAML AST** — the same
 * fidelity goose's executor parses with, so the pre-flight preview and the
 * executor can never disagree about what a recipe does. Recurses into
 * `sub_recipes` (resolved by file path) doing the same, carrying every finding
 * up into a tree.
 *
 * The security decision (strip / warn / gate) is driven by `sanitize` over raw
 * text plus structural warnings (unparseable YAML, an unresolved/unscanned
 * sub-recipe). Pure + deterministic + zero LLM inference; filesystem access is
 * injected so it is fully unit-testable.
 */

import { parse as parseYaml, parseDocument, isSeq, isMap } from 'yaml';
import { sanitize, hasWarnings, type Finding } from '../security/invisible-chars';

/** Reads a recipe file's raw text. Injected (Tauri fs in the app, a map in tests). */
export type ReadFile = (path: string) => Promise<string>;

export interface ExtensionInfo {
  type?: string;
  name?: string;
  /** Command surface for `type: stdio` extensions. */
  cmd?: string;
  args?: string[];
}

export interface SubRecipeRef {
  name?: string;
  path?: string;
}

export interface RecipeScan {
  path: string;
  /** Post-strip content (STRIP set removed; WARN chars retained + flagged). */
  cleanText: string;
  /** Char-level findings for THIS file only. */
  findings: Finding[];
  /** Set (blocking) when the cleaned text is not valid YAML. */
  parseError?: string;
  instructionsPresent: boolean;
  promptPresent: boolean;
  /** Action surface enumerated from the real AST. */
  extensions: ExtensionInfo[];
  subRecipes: RecipeScanChild[];
}

export interface RecipeScanChild {
  ref: SubRecipeRef;
  scan?: RecipeScan;
  /** Blocking: why the child could not be scanned (unresolved/unreadable/cycle/depth). */
  error?: string;
}

// --- path helpers (isomorphic — no node:path; recipes use forward-slash refs) --

function normalizeSlashes(p: string): string {
  return p.replace(/\\/g, '/');
}

function dirOf(p: string): string {
  const n = normalizeSlashes(p);
  const i = n.lastIndexOf('/');
  return i >= 0 ? n.slice(0, i) : '';
}

function isAbsolute(p: string): boolean {
  return /^(\/|[a-zA-Z]:\/)/.test(normalizeSlashes(p));
}

/** Resolve a sub-recipe ref relative to the parent recipe's directory. */
export function resolveRef(parentPath: string, ref: string): string {
  const r = normalizeSlashes(ref);
  if (isAbsolute(r)) return r;
  const base = normalizeSlashes(dirOf(parentPath));
  const driveMatch = base.match(/^([a-zA-Z]:)/);
  const drive = driveMatch ? `${driveMatch[1]}/` : base.startsWith('/') ? '/' : '';
  const segs = (base ? base.replace(/^([a-zA-Z]:)?\/?/, '').split('/') : []).concat(r.split('/'));
  const out: string[] = [];
  for (const s of segs) {
    if (s === '' || s === '.') continue;
    if (s === '..') {
      out.pop();
      continue;
    }
    out.push(s);
  }
  return drive + out.join('/');
}

// --- AST enumeration ---------------------------------------------------------

function asExtensions(v: unknown): ExtensionInfo[] {
  const toInfo = (item: unknown, nameFromKey?: string): ExtensionInfo | null => {
    if (!item || typeof item !== 'object') return null;
    const o = item as Record<string, unknown>;
    return {
      type: typeof o.type === 'string' ? o.type : undefined,
      name: typeof o.name === 'string' ? o.name : nameFromKey,
      cmd: typeof o.cmd === 'string' ? o.cmd : undefined,
      args: Array.isArray(o.args) ? o.args.map((a) => String(a)) : undefined,
    };
  };
  if (Array.isArray(v)) {
    return v.map((i) => toInfo(i)).filter((x): x is ExtensionInfo => x !== null);
  }
  if (v && typeof v === 'object') {
    // map-style (config) — the key is the extension name.
    return Object.entries(v as Record<string, unknown>)
      .map(([k, val]) => toInfo(val, k))
      .filter((x): x is ExtensionInfo => x !== null);
  }
  return [];
}

function asSubRecipes(v: unknown): SubRecipeRef[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x) => x && typeof x === 'object')
    .map((x) => {
      const o = x as Record<string, unknown>;
      return {
        name: typeof o.name === 'string' ? o.name : undefined,
        path: typeof o.path === 'string' ? o.path : undefined,
      };
    });
}

// --- the scan ----------------------------------------------------------------

const MAX_DEPTH = 8;

/** Scan a recipe file (and its sub-recipes) for invisible/deceptive chars and
 *  enumerate the action surface from the real YAML AST. `visited` guards cycles. */
export async function scanRecipe(
  path: string,
  readFile: ReadFile,
  depth = 0,
  visited: Set<string> = new Set(),
): Promise<RecipeScan> {
  let raw: string;
  try {
    raw = await readFile(path);
  } catch (e) {
    return {
      path,
      cleanText: '',
      findings: [],
      parseError: `Could not read recipe: ${e instanceof Error ? e.message : String(e)}`,
      instructionsPresent: false,
      promptPresent: false,
      extensions: [],
      subRecipes: [],
    };
  }

  const { clean, findings } = sanitize(raw);

  let doc: unknown;
  let parseError: string | undefined;
  try {
    doc = parseYaml(clean);
  } catch (e) {
    parseError = `Recipe is not valid YAML: ${e instanceof Error ? e.message : String(e)}`;
  }
  const obj = doc && typeof doc === 'object' && !Array.isArray(doc) ? (doc as Record<string, unknown>) : {};

  const scan: RecipeScan = {
    path,
    cleanText: clean,
    findings,
    parseError,
    instructionsPresent: 'instructions' in obj,
    promptPresent: 'prompt' in obj,
    extensions: parseError ? [] : asExtensions(obj.extensions),
    subRecipes: [],
  };

  visited.add(normalizeSlashes(path));

  const subRefs = parseError ? [] : asSubRecipes(obj.sub_recipes);
  for (const ref of subRefs) {
    if (!ref.path) {
      scan.subRecipes.push({
        ref,
        error: 'Sub-recipe has no local path (remote/GitHub name?) — UNRESOLVED, not scanned.',
      });
      continue;
    }
    const childPath = resolveRef(path, ref.path);
    if (visited.has(normalizeSlashes(childPath))) {
      scan.subRecipes.push({ ref, error: 'Cycle detected — already scanned.' });
      continue;
    }
    if (depth + 1 > MAX_DEPTH) {
      scan.subRecipes.push({ ref, error: `Max sub-recipe depth (${MAX_DEPTH}) exceeded.` });
      continue;
    }
    const childScan = await scanRecipe(childPath, readFile, depth + 1, visited);
    scan.subRecipes.push({ ref, scan: childScan });
  }

  return scan;
}

// --- aggregation + gating ----------------------------------------------------

/** All char findings across the whole recipe tree. */
export function allFindings(scan: RecipeScan): Finding[] {
  const out = [...scan.findings];
  for (const child of scan.subRecipes) if (child.scan) out.push(...allFindings(child.scan));
  return out;
}

export interface StructuralWarning {
  path: string;
  message: string;
}

/** Structural warnings (unparseable file, unresolved/unscanned sub-recipe) across
 *  the tree — these are blocking, surfaced loudly in the preview. */
export function structuralWarnings(scan: RecipeScan): StructuralWarning[] {
  const out: StructuralWarning[] = [];
  if (scan.parseError) out.push({ path: scan.path, message: scan.parseError });
  for (const child of scan.subRecipes) {
    if (child.error) {
      out.push({ path: scan.path, message: `${child.ref.name ?? child.ref.path ?? 'sub-recipe'}: ${child.error}` });
    }
    if (child.scan) out.push(...structuralWarnings(child.scan));
  }
  return out;
}

/** True if anything in the tree must block an unacknowledged run: a high-severity
 *  char warning, an unparseable file, or an unresolved/unscanned sub-recipe. */
export function scanHasWarnings(scan: RecipeScan): boolean {
  if (hasWarnings(scan.findings)) return true;
  if (scan.parseError) return true;
  for (const child of scan.subRecipes) {
    if (child.error) return true;
    if (child.scan && scanHasWarnings(child.scan)) return true;
  }
  return false;
}

/** Counts for a quick summary line in the preview. */
export function findingCounts(scan: RecipeScan): { stripped: number; warnings: number } {
  const all = allFindings(scan);
  return {
    stripped: all.filter((f) => f.severity === 'stripped').length,
    warnings: all.filter((f) => f.severity === 'warning').length,
  };
}

/** Fully-clean content for execution (STRIP + WARN both removed). Use after the
 *  operator has acknowledged the warnings. */
export function fullyClean(raw: string): string {
  return sanitize(raw, { stripWarnings: true }).clean;
}

// --- preview model (reusable by the ack UI) ----------------------------------

export interface PreviewWarning {
  id: string;
  label: string;
  detail?: string;
}

export interface RecipePreview {
  /** The enumerated action surface, in tree order. */
  actions: { label: string; detail?: string }[];
  /** Routine notices (e.g. "3 invisible chars stripped") — proceed on a plain ack. */
  notices: string[];
  /** High-severity warnings — each must be EXPLICITLY acknowledged before a run. */
  warnings: PreviewWarning[];
}

/** Build the pre-flight preview from a scan: the action surface (post-strip),
 *  routine strip notices, and the blocking warnings (char + structural). */
export function buildRecipePreview(scan: RecipeScan): RecipePreview {
  const actions: { label: string; detail?: string }[] = [];
  const walk = (s: RecipeScan, prefix: string) => {
    if (s.instructionsPresent) actions.push({ label: `${prefix}instructions` });
    if (s.promptPresent) actions.push({ label: `${prefix}prompt` });
    for (const e of s.extensions) {
      const cmd = e.cmd ? `${e.cmd}${e.args && e.args.length ? ` ${e.args.join(' ')}` : ''}` : undefined;
      actions.push({
        label: `${prefix}extension: ${e.name ?? e.type ?? 'extension'}`,
        detail: cmd ? `runs: ${cmd}` : e.type,
      });
    }
    for (const c of s.subRecipes) {
      actions.push({ label: `${prefix}sub-recipe: ${c.ref.name ?? c.ref.path ?? '?'}` });
      if (c.scan) walk(c.scan, `${prefix}  `);
    }
  };
  walk(scan, '');

  const counts = findingCounts(scan);
  const notices: string[] = [];
  if (counts.stripped > 0) {
    notices.push(`${counts.stripped} invisible character(s) stripped from recipe input.`);
  }

  const warnings: PreviewWarning[] = [];
  for (const f of allFindings(scan).filter((f) => f.severity === 'warning')) {
    warnings.push({
      id: `char-${f.codepoint.toString(16)}-${f.offset}`,
      label: `Hidden ${f.name}`,
      detail: f.decoded !== undefined ? `smuggled payload: "${f.decoded}"` : `at offset ${f.offset}`,
    });
  }
  for (const w of structuralWarnings(scan)) {
    warnings.push({ id: `struct-${w.path}:${w.message.slice(0, 24)}`, label: 'Unscanned / unparseable', detail: `${w.path}: ${w.message}` });
  }
  return { actions, notices, warnings };
}

export interface StagedRecipe {
  /** Path of the staged (fully-cleaned) parent recipe to run. */
  parentPath: string;
  /** Every file written, by staged path. */
  files: { path: string; content: string }[];
}

export type WriteFile = (path: string, content: string) => Promise<void>;

/** Rewrite each `sub_recipes[].path` (matched by original path) to a staging-local
 *  `./<name>` so the staged recipe references the staged CLEAN child — regardless
 *  of whether the original ref was relative, absolute, or `../`-escaping. */
function rewriteSubRecipePaths(cleaned: string, pathMap: Map<string, string>): string {
  const doc = parseDocument(cleaned);
  const seq = doc.get('sub_recipes', true);
  if (isSeq(seq)) {
    for (const item of seq.items) {
      if (isMap(item)) {
        const p = item.get('path');
        if (typeof p === 'string' && pathMap.has(p)) item.set('path', `./${pathMap.get(p)}`);
      }
    }
  }
  return doc.toString();
}

/**
 * Stage a fully-cleaned copy of the recipe tree under `stageDir` and return the
 * staged parent to run. Every node is written under a unique flat name and its
 * `sub_recipes` references are rewritten to point at the staged children, so the
 * executed recipe — **parent AND every descendant** — is guaranteed clean and can
 * never resolve back to an original (unsanitized) file.
 */
export async function stageCleanRecipe(
  scan: RecipeScan,
  stageDir: string,
  readFile: ReadFile,
  writeFile: WriteFile,
): Promise<StagedRecipe> {
  const dir = normalizeSlashes(stageDir);
  const names = new Map<RecipeScan, string>();
  let n = 0;
  const assign = (s: RecipeScan) => {
    names.set(s, `recipe-${n++}.yaml`);
    for (const c of s.subRecipes) if (c.scan) assign(c.scan);
  };
  assign(scan);

  const files: { path: string; content: string }[] = [];

  const writeNode = async (s: RecipeScan): Promise<void> => {
    const raw = await readFile(s.path);
    let content = sanitize(raw, { stripWarnings: true }).clean;
    if (!s.parseError && s.subRecipes.some((c) => c.scan)) {
      const pathMap = new Map<string, string>();
      for (const c of s.subRecipes) {
        if (c.scan && c.ref.path) pathMap.set(c.ref.path, names.get(c.scan) as string);
      }
      content = rewriteSubRecipePaths(content, pathMap);
    }
    const staged = `${dir}/${names.get(s)}`;
    files.push({ path: staged, content });
    await writeFile(staged, content);
    for (const c of s.subRecipes) if (c.scan) await writeNode(c.scan);
  };

  await writeNode(scan);
  return { parentPath: `${dir}/${names.get(scan)}`, files };
}
