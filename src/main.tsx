import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { StoreProvider } from './lib/store';
import { AuthProvider } from './lib/auth';
import { DialogProvider } from './components/Dialog';
import './styles.css';

registerSW({ immediate: true });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <StoreProvider>
      <AuthProvider>
        <DialogProvider>
          <HashRouter>
            <App />
          </HashRouter>
        </DialogProvider>
      </AuthProvider>
    </StoreProvider>
  </React.StrictMode>,
);
