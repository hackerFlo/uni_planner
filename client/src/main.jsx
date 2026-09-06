import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
// Side-effect only, and imported here so it registers before any React
// effect binds a listener of its own. See the file for why that matters.
import './utils/altDragUnlock';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
