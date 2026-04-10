import { useEffect, useRef } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { toast } from 'sonner'

export default function ReloadPrompt() {
  const {
    offlineReady: [offlineReady],
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      console.log('SW Registered:', r)
    },
    onRegisterError(error) {
      console.log('SW registration error', error)
    },
  })

  const shownRef = useRef(false)

  useEffect(() => {
    if (!needRefresh || shownRef.current) return
    shownRef.current = true
    toast('Update tersedia', {
      description: 'Versi terbaru aplikasi sudah tersedia. Klik untuk update.',
      action: {
        label: 'Update',
        onClick: () => updateServiceWorker(true),
      },
      duration: Infinity,
    })

    window.setTimeout(() => {
      updateServiceWorker(true)
    }, 4000)
  }, [needRefresh, updateServiceWorker])

  useEffect(() => {
    if (!offlineReady) return
    toast('Mode offline siap', {
      description: 'Aplikasi bisa dibuka walau koneksi tidak stabil.',
      duration: 4000,
    })
  }, [offlineReady])
  return null
}
