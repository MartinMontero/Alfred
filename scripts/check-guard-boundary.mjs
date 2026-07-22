// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
/**
 * Alfred-side structural boundary gate (Holmes integration-brief §6).
 *
 * Seconds-cheap, same spirit as the zero-Soapbox gate: assert Alfred's own tree
 * never crosses the Holmes safety boundary. These are compiler-backed on the
 * Holmes side (sealed types, pub(crate) accessor); this gate makes an ATTEMPT
 * to cross them fail CI here, not review.
 *
 * Rules:
 *   1. Never reach the quarantine raw-bytes accessor (`expose_raw_to_quarantined_backend`
 *      is pub(crate) and name-firewalled — F-034). Alfred must not name it.
 *   2. Never CONSTRUCT the sealed safety tokens (ToolGrant / ConsentRecord /
 *      TargetingAllowed / DisclosureAllowed / EmittedEvidencePack) with a struct
 *      literal — they mint only through their crate constructors.
 *   3. Never render a raw pack: the render DTO is built only from
 *      `&EmittedEvidencePack` (`EmittedPackDto::from_emitted`). A `from_pack`
 *      or a struct literal of `EmittedEvidencePack { … }` is forbidden.
 *   4. No blueprint types — none exist to import; Holmes emits evidence, never
 *      plans. A `ResearchBlueprint` / `Plan`/`Blueprint`-from-holmes import is a
 *      category error.
 *
 * Scans Alfred source only (src/, src-tauri/src/, mcp/, scripts/), skips the
 * vendored Holmes checkout and this file itself.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

const ROOT = resolve(process.argv[2] ?? '.');
const SCAN_DIRS = ['src', 'src-tauri/src', 'mcp', 'scripts'];
const EXTS = new Set(['.ts', '.tsx', '.rs', '.mjs', '.js']);
const SELF = 'check-guard-boundary.mjs';

// (regex, human message). A match in Alfred source is a boundary violation.
const RULES = [
  {
    re: /expose_raw_to_quarantined_backend/,
    msg: 'reaches the quarantine raw-bytes accessor (pub(crate), name-firewalled — F-034). Never vendor, fork, or patch around it.',
  },
  {
    // A struct literal of a sealed safety token (construction), not a type
    // reference or a method call. `Name {` with a field-ish body.
    re: /\b(ToolGrant|ConsentRecord|TargetingAllowed|DisclosureAllowed|EmittedEvidencePack)\s*\{/,
    msg: 'constructs a sealed safety token with a struct literal. These mint only through their crate constructors (record_decision / ConsentRecord::record / assess_targeting / assess_disclosure / emit).',
  },
  {
    re: /fn\s+from_pack\b|EmittedEvidencePack::pack\s*\(\s*&/,
    msg: 'builds a render surface from a raw pack. The render DTO is constructible only from &EmittedEvidencePack (EmittedPackDto::from_emitted).',
  },
  {
    re: /\b(ResearchBlueprint|holmes_core::\w*[Bb]lueprint|holmes_core::\w*[Pp]lan\b)/,
    msg: 'imports a blueprint/plan type from Holmes. None exist — Holmes emits evidence, never plans (triad invariant).',
  },
];

function walk(dir, out) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const p = join(dir, name);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === 'target' || name === 'dist' || name === 'dist-web') continue;
      walk(p, out);
    } else if (EXTS.has(extname(name)) && name !== SELF) {
      out.push(p);
    }
  }
  return out;
}

const files = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d), []));
const violations = [];

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip comment lines — a rule NAMED in a doc comment (like analytical.rs's
    // header, or this file) is documentation, not a crossing.
    const trimmed = line.trim();
    if (
      trimmed.startsWith('//') ||
      trimmed.startsWith('*') ||
      trimmed.startsWith('/*') ||
      trimmed.startsWith('#') ||
      trimmed.startsWith('///')
    ) {
      continue;
    }
    for (const rule of RULES) {
      if (rule.re.test(line)) {
        violations.push({ file: file.replace(`${ROOT}/`, ''), line: i + 1, text: trimmed.slice(0, 120), msg: rule.msg });
      }
    }
  }
}

if (violations.length > 0) {
  console.error('✗ Guard boundary violations (integration-brief §6):\n');
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}`);
    console.error(`    ${v.text}`);
    console.error(`    → ${v.msg}\n`);
  }
  console.error(`${violations.length} violation(s). The Holmes safety boundary is not Alfred's to cross.`);
  process.exit(1);
}

console.log(`✓ Guard boundary clean — ${files.length} Alfred source files scanned, no crossing of the Holmes safety boundary.`);
process.exit(0);
