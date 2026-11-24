import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/tokens.css';
import './styles/ios-ui.css';
import { App } from './App';
import { registerServiceWorker } from './pwa/registerSW';

registerServiceWorker();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
