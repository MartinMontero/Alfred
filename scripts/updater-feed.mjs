// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
/**
 * Per-installer updater feed — author + verify (ADR-0009).
 *
 * Why this exists: tauri-plugin-updater probes the feed for
 * `{os}-{arch}-{installer}` BEFORE `{os}-{arch}` (updater-v2.10.1
 * updater.rs:578-587; suffixes "nsis"/"msi" at :65-66), but tauri-action
 * writes only the plain key and, with both bundles present, points it at the
 * MSI by default. An NSIS per-user install fed an MSI runs msiexec blind —
 * the plugin has no installed-type check (forensics, 2026-07-22) — leaving
 * the running copy at the old version. So the release lane authors the feed
 * itself, deterministically, from THIS run's artifacts:
 *
 *   windows-x86_64-nsis -> Alfred_<v>_x64-setup.exe  (+ .exe.sig)
 *   windows-x86_64-msi  -> Alfred_<v>_x64_en-US.msi  (+ .msi.sig)
 *   windows-x86_64      -> the NSIS entry (fallback: every real install is
 *                          NSIS — the install guide only links -setup.exe)
 *
 * verifyFeed() is the regression gate: it fails when the nsis key (or the
 * fallback) doesn't point at THIS tag's -setup.exe, when signatures don't
 * match the local .sig bytes, or when ANY platform url escapes this tag
 * (which also catches tauri-action's stale-merge inheritance of old
 * latest.json entries).
 *
 * Pure functions; the CLI shell at the bottom is the only I/O.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';

/** Build the feed object. All inputs are strings already read from disk. */
export function buildFeed({ version, notes, pubDate, tag, repo, nsisName, nsisSig, msiName, msiSig }) {
  for (const [k, v] of Object.entries({ version, tag, repo, nsisName, nsisSig, msiName, msiSig })) {
    if (!v || typeof v !== 'string') throw new Error(`buildFeed: missing/empty ${k}`);
  }
  if (!nsisName.endsWith('-setup.exe')) throw new Error(`buildFeed: nsis artifact ${nsisName} is not a -setup.exe`);
  if (!msiName.endsWith('.msi')) throw new Error(`buildFeed: msi artifact ${msiName} is not a .msi`);
  const url = (name) =>
    `https://github.com/${repo}/releases/download/${tag}/${encodeURIComponent(name)}`;
  const nsisEntry = { signature: nsisSig, url: url(nsisName) };
  return {
    version,
    notes: notes ?? '',
    pub_date: pubDate,
    platforms: {
      'windows-x86_64-nsis': nsisEntry,
      'windows-x86_64-msi': { signature: msiSig, url: url(msiName) },
      // Fallback key for installs whose bundle-type detection fails (the
      // plugin then probes plain {os}-{arch} only). NSIS on purpose.
      'windows-x86_64': { ...nsisEntry },
    },
  };
}

/**
 * Verify a feed against this run's ground truth.
 * Returns an array of human-readable failures; empty array = pass.
 */
export function verifyFeed(feed, { tag, version, nsisName, nsisSig, msiName, msiSig }) {
  const fails = [];
  const p = feed?.platforms ?? {};
  const tagPath = `/releases/download/${tag}/`;

  if (feed?.version !== version) {
    fails.push(`feed.version is "${feed?.version}", expected "${version}" (updater orders on this)`);
  }

  const nsis = p['windows-x86_64-nsis'];
  if (!nsis) fails.push('missing platform key windows-x86_64-nsis (NSIS installs would fall back to whatever the plain key holds)');
  else {
    if (!nsis.url?.includes(tagPath) || decodeURIComponent(basename(nsis.url ?? '')) !== nsisName)
      fails.push(`windows-x86_64-nsis.url is "${nsis.url}", expected this tag's ${nsisName}`);
    if (!(nsis.url ?? '').endsWith('-setup.exe'))
      fails.push(`windows-x86_64-nsis.url does not point at a -setup.exe: "${nsis.url}"`);
    if (nsis.signature !== nsisSig) fails.push('windows-x86_64-nsis.signature does not match the local .exe.sig content');
  }

  const msi = p['windows-x86_64-msi'];
  if (!msi) fails.push('missing platform key windows-x86_64-msi');
  else {
    if (!msi.url?.includes(tagPath) || decodeURIComponent(basename(msi.url ?? '')) !== msiName)
      fails.push(`windows-x86_64-msi.url is "${msi.url}", expected this tag's ${msiName}`);
    if (msi.signature !== msiSig) fails.push('windows-x86_64-msi.signature does not match the local .msi.sig content');
  }

  const plain = p['windows-x86_64'];
  if (!plain) fails.push('missing fallback platform key windows-x86_64');
  else if (plain.url !== nsis?.url || plain.signature !== nsis?.signature)
    fails.push('fallback windows-x86_64 must equal the nsis entry (every real install is NSIS)');

  // Stale-merge catch: NO platform entry may point outside this tag.
  for (const [key, entry] of Object.entries(p)) {
    if (entry?.url && !entry.url.includes(tagPath))
      fails.push(`platform "${key}" url escapes this tag (stale merge?): "${entry.url}"`);
  }
  return fails;
}

// ---------------------------------------------------------------------------
// CLI: build|verify. Used by .github/workflows/release.yml; unit-tested via
// the exported functions.
const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
};

const mode = process.argv[2];
if (mode === 'build' || mode === 'verify') {
  const tag = arg('tag');
  const version = arg('version');
  const nsisPath = arg('nsis');
  const msiPath = arg('msi');
  const nsisName = basename(nsisPath);
  const msiName = basename(msiPath);
  const nsisSig = readFileSync(`${nsisPath}.sig`, 'utf-8').trim();
  const msiSig = readFileSync(`${msiPath}.sig`, 'utf-8').trim();

  if (mode === 'build') {
    const feed = buildFeed({
      version,
      notes: arg('notes-file') ? readFileSync(arg('notes-file'), 'utf-8').trim() : '',
      pubDate: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
      tag,
      repo: arg('repo'),
      nsisName,
      nsisSig,
      msiName,
      msiSig,
    });
    writeFileSync(arg('out'), `${JSON.stringify(feed, null, 2)}\n`);
    console.log(`updater-feed: wrote ${arg('out')} — keys: ${Object.keys(feed.platforms).join(', ')}`);
  } else {
    const feed = JSON.parse(readFileSync(arg('in'), 'utf-8'));
    const fails = verifyFeed(feed, { tag, version, nsisName, nsisSig, msiName, msiSig });
    if (fails.length) {
      for (const f of fails) console.error(`FEED VERIFY FAIL: ${f}`);
      process.exit(1);
    }
    console.log(`updater-feed: verified ${arg('in')} against ${tag} / ${version} — all keys point at this tag's artifacts.`);
  }
}
