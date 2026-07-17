// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
// Tauri Rust/JS version-alignment guard (W5 dry-run #1 lesson).
//
// The tauri CLI hard-errors pre-compile when a Rust crate and its JS guest
// package drift in major/minor — but that preflight only runs in the RELEASE
// lane (Windows). This check reproduces it in seconds on every CI push so the
// skew class can never sleep until a release run: compares `tauri` <->
// `@tauri-apps/api` and every `tauri-plugin-X` <-> `@tauri-apps/plugin-X`
// present on BOTH sides of Cargo.lock / package-lock.json. Pure node, no deps.
import { readFileSync } from 'node:fs';

const cargoLock = readFileSync('src-tauri/Cargo.lock', 'utf8');
const npmLock = JSON.parse(readFileSync('package-lock.json', 'utf8'));

const crateVersions = new Map();
for (const m of cargoLock.matchAll(/\[\[package\]\]\nname = "([^"]+)"\nversion = "([^"]+)"/g)) {
  crateVersions.set(m[1], m[2]);
}

const npmVersion = (name) => npmLock.packages?.[`node_modules/${name}`]?.version ?? null;
const majorMinor = (v) => v.split('.').slice(0, 2).join('.');

const pairs = [['tauri', '@tauri-apps/api']];
for (const crate of crateVersions.keys()) {
  if (crate.startsWith('tauri-plugin-')) {
    const js = `@tauri-apps/plugin-${crate.slice('tauri-plugin-'.length)}`;
    if (npmVersion(js) !== null) pairs.push([crate, js]);
  }
}

let failures = 0;
for (const [crate, js] of pairs) {
  const rust = crateVersions.get(crate);
  const node = npmVersion(js);
  if (!rust || !node) continue;
  const ok = majorMinor(rust) === majorMinor(node);
  if (!ok) failures++;
  console.log(`${ok ? 'OK  ' : 'SKEW'}  ${crate} ${rust}  <->  ${js} ${node}`);
}

if (failures) {
  console.error(
    `\n${failures} pair(s) skewed in major/minor. The tauri CLI will hard-error ` +
    'pre-compile in the release lane. Align both lockfiles (see the W5 dry-run #1 record).',
  );
  process.exit(1);
}
console.log(`\nAll ${pairs.length} tauri Rust/JS pairs aligned (major/minor).`);
