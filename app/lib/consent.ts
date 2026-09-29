/**
 * Analytics consent storage and deferred analytics loading.
 *
 * Analytics is never part of the initial HTML and is never requested until the
 * visitor actively accepts it. Declining means no request is ever made.
 */

export const ANALYTICS_CONSENT_KEY = 'oquiz:analytics_consent'
export const ANALYTICS_CONSENT_EVENT = 'oquiz:analytics-consent-change'

export type AnalyticsConsent = 'granted' | 'denied'

declare global {
  interface Window {
    dataLayer?: unknown[]
  }
}

/**
 * Measurement ID baked in at build time by Next.js, falling back to the
 * project's published property. The fallback is kept so the consent gate
 * governs the analytics that actually ships, rather than silently becoming
 * inert on builds that do not set the variable.
 */
export function analyticsMeasurementId(): string {
  return process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || 'G-G0MB0JNRD4'
}

function safeStorage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null
    return window.localStorage
  } catch {
    // Blocked by browser privacy settings; treat as "no decision recorded".
    return null
  }
}

/** The subset of Storage the consent record needs, so tests can supply a stub. */
export interface ConsentStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/** Returns the stored decision, or null when the visitor has not decided yet. */
export function readAnalyticsConsent(storage: ConsentStorage | null = safeStorage()): AnalyticsConsent | null {
  if (!storage) return null
  let raw: string | null
  try {
    raw = storage.getItem(ANALYTICS_CONSENT_KEY)
  } catch {
    return null
  }
  return raw === 'granted' || raw === 'denied' ? raw : null
}

/** Records the decision and notifies other consent controls on this page. */
export function writeAnalyticsConsent(
  choice: AnalyticsConsent,
  storage: ConsentStorage | null = safeStorage()
): void {
  if (!storage) return
  try {
    storage.setItem(ANALYTICS_CONSENT_KEY, choice)
  } catch {
    // Quota or private-mode failure; the in-memory state still updates.
  }
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new Event(ANALYTICS_CONSENT_EVENT))
  }
}

/**
 * Analytics loads only when consent was granted *and* a measurement ID exists.
 * A declined or undecided visitor never triggers a request.
 */
export function shouldLoadAnalytics(
  consent: AnalyticsConsent | null,
  measurementId: string = analyticsMeasurementId()
): boolean {
  return consent === 'granted' && measurementId.length > 0
}

interface AnalyticsEnv {
  document?: Document | null
  window?: (Window & typeof globalThis) | null
}

/**
 * Injects the analytics loader, but only for a granted decision. Returns true
 * when a script was appended, so callers and tests can assert that nothing
 * happened by default.
 */
export function loadAnalytics(
  consent: AnalyticsConsent | null,
  measurementId: string = analyticsMeasurementId(),
  env?: AnalyticsEnv
): boolean {
  if (!shouldLoadAnalytics(consent, measurementId)) return false

  const doc = env?.document ?? (typeof document === 'undefined' ? null : document)
  const win = env?.window ?? (typeof window === 'undefined' ? null : window)
  if (!doc || !win) return false

  // Never inject twice, e.g. on a client-side re-render.
  if (doc.querySelector('script[data-openquiz-analytics]')) return false

  win.dataLayer = win.dataLayer || []
  const gtag = (...args: unknown[]) => {
    if (win.dataLayer) win.dataLayer.push(args)
  }
  gtag('js', new Date())
  gtag('config', measurementId)

  const script = doc.createElement('script')
  script.async = true
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`
  script.dataset.openquizAnalytics = measurementId
  doc.head.appendChild(script)
  return true
}

/** Notifies a listener when consent changes here or in another tab. */
export function subscribeAnalyticsConsent(
  listener: (consent: AnalyticsConsent | null) => void
): () => void {
  if (typeof window === 'undefined') return () => {}
  const onChange = () => listener(readAnalyticsConsent())
  window.addEventListener(ANALYTICS_CONSENT_EVENT, onChange)
  window.addEventListener('storage', onChange)
  return () => {
    window.removeEventListener(ANALYTICS_CONSENT_EVENT, onChange)
    window.removeEventListener('storage', onChange)
  }
}
