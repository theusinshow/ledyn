import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from '@/app/App';
import { registerAppServiceWorker } from '@/infrastructure/pwa/serviceWorkerManager';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import './index.css';

registerAppServiceWorker();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
