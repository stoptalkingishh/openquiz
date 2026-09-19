'use client'

import { useEffect } from 'react'
import { assetPath } from '../lib/paths'

export default function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return
    if (!('serviceWorker' in navigator)) return

    try {
      navigator.serviceWorker.register(assetPath('/sw.js'))
    } catch (error) {
      console.error('Service worker registration failed:', error)
    }
  }, [])

  return null
}
