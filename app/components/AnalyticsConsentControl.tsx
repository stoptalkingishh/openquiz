'use client'

import { useCallback, useEffect, useState } from 'react'
import type { AnalyticsConsent } from '../lib/consent'
import {
  analyticsMeasurementId,
  loadAnalytics,
  readAnalyticsConsent,
  shouldLoadAnalytics,
  subscribeAnalyticsConsent,
  writeAnalyticsConsent,
} from '../lib/consent'

/**
 * Lets the visitor review or withdraw a previous analytics decision. Rendered
 * after mount so the server HTML and the first client render stay identical.
 */
export default function AnalyticsConsentControl() {
  const [mounted, setMounted] = useState(false)
  const [choice, setChoice] = useState<AnalyticsConsent | null>(null)
  const measurementId = analyticsMeasurementId()

  useEffect(() => {
    setMounted(true)
    setChoice(readAnalyticsConsent())
    return subscribeAnalyticsConsent(setChoice)
  }, [])

  const decide = useCallback((next: AnalyticsConsent) => {
    writeAnalyticsConsent(next)
    setChoice(next)
    if (shouldLoadAnalytics(next, measurementId)) loadAnalytics(next, measurementId)
  }, [measurementId])

  if (!mounted || !measurementId) return null

  const status =
    choice === 'granted'
      ? 'Analytics is allowed. Page visits are counted by Google Analytics.'
      : choice === 'denied'
        ? 'Analytics is declined. No analytics code is loaded and nothing is stored for tracking.'
        : 'No decision recorded yet. Analytics is not loaded until you accept.'

  return (
    <div className="space-y-3">
      <p role="status" className="text-sm text-neutral-700 dark:text-neutral-300">
        {status}
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => decide('granted')}
          aria-pressed={choice === 'granted'}
          className="btn-primary px-4 py-2 text-sm"
        >
          Allow analytics
        </button>
        <button
          type="button"
          onClick={() => decide('denied')}
          aria-pressed={choice === 'denied'}
          className="btn-outline px-4 py-2 text-sm"
        >
          Withdraw consent
        </button>
      </div>
    </div>
  )
}
