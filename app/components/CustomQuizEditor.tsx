'use client'

import { useState } from 'react'
import { Check, Plus, Sparkles, Trash2, X } from 'lucide-react'
import QuizBuilder from './QuizBuilder'
import { CustomQuiz, QuizQuestion, Word } from '../lib/satTypes'
import { buildQuizRevisionPrompt, generateQuizFromNotes, getAiSettings } from '../lib/ai'

type EditableQuiz = Pick<CustomQuiz, 'name' | 'description' | 'tags' | 'words' | 'questions' | 'is_public' | 'ai_source_prompt'>

function blankWord(): Word {
    return { word: '', ru: '', synonyms: [], simple_examples: [], advanced_example: '', confusions: [] }
}

export default function CustomQuizEditor({ quiz, saving, onCancel, onSave }: {
    quiz: CustomQuiz
    saving: boolean
    onCancel: () => void
    onSave: (quiz: EditableQuiz) => Promise<void>
}) {
    const [name, setName] = useState(quiz.name)
    const [description, setDescription] = useState(quiz.description || '')
    const [tags, setTags] = useState((quiz.tags || []).join(', '))
    const [isPublic, setIsPublic] = useState(Boolean(quiz.is_public))
    const [questions, setQuestions] = useState<QuizQuestion[]>(quiz.questions || [])
    const [words, setWords] = useState<Word[]>(quiz.words || [])
    const [contentKind, setContentKind] = useState<'questions' | 'words'>(quiz.questions?.length ? 'questions' : 'words')
    const [builderVersion, setBuilderVersion] = useState(0)
    const [sourcePrompt, setSourcePrompt] = useState(quiz.ai_source_prompt || '')
    const [revisionInstructions, setRevisionInstructions] = useState('')
    const [aiRevising, setAiRevising] = useState(false)
    const [aiError, setAiError] = useState('')
    const [error, setError] = useState('')
    const hasQuestions = contentKind === 'questions'

    const reviseWithAi = async () => {
        setAiError('')
        if (!sourcePrompt.trim()) {
            setAiError('Add the notes or prompt that describe this quiz first.')
            return
        }
        setAiRevising(true)
        try {
            const generated = await generateQuizFromNotes(
                buildQuizRevisionPrompt(sourcePrompt, { words, questions }, revisionInstructions),
                getAiSettings()
            )
            if (generated.questions.length) {
                setQuestions(generated.questions)
                setWords([])
                setContentKind('questions')
                setBuilderVersion(version => version + 1)
            } else if (generated.words.length) {
                setWords(generated.words)
                setQuestions([])
                setContentKind('words')
            } else {
                throw new Error('The AI returned no quiz content.')
            }
        } catch (err: any) {
            setAiError(err.message || 'Could not revise this quiz with AI.')
        } finally {
            setAiRevising(false)
        }
    }

    const submit = async () => {
        setError('')
        if (!name.trim()) return setError('Quiz name is required.')
        if (hasQuestions && !questions.length) return setError('Add at least one question.')
        if (!hasQuestions && (!words.length || words.some(word => !word.word.trim() || !word.ru.trim()))) {
            return setError('Each vocabulary item needs a term and definition.')
        }
        await onSave({
            name,
            description,
            tags: tags.split(',').map(tag => tag.trim()).filter(Boolean),
            is_public: isPublic,
            questions: hasQuestions ? questions : [],
            words: hasQuestions ? [] : words,
            ai_source_prompt: sourcePrompt
        })
    }

    return (
        <div className="card space-y-5">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <h2 className="text-xl font-bold">Edit quiz</h2>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400">Changes save to this device and your connected Drive storage.</p>
                </div>
                <button type="button" onClick={onCancel} className="w-10 h-10 shrink-0 flex items-center justify-center rounded-xl text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800" aria-label="Cancel editing">
                    <X className="w-5 h-5" />
                </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-semibold">Name<input value={name} onChange={e => setName(e.target.value)} className="input-field mt-1" /></label>
                <label className="block text-sm font-semibold">Tags (comma-separated)<input value={tags} onChange={e => setTags(e.target.value)} className="input-field mt-1" placeholder="networking, DNS" /></label>
            </div>
            <label className="block text-sm font-semibold">Description<textarea value={description} onChange={e => setDescription(e.target.value)} className="input-field mt-1 min-h-24" /></label>
            <label className="flex items-center gap-3 text-sm font-semibold"><input type="checkbox" checked={isPublic} onChange={e => setIsPublic(e.target.checked)} className="w-4 h-4" /> Add to my sharing list</label>
            <p className="text-sm text-neutral-500">Find it under Community → My sharing list, then send its Share link or JSON file. This does not publish it to a public directory.</p>

            <section className="rounded-xl border border-neutral-200 dark:border-neutral-700 p-4 space-y-3">
                <div><h3 className="font-bold flex items-center gap-2"><Sparkles className="w-4 h-4 text-primary" /> AI revision</h3><p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">Revise the draft below with AI. Review the result, then save changes to keep it.</p></div>
                <label className="block text-sm font-semibold">Original notes or generation prompt<textarea value={sourcePrompt} onChange={e => setSourcePrompt(e.target.value)} className="input-field mt-1 min-h-28" placeholder="Paste the notes used to create this quiz" /></label>
                <label className="block text-sm font-semibold">What should change? <span className="font-normal text-neutral-500">(optional)</span><textarea value={revisionInstructions} onChange={e => setRevisionInstructions(e.target.value)} className="input-field mt-1 min-h-20" placeholder="For example: add DNS questions and make distractors more realistic" /></label>
                {aiError && <p className="text-sm text-error-dark dark:text-error-light">{aiError}</p>}
                <button type="button" onClick={reviseWithAi} disabled={aiRevising} className="btn-outline w-full disabled:opacity-50"><Sparkles className="w-4 h-4 inline mr-2" />{aiRevising ? 'Generating revision…' : 'Generate revised content'}</button>
            </section>

            {hasQuestions ? <QuizBuilder key={builderVersion} initialQuestions={questions} onChange={setQuestions} /> : (
                <div className="space-y-3">
                    <div className="flex items-center justify-between"><h3 className="font-bold">Vocabulary</h3><button type="button" onClick={() => setWords([...words, blankWord()])} className="text-sm text-primary font-semibold flex items-center gap-1"><Plus className="w-4 h-4" /> Add term</button></div>
                    {words.map((word, index) => <div key={index} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
                        <input value={word.word} onChange={e => setWords(words.map((item, i) => i === index ? { ...item, word: e.target.value } : item))} className="input-field" placeholder="Term" />
                        <input value={word.ru} onChange={e => setWords(words.map((item, i) => i === index ? { ...item, ru: e.target.value } : item))} className="input-field" placeholder="Definition" />
                        <button type="button" onClick={() => setWords(words.filter((_, i) => i !== index))} className="w-10 h-10 shrink-0 flex items-center justify-center rounded-xl text-neutral-400 hover:text-error hover:bg-error/10" aria-label="Delete vocabulary item"><Trash2 className="w-4 h-4" /></button>
                    </div>)}
                </div>
            )}
            {error && <p className="text-sm text-error-dark dark:text-error-light">{error}</p>}
            <div className="flex gap-3"><button type="button" onClick={onCancel} className="btn-outline flex-1">Cancel</button><button type="button" onClick={submit} disabled={saving} className="btn-primary flex-1 disabled:opacity-50"><Check className="w-4 h-4 inline mr-2" />{saving ? 'Saving…' : 'Save changes'}</button></div>
        </div>
    )
}
