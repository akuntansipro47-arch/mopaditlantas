import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster } from 'sonner'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import './index.css'

const queryClient = new QueryClient()

// Jika sebelumnya aplikasi pernah memakai PWA/Service Worker, browser bisa "terkunci"
// di asset versi lama walaupun Vercel sudah deploy commit terbaru.
// Cleanup ini dijalankan sekali untuk memastikan UI selalu mengikuti versi terbaru.
async function cleanupLegacyServiceWorker() {
  try {
    const key = 'sw_cleanup_done_v1'
    if (localStorage.getItem(key) === '1') return

    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations()
      await Promise.all(regs.map((r) => r.unregister()))
    }

    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k)))
    }

    localStorage.setItem(key, '1')
  } catch {
    // noop
  }
}

cleanupLegacyServiceWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
    <Toaster />
  </StrictMode>,
)
