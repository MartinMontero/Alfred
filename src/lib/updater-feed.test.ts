// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
/**
 * Regression tests for the per-installer updater feed (ADR-0009).
 *
 * The anchor case is the REAL beta.3 defect: latest.json carried only a
 * plain windows-x86_64 key pointing at the .msi, so the installed NSIS
 * per-user beta.2 ran msiexec blind and stayed at 0.1.1. verifyFeed must
 * fail that exact shape.
 */
import { describe, expect, it } from 'vitest';
// @ts-expect-error — plain .mjs module without type declarations
import { buildFeed, verifyFeed } from '../../scripts/updater-feed.mjs';

const G = {
  tag: 'v0.1.0-beta.4',
  version: '0.1.3',
  repo: 'MartinMontero/Alfred',
  nsisName: 'Alfred_0.1.3_x64-setup.exe',
  nsisSig: 'SIG_NSIS_BASE64',
  msiName: 'Alfred_0.1.3_x64_en-US.msi',
  msiSig: 'SIG_MSI_BASE64',
};

const goodFeed = () =>
  buildFeed({ ...G, notes: 'notes', pubDate: '2026-07-22T00:00:00Z' });

describe('buildFeed', () => {
  it('emits the three keys the plugin probes, urls pinned to the tag', () => {
    const feed = goodFeed();
    expect(Object.keys(feed.platforms)).toEqual([
      'windows-x86_64-nsis',
      'windows-x86_64-msi',
      'windows-x86_64',
    ]);
    expect(feed.platforms['windows-x86_64-nsis'].url).toBe(
      `https://github.com/${G.repo}/releases/download/${G.tag}/${G.nsisName}`,
    );
    expect(feed.platforms['windows-x86_64-msi'].url).toContain(`/download/${G.tag}/`);
    expect(feed.version).toBe(G.version);
  });

  it('fallback key equals the nsis entry — never the msi', () => {
    const feed = goodFeed();
    expect(feed.platforms['windows-x86_64']).toEqual(feed.platforms['windows-x86_64-nsis']);
  });

  it('refuses swapped artifacts', () => {
    expect(() => buildFeed({ ...G, nsisName: G.msiName, notes: '', pubDate: 'x' })).toThrow();
  });
});

describe('verifyFeed — the regression gate', () => {
  it('passes a feed built by buildFeed', () => {
    expect(verifyFeed(goodFeed(), G)).toEqual([]);
  });

  it('FAILS the shipped beta.3 shape: single plain key pointing at the msi', () => {
    const beta3 = {
      version: '0.1.2',
      platforms: {
        'windows-x86_64': {
          signature: 'SIG_MSI_BASE64',
          url: 'https://github.com/MartinMontero/Alfred/releases/download/v0.1.0-beta.3/Alfred_0.1.2_x64_en-US.msi',
        },
      },
    };
    const fails = verifyFeed(beta3, { ...G, tag: 'v0.1.0-beta.3', version: '0.1.2' });
    expect(fails.some((f: string) => f.includes('windows-x86_64-nsis'))).toBe(true);
    expect(fails.some((f: string) => f.includes('windows-x86_64-msi'))).toBe(true);
    expect(fails.some((f: string) => f.includes('nsis'))).toBe(true);
  });

  it('FAILS a stale-merge inheritance: any url escaping this tag', () => {
    const feed = goodFeed();
    feed.platforms['windows-x86_64-msi'].url =
      'https://github.com/MartinMontero/Alfred/releases/download/v0.1.0-beta.3/Alfred_0.1.2_x64_en-US.msi';
    const fails = verifyFeed(feed, G);
    expect(fails.some((f: string) => f.includes('stale merge') || f.includes('expected this tag'))).toBe(true);
  });

  it('FAILS a signature swap', () => {
    const feed = goodFeed();
    feed.platforms['windows-x86_64-nsis'].signature = 'SIG_MSI_BASE64';
    feed.platforms['windows-x86_64'].signature = 'SIG_MSI_BASE64';
    const fails = verifyFeed(feed, G);
    expect(fails.some((f: string) => f.includes('.exe.sig'))).toBe(true);
  });

  it('FAILS a version mismatch (the updater orders on the numeric)', () => {
    const feed = goodFeed();
    feed.version = '0.1.2';
    expect(verifyFeed(feed, G).some((f: string) => f.includes('feed.version'))).toBe(true);
  });

  it('FAILS a fallback key that drifts from the nsis entry', () => {
    const feed = goodFeed();
    feed.platforms['windows-x86_64'] = feed.platforms['windows-x86_64-msi'];
    expect(verifyFeed(feed, G).some((f: string) => f.includes('fallback'))).toBe(true);
  });
});
