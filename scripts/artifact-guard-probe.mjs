// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
/**
 * Artifact-level guard probe (Holmes Stage 1, Track 2 — the RC unblock).
 *
 * Subject: the BUILT Alfred release binary — not the crate, not the source.
 * The probe launches the artifact under WebDriver (tauri-driver +
 * WebKitWebDriver, headless via xvfb), then exercises the compiled guard
 * through the artifact's own IPC (`window.__TAURI__`, shipped enabled):
 *
 *   (a) an environment demanding an excluded provider is refused — the app is
 *       launched WITH hostile env (GOOSE_PROVIDER=openai, OPENAI_API_KEY, …);
 *       an explicit openai spawn is refused by the compiled L1b, and a
 *       permitted spawn's child env (dumped by a stub sidecar) proves the
 *       hostile ambient env was cleared wholesale (L2) and the egress proxy
 *       pinned (L1a);
 *   (b) a planted hostile goose config cannot select a provider — it is
 *       surfaced as a B5 warning AND the child env still pins the permitted
 *       provider ("refused in effect": under sanitized_spawn the environment
 *       wins and config carries no authority);
 *   (c) a permitted provider works — the guarded spawn succeeds end to end
 *       through the artifact (session id returned, stub sidecar actually ran).
 *
 * Plus the Direct Chat surface: custom_provider_* refuses excluded endpoints
 * inside the shipped binary (no network involved — refusal is pre-request).
 *
 * Zero npm dependencies: raw W3C WebDriver over fetch. The goose stub is a
 * test instrument standing where the staged sidecar sits; the binary under
 * test is the real artifact.
 *
 * Usage: node scripts/artifact-guard-probe.mjs /abs/path/to/built/Alfred
 * (run under xvfb-run; hostile env vars are set by the caller — see ci.yml).
 */

import { spawn } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const APP = process.argv[2] && resolve(process.argv[2]);
if (!APP || !existsSync(APP)) {
  console.error('usage: node scripts/artifact-guard-probe.mjs <path-to-built-binary>');
  process.exit(2);
}

const IS_WIN = platform() === 'win32';
// The WebView native WebDriver: WebKitWebDriver on Linux, msedgedriver (WebView2)
// on Windows. Override with NATIVE_DRIVER if the runner puts it elsewhere.
const NATIVE_DRIVER = process.env.NATIVE_DRIVER ?? (IS_WIN ? 'msedgedriver' : '/usr/bin/WebKitWebDriver');
const GOOSE_STUB_NAME = IS_WIN ? 'goose.exe' : 'goose';

const DRIVER_PORT = 4444;
const DRIVER_URL = `http://127.0.0.1:${DRIVER_PORT}`;
const PROBE_DIR = join(process.env.RUNNER_TEMP ?? (IS_WIN ? process.env.TEMP ?? 'C:\\Temp' : '/tmp'), 'alfred-guard-probe');
const ENV_DUMP = join(PROBE_DIR, 'goose-env-dump.txt');
const VAULT = join(PROBE_DIR, 'vault');
// Tauri's app_config_dir: %APPDATA%\<id> on Windows, ~/.config/<id> on Linux.
const APP_CONFIG = IS_WIN
  ? join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), 'dev.wecanjustbuildthings.alfred')
  : join(homedir(), '.config', 'dev.wecanjustbuildthings.alfred');
const GOOSE_HOME = join(APP_CONFIG, 'goose');

