// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
/**
 * Onboarding - Welcome wizard for new users
 * 
 * Guides users through setting up their Alfred workspace including:
 * - Vault creation/selection
 * - Nostr identity setup
 * - Nostr relay sync configuration
 */

import { Component, createSignal, Show, For, onMount } from 'solid-js';
import { platform } from '@platform';
import { generateNewLogin, importNsecLogin, saveLogin } from '../lib/nostr/login';
import type { NostrIdentity } from '../lib/nostr/types';
import '../styles/onboarding.css';

// Import SVG illustrations
import AlfredMark from '../assets/onboarding/alfred-mark.png';
import VaultSvg from '../assets/onboarding/vault.svg';
import FeaturesSvg from '../assets/onboarding/features.svg';
import NostrSvg from '../assets/onboarding/nostr.svg';
import SyncSvg from '../assets/onboarding/sync.svg';
import CompleteSvg from '../assets/onboarding/complete.svg';
import { getDisplayName, setDisplayName } from '../lib/display-name';

// Types
export interface OnboardingResult {
  vaultPath: string;
  nostrSetup: 'created' | 'imported' | 'skipped';
  nostrNpub?: string;
  syncEnabled: boolean;
  createFirstNote: boolean;
}

interface OnboardingProps {
  isMobile: boolean;
  onComplete: (result: OnboardingResult) => void;
}

type OnboardingStep = 'welcome' | 'vault' | 'features' | 'nostr' | 'sync' | 'complete';

