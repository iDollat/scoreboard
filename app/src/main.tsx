import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ConvexProvider, ConvexReactClient } from 'convex/react';
import App from './App';
import { AdminProvider } from './lib/admin';
import { UIProvider } from './lib/ui';
import './index.css';

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConvexProvider client={convex}>
      <BrowserRouter>
        <AdminProvider>
          <UIProvider>
            <App />
          </UIProvider>
        </AdminProvider>
      </BrowserRouter>
    </ConvexProvider>
  </StrictMode>,
);

// Działanie bez zasięgu (np. na boisku) – pliki aplikacji z pamięci telefonu
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
