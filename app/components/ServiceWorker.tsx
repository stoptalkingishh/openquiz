'use client'

import { useEffect } from 'react'
import { assetPath } from '../lib/paths'

export default function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return
    if (!('serviceWorker' in navigator)) return

    const version = process.env.NEXT_PUBLIC_BUILD_VERSION || 'development'
    const workerUrl = `${assetPath('/sw.js')}?v=${encodeURIComponent(version)}`

    navigator.serviceWorker
      .register(workerUrl, { scope: assetPath('/') })
      .catch((error) => console.error('Service worker registration failed:', error))
  }, [])

  return null
}
