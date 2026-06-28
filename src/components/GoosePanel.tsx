// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
/**
 * GoosePanel — drives an embedded goose agent over ACP (stdio) and renders the
 * session in a chat view + an xterm.js terminal. Desktop only.
 *
 * Provider selection is filtered through Alfred's vendor-identity denylist, so the
 * UI never offers Meta/OpenAI/xAI; the lockdown is also enforced at spawn time
 * (buildGooseEnv throws for an excluded provider/model). The goose child is killed
 * on unmount.
 */
import { createSignal, Show, For, onCleanup, type Component } from 'solid-js';
import { platform } from '@platform';
import {
  startGooseSession,
  prepareGooseDistribution,
  validateRecipe,
  runRecipe,
  scanRecipeFile,
  buildRecipePreview,
  filterGooseProviderOptions,
  classifyToolCall,
  selectAllowOption,
  DENY,
  type GooseSession,
  type GooseProviderOption,
  type GooseProviderCreds,
  type RecipeRun,
  type RecipePreview,
} from '../lib/goose';
import ActionPreview from './ActionPreview';
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
}

interface ChatMessage {
  role: 'user' | 'agent' | 'system';
  text: string;
}

// A curated set of permitted providers. Passed through the denylist defensively —
// a no-op for these, but it proves the UI chokepoint and would drop any excluded id.
const PERMITTED_PROVIDERS: GooseProviderOption[] = filterGooseProviderOptions([
  { value: 'anthropic', name: 'Anthropic (Claude)' },
  { value: 'google', name: 'Google (Gemini)' },
  { value: 'ollama', name: 'Ollama (local)' },
  { value: 'openrouter', name: 'OpenRouter (open models)' },
  { value: 'mistral', name: 'Mistral AI' },
]);

const GOOSE_KEY_SECRET = 'alfred:goose_api_key';

