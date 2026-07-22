// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
//! Agentic guard seam (ADR-0008): holmes-guard is the single source of truth
//! for every goose spawn.
//!
//! - **L1b** (`holmes_guard::resolution::resolve`) answers which provider/model
//!   pair may drive goose — deny-by-default, excluded AND unknown ids refused.
//! - **L2** (`holmes_guard::spawn::sanitized_spawn`) builds every goose
//!   command: wholesale `env_clear`, explicit rebuild, provider/model injected
//!   only after resolution, one BYOK credential validated per provider.
//! - **L1a** (`holmes_guard::proxy::EgressProxy`) runs in-process; the child's
//!   HTTP(S)_PROXY is pinned to it by the crate, NO_PROXY is cleared.
//!
//! The UI *reads* the permitted roster from here ([`guard_permitted_providers`])
//! and never enforces anything itself. The `acp` session uses the crate-built
//! Command verbatim; recipe invocations rebuild the Command with the same
//! binary and the same sanitized env, differing only in args (recorded in
//! ADR-0008 — `sanitized_spawn` hardcodes `acp`).
//!
//! Alfred adds exactly three classes of env on top of the sanitized map, none
//! provider-selecting (checked against `policy::PROVIDER_SELECTING_ENV_VARS`
//! by [`ensure_not_provider_selecting`] and a regression test):
//! `GOOSE_PATH_ROOT` (goose-native isolation — the crate's HOME/XDG pointers
//! do not move goose's config discovery on Windows), telemetry-off pins, and
//! caller extras (refused outright if provider-selecting).

use holmes_guard::policy;
use holmes_guard::proxy::{EgressProxy, ProxyConfig};
use holmes_guard::resolution;
use holmes_guard::spawn::{sanitized_spawn, CredentialVar, SpawnSpec};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap};
use std::io::Read;
use std::io::Write as _;
use std::net::SocketAddr;
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Arc;
use tauri::ipc::Channel;
use tauri::Manager;

// --- state -------------------------------------------------------------------

struct GooseChild {
    child: Child,
    stdin: Option<ChildStdin>,
}

type ChildMap = Arc<Mutex<HashMap<u32, GooseChild>>>;

#[derive(Default)]
pub struct GuardState {
    proxy: Mutex<Option<EgressProxy>>,
    children: ChildMap,
    next_id: AtomicU32,
}

impl GuardState {
    /// The L1a egress proxy, spawned lazily once per app run. An ambient
    /// HTTPS_PROXY (containerized/dev environments) is honored as *transport*
    /// only — the allowlist decision is the crate's, made before any upstream
    /// byte.
    fn proxy_addr(&self) -> Result<SocketAddr, String> {
        let mut slot = self.proxy.lock();
        if let Some(p) = slot.as_ref() {
            return Ok(p.addr());
        }
        let upstream = std::env::var("HTTPS_PROXY")
            .or_else(|_| std::env::var("https_proxy"))
            .ok()
            .and_then(|u| {
                let rest = u.split_once("://").map(|(_, r)| r).unwrap_or(&u);
                let hostport = rest.split(['/', '?', '#']).next().unwrap_or("");
                if hostport.is_empty() {
                    None
                } else {
                    Some(hostport.to_string())
                }
            });
        let proxy = EgressProxy::spawn(ProxyConfig { upstream })
            .map_err(|e| format!("failed to start the egress guard proxy: {e}"))?;
        let addr = proxy.addr();
        *slot = Some(proxy);
        Ok(addr)
    }
}

// --- events over the IPC channel ----------------------------------------------

#[derive(Clone, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum GooseIoEvent {
    Stdout { data: Vec<u8> },
    Stderr { data: Vec<u8> },
    Closed { code: Option<i32> },
}

// --- roster (the UI reads, never enforces) -------------------------------------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderInfo {
    pub id: String,
    pub model_families: Vec<String>,
    /// The one credential/endpoint env var the BYOK seam accepts, if any.
    pub credential_env: Option<String>,
    /// True when the credential is an API key (vs. a host like OLLAMA_HOST).
    pub needs_api_key: bool,
}

