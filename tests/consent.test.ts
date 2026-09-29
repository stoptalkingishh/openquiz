import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

vi.stubEnv('NEXT_PUBLIC_GA_MEASUREMENT_ID', 'G-TEST123')

import {
    ANALYTICS_CONSENT_KEY,
    analyticsMeasurementId,
    loadAnalytics,
    readAnalyticsConsent,
    shouldLoadAnalytics,
    subscribeAnalyticsConsent,
    writeAnalyticsConsent,
} from '../app/lib/consent'

interface FakeStorage {
    data: Map<string, string>
    getItem(key: string): string | null
    setItem(key: string, value: string): void
}

function fakeStorage(seed: Record<string, string> = {}): FakeStorage {
    const data = new Map(Object.entries(seed))
    return {
        data,
        getItem: key => data.get(key) ?? null,
        setItem: (key, value) => { data.set(key, value) },
    }
}

/** Minimal document/window pair so the loader can be asserted without a browser. */
function fakeDom() {
    const appended: { src: string; async: boolean }[] = []
    const head = {
        appendChild: (node: { src: string; async: boolean; dataset: Record<string, string> }) => {
            appended.push(node)
        },
    }
    const document = {
        head,
        createElement: () => ({ src: '', async: false, dataset: {} as Record<string, string> }),
        querySelector: () => null,
    } as unknown as Document
    const listeners: Record<string, (() => void)[]> = {}
    const win = {
        dataLayer: undefined as unknown[] | undefined,
        addEventListener: (type: string, fn: () => void) => { (listeners[type] ??= []).push(fn) },
        removeEventListener: (type: string, fn: () => void) => {
            listeners[type] = (listeners[type] ?? []).filter(l => l !== fn)
        },
        dispatchEvent: (event: Event) => {
            ;(listeners[event.type] ?? []).forEach(fn => fn())
            return true
        },
    } as unknown as Window & typeof globalThis
    return { document, window: win, appended, listeners }
}

beforeEach(() => {
    vi.stubGlobal('window', { localStorage: fakeStorage() })
})
afterEach(() => vi.unstubAllGlobals())

describe('analytics consent', () => {
    it('does not load analytics before a decision is made', () => {
        const dom = fakeDom()
        expect(readAnalyticsConsent()).toBeNull()
        expect(shouldLoadAnalytics(null)).toBe(false)
        expect(loadAnalytics(null, analyticsMeasurementId(), dom)).toBe(false)
        expect(dom.appended).toHaveLength(0)
    })

    it('never loads analytics when the visitor declines', () => {
        const storage = fakeStorage()
        writeAnalyticsConsent('denied', storage)
        expect(readAnalyticsConsent(storage)).toBe('denied')
        expect(shouldLoadAnalytics('denied')).toBe(false)
        const dom = fakeDom()
        expect(loadAnalytics('denied', analyticsMeasurementId(), dom)).toBe(false)
        expect(dom.appended).toHaveLength(0)
    })

    it('loads the analytics script only after consent is granted', () => {
        const dom = fakeDom()
        expect(shouldLoadAnalytics('granted')).toBe(true)
        expect(loadAnalytics('granted', analyticsMeasurementId(), dom)).toBe(true)
        expect(dom.appended).toHaveLength(1)
        expect(dom.appended[0].src).toBe('https://www.googletagmanager.com/gtag/js?id=G-TEST123')
        expect(dom.appended[0].async).toBe(true)
        expect(dom.window.dataLayer).toHaveLength(2)
    })

    it('does not load analytics when the id resolves to empty', () => {
        // A build with no configured id must not request anything, so the
        // no-op path is still guarded even though the shipped default is set.
        vi.stubEnv('NEXT_PUBLIC_GA_MEASUREMENT_ID', '')
        expect(shouldLoadAnalytics('granted', '')).toBe(false)
        const dom = fakeDom()
        expect(loadAnalytics('granted', '', dom)).toBe(false)
        expect(dom.appended).toHaveLength(0)
    })

    it('falls back to the shipped measurement id when none is configured', () => {
        // The gate has to govern the analytics that actually ships, so the
        // project property is retained as the default rather than silently
        // disabling analytics on builds that omit the variable.
        vi.stubEnv('NEXT_PUBLIC_GA_MEASUREMENT_ID', '')
        expect(analyticsMeasurementId()).toBe('G-G0MB0JNRD4')
    })

    it('persists the choice so the prompt is not shown again', () => {
        const storage = fakeStorage()
        writeAnalyticsConsent('granted', storage)
        expect(storage.getItem(ANALYTICS_CONSENT_KEY)).toBe('granted')
        expect(readAnalyticsConsent(storage)).toBe('granted')
    })

    it('ignores a corrupted or missing stored value', () => {
        expect(readAnalyticsConsent(fakeStorage())).toBeNull()
        expect(readAnalyticsConsent(fakeStorage({ [ANALYTICS_CONSENT_KEY]: 'true' }))).toBeNull()
        expect(readAnalyticsConsent(null)).toBeNull()
    })

    it('survives storage failures without reporting a decision', () => {
        const failing = {
            getItem: () => { throw new Error('blocked') },
            setItem: () => { throw new Error('quota') },
        }
        expect(readAnalyticsConsent(failing)).toBeNull()
        expect(() => writeAnalyticsConsent('granted', failing)).not.toThrow()
    })

    it('injects the analytics script at most once per page', () => {
        const dom = fakeDom()
        dom.document.querySelector = () => ({}) as unknown as Element
        expect(loadAnalytics('granted', 'G-TEST123', dom)).toBe(false)
        expect(dom.appended).toHaveLength(0)
    })

    it('notifies subscribers when consent changes and stops on unsubscribe', () => {
        const dom = fakeDom()
        vi.stubGlobal('window', Object.assign(dom.window, { localStorage: fakeStorage() }))
        const seen: (string | null)[] = []
        const unsubscribe = subscribeAnalyticsConsent(choice => seen.push(choice))
        writeAnalyticsConsent('granted')
        expect(seen).toEqual(['granted'])
        unsubscribe()
        writeAnalyticsConsent('denied')
        expect(seen).toEqual(['granted'])
        expect(dom.listeners.storage).toHaveLength(0)
    })

    it('survives an environment with no document', () => {
        expect(loadAnalytics('granted', 'G-TEST123', { document: null, window: null })).toBe(false)
    })
})
