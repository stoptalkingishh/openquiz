'use client'

import { useState } from 'react'
import { Plus, Trash2, Check, X, ListChecks, CheckSquare, CreditCard, MoveUp, MoveDown, ClipboardList } from 'lucide-react'
import { QuizQuestion, QuizQuestionKind, SimulationStep } from '../lib/satTypes'

interface QuizBuilderProps {
    onChange: (questions: QuizQuestion[]) => void
    initialQuestions?: QuizQuestion[]
}

function makeId(): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
    return `q-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function fileToDataUrl(file: File, onDone: (url: string) => void) {
    const reader = new FileReader()
    reader.onload = () => onDone(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => onDone('')
    reader.readAsDataURL(file)
}

function isLikelyImage(url: string): boolean {
    return /^data:image\//.test(url) || /\.(png|jpe?g|gif|webp|avif|svg|bmp|ico)(\?|#|$)/i.test(url)
}

function ImagePicker({ value, onChange }: { value: string; onChange: (url: string) => void }) {
    const [id] = useState(() => makeId())
    return (
        <div className="space-y-2">
            <div className="flex items-center gap-2">
                <input
                    type="text"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    className="input-field flex-1"
                    placeholder="Paste an image URL"
                />
                <label
                    htmlFor={id}
                    className="px-4 py-3 rounded-xl text-sm font-semibold bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700 cursor-pointer transition-colors flex items-center gap-2 whitespace-nowrap"
                >
                    Upload
                </label>
                <input
                    id={id}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                        const f = e.target.files && e.target.files[0]
                        if (f) fileToDataUrl(f, onChange)
                    }}
                />
                {value && (
                    <button
                        onClick={() => onChange('')}
                        className="p-2 rounded-lg text-neutral-400 hover:text-error hover:bg-error/10 transition-colors"
                        aria-label="Remove image"
                    >
                        <X className="w-4 h-4" />
                    </button>
                )}
            </div>
            {value && (
                <div className="relative inline-block">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={value}
                        alt="Question media"
                        className="rounded-xl max-h-48 object-cover border-2 border-neutral-200 dark:border-neutral-700"
                        onError={(e) => {
                            if (isLikelyImage(value)) (e.currentTarget as HTMLImageElement).style.display = 'none'
                        }}
                    />
                </div>
            )}
        </div>
    )
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
    if (kind === 'simulation') {
        base.prompt = 'Simulation scenario: describe the environment and task here.'
        base.steps = []
    }
    return base
}

const KIND_META: Record<QuizQuestionKind, { label: string; icon: any; desc: string }> = {
    multiple_choice: { label: 'Multiple Choice', icon: ListChecks, desc: 'Pick from options' },
    true_false: { label: 'True / False', icon: CheckSquare, desc: 'True or false statement' },
    flashcard: { label: 'Flashcard', icon: CreditCard, desc: 'Question + answer' },
    simulation: { label: 'Simulation', icon: ClipboardList, desc: 'Interactive multi-step scenario (Security+ style)' }
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

                    {/* Media (Quizlet-style image support) */}
                    <div>
                        <label className="block text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide mb-1">
                            Image (optional)
                        </label>
                        <ImagePicker
                            value={q.image || ''}
                            onChange={(url) => update(idx, { image: url })}
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

                    {q.kind === 'simulation' && (
                        <SimulationStepEditor
                            steps={q.steps || []}
                            onChange={(steps) => update(idx, { steps })}
                        />
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

// ---------------------------------------------------------------------------
// Simulation (Comptia-style performance-based question) step editor
// ---------------------------------------------------------------------------

function SimulationStepEditor({ steps, onChange }: {
    steps: SimulationStep[]
    onChange: (steps: SimulationStep[]) => void
}) {
    const [activeIdx, setActiveIdx] = useState<number | null>(steps.length ? 0 : null)
    const makeStep = (kind: SimulationStep['kind']): SimulationStep => ({
        id: makeId(),
        kind,
        title: '',
        options: kind === 'choice' ? ['', ''] : undefined,
        correctIndex: kind === 'choice' ? 0 : undefined,
        items: kind === 'checkbox' ? [{ id: makeId(), label: 'Statement 1', correct: true }] : undefined,
        config: kind === 'config' ? [{ id: makeId(), label: 'Setting 1', correct: true }] : undefined,
        itemsToPlace: kind === 'placement' ? ['Item A', 'Item B'] : undefined,
        slots: kind === 'placement' ? ['Slot 1', 'Slot 2'] : undefined,
        correctMapping: kind === 'placement' ? [0, 1] : undefined,
        explanation: ''
    })

    const addStep = () => {
        const next = [...steps, makeStep('choice')]
        onChange(next)
        setActiveIdx(next.length - 1)
    }

    const patchStep = (idx: number, patch: Partial<SimulationStep>) => {
        const next = [...steps]
        next[idx] = { ...next[idx], ...patch }
        onChange(next)
    }

    const removeStep = (idx: number) => {
        const next = steps.filter((_, i) => i !== idx)
        onChange(next)
        if (activeIdx === idx) setActiveIdx(next.length ? Math.min(idx, next.length - 1) : null)
    }

    const moveStep = (idx: number, dir: -1 | 1) => {
        const target = idx + dir
        if (target < 0 || target >= steps.length) return
        const next = [...steps]
        const t = next[idx]
        next[idx] = next[target]
        next[target] = t
        onChange(next)
        setActiveIdx(target)
    }

    const active = activeIdx != null && steps[activeIdx] ? steps[activeIdx] : null

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">
                    Steps ({steps.length})
                </label>
                <button
                    onClick={addStep}
                    className="text-xs font-semibold text-primary dark:text-primary-light hover:underline flex items-center gap-1"
                >
                    <Plus className="w-3 h-3" /> Add step
                </button>
            </div>

            {steps.length === 0 && (
                <p className="text-sm text-neutral-500 dark:text-neutral-400">
                    Add steps to build the interactive simulation. Each step is graded independently — all must be correct to pass.
                </p>
            )}

            {/* Step list */}
            {steps.length > 0 && (
                <div className="border-2 border-neutral-200 dark:border-neutral-700 rounded-xl overflow-hidden">
                    {steps.map((s, i) => (
                        <div
                            key={s.id}
                            className={`flex items-center gap-2 px-3 py-2 border-b-2 last:border-b-0 cursor-pointer ${i === activeIdx ? 'bg-primary/10' : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/50'}`}
                            onClick={() => setActiveIdx(i)}
                        >
                            <span className="text-xs font-bold text-neutral-400 w-6">{i + 1}.</span>
                            <span className="flex-1 truncate text-sm text-neutral-700 dark:text-neutral-300">
                                {s.title || `Step ${i + 1}`}
                            </span>
                            <span className="badge-primary text-xs">{s.kind}</span>
                            <button
                                onClick={(e) => { e.stopPropagation(); moveStep(i, -1) }}
                                disabled={i === 0}
                                className="p-1 rounded text-neutral-400 hover:text-neutral-600 disabled:opacity-30"
                                aria-label="Move up"
                            >
                                <MoveUp className="w-4 h-4" />
                            </button>
                            <button
                                onClick={(e) => { e.stopPropagation(); moveStep(i, 1) }}
                                disabled={i === steps.length - 1}
                                className="p-1 rounded text-neutral-400 hover:text-neutral-600 disabled:opacity-30"
                                aria-label="Move down"
                            >
                                <MoveDown className="w-4 h-4" />
                            </button>
                            <button
                                onClick={(e) => { e.stopPropagation(); removeStep(i) }}
                                className="p-1 rounded text-neutral-400 hover:text-error"
                                aria-label="Delete step"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* Active step editor */}
            {active && (
                <div className="border-2 border-neutral-200 dark:border-neutral-700 rounded-xl p-4 space-y-3">
                    <div className="flex items-center gap-2">
                        <select
                            value={active.kind}
                            onChange={(e) => {
                                const kind = e.target.value as SimulationStep['kind']
                                const fresh = makeStep(kind)
                                patchStep(activeIdx as number, { ...fresh, id: active.id })
                            }}
                            className="input-field flex-1"
                        >
                            <option value="choice">Choice (pick one)</option>
                            <option value="checkbox">Checklist (toggle on/off)</option>
                            <option value="config">Config (enable/disable controls)</option>
                            <option value="placement">Placement (map items to slots)</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide mb-1">
                            Instruction / task
                        </label>
                        <textarea
                            value={active.title}
                            onChange={(e) => patchStep(activeIdx as number, { title: e.target.value })}
                            className="input-field min-h-[60px]"
                            placeholder="e.g., Configure the firewall to block inbound traffic on port 445"
                        />
                    </div>

                    {active.kind === 'choice' && (
                        <div className="space-y-2">
                            <label className="block text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">
                                Options
                            </label>
                            {(active.options || []).map((opt, oi) => (
                                <div key={oi} className="flex items-center gap-2">
                                    <button
                                        onClick={() => patchStep(activeIdx as number, { correctIndex: oi })}
                                        className={`w-8 h-8 rounded-full border-2 flex items-center justify-center shrink-0 ${oi === active.correctIndex ? 'border-secondary bg-secondary/15 text-secondary' : 'border-neutral-300 text-neutral-400'}`}
                                        title="Mark as correct"
                                    >
                                        <Check className="w-4 h-4" />
                                    </button>
                                    <input
                                        type="text"
                                        value={opt}
                                        onChange={(e) => {
                                            const options = [...(active.options || [])]
                                            options[oi] = e.target.value
                                            patchStep(activeIdx as number, { options })
                                        }}
                                        className="input-field flex-1"
                                        placeholder={`Option ${String.fromCharCode(65 + oi)}`}
                                    />
                                    {(active.options || []).length > 2 && (
                                        <button
                                            onClick={() => {
                                                const options = (active.options || []).filter((_, i) => i !== oi)
                                                patchStep(activeIdx as number, { options })
                                            }}
                                            className="p-1 text-neutral-400 hover:text-error"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            ))}
                            <button
                                onClick={() => patchStep(activeIdx as number, { options: [...(active.options || []), ''] })}
                                className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
                            >
                                <Plus className="w-3 h-3" /> Add option
                            </button>
                        </div>
                    )}

                    {(active.kind === 'checkbox' || active.kind === 'config') && (
                        <ChecklistItemsEditor
                            items={active.kind === 'config' ? active.config || [] : active.items || []}
                            onChange={(items) => patchStep(activeIdx as number, { [active.kind]: items })}
                        />
                    )}

                    {active.kind === 'placement' && (
                        <PlacementEdit
                            step={active}
                            onChange={(patch) => patchStep(activeIdx as number, patch)}
                        />
                    )}

                    <div>
                        <label className="block text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide mb-1">
                            Explanation (shown in review if wrong)
                        </label>
                        <input
                            type="text"
                            value={active.explanation || ''}
                            onChange={(e) => patchStep(activeIdx as number, { explanation: e.target.value })}
                            className="input-field"
                            placeholder="e.g., ACLs should deny inbound on port 445"
                        />
                    </div>
                </div>
            )}
        </div>
    )
}