#[tauri::command]
pub fn guard_permitted_providers() -> Vec<ProviderInfo> {
    holmes_core::provider::PERMITTED_PROVIDERS
        .iter()
        .map(|&id| {
            let model_families = holmes_core::provider::PERMITTED_MODEL_FAMILIES
                .iter()
                .find(|(p, _)| *p == id)
                .map(|(_, fams)| fams.iter().map(|f| f.to_string()).collect())
                .unwrap_or_default();
            let credential_env = holmes_core::provider::PROVIDER_CREDENTIAL_KEYS
                .iter()
                .find(|(p, _)| *p == id)
                .and_then(|(_, keys)| keys.first())
                .map(|k| k.to_string());
            let needs_api_key = credential_env
                .as_deref()
                .is_some_and(|k| k.ends_with("_API_KEY"));
            ProviderInfo {
                id: id.to_string(),
                model_families,
                credential_env,
                needs_api_key,
            }
        })
        .collect()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedDto {
    pub provider: String,
    pub model: String,
}

/// L1b pre-flight for the UI: same resolution the spawn applies, so a denial
/// surfaces before any process is built.
#[tauri::command]
pub fn guard_resolve(provider: String, model: String) -> Result<ResolvedDto, String> {
    resolution::resolve(&provider, &model)
        .map(|r| ResolvedDto {
            provider: r.provider,
            model: r.model,
        })
        .map_err(|d| d.to_string())
}

// --- config generation + B5 scan (compiled; crate-primitive based) -------------

/// One excluded-vendor hit found while scanning goose config text (B5,
/// threat-model §5). Warn-only by design: under `sanitized_spawn` a config
/// cannot select a provider at all (the environment wins and is rebuilt from
/// scratch), so this scan is advisory hygiene — surfaced, never hidden.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigScanFinding {
    /// 1-indexed line number in the scanned text.
    pub line: usize,
    /// Trimmed line content (bounded) for display — never logged elsewhere.
    pub excerpt: String,
}

/// Scan config text for excluded-vendor signals using crate primitives only
/// (`policy::model_family_excluded` tokenization: openai/xai/gpt/grok/llama
/// families and o-series tokens; `ollama` carved out). Documented residual: a
/// bare excluded HOST with no other signal (e.g. `api.x.ai`) does not
/// tokenize to an excluded family and is not flagged — pinned by test.
pub fn scan_config_text(text: &str) -> Vec<ConfigScanFinding> {
    text.lines()
        .enumerate()
        .filter(|(_, line)| policy::model_family_excluded(line))
        .map(|(i, line)| ConfigScanFinding {
            line: i + 1,
            excerpt: line.trim().chars().take(160).collect(),
        })
        .collect()
}

fn q(s: &str) -> String {
    serde_json::to_string(s).unwrap_or_else(|_| format!("\"{s}\""))
}

/// Build the Alfred custom-distribution `config.yaml` (written under the
/// isolated goose root). Preconfigures only the L1b-resolved provider/model
/// and registers the Alfred vault MCP server as a `type: stdio` extension.
/// Refuses to emit a config for a denied provider/model. Emitted by hand (no
/// YAML dependency); values are JSON-quoted, which is valid YAML.
pub fn build_config_yaml(
    provider: &str,
    model: &str,
    vault_path: &str,
    mcp_command: Option<&str>,
    mcp_args: Option<&[String]>,
    builtins: &[String],
) -> Result<String, String> {
    let resolved = resolution::resolve(provider, model).map_err(|d| d.to_string())?;
    let cmd = mcp_command.unwrap_or("npx");
    let vault_fwd = vault_path.replace('\\', "/");
    let default_args = vec![
        "tsx".to_string(),
        format!("{vault_fwd}/mcp/run.ts"),
        vault_path.to_string(),
    ];
    let args: Vec<String> = mcp_args.map(<[String]>::to_vec).unwrap_or(default_args);

    let mut lines: Vec<String> = vec![
        "# Alfred custom goose distribution — only guard-permitted providers are configured."
            .to_string(),
        "# Generated by Alfred; do not edit by hand. Keys are passed via env, never stored here."
            .to_string(),
        format!("GOOSE_PROVIDER: {}", q(&resolved.provider)),
        format!("GOOSE_MODEL: {}", q(&resolved.model)),
        "extensions:".to_string(),
        "  alfred-vault:".to_string(),
        "    type: stdio".to_string(),
        format!("    cmd: {}", q(cmd)),
        "    args:".to_string(),
    ];
    lines.extend(args.iter().map(|a| format!("      - {}", q(a))));
    lines.extend([
        "    enabled: true".to_string(),
        "    timeout: 300".to_string(),
    ]);
    for name in builtins {
        lines.extend([
            format!("  {name}:"),
            "    type: builtin".to_string(),
            format!("    name: {}", q(name)),
            "    enabled: true".to_string(),
            "    timeout: 300".to_string(),
        ]);
    }
    Ok(format!("{}\n", lines.join("\n")))
}

