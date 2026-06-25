// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
import { render } from 'solid-js/web';
import App from './App';
import './styles.css';

const root = document.getElementById('root');

if (root) {
  render(() => <App />, root);
}
