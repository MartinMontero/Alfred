// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
import { Component, createSignal, For, Show, onMount, onCleanup } from 'solid-js';
import { platform } from '@platform';
import {
  getSyncEngine,
  setOnSaveSyncCallback,
  calculateChecksum,
  type NostrIdentity,
  DEFAULT_SYNC_CONFIG,
  // Login functions
  generateNewLogin,
  importNsecLogin,
  fetchUserRelays,
  fetchUserBlossomServers,
  fetchUserProfile,
  saveLogin,
  getCurrentLogin,
  removeLogin,
  clearLogins,
  getIdentityFromLogin,
  saveUserProfile,
  getSavedProfile,
  type StoredLogin,
  type UserProfile,
} from '../lib/nostr';
import { createSignerFromLogin, type NostrSigner } from '../lib/nostr/signer';
import {
  getCustomProviderApiKey,
  setCustomProviderApiKey as persistCustomProviderApiKey,
  clearCustomProviderApiKey,
} from '../lib/ai-credentials';
import { usePlatformInfo, isMobile, isDesktop } from '../lib/platform';
import { checkForUpdate, downloadAndInstallPending, mapUpdaterError, isExpectedBetaState } from '../lib/updater';
import AlfredMark from '../assets/onboarding/alfred-mark.png';
import { invoke } from '@tauri-apps/api/core';
import { authenticateWithBiometric } from '../lib/biometric';
import {
  loadDailyNotesConfig,
  saveDailyNotesConfig,
  DEFAULT_DAILY_NOTES_CONFIG,
  type DailyNotesConfig,
} from '../lib/daily-notes';
import {
  loadTemplatesConfig,
  saveTemplatesConfig,
  DEFAULT_TEMPLATES_CONFIG,
  type TemplatesConfig,
} from '../lib/templates';

type SettingsSection = 'general' | 'editor' | 'files' | 'appearance' | 'hotkeys' | 'customprovider' | 'sync' | 'nostr' | 'privacy' | 'about';
type LoginTab = 'generate' | 'import';

interface SettingsProps {
  onClose: () => void;
  vaultPath: string | null;
  onSyncComplete?: () => void;
  onSyncEnabledChange?: (enabled: boolean) => void;
  initialSection?: SettingsSection;
}

interface SettingsSectionItem {
  id: SettingsSection;
  label: string;
  icon: string;
}

interface RelayInfo {
  url: string;
  read: boolean;
  write: boolean;
}