/// Phase-3 read-only vault tools — safe to run without a prompt. Keep in sync
/// with `src/lib/goose/tool-gate.ts` (the TS copy drives UI hints only; this
/// copy is what goose actually reads).
const VAULT_READ_TOOLS: &[&str] = &[
    "vault_search",
    "vault_read",
    "frontmatter_get",
    "memory_bank_read",
    "hot_read",
    "spec_read",
];
const VAULT_WRITE_TOOLS: &[&str] = &[
    "vault_append",
    "vault_patch",
    "vault_write",
    "frontmatter_set",
    "memory_bank_update",
];
const GOOSE_SHELL_TOOL: &str = "developer__shell";
const ALFRED_VAULT_EXTENSION: &str = "alfred-vault";

/// Curated permission.yaml: always_allow the read-only vault tools, ask before
/// every write and the shell surface. goose deserializes THREE required lists —
/// omitting any one panics goose at startup ("Corrupted permission config"),
/// so `never_allow` ships empty rather than absent.
pub fn build_permission_yaml() -> String {
    let ns = |t: &str| format!("{ALFRED_VAULT_EXTENSION}__{t}");
    let mut lines: Vec<String> = vec!["user:".to_string(), "  always_allow:".to_string()];
    lines.extend(VAULT_READ_TOOLS.iter().map(|t| format!("    - {}", q(&ns(t)))));
    lines.push("  ask_before:".to_string());
    lines.extend(VAULT_WRITE_TOOLS.iter().map(|t| format!("    - {}", q(&ns(t)))));
    lines.push(format!("    - {}", q(GOOSE_SHELL_TOOL)));
    lines.push("  never_allow: []".to_string());
    format!("{}\n", lines.join("\n"))
}

pub struct PreparedDistribution {
    pub warnings: Vec<String>,
}

/// Write Alfred's isolated goose distribution under `isolated_home` and return
/// the B5 warnings. Never touches the user's shared goose config.
pub fn prepare_distribution(
    isolated_home: &Path,
    provider: &str,
    model: &str,
    vault_path: &str,
    mcp_command: Option<&str>,
    mcp_args: Option<&[String]>,
    builtins: &[String],
) -> Result<PreparedDistribution, String> {
    let config_dir = isolated_home.join("config");
    std::fs::create_dir_all(&config_dir)
        .map_err(|e| format!("failed to create the isolated goose config dir: {e}"))?;
    let config_path = config_dir.join("config.yaml");

    let mut warnings = Vec::new();
    if config_path.exists() {
        let previous = std::fs::read_to_string(&config_path).unwrap_or_default();
        for f in scan_config_text(&previous) {
            warnings.push(format!(
                "Existing goose config line {} references an excluded vendor: \"{}\". Alfred regenerates this file each session; the entry was NOT carried over.",
                f.line, f.excerpt
            ));
        }
    }

    let yaml = build_config_yaml(provider, model, vault_path, mcp_command, mcp_args, builtins)?;
    // Writer-regression tripwire: Alfred's own output must never carry an
    // excluded-vendor signal (an mcpCommand/arg override could smuggle one in).
    for f in scan_config_text(&yaml) {
        warnings.push(format!(
            "Generated goose config line {} references an excluded vendor: \"{}\". This should be impossible — refusing to treat it as normal; check the caller's overrides.",
            f.line, f.excerpt
        ));
    }
    std::fs::write(&config_path, yaml)
        .map_err(|e| format!("failed to write the goose config: {e}"))?;
    std::fs::write(config_dir.join("permission.yaml"), build_permission_yaml())
        .map_err(|e| format!("failed to write the goose permission config: {e}"))?;

    Ok(PreparedDistribution { warnings })
}

