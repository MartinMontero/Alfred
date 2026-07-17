// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
// WCAG 2.x contrast check for the "Study & Instrument" token pairs (LOOP-DESIGN.md G/T6).
// Pure node, zero deps. Exits 1 if any REQUIRED pair is below AA (4.5:1).

const lum = (hex) => {
  const c = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16) / 255);
  const f = (v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const themes = {
  dark: {
    'ev-high': ['#8fd6ac', '#14241b'],
    'ev-mid': ['#e0b56a', '#2a2115'],
    'ev-low': ['#e0907e', '#2a1815'],
    'ev-flag': ['#9cc3d4', '#16232a'],
    'ev-invalid': ['#a8a8a8', '#232326'],
    'ev-unknown': ['#9a9a9a', '#212124'],
    'reversibility (reg-evidence on bg-secondary)': ['#6aa3b8', '#212124'],
    'workshop accent on bg-primary': ['#c9974a', '#1a1a1d'],
  },
  light: {
    'ev-high': ['#1d6b42', '#e6f4ec'],
    'ev-mid': ['#8a5a12', '#faf0dc'],
    'ev-low': ['#a13c2c', '#fbe9e5'],
    'ev-flag': ['#275d75', '#e4eff5'],
    'ev-invalid': ['#5a5a5a', '#ececec'],
    'ev-unknown': ['#666666', '#f5f5f5'],
    'reversibility (reg-evidence on bg-secondary)': ['#2f6e88', '#f5f5f5'],
    'workshop accent on bg-primary': ['#8a5f1e', '#ffffff'],
  },
};

// Brass accent (default #b8863d; JS derives hover/muted/accent-text at runtime).
// Text pairs require AA 4.5:1; non-text UI pairs require 3:1 (WCAG 1.4.11).
const accentText = {
  'accent-text (black) on accent': ['#000000', '#b8863d'],
  'accent as link text on dark bg-primary': ['#b8863d', '#1a1a1d'],
};
const accentUi = {
  'accent UI on light bg (buttons/borders, 3:1)': ['#b8863d', '#ffffff'],
  'accent-hover chip on dark bg (3:1)': ['#e9b76e', '#1a1a1d'],
};

let fail = 0;
for (const [theme, pairs] of Object.entries(themes)) {
  console.log(`\n[${theme}]`);
  for (const [name, [fg, bg]] of Object.entries(pairs)) {
    const r = ratio(fg, bg);
    const ok = r >= 4.5;
    if (!ok) fail++;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${r.toFixed(2)}:1  ${name}  ${fg} on ${bg}`);
  }
}
console.log('\n[accent — text pairs, ≥4.5:1]');
for (const [name, [fg, bg]] of Object.entries(accentText)) {
  const r = ratio(fg, bg);
  const ok = r >= 4.5;
  if (!ok) fail++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${r.toFixed(2)}:1  ${name}`);
}
console.log('\n[accent — UI component pairs, ≥3.0:1]');
for (const [name, [fg, bg]] of Object.entries(accentUi)) {
  const r = ratio(fg, bg);
  const ok = r >= 3.0;
  if (!ok) fail++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${r.toFixed(2)}:1  ${name}`);
}
console.log(fail ? `\n${fail} pair(s) below AA 4.5:1` : '\nAll pairs meet WCAG AA (4.5:1).');
process.exit(fail ? 1 : 0);
