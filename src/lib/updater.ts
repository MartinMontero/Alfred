// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
/**
 * User-consented updater flow (W5 wiring).
 *
 * Wraps @tauri-apps/plugin-updater behind three separate USER actions —
 * check, download-and-install, and the installer handoff — nothing is ever
 * automatic (house posture: updates are outward actions; the builder clicks
 * each step). The plugin import is dynamic so this module is inert on the
 * web/PWA build and unit-testable without a Tauri runtime.
 *
 * Until the release-keypair ceremony sets a real pubkey in tauri.conf.json
 * (plugins.updater), check() fails config validation — mapUpdaterError turns
 * that into the honest "not configured in this build" message.
 */

export interface UpdateCheckResult {
  phase: 'none' | 'available';
  version?: string;
  notes?: string;
}

type PendingUpdate = {
  version: string;
  body?: string | null;
  downloadAndInstall: (cb?: (event: DownloadEvent) => void) => Promise<void>;
};

type DownloadEvent =
  | { event: 'Started'; data: { contentLength?: number } }
  | { event: 'Progress'; data: { chunkLength: number } }
  | { event: 'Finished' };

let pending: PendingUpdate | null = null;

export async function checkForUpdate(): Promise<UpdateCheckResult> {
  const { check } = await import('@tauri-apps/plugin-updater');
  const update = await check();
  if (update) {
    pending = update as unknown as PendingUpdate;
    return { phase: 'available', version: update.version, notes: update.body ?? '' };
  }
  pending = null;
  return { phase: 'none' };
}

/**
 * Second consent step. On Windows the app exits when the installer starts —
 * callers must tell the user that before invoking this.
 */
export async function downloadAndInstallPending(
  onProgress?: (percent: number | null) => void,
): Promise<void> {
  if (!pending) throw new Error('No update is staged; run a check first.');
  let total: number | null = null;
  let received = 0;
  await pending.downloadAndInstall((e: DownloadEvent) => {
    if (e.event === 'Started') {
      total = e.data.contentLength ?? null;
    } else if (e.event === 'Progress') {
      received += e.data.chunkLength;
      onProgress?.(total ? Math.round((100 * received) / total) : null);
    } else if (e.event === 'Finished') {
      onProgress?.(100);
    }
  });
}

/** Plain-language error mapping; pure and unit-tested. */
export function mapUpdaterError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const msg = raw.toLowerCase();
  if (msg.includes('updater') && (msg.includes('config') || msg.includes('pubkey') || msg.includes('public key'))) {
    return 'Updates are not configured in this build (the release signing key is not set yet).';
  }
  if (msg.includes('signature') || msg.includes('verify')) {
    return 'The update failed signature verification and was rejected. Nothing was installed.';
  }
  if (
    msg.includes('error sending request') ||
    msg.includes('could not fetch') ||
    msg.includes('network') ||
    msg.includes('404') ||
    msg.includes('dns')
  ) {
    // F4 (beta.1 smoke): during the beta this is an EXPECTED state, not a
    // fault — the update feed goes live with the first published release.
    return 'I couldn’t reach an update feed. During the beta that’s expected — updates also arrive as fresh installers on the releases page.';
  }
  return `Update check failed: ${raw}`;
}

/**
 * True for degraded-but-expected beta states (no feed yet, pubkey pending):
 * the UI renders these as plain information, never error styling.
 */
export function isExpectedBetaState(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes('error sending request') ||
    msg.includes('could not fetch') ||
    msg.includes('network') ||
    msg.includes('404') ||
    msg.includes('dns') ||
    (msg.includes('updater') && (msg.includes('config') || msg.includes('pubkey') || msg.includes('public key')))
  );
}
