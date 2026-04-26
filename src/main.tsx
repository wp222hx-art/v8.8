import React from 'react';
import ReactDOM from 'react-dom/client';
import { enableMapSet } from 'immer';
import App from './App';
import './styles/index.css';
import { installAutotest } from './dev/autotest';
import { useWorldStore } from './stores/worldStore';

// Allow Immer to handle Map / Set (used by worldStore)
enableMapSet();

// Expose store on window for easy debugging / automated tests
if (import.meta.env.DEV) {
  (window as any).__WSTORE__ = useWorldStore;
}

installAutotest();

// Hide initial loader once React has rendered
const fadeOutLoader = () => {
  const loader = document.getElementById('initial-loader');
  if (loader) {
    loader.classList.add('fade');
    setTimeout(() => loader.remove(), 650);
  }
};

// NOTE: We intentionally do NOT wrap App in React.StrictMode. In dev, StrictMode
// mounts every component twice. That is harmless for most UI, but for the heavy
// Pixi <HexWorldScene> canvas it (a) creates two WebGL contexts, (b) occasionally
// leaves orphan tweens from the first mount. We handle clean-up carefully, so
// disabling StrictMode in dev is a pragmatic tradeoff for a smooth mobile demo.
ReactDOM.createRoot(document.getElementById('root')!).render(<App />);

// Fade loader after first paint
requestAnimationFrame(() => requestAnimationFrame(fadeOutLoader));
