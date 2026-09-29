'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { assetPath } from '../lib/paths'
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
 * Consent-gated analytics prompt.
 *
 * Renders nothing on the server and on the first client render, then appears
 * once the stored decision has been read. That keeps the static HTML and the
 * first client render identical, so there is no hydration mismatch.
 */
export default function AnalyticsConsent() {
  const [mounted, setMounted] = useState(false)
  const [choice, setChoice] = useState<AnalyticsConsent | null>(null)
  const headingRef = useRef<HTMLParagraphElement>(null)
  const measurementId = analyticsMeasurementId()

  // Read the stored decision after mount, never during the initial render.
  useEffect(() => {
    setMounted(true)
    setChoice(readAnalyticsConsent())
    return subscribeAnalyticsConsent(setChoice)
  }, [])

  const decide = useCallback((next: AnalyticsConsent) => {
    writeAnalyticsConsent(next)
    setChoice(next)
  }, [])

  // Analytics is requested only once consent exists.
  useEffect(() => {
    if (shouldLoadAnalytics(choice, measurementId)) loadAnalytics(choice, measurementId)
  }, [choice, measurementId])

  // Move focus into the prompt so screen readers and keyboards land on it.
  useEffect(() => {
    if (mounted && choice === null) headingRef.current?.focus()
  }, [mounted, choice])

  if (!mounted || choice !== null || !measurementId) return null

  return (
    <div
      role="region"
      aria-label="Analytics consent"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-neutral-200 bg-white p-4 shadow-lg dark:border-neutral-700 dark:bg-neutral-900"
    >
      <div className="mx-auto flex max-w-4xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p
          ref={headingRef}
          tabIndex={-1}
          className="text-sm text-neutral-700 focus:outline-none dark:text-neutral-300"
        >
          <span className="font-semibold">Help improve OpenQuiz?</span> We use Google
          Analytics to count page visits. Nothing is loaded and nothing is stored on your
          device until you accept. See our{' '}
          <a
            href={assetPath('/privacy/')}
            className="font-medium text-primary underline dark:text-primary-light"
          >
            privacy policy
          </a>
          .
        </p>
        <div className="flex shrink-0 gap-2">
          <button type="button" onClick={() => decide('denied')} className="btn-outline px-4 py-2 text-sm">
            Decline
          </button>
          <button type="button" onClick={() => decide('granted')} className="btn-primary px-4 py-2 text-sm">
            Accept
          </button>
        </div>
      </div>
    </div>
  )
}
