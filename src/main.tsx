import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { StoreProvider } from './lib/store';
import { AuthProvider } from './lib/auth';
import { DialogProvider } from './components/Dialog';
import './styles.css';

registerSW({ immediate: true });

// Old links (and installed apps) used hash URLs like "/#/learn/jab"; move them to the clean path.
if (window.location.hash.startsWith('#/')) {
  window.history.replaceState(null, '', window.location.hash.slice(1) + window.location.search);
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <StoreProvider>
      <AuthProvider>
        <DialogProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </DialogProvider>
      </AuthProvider>
    </StoreProvider>
  </React.StrictMode>,
);

// The app has rendered: fade out the start-up loader from index.html.
requestAnimationFrame(() => {
  const boot = document.getElementById('boot-loader');
  if (!boot) return;
  boot.classList.add('done');
  window.setTimeout(() => boot.remove(), 400);
});
