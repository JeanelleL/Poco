// Global styles first so component CSS can override them.
import './styles/tokens.css';
import './styles/base.css';
import './styles/motion.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

// iOS Safari only applies :active styles (the button "squish") when a touch listener exists.
document.addEventListener('touchstart', () => {}, { passive: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