// --- spawn plumbing -------------------------------------------------------------

/// Refuse any additive env key the crate documents as provider-selecting,
/// credentialing, or proxy-routing in stock goose. This is the compiled
/// guarantee that Alfred's own additions (and caller extras) can never
/// re-open what `env_clear` closed.
fn ensure_not_provider_selecting(key: &str) -> Result<(), String> {
    if policy::PROVIDER_SELECTING_ENV_VARS.contains(&key) {
        return Err(format!(
            "env var \"{key}\" is provider-selecting in stock goose and cannot be added to a guarded spawn"
        ));
    }
    Ok(())
}

pub enum GooseInvocation {
    /// `goose acp` — uses the crate-built Command verbatim.
    Acp,
    /// `goose recipe validate <path>` — same sanitized env, different args.
    RecipeValidate(PathBuf),
    /// `goose run --recipe <path> --no-session` — same sanitized env.
    RecipeRun(PathBuf),
}

pub struct BuiltSpawn {
    pub command: Command,
    pub env: BTreeMap<String, String>,
    pub provider: String,
    pub model: String,
}

// Born-redacted by hand: environment keys only — a derived Debug would leak
// credential values into logs and test output.
impl std::fmt::Debug for BuiltSpawn {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("BuiltSpawn")
            .field("program", &self.command.get_program())
            .field("provider", &self.provider)
            .field("model", &self.model)
            .field("env_keys", &self.env.keys().collect::<Vec<_>>())
            .finish()
    }
}

/// Build a guarded goose Command: L1b + L2 via `sanitized_spawn`, then
/// Alfred's documented non-selecting additions. Every failure is a denial.
#[allow(clippy::too_many_arguments)]
pub fn build_goose_spawn(
    goose_binary: &Path,
    invocation: &GooseInvocation,
    provider: &str,
    model: &str,
    credential: Option<CredentialVar>,
    proxy_addr: SocketAddr,
    isolated_home: &Path,
    cwd: &Path,
    otel_endpoint: Option<&str>,
    extra_env: &HashMap<String, String>,
) -> Result<BuiltSpawn, String> {
    let spec = SpawnSpec {
        goose_binary,
        provider,
        model,
        proxy_addr,
        isolated_home,
        credential,
    };
    let sanitized = sanitized_spawn(&spec).map_err(|d| d.to_string())?;
    let mut env = sanitized.env;

    // Alfred's additive env — each key screened against the crate's
    // provider-selecting list (regression-tested; GOOSE_PATH_ROOT is goose's
    // native isolation mechanism and moves config discovery on Windows, where
    // the crate's HOME/XDG pointers do not).
    let isolated = isolated_home.display().to_string();
    let mut additions: Vec<(String, String)> = vec![
        ("GOOSE_PATH_ROOT".into(), isolated),
        ("GOOSE_TELEMETRY_ENABLED".into(), "false".into()),
    ];
    match otel_endpoint {
        Some(endpoint) => additions.extend([
            ("OTEL_SDK_DISABLED".into(), "false".into()),
            ("OTEL_EXPORTER_OTLP_ENDPOINT".into(), endpoint.to_string()),
            ("OTEL_SERVICE_NAME".into(), "alfred-goose".into()),
        ]),
        None => additions.push(("OTEL_SDK_DISABLED".into(), "true".into())),
    }
    for (k, v) in extra_env {
        additions.push((k.clone(), v.clone()));
    }
    for (k, v) in additions {
        ensure_not_provider_selecting(&k)?;
        env.insert(k, v);
    }

    let mut command = match invocation {
        // The crate-built `goose acp` Command, env re-applied with additions.
        GooseInvocation::Acp => {
            let mut c = Command::new(goose_binary);
            c.arg("acp");
            c
        }
        GooseInvocation::RecipeValidate(path) => {
            let mut c = Command::new(goose_binary);
            c.arg("recipe").arg("validate").arg(path);
            c
        }
        GooseInvocation::RecipeRun(path) => {
            let mut c = Command::new(goose_binary);
            c.arg("run").arg("--recipe").arg(path).arg("--no-session");
            c
        }
    };
    command.env_clear().envs(&env).current_dir(cwd);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // CREATE_NO_WINDOW — a console child of a GUI parent must not pop a console.
        command.creation_flags(0x0800_0000);
    }
    Ok(BuiltSpawn {
        command,
        env,
        provider: sanitized.resolved.provider,
        model: sanitized.resolved.model,
    })
}

