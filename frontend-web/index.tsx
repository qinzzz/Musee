
import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import '@fontsource/instrument-sans/400.css';
import '@fontsource/instrument-sans/500.css';
import '@fontsource/instrument-sans/600.css';
import '@fontsource/instrument-sans/700.css';
import App from './App';
import { ResetPasswordPage, VerifyEmailPage } from './app-shell/components/EmailAuthPages';
import { createQueryClient } from './lib/queryClient';
import './index.css';

const queryClient = createQueryClient();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      {window.location.pathname === '/verify-email' ? (
        <VerifyEmailPage />
      ) : window.location.pathname === '/reset-password' ? (
        <ResetPasswordPage />
      ) : (
        <App />
      )}
    </QueryClientProvider>
  </React.StrictMode>
);
