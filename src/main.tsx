import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './app/styles.css';
import './app/stage3.css';
import './app/stage4.css';
import './app/visual-slice.css';
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
