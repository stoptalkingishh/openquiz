'use client'

import { useCallback, useEffect, useId, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
].join(', ')

function isVisible(element: HTMLElement): boolean {
    if (element.hasAttribute('hidden')) return false
    if (element.getAttribute('aria-hidden') === 'true') return false
    return true
}

type DialogProps = {
    open: boolean
    onClose: () => void
    /** Rendered as the dialog's own heading and used as its accessible name. */
    title?: React.ReactNode
    /** Rendered beside the title in the header row (typically a close button). */
    headerAction?: React.ReactNode
    children?: React.ReactNode
    /** Class applied to the dialog panel. */
    className?: string
    /** Set false to keep clicks on the dimmed backdrop from closing the dialog. */
    closeOnBackdropClick?: boolean
    /** Set false to keep Escape from closing the dialog. */
    closeOnEscape?: boolean
    /** When true the dialog shows no enter/exit motion (useful for reduced motion). */
    disableAnimation?: boolean
}

/**
 * Accessible modal dialog primitive.
 *
 * Provides the behaviour every modal in the app needs and that is easy to miss
 * when it is re-implemented per screen: dialog semantics, an accessible name,
 * a Tab/Shift+Tab focus trap, Escape and backdrop dismissal, and focus
 * restoration to whatever opened the dialog.
 */
export default function Dialog({
    open,
    onClose,
    title,
    headerAction,
    children,
    className = '',
    closeOnBackdropClick = true,
    closeOnEscape = true,
    disableAnimation = false
}: DialogProps) {
    // Callers that need a wider or narrower panel pass their own `max-w-*`; the
    // default only applies when they did not, because two competing max-width
    // utilities on one element resolve by stylesheet order, not by class order.
    const hasOwnWidth = /(^|\s)max-w-/.test(className)
    const panelRef = useRef<HTMLDivElement>(null)
    const previouslyFocused = useRef<HTMLElement | null>(null)
    const titleId = useId()

    const getFocusable = useCallback((): HTMLElement[] => {
        const panel = panelRef.current
        if (!panel) return []
        return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(isVisible)
    }, [])

    // Move focus into the dialog on open and hand it back on close.
    useEffect(() => {
        if (!open) return

        previouslyFocused.current = (document.activeElement as HTMLElement | null) ?? null

        const focusable = getFocusable()
        const initial = focusable[0] ?? panelRef.current
        if (initial) initial.focus()

        return () => {
            const previous = previouslyFocused.current
            previouslyFocused.current = null
            if (previous && typeof previous.focus === 'function' && document.contains(previous)) {
                previous.focus()
            }
        }
    }, [open, getFocusable])

    // Escape is handled on the document so it works no matter where focus sits.
    useEffect(() => {
        if (!open || !closeOnEscape) return

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.stopPropagation()
                onClose()
            }
        }

        document.addEventListener('keydown', onKeyDown)
        return () => document.removeEventListener('keydown', onKeyDown)
    }, [open, closeOnEscape, onClose])

    // Keep focus inside the dialog even if something outside steals it.
    useEffect(() => {
        if (!open) return

        const onFocusIn = (event: FocusEvent) => {
            const panel = panelRef.current
            const target = event.target as Node | null
            if (panel && target && !panel.contains(target)) {
                const focusable = getFocusable()
                const next = focusable[0] ?? panel
                next.focus()
            }
        }

        document.addEventListener('focusin', onFocusIn)
        return () => document.removeEventListener('focusin', onFocusIn)
    }, [open, getFocusable])

    const onPanelKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.key !== 'Tab') return

        const focusable = getFocusable()
        if (focusable.length === 0) {
            event.preventDefault()
            panelRef.current?.focus()
            return
        }

        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        const active = document.activeElement

        if (event.shiftKey && (active === first || active === panelRef.current)) {
            event.preventDefault()
            last.focus()
        } else if (!event.shiftKey && active === last) {
            event.preventDefault()
            first.focus()
        }
    }

    const backdropMotion = disableAnimation
        ? {}
        : {
            initial: { opacity: 0 },
            animate: { opacity: 1 },
            exit: { opacity: 0 }
        }

    const panelMotion = disableAnimation
        ? {}
        : {
            initial: { scale: 0.9, opacity: 0 },
            animate: { scale: 1, opacity: 1 },
            exit: { scale: 0.9, opacity: 0 }
        }

    return (
        <div
            className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${open ? '' : 'pointer-events-none'}`}
        >
            <AnimatePresence>
                {open && (
                    <motion.div
                        key="dialog-backdrop"
                        aria-hidden="true"
                        {...backdropMotion}
                        onClick={closeOnBackdropClick ? onClose : undefined}
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                    />
                )}
            </AnimatePresence>

            <AnimatePresence>
                {open && (
                    <motion.div
                        key="dialog-panel"
                        ref={panelRef}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby={title ? titleId : undefined}
                        tabIndex={-1}
                        {...panelMotion}
                        onKeyDown={onPanelKeyDown}
                        className={`bg-white dark:bg-surface-dark rounded-3xl p-6 shadow-2xl relative z-10 ${hasOwnWidth ? '' : 'max-w-md '}w-full ${className}`}
                    >
                        {title || headerAction ? (
                            <div className="flex items-center justify-between gap-3 mb-4">
                                {title ? (
                                    <h2 id={titleId} className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">
                                        {title}
                                    </h2>
                                ) : (
                                    <span />
                                )}
                                {headerAction}
                            </div>
                        ) : null}
                        {children}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