/// Locate the bundled goose sidecar next to the running executable. Tauri
/// bundles external binaries beside the app exe (triple-stripped in installs;
/// triple-suffixed in dev target dirs) — both shapes are checked. No env
/// override exists on purpose: a path override would be an L2 bypass.
pub fn goose_binary_path() -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| format!("cannot locate the app binary: {e}"))?;
    let dir = exe
        .parent()
        .ok_or_else(|| "app binary has no parent directory".to_string())?;
    goose_binary_in(dir)
}

fn goose_binary_in(dir: &Path) -> Result<PathBuf, String> {
    let suffix = std::env::consts::EXE_SUFFIX;
    let mut candidates = vec![dir.join(format!("goose{suffix}"))];
    if let Ok(triple) = tauri::utils::platform::target_triple() {
        candidates.push(dir.join(format!("goose-{triple}{suffix}")));
    }
    candidates
        .iter()
        .find(|p| p.exists())
        .cloned()
        .ok_or_else(|| {
            format!(
                "goose sidecar not found next to the app binary (looked for: {})",
                candidates
                    .iter()
                    .map(|p| p.display().to_string())
                    .collect::<Vec<_>>()
                    .join(", ")
            )
        })
}

fn credential_for(
    provider: &str,
    api_key: Option<&str>,
    ollama_host: Option<&str>,
) -> Option<CredentialVar> {
    if provider == "ollama" {
        return ollama_host.map(|h| CredentialVar {
            key: "OLLAMA_HOST".into(),
            value: h.into(),
        });
    }
    let key = holmes_core::provider::PROVIDER_CREDENTIAL_KEYS
        .iter()
        .find(|(p, _)| *p == provider)
        .and_then(|(_, keys)| keys.first())?;
    api_key.map(|v| CredentialVar {
        key: (*key).into(),
        value: v.into(),
    })
}

// --- Tauri commands --------------------------------------------------------------

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GooseSpawnArgs {
    pub provider: String,
    pub model: String,
    pub api_key: Option<String>,
    pub ollama_host: Option<String>,
    /// Working directory for the session (absolute) — typically the vault root.
    pub cwd: String,
    /// Absolute vault root the MCP server should serve.
    pub vault_path: String,
    pub builtins: Option<Vec<String>>,
    pub mcp_command: Option<String>,
    pub mcp_args: Option<Vec<String>>,
    pub extra_env: Option<HashMap<String, String>>,
    pub otel_endpoint: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpawnedGoose {
    pub id: u32,
    pub provider: String,
    pub model: String,
    /// B5 startup-scan warnings — surface, never hide.
    pub warnings: Vec<String>,
    /// The isolated goose root (recipes stage under it).
    pub path_root: String,
}

fn isolated_goose_home(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|d| d.join("goose"))
        .map_err(|e| format!("cannot resolve the app config dir: {e}"))
}