function ChecklistItemsEditor({ items, onChange }: {
    items: { id: string; label: string; correct: boolean }[]
    onChange: (items: { id: string; label: string; correct: boolean }[]) => void
}) {
    const makeItem = (label: string, correct: boolean) => ({ id: makeId(), label, correct })
    return (
        <div className="space-y-2">
            <label className="block text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">
                Items
            </label>
            {items.map((it, i) => (
                <div key={it.id} className="flex items-center gap-2">
                    <button
                        onClick={() => {
                            const next = [...items]
                            next[i] = { ...next[i], correct: !next[i].correct }
                            onChange(next)
                        }}
                        className={`w-8 h-8 rounded border-2 flex items-center justify-center shrink-0 ${it.correct ? 'border-secondary bg-secondary/15 text-secondary' : 'border-neutral-300 text-neutral-400'}`}
                        title="Toggle correct-on"
                    >
                        <Check className="w-4 h-4" />
                    </button>
                    <input
                        type="text"
                        value={it.label}
                        onChange={(e) => {
                            const next = [...items]
                            next[i] = { ...next[i], label: e.target.value }
                            onChange(next)
                        }}
                        className="input-field flex-1"
                        placeholder="Statement / setting"
                    />
                    <button
                        onClick={() => onChange(items.filter((_, ix) => ix !== i))}
                        className="p-1 text-neutral-400 hover:text-error"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>
            ))}
            <button
                onClick={() => onChange([...items, makeItem('New item', true)])}
                className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
            >
                <Plus className="w-3 h-3" /> Add item
            </button>
        </div>
    )
}

