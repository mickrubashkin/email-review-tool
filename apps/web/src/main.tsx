import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';

import './index.css'
import App from './App.tsx'

const queryClient = new QueryClient();

const root = createRoot(document.getElementById('root')!)
root.render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <MantineProvider>
        <App />
      </MantineProvider>
    </QueryClientProvider>
  </StrictMode>,
)