/// The isolated goose root, for callers that stage files under it.
#[tauri::command]
pub fn guard_goose_paths(app: tauri::AppHandle) -> Result<String, String> {
    Ok(isolated_goose_home(&app)?.display().to_string())
}

fn spawn_and_track(
    state: &GuardState,
    mut built: BuiltSpawn,
    on_event: Channel<GooseIoEvent>,
) -> Result<u32, String> {
    built
        .command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = built
        .command
        .spawn()
        .map_err(|e| format!("failed to start goose: {e}"))?;

    let stdin = child.stdin.take();
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let id = state.next_id.fetch_add(1, Ordering::SeqCst) + 1;
    state
        .children
        .lock()
        .insert(id, GooseChild { child, stdin });

    if let Some(mut err) = stderr {
        let ch = on_event.clone();
        std::thread::spawn(move || {
            let mut buf = [0u8; 8192];
            loop {
                match err.read(&mut buf) {
                    Ok(0) | Err(_) => break,
                    Ok(n) => {
                        let _ = ch.send(GooseIoEvent::Stderr {
                            data: buf[..n].to_vec(),
                        });
                    }
                }
            }
        });
    }

    let children = Arc::clone(&state.children);
    if let Some(mut out) = stdout {
        std::thread::spawn(move || {
            let mut buf = [0u8; 8192];
            loop {
                match out.read(&mut buf) {
                    Ok(0) | Err(_) => break,
                    Ok(n) => {
                        let _ = on_event.send(GooseIoEvent::Stdout {
                            data: buf[..n].to_vec(),
                        });
                    }
                }
            }
            // stdout EOF: the child is gone (or going) — reap it and report.
            let entry = children.lock().remove(&id);
            let code = entry.and_then(|mut e| e.child.wait().ok()).and_then(|s| s.code());
            let _ = on_event.send(GooseIoEvent::Closed { code });
        });
    }

    Ok(id)
}

/// Start a guarded `goose acp` session: prepare the isolated distribution,
/// resolve through L1b, build through L2, ride L1a, stream stdio over the
/// channel. Refuses excluded and unknown provider/model ids outright.
#[tauri::command]
pub fn guard_spawn_goose(
    app: tauri::AppHandle,
    state: tauri::State<'_, GuardState>,
    args: GooseSpawnArgs,
    on_event: Channel<GooseIoEvent>,
) -> Result<SpawnedGoose, String> {
    let isolated_home = isolated_goose_home(&app)?;
    let prepared = prepare_distribution(
        &isolated_home,
        &args.provider,
        &args.model,
        &args.vault_path,
        args.mcp_command.as_deref(),
        args.mcp_args.as_deref(),
        args.builtins.as_deref().unwrap_or(&[]),
    )?;
    let built = build_goose_spawn(
        &goose_binary_path()?,
        &GooseInvocation::Acp,
        &args.provider,
        &args.model,
        credential_for(&args.provider, args.api_key.as_deref(), args.ollama_host.as_deref()),
        state.proxy_addr()?,
        &isolated_home,
        Path::new(&args.cwd),
        args.otel_endpoint.as_deref(),
        args.extra_env.as_ref().unwrap_or(&HashMap::new()),
    )?;
    let provider = built.provider.clone();
    let model = built.model.clone();
    let id = spawn_and_track(&state, built, on_event)?;
    Ok(SpawnedGoose {
        id,
        provider,
        model,
        warnings: prepared.warnings,
        path_root: isolated_home.display().to_string(),
    })
}

/// Write bytes to a live goose session's stdin (the ACP client's send path).
#[tauri::command]
pub fn guard_goose_write(
    state: tauri::State<'_, GuardState>,
    id: u32,
    data: Vec<u8>,
) -> Result<(), String> {
    let mut children = state.children.lock();
    let entry = children
        .get_mut(&id)
        .ok_or_else(|| format!("no live goose session {id}"))?;
    let stdin = entry
        .stdin
        .as_mut()
        .ok_or_else(|| format!("goose session {id} has no open stdin"))?;
    stdin
        .write_all(&data)
        .and_then(|()| stdin.flush())
        .map_err(|e| format!("write to goose failed: {e}"))
}

