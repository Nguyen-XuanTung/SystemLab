import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/index.css';

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(
    <StrictMode>
      <div className="p-6 text-sm">SystemLab initializing...</div>
    </StrictMode>,
  );
}
