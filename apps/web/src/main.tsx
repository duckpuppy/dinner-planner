import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { get, set } from 'idb-keyval';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

const CACHE_KEY = 'dinner-planner-query-cache';
const CACHE_MAX_AGE = 1000 * 60 * 60 * 24; // 24 hours

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: CACHE_MAX_AGE,
      retry: 1,
      networkMode: 'offlineFirst',
    },
    mutations: {
      networkMode: 'offlineFirst',
    },
  },
});

// Restore cached query data from IndexedDB on startup
async function hydrateFromCache() {
  try {
    const stored = await get<{ timestamp: number; data: Record<string, unknown> }>(CACHE_KEY);
    if (!stored) return;
    if (Date.now() - stored.timestamp > CACHE_MAX_AGE) return;
    for (const [queryKey, queryData] of Object.entries(stored.data)) {
      queryClient.setQueryData(JSON.parse(queryKey) as unknown[], queryData);
    }
  } catch {
    // Ignore cache restoration errors
  }
}

// Persist query cache to IndexedDB on changes (debounced)
function setupCachePersistence() {
  let saveTimer: ReturnType<typeof setTimeout>;

  const queryCache = queryClient.getQueryCache();
  queryCache.subscribe(() => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      const data: Record<string, unknown> = {};
      queryCache.getAll().forEach((query) => {
        if (query.state.status === 'success' && query.state.data !== undefined) {
          data[JSON.stringify(query.queryKey)] = query.state.data;
        }
      });
      try {
        await set(CACHE_KEY, { timestamp: Date.now(), data });
      } catch {
        // Ignore persistence errors
      }
    }, 1000);
  });
}

// Hydrate from cache then render
hydrateFromCache().then(() => {
  setupCachePersistence();

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </React.StrictMode>
  );
});
