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
 * beta.6 instrumentation (the beta.5 apply defect): the apply step hands off
 * to an external installer that kills this process, and beta.5 failed there
 * with zero evidence — tauri-plugin-log was declared but only initialized in
 * debug builds. This module now (1) traces every apply step to the persisted
 * Rust log BEFORE it runs, and (2) runs the updater_pre_apply step (kill the
 * goose children and their trees) to release install-dir file locks before
 * the handoff — the locked `mcp-server.cjs` is the prime suspect for the
 * silent installer death.
 */

export interface UpdateCheckResult {
  phase: 'none' | 'available';
  version?: string;
  notes?: string;
}

export type PendingUpdate = {
  version: string;
  body?: string | null;
  downloadAndInstall: (cb?: (event: DownloadEvent) => void) => Promise<void>;
};

type DownloadEvent =
  | { event: 'Started'; data: { contentLength?: number } }
  | { event: 'Progress'; data: { chunkLength: number } }
  | { event: 'Finished' };

let pending: PendingUpdate | null = null;

/**
 * Hooks the apply path uses, injectable so the ordering contract (preApply
 * BEFORE the installer handoff; every step traced) is unit-testable without
 * a Tauri runtime. Defaults talk to the real Rust commands.
 */
export interface ApplyHooks {
  /** Release install-dir file locks before the installer handoff. */
  preApply?: () => Promise<void>;
  /** Diagnostic trace written to the persisted Rust log. */
  trace?: (event: string, detail: string) => Promise<void>;
}

/** Diagnostic trace via the Rust log (target `alfred::updater`). Never throws:
 * tracing must never change control flow, and on the web build / in unit
 * tests there is no Rust runtime to write to. */
async function defaultTrace(event: string, detail: string): Promise<void> {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('updater_trace', { event, detail });
  } catch {
    // No Tauri runtime — tracing is a no-op here.
  }
}

/** The real pre-apply step: kill the goose children (and their process trees
 * on Windows) so the installer can replace files in the install directory.
 * Never throws for the same reason as defaultTrace. */
async function defaultPreApply(): Promise<void> {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('updater_pre_apply');
  } catch {
    // No Tauri runtime — nothing to kill.
  }
}

export async function checkForUpdate(): Promise<UpdateCheckResult> {
  const { check } = await import('@tauri-apps/plugin-updater');
  const update = await check();
  if (update) {
    pending = update as unknown as PendingUpdate;
    await defaultTrace('check:available', `version=${update.version}`);
    return { phase: 'available', version: update.version, notes: update.body ?? '' };
  }
  pending = null;
  await defaultTrace('check:none', 'feed reports up to date');
  return { phase: 'none' };
}

/**
 * Second consent step. On Windows the app exits when the installer starts —
 * callers must tell the user that before invoking this.
 */
export async function downloadAndInstallPending(
  onProgress?: (percent: number | null) => void,
  hooks: ApplyHooks = {},
): Promise<void> {
  if (!pending) throw new Error('No update is staged; run a check first.');
  const trace = hooks.trace ?? defaultTrace;
  const preApply = hooks.preApply ?? defaultPreApply;
  const version = pending.version;
  await trace('apply:start', `version=${version}`);
  let total: number | null = null;
  let received = 0;
  // beta.6: release install-dir file locks BEFORE the handoff. The goose
  // children's node sidecar holds mcp-server.cjs open; a locked resource
  // file makes the installer's replacement step fail silently (beta.5).
  await preApply();
  await trace('apply:handoff', `version=${version}`);
  try {
    await pending.downloadAndInstall((e: DownloadEvent) => {
      if (e.event === 'Started') {
        total = e.data.contentLength ?? null;
        void trace('download:start', total ? `contentLength=${total}` : 'contentLength=unknown');
      } else if (e.event === 'Progress') {
        received += e.data.chunkLength;
        onProgress?.(total ? Math.round((100 * received) / total) : null);
      } else if (e.event === 'Finished') {
        onProgress?.(100);
        void trace('download:complete', `received=${received}`);
      }
    });
    // Reached only when the handoff returned without killing us (non-Windows
    // paths); on Windows the installer owns the process before this line.
    await trace('apply:returned', `version=${version}`);
  } catch (err) {
    await trace('apply:error', err instanceof Error ? err.message : String(err));
    throw err;
  }
}

/**
 * TEST-ONLY seam: stage a fake pending update (the real seam is a successful
 * checkForUpdate, which needs the Tauri runtime). The exported name stays
 * unmistakably not-for-production.
 */
export function __stagePendingForTest(p: PendingUpdate | null): void {
  pending = p;
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
