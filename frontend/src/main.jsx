import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

// Self-hosted Material Symbols — no Google Fonts request at runtime.
import 'material-symbols/outlined.css';

import './styles/tokens.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/forms.css';
import './styles/login.css';
import './styles/menu.css';
import './styles/dashboard.css';
import './styles/table.css';
import './styles/templates.css';
import './styles/editor.css';
import './styles/cheque.css';
import './styles/settings.css';
import './styles/reports.css';

import { ThemeProvider } from './theme/ThemeProvider.jsx';
import { BrandingProvider } from './branding/BrandingProvider.jsx';
import { AuthProvider } from './auth/AuthProvider.jsx';
import { ToastProvider } from './components/Toast.jsx';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrandingProvider>
      <ThemeProvider>
      {/* AuthProvider reads the theme context, so it nests inside it. */}
      <AuthProvider>
        <ToastProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </ToastProvider>
      </AuthProvider>
      </ThemeProvider>
    </BrandingProvider>
  </React.StrictMode>,
);