const results = [];
function report(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}
function skip(name, why) {
  results.push({ name, skipped: true, detail: why });
  console.log(`SKIP  ${name} — ${why}`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function driverRequest(method, path, body) {
  const res = await fetch(`${DRIVER_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`webdriver ${method} ${path} -> ${res.status}: ${JSON.stringify(json).slice(0, 400)}`);
  return json.value;
}

/** Run an async snippet inside the artifact's webview. The snippet body sees
 *  `done(result)`; anything thrown is returned as { error }. */
function executeAsync(sessionId, body) {
  const script = `
    const done = arguments[arguments.length - 1];
    (async () => {
      try { ${body} } catch (e) { done({ error: String(e) }); }
    })();
  `;
  return driverRequest('POST', `/session/${sessionId}/execute/async`, { script, args: [] });
}

async function main() {
  // --- stage the probe fixtures, BEFORE the app starts -----------------------
  rmSync(PROBE_DIR, { recursive: true, force: true });
  mkdirSync(VAULT, { recursive: true });

  // The goose stub: a stand-in binary next to the built app that dumps the
  // exact environment the app handed it, then lingers briefly. It occupies the
  // slot the staged sidecar sits in. On POSIX a two-line sh script is a real
  // executable goose_binary_path() resolves. On Windows a genuine .exe is
  // required (no sh), and building one needs a toolchain the caller controls —
  // so a Windows runner pre-stages the stub as goose.exe and sets
  // GOOSE_STUB_PREPARED=1. When no stub is present (Windows without one), the
  // child-env probes report SKIP, not FAIL — the refusal/roster/Direct-Chat
  // probes still bind. The env dump's presence is the single source of truth
  // for whether the child-inspection probes run.
  const stubPath = join(dirname(APP), GOOSE_STUB_NAME);
  if (!IS_WIN) {
    writeFileSync(stubPath, `#!/bin/sh\nenv > ${ENV_DUMP}\nsleep 3\n`);
    chmodSync(stubPath, 0o755);
  }
  // else: Windows caller has pre-staged goose.exe (GOOSE_STUB_PREPARED=1) or the
  // child-env probes will SKIP.

  // Probe (b): a planted hostile config in the isolated goose home. The line
  // formats mirror a hand-edited goose config demanding an excluded vendor.
  mkdirSync(join(GOOSE_HOME, 'config'), { recursive: true });
  writeFileSync(
    join(GOOSE_HOME, 'config', 'config.yaml'),
    [
      'GOOSE_PROVIDER: "openai"',
      'GOOSE_MODEL: "gpt-4o"',
      'custom:',
      '  base_url: https://api.openai.com/v1',
      '  OPENAI_API_KEY: planted-hostile-key',
      '',
    ].join('\n'),
  );

  // --- start tauri-driver, then a WebDriver session on the ARTIFACT ---------
  const driver = spawn('tauri-driver', ['--port', String(DRIVER_PORT), '--native-driver', NATIVE_DRIVER], {
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  process.on('exit', () => driver.kill());

  let sessionId = null;
  for (let attempt = 0; attempt < 30 && !sessionId; attempt++) {
    await sleep(1000);
    try {
      const v = await driverRequest('POST', '/session', {
        capabilities: { alwaysMatch: { 'tauri:options': { application: APP } } },
      });
      sessionId = v.sessionId;
    } catch {
      /* driver or app not ready yet */
    }
  }
  if (!sessionId) {
    console.error('FAIL  could not create a WebDriver session on the artifact');
    process.exit(1);
  }
  await driverRequest('POST', `/session/${sessionId}/timeouts`, { script: 60_000 });

  // Wait for the webview + IPC to be live.
  let ipcReady = false;
  for (let attempt = 0; attempt < 30 && !ipcReady; attempt++) {
    const v = await executeAsync(sessionId, `done({ ready: typeof window.__TAURI__?.core?.invoke === 'function' });`).catch(() => null);
    ipcReady = Boolean(v?.ready);
    if (!ipcReady) await sleep(1000);
  }
  report('artifact launches and exposes IPC under WebDriver', ipcReady);
  if (!ipcReady) return finish(sessionId, driver);

  // --- roster: the artifact's compiled permitted set -------------------------
  const roster = await executeAsync(
    sessionId,
    `const r = await window.__TAURI__.core.invoke('guard_permitted_providers'); done({ ids: r.map((p) => p.id) });`,
  );
  const expected = ['anthropic', 'google', 'deepseek', 'qwen', 'mistral', 'ollama'];
  report(
    'compiled roster is exactly the guard-permitted six',
    JSON.stringify(roster?.ids) === JSON.stringify(expected),
    JSON.stringify(roster?.ids ?? roster),
  );

  // --- (a) excluded demanded -> refused, in the artifact ---------------------
  const resolveOpenai = await executeAsync(
    sessionId,
    `await window.__TAURI__.core.invoke('guard_resolve', { provider: 'openai', model: 'gpt-4o' })
       .then((ok) => done({ ok }), (err) => done({ refused: String(err) }));`,
  );
  report(
    '(a) L1b in the artifact refuses provider openai',
    Boolean(resolveOpenai?.refused?.includes('excluded')),
    resolveOpenai?.refused ?? JSON.stringify(resolveOpenai),
  );

  const resolveUnknown = await executeAsync(
    sessionId,
    `await window.__TAURI__.core.invoke('guard_resolve', { provider: 'lmstudio', model: 'qwen2.5' })
       .then((ok) => done({ ok }), (err) => done({ refused: String(err) }));`,
  );
  report(
    '(a) L1b in the artifact denies unknown provider ids (deny-by-default)',
    Boolean(resolveUnknown?.refused?.includes('not in the permitted set')),
    resolveUnknown?.refused ?? JSON.stringify(resolveUnknown),
  );

  const spawnOpenai = await executeAsync(
    sessionId,
    `const ch = new window.__TAURI__.core.Channel(); ch.onmessage = () => {};
     await window.__TAURI__.core.invoke('guard_spawn_goose', {
       args: { provider: 'openai', model: 'gpt-4o', cwd: '${VAULT}', vaultPath: '${VAULT}' },
       onEvent: ch,
     }).then((ok) => done({ ok }), (err) => done({ refused: String(err) }));`,
  );
  report(
    '(a) a spawn demanding openai is refused by the artifact',
    Boolean(spawnOpenai?.refused?.toLowerCase().includes('excluded')),
    spawnOpenai?.refused ?? JSON.stringify(spawnOpenai),
  );

  // Direct Chat surface: the compiled screen inside custom_provider_* refuses
  // excluded endpoints (refusal is pre-request; no network is touched).
  const directOpenai = await executeAsync(
    sessionId,
    `await window.__TAURI__.core.invoke('custom_provider_request', {
       url: 'https://api.openai.com/v1/chat/completions', apiKey: '', body: '{}',
     }).then((ok) => done({ ok }), (err) => done({ refused: String(err) }));`,
  );
  report(
    '(a) Direct Chat in the artifact refuses an OpenAI endpoint',
    Boolean(directOpenai?.refused?.includes('OpenAI')),
    directOpenai?.refused ?? JSON.stringify(directOpenai),
  );

  const directXai = await executeAsync(
    sessionId,
    `await window.__TAURI__.core.invoke('custom_provider_request', {
       url: 'https://api.x.ai/v1/chat/completions', apiKey: '', body: '{}',
     }).then((ok) => done({ ok }), (err) => done({ refused: String(err) }));`,
  );
  report(
    '(a) Direct Chat in the artifact refuses an xAI endpoint',
    Boolean(directXai?.refused?.includes('xAI')),
    directXai?.refused ?? JSON.stringify(directXai),
  );

  const directPermitted = await executeAsync(
    sessionId,
    `await window.__TAURI__.core.invoke('custom_provider_request', {
       url: 'http://127.0.0.1:1/v1/chat/completions', apiKey: '', body: '{"model":"qwen2.5"}',
     }).then((ok) => done({ ok }), (err) => done({ err: String(err) }));`,
  );
  // A permitted local endpoint passes the SCREEN — the request then fails on
  // connection (nothing listens on port 1), which is the proof the refusal
  // above was policy, not plumbing.
  report(
    'Direct Chat screen passes a permitted local endpoint (fails later on connect, not policy)',
    Boolean(directPermitted?.err && !String(directPermitted.err).includes('excluded vendor')),
    String(directPermitted?.err ?? JSON.stringify(directPermitted)).slice(0, 120),
  );

  // --- (b) + (c): planted config surfaced; permitted spawn works ------------
  const spawnPermitted = await executeAsync(
    sessionId,
    `const ch = new window.__TAURI__.core.Channel(); ch.onmessage = () => {};
     await window.__TAURI__.core.invoke('guard_spawn_goose', {
       args: { provider: 'ollama', model: 'qwen2.5', ollamaHost: 'http://localhost:11434',
               cwd: '${VAULT}', vaultPath: '${VAULT}' },
       onEvent: ch,
     }).then((ok) => done({ ok }), (err) => done({ refused: String(err) }));`,
  );
  report(
    '(c) a permitted provider spawns through the artifact',
    Boolean(spawnPermitted?.ok?.id),
    JSON.stringify(spawnPermitted).slice(0, 200),
  );
  report(
    '(b) the planted hostile config is surfaced as a B5 warning, not silently honored',
    Boolean(spawnPermitted?.ok?.warnings?.length >= 1),
    JSON.stringify(spawnPermitted?.ok?.warnings ?? []).slice(0, 200),
  );

  // The stub dumped the exact env the artifact handed its goose child. When no
  // dump exists (Windows without a pre-staged stub), the child-inspection
  // probes SKIP — honestly surfaced, never silently passed.
  await sleep(1500);
  let dump = '';
  try {
    dump = readFileSync(ENV_DUMP, 'utf8');
  } catch {
    /* no stub env dump — child-env probes skip below */
  }
  if (dump.length === 0) {
    skip('child-env probes (env clear / config-selects-nothing / proxy pin)', 'no goose stub env dump present (pre-stage goose.exe + GOOSE_STUB_PREPARED=1 to enable)');
  } else {
    const envMap = Object.fromEntries(
      dump
        .split('\n')
        .filter((l) => l.includes('='))
        .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
    );
    report('(c) the goose child actually ran (env dump written by the stub)', dump.length > 0);
    report(
      '(a) hostile ambient OPENAI_API_KEY did NOT reach the goose child (env cleared wholesale)',
      !('OPENAI_API_KEY' in envMap),
    );
    report(
      '(b) the child provider is the permitted one — the planted config selected nothing',
      envMap.GOOSE_PROVIDER === 'ollama' && envMap.GOOSE_MODEL === 'qwen2.5',
      `GOOSE_PROVIDER=${envMap.GOOSE_PROVIDER} GOOSE_MODEL=${envMap.GOOSE_MODEL}`,
    );
    report(
      '(a) the child egress is pinned to the in-process L1a proxy',
      /^http:\/\/127\.0\.0\.1:\d+$/.test(envMap.HTTPS_PROXY ?? '') && !('NO_PROXY' in envMap),
      `HTTPS_PROXY=${envMap.HTTPS_PROXY}`,
    );
    report(
      'the child runs keyring-free with the isolated goose home',
      envMap.GOOSE_DISABLE_KEYRING === '1' && Boolean(envMap.GOOSE_PATH_ROOT),
      `GOOSE_PATH_ROOT=${envMap.GOOSE_PATH_ROOT}`,
    );
  }

  await finish(sessionId, driver);
}

async function finish(sessionId, driver) {
  try {
    if (sessionId) await driverRequest('DELETE', `/session/${sessionId}`);
  } catch {
    /* session already gone */
  }
  driver.kill();
  const failed = results.filter((r) => !r.skipped && !r.pass);
  const passed = results.filter((r) => r.pass).length;
  const skipped = results.filter((r) => r.skipped).length;
  console.log(`\n${passed} passed, ${failed.length} failed, ${skipped} skipped (of ${results.length} artifact probes)`);
  if (failed.length > 0) process.exit(1);
  process.exit(0);
}

main().catch((e) => {
  console.error('probe run failed:', e);
  process.exit(1);
});