function PlacementEdit({ step, onChange }: {
    step: SimulationStep
    onChange: (patch: Partial<SimulationStep>) => void
}) {
    const list = (key: 'itemsToPlace' | 'slots', valueIdx: number, patch: string[]) => {
        if (key === 'itemsToPlace') {
            onChange({ itemsToPlace: patch, correctMapping: (step.correctMapping || []).slice(0, patch.length) })
        } else {
            onChange({ slots: patch })
        }
    }
    return (
        <div className="space-y-3">
            <div>
                <label className="block text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide mb-1">
                    Items to place
                </label>
                {(step.itemsToPlace || []).map((it, i) => (
                    <div key={i} className="flex items-center gap-2 mb-2">
                        <input
                            type="text"
                            value={it}
                            onChange={(e) => {
                                const arr = [...(step.itemsToPlace || [])]
                                arr[i] = e.target.value
                                list('itemsToPlace', i, arr)
                            }}
                            className="input-field flex-1"
                        />
                        <button onClick={() => list('itemsToPlace', i, (step.itemsToPlace || []).filter((_, ix) => ix !== i))} className="p-1 text-neutral-400 hover:text-error">
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </div>
                ))}
                <button
                    onClick={() => { const arr = [...(step.itemsToPlace || []), `Item ${(step.itemsToPlace || []).length + 1}`]; onChange({ itemsToPlace: arr, correctMapping: (step.correctMapping || []).slice(0, arr.length) }) }}
                    className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
                >
                    <Plus className="w-3 h-3" /> Add item
                </button>
            </div>
            <div>
                <label className="block text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide mb-1">
                    Slots
                </label>
                {(step.slots || []).map((s, i) => (
                    <div key={i} className="flex items-center gap-2 mb-2">
                        <input
                            type="text"
                            value={s}
                            onChange={(e) => {
                                const arr = [...(step.slots || [])]
                                arr[i] = e.target.value
                                list('slots', i, arr)
                            }}
                            className="input-field flex-1"
                        />
                        <button onClick={() => list('slots', i, (step.slots || []).filter((_, ix) => ix !== i))} className="p-1 text-neutral-400 hover:text-error">
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </div>
                ))}
                <button
                    onClick={() => list('slots', 0, [...(step.slots || []), `Slot ${(step.slots || []).length + 1}`])}
                    className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
                >
                    <Plus className="w-3 h-3" /> Add slot
                </button>
            </div>
            <div>
                <label className="block text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide mb-1">
                    Correct mapping (does slot value answer belong to?)
                </label>
                {(step.slots || []).length > 0 && (
                    <p className="text-xs text-neutral-500 mb-2">
                        For each slot, which item index (0-based) belongs there?
                    </p>
                )}
                {(step.slots || []).map((s, si) => (
                    <div key={si} className="flex items-center gap-2 mb-1">
                        <span className="text-xs text-neutral-500 w-24 truncate">{s}</span>
                        <input
                            type="number"
                            min={0}
                            max={(step.itemsToPlace || []).length - 1}
                            value={(step.correctMapping || [])[si] ?? 0}
                            onChange={(e) => {
                                const cm = [...(step.correctMapping || [])]
                                cm[si] = Number(e.target.value)
                                onChange({ correctMapping: cm })
                            }}
                            className="input-field w-20"
                        />
                    </div>
                ))}
            </div>
        </div>
    )
}