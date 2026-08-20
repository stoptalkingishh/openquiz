'use client'

import { X } from 'lucide-react'
import { Word } from '../lib/satTypes'
import { motion } from 'framer-motion'

interface WordModalProps {
    word: Word
    onClose: () => void
}

export default function WordModal({ word, onClose }: WordModalProps) {
    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center pointer-events-none">
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={onClose}
                className="absolute inset-0 bg-black/40 backdrop-blur-sm pointer-events-auto"
            />

            <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="bg-white dark:bg-surface-dark w-full max-w-lg rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl pointer-events-auto relative max-h-[90vh] overflow-y-auto m-4"
            >
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                    <X className="w-6 h-6 text-gray-400" />
                </button>

                <div className="flex flex-col items-center mb-6 mt-2">
                    <h2 className="text-4xl font-extrabold text-gray-800 dark:text-white mb-2">{word.word}</h2>
                    <p className="text-xl text-gray-500 dark:text-gray-400 font-medium">{word.ru}</p>
                </div>

                {word.image && (
                    <div className="mb-6 flex justify-center">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={word.image} alt={word.word} className="rounded-2xl max-h-64 w-full max-w-full object-contain border-2 border-neutral-200 dark:border-neutral-700" />
                    </div>
                )}

                <div className="space-y-6">
                    <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-2xl">
                        <h3 className="text-sm font-bold text-gray-400 uppercase mb-2">Examples</h3>
                        <ul className="space-y-3">
                            {word.simple_examples.map((ex, i) => (
                                <li key={i} className="text-gray-700 dark:text-gray-300 leading-relaxed">
                                    &ldquo;{ex}&rdquo;
                                </li>
                            ))}
                        </ul>
                    </div>

                    <div>
                        <h3 className="text-sm font-bold text-gray-400 uppercase mb-2">Advanced Usage</h3>
                        <p className="text-gray-700 dark:text-gray-300 leading-relaxed italic border-l-4 border-primary pl-4">
                            {word.advanced_example}
                        </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        {word.synonyms.map(syn => (
                            <span key={syn} className="px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg font-medium text-sm">
                                {syn}
                            </span>
                        ))}
                    </div>

                    <button className="w-full btn-primary mt-4">
                        Add to Focus
                    </button>
                </div>
            </motion.div>
        </div>
    )
}