const GoosePanel: Component<GoosePanelProps> = (props) => {
  const [provider, setProvider] = createSignal('anthropic');
  const [model, setModel] = createSignal('claude-sonnet-4-6');
  const [apiKey, setApiKey] = createSignal('');
  const [connected, setConnected] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [messages, setMessages] = createSignal<ChatMessage[]>([]);
  const [input, setInput] = createSignal('');
  const [recipePreview, setRecipePreview] = createSignal<{ preview: RecipePreview; recipePath: string } | null>(null);
  const [pendingPermission, setPendingPermission] = createSignal<{
    req: RequestPermissionRequest;
    resolve: (r: RequestPermissionResponse) => void;
  } | null>(null);

  let session: GooseSession | null = null;
  // Live telemetry tap — inert unless telemetry is opted in (no trace context).
  let tap: SessionTap | undefined;
  let recipeRun: RecipeRun | null = null;
  let termEl: HTMLDivElement | undefined;
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

  // Deterministic gate: read-only vault tools auto-allow; every write/shell/unknown
  // routes through the ActionPreview ack surface. Default-deny on no acknowledgement.
  function onRequestPermission(req: RequestPermissionRequest): Promise<RequestPermissionResponse> {
    if (classifyToolCall(req.toolCall) === 'auto-allow') {
      return Promise.resolve(selectAllowOption(req.options));
    }
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

      const creds: GooseProviderCreds = {
        provider: provider(),
        model: model(),
        apiKey: provider() === 'ollama' ? undefined : key,
        ollamaHost: provider() === 'ollama' ? 'http://localhost:11434' : undefined,
      };

      // Write Alfred's isolated, locked-down goose distribution (config + env).
      const dist = await prepareGooseDistribution({ creds, vaultPath: props.vaultPath });

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
      });

      session = await startGooseSession({
        creds,
        cwd: props.vaultPath,
        pathRoot: dist.pathRoot,
        traceContext,
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
      setConnected(true);
      append('system', `Connected to goose (${session.initialize.agentInfo?.name} ${session.initialize.agentInfo?.version}). The vault is registered as ground truth.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
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
      const v = await validateRecipe(pending.recipePath);
      termWrite(`\x1b[33m$ goose recipe validate\x1b[0m\n${v.output}\n`);
      if (!v.valid) {
        setError('Recipe is invalid — see terminal.');
        return;
      }
      append('system', 'Running recipe: vault-summary (cleaned)');
      recipeRun = await runRecipe(pending.recipePath, {
        creds: { provider: provider(), model: model(), apiKey: apiKey() || undefined },
        cwd: props.vaultPath,
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
    <div class="goose-panel" style={{ display: 'flex', 'flex-direction': 'column', height: '100%' }}>
      <div class="goose-panel__header" style={{ display: 'flex', 'align-items': 'center', gap: '8px', padding: '8px' }}>
        <strong style={{ 'flex-grow': 1 }}>goose</strong>
        <button class="icon-btn" title="Settings" onClick={props.onOpenSettings}>⚙</button>
        <button class="icon-btn" title="Close" onClick={props.onClose}>✕</button>
      </div>

      <Show
        when={connected()}
        fallback={
          <div class="goose-panel__connect" style={{ padding: '8px', display: 'flex', 'flex-direction': 'column', gap: '6px' }}>
            <label>
              Provider
              <select value={provider()} onChange={(e) => setProvider(e.currentTarget.value)}>
                <For each={PERMITTED_PROVIDERS}>{(p) => <option value={p.value}>{p.name}</option>}</For>
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
            <button disabled={busy()} onClick={connect}>{busy() ? 'Connecting…' : 'Connect goose'}</button>
            <small>Only non-excluded providers are offered (Meta/OpenAI/xAI are excluded).</small>
          </div>
        }
      >
        <div class="goose-panel__toolbar" style={{ display: 'flex', gap: '6px', padding: '4px 8px' }}>
          <button disabled={busy()} onClick={previewVaultRecipe}>Preview & run vault-summary recipe</button>
          <button onClick={disconnect}>Disconnect</button>
        </div>
      </Show>

      <Show when={recipePreview()}>
        {(p) => (
          <div style={{ padding: '0 8px' }}>
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

      <Show when={pendingPermission()}>
        {(p) => (
          <div style={{ padding: '0 8px' }}>
            <ActionPreview
              title="Approve tool call"
              summary="goose wants to run a tool that can modify your vault or run a command. Approve to allow this one call; cancel to deny."
              actions={[{ label: p().req.toolCall?.title ?? 'tool call', detail: p().req.toolCall?.kind ?? undefined }]}
              warnings={[
                {
                  id: p().req.toolCall?.toolCallId ?? 'tool',
                  label: `Run: ${p().req.toolCall?.title ?? 'tool'}`,
                  detail: ((): string | undefined => {
                    try {
                      const ri = p().req.toolCall?.rawInput;
                      return ri ? JSON.stringify(ri).slice(0, 200) : undefined;
                    } catch {
                      return undefined;
                    }
                  })(),
                },
              ]}
              runLabel="Approve"
              onRun={() => resolvePermission(selectAllowOption(p().req.options))}
              onCancel={() => resolvePermission(DENY)}
            />
          </div>
        )}
      </Show>

      <Show when={error()}>
        <div class="goose-panel__error" style={{ color: 'var(--error, #c00)', padding: '4px 8px' }}>{error()}</div>
      </Show>

      <div class="goose-panel__messages" style={{ 'flex-grow': 1, overflow: 'auto', padding: '8px' }}>
        <For each={messages()}>
          {(m) => (
            <div class={`goose-msg goose-msg--${m.role}`} style={{ margin: '4px 0', 'white-space': 'pre-wrap' }}>
              <span style={{ opacity: 0.6 }}>{m.role}: </span>
              {m.text}
            </div>
          )}
        </For>
      </div>

      <Show when={connected()}>
        <div class="goose-panel__input" style={{ display: 'flex', gap: '6px', padding: '8px' }}>
          <input
            style={{ 'flex-grow': 1 }}
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

      {/* xterm.js terminal — tool calls, recipe output, and stderr. */}
      <div class="goose-panel__terminal" ref={termEl} style={{ height: '180px', background: '#000', overflow: 'hidden' }} />
    </div>
  );
};

export default GoosePanel;