const Onboarding: Component<OnboardingProps> = (props) => {
  // Steps based on platform
  const getSteps = (): OnboardingStep[] => {
    if (props.isMobile) {
      return ['welcome', 'vault', 'features', 'nostr', 'sync', 'complete'];
    }
    return ['welcome', 'vault', 'features', 'nostr', 'sync', 'complete'];
  };

  const steps = getSteps();
  const [currentStepIndex, setCurrentStepIndex] = createSignal(0);
  const currentStep = () => steps[currentStepIndex()];

  // Collected data
  const [vaultPath, setVaultPath] = createSignal<string | null>(null);
  const [nostrSetup, setNostrSetup] = createSignal<'created' | 'imported' | 'skipped' | null>(null);
  const [nostrIdentity, setNostrIdentity] = createSignal<NostrIdentity | null>(null);
  const [syncEnabled, setSyncEnabled] = createSignal(false);

  // Step-specific state
  // Vault
  const [vaultError, setVaultError] = createSignal<string | null>(null);
  // Morning Study: the name Alfred greets the builder by (optional, local-only).
  const [displayName, setDisplayNameSignal] = createSignal(getDisplayName());
  const [vaultLoading, setVaultLoading] = createSignal(false);
  const [defaultVaultPath, setDefaultVaultPath] = createSignal<string | null>(null);

  // Nostr
  const [nostrMode, setNostrMode] = createSignal<'choose' | 'create' | 'import'>('choose');
  const [nostrLoading, setNostrLoading] = createSignal(false);
  const [nostrError, setNostrError] = createSignal<string | null>(null);
  const [importKey, setImportKey] = createSignal('');
  const [showNsec, setShowNsec] = createSignal(false);
  const [copiedKey, setCopiedKey] = createSignal<'npub' | 'nsec' | null>(null);

  // Navigation
  const goNext = () => {
    if (currentStepIndex() < steps.length - 1) {
      setCurrentStepIndex(currentStepIndex() + 1);
    }
  };

  const goBack = () => {
    if (currentStepIndex() > 0) {
      setCurrentStepIndex(currentStepIndex() - 1);
    }
  };

  const completeOnboarding = (createNote: boolean) => {
    props.onComplete({
      vaultPath: vaultPath()!,
      nostrSetup: nostrSetup() || 'skipped',
      nostrNpub: nostrIdentity()?.npub,
      syncEnabled: syncEnabled(),
      createFirstNote: createNote,
    });
  };

  // Load default vault path on mount
  onMount(async () => {
    try {
      const info = await platform.refreshInfo();
      if (info.default_vault_path) {
        setDefaultVaultPath(info.default_vault_path);
      }
    } catch (err) {
      console.error('Failed to get platform info:', err);
    }
  });

  // === Vault Functions ===
  const createNewVault = async () => {
    setVaultLoading(true);
    setVaultError(null);
    // W1 #1 instrument + failure surface: every step is named so a failure
    // reports WHERE it broke, with the underlying OS reason — never a bare
    // "failed". DEV logs let one repro pin the failing step.
    let step = 'determining the vault location';
    const trace = (msg: string) => {
      if (import.meta.env.DEV) console.debug('[vault-create]', msg);
    };
    try {
      trace('start');
      const path = defaultVaultPath() || (props.isMobile ? null : `${await getHomeDir()}/Documents/Alfred Notes`);
      if (!path) throw new Error('no default path available on this platform');
      trace(`path determined: ${path}`);

      step = 'creating the vault folder';
      await platform.vault.createFolder(path, path);
      trace('folder created');
      setVaultPath(path);

      step = 'saving the vault location to settings';
      await platform.settings.save({ vault_path: path });
      localStorage.setItem('vault_path', path);
      trace('settings saved');

      goNext();
    } catch (err) {
      console.error('[vault-create] failed while', step, '-', err);
      const reason = err instanceof Error ? err.message : String(err);
      setVaultError(`Failed while ${step}: ${reason}`);
    } finally {
      setVaultLoading(false);
    }
  };

  const chooseExistingVault = async () => {
    setVaultLoading(true);
    setVaultError(null);
    try {
      const selected = await platform.dialog.open({
        directory: true,
        multiple: false,
        title: 'Choose your notes folder',
      });

      if (selected && typeof selected === 'string') {
        setVaultPath(selected);
        await platform.settings.save({ vault_path: selected });
        localStorage.setItem('vault_path', selected);
        goNext();
      }
    } catch (err) {
      console.error('Failed to select vault:', err);
      setVaultError(err instanceof Error ? err.message : 'Failed to select folder');
    } finally {
      setVaultLoading(false);
    }
  };

  const getHomeDir = async (): Promise<string> => {
    try {
      const info = await platform.refreshInfo();
      return info.default_vault_path ?? '';
    } catch {
      return '';
    }
  };

  // === Nostr Functions ===
  const createNostrIdentity = async () => {
    setNostrLoading(true);
    setNostrError(null);
    try {
      const { identity, login } = generateNewLogin();
      
      await saveLogin(login);
      setNostrIdentity(identity);
      setNostrSetup('created');
      setNostrMode('create');
    } catch (err) {
      console.error('Failed to generate Nostr identity:', err);
      setNostrError(err instanceof Error ? err.message : 'Failed to generate identity');
    } finally {
      setNostrLoading(false);
    }
  };

  const importNostrIdentity = async () => {
    const key = importKey().trim();
    if (!key) {
      setNostrError('Please enter your private key');
      return;
    }

    setNostrLoading(true);
    setNostrError(null);
    try {
      const { identity, login } = importNsecLogin(key);
      
      await saveLogin(login);
      setNostrIdentity(identity);
      setNostrSetup('imported');
    } catch (err) {
      console.error('Failed to import Nostr identity:', err);
      setNostrError(err instanceof Error ? err.message : 'Failed to import identity');
    } finally {
      setNostrLoading(false);
    }
  };

  const skipNostr = () => {
    setNostrSetup('skipped');
    goNext();
  };

  const copyToClipboard = async (text: string, type: 'npub' | 'nsec') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(type);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  // === Sync Functions ===
  const enableSync = () => {
    setSyncEnabled(true);
    localStorage.setItem('sync_enabled', 'true');
    goNext();
  };

  const skipSync = () => {
    setSyncEnabled(false);
    goNext();
  };

  // === Render Steps ===
  const renderWelcome = () => (
    <>
      <div class="onboarding-illustration">
        <img src={AlfredMark} alt="The Alfred mark" />
      </div>
      <h1 class="onboarding-headline">Welcome to Alfred</h1>
      <p class="onboarding-subhead">Augmented intelligence for focused work — you lead, Alfred keeps the thread.</p>
      
      <div class="onboarding-benefits">
        <div class="onboarding-benefit-item">
          <span class="onboarding-benefit-text">Capture ideas, organize projects, and get more done</span>
        </div>
        <div class="onboarding-benefit-item">
          <span class="onboarding-benefit-text">Write, research, and brainstorm with augmented intelligence — at your direction</span>
        </div>
        <div class="onboarding-benefit-item">
          <span class="onboarding-benefit-icon">🔒</span>
          <span class="onboarding-benefit-text">Your work stays private — you own your data, always</span>
        </div>
      </div>

      <div class="onboarding-name">
        <label for="onboarding-name-input">What should Alfred call you? <span class="onboarding-name__opt">(optional)</span></label>
        <input
          id="onboarding-name-input"
          type="text"
          placeholder="Your first name"
          value={displayName()}
          onInput={(e) => setDisplayNameSignal(e.currentTarget.value)}
        />
      </div>

      <div class="onboarding-actions">
        <button class="onboarding-button primary" onClick={() => { setDisplayName(displayName()); goNext(); }}>
          Get Started
        </button>
      </div>
    </>
  );

  const renderVault = () => (
    <>
      <div class="onboarding-illustration">
        <img src={VaultSvg} alt="Choose your vault" />
      </div>
      <h1 class="onboarding-headline">Choose your vault</h1>
      <p class="onboarding-subhead">
        A vault is simply a folder where your notes live. They're regular files you can access anytime, anywhere.
      </p>

      <Show when={vaultError()}>
        <div class="onboarding-error">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <p>{vaultError()}</p>
        </div>
      </Show>

      <Show when={props.isMobile} fallback={
        <div class="onboarding-vault-options">
          <div class="onboarding-vault-option" onClick={createNewVault}>
            <div class="onboarding-vault-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 5v14M5 12h14"/>
              </svg>
            </div>
            <div class="onboarding-vault-info">
              <div class="onboarding-vault-title">Create a new vault</div>
              <div class="onboarding-vault-desc">We'll create a folder called "Alfred Notes"</div>
            </div>
          </div>
          <div class="onboarding-vault-option" onClick={chooseExistingVault}>
            <div class="onboarding-vault-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
              </svg>
            </div>
            <div class="onboarding-vault-info">
              <div class="onboarding-vault-title">Choose existing folder</div>
              <div class="onboarding-vault-desc">Use a folder you already have</div>
            </div>
          </div>
        </div>
      }>
        {/* Mobile - simpler flow */}
        <div class="onboarding-actions">
          <button 
            class="onboarding-button primary" 
            onClick={createNewVault}
            disabled={vaultLoading()}
          >
            {vaultLoading() ? 'Creating...' : 'Create My Vault'}
          </button>
        </div>
      </Show>
    </>
  );

  const renderFeatures = () => (
    <>
      <div class="onboarding-illustration">
        <img src={FeaturesSvg} alt="Your productivity workspace" />
      </div>
      <h1 class="onboarding-headline">Built for focused work</h1>
      <p class="onboarding-subhead">Everything you need to think clearly and work efficiently</p>

      <div class="onboarding-feature-cards">
        <div class="onboarding-feature-card">
          <div class="onboarding-feature-title">Your External Mind</div>
          <div class="onboarding-feature-desc">Notes, tasks, and decisions in one place — augmented intelligence, human in the lead</div>
        </div>
        <div class="onboarding-feature-card">
          <span class="onboarding-feature-icon">🔗</span>
          <div class="onboarding-feature-title">Connected Ideas</div>
          <div class="onboarding-feature-desc">Link notes together to build your knowledge base</div>
        </div>
        <div class="onboarding-feature-card">
          <span class="onboarding-feature-icon">⚡</span>
          <div class="onboarding-feature-title">Lightning Fast</div>
          <div class="onboarding-feature-desc">Search and navigate instantly across all your work</div>
        </div>
        <div class="onboarding-feature-card">
          <span class="onboarding-feature-icon">🔒</span>
          <div class="onboarding-feature-title">Your Data</div>
          <div class="onboarding-feature-desc">Files stored locally — no vendor lock-in, ever</div>
        </div>
      </div>

      <div class="onboarding-actions">
        <button class="onboarding-button primary" onClick={goNext}>
          Continue
        </button>
      </div>
    </>
  );

  const renderNostr = () => (
    <>
      <div class="onboarding-illustration">
        <img src={NostrSvg} alt="Own your identity" />
      </div>
      <h1 class="onboarding-headline">Own your identity</h1>
      <p class="onboarding-subhead">Connect with Nostr to unlock powerful features</p>

      <Show when={nostrSetup() === null || nostrMode() === 'choose'}>
        <div class="onboarding-benefits">
          <div class="onboarding-benefit-item">
            <span class="onboarding-benefit-icon">🌐</span>
            <span class="onboarding-benefit-text">Publish your writing to the world</span>
          </div>
          <div class="onboarding-benefit-item">
            <span class="onboarding-benefit-icon">💾</span>
            <span class="onboarding-benefit-text">Back up your notes securely</span>
          </div>
          <div class="onboarding-benefit-item">
            <span class="onboarding-benefit-icon">🤝</span>
            <span class="onboarding-benefit-text">Share notes with friends and collaborators</span>
          </div>
          <div class="onboarding-benefit-item">
            <span class="onboarding-benefit-icon">🔑</span>
            <span class="onboarding-benefit-text">One identity across many apps — no passwords needed</span>
          </div>
        </div>

        <p class="onboarding-explanation">
          Nostr is a new way to own your online identity. Unlike social media accounts, no company controls it — you do.
        </p>

        <Show when={nostrError()}>
          <div class="onboarding-error">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <p>{nostrError()}</p>
          </div>
        </Show>

        <div class="onboarding-nostr-options">
          <button 
            class="onboarding-button primary" 
            onClick={createNostrIdentity}
            disabled={nostrLoading()}
          >
            {nostrLoading() ? 'Creating...' : 'Create New Identity'}
          </button>
          <button 
            class="onboarding-button secondary" 
            onClick={() => setNostrMode('import')}
            disabled={nostrLoading()}
          >
            I Already Have One
          </button>
        </div>

        <button class="onboarding-skip" onClick={skipNostr}>
          Set up later in Settings
        </button>
      </Show>

      {/* Import mode */}
      <Show when={nostrMode() === 'import' && nostrSetup() === null}>
        <div class="onboarding-nostr-form">
          <input
            type="password"
            class="onboarding-input"
            placeholder="nsec1... or hex private key"
            value={importKey()}
            onInput={(e) => setImportKey(e.currentTarget.value)}
            onKeyPress={(e) => e.key === 'Enter' && importNostrIdentity()}
          />
          
          <Show when={nostrError()}>
            <div class="onboarding-error">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <p>{nostrError()}</p>
            </div>
          </Show>

          <div class="onboarding-button-row">
            <button class="onboarding-button secondary" onClick={() => setNostrMode('choose')}>
              Back
            </button>
            <button 
              class="onboarding-button primary" 
              onClick={importNostrIdentity}
              disabled={nostrLoading()}
            >
              {nostrLoading() ? 'Importing...' : 'Import'}
            </button>
          </div>
        </div>
      </Show>

      {/* Success - show keys */}
      <Show when={nostrIdentity() && (nostrSetup() === 'created' || nostrSetup() === 'imported')}>
        <div class="onboarding-key-display">
          <div class="onboarding-key-item">
            <div class="onboarding-key-label">Your Public Key (npub)</div>
            <div class="onboarding-key-value">
              <code>{nostrIdentity()!.npub}</code>
              <button 
                class="onboarding-key-copy" 
                onClick={() => copyToClipboard(nostrIdentity()!.npub, 'npub')}
                title="Copy"
              >
                <Show when={copiedKey() === 'npub'} fallback={
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                  </svg>
                }>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                </Show>
              </button>
            </div>
          </div>

          <div class="onboarding-key-item">
            <div class="onboarding-key-label">Your Private Key (nsec) — Keep this secret!</div>
            <div class="onboarding-key-value">
              <Show when={showNsec()} fallback={<code>••••••••••••••••••••••••••••••••</code>}>
                <code>{nostrIdentity()!.nsec}</code>
              </Show>
              <button 
                class="onboarding-key-copy" 
                onClick={() => setShowNsec(!showNsec())}
                title={showNsec() ? 'Hide' : 'Show'}
              >
                <Show when={showNsec()} fallback={
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                }>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                </Show>
              </button>
              <button 
                class="onboarding-key-copy" 
                onClick={() => copyToClipboard(nostrIdentity()!.nsec, 'nsec')}
                title="Copy"
              >
                <Show when={copiedKey() === 'nsec'} fallback={
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                  </svg>
                }>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                </Show>
              </button>
            </div>
          </div>
        </div>

        <div class="onboarding-key-warning">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <p>
            <strong>Save your private key now!</strong> It's the only way to recover your identity. 
            Store it somewhere safe — we can't recover it for you.
          </p>
        </div>

        <div class="onboarding-actions">
          <button class="onboarding-button primary" onClick={goNext}>
            I've Saved My Key — Continue
          </button>
        </div>
      </Show>
    </>
  );

  const renderSync = () => (
    <>
      <div class="onboarding-illustration">
        <img src={SyncSvg} alt="Access your notes everywhere" />
      </div>
      <h1 class="onboarding-headline">Access your notes everywhere</h1>
      <p class="onboarding-subhead">Sync keeps your notes safe and available on all your devices</p>

      <Show when={nostrSetup() !== 'skipped'} fallback={
        <div class="onboarding-sync-disabled">
          <p>Sync requires a Nostr identity to work securely. You can set this up anytime in Settings.</p>
          <button class="onboarding-button secondary" onClick={goBack}>
            Go Back to Set Up Identity
          </button>
        </div>
      }>
        <div class="onboarding-benefits">
          <div class="onboarding-benefit-item">
            <span class="onboarding-benefit-icon">📱</span>
            <span class="onboarding-benefit-text">Read and edit from your phone, tablet, or any computer</span>
          </div>
          <div class="onboarding-benefit-item">
            <span class="onboarding-benefit-icon">☁️</span>
            <span class="onboarding-benefit-text">Automatic backups — never lose a note again</span>
          </div>
          <div class="onboarding-benefit-item">
            <span class="onboarding-benefit-icon">🔐</span>
            <span class="onboarding-benefit-text">End-to-end encrypted — only you can read your notes</span>
          </div>
        </div>

        <div class="onboarding-sync-toggle">
          <div class="onboarding-sync-info">
            <div class="onboarding-sync-label">Sync over your Nostr relays</div>
            <div class="onboarding-sync-desc">Sync your notes across devices</div>
          </div>
          <label class="onboarding-toggle">
            <input 
              type="checkbox" 
              checked={syncEnabled()} 
              onChange={(e) => setSyncEnabled(e.currentTarget.checked)}
            />
            <span class="onboarding-toggle-slider"></span>
          </label>
        </div>
      </Show>

      <div class="onboarding-actions">
        <button class="onboarding-button primary" onClick={syncEnabled() ? enableSync : goNext}>
          {syncEnabled() ? 'Enable Sync & Continue' : 'Continue'}
        </button>
      </div>

      <Show when={nostrSetup() !== 'skipped'}>
        <button class="onboarding-skip" onClick={skipSync}>
          Set up later in Settings
        </button>
      </Show>
    </>
  );

  const renderComplete = () => (
    <>
      <div class="onboarding-illustration">
        <img src={CompleteSvg} alt="You're all set!" />
      </div>
      <h1 class="onboarding-headline">You're all set!</h1>
      <p class="onboarding-subhead">Your workspace is ready. Let's create something amazing.</p>

      <div class="onboarding-summary">
        <div class="onboarding-summary-item">
          <div class="onboarding-summary-icon completed">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <span class="onboarding-summary-text">Vault created</span>
        </div>

        <div class="onboarding-summary-item">
          <div class={`onboarding-summary-icon ${nostrSetup() !== 'skipped' ? 'completed' : 'skipped'}`}>
            <Show when={nostrSetup() !== 'skipped'} fallback={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M5 12h14"/>
                <path d="M12 5l7 7-7 7"/>
              </svg>
            }>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </Show>
          </div>
          <span class={`onboarding-summary-text ${nostrSetup() === 'skipped' ? 'skipped' : ''}`}>
            {nostrSetup() !== 'skipped' ? 'Nostr identity connected' : 'Nostr identity — set up in Settings'}
          </span>
        </div>

        <div class="onboarding-summary-item">
          <div class={`onboarding-summary-icon ${syncEnabled() ? 'completed' : 'skipped'}`}>
            <Show when={syncEnabled()} fallback={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M5 12h14"/>
                <path d="M12 5l7 7-7 7"/>
              </svg>
            }>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </Show>
          </div>
          <span class={`onboarding-summary-text ${!syncEnabled() ? 'skipped' : ''}`}>
            {syncEnabled() ? 'Relay sync on — your notes travel encrypted over your own relays' : 'Relay sync — set up in Settings'}
          </span>
        </div>

      </div>

      <div class="onboarding-actions">
        <button class="onboarding-button primary" onClick={() => completeOnboarding(true)}>
          Create Your First Note
        </button>
        <button class="onboarding-button secondary" onClick={() => completeOnboarding(false)}>
          Explore Alfred
        </button>
      </div>
    </>
  );

  return (
    <div class="onboarding-overlay">
      <div class="onboarding-modal">
        {/* Progress dots */}
        <div class="onboarding-progress">
          <For each={steps}>
            {(_step, index) => (
              <div 
                class={`onboarding-progress-dot ${
                  index() === currentStepIndex() ? 'active' : 
                  index() < currentStepIndex() ? 'completed' : ''
                }`}
              />
            )}
          </For>
        </div>

        {/* Step content */}
        <div class="onboarding-content">
          <Show when={currentStep() === 'welcome'}>{renderWelcome()}</Show>
          <Show when={currentStep() === 'vault'}>{renderVault()}</Show>
          <Show when={currentStep() === 'features'}>{renderFeatures()}</Show>
          <Show when={currentStep() === 'nostr'}>{renderNostr()}</Show>
          <Show when={currentStep() === 'sync'}>{renderSync()}</Show>
          <Show when={currentStep() === 'complete'}>{renderComplete()}</Show>
        </div>
      </div>
    </div>
  );
};

export default Onboarding;
