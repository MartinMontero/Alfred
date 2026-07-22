// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
/**
 * GoosePanel — drives an embedded goose agent over ACP (stdio) and renders the
 * session in a chat view + an xterm.js terminal. Desktop only.
 *
 * Provider selection reads the permitted roster from the compiled guard
 * (holmes-guard, ADR-0008); the UI never enforces anything. Every spawn goes
 * through the Rust guard's L1b resolution + L2 sanitized spawn, so an
 * excluded/unknown provider or model is refused before any process starts. The
 * goose child is killed on unmount.
 */
import { createSignal, Show, For, onCleanup, onMount, type Component } from 'solid-js';
import { platform } from '@platform';
import {
  startGooseSession,
  validateRecipe,
  runRecipe,
  scanRecipeFile,
  buildRecipePreview,
  guardPermittedProviders,
  selectAllowOption,
  DENY,
  type GooseSession,
  type GuardProviderInfo,
  type GuardCreds,
  type RecipeRun,
  type RecipePreview,
} from '../lib/goose';
import ActionPreview from './ActionPreview';
import { mapGooseConnectError, PROVIDER_DEFAULT_MODEL } from '../lib/goose/connect-errors';
import { invoke } from '@tauri-apps/api/core';
import { createSessionTap, type SessionTap } from '../lib/telemetry/session-tap';
import { generateTraceContext } from '../lib/telemetry/trace';
import type {
  SessionNotification,
  RequestPermissionRequest,
  RequestPermissionResponse,
} from '@agentclientprotocol/sdk';

interface GoosePanelProps {
  vaultPath: string | null;
  onClose: () => void;
  onOpenSettings: () => void;
  /** Ambient presence: reports live/idle to the shell status bar. */
  onPresenceChange?: (state: 'idle' | 'live') => void;
}

interface ChatMessage {
  role: 'user' | 'agent' | 'system';
  text: string;
}

// Display labels for the crate-permitted provider ids (the roster itself comes
// from the guard at runtime — this only prettifies the names it returns).
const PROVIDER_LABELS: Record<string, string> = {
  anthropic: 'Anthropic (Claude)',
  google: 'Google (Gemini)',
  deepseek: 'DeepSeek',
  qwen: 'Qwen',
  mistral: 'Mistral AI',
  ollama: 'Ollama (local)',
};

const GOOSE_KEY_SECRET = 'alfred:goose_api_key';

