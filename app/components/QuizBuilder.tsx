'use client'

import { useState } from 'react'
import { Plus, Trash2, Check, X, ListChecks, CheckSquare, CreditCard, MoveUp, MoveDown } from 'lucide-react'
import { QuizQuestion, QuizQuestionKind } from '../lib/satTypes'

interface QuizBuilderProps {
    onChange: (questions: QuizQuestion[]) => void
    initialQuestions?: QuizQuestion[]
}

function makeId(): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
    return `q-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function emptyQuestion(kind: QuizQuestionKind): QuizQuestion {
    const base: QuizQuestion = {
        id: makeId(),
        kind,
        prompt: '',
        explanation: ''
    }
    if (kind === 'multiple_choice') {
        base.options = ['', '', '', '']
        base.correctIndex = 0
    }
    if (kind === 'true_false') {
        base.correctAnswer = true
    }
    if (kind === 'flashcard') {
        base.answer = ''
    }
    return base
}

const KIND_META: Record<QuizQuestionKind, { label: string; icon: any; desc: string }> = {
    multiple_choice: { label: 'Multiple Choice', icon: ListChecks, desc: 'Pick from options' },
    true_false: { label: 'True / False', icon: CheckSquare, desc: 'True or false statement' },
    flashcard: { label: 'Flashcard', icon: CreditCard, desc: 'Question + answer' }
}

export default function QuizBuilder({ onChange, initialQuestions }: QuizBuilderProps) {
    const [questions, setQuestions] = useState<QuizQuestion[]>(initialQuestions?.length ? initialQuestions : [emptyQuestion('multiple_choice')])

    const push = (updated: QuizQuestion[]) => {
        setQuestions(updated)
        onChange(updated)
    }

    const update = (idx: number, patch: Partial<QuizQuestion>) => {
        const next = [...questions]
        next[idx] = { ...next[idx], ...patch }
        push(next)
    }

    const updateOptions = (idx: number, optionIdx: number, value: string) => {
        const q = questions[idx]
        const options = [...(q.options || [])]
        options[optionIdx] = value
        update(idx, { options })
    }

    const addOption = (idx: number) => {
        const q = questions[idx]
        const options = [...(q.options || []), '']
        push(questions.map((item, i) => (i === idx ? { ...item, options } : item)))
    }

    const removeOption = (idx: number, optionIdx: number) => {
        const q = questions[idx]
        const options = (q.options || []).filter((_, i) => i !== optionIdx)
        const correctIndex = q.correctIndex ?? 0
        const fixedIndex = correctIndex === optionIdx ? 0 : correctIndex > optionIdx ? correctIndex - 1 : correctIndex
        push(questions.map((item, i) => (i === idx ? { ...item, options, correctIndex: fixedIndex } : item)))
    }

    const remove = (idx: number) => {
        push(questions.filter((_, i) => i !== idx))
    }

    const move = (idx: number, dir: -1 | 1) => {
        const target = idx + dir
        if (target < 0 || target >= questions.length) return
        const next = [...questions]
        const temp = next[idx]
        next[idx] = next[target]
        next[target] = temp
        push(next)
    }

    const addQuestion = () => {
        push([...questions, emptyQuestion('multiple_choice')])
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-neutral-700 dark:text-neutral-300">
                    Questions ({questions.length})
                </p>
                <button
                    onClick={addQuestion}
                    className="btn-secondary text-xs py-2 flex items-center gap-2"
                >
                    <Plus className="w-4 h-4" />
                    Add Question
                </button>
            </div>

            {questions.length === 0 && (
                <div className="text-center text-sm text-neutral-500 dark:text-neutral-400 py-8">
                    No questions yet — click &quot;Add Question&quot; to begin.
                </div>
            )}

            {questions.map((q, idx) => (
                <div key={q.id} className="border-2 border-neutral-200 dark:border-neutral-700 rounded-2xl p-4 space-y-4">
                    {/* Header row: type select + actions */}
                    <div className="flex items-center gap-2">
                        <select
                            value={q.kind}
                            onChange={(e) => {
                                const kind = e.target.value as QuizQuestionKind
                                const base = emptyQuestion(kind)
                                push(questions.map((item, i) => (i === idx ? { ...base, id: item.id, prompt: item.prompt } : item)))
                            }}
                            className="input-field flex-1"
                        >
                            {(Object.keys(KIND_META) as QuizQuestionKind[]).map(k => (
                                <option key={k} value={k}>{KIND_META[k].label}</option>
                            ))}
                        </select>
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => move(idx, -1)}
                                disabled={idx === 0}
                                className="p-2 rounded-lg text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                aria-label="Move up"
                            >
                                <MoveUp className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => move(idx, 1)}
                                disabled={idx === questions.length - 1}
                                className="p-2 rounded-lg text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                aria-label="Move down"
                            >
                                <MoveDown className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => remove(idx)}
                                className="p-2 rounded-lg text-error dark:text-error-light hover:bg-error/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                aria-label="Delete question"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    {/* Prompt */}
                    <div>
                        <label className="block text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide mb-1">
                            {q.kind === 'flashcard' ? 'Front (question)' : 'Question'}
                        </label>
                        <textarea
                            value={q.prompt}
                            onChange={(e) => update(idx, { prompt: e.target.value })}
                            className="input-field min-h-[80px]"
                            placeholder={q.kind === 'flashcard' ? 'e.g., What is photosynthesis?' : 'e.g., What is the capital of France?'}
                        />
                    </div>

                    {/* Kind-specific inputs */}
                    {q.kind === 'multiple_choice' && (
                        <div className="space-y-2">
                            <label className="block text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">
                                Options
                            </label>
                            {(q.options || []).map((opt, oi) => (
                                <div key={oi} className="flex items-center gap-2">
                                    <button
                                        onClick={() => update(idx, { correctIndex: oi })}
                                        className={`w-8 h-8 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${oi === q.correctIndex
                                                ? 'border-secondary bg-secondary/15 text-secondary dark:border-secondary-light dark:text-secondary-light'
                                                : 'border-neutral-300 dark:border-neutral-600 text-neutral-400 hover:border-neutral-500'
                                            }`}
                                        title="Mark as correct"
                                    >
                                        <Check className="w-4 h-4" />
                                    </button>
                                    <span className="text-xs font-bold text-neutral-400 w-4">{String.fromCharCode(65 + oi)}</span>
                                    <input
                                        type="text"
                                        value={opt}
                                        onChange={(e) => updateOptions(idx, oi, e.target.value)}
                                        className={`input-field flex-1 ${oi === q.correctIndex ? 'border-secondary' : ''}`}
                                        placeholder={`Option ${String.fromCharCode(65 + oi)}`}
                                    />
                                    {(q.options || []).length > 2 && (
                                        <button
                                            onClick={() => removeOption(idx, oi)}
                                            className="p-2 rounded-lg text-neutral-400 hover:text-error hover:bg-error/10 transition-colors"
                                            aria-label="Remove option"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            ))}
                            {(q.options || []).length < 6 && (
                                <button
                                    onClick={() => addOption(idx)}
                                    className="text-xs font-semibold text-primary dark:text-primary-light hover:underline flex items-center gap-1"
                                >
                                    <Plus className="w-3 h-3" />
                                    Add option
                                </button>
                            )}
                        </div>
                    )}

                    {q.kind === 'true_false' && (
                        <div>
                            <label className="block text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide mb-2">
                                Correct Answer
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                                {([true, false] as const).map(value => (
                                    <button
                                        key={String(value)}
                                        onClick={() => update(idx, { correctAnswer: value })}
                                        className={`py-3 rounded-xl font-bold transition-all ${q.correctAnswer === value
                                                ? 'bg-secondary/15 border-2 border-secondary text-secondary dark:text-secondary-light'
                                                : 'bg-neutral-100 dark:bg-neutral-800 border-2 border-transparent text-neutral-600 dark:text-neutral-400'
                                            }`}
                                    >
                                        {value ? 'True' : 'False'}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {q.kind === 'flashcard' && (
                        <div>
                            <label className="block text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide mb-1">
                                Back (answer)
                            </label>
                            <textarea
                                value={q.answer || ''}
                                onChange={(e) => update(idx, { answer: e.target.value })}
                                className="input-field min-h-[80px]"
                                placeholder="The answer shown after flipping the card"
                            />
                        </div>
                    )}

                    {/* Explanation (optional) */}
                    <div>
                        <label className="block text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide mb-1">
                            Explanation (optional)
                        </label>
                        <input
                            type="text"
                            value={q.explanation || ''}
                            onChange={(e) => update(idx, { explanation: e.target.value })}
                            className="input-field"
                            placeholder="Shown after answering"
                        />
                    </div>
                </div>
            ))}

            {questions.length > 0 && (
                <button
                    onClick={addQuestion}
                    className="w-full py-3 rounded-xl border-2 border-dashed border-neutral-300 dark:border-neutral-700 text-neutral-500 dark:text-neutral-400 hover:border-primary hover:text-primary transition-colors flex items-center justify-center gap-2 font-semibold"
                >
                    <Plus className="w-4 h-4" />
                    Add Question
                </button>
            )}
        </div>
    )
}