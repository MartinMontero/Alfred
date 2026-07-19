// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
/**
 * Display name + greeting (Morning Study). The builder chooses what Alfred
 * calls them; unset stays graceful ("Good evening." — no placeholder names).
 * Stored locally only — the name never leaves the machine.
 */
export const DISPLAY_NAME_KEY = 'display_name';

export function getDisplayName(): string {
  try {
    return (localStorage.getItem(DISPLAY_NAME_KEY) ?? '').trim();
  } catch {
    return '';
  }
}

export function setDisplayName(name: string): void {
  const trimmed = name.trim();
  if (trimmed) localStorage.setItem(DISPLAY_NAME_KEY, trimmed);
  else localStorage.removeItem(DISPLAY_NAME_KEY);
}

export function greetingForHour(hour: number): string {
  if (hour < 5) return 'Up late';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export function greeting(now: Date = new Date()): string {
  const name = getDisplayName();
  const base = greetingForHour(now.getHours());
  return name ? `${base}, ${name}.` : `${base}.`;
}
