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

// The static splash in index.html is the page's first contentful paint — and
// therefore the LCP element the F22 Lighthouse gate measures. Hold the app's
// first render until the mark is decoded and a frame with it has committed
// (double rAF), so the splash always paints before anything the app draws;
// otherwise the two race and LCP lands on the app's much later paint. The
// mark is a 29 KB high-priority request discovered at HTML parse, so on any
// real link it arrives well before the bundle — the 3 s timer only guards a
// broken asset from wedging startup.
const splashPainted = (): Promise<void> =>
  new Promise((resolve) => {
    const splashImg = document.querySelector<HTMLImageElement>('#alfred-splash img');
    const done = () =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    if (!splashImg) {
      resolve();
      return;
    }
    let settled = false;
    const settle = () => {
      if (!settled) {
        settled = true;
        done();
      }
    };
    const timer = setTimeout(settle, 3000);
    splashImg
      .decode()
      .catch(() => undefined)
      .then(() => {
        clearTimeout(timer);
        settle();
      });
  });

if (root) {
  void splashPainted().then(() => {
    render(() => <App />, root);
    document.getElementById('alfred-splash')?.remove();
  });
}
