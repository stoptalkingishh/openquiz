'use client'

/**
 * OpenQuiz brand logo — a cute flat-vector owl holding a notecard with a
 * pencil tucked behind it. Rendered inline so it needs no external asset and
 * reads well in both light and dark themes at any size.
 */
export default function Logo({ className = 'w-12 h-12' }: { className?: string }) {
    return (
        <svg
            viewBox="0 0 128 128"
            className={className}
            aria-label="OpenQuiz logo"
            role="img"
        >
            <defs>
                <linearGradient id="oq-body" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#1B82E0" />
                    <stop offset="100%" stopColor="#0066CC" />
                </linearGradient>
                <linearGradient id="oq-belly" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#FFFFFF" />
                    <stop offset="100%" stopColor="#EAF2FB" />
                </linearGradient>
                <linearGradient id="oq-card" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#FFFEF6" />
                    <stop offset="100%" stopColor="#FBF6E4" />
                </linearGradient>
            </defs>

            {/* ---------- Ear tufts (behind body) ---------- */}
            <path d="M34 32 L28 8 L52 26 Z" fill="url(#oq-body)" />
            <path d="M94 32 L100 8 L76 26 Z" fill="url(#oq-body)" />
            <path d="M36 28 L33 14 L47 24 Z" fill="#004C99" opacity="0.35" />
            <path d="M92 28 L95 14 L81 24 Z" fill="#004C99" opacity="0.35" />

            {/* ---------- Owl body ---------- */}
            <circle cx="64" cy="60" r="44" fill="url(#oq-body)" />
            <path d="M20 60 C20 40 34 22 64 22 C94 22 108 40 108 60 C108 80 92 104 64 104 C36 104 20 80 20 60 Z"
                fill="url(#oq-body)" />

            {/* Belly */}
            <ellipse cx="64" cy="78" rx="26" ry="22" fill="url(#oq-belly)" />

            {/* ---------- Wing (behind card, right side) ---------- */}
            <path d="M96 52 Q116 58 114 76 Q112 94 96 98 Q88 84 88 72 Z"
                fill="#004C99" opacity="0.18" />

            {/* ---------- Eyes ---------- */}
            <circle cx="49" cy="52" r="14" fill="#FFFFFF" />
            <circle cx="79" cy="52" r="14" fill="#FFFFFF" />
            {/* eye rings */}
            <circle cx="49" cy="52" r="14" fill="none" stroke="#E7EEF7" strokeWidth="2" />
            <circle cx="79" cy="52" r="14" fill="none" stroke="#E7EEF7" strokeWidth="2" />
            {/* pupils */}
            <circle cx="51" cy="54" r="6" fill="#0F172A" />
            <circle cx="77" cy="54" r="6" fill="#0F172A" />
            {/* sparkle */}
            <circle cx="53.4" cy="51.6" r="2.1" fill="#FFFFFF" />
            <circle cx="79.4" cy="51.6" r="2.1" fill="#FFFFFF" />

            {/* ---------- Beak ---------- */}
            <path d="M58 64 L70 64 L64 76 Z" fill="#FF6B35" />
            <path d="M58 64 L70 64 L64 70 Z" fill="#FF8859" opacity="0.5" />

            {/* ---------- Notecard (held with tiny wing-foot) ---------- */}
            <g transform="rotate(-4 98 84)">
                <rect x="82" y="68" width="40" height="36" rx="6" fill="url(#oq-card)"
                    stroke="#E4DCC0" strokeWidth="2" />
                {/* folded corner */}
                <path d="M112 68 L122 78 L112 78 Z" fill="#E4DCC0" />
                {/* lines of "notes" */}
                <line x1="90" y1="80" x2="112" y2="80" stroke="#C9C2A6" strokeWidth="3" strokeLinecap="round" />
                <line x1="90" y1="88" x2="106" y2="88" stroke="#C9C2A6" strokeWidth="3" strokeLinecap="round" />
                <line x1="90" y1="96" x2="102" y2="96" stroke="#C9C2A6" strokeWidth="3" strokeLinecap="round" />

                {/* Pencil tucked behind the card */}
                <g transform="rotate(28 100 60)">
                    <rect x="97" y="28" width="7" height="26" rx="2.5" fill="#FF8A5C" />
                    <rect x="97" y="28" width="7" height="8" rx="2" fill="#FBBD6B" />
                    <path d="M97 54 L104 54 L100.5 64 Z" fill="#F3C39B" />
                    <path d="M100.5 64 L101.6 64 L100.9 59 L99 59 Z" fill="#334155" />
                </g>
            </g>

            {/* ---------- Wing holding the card (front of card) ---------- */}
            <path d="M92 62 Q106 58 108 66 Q104 76 98 80 Q92 82 90 74 Q88 68 92 62 Z"
                fill="url(#oq-body)" />
            <path d="M98 80 Q104 76 106 70" stroke="#004C99" strokeWidth="2.2" strokeLinecap="round"
                fill="none" opacity="0.45" />
        </svg>
    )
}