const sections: SettingsSectionItem[] = [
  { id: 'general', label: 'General', icon: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5' },
  { id: 'editor', label: 'Editor', icon: 'M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z' },
  { id: 'files', label: 'Files & Links', icon: 'M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z M14 2v6h6 M10 12l2 2 4-4' },
  { id: 'appearance', label: 'Appearance', icon: 'M12 2v4 M12 18v4 M4.93 4.93l2.83 2.83 M16.24 16.24l2.83 2.83 M2 12h4 M18 12h4 M4.93 19.07l2.83-2.83 M16.24 7.76l2.83-2.83' },
  { id: 'hotkeys', label: 'Hotkeys', icon: 'M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z' },
  { id: 'customprovider', label: 'Custom Provider', icon: 'M12 2L2 7l10 5 10-5-10-5z M2 17l10 5 10-5 M2 12l10 5 10-5' },
  { id: 'sync', label: 'Sync', icon: 'M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8 M21 3v5h-5' },
  { id: 'nostr', label: 'Nostr', icon: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' },
  { id: 'privacy', label: 'Privacy & Telemetry', icon: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z M9 12l2 2 4-4' },
  { id: 'about', label: 'About', icon: 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z M12 16v-4 M12 8h.01' },
];

const Settings: Component<SettingsProps> = (props) => {
  const [activeSection, setActiveSection] = createSignal<SettingsSection>(props.initialSection || 'general');

  // Platform detection for hiding desktop-only sections on mobile
  const platformInfo = usePlatformInfo();
  const isMobileApp = () => {
    const info = platformInfo();
    return info?.platform === 'android' || info?.platform === 'ios';
  };

  // Filter sections based on platform - hide Custom Provider and Hotkeys on mobile;
  // Privacy & Telemetry is desktop-only (the born-redacted telemetry store is a Tauri
  // command surface that does not exist in the web build).
  const filteredSections = () => {
    let list = sections;
    if (isMobileApp()) {
      list = list.filter(s => s.id !== 'customprovider' && s.id !== 'hotkeys');
    }
    if (!isDesktop()) {
      list = list.filter(s => s.id !== 'privacy');
    }
    return list;
  };

  // Login state
  const [currentLogin, setCurrentLogin] = createSignal<StoredLogin | null>(null);
  const [identity, setIdentity] = createSignal<NostrIdentity | null>(null);
  const [signer, setSigner] = createSignal<NostrSigner | null>(null);
  const [userProfile, setUserProfile] = createSignal<UserProfile | null>(null);
  const [loginTab, setLoginTab] = createSignal<LoginTab>('import');
  const [showPrivateKey, setShowPrivateKey] = createSignal(false);
  const [importKeyInput, setImportKeyInput] = createSignal('');
  const [keyError, setKeyError] = createSignal<string | null>(null);
  const [loginLoading, setLoginLoading] = createSignal(false);

  // Relay state (now with read/write permissions)
  const [relays, setRelays] = createSignal<RelayInfo[]>(
    DEFAULT_SYNC_CONFIG.relays.map(url => ({ url, read: true, write: true }))
  );
  const [newRelayUrl, setNewRelayUrl] = createSignal('');

  // Blossom state
  const [blossomServers, setBlossomServers] = createSignal<string[]>(
    DEFAULT_SYNC_CONFIG.blossomServers
  );
  const [newBlossomUrl, setNewBlossomUrl] = createSignal('');

  // Blocked users state
  const [blockedUsers, setBlockedUsers] = createSignal<Array<{ pubkey: string; name?: string; picture?: string }>>([]);
  const [loadingBlocked, setLoadingBlocked] = createSignal(false);
  const [unblockingUser, setUnblockingUser] = createSignal<string | null>(null);

  // Privacy / telemetry state (desktop-only; opt-in, off by default).
  interface TelemetryMetrics {
    total_events: number;
    input_tokens: number;
    output_tokens: number;
    by_kind: { kind: string; count: number; avg_duration_ms: number }[];
    errors: { error_type: string; count: number }[];
  }
  const [telemetryEnabled, setTelemetryEnabled] = createSignal(false);
  const [telemetryBusy, setTelemetryBusy] = createSignal(false);
  const [telemetryMetrics, setTelemetryMetrics] = createSignal<TelemetryMetrics | null>(null);
  const [telemetryNotice, setTelemetryNotice] = createSignal<string | null>(null);

  async function refreshTelemetryMetrics() {
    if (!isDesktop()) return;
    try {
      setTelemetryMetrics(await invoke<TelemetryMetrics>('telemetry_metrics'));
    } catch (e) {
      console.warn('telemetry_metrics failed:', e);
    }
  }

  async function handleTelemetryToggle(enabled: boolean) {
    setTelemetryBusy(true);
    setTelemetryNotice(null);
    try {
      // Read-modify-write so we never clobber other settings (e.g. vault_path).
      // save_settings overwrites the whole file, so if the load fails we ABORT
      // rather than write a partial object that would null out vault_path.
      const current = await invoke<{ vault_path?: string | null; telemetry_enabled?: boolean | null }>(
        'load_settings',
      );
      await invoke('save_settings', { settings: { ...current, telemetry_enabled: enabled } });
      setTelemetryEnabled(enabled);
      setTelemetryNotice(
        enabled
          ? 'Telemetry on. Anonymous usage counts and timings only — never your notes, prompts, or keys.'
          : 'Telemetry off. No new data is recorded. Use “Erase collected data” to remove anything already stored.',
      );
      if (enabled) await refreshTelemetryMetrics();
    } catch (e) {
      setTelemetryNotice(`Could not change the setting: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setTelemetryBusy(false);
    }
  }

  async function handleTelemetryWipe() {
    if (!confirm('Erase all locally collected telemetry? This cannot be undone. Your notes are never affected.')) {
      return;
    }
    setTelemetryBusy(true);
    setTelemetryNotice(null);
    try {
      const r = await invoke<{ rows_before: number; rows_after: number; file_bytes: number }>('telemetry_wipe');
      setTelemetryNotice(`Erased ${r.rows_before} record${r.rows_before === 1 ? '' : 's'}; ${r.rows_after} remain.`);
      await refreshTelemetryMetrics();
    } catch (e) {
      setTelemetryNotice(`Wipe failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setTelemetryBusy(false);
    }
  }

  async function handleTelemetryExport() {
    setTelemetryBusy(true);
    setTelemetryNotice(null);
    try {
      const rows = await invoke<unknown[]>('telemetry_export');
      const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'alfred-telemetry-export.json';
      a.click();
      URL.revokeObjectURL(url);
      setTelemetryNotice(`Exported ${rows.length} record${rows.length === 1 ? '' : 's'} to alfred-telemetry-export.json.`);
    } catch (e) {
      setTelemetryNotice(`Export failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setTelemetryBusy(false);
    }
  }

  // Sync state
  const [syncEnabled, setSyncEnabled] = createSignal(false);
  const [syncOnStartup, setSyncOnStartup] = createSignal(true);
  const [syncFrequency, setSyncFrequency] = createSignal<'onsave' | '5min' | 'manual'>('manual');
  const [syncStatus, setSyncStatus] = createSignal<'idle' | 'syncing' | 'success' | 'error'>('idle');
  const [syncMessage, setSyncMessage] = createSignal<string | null>(null);
  let syncIntervalId: number | null = null;

  // File recovery state
  interface RecoverableFile {
    path: string;
    content: string;
    deletedAt: number;
    eventId: string;
  }
  const [recoverableFiles, setRecoverableFiles] = createSignal<RecoverableFile[]>([]);
  const [recoveryLoading, setRecoveryLoading] = createSignal(false);
  const [recoveryMessage, setRecoveryMessage] = createSignal<string | null>(null);
  const [recoveringFile, setRecoveringFile] = createSignal<string | null>(null);

  // Modal dialog state
  const [modalConfig, setModalConfig] = createSignal<{
    type: 'confirm' | 'info';
    title: string;
    message: string;
    onConfirm?: () => void;
  } | null>(null);

  // App version
  const [appVersion, setAppVersion] = createSignal('...');

  // W5 updater flow — three explicit user actions, nothing automatic.
  const [updateStatus, setUpdateStatus] = createSignal<
    'idle' | 'checking' | 'none' | 'available' | 'downloading' | 'info' | 'error'
  >('idle');
  const [updateDetail, setUpdateDetail] = createSignal('');
  const [updateVersion, setUpdateVersion] = createSignal('');

  const runUpdateCheck = async () => {
    setUpdateStatus('checking');
    setUpdateDetail('');
    try {
      const r = await checkForUpdate();
      if (r.phase === 'available') {
        setUpdateVersion(r.version ?? '');
        setUpdateStatus('available');
      } else {
        setUpdateStatus('none');
      }
    } catch (e) {
      setUpdateDetail(mapUpdaterError(e));
      // F4: expected beta states (no feed yet / pubkey pending) are
      // information, not errors — no red styling for a normal condition.
      setUpdateStatus(isExpectedBetaState(e) ? 'info' : 'error');
    }
  };

  const runUpdateInstall = async () => {
    setUpdateStatus('downloading');
    setUpdateDetail('');
    try {
      await downloadAndInstallPending((pct) => setUpdateDetail(pct === null ? '' : `${pct}%`));
      // On Windows the app exits when the installer takes over; nothing to do here.
    } catch (e) {
      setUpdateDetail(mapUpdaterError(e));
      setUpdateStatus('error');
    }
  };

  // Custom Provider state
  const [customProviderUrl, setCustomProviderUrl] = createSignal<string>(
    localStorage.getItem('custom_provider_url') || ''
  );
  // Loaded async from the platform secret store in onMount
  const [customProviderApiKey, setCustomProviderApiKey] = createSignal<string>('');
  const [customProviderName, setCustomProviderName] = createSignal<string>(
    localStorage.getItem('custom_provider_name') || ''
  );
  const [customProviderApiKeyVisible, setCustomProviderApiKeyVisible] = createSignal(false);
  const [customProviderModels, setCustomProviderModels] = createSignal<string[]>(
    (() => {
      try {
        const stored = localStorage.getItem('custom_provider_models');
        return stored ? JSON.parse(stored) : [];
      } catch { return []; }
    })()
  );
  const [customProviderModel, setCustomProviderModel] = createSignal<string>(
    localStorage.getItem('custom_provider_model') || ''
  );
  const [customProviderTestStatus, setCustomProviderTestStatus] = createSignal<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [customProviderTestError, setCustomProviderTestError] = createSignal<string | null>(null);
  const [customProviderModelsLoading, setCustomProviderModelsLoading] = createSignal(false);

  const handleCustomProviderUrlChange = (value: string) => {
    setCustomProviderUrl(value);
    localStorage.setItem('custom_provider_url', value);
    window.dispatchEvent(new CustomEvent('custom-provider-settings-changed'));
  };

  const handleCustomProviderApiKeyChange = async (value: string) => {
    setCustomProviderApiKey(value);
    if (value) {
      await persistCustomProviderApiKey(value);
    } else {
      await clearCustomProviderApiKey();
    }
    window.dispatchEvent(new CustomEvent('custom-provider-settings-changed'));
  };

  const handleCustomProviderNameChange = (value: string) => {
    setCustomProviderName(value);
    localStorage.setItem('custom_provider_name', value);
    window.dispatchEvent(new CustomEvent('custom-provider-settings-changed'));
  };

  const handleCustomProviderModelChange = (value: string) => {
    setCustomProviderModel(value);
    localStorage.setItem('custom_provider_model', value);
    window.dispatchEvent(new CustomEvent('custom-provider-settings-changed'));
  };

  const handleFetchCustomProviderModels = async () => {
    const url = customProviderUrl();
    if (!url) return;

    setCustomProviderModelsLoading(true);
    try {
      const baseUrl = url.replace(/\/+$/, '');
      const apiKey = customProviderApiKey();
      const response = await platform.ai.customProviderListModels(
        `${baseUrl}/v1/models`,
        apiKey,
      );
      const data = JSON.parse(response);
      const models: string[] = (data.data || []).map((m: { id: string }) => m.id).sort();
      setCustomProviderModels(models);
      localStorage.setItem('custom_provider_models', JSON.stringify(models));
      // Auto-select first model if none selected
      if (!customProviderModel() && models.length > 0) {
        handleCustomProviderModelChange(models[0]);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setCustomProviderTestError(`Failed to fetch models: ${message}`);
      setCustomProviderTestStatus('error');
    } finally {
      setCustomProviderModelsLoading(false);
    }
  };

  const handleTestCustomProviderConnection = async () => {
    const url = customProviderUrl();
    if (!url) return;

    setCustomProviderTestStatus('testing');
    setCustomProviderTestError(null);

    try {
      const baseUrl = url.replace(/\/+$/, '');
      const apiKey = customProviderApiKey();
      const model = customProviderModel() || 'test';
      await platform.ai.customProviderRequest(
        `${baseUrl}/v1/chat/completions`,
        apiKey,
        JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'ping' }],
          stream: false,
          max_tokens: 1,
        }),
      );
      setCustomProviderTestStatus('success');
    } catch (err: unknown) {
      setCustomProviderTestStatus('error');
      const message = err instanceof Error ? err.message : String(err);
      setCustomProviderTestError(message || 'Connection failed');
    }
  };

  // Files & Links settings
  const [useWikilinks, setUseWikilinks] = createSignal(
    localStorage.getItem('use_wikilinks') !== 'false' // Default to true
  );

  // Daily Notes settings
  const [dailyNotesConfig, setDailyNotesConfig] = createSignal<DailyNotesConfig>(loadDailyNotesConfig());

  // Templates settings
  const [templatesConfig, setTemplatesConfig] = createSignal<TemplatesConfig>(loadTemplatesConfig());

  // Editor settings
  const [editorFontFamily, setEditorFontFamily] = createSignal(
    localStorage.getItem('editor_font_family') || 'system-ui, sans-serif'
  );
  const [editorFontSize, setEditorFontSize] = createSignal(
    parseInt(localStorage.getItem('editor_font_size') || '16')
  );
  const [editorLineHeight, setEditorLineHeight] = createSignal(
    parseFloat(localStorage.getItem('editor_line_height') || '1.6')
  );
  const [showLineNumbers, setShowLineNumbers] = createSignal(
    localStorage.getItem('show_line_numbers') === 'true'
  );
  const [vimMode, setVimMode] = createSignal(
    localStorage.getItem('vim_mode') === 'true'
  );
  const [spellCheck, setSpellCheck] = createSignal(
    localStorage.getItem('spell_check') !== 'false' // Default to true
  );

  // Appearance settings
  const [theme, setTheme] = createSignal<'dark' | 'light' | 'system'>(
    (localStorage.getItem('theme') as 'dark' | 'light' | 'system') || 'dark'
  );
  const [accentColor, setAccentColor] = createSignal(
    localStorage.getItem('accent_color') || '#b8863d'
  );
  const [interfaceFontSize, setInterfaceFontSize] = createSignal<'small' | 'medium' | 'large'>(
    (localStorage.getItem('interface_font_size') as 'small' | 'medium' | 'large') || 'medium'
  );
  const [translucentWindow, setTranslucentWindow] = createSignal(
    localStorage.getItem('translucent_window') === 'true'
  );

  // Apply appearance settings to document
  const applyAppearanceSettings = () => {
    const root = document.documentElement;

    // Apply theme
    const currentTheme = theme();
    if (currentTheme === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    } else {
      root.setAttribute('data-theme', currentTheme);
    }

    // Apply accent color
    const accent = accentColor();
    root.style.setProperty('--accent', accent);
    // Calculate hover color (lighter version)
    const hoverColor = lightenColor(accent, 20);
    root.style.setProperty('--accent-hover', hoverColor);
    // Calculate muted color (with alpha)
    root.style.setProperty('--accent-muted', `${accent}26`); // 15% opacity
    // Calculate contrasting text color for accent backgrounds
    const contrastColor = getContrastColor(accent);
    root.style.setProperty('--accent-text', contrastColor);

    // Apply font size
    root.setAttribute('data-font-size', interfaceFontSize());

    // Apply translucent
    root.setAttribute('data-translucent', translucentWindow().toString());
  };

  // Helper to lighten a hex color
  const lightenColor = (hex: string, percent: number): string => {
    const num = parseInt(hex.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = Math.min(255, (num >> 16) + amt);
    const G = Math.min(255, ((num >> 8) & 0x00FF) + amt);
    const B = Math.min(255, (num & 0x0000FF) + amt);
    return `#${(0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1)}`;
  };

  // Helper to calculate relative luminance and determine contrast color
  const getContrastColor = (hex: string): string => {
    const num = parseInt(hex.replace('#', ''), 16);
    const R = (num >> 16) & 0xFF;
    const G = (num >> 8) & 0xFF;
    const B = num & 0xFF;
    // Calculate relative luminance using sRGB formula
    const luminance = (0.299 * R + 0.587 * G + 0.114 * B) / 255;
    // Return black for light colors, white for dark colors
    return luminance > 0.5 ? '#000000' : '#ffffff';
  };

  // Load saved login on mount
  onMount(async () => {
    // Get app version
    platform.app.getVersion().then(setAppVersion).catch(() => setAppVersion('unknown'));

    // Load the telemetry opt-in state (desktop only). Off by default; a locked or
    // missing settings file simply reads as off.
    if (isDesktop()) {
      invoke<{ telemetry_enabled?: boolean | null }>('load_settings')
        .then((s) => {
          const on = s?.telemetry_enabled === true;
          setTelemetryEnabled(on);
          if (on) void refreshTelemetryMetrics();
        })
        .catch(() => setTelemetryEnabled(false));
    }

    // Load AI credentials from the platform secret store (migrates any
    // legacy plaintext localStorage copies on first read)
    getCustomProviderApiKey()
      .then((key) => setCustomProviderApiKey(key || ''))
      .catch(() => {});

    // Apply saved appearance settings on mount
    applyAppearanceSettings();

    // Listen for system theme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleThemeChange = () => {
      if (theme() === 'system') {
        applyAppearanceSettings();
      }
    };
    mediaQuery.addEventListener('change', handleThemeChange);


    // Load login from secure storage
    const login = await getCurrentLogin();

    if (login) {
      setCurrentLogin(login);

      // Get identity if it's an nsec login (for displaying keys)
      const ident = getIdentityFromLogin(login);
      if (ident) {
        setIdentity(ident);
      }

      // Create signer for both nsec and bunker logins
      const loginSigner = createSignerFromLogin(login);
      if (loginSigner) {
        setSigner(loginSigner);
        // Set signer on sync engine
        const engine = getSyncEngine();
        await engine.setSigner(loginSigner);
      } else if (login.type === 'nsec') {
        // Login data is corrupted, clear it
        await removeLogin(login.id);
        setCurrentLogin(null);
      }

      // Load saved profile
      const savedProfile = await getSavedProfile();
      if (savedProfile) {
        setUserProfile(savedProfile);
      }

      // Load blocked users list (in background, don't block UI)
      loadBlockedUsers();
    }

    const savedRelays = localStorage.getItem('nostr_relays');
    if (savedRelays) {
      try {
        const parsed = JSON.parse(savedRelays);
        // Handle both old format (string[]) and new format (RelayInfo[])
        let relayInfos: RelayInfo[];
        if (typeof parsed[0] === 'string') {
          relayInfos = parsed.map((url: string) => ({ url, read: true, write: true }));
        } else {
          relayInfos = parsed;
        }
        setRelays(relayInfos);

        // Apply saved relays to sync engine (write relays only)
        const engine = getSyncEngine();
        engine.setConfig({ relays: relayInfos.filter(r => r.write).map(r => r.url) });
      } catch (e) {
        console.error('Failed to load saved relays:', e);
      }
    }

    const savedBlossom = localStorage.getItem('blossom_servers');
    if (savedBlossom) {
      try {
        const servers = JSON.parse(savedBlossom);
        setBlossomServers(servers);

        // Apply saved blossom servers to sync engine
        const engine = getSyncEngine();
        engine.setConfig({ blossomServers: servers });
      } catch (e) {
        console.error('Failed to load saved blossom servers:', e);
      }
    }

    const savedSyncEnabled = localStorage.getItem('sync_enabled');
    if (savedSyncEnabled) {
      setSyncEnabled(savedSyncEnabled === 'true');
    }

    const savedSyncOnStartup = localStorage.getItem('sync_on_startup');
    if (savedSyncOnStartup) {
      setSyncOnStartup(savedSyncOnStartup === 'true');
    }

    const savedSyncFrequency = localStorage.getItem('sync_frequency');
    if (savedSyncFrequency) {
      setSyncFrequency(savedSyncFrequency as 'onsave' | '5min' | 'manual');
    }

    // Trigger sync on startup if enabled
    if (savedSyncEnabled === 'true' && savedSyncOnStartup !== 'false') {
      // Delay slightly to let signer initialize
      setTimeout(() => {
        if (signer()) {
          handleSyncNow();
        }
      }, 500);
    }

    // Set up periodic sync if enabled
    if (savedSyncEnabled === 'true' && savedSyncFrequency === '5min') {
      startPeriodicSync();
    }

    // Register the on-save sync callback
    setOnSaveSyncCallback(async () => {
      if (signer() && syncStatus() !== 'syncing') {
        await handleSyncNow();
      }
    });

  });

  // Cleanup interval on unmount
  onCleanup(() => {
    if (syncIntervalId) {
      clearInterval(syncIntervalId);
    }
  });

  // Fetch user profile, relays and blossom servers after login
  const fetchUserData = async (pubkey: string) => {
    const relayUrls = relays().map(r => r.url);

    try {
      // Fetch user profile (kind 0)
      const profile = await fetchUserProfile(pubkey, relayUrls);
      if (profile) {
        setUserProfile(profile);
        await saveUserProfile(profile);
      }

      // Fetch NIP-65 relay list
      const userRelays = await fetchUserRelays(pubkey, relayUrls);
      if (userRelays.length > 0) {
        setRelays(userRelays);
        localStorage.setItem('nostr_relays', JSON.stringify(userRelays));

        // Update sync engine config
        const engine = getSyncEngine();
        engine.setConfig({ relays: userRelays.filter(r => r.write).map(r => r.url) });
      }

      // Fetch blossom servers
      const userBlossom = await fetchUserBlossomServers(pubkey, relayUrls);
      if (userBlossom.length > 0) {
        setBlossomServers(userBlossom);
        localStorage.setItem('blossom_servers', JSON.stringify(userBlossom));

        // Update sync engine config
        const engine = getSyncEngine();
        engine.setConfig({ blossomServers: userBlossom });
      }
    } catch (e) {
      console.error('Failed to fetch user data:', e);
    }
  };

  // Handle successful login
  const handleLoginSuccess = async (login: StoredLogin, ident: NostrIdentity | null) => {
    setCurrentLogin(login);
    if (ident) {
      setIdentity(ident);
    }

    // Create signer for both nsec and bunker logins
    const loginSigner = createSignerFromLogin(login);
    if (loginSigner) {
      setSigner(loginSigner);
      const engine = getSyncEngine();
      await engine.setSigner(loginSigner);
    }

    await saveLogin(login);
    setKeyError(null);
    setLoginLoading(false);

    // Fetch user's relay list and blossom servers
    fetchUserData(login.pubkey);
  };

  // Generate new keypair
  const handleGenerateKey = async () => {
    setLoginLoading(true);
    setKeyError(null);

    try {
      const { identity: newIdentity, login } = generateNewLogin();
      await handleLoginSuccess(login, newIdentity);
    } catch (e) {
      setKeyError('Failed to generate key');
      setLoginLoading(false);
    }
  };

  // Import existing key (nsec)
  const handleImportKey = async () => {
    const key = importKeyInput().trim();
    if (!key) {
      setKeyError('Please enter a key');
      return;
    }

    setLoginLoading(true);
    setKeyError(null);

    try {
      const { identity: imported, login } = importNsecLogin(key);
      await handleLoginSuccess(login, imported);
      setImportKeyInput('');
    } catch (e) {
      setKeyError('Invalid key format. Please enter a valid nsec or hex private key.');
      setLoginLoading(false);
    }
  };

  // Logout
  const handleLogout = async () => {
    // Close signer connections
    const currentSigner = signer();
    if (currentSigner?.close) {
      currentSigner.close();
    }

    // Clear all login data from secure storage
    await clearLogins();

    // Reset sync engine
    const engine = getSyncEngine();
    await engine.setSigner(null);

    // Reset all local state
    setCurrentLogin(null);
    setIdentity(null);
    setSigner(null);
    setUserProfile(null);
    setBlockedUsers([]);
    
    // Reset to import tab
    setLoginTab('import');
  };

  // Load blocked users list
  const loadBlockedUsers = async () => {
    if (!currentLogin()) return;
    
    setLoadingBlocked(true);
    try {
      const engine = getSyncEngine();
      const { pubkeys } = await engine.fetchMuteList();
      
      // Fetch profiles for each blocked user
      const usersWithProfiles = await Promise.all(
        pubkeys.map(async (pubkey) => {
          try {
            const profile = await fetchUserProfile(pubkey, relays().map(r => r.url));
            return {
              pubkey,
              name: profile?.displayName || profile?.name,
              picture: profile?.picture,
            };
          } catch {
            return { pubkey };
          }
        })
      );
      
      setBlockedUsers(usersWithProfiles);
    } catch (err) {
      console.error('Failed to load blocked users:', err);
    } finally {
      setLoadingBlocked(false);
    }
  };

  // Unblock a user
  const handleUnblockUser = async (pubkey: string) => {
    setUnblockingUser(pubkey);
    try {
      const engine = getSyncEngine();
      await engine.removeFromMuteList(pubkey);
      engine.invalidateMuteCache();
      
      // Remove from local state
      setBlockedUsers(prev => prev.filter(u => u.pubkey !== pubkey));
    } catch (err) {
      console.error('Failed to unblock user:', err);
    } finally {
      setUnblockingUser(null);
    }
  };

  // Copy to clipboard
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      console.error('Failed to copy:', e);
    }
  };

  // Add relay
  const handleAddRelay = () => {
    const url = newRelayUrl().trim();
    if (!url) return;

    // Security: Only allow secure WebSocket connections (wss://)
    // ws:// is unencrypted and vulnerable to MITM attacks
    if (!url.startsWith('wss://')) {
      setNewRelayUrl('');
      return;
    }

    // Check for duplicates
    if (relays().some(r => r.url === url)) {
      return;
    }

    const updated = [...relays(), { url, read: true, write: true }];
    setRelays(updated);
    setNewRelayUrl('');

    // Save to localStorage
    localStorage.setItem('nostr_relays', JSON.stringify(updated));

    // Update sync engine config (write relays only)
    const engine = getSyncEngine();
    engine.setConfig({ relays: updated.filter(r => r.write).map(r => r.url) });
  };

  // Remove relay
  const handleRemoveRelay = (url: string) => {
    const updated = relays().filter(r => r.url !== url);
    setRelays(updated);

    // Save to localStorage (save full RelayInfo objects, consistent with handleAddRelay)
    localStorage.setItem('nostr_relays', JSON.stringify(updated));

    // Update sync engine config
    const engine = getSyncEngine();
    engine.setConfig({ relays: updated.filter(r => r.write).map(r => r.url) });
  };

  // Add blossom server
  const handleAddBlossom = () => {
    const url = newBlossomUrl().trim();
    if (!url) return;

    // Basic validation
    if (!url.startsWith('https://') && !url.startsWith('http://')) {
      return;
    }

    // Check for duplicates
    if (blossomServers().includes(url)) {
      return;
    }

    const updated = [...blossomServers(), url];
    setBlossomServers(updated);
    setNewBlossomUrl('');

    // Save to localStorage
    localStorage.setItem('blossom_servers', JSON.stringify(updated));

    // Update sync engine config
    const engine = getSyncEngine();
    engine.setConfig({ blossomServers: updated });
  };

  // Remove blossom server
  const handleRemoveBlossom = (url: string) => {
    const updated = blossomServers().filter(u => u !== url);
    setBlossomServers(updated);

    // Save to localStorage
    localStorage.setItem('blossom_servers', JSON.stringify(updated));

    // Update sync engine config
    const engine = getSyncEngine();
    engine.setConfig({ blossomServers: updated });
  };

  // Start periodic sync (every 5 minutes)
  const startPeriodicSync = () => {
    if (syncIntervalId) {
      clearInterval(syncIntervalId);
    }
    // 5 minutes = 300000ms
    syncIntervalId = window.setInterval(() => {
      if (signer() && syncEnabled() && syncStatus() !== 'syncing') {
        handleSyncNow();
      }
    }, 300000);
  };

  // Stop periodic sync
  const stopPeriodicSync = () => {
    if (syncIntervalId) {
      clearInterval(syncIntervalId);
      syncIntervalId = null;
    }
  };

  // Toggle sync enabled
  const handleSyncToggle = (enabled: boolean) => {
    setSyncEnabled(enabled);
    localStorage.setItem('sync_enabled', enabled.toString());

    const engine = getSyncEngine();
    engine.setConfig({ enabled });

    // Notify parent of sync status change
    props.onSyncEnabledChange?.(enabled);

    // Manage periodic sync based on enabled state
    if (enabled && syncFrequency() === '5min') {
      startPeriodicSync();
    } else {
      stopPeriodicSync();
    }
  };

  // Toggle sync on startup
  const handleSyncOnStartupToggle = (enabled: boolean) => {
    setSyncOnStartup(enabled);
    localStorage.setItem('sync_on_startup', enabled.toString());
  };

  // Change sync frequency
  const handleSyncFrequencyChange = (frequency: 'onsave' | '5min' | 'manual') => {
    setSyncFrequency(frequency);
    localStorage.setItem('sync_frequency', frequency);

    // Manage periodic sync based on frequency
    if (syncEnabled() && frequency === '5min') {
      startPeriodicSync();
    } else {
      stopPeriodicSync();
    }
  };

  // Get all local markdown files recursively
  const getLocalFiles = async (basePath: string): Promise<{ path: string; content: string }[]> => {
    const files: { path: string; content: string }[] = [];

    const entries = await platform.vault.list(basePath);

    const processEntries = async (entries: Array<{ name: string; path: string; isDirectory: boolean; children?: unknown[] }>) => {
      for (const entry of entries) {
        if (entry.isDirectory && entry.children) {
          await processEntries(entry.children as typeof entries);
        } else if (entry.name.endsWith('.md')) {
          const content = await platform.vault.read(entry.path, props.vaultPath ?? '');
          // Get relative path from vault
          const relativePath = entry.path.replace(basePath + '/', '');
          files.push({ path: relativePath, content });
        }
      }
    };

    await processEntries(entries);
    return files;
  };

  // Manual sync
  const handleSyncNow = async () => {
    if (!signer()) {
      setSyncStatus('error');
      setSyncMessage('No identity found. Please log in first.');
      return;
    }

    if (!props.vaultPath) {
      setSyncStatus('error');
      setSyncMessage('No vault folder open. Open a folder first.');
      return;
    }

    setSyncStatus('syncing');
    setSyncMessage('Connecting to relays...');

    try {
      const engine = getSyncEngine();

      setSyncMessage('Fetching vaults...');
      const vaults = await engine.fetchVaults();

      let vault = vaults[0];
      if (!vault) {
        setSyncMessage('No vaults found. Creating default vault...');
        vault = await engine.createVault('My Notes', 'Default vault');
      }

      // Get local files
      setSyncMessage('Reading local files...');
      const localFiles = await getLocalFiles(props.vaultPath);

      // Get remote files
      setSyncMessage('Fetching remote files...');
      const remoteFiles = await engine.fetchVaultFiles(vault);

      // Create a map of remote files by path
      const remoteFileMap = new Map(remoteFiles.map(f => [f.data.path, f]));

      // Get locally deleted files that need to be synced
      const locallyDeletedPaths = JSON.parse(localStorage.getItem('deleted_paths') || '[]') as string[];
      const localFilePathSet = new Set(localFiles.map(f => f.path));

      // Push local files that are new or changed
      let uploadedCount = 0;
      let downloadedCount = 0;
      let deletedCount = 0;
      let movedCount = 0;

      // Rate limit: delay between uploads to avoid spamming relays
      const UPLOAD_DELAY_MS = 500; // 500ms between uploads
      
      // Collect local-only files for move detection
      const localOnlyFiles: typeof localFiles = [];
      
      for (const localFile of localFiles) {
        const remoteFile = remoteFileMap.get(localFile.path);

        if (remoteFile) {
          // Check if file needs to be uploaded (content changed)
          if (remoteFile.data.content !== localFile.content) {
            setSyncMessage(`Uploading ${localFile.path}... (${uploadedCount + 1} files)`);
            const result = await engine.publishFile(vault, localFile.path, localFile.content, remoteFile);
            vault = result.vault;
            uploadedCount++;
            
            if (uploadedCount > 0) {
              await new Promise(resolve => setTimeout(resolve, UPLOAD_DELAY_MS));
            }
          }
          remoteFileMap.delete(localFile.path);
        } else {
          // Local-only file - collect for move detection
          localOnlyFiles.push(localFile);
        }
      }

      // Process local deletions - sync them to the vault
      const pathsToKeepTracking: string[] = [];
      
      for (const deletedPath of locallyDeletedPaths) {
        const inRemoteMap = remoteFileMap.has(deletedPath);
        const inLocalFiles = localFilePathSet.has(deletedPath);
        
        // Only process if the file exists on remote and not locally
        if (inRemoteMap && !inLocalFiles) {
          setSyncMessage(`Syncing deletion: ${deletedPath}`);
          try {
            vault = await engine.deleteFile(vault, deletedPath);
            deletedCount++;
          } catch {
            // Keep tracking this path since deletion failed
            pathsToKeepTracking.push(deletedPath);
          }
        } else if (inLocalFiles) {
          // File still exists locally (was recreated?), keep tracking
          pathsToKeepTracking.push(deletedPath);
        }
        // Remove from remoteFileMap so we don't re-download it
        remoteFileMap.delete(deletedPath);
      }
      
      // Update the locally deleted paths - only keep those that need continued tracking
      localStorage.setItem('deleted_paths', JSON.stringify(pathsToKeepTracking));

      // --- Move detection (3 layers) ---
      const dtagMap = JSON.parse(localStorage.getItem('file_dtag_map') || '{}') as Record<string, string>;
      const remoteByDtag = new Map(remoteFiles.map(f => [f.d, f]));

      // Layer 1: Explicitly tracked moves (from in-app rename/move operations)
      const movedPaths = JSON.parse(localStorage.getItem('moved_paths') || '[]') as Array<{ from: string; to: string }>;
      const movesToKeep: Array<{ from: string; to: string }> = [];
      
      for (const move of movedPaths) {
        const remoteFile = remoteFileMap.get(move.from);
        const localFile = localOnlyFiles.find(f => f.path === move.to);
        
        if (remoteFile && localFile) {
          setSyncMessage(`Processing move: ${move.from} -> ${move.to}`);
          try {
            const result = await engine.moveFile(vault, move.from, move.to, localFile.content);
            vault = result.vault;
            movedCount++;
            remoteFileMap.delete(move.from);
            const idx = localOnlyFiles.indexOf(localFile);
            if (idx >= 0) localOnlyFiles.splice(idx, 1);
          } catch (err) {
            console.error(`[Sync] Failed to process tracked move ${move.from} -> ${move.to}:`, err);
            movesToKeep.push(move);
          }
        } else if (remoteFile && !localFile) {
          movesToKeep.push(move);
        }
      }
      
      localStorage.setItem('moved_paths', JSON.stringify(movesToKeep));

      // Layer 2: d-tag map matching (handles move+edit)
      if (localOnlyFiles.length > 0) {
        const dtagMatchedIndices = new Set<number>();
        
        for (let i = 0; i < localOnlyFiles.length; i++) {
          const localFile = localOnlyFiles[i];
          const knownDtag = dtagMap[localFile.path];
          if (!knownDtag) continue;
          
          const remoteFile = remoteByDtag.get(knownDtag);
          if (!remoteFile) continue;
          if (remoteFile.data.path === localFile.path) continue;
          if (!remoteFileMap.has(remoteFile.data.path)) continue;
          
          setSyncMessage(`Processing move: ${remoteFile.data.path} -> ${localFile.path}`);
          try {
            const result = await engine.moveFile(vault, remoteFile.data.path, localFile.path, localFile.content);
            vault = result.vault;
            movedCount++;
            remoteFileMap.delete(remoteFile.data.path);
            dtagMatchedIndices.add(i);
          } catch (err) {
            console.error(`[Sync] Failed to process d-tag move ${remoteFile.data.path} -> ${localFile.path}:`, err);
          }
        }
        
        for (let i = localOnlyFiles.length - 1; i >= 0; i--) {
          if (dtagMatchedIndices.has(i)) {
            localOnlyFiles.splice(i, 1);
          }
        }
      }

      // Layer 3: SHA-256 content matching (fallback for system file manager moves)
      if (localOnlyFiles.length > 0 && remoteFileMap.size > 0) {
        const remoteByChecksum = new Map<string, Array<{ path: string; file: typeof remoteFiles[0] }>>();
        for (const [path, file] of remoteFileMap) {
          const cs = file.data.checksum;
          if (!remoteByChecksum.has(cs)) {
            remoteByChecksum.set(cs, []);
          }
          remoteByChecksum.get(cs)!.push({ path, file });
        }

        const matchedLocalIndices = new Set<number>();
        
        for (let i = 0; i < localOnlyFiles.length; i++) {
          const localFile = localOnlyFiles[i];
          const localChecksum = calculateChecksum(localFile.content);
          const candidates = remoteByChecksum.get(localChecksum);
          
          if (candidates && candidates.length > 0) {
            const match = candidates.shift()!;
            if (candidates.length === 0) {
              remoteByChecksum.delete(localChecksum);
            }
            
            setSyncMessage(`Processing move: ${match.path} -> ${localFile.path}`);
            try {
              const result = await engine.moveFile(vault, match.path, localFile.path, localFile.content);
              vault = result.vault;
              movedCount++;
              remoteFileMap.delete(match.path);
              matchedLocalIndices.add(i);
            } catch (err) {
              console.error(`[Sync] Failed to process checksum move ${match.path} -> ${localFile.path}:`, err);
            }
          }
        }
        
        for (let i = localOnlyFiles.length - 1; i >= 0; i--) {
          if (matchedLocalIndices.has(i)) {
            localOnlyFiles.splice(i, 1);
          }
        }
      }

      // Upload remaining local-only files (truly new files)
      for (const localFile of localOnlyFiles) {
        setSyncMessage(`Uploading ${localFile.path}... (${uploadedCount + 1} files)`);
        const result = await engine.publishFile(vault, localFile.path, localFile.content);
        vault = result.vault;
        uploadedCount++;
        
        if (uploadedCount > 0) {
          await new Promise(resolve => setTimeout(resolve, UPLOAD_DELAY_MS));
        }
      }

      // Download remote-only files (files on Nostr but not locally)
      for (const [path, remoteFile] of remoteFileMap) {
        // Skip if in vault's deleted list
        if (vault.data.deleted?.some(d => d.path === path)) {
          continue;
        }
        
        // Skip if locally deleted (but not yet synced)
        // Also check for folder deletions - if any deleted path is a prefix of this file path
        const isLocallyDeleted = locallyDeletedPaths.some(deletedPath => 
          path === deletedPath || path.startsWith(deletedPath + '/')
        );
        if (isLocallyDeleted) {
          continue;
        }

        setSyncMessage(`Downloading ${path}...`);
        const fullPath: string = `${props.vaultPath}/${path}`;

        // Ensure parent directory exists
        const parentDir: string = fullPath.substring(0, fullPath.lastIndexOf('/'));
        if (parentDir !== props.vaultPath) {
          await platform.vault.createFolder(parentDir, props.vaultPath ?? '').catch(() => {});
        }

        await platform.vault.write(fullPath, remoteFile.data.content, props.vaultPath ?? '');
        downloadedCount++;
      }

      // Persist the d-tag map from the final vault state
      const updatedDtagMap: Record<string, string> = {};
      for (const fileEntry of vault.data.files) {
        updatedDtagMap[fileEntry.path] = fileEntry.d;
      }
      localStorage.setItem('file_dtag_map', JSON.stringify(updatedDtagMap));

      setSyncStatus('success');
      const totalSynced = vault.data.files?.length || 0;
      const parts = [];
      if (uploadedCount > 0) parts.push(`${uploadedCount} uploaded`);
      if (downloadedCount > 0) parts.push(`${downloadedCount} downloaded`);
      if (deletedCount > 0) parts.push(`${deletedCount} deleted`);
      if (movedCount > 0) parts.push(`${movedCount} moved`);
      if (parts.length === 0) {
        setSyncMessage(`Sync complete: all ${totalSynced} files up to date`);
      } else {
        setSyncMessage(`Sync complete: ${parts.join(', ')} (${totalSynced} total)`);
      }

      // Refresh file explorer if files were downloaded
      if (downloadedCount > 0) {
        props.onSyncComplete?.();
      }

      // Clear success message after 3 seconds
      setTimeout(() => {
        if (syncStatus() === 'success') {
          setSyncStatus('idle');
          setSyncMessage(null);
        }
      }, 3000);
    } catch (err) {
      console.error('Sync failed:', err);
      setSyncStatus('error');
      setSyncMessage(err instanceof Error ? err.message : 'Sync failed');
    }
  };

  const handleOverlayClick = (e: MouseEvent) => {
    if (e.target === e.currentTarget) {
      props.onClose();
    }
  };

  // File recovery handlers
  const handleScanForRecoverableFiles = async () => {
    if (!signer() || !props.vaultPath) return;

    setRecoveryLoading(true);
    setRecoveryMessage('Scanning Nostr for deleted files...');
    setRecoverableFiles([]);

    try {
      const engine = getSyncEngine();
      
      // Fetch all vaults
      const vaults = await engine.fetchVaults();
      if (vaults.length === 0) {
        setRecoveryMessage('No vault found on Nostr.');
        setRecoveryLoading(false);
        return;
      }

      const vault = vaults[0];
      
      // Get deleted files from vault index
      const deletedFiles = vault.data.deleted || [];
      
      if (deletedFiles.length === 0) {
        setRecoveryMessage('No deleted files found.');
        setRecoveryLoading(false);
        return;
      }

      // Fetch the actual file content for each deleted file
      const recoverable: RecoverableFile[] = [];
      
      for (const deleted of deletedFiles) {
        // Check if we can recover from the lastEventId
        if (deleted.lastEventId) {
          // The file content might still be available on relays
          // For now, we'll show what's in the deleted list
          recoverable.push({
            path: deleted.path,
            content: '', // We'll fetch content when recovering
            deletedAt: deleted.deletedAt,
            eventId: deleted.lastEventId,
          });
        }
      }

      setRecoverableFiles(recoverable);
      setRecoveryMessage(recoverable.length > 0 
        ? `Found ${recoverable.length} recoverable file(s).`
        : 'No recoverable files found.');
    } catch (err) {
      console.error('Recovery scan failed:', err);
      setRecoveryMessage(err instanceof Error ? err.message : 'Scan failed');
    } finally {
      setRecoveryLoading(false);
    }
  };

  const handleRecoverFile = async (file: RecoverableFile) => {
    if (!props.vaultPath) return;

    setRecoveringFile(file.path);
    
    try {
      const engine = getSyncEngine();
      
      // Fetch the file content from Nostr using the event ID
      const events = await engine['pool'].querySync(
        engine.getConfig().relays,
        { ids: [file.eventId] }
      );
      
      if (events.length === 0) {
        throw new Error('File content not found on relays');
      }
      
      const event = events[0];
      
      // Decrypt the content
      const decrypted = await engine['decryptContent'](event.content);
      const data = JSON.parse(decrypted);
      
      // Write the file locally
      const fullPath = `${props.vaultPath}/${file.path}`;
      const parentDir = fullPath.substring(0, fullPath.lastIndexOf('/'));
      
      if (parentDir !== props.vaultPath) {
        await platform.vault.createFolder(parentDir, props.vaultPath ?? '').catch(() => {});
      }

      await platform.vault.write(fullPath, data.content, props.vaultPath ?? '');
      
      // Remove from recoverable list
      setRecoverableFiles(prev => prev.filter(f => f.path !== file.path));
      
      // Remove from local deleted_paths if present
      const deletedPaths = JSON.parse(localStorage.getItem('deleted_paths') || '[]') as string[];
      const updatedDeleted = deletedPaths.filter(p => p !== file.path);
      localStorage.setItem('deleted_paths', JSON.stringify(updatedDeleted));
      
      setRecoveryMessage(`Recovered: ${file.path}`);
      
      // Refresh file explorer
      props.onSyncComplete?.();
      
      // Clear message after 3 seconds
      setTimeout(() => {
        setRecoveryMessage(prev => prev === `Recovered: ${file.path}` ? null : prev);
      }, 3000);
    } catch (err) {
      console.error('Recovery failed:', err);
      setRecoveryMessage(`Failed to recover ${file.path}: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setRecoveringFile(null);
    }
  };

  const handleClearDeletedHistory = async () => {
    // Clear local deleted paths tracking
    localStorage.setItem('deleted_paths', '[]');
    setRecoverableFiles([]);
    setRecoveryMessage('Deleted files history cleared.');
    
    setTimeout(() => {
      setRecoveryMessage(null);
    }, 3000);
  };

  // Wikilinks toggle handler
  const handleWikilinksToggle = (enabled: boolean) => {
    setUseWikilinks(enabled);
    localStorage.setItem('use_wikilinks', String(enabled));
  };

  return (
    <div class="settings-overlay" onClick={handleOverlayClick}>
      <div class="settings-modal">
        {/* Settings Sidebar */}
        <div class="settings-sidebar">
          <div class="settings-sidebar-header">Settings</div>
          <div class="settings-nav">
            <For each={filteredSections()}>
              {(section) => (
                <button
                  class={`settings-nav-item ${activeSection() === section.id ? 'active' : ''}`}
                  onClick={() => setActiveSection(section.id)}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d={section.icon}></path>
                  </svg>
                  <span>{section.label}</span>
                </button>
              )}
            </For>
          </div>
        </div>

        {/* Settings Content */}
        <div class="settings-content">
          <div class="settings-content-header">
            <h2>{filteredSections().find(s => s.id === activeSection())?.label}</h2>
            <button class="settings-close" onClick={props.onClose}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>

          <div class="settings-content-body">
            {/* General Settings */}
            <Show when={activeSection() === 'general'}>
              <div class="settings-section">
                <div class="setting-item">
                  <div class="setting-info">
                    <div class="setting-name">Language</div>
                    <div class="setting-description">Select the display language for the interface</div>
                  </div>
                  <select class="setting-select">
                    <option value="en">English</option>
                  </select>
                </div>

                <div class="setting-item">
                  <div class="setting-info">
                    <div class="setting-name">Auto-save</div>
                    <div class="setting-description">Automatically save files after changes</div>
                  </div>
                  <label class="setting-toggle">
                    <input type="checkbox" checked />
                    <span class="toggle-slider"></span>
                  </label>
                </div>

                <div class="setting-item">
                  <div class="setting-info">
                    <div class="setting-name">Auto-save delay</div>
                    <div class="setting-description">Time in seconds before auto-saving</div>
                  </div>
                  <input type="number" class="setting-input" value="2" min="1" max="60" />
                </div>

                <div class="settings-divider" />

                <div class="settings-section-title">Daily Notes</div>

                <div class="setting-item">
                  <div class="setting-info">
                    <div class="setting-name">Enable Daily Notes</div>
                    <div class="setting-description">Create a new note for each day</div>
                  </div>
                  <label class="setting-toggle">
                    <input 
                      type="checkbox" 
                      checked={dailyNotesConfig().enabled}
                      onChange={(e) => {
                        const newConfig = { ...dailyNotesConfig(), enabled: e.currentTarget.checked };
                        setDailyNotesConfig(newConfig);
                        saveDailyNotesConfig(newConfig);
                      }}
                    />
                    <span class="toggle-slider"></span>
                  </label>
                </div>

                <div class="setting-item">
                  <div class="setting-info">
                    <div class="setting-name">Daily Notes folder</div>
                    <div class="setting-description">Folder where daily notes will be created</div>
                  </div>
                  <input
                    type="text"
                    class="setting-input wide"
                    value={dailyNotesConfig().folder}
                    onInput={(e) => {
                      const newConfig = { ...dailyNotesConfig(), folder: e.currentTarget.value };
                      setDailyNotesConfig(newConfig);
                      saveDailyNotesConfig(newConfig);
                    }}
                    placeholder="Daily Notes"
                  />
                </div>

                <div class="setting-item">
                  <div class="setting-info">
                    <div class="setting-name">Date format</div>
                    <div class="setting-description">Format for daily note filenames (e.g., YYYY-MM-DD)</div>
                  </div>
                  <input
                    type="text"
                    class="setting-input"
                    value={dailyNotesConfig().dateFormat}
                    onInput={(e) => {
                      const newConfig = { ...dailyNotesConfig(), dateFormat: e.currentTarget.value };
                      setDailyNotesConfig(newConfig);
                      saveDailyNotesConfig(newConfig);
                    }}
                    placeholder="YYYY-MM-DD"
                  />
                </div>

                <div class="setting-item full-width">
                  <div class="setting-info">
                    <div class="setting-name">Daily note template</div>
                    <div class="setting-description">
                      Content template for new daily notes. Use {'{{date}}'}, {'{{date:FORMAT}}'}, {'{{time}}'}, {'{{title}}'} for variables.
                    </div>
                  </div>
                  <textarea
                    class="setting-textarea"
                    rows={8}
                    value={dailyNotesConfig().template}
                    onInput={(e) => {
                      const newConfig = { ...dailyNotesConfig(), template: e.currentTarget.value };
                      setDailyNotesConfig(newConfig);
                      saveDailyNotesConfig(newConfig);
                    }}
                    placeholder="# {{date:MMMM D, YYYY}}&#10;&#10;## Tasks&#10;- [ ] &#10;&#10;## Notes&#10;"
                  />
                </div>

                <div class="setting-item">
                  <div class="setting-info">
                    <div class="setting-name">Reset to defaults</div>
                    <div class="setting-description">Reset daily notes settings to default values</div>
                  </div>
                  <button
                    class="setting-button secondary"
                    onClick={() => {
                      setDailyNotesConfig(DEFAULT_DAILY_NOTES_CONFIG);
                      saveDailyNotesConfig(DEFAULT_DAILY_NOTES_CONFIG);
                    }}
                  >
                    Reset
                  </button>
                </div>

                <div class="settings-divider" />

                <div class="settings-section-title">Templates</div>

                <div class="setting-item">
                  <div class="setting-info">
                    <div class="setting-name">Templates folder</div>
                    <div class="setting-description">Folder containing your note templates</div>
                  </div>
                  <input
                    type="text"
                    class="setting-input wide"
                    value={templatesConfig().folder}
                    onInput={(e) => {
                      const newConfig = { ...templatesConfig(), folder: e.currentTarget.value };
                      setTemplatesConfig(newConfig);
                      saveTemplatesConfig(newConfig);
                    }}
                    placeholder="Templates"
                  />
                </div>

                <div class="setting-item">
                  <div class="setting-info">
                    <div class="setting-name">Reset to defaults</div>
                    <div class="setting-description">Reset templates settings to default values</div>
                  </div>
                  <button
                    class="setting-button secondary"
                    onClick={() => {
                      setTemplatesConfig(DEFAULT_TEMPLATES_CONFIG);
                      saveTemplatesConfig(DEFAULT_TEMPLATES_CONFIG);
                    }}
                  >
                    Reset
                  </button>
                </div>

                <div class="settings-divider" />

                <div class="settings-section-title">AI Providers</div>

                <div class="setting-item">
                  <div class="setting-info">
                    <div class="setting-name">Custom Provider</div>
                    <div class="setting-description">Show Custom AI provider in the sidebar</div>
                  </div>
                  <label class="setting-toggle">
                    <input
                      type="checkbox"
                      checked={localStorage.getItem('custom_provider_enabled') !== 'false'}
                      onChange={(e) => {
                        localStorage.setItem('custom_provider_enabled', e.currentTarget.checked ? 'true' : 'false');
                        window.dispatchEvent(new CustomEvent('ai-provider-toggle'));
                      }}
                    />
                    <span class="toggle-slider"></span>
                  </label>
                </div>

                <div class="settings-divider" />

                <div class="setting-item">
                  <div class="setting-info">
                    <div class="setting-name">Welcome Tour</div>
                    <div class="setting-description">Show the welcome tour again to learn about Alfred features</div>
                  </div>
                  <button 
                    class="setting-button secondary"
                    onClick={() => {
                      localStorage.removeItem('onboarding_completed');
                      props.onClose();
                      // Trigger onboarding show via custom event
                      window.dispatchEvent(new CustomEvent('show-onboarding'));
                    }}
                  >
                    Show Welcome Tour
                  </button>
                </div>
              </div>
            </Show>

            {/* Editor Settings */}
            <Show when={activeSection() === 'editor'}>
              <div class="settings-section">
                <div class="setting-item">
                  <div class="setting-info">
                    <div class="setting-name">Font family</div>
                    <div class="setting-description">Font used in the editor</div>
                  </div>
                  <input
                    type="text"
                    class="setting-input wide"
                    value={editorFontFamily()}
                    onInput={(e) => {
                      const value = e.currentTarget.value;
                      setEditorFontFamily(value);
                      localStorage.setItem('editor_font_family', value);
                    }}
                  />
                </div>

                <div class="setting-item">
                  <div class="setting-info">
                    <div class="setting-name">Font size</div>
                    <div class="setting-description">Base font size in pixels</div>
                  </div>
                  <input
                    type="number"
                    class="setting-input"
                    value={editorFontSize()}
                    min="10"
                    max="32"
                    onInput={(e) => {
                      const value = parseInt(e.currentTarget.value) || 16;
                      setEditorFontSize(value);
                      localStorage.setItem('editor_font_size', value.toString());
                    }}
                  />
                </div>

                <div class="setting-item">
                  <div class="setting-info">
                    <div class="setting-name">Line height</div>
                    <div class="setting-description">Line height multiplier</div>
                  </div>
                  <input
                    type="number"
                    class="setting-input"
                    value={editorLineHeight()}
                    min="1"
                    max="3"
                    step="0.1"
                    onInput={(e) => {
                      const value = parseFloat(e.currentTarget.value) || 1.6;
                      setEditorLineHeight(value);
                      localStorage.setItem('editor_line_height', value.toString());
                    }}
                  />
                </div>

                <div class="setting-item">
                  <div class="setting-info">
                    <div class="setting-name">Show line numbers</div>
                    <div class="setting-description">Display line numbers in the editor</div>
                  </div>
                  <label class="setting-toggle">
                    <input
                      type="checkbox"
                      checked={showLineNumbers()}
                      onChange={(e) => {
                        const value = e.currentTarget.checked;
                        setShowLineNumbers(value);
                        localStorage.setItem('show_line_numbers', value.toString());
                      }}
                    />
                    <span class="toggle-slider"></span>
                  </label>
                </div>

                <div class="setting-item">
                  <div class="setting-info">
                    <div class="setting-name">Vim mode</div>
                    <div class="setting-description">Enable Vim keybindings in the editor</div>
                  </div>
                  <label class="setting-toggle">
                    <input
                      type="checkbox"
                      checked={vimMode()}
                      onChange={(e) => {
                        const value = e.currentTarget.checked;
                        setVimMode(value);
                        localStorage.setItem('vim_mode', value.toString());
                      }}
                    />
                    <span class="toggle-slider"></span>
                  </label>
                </div>

                <div class="setting-item">
                  <div class="setting-info">
                    <div class="setting-name">Spell check</div>
                    <div class="setting-description">Enable spell checking</div>
                  </div>
                  <label class="setting-toggle">
                    <input
                      type="checkbox"
                      checked={spellCheck()}
                      onChange={(e) => {
                        const value = e.currentTarget.checked;
                        setSpellCheck(value);
                        localStorage.setItem('spell_check', value.toString());
                      }}
                    />
                    <span class="toggle-slider"></span>
                  </label>
                </div>

                <p class="setting-note">Note: Editor changes take effect when you reload the app or open a new file.</p>
              </div>
            </Show>

            {/* Files & Links Settings */}
            <Show when={activeSection() === 'files'}>
              <div class="settings-section">
                <div class="setting-item">
                  <div class="setting-info">
                    <div class="setting-name">Default location for new notes</div>
                    <div class="setting-description">Where new notes are created</div>
                  </div>
                  <select class="setting-select">
                    <option value="root">Vault root</option>
                    <option value="current">Current folder</option>
                  </select>
                </div>

                <div class="setting-item">
                  <div class="setting-info">
                    <div class="setting-name">New link format</div>
                    <div class="setting-description">Format for created links</div>
                  </div>
                  <select class="setting-select">
                    <option value="shortest">Shortest path</option>
                    <option value="relative">Relative path</option>
                    <option value="absolute">Absolute path</option>
                  </select>
                </div>

                <div class="setting-item">
                  <div class="setting-info">
                    <div class="setting-name">Use [[Wikilinks]]</div>
                    <div class="setting-description">Use wikilink syntax instead of markdown links</div>
                  </div>
                  <label class="setting-toggle">
                    <input
                      type="checkbox"
                      checked={useWikilinks()}
                      onChange={(e) => handleWikilinksToggle(e.target.checked)}
                    />
                    <span class="toggle-slider"></span>
                  </label>
                </div>

                <div class="setting-item">
                  <div class="setting-info">
                    <div class="setting-name">Automatically update internal links</div>
                    <div class="setting-description">Update links when files are renamed or moved</div>
                  </div>
                  <label class="setting-toggle">
                    <input type="checkbox" checked />
                    <span class="toggle-slider"></span>
                  </label>
                </div>

                <div class="setting-item">
                  <div class="setting-info">
                    <div class="setting-name">Attachment folder path</div>
                    <div class="setting-description">Where attachments are stored</div>
                  </div>
                  <input type="text" class="setting-input wide" value="attachments" />
                </div>
              </div>
            </Show>

            {/* Appearance Settings */}
            <Show when={activeSection() === 'appearance'}>
              <div class="settings-section">
                <div class="setting-item">
                  <div class="setting-info">
                    <div class="setting-name">Theme</div>
                    <div class="setting-description">Color theme for the application</div>
                  </div>
                  <select
                    class="setting-select"
                    value={theme()}
                    onChange={(e) => {
                      const value = e.currentTarget.value as 'dark' | 'light' | 'system';
                      setTheme(value);
                      localStorage.setItem('theme', value);
                      // Auto-apply the default brass accent for the dark theme
                      if (value === 'dark') {
                        const brass = '#b8863d';
                        setAccentColor(brass);
                        localStorage.setItem('accent_color', brass);
                      }
                      applyAppearanceSettings();
                    }}
                  >
                    <option value="dark">Dark</option>
                    <option value="light">Light</option>
                    <option value="system">System</option>
                  </select>
                </div>

                <div class="setting-item">
                  <div class="setting-info">
                    <div class="setting-name">Accent color</div>
                    <div class="setting-description">Primary accent color</div>
                  </div>
                  <input
                    type="color"
                    class="setting-color"
                    value={accentColor()}
                    onInput={(e) => {
                      const value = e.currentTarget.value;
                      setAccentColor(value);
                      localStorage.setItem('accent_color', value);
                      applyAppearanceSettings();
                    }}
                  />
                </div>

                <div class="setting-item">
                  <div class="setting-info">
                    <div class="setting-name">Interface font size</div>
                    <div class="setting-description">Font size for UI elements</div>
                  </div>
                  <select
                    class="setting-select"
                    value={interfaceFontSize()}
                    onChange={(e) => {
                      const value = e.currentTarget.value as 'small' | 'medium' | 'large';
                      setInterfaceFontSize(value);
                      localStorage.setItem('interface_font_size', value);
                      applyAppearanceSettings();
                    }}
                  >
                    <option value="small">Small</option>
                    <option value="medium">Medium</option>
                    <option value="large">Large</option>
                  </select>
                </div>

                <div class="setting-item">
                  <div class="setting-info">
                    <div class="setting-name">Translucent window</div>
                    <div class="setting-description">Enable window translucency effects</div>
                  </div>
                  <label class="setting-toggle">
                    <input
                      type="checkbox"
                      checked={translucentWindow()}
                      onChange={(e) => {
                        const value = e.currentTarget.checked;
                        setTranslucentWindow(value);
                        localStorage.setItem('translucent_window', value.toString());
                        applyAppearanceSettings();
                      }}
                    />
                    <span class="toggle-slider"></span>
                  </label>
                </div>
              </div>
            </Show>

            {/* Hotkeys Settings */}
            <Show when={activeSection() === 'hotkeys'}>
              <div class="settings-section">
                <div class="setting-item">
                  <div class="setting-info">
                    <div class="setting-name">Quick switcher</div>
                    <div class="setting-description">Open file quick switcher</div>
                  </div>
                  <div class="hotkey-display">Ctrl + O</div>
                </div>

                <div class="setting-item">
                  <div class="setting-info">
                    <div class="setting-name">Command palette</div>
                    <div class="setting-description">Open command palette</div>
                  </div>
                  <div class="hotkey-display">Ctrl + P</div>
                </div>

                <div class="setting-item">
                  <div class="setting-info">
                    <div class="setting-name">Search in files</div>
                    <div class="setting-description">Search across all files</div>
                  </div>
                  <div class="hotkey-display">Ctrl + Shift + F</div>
                </div>

                <div class="setting-item">
                  <div class="setting-info">
                    <div class="setting-name">Save file</div>
                    <div class="setting-description">Save current file</div>
                  </div>
                  <div class="hotkey-display">Ctrl + S</div>
                </div>

                <div class="setting-item">
                  <div class="setting-info">
                    <div class="setting-name">Close</div>
                    <div class="setting-description">Close modals and panels</div>
                  </div>
                  <div class="hotkey-display">Escape</div>
                </div>
              </div>
            </Show>

            {/* Custom Provider */}
            <Show when={activeSection() === 'customprovider'}>
              <div class="settings-section">
                <div class="settings-section-title">Custom Provider Configuration</div>

                <div class="settings-notice">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="16" x2="12" y2="12"></line>
                    <line x1="12" y1="8" x2="12.01" y2="8"></line>
                  </svg>
                  <p>Connect to any OpenAI-compatible API provider. Works with MapleAI Proxy, Ollama, LM Studio, vLLM, and more.</p>
                </div>

                <div class="settings-section-title">Display Name</div>
                <div class="setting-item">
                  <div class="setting-info">
                    <div class="setting-name">Provider Name</div>
                    <div class="setting-description">Name shown in the chat panel header</div>
                  </div>
                </div>
                <div class="setting-item column">
                  <input
                    type="text"
                    class="setting-input wide"
                    placeholder="MapleAI"
                    value={customProviderName()}
                    onInput={(e) => handleCustomProviderNameChange(e.currentTarget.value)}
                  />
                </div>

                <div class="settings-section-title">Server URL</div>
                <div class="setting-item">
                  <div class="setting-info">
                    <div class="setting-name">Base URL</div>
                    <div class="setting-description">The base URL of your OpenAI-compatible API server</div>
                  </div>
                </div>
                <div class="setting-item column">
                  <input
                    type="text"
                    class="setting-input wide"
                    placeholder="http://localhost:8080"
                    value={customProviderUrl()}
                    onInput={(e) => handleCustomProviderUrlChange(e.currentTarget.value)}
                  />
                </div>

                <div class="settings-section-title">API Key</div>
                <div class="setting-item">
                  <div class="setting-info">
                    <div class="setting-name">API Key</div>
                    <div class="setting-description">Optional. Required by some providers (MapleAI, OpenRouter). Not needed for local servers like Ollama.</div>
                  </div>
                </div>
                <div class="setting-item column">
                  <div class="custom-provider-token-input">
                    <input
                      type={customProviderApiKeyVisible() ? 'text' : 'password'}
                      class="setting-input wide"
                      placeholder="sk-..."
                      value={customProviderApiKey()}
                      onInput={(e) => handleCustomProviderApiKeyChange(e.currentTarget.value)}
                    />
                    <button
                      class="token-toggle-btn"
                      onClick={() => setCustomProviderApiKeyVisible(!customProviderApiKeyVisible())}
                      title={customProviderApiKeyVisible() ? 'Hide' : 'Show'}
                    >
                      <Show when={customProviderApiKeyVisible()} fallback={
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                          <circle cx="12" cy="12" r="3"></circle>
                        </svg>
                      }>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                          <line x1="1" y1="1" x2="23" y2="23"></line>
                        </svg>
                      </Show>
                    </button>
                  </div>
                </div>

                <div class="settings-section-title">Model</div>
                <div class="setting-item">
                  <div class="setting-info">
                    <div class="setting-name">Fetch Available Models</div>
                    <div class="setting-description">Query the provider's /v1/models endpoint</div>
                  </div>
                  <button
                    class="setting-button"
                    onClick={handleFetchCustomProviderModels}
                    disabled={!customProviderUrl() || customProviderModelsLoading()}
                  >
                    {customProviderModelsLoading() ? 'Fetching...' : 'Fetch Models'}
                  </button>
                </div>
                <Show when={customProviderModels().length > 0}>
                  <div class="setting-item">
                    <div class="setting-info">
                      <div class="setting-name">Select Model</div>
                      <div class="setting-description">Choose which model to use for chat completions</div>
                    </div>
                    <select
                      class="setting-select"
                      value={customProviderModel()}
                      onChange={(e) => handleCustomProviderModelChange(e.currentTarget.value)}
                    >
                      <option value="">Select a model...</option>
                      <For each={customProviderModels()}>
                        {(model) => <option value={model}>{model}</option>}
                      </For>
                    </select>
                  </div>
                </Show>
                <Show when={customProviderModels().length === 0 && !customProviderModelsLoading()}>
                  <div class="setting-item">
                    <div class="setting-info">
                      <div class="setting-description">No models loaded yet. Enter a URL and click "Fetch Models".</div>
                    </div>
                  </div>
                </Show>

                <div class="settings-section-title">Connection Test</div>
                <div class="setting-item">
                  <div class="setting-info">
                    <div class="setting-name">Test Connection</div>
                    <div class="setting-description">Verify connectivity to your provider</div>
                  </div>
                  <button
                    class="setting-button"
                    onClick={handleTestCustomProviderConnection}
                    disabled={!customProviderUrl() || customProviderTestStatus() === 'testing'}
                  >
                    {customProviderTestStatus() === 'testing' ? 'Testing...' : 'Test Connection'}
                  </button>
                </div>

                <Show when={customProviderTestStatus() === 'success'}>
                  <div class="settings-notice success">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                    <p>Connection successful!</p>
                  </div>
                </Show>

                <Show when={customProviderTestStatus() === 'error'}>
                  <div class="settings-notice warning">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <circle cx="12" cy="12" r="10"></circle>
                      <line x1="15" y1="9" x2="9" y2="15"></line>
                      <line x1="9" y1="9" x2="15" y2="15"></line>
                    </svg>
                    <p>{customProviderTestError() || 'Connection failed'}</p>
                  </div>
                </Show>

                <div class="settings-section-title">Quick Setup Guides</div>
                <div class="custom-provider-guides">
                    <div class="custom-provider-guide">
                      <strong>MapleAI Proxy</strong>
                      <p>URL: <code>http://localhost:8080</code></p>
                      <p>API Key: Your Maple API key</p>
                      <p>Models fetched dynamically from proxy</p>
                    </div>
                    <div class="custom-provider-guide">
                      <strong>Ollama</strong>
                      <p>URL: <code>http://localhost:11434</code></p>
                      <p>API Key: Not required</p>
                      <p>Models: Your locally pulled models</p>
                    </div>
                    <div class="custom-provider-guide">
                      <strong>LM Studio</strong>
                      <p>URL: <code>http://localhost:1234</code></p>
                      <p>API Key: Not required</p>
                      <p>Models: Your loaded models</p>
                    </div>
                </div>
              </div>
            </Show>

            {/* Sync Settings */}
            <Show when={activeSection() === 'sync'}>
              <div class="settings-section">
                <div class="settings-section-title">Sync Status</div>

                <Show when={!signer()}>
                  <div class="settings-notice warning">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                      <line x1="12" y1="9" x2="12" y2="13"></line>
                      <line x1="12" y1="17" x2="12.01" y2="17"></line>
                    </svg>
                    <p>You need to configure a Nostr identity before enabling sync. Go to the <button class="link-button" onClick={() => setActiveSection('nostr')}>Nostr settings</button> to generate or import keys.</p>
                  </div>
                </Show>

                <div class="setting-item">
                  <div class="setting-info">
                    <div class="setting-name">Enable sync</div>
                    <div class="setting-description">Sync this vault using Nostr relays</div>
                  </div>
                  <label class="setting-toggle">
                    <input
                      type="checkbox"
                      checked={syncEnabled()}
                      disabled={!signer()}
                      onChange={(e) => handleSyncToggle(e.currentTarget.checked)}
                    />
                    <span class="toggle-slider"></span>
                  </label>
                </div>

                <Show when={syncEnabled() && signer()}>
                  <div class="sync-status-display">
                    <div class="sync-status-indicator idle">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                      <span>Ready to sync</span>
                    </div>
                  </div>
                </Show>

                <div class="settings-notice">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="16" x2="12" y2="12"></line>
                    <line x1="12" y1="8" x2="12.01" y2="8"></line>
                  </svg>
                  <p>Sync is optional and disabled by default. Your notes are stored locally and can be synced using any method you prefer (Git, Dropbox, etc). Enable Nostr sync for encrypted, decentralized sync across devices.</p>
                </div>

                <Show when={syncEnabled()}>
                  <div class="settings-section-title">Sync Options</div>
                  <div class="setting-item">
                    <div class="setting-info">
                      <div class="setting-name">Sync on startup</div>
                      <div class="setting-description">Automatically sync when opening the app</div>
                    </div>
                    <label class="setting-toggle">
                      <input
                        type="checkbox"
                        checked={syncOnStartup()}
                        onChange={(e) => handleSyncOnStartupToggle(e.currentTarget.checked)}
                      />
                      <span class="toggle-slider"></span>
                    </label>
                  </div>

                  <div class="setting-item">
                    <div class="setting-info">
                      <div class="setting-name">Sync frequency</div>
                      <div class="setting-description">How often to sync changes automatically</div>
                    </div>
                    <select
                      class="setting-select"
                      value={syncFrequency()}
                      onChange={(e) => handleSyncFrequencyChange(e.currentTarget.value as 'onsave' | '5min' | 'manual')}
                    >
                      <option value="onsave">On file save</option>
                      <option value="5min">Every 5 minutes</option>
                      <option value="manual">Manual only</option>
                    </select>
                  </div>

                  <div class="settings-section-title">Actions</div>
                  <div class="setting-item">
                    <div class="setting-info">
                      <div class="setting-name">Manual sync</div>
                      <div class="setting-description">Sync all files now</div>
                    </div>
                    <button
                      class="setting-button"
                      onClick={handleSyncNow}
                      disabled={syncStatus() === 'syncing'}
                    >
                      {syncStatus() === 'syncing' ? 'Syncing...' : 'Sync Now'}
                    </button>
                  </div>

                  <Show when={syncMessage()}>
                    <div class={`sync-feedback ${syncStatus()}`}>
                      <Show when={syncStatus() === 'syncing'}>
                        <div class="spinner small"></div>
                      </Show>
                      <Show when={syncStatus() === 'success'}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                      </Show>
                      <Show when={syncStatus() === 'error'}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <circle cx="12" cy="12" r="10"></circle>
                          <line x1="15" y1="9" x2="9" y2="15"></line>
                          <line x1="9" y1="9" x2="15" y2="15"></line>
                        </svg>
                      </Show>
                      <span>{syncMessage()}</span>
                    </div>
                  </Show>

                  {/* File Recovery Section */}
                  <div class="settings-section-title">File Recovery</div>
                  <div class="settings-notice">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M3 6h18"></path>
                      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                      <line x1="10" y1="11" x2="10" y2="17"></line>
                      <line x1="14" y1="11" x2="14" y2="17"></line>
                    </svg>
                    <p>Recover files that were deleted locally but may still exist on Nostr relays. This is a failsafe for accidental deletions.</p>
                  </div>

                  <div class="setting-item">
                    <div class="setting-info">
                      <div class="setting-name">Scan for recoverable files</div>
                      <div class="setting-description">Search Nostr for deleted files that can be restored</div>
                    </div>
                    <button
                      class="setting-button"
                      onClick={handleScanForRecoverableFiles}
                      disabled={recoveryLoading()}
                    >
                      {recoveryLoading() ? 'Scanning...' : 'Scan'}
                    </button>
                  </div>

                  <Show when={recoveryMessage()}>
                    <div class="sync-feedback idle">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="16" x2="12" y2="12"></line>
                        <line x1="12" y1="8" x2="12.01" y2="8"></line>
                      </svg>
                      <span>{recoveryMessage()}</span>
                    </div>
                  </Show>

                  <Show when={recoverableFiles().length > 0}>
                    <div class="recoverable-files-list">
                      <For each={recoverableFiles()}>
                        {(file) => (
                          <div class="recoverable-file-item">
                            <div class="recoverable-file-info">
                              <div class="recoverable-file-path">{file.path}</div>
                              <div class="recoverable-file-date">
                                Deleted: {new Date(file.deletedAt * 1000).toLocaleString()}
                              </div>
                            </div>
                            <button
                              class="setting-button small"
                              onClick={() => handleRecoverFile(file)}
                              disabled={recoveringFile() === file.path}
                            >
                              {recoveringFile() === file.path ? 'Recovering...' : 'Recover'}
                            </button>
                          </div>
                        )}
                      </For>
                    </div>
                  </Show>

                  <div class="setting-item">
                    <div class="setting-info">
                      <div class="setting-name">Clear deletion history</div>
                      <div class="setting-description">Remove local tracking of deleted files (prevents re-download on next sync)</div>
                    </div>
                    <button
                      class="setting-button secondary"
                      onClick={handleClearDeletedHistory}
                    >
                      Clear History
                    </button>
                  </div>
                </Show>
              </div>
            </Show>

            {/* Nostr Settings */}
            <Show when={activeSection() === 'nostr'}>
              <div class="settings-section">
                <div class="settings-section-title">Identity</div>

                {/* Logged in state */}
                <Show when={currentLogin()}>
                  <div class="login-info-card">
                    <div class="login-info-header">
                      <div class="login-avatar">
                        <Show when={userProfile()?.picture} fallback={
                          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                            <circle cx="12" cy="7" r="4"></circle>
                          </svg>
                        }>
                          <img src={userProfile()!.picture} alt="Profile" class="login-avatar-img" />
                        </Show>
                      </div>
                      <div class="login-info-details">
                        <Show when={userProfile()?.displayName || userProfile()?.name} fallback={
                          <div class="login-name">Anonymous</div>
                        }>
                          <div class="login-name">{userProfile()?.displayName || userProfile()?.name}</div>
                        </Show>
                        <div class="login-meta">
                          <span class="login-type-badge">Local Key</span>
                          <Show when={userProfile()?.nip05}>
                            <span class="login-nip05">{userProfile()!.nip05}</span>
                          </Show>
                        </div>
                        <div class="login-pubkey">{currentLogin()!.pubkey.slice(0, 12)}...{currentLogin()!.pubkey.slice(-6)}</div>
                      </div>
                      <button class="setting-button secondary logout-btn" onClick={handleLogout}>Logout</button>
                    </div>

                    {/* Show key details for nsec logins */}
                    <Show when={identity()}>
                      <div class="login-key-details">
                        <div class="setting-item">
                          <div class="setting-info">
                            <div class="setting-name">Public key (npub)</div>
                          </div>
                          <div class="setting-key-display">
                            <code class="key-value">{identity()!.npub}</code>
                            <button class="key-action-btn" onClick={() => copyToClipboard(identity()!.npub)} title="Copy">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                              </svg>
                            </button>
                          </div>
                        </div>
                        <div class="setting-item">
                          <div class="setting-info">
                            <div class="setting-name">Private key (nsec)</div>
                          </div>
                          <div class="setting-key-display">
                            <Show when={showPrivateKey()} fallback={<code class="key-value">••••••••••••••••••••••</code>}>
                              <code class="key-value">{identity()!.nsec}</code>
                            </Show>
                            <button class="key-action-btn" onClick={async () => {
                              if (!showPrivateKey() && isMobile()) {
                                // Require biometric to show nsec on mobile
                                const authenticated = await authenticateWithBiometric('View your private key');
                                if (!authenticated) return;
                              }
                              setShowPrivateKey(!showPrivateKey());
                            }} title={showPrivateKey() ? "Hide" : "Show"}>
                              <Show when={showPrivateKey()} fallback={
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                  <circle cx="12" cy="12" r="3"></circle>
                                </svg>
                              }>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"></path>
                                  <line x1="1" y1="1" x2="23" y2="23"></line>
                                </svg>
                              </Show>
                            </button>
                            <button class="key-action-btn" onClick={async () => {
                              if (isMobile()) {
                                // Require biometric to copy nsec on mobile
                                const authenticated = await authenticateWithBiometric('Copy your private key');
                                if (!authenticated) return;
                              }
                              copyToClipboard(identity()!.nsec);
                            }} title="Copy">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                              </svg>
                            </button>
                          </div>
                        </div>
                      </div>
                    </Show>
                  </div>

                  <div class="settings-notice warning">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                      <line x1="12" y1="9" x2="12" y2="13"></line>
                      <line x1="12" y1="17" x2="12.01" y2="17"></line>
                    </svg>
                    <p>Your private key gives full access to your Nostr identity. Keep it safe and never share it with anyone!</p>
                  </div>
                </Show>

                {/* Not logged in - show login options */}
                <Show when={!currentLogin()}>
                  <div class="login-tabs">
                    <button class={`login-tab ${loginTab() === 'import' ? 'active' : ''}`} onClick={() => setLoginTab('import')}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7 10 12 15 17 10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                      </svg>
                      Import Key
                    </button>
                    <button class={`login-tab ${loginTab() === 'generate' ? 'active' : ''}`} onClick={() => setLoginTab('generate')}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="3"></circle>
                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                      </svg>
                      Generate
                    </button>
                  </div>

                  <div class="login-tab-content">
                    {/* Import Key Tab */}
                    <Show when={loginTab() === 'import'}>
                      <div class="import-content">
                        <p class="import-description">
                          Enter your Nostr private key (nsec or hex format) to login. Your key will be stored securely on this device.
                        </p>
                        <div class="import-key-form">
                          <input
                            type="password"
                            class="setting-input wide"
                            placeholder="nsec1... or hex private key"
                            value={importKeyInput()}
                            onInput={(e) => setImportKeyInput(e.currentTarget.value)}
                            onKeyPress={(e) => e.key === 'Enter' && handleImportKey()}
                            disabled={loginLoading()}
                          />
                          <button class="setting-button" onClick={handleImportKey} disabled={loginLoading()}>
                            {loginLoading() ? 'Importing...' : 'Import'}
                          </button>
                        </div>
                        <Show when={keyError()}>
                          <div class="setting-error">{keyError()}</div>
                        </Show>
                        <div class="settings-notice warning">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                            <line x1="12" y1="9" x2="12" y2="13"></line>
                            <line x1="12" y1="17" x2="12.01" y2="17"></line>
                          </svg>
                          <p>Never share your private key with anyone. It provides full control over your Nostr identity.</p>
                        </div>
                      </div>
                    </Show>

                    {/* Generate Key Tab */}
                    <Show when={loginTab() === 'generate'}>
                      <div class="generate-content">
                        <p class="generate-description">
                          Generate a new Nostr keypair. Make sure to back up your private key securely - if you lose it, you lose access to your identity.
                        </p>
                        <button class="setting-button generate-btn" onClick={handleGenerateKey} disabled={loginLoading()}>
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"></path>
                          </svg>
                          {loginLoading() ? 'Generating...' : 'Generate New Keypair'}
                        </button>
                        <Show when={keyError()}>
                          <div class="setting-error">{keyError()}</div>
                        </Show>
                        <div class="settings-notice">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="12" y1="16" x2="12" y2="12"></line>
                            <line x1="12" y1="8" x2="12.01" y2="8"></line>
                          </svg>
                          <p>After generating, you'll be able to copy and save your keys. Store them somewhere safe!</p>
                        </div>
                      </div>
                    </Show>
                  </div>
                </Show>

                <div class="settings-section-title">Relays</div>
                <div class="setting-item column">
                  <div class="setting-info">
                    <div class="setting-name">Your relays</div>
                    <div class="setting-description">Nostr relays for syncing (from your NIP-65 list)</div>
                  </div>
                  <div class="relay-list">
                    <For each={relays()}>
                      {(relay) => (
                        <div class="relay-item">
                          <span class="relay-status"></span>
                          <span class="relay-url">{relay.url}</span>
                          <span class="relay-permissions">
                            {relay.read && relay.write ? 'R/W' : relay.read ? 'R' : 'W'}
                          </span>
                          <button class="relay-remove" onClick={() => handleRemoveRelay(relay.url)}>×</button>
                        </div>
                      )}
                    </For>
                    <Show when={relays().length === 0}>
                      <div class="relay-empty">No relays configured</div>
                    </Show>
                  </div>
                  <div class="relay-add">
                    <input
                      type="text"
                      placeholder="wss://relay.example.com"
                      class="setting-input"
                      value={newRelayUrl()}
                      onInput={(e) => setNewRelayUrl(e.currentTarget.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleAddRelay()}
                      title="Only secure WebSocket connections (wss://) are allowed"
                    />
                    <button class="setting-button" onClick={handleAddRelay}>Add</button>
                  </div>
                </div>

                <div class="settings-section-title">Blossom Servers</div>
                <div class="setting-item column">
                  <div class="setting-info">
                    <div class="setting-name">Media servers</div>
                    <div class="setting-description">Blossom servers for encrypted attachments</div>
                  </div>
                  <div class="relay-list">
                    <For each={blossomServers()}>
                      {(server) => (
                        <div class="relay-item">
                          <span class="relay-status"></span>
                          <span class="relay-url">{server}</span>
                          <button class="relay-remove" onClick={() => handleRemoveBlossom(server)}>×</button>
                        </div>
                      )}
                    </For>
                    <Show when={blossomServers().length === 0}>
                      <div class="relay-empty">No servers configured</div>
                    </Show>
                  </div>
                  <div class="relay-add">
                    <input
                      type="text"
                      placeholder="https://blossom.example.com"
                      class="setting-input"
                      value={newBlossomUrl()}
                      onInput={(e) => setNewBlossomUrl(e.currentTarget.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleAddBlossom()}
                    />
                    <button class="setting-button" onClick={handleAddBlossom}>Add</button>
                  </div>
                </div>

                <Show when={currentLogin()}>
                  <div class="settings-section-title">Blocked Users</div>
                  <div class="setting-item column">
                    <div class="setting-info">
                      <div class="setting-name">Muted accounts</div>
                      <div class="setting-description">Users you've blocked won't be able to share documents with you (NIP-51 mute list)</div>
                    </div>
                    
                    <Show when={loadingBlocked()}>
                      <div class="blocked-users-loading">
                        <div class="spinner small"></div>
                        <span>Loading blocked users...</span>
                      </div>
                    </Show>

                    <Show when={!loadingBlocked()}>
                      <div class="blocked-users-list">
                        <For each={blockedUsers()}>
                          {(user) => (
                            <div class="blocked-user-item">
                              <div class="blocked-user-avatar">
                                <Show when={user.picture} fallback={
                                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                                    <circle cx="12" cy="7" r="4"></circle>
                                  </svg>
                                }>
                                  <img src={user.picture} alt="" />
                                </Show>
                              </div>
                              <div class="blocked-user-info">
                                <Show when={user.name} fallback={
                                  <span class="blocked-user-pubkey">{user.pubkey.slice(0, 12)}...{user.pubkey.slice(-6)}</span>
                                }>
                                  <span class="blocked-user-name">{user.name}</span>
                                </Show>
                              </div>
                              <button 
                                class="setting-button secondary small"
                                onClick={() => handleUnblockUser(user.pubkey)}
                                disabled={unblockingUser() === user.pubkey}
                              >
                                <Show when={unblockingUser() === user.pubkey}>
                                  <div class="spinner small"></div>
                                </Show>
                                <Show when={unblockingUser() !== user.pubkey}>
                                  Unblock
                                </Show>
                              </button>
                            </div>
                          )}
                        </For>
                        <Show when={blockedUsers().length === 0}>
                          <div class="blocked-users-empty">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                              <circle cx="12" cy="12" r="10"></circle>
                              <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
                            </svg>
                            <span>No blocked users</span>
                          </div>
                        </Show>
                      </div>
                    </Show>
                  </div>
                </Show>
              </div>
            </Show>

            {/* Privacy & Telemetry (desktop-only) */}
            <Show when={activeSection() === 'privacy'}>
              <div class="settings-section privacy">
                <div class="settings-section-title">Privacy &amp; Telemetry</div>

                <div class="settings-notice">
                  <p>
                    Alfred can record <strong>anonymous usage counts and timings</strong> — how many
                    agent turns ran, how long tools took, how often a schema check passed — to help
                    improve it. It <strong>never</strong> records your notes, your prompts, your
                    keys, or anything you type. Everything stays on this machine; nothing is sent
                    anywhere. It is <strong>off</strong> until you turn it on, and you can erase what
                    was collected at any time.
                  </p>
                </div>

                <div class="setting-item">
                  <div class="setting-info">
                    <div class="setting-name">Share anonymous usage counts</div>
                    <div class="setting-description">Never your notes, prompts, or keys — counts and timings only, stored locally.</div>
                  </div>
                  <label class="setting-toggle">
                    <input
                      type="checkbox"
                      checked={telemetryEnabled()}
                      disabled={telemetryBusy()}
                      onChange={(e) => handleTelemetryToggle(e.currentTarget.checked)}
                    />
                    <span class="toggle-slider"></span>
                  </label>
                </div>

                <Show when={telemetryNotice()}>
                  <div class="settings-notice">
                    <p>{telemetryNotice()}</p>
                  </div>
                </Show>

                <div class="settings-section-title">Your data, your control</div>

                <div class="setting-item">
                  <div class="setting-info">
                    <div class="setting-name">Export collected data</div>
                    <div class="setting-description">Download everything stored locally as JSON, so you can see exactly what was recorded.</div>
                  </div>
                  <button class="setting-button secondary" disabled={telemetryBusy()} onClick={handleTelemetryExport}>Export</button>
                </div>

                <div class="setting-item">
                  <div class="setting-info">
                    <div class="setting-name">Erase collected data</div>
                    <div class="setting-description">Permanently delete all locally stored telemetry. Your notes are never affected.</div>
                  </div>
                  <button class="setting-button danger" disabled={telemetryBusy()} onClick={handleTelemetryWipe}>Erase</button>
                </div>

                <Show when={telemetryMetrics()} fallback={
                  <p class="setting-description">No usage data collected yet.</p>
                }>
                  {(m) => (
                    <div class="telemetry-metrics">
                      <div class="settings-section-title">What has been recorded</div>
                      <p class="setting-description">{m().total_events} event{m().total_events === 1 ? '' : 's'} recorded.</p>
                      <Show when={m().by_kind.length > 0}>
                        <ul class="telemetry-kind-list">
                          <For each={m().by_kind}>
                            {(k) => (
                              <li>{k.kind}: {k.count} (avg {Math.round(k.avg_duration_ms)} ms)</li>
                            )}
                          </For>
                        </ul>
                      </Show>
                    </div>
                  )}
                </Show>
              </div>
            </Show>

            {/* About */}
            <Show when={activeSection() === 'about'}>
              <div class="settings-section about">
                <div class="about-header">
                  <div class="about-logo">
                    <img src={AlfredMark} width="64" height="64" alt="The Alfred mark" style={{ 'object-fit': 'contain' }} />
                  </div>
                  <h1>Alfred</h1>
                  <p class="about-tagline">A sovereign, local-first, Nostr-native PKM for agentic AI development</p>
                  <p class="about-version">Version {appVersion()}</p>
                </div>

                <Show when={isDesktop()}>
                  <div class="about-section">
                    <h3>Updates</h3>
                    <div class="about-updates">
                      <Show when={updateStatus() === 'idle' || updateStatus() === 'none' || updateStatus() === 'error' || updateStatus() === 'info'}>
                        <button class="about-updates__button" onClick={runUpdateCheck}>
                          Check for updates
                        </button>
                      </Show>
                      <Show when={updateStatus() === 'checking'}>
                        <span>Checking for updates…</span>
                      </Show>
                      <Show when={updateStatus() === 'none'}>
                        <span>Alfred is up to date.</span>
                      </Show>
                      <Show when={updateStatus() === 'info'}>
                        <span class="about-updates__note">{updateDetail()}</span>
                      </Show>
                      <Show when={updateStatus() === 'error'}>
                        <span class="about-updates__error">{updateDetail()}</span>
                      </Show>
                      <Show when={updateStatus() === 'available'}>
                        <span>Version {updateVersion()} is available.</span>
                        <button class="about-updates__button" onClick={runUpdateInstall}>
                          Download and install
                        </button>
                        <p class="about-updates__note">
                          Alfred will close to apply the update. The download is verified against the
                          release signing key before anything is installed.
                        </p>
                      </Show>
                      <Show when={updateStatus() === 'downloading'}>
                        <span>Downloading… {updateDetail()}</span>
                      </Show>
                    </div>
                  </div>
                </Show>

                <div class="about-section">
                  <h3>About</h3>
                  <p>Alfred is an open-source, local-first, Nostr-native PKM for agentic AI development, part of wecanjustbuildthings.dev. Your notes are stored locally as plain markdown files, with optional encrypted sync via Nostr.</p>
                </div>

                <div class="about-section">
                  <h3>Technology</h3>
                  <div class="about-tech">
                    <span class="tech-badge">Tauri 2.0</span>
                    <span class="tech-badge">SolidJS</span>
                    <span class="tech-badge">Rust</span>
                    <span class="tech-badge">Milkdown</span>
                    <span class="tech-badge">Nostr</span>
                  </div>
                </div>

                <div class="about-section">
                  <h3>Links</h3>
                  <div class="about-links">
                    <a href="https://github.com/MartinMontero/Alfred" target="_blank" class="about-link">GitHub Repository</a>
                    <a href="https://github.com/MartinMontero/Alfred/issues" target="_blank" class="about-link">Report an Issue</a>
                  </div>
                </div>

                <div class="about-section">
                  <h3>License</h3>
                  <p>AGPL-3.0-or-later — free and open source</p>
                </div>
              </div>
            </Show>
          </div>
        </div>

        {/* Custom Modal Dialog */}
        <Show when={modalConfig()}>
          <div class="modal-overlay" onClick={() => setModalConfig(null)}>
            <div class="modal-dialog" onClick={(e) => e.stopPropagation()}>
              <div class="modal-header">
                <h3>{modalConfig()!.title}</h3>
                <button class="modal-close" onClick={() => setModalConfig(null)}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>
              <div class="modal-body">
                <p>{modalConfig()!.message}</p>
              </div>
              <div class="modal-footer">
                <Show when={modalConfig()!.type === 'confirm'}>
                  <button class="setting-button secondary" onClick={() => setModalConfig(null)}>Cancel</button>
                  <button class="setting-button danger" onClick={modalConfig()!.onConfirm}>Remove</button>
                </Show>
                <Show when={modalConfig()!.type === 'info'}>
                  <button class="setting-button" onClick={() => setModalConfig(null)}>OK</button>
                </Show>
              </div>
            </div>
          </div>
        </Show>

      </div>
    </div>
  );
};

export default Settings;