const GoosePanel: Component<GoosePanelProps> = (props) => {
  // The permitted roster is read from the compiled guard at mount — the UI
  // reads, never enforces (ADR-0008).
  const [providers, setProviders] = createSignal<GuardProviderInfo[]>([]);
  const [provider, setProvider] = createSignal('anthropic');
  const [model, setModel] = createSignal('claude-sonnet-4-6');
  const [apiKey, setApiKey] = createSignal('');
  const [connected, setConnectedRaw] = createSignal(false);
  // Single chokepoint so the shell's ambient presence can never disagree with
  // the panel's own status chip.
  const setConnected = (v: boolean) => {
    setConnectedRaw(v);
    props.onPresenceChange?.(v ? 'live' : 'idle');
  };
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [messages, setMessages] = createSignal<ChatMessage[]>([]);
  const [input, setInput] = createSignal('');
  const [recipePreview, setRecipePreview] = createSignal<{ preview: RecipePreview; recipePath: string } | null>(null);
  const [pendingPermission, setPendingPermission] = createSignal<{
    req: RequestPermissionRequest;
    resolve: (r: RequestPermissionResponse) => void;
  } | null>(null);
  // B5 startup-scan warnings (threat-model §5): excluded-vendor references found
  // in goose config — surfaced, never hidden, never silently rewritten.
  const [configWarnings, setConfigWarnings] = createSignal<string[]>([]);
  // Born-redacted latency/grounding guardrail (Phase 5 Step 5): count of
  // accuracy-risk turns (slow AND ungrounded) this session — a live nudge to
  // spot-check, never a block. Not persisted.
  const [riskTurns, setRiskTurns] = createSignal(0);

  let session: GooseSession | null = null;
  // Live telemetry tap — inert unless telemetry is opted in (no trace context).
  let tap: SessionTap | undefined;
  let recipeRun: RecipeRun | null = null;
  let termEl: HTMLDivElement | undefined;

  onMount(async () => {
    try {
      setProviders(await guardPermittedProviders());
    } catch {
      /* roster read failed — the picker falls back to its default entry */
    }
  });
  // xterm is loaded lazily so the web bundle never pulls it in.
  // biome-ignore lint/suspicious/noExplicitAny: xterm types are loaded dynamically
  let term: any = null;

  function append(role: ChatMessage['role'], text: string) {
    setMessages((m) => {
      const last = m[m.length - 1];
      // Coalesce consecutive agent chunks into one streamed message.
      if (last && last.role === role && role === 'agent') {
        return [...m.slice(0, -1), { role, text: last.text + text }];
      }
      return [...m, { role, text }];
    });
  }

  function termWrite(text: string) {
    if (term) term.write(text.replace(/\n/g, '\r\n'));
  }

  async function ensureTerminal() {
    if (term || !termEl) return;
    const [{ Terminal }, { FitAddon }] = await Promise.all([
      import('@xterm/xterm'),
      import('@xterm/addon-fit'),
    ]);
    term = new Terminal({ fontSize: 12, convertEol: true, disableStdin: true });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(termEl);
    fit.fit();
  }

  function onSessionUpdate(note: SessionNotification) {
    const u = note.update;
    switch (u.sessionUpdate) {
      case 'agent_message_chunk': {
        if (u.content.type === 'text') append('agent', u.content.text);
        break;
      }
      case 'agent_thought_chunk': {
        if (u.content.type === 'text') termWrite(`\x1b[90m${u.content.text}\x1b[0m`);
        break;
      }
      case 'tool_call':
        termWrite(`\x1b[36m• tool: ${u.title ?? u.toolCallId}\x1b[0m\n`);
        break;
      case 'tool_call_update':
        if (u.status) termWrite(`\x1b[36m  ${u.toolCallId}: ${u.status}\x1b[0m\n`);
        break;
      default:
        break;
    }
  }

  // Every permission request goose sends is answered by the human through the
  // ActionPreview ack surface — no Alfred-side auto-allow. ACP title/kind are
  // agent-authored and spoofable (docs/threat-model.md §3); reads normally never
  // reach here because goose's id-keyed always_allow short-circuits first.
  // Default-deny on no acknowledgement.
  function onRequestPermission(req: RequestPermissionRequest): Promise<RequestPermissionResponse> {
    return new Promise<RequestPermissionResponse>((resolve) => {
      // A previous pending request (if any) is denied before showing the new one.
      pendingPermission()?.resolve(DENY);
      setPendingPermission({ req, resolve });
    });
  }

  function resolvePermission(decision: RequestPermissionResponse) {
    const p = pendingPermission();
    if (!p) return;
    setPendingPermission(null);
    p.resolve(decision);
  }

  async function connect() {
    if (!props.vaultPath) {
      setError('Open a vault first.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await ensureTerminal();
      // Persist the key (secret store), then pass it to goose via env only.
      if (apiKey()) await platform.secrets.set(GOOSE_KEY_SECRET, apiKey());
      const key = apiKey() || (await platform.secrets.get(GOOSE_KEY_SECRET)) || undefined;

      const creds: GuardCreds = {
        provider: provider(),
        model: model(),
        apiKey: provider() === 'ollama' ? undefined : key,
        ollamaHost: provider() === 'ollama' ? 'http://localhost:11434' : undefined,
      };

      // Telemetry opt-in — the SAME setting the Rust writer gates on (load_settings).
      // On => mint a trace context (drives _meta injection) and arm the live emission
      // tap. Off => no trace context, an inert tap, no _meta: one switch, both doors.
      const telemetryOn = await invoke<{ telemetry_enabled?: boolean }>('load_settings')
        .then((s) => s?.telemetry_enabled === true)
        .catch(() => false);
      const traceContext = telemetryOn ? generateTraceContext() : undefined;
      // The single writer: every event goes to the telemetry_record command, which
      // re-gates on opt-in server-side. Errors are swallowed — telemetry never breaks
      // a session.
      tap = createSessionTap({
        traceContext,
        record: (event) => {
          void invoke('telemetry_record', { event }).catch(() => {});
        },
        onGuardrail: (g) => {
          if (g.signal === 'slow-ungrounded') setRiskTurns((n) => n + 1);
        },
      });

      session = await startGooseSession({
        creds,
        cwd: props.vaultPath,
        vaultPath: props.vaultPath,
        traceContext,
        otelEndpoint: undefined,
        handlers: {
          onSessionUpdate: (note) => {
            tap?.onSessionUpdate(note);
            onSessionUpdate(note);
          },
          onRequestPermission,
          onStderr: (t) => termWrite(t),
          onClosed: () => {
            setConnected(false);
            append('system', 'goose session closed.');
          },
        },
      });
      // B5 config-scan warnings from the guarded distribution — surface, never hide.
      setConfigWarnings(session.warnings);
      setConnected(true);
      append('system', `Connected to goose (${session.initialize.agentInfo?.name} ${session.initialize.agentInfo?.version}). The vault is registered as ground truth.`);
    } catch (e) {
      // F5: honest not-connected state — mapped reason + concrete setup path,
      // never a raw spawn/ACP string as the only signal.
      const f = mapGooseConnectError(e);
      setError(`${f.message} ${f.setupPath}`);
      setConnected(false);
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    const text = input().trim();
    if (!text || !session || busy()) return;
    setInput('');
    append('user', text);
    setBusy(true);
    tap?.startTurn();
    try {
      const res = await session.prompt(text);
      tap?.endTurn(res);
      if (res.stopReason && res.stopReason !== 'end_turn') {
        append('system', `(stopped: ${res.stopReason})`);
      }
    } catch (e) {
      tap?.failTurn(e);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  // Pre-flight: scan the recipe and show the action preview. No run happens here.
  async function previewVaultRecipe() {
    if (!props.vaultPath || busy()) return;
    setBusy(true);
    setError(null);
    try {
      const recipePath = `${props.vaultPath.replace(/\\/g, '/')}/goose-recipes/vault-summary.yaml`;
      const scan = await scanRecipeFile(recipePath);
      setRecipePreview({ preview: buildRecipePreview(scan), recipePath });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  // Runs only after the operator acknowledged the preview (and every warning).
  async function runPreviewedRecipe() {
    const pending = recipePreview();
    if (!pending || !props.vaultPath || busy()) return;
    setRecipePreview(null);
    setBusy(true);
    setError(null);
    try {
      const v = await validateRecipe({ provider: provider(), model: model() }, pending.recipePath);
      termWrite(`\x1b[33m$ goose recipe validate\x1b[0m\n${v.output}\n`);
      if (!v.valid) {
        setError('Recipe is invalid — see terminal.');
        return;
      }
      append('system', 'Running recipe: vault-summary (cleaned)');
      const pathRoot = await invoke<string>('guard_goose_paths');
      recipeRun = await runRecipe(pending.recipePath, {
        creds: {
          provider: provider(),
          model: model(),
          apiKey: provider() === 'ollama' ? undefined : apiKey() || undefined,
          ollamaHost: provider() === 'ollama' ? 'http://localhost:11434' : undefined,
        },
        cwd: props.vaultPath,
        pathRoot,
        acknowledged: true,
        onOutput: (t) => termWrite(t),
      });
      await recipeRun.done;
      recipeRun = null;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    pendingPermission()?.resolve(DENY); // never leave goose waiting
    setPendingPermission(null);
    await session?.kill();
    await recipeRun?.kill();
    session = null;
    recipeRun = null;
    setConnected(false);
  }

  onCleanup(() => {
    void disconnect();
    term?.dispose?.();
  });

  return (
    <div class="goose-panel" data-register="instrument">
      <div class="goose-panel__header">
        <strong class="goose-panel__title">Agent session</strong>
        <span class={`goose-panel__status ${connected() ? 'goose-panel__status--live' : ''}`}>
          {connected() ? 'connected' : 'not connected'}
        </span>
        <button class="icon-btn" title="Agent settings" aria-label="Agent settings" onClick={props.onOpenSettings}>⚙</button>
        <button class="icon-btn" title="Close the agent panel" aria-label="Close the agent panel" onClick={props.onClose}>✕</button>
      </div>

      <Show
        when={connected()}
        fallback={
          <div class="goose-panel__connect">
            <label>
              Provider
              <select
                value={provider()}
                onChange={(e) => {
                  const next = e.currentTarget.value;
                  setProvider(next);
                  // F5: keep provider and model coherent — switching provider
                  // resets the model to that provider's starting point.
                  setModel(PROVIDER_DEFAULT_MODEL[next] ?? '');
                }}
              >
                <For each={providers()}>
                  {(p) => <option value={p.id}>{PROVIDER_LABELS[p.id] ?? p.id}</option>}
                </For>
              </select>
            </label>
            <label>
              Model
              <input value={model()} onInput={(e) => setModel(e.currentTarget.value)} placeholder="model id" />
            </label>
            <Show when={provider() !== 'ollama'}>
              <label>
                API key (passed to goose via env, never stored in goose)
                <input type="password" value={apiKey()} onInput={(e) => setApiKey(e.currentTarget.value)} />
              </label>
            </Show>
            <button class="goose-panel__primary" disabled={busy()} onClick={connect}>
              {busy() ? 'Connecting…' : 'Connect goose'}
            </button>
            <small class="goose-panel__hint">Only non-excluded providers are offered (Meta/OpenAI/xAI are excluded).</small>
          </div>
        }
      >
        <div class="goose-panel__toolbar">
          <button disabled={busy()} onClick={previewVaultRecipe}>Preview & run vault-summary recipe</button>
          <button onClick={disconnect}>Disconnect</button>
        </div>
      </Show>

      <Show when={recipePreview()}>
        {(p) => (
          <div class="goose-panel__preview">
            <ActionPreview
              title="Recipe pre-flight: vault-summary"
              summary="Review the actions this recipe will take. Invisible characters are stripped; any warning must be acknowledged before it runs."
              actions={p().preview.actions}
              notices={p().preview.notices}
              warnings={p().preview.warnings}
              runLabel="Run cleaned recipe"
              onRun={runPreviewedRecipe}
              onCancel={() => setRecipePreview(null)}
            />
          </div>
        )}
      </Show>

      {/* Permission gate — an evidence pack, not a yes/no popup (Calm-HUD:
          "the butler asks before entering the room"). Every field below is
          real ACP data; the agent-authored parts are labeled as claims. */}
      <Show when={pendingPermission()}>
        {(p) => (
          <div class="gate-card" role="alertdialog" aria-label="Permission request">
            <div class="gate-card__header">
              <span class="gate-card__title">Permission requested</span>
              <span class="gate-card__lane">
                {p().req.toolCall?.kind === 'execute' ? 'runs a command' : 'can modify your vault'}
              </span>
            </div>
            <div class="gate-card__row">
              <span class="gate-card__key">action</span>
              <span class="gate-card__val">{p().req.toolCall?.title ?? 'tool call'}</span>
            </div>
            <Show when={p().req.toolCall?.kind}>
              <div class="gate-card__row">
                <span class="gate-card__key">kind</span>
                <span class="gate-card__val">{p().req.toolCall?.kind}</span>
              </div>
            </Show>
            <Show
              when={((): string | undefined => {
                try {
                  const ri = p().req.toolCall?.rawInput;
                  return ri ? JSON.stringify(ri, null, 0).slice(0, 400) : undefined;
                } catch {
                  return undefined;
                }
              })()}
            >
              {(input) => (
                <div class="gate-card__row">
                  <span class="gate-card__key">input</span>
                  <code class="gate-card__input">{input()}</code>
                </div>
              )}
            </Show>
            <div class="gate-card__row">
              <span class="gate-card__key">scope</span>
              <span class="gate-card__val">
                This one call only. Nothing else is granted; reads were already free.
              </span>
            </div>
            <p class="gate-card__caveat">
              The action name and input above are the agent's own description — treat them as a
              claim, not a fact.
            </p>
            <div class="gate-card__actions">
              <button
                class="gate-card__deny"
                onClick={() => resolvePermission(DENY)}
              >
                Deny
              </button>
              <button
                class="gate-card__approve"
                onClick={() => resolvePermission(selectAllowOption(p().req.options))}
              >
                Approve this call
              </button>
            </div>
          </div>
        )}
      </Show>

      <Show when={configWarnings().length > 0}>
        <div class="goose-panel__warnings">
          {configWarnings().map((w) => (
            <div>{w}</div>
          ))}
        </div>
      </Show>
      <Show when={riskTurns() > 0}>
        <div class="goose-panel__guardrail">
          {riskTurns()} turn{riskTurns() === 1 ? '' : 's'} this session answered slowly without consulting your vault — worth a spot-check.
        </div>
      </Show>
      <Show when={error()}>
        <div class="goose-panel__error">{error()}</div>
      </Show>

      <div class="goose-panel__messages">
        <Show when={!connected() && messages().length === 0 && !error()}>
          <div class="goose-panel__idle">
            No agent session yet. Connect goose above — read access is free; anything that
            writes or runs a command asks you first. Skills are locked for this beta while
            their security review finishes.
          </div>
        </Show>
        <For each={messages()}>
          {(m) => (
            <div class={`goose-msg goose-msg--${m.role}`}>
              <span class="goose-msg__role">{m.role}</span>
              {m.text}
            </div>
          )}
        </For>
      </div>

      <Show when={connected()}>
        <div class="goose-panel__input">
          <input
            class="goose-panel__input-field"
            value={input()}
            onInput={(e) => setInput(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder="Ask goose about your vault…"
            disabled={busy()}
          />
          <button disabled={busy()} onClick={() => void send()}>Send</button>
        </div>
      </Show>

      {/* xterm.js terminal — tool calls, recipe output, and stderr. F10: kept
          in the DOM for ref stability but collapsed until a session is live,
          so it can never render as a dead black rectangle. */}
      <div
        class="goose-panel__terminal"
        classList={{ 'goose-panel__terminal--idle': !connected() }}
        ref={termEl}
      />
    </div>
  );
};

export default GoosePanel;
