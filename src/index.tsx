// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
import { render } from 'solid-js/web';
import App from './App';
// Type roles per decision 0006 — OFL faces only, bundled (no CDN, no SF Pro):
// Inter = UI grotesque · Merriweather = headings/canon serif · JetBrains Mono
// = all badges + timestamps + data.
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/merriweather/400.css';
import '@fontsource/merriweather/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import './styles.css';

const root = document.getElementById('root');

if (root) {
  render(() => <App />, root);
}
