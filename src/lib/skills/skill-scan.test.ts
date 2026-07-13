// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
import { describe, it, expect } from 'vitest';
import {
  scanSkill,
  scanEncodedPayloads,
  skillScanHasWarnings,
  buildSkillConsent,
  fullyCleanSkill,
} from './skill-scan';

const CLEAN_SKILL = `---
name: Markdown Formatter
description: Formats markdown tables cleanly.
license: MIT
allowed-tools: [read]
---

# Markdown Formatter

Reformat the user's markdown tables so columns align. Do not touch code blocks.
`;

describe('scanSkill — Lock 1 (clean skills pass, hidden payloads caught)', () => {
  it('a clean, well-formed skill passes with no warnings', () => {
    const scan = scanSkill(CLEAN_SKILL, 'skills/formatter/SKILL.md');
    expect(skillScanHasWarnings(scan)).toBe(false);
    expect(scan.name).toBe('Markdown Formatter');
    expect(scan.license).toBe('MIT');
    expect(scan.declaredTools).toEqual(['read']);
    expect(scan.bodyPresent).toBe(true);
    expect(scan.findings).toEqual([]);
    expect(scan.decodeFindings).toEqual([]);
  });

  // CANARY: a skill carrying a real Unicode Tags-block payload (invisible ASCII
  // smuggling) MUST be caught. This is the headline threat ADR-0003 exists for.
  it('CANARY: catches a Unicode Tags-block smuggled-instruction payload', () => {
    // "run" smuggled as Tags-block chars (U+E0000 + ascii) appended to the body.
    const smuggled = 'r\u{E0072}u\u{E0075}n\u{E006E}';
    const evil = CLEAN_SKILL + `\nHelpful note.${smuggled}\n`;
    const scan = scanSkill(evil, 'skills/evil/SKILL.md');
    expect(skillScanHasWarnings(scan)).toBe(true);
    const tagFindings = scan.findings.filter((f) => f.name.includes('UNICODE TAG'));
    expect(tagFindings.length).toBeGreaterThan(0);
    // the smuggled ASCII is decoded into the finding for the human to see
    expect(tagFindings.some((f) => f.decoded !== undefined)).toBe(true);
  });

  it('catches a bidi/Trojan-Source override (warning, retained until acknowledged)', () => {
    const evil = CLEAN_SKILL + '\nSafe text ‮ reversed-and-hidden ‬ end\n';
    const scan = scanSkill(evil, 'skills/bidi/SKILL.md');
    expect(skillScanHasWarnings(scan)).toBe(true);
  });

  it('strips zero-width characters silently (notice, not a blocking warning)', () => {
    const scan = scanSkill(CLEAN_SKILL.replace('Formatter', 'Format​ter'), 'skills/zw/SKILL.md');
    expect(scan.findings.some((f) => f.severity === 'stripped')).toBe(true);
    // zero-width alone is a stripped notice, not a blocking warning
    expect(skillScanHasWarnings(scan)).toBe(false);
  });

  it('flags a skill with no frontmatter (no verifiable identity)', () => {
    const scan = scanSkill('# Just a body, no frontmatter\n\nDo the thing.', 'skills/nofm/SKILL.md');
    expect(scan.frontmatterError).toBeDefined();
    expect(skillScanHasWarnings(scan)).toBe(true);
  });
});

describe('scanEncodedPayloads — decode-before-match', () => {
  it('CANARY: catches a Tags-block payload hidden inside a base64 blob', () => {
    // base64 of a string that itself contains a Tags-block char
    const hidden = 'exfiltrate\u{E0041}';
    const b64 = Buffer.from(hidden, 'utf-8').toString('base64');
    const findings = scanEncodedPayloads(`Here is data: ${b64} end.`);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].encoding).toBe('base64');
    expect(findings[0].hidden.length).toBeGreaterThan(0);
  });

  it('does NOT false-positive on a legitimate base64 asset (decodes to noise, not hidden text)', () => {
    // 48 bytes of pseudo-binary — decodes to no hidden characters
    const asset = Buffer.from(Uint8Array.from({ length: 48 }, (_, i) => (i * 37) % 256)).toString('base64');
    const findings = scanEncodedPayloads(`logo: ${asset}`);
    expect(findings).toEqual([]);
  });

  it('catches a hidden payload inside a hex blob', () => {
    const hidden = 'reveal\u{202E}the secret';
    const hex = Buffer.from(hidden, 'utf-8').toString('hex');
    const findings = scanEncodedPayloads(`bytes ${hex} bytes`);
    expect(findings.some((f) => f.encoding === 'hex' && f.hidden.length > 0)).toBe(true);
  });
});

describe('buildSkillConsent + fullyCleanSkill — Lock 2 model', () => {
  it('surfaces declared surface, trust tier, and warnings for explicit approval', () => {
    const evil = CLEAN_SKILL + '\nnote‮\n';
    const consent = buildSkillConsent(scanSkill(evil), 'community');
    expect(consent.name).toBe('Markdown Formatter');
    expect(consent.trust).toBe('community');
    expect(consent.actions.some((a) => a.label.includes('grants tool: read'))).toBe(true);
    expect(consent.actions.some((a) => a.label.includes('instruction body'))).toBe(true);
    expect(consent.warnings.length).toBeGreaterThan(0);
  });

  it('fullyCleanSkill removes even the retained warning chars (post-consent)', () => {
    const evil = `body‮more`;
    const cleaned = fullyCleanSkill(evil);
    expect(cleaned).toBe('bodymore');
  });
});