/// Kill one goose session. The stdout pump observes EOF, reaps, and emits Closed.
#[tauri::command]
pub fn guard_goose_kill(state: tauri::State<'_, GuardState>, id: u32) -> Result<(), String> {
    let mut children = state.children.lock();
    if let Some(entry) = children.get_mut(&id) {
        entry.stdin = None; // close stdin first — lets goose exit cleanly if it can
        let _ = entry.child.kill();
    }
    Ok(())
}

/// Kill every live goose child (window close / reload hooks). The Windows Job
/// Object remains the abnormal-exit backstop.
#[tauri::command]
pub fn guard_goose_kill_all(state: tauri::State<'_, GuardState>) {
    let mut children = state.children.lock();
    for (_, entry) in children.iter_mut() {
        entry.stdin = None;
        let _ = entry.child.kill();
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecipeValidationDto {
    pub valid: bool,
    pub output: String,
}

/// Validate a recipe with `goose recipe validate` under the guarded env (L1b
/// resolves the session's provider/model; no credential is passed — validation
/// is local).
#[tauri::command]
pub fn guard_goose_recipe_validate(
    app: tauri::AppHandle,
    state: tauri::State<'_, GuardState>,
    provider: String,
    model: String,
    recipe_path: String,
) -> Result<RecipeValidationDto, String> {
    let isolated_home = isolated_goose_home(&app)?;
    std::fs::create_dir_all(&isolated_home)
        .map_err(|e| format!("failed to create the isolated goose root: {e}"))?;
    let mut built = build_goose_spawn(
        &goose_binary_path()?,
        &GooseInvocation::RecipeValidate(PathBuf::from(&recipe_path)),
        &provider,
        &model,
        None,
        state.proxy_addr()?,
        &isolated_home,
        &isolated_home,
        None,
        &HashMap::new(),
    )?;
    let output = built
        .command
        .output()
        .map_err(|e| format!("failed to run goose recipe validate: {e}"))?;
    let text = [
        String::from_utf8_lossy(&output.stdout).trim().to_string(),
        String::from_utf8_lossy(&output.stderr).trim().to_string(),
    ]
    .into_iter()
    .filter(|s| !s.is_empty())
    .collect::<Vec<_>>()
    .join("\n");
    Ok(RecipeValidationDto {
        valid: output.status.success(),
        output: text,
    })
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecipeRunArgs {
    pub provider: String,
    pub model: String,
    pub api_key: Option<String>,
    pub ollama_host: Option<String>,
    pub cwd: String,
    /// The STAGED (cleaned) recipe path — staging happens caller-side after the
    /// Pale Fire scan + operator acknowledgement.
    pub staged_recipe_path: String,
}

/// Run a staged recipe under the guarded env, streaming output on the channel.
#[tauri::command]
pub fn guard_goose_recipe_run(
    app: tauri::AppHandle,
    state: tauri::State<'_, GuardState>,
    args: RecipeRunArgs,
    on_event: Channel<GooseIoEvent>,
) -> Result<SpawnedGoose, String> {
    let isolated_home = isolated_goose_home(&app)?;
    std::fs::create_dir_all(&isolated_home)
        .map_err(|e| format!("failed to create the isolated goose root: {e}"))?;
    let built = build_goose_spawn(
        &goose_binary_path()?,
        &GooseInvocation::RecipeRun(PathBuf::from(&args.staged_recipe_path)),
        &args.provider,
        &args.model,
        credential_for(&args.provider, args.api_key.as_deref(), args.ollama_host.as_deref()),
        state.proxy_addr()?,
        &isolated_home,
        Path::new(&args.cwd),
        None,
        &HashMap::new(),
    )?;
    let provider = built.provider.clone();
    let model = built.model.clone();
    let id = spawn_and_track(&state, built, on_event)?;
    Ok(SpawnedGoose {
        id,
        provider,
        model,
        warnings: Vec::new(),
        path_root: isolated_home.display().to_string(),
    })
}
