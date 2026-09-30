import { Word, WordProgress, Question, SessionMode, QuizQuestion } from './satTypes';
import { hasCloze, extractClozeCards } from './cloze';

// Helper to shuffle array
function shuffle<T>(array: T[]): T[] {
    const newArray = [...array];
    for (let i = newArray.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    return newArray;
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function clozeSentence(source: string, word: Word): string {
    const target = word.word.trim()
    const example = source.trim()
    if (example) {
        const pattern = new RegExp(`\\b${escapeRegExp(target)}\\w*\\b`, 'gi')
        if (pattern.test(example)) return example.replace(pattern, '_______')
        if (/_{3,}/.test(example) && !example.toLocaleLowerCase().includes(target.toLocaleLowerCase())) {
            return example
        }
    }
    // Minimal word/definition imports have no example. Use the definition as
    // the clue instead of displaying the answer as the entire sentence.
    return `A word meaning "${word.ru.trim()}" is _______.`
}

function uniqueOptions(correct: string, distractors: string[]): string[] {
    const seen = new Set<string>()
    return [correct, ...distractors].filter(value => {
        const key = String(value).trim().toLocaleLowerCase()
        if (!key || seen.has(key)) return false
        seen.add(key)
        return true
    })
}

export function updateProgress(prev: WordProgress | undefined, correct: boolean, word: string, quality?: number): WordProgress {
    const now = Date.now();
    const base = prev ?? {
        word: word,
        strength: 0,
        lastSeen: 0,
        nextDue: now,
        seenCount: 0,
        wrongStreak: 0,
        status: 'new'
    };

    const seenCount = (base.seenCount || 0) + 1;
    let wrongStreak = base.wrongStreak || 0;

    if (correct) {
        wrongStreak = 0;
    } else {
        wrongStreak += 1;
    }

    // SM-2-lite: quality (0–5) either comes from an explicit self-rating or is
    // derived from the boolean result (correct → "Good", wrong → "Again").
    const q = Math.max(0, Math.min(5, quality != null ? quality : (correct ? 4 : 1)));
    const ease = Math.max(1.3, (base.ease ?? 2.5) + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));

    let repetitions = base.repetitions || 0;
    let interval = base.interval || 0;

    if (q < 3) {
        repetitions = 0;
        interval = 0;
    } else {
        repetitions += 1;
        interval = repetitions === 1 ? 1 : repetitions === 2 ? 6 : Math.round((base.interval || 1) * ease);
    }

    const nextDue = now + interval * 24 * 60 * 60 * 1000;

    // Ease describes how quickly this card's interval grows. It does not by
    // itself describe retention: a first "Good" review leaves ease at its
    // default value forever. Derive strength from successful repetitions and
    // the interval being retained, while letting a failed review decay it.
    const previousStrength = Math.max(0, Math.min(1, base.strength || 0));
    const repetitionScore = Math.min(1, repetitions / 5);
    const retentionScore = interval > 0 ? Math.min(1, Math.log2(interval + 1) / 5) : 0;
    const qualityScore = q / 5;
    const successfulStrength = 0.45 * repetitionScore + 0.35 * retentionScore + 0.2 * qualityScore;
    const strength = q < 3
        ? Math.max(0, previousStrength - 0.25)
        : Math.min(1, Math.max(successfulStrength, previousStrength + 0.1));

    let status: 'new' | 'learning' | 'mastered' = 'learning';
    if (strength >= 0.8 && repetitions >= 4) status = 'mastered';

    return {
        ...base,
        seenCount,
        lastSeen: now,
        strength,
        wrongStreak,
        nextDue,
        status,
        ease,
        repetitions,
        interval
    };
}

// ---------------------------------------------------------------------------
// Quiz-scoped progress keys
// ---------------------------------------------------------------------------

/**
 * Progress used to be stored under the bare word, so the same spelling in two
 * quizzes shared mastery, scheduling and mistake history even when their
 * definitions differed. Sessions now key every card as `${quizPath}::${item}`,
 * matching what generic quiz questions already do.
 */
export function progressKeyFor(progressKeyPrefix: string, id: string): string {
    return progressKeyPrefix ? `${progressKeyPrefix}::${id}` : id
}

/**
 * Read a card's progress, preferring the quiz-scoped key and falling back to the
 * bare word, so history written before this change is honored once instead of
 * looking brand new.
 */
function makeProgressLookup(progressMap: Record<string, WordProgress>, progressKeyPrefix: string) {
    return (id: string): WordProgress | undefined => {
        const scoped = progressMap[progressKeyFor(progressKeyPrefix, id)]
        if (scoped) return scoped
        return progressKeyPrefix ? progressMap[id] : undefined
    }
}

/**
 * Stamp quiz-scoped progress keys onto a built session, plus the label that
 * should appear on the saved record. Vocabulary cards label the record with the
 * word itself; generic quiz cards label it with the prompt, because their key
 * is a question id and would be meaningless in a progress list.
 */
export function scopeSessionProgress(questions: Question[], progressKeyPrefix = ''): Question[] {
    if (!progressKeyPrefix) return questions
    return questions.map(question => ({
        ...question,
        progressKey: (question as Question & { progressKey?: string }).progressKey
            || progressKeyFor(progressKeyPrefix, question.word || question.id),
        progressWord: String(question.word || question.id)
    }))
}

export function buildSession(
    mode: SessionMode,
    allWords: Word[],
    progressMap: Record<string, WordProgress>,
    limit?: number, // undefined means all words
    progressKeyPrefix = ''
): Question[] {
    const now = Date.now()
    const lookupProgress = makeProgressLookup(progressMap, progressKeyPrefix);

    // Drop malformed entries so a bad custom quiz can never crash the build.
    const safeWords = (allWords || []).filter(w =>
        w && typeof w.word === 'string' && w.word.trim() && typeof w.ru === 'string'
    );

    // "Mistakes" mode should only draw from words the user actually got wrong,
    // otherwise brand-new words (highest priority) crowd the mistakes out.
    const sourceWords = mode === 'mistakes'
        ? safeWords.filter(w => (lookupProgress(w.word)?.wrongStreak || 0) > 0)
        : safeWords

    // 1. Select candidates by priority - prioritize new/weak words, avoid recently seen
    const candidates = sourceWords
        .map(w => {
            const p = lookupProgress(w.word);
            const progress = p ?? { 
                strength: 0, 
                nextDue: 0, 
                word: w.word, 
                lastSeen: 0, 
                seenCount: 0, 
                wrongStreak: 0, 
                status: 'new' as const 
            };
            
            // Priority score: higher = more important
            let priority = 0;
            
            // New words get highest priority
            if ((progress.seenCount || 0) === 0) {
                priority += 1000;
            }
            
            // Overdue words get high priority
            if (progress.nextDue && progress.nextDue <= now) {
                priority += 500;
            }
            
            // Weak words (low strength) get priority
            priority += (1 - (progress.strength || 0)) * 200;
            
            // Words with mistakes get priority
            if ((progress.wrongStreak || 0) > 0) {
                priority += (progress.wrongStreak || 0) * 100;
            }
            
            // Penalize recently seen words (within last hour) to avoid cycling
            const hoursSinceSeen = (now - progress.lastSeen) / (1000 * 60 * 60);
            if (hoursSinceSeen < 1 && (progress.seenCount || 0) > 0) {
                priority -= 300;
            }
            
            return {
                word: w,
                progress,
                priority
            };
        })
        .sort((a, b) => b.priority - a.priority);

    // If limit is undefined, use all words. Otherwise use limit or all available, whichever is smaller
    const wordLimit = limit === undefined ? candidates.length : Math.min(limit, candidates.length);
    const selectedWords = candidates
        .slice(0, wordLimit * 2) // Get more candidates to ensure variety
        .map(x => x.word)
        .slice(0, wordLimit);

    // 2. Create questions
    let questions: Question[] = [];
    for (const w of selectedWords) {
        if (mode === "learn") {
            questions.push(makeRecallQuestion(w));
            questions.push(makeSimpleUsageQuestion(w, safeWords));
            questions.push(makeSatClozeQuestion(w, safeWords));
        } else if (mode === "drill") {
            questions.push(makeSimpleUsageQuestion(w, safeWords));
            questions.push(makeSatClozeQuestion(w, safeWords));
        } else if (mode === "exam") {
            questions.push(makeSatClozeQuestion(w, safeWords));
        } else if (mode === "mistakes") {
            const p = lookupProgress(w.word);
            if (p && (p.wrongStreak || 0) > 0) {
                questions.push(makeSatClozeQuestion(w, safeWords));
            }
        }
    }

    // 3. Shuffle
    questions = shuffle(questions);

    // 4. Limit
    return scopeSessionProgress(questions.slice(0, limit), progressKeyPrefix);
}

function makeRecallQuestion(word: Word): Question {
    return {
        id: `recall-${word.word}-${Date.now()}-${Math.random()}`,
        word: word.word,
        image: word.image,
        type: 'recall',
        payload: {
            word: word.word,
            ru: word.ru,
            synonyms: word.synonyms,
            example: (Array.isArray(word.simple_examples) && word.simple_examples[0]) || ''
        }
    };
}

function makeSimpleUsageQuestion(word: Word, allWords: Word[]): Question {
    const correctSentence = (Array.isArray(word.simple_examples) && word.simple_examples[0]) || ''
    const sentenceWithBlank = clozeSentence(correctSentence, word)

    // Distractors: confusions + random
    const distractors = shuffle([
        ...(word.confusions || []),
        ...shuffle(allWords.filter(candidate => candidate.word.toLocaleLowerCase() !== word.word.toLocaleLowerCase())).slice(0, 3).map(w => w.word)
    ]).slice(0, 3);

    const options = shuffle(uniqueOptions(word.word, distractors));

    return {
        id: `usage-${word.word}-${Date.now()}-${Math.random()}`,
        word: word.word,
        image: word.image,
        type: 'simple_usage',
        payload: {
            sentence: sentenceWithBlank,
            options,
            correctIndex: options.indexOf(word.word),
            wordData: {
                ru: word.ru,
                synonyms: word.synonyms
            }
        }
    };
}

function makeSatClozeQuestion(word: Word, allWords: Word[]): Question {
    const correctSentence = word.advanced_example || (Array.isArray(word.simple_examples) && word.simple_examples[0]) || ''
    const sentenceWithBlank = clozeSentence(correctSentence, word)

    const distractors = shuffle([
        ...(word.confusions || []),
        ...shuffle(allWords.filter(candidate => candidate.word.toLocaleLowerCase() !== word.word.toLocaleLowerCase())).slice(0, 3).map(w => w.word)
    ]).slice(0, 3);

    const options = shuffle(uniqueOptions(word.word, distractors));

    return {
        id: `sat-${word.word}-${Date.now()}-${Math.random()}`,
        word: word.word,
        image: word.image,
        type: 'sat_cloze',
        payload: {
            sentence: sentenceWithBlank,
            options,
            correctIndex: options.indexOf(word.word),
            wordData: {
                ru: word.ru,
                synonyms: word.synonyms
            }
        }
    };
}

// ---------------------------------------------------------------------------
// Generic (manual) quiz questions → session questions
// ---------------------------------------------------------------------------

export function buildQuestionSession(
    mode: SessionMode,
    questions: QuizQuestion[],
    progressMap: Record<string, WordProgress>,
    limit?: number,
    progressKeyPrefix = ''
): Question[] {
    let list: QuizQuestion[] = [...questions];
    const progressKey = (id: string) => progressKeyPrefix ? `${progressKeyPrefix}::${id}` : id;
    // Prefer the scoped key, but fall back to the bare id so progress written
    // by older builds (before scoped keys) is still honored instead of being
    // treated as a brand-new card on the first review after the upgrade.
    const lookupProgress = (id: string): WordProgress | undefined => {
        const scoped = progressMap[progressKey(id)];
        if (scoped) return scoped;
        return progressKeyPrefix ? progressMap[id] : undefined;
    };

    if (mode === 'mistakes') {
        list = list.filter(q => {
            const p = lookupProgress(q.id);
            return p && (p.wrongStreak || 0) > 0;
        });
        if (list.length === 0) return [];
    }

    // Shuffle the complete candidate set before applying the limit. The old
    // slice-before-shuffle behavior permanently excluded questions after the
    // first page of a large quiz. Weak/due questions get a deterministic head
    // start, with random order inside each priority tier.
    const now = Date.now();
    list = shuffle(list)
        .map((q, position) => {
            const progress = lookupProgress(q.id);
            const isNew = !progress || (progress.seenCount || 0) === 0;
            const due = !!progress?.nextDue && progress.nextDue <= now;
            const weakness = 1 - (progress?.strength || 0);
            const mistakes = progress?.wrongStreak || 0;
            // Reviews that are due or repeatedly missed should outrank a
            // merely unseen item; unseen items still fill the remainder.
            const priority = (due ? 2000 : 0) + mistakes * 300 + weakness * 500 + (isNew ? 250 : 0);
            return { q, priority, position };
        })
        .sort((a, b) => b.priority - a.priority || a.position - b.position)
        .map(entry => entry.q);

    if (limit !== undefined) {
        list = list.slice(0, limit);
    }

    // The list is already priority-ordered (due/weak/missed first, random
    // within each tier from the initial shuffle). Re-shuffling here would
    // discard that ranking and let due cards fall behind new ones.
    return list
        .filter(q => q && typeof q.prompt === 'string' && q.prompt.trim())
        .flatMap((q): Question[] => {
        const base = {
            id: q.id,
            // Keep the authored display word when present. The scoped key is
            // carried separately and is only used for progress persistence.
            word: (q as QuizQuestion & { word?: string }).word || q.id,
            image: q.image || '',
            progressKey: progressKey(q.id),
            progressWord: String(q.prompt || q.id)
        };

        if (q.kind === 'simulation') {
            return [{
                ...base,
                type: 'simulation' as const,
                payload: {
                    prompt: q.prompt,
                    steps: Array.isArray(q.steps) ? q.steps : [],
                    language: q.language || ''
                }
            }];
        }

        if (mode === 'write' && q.kind === 'multiple_choice') {
            const options = (q.options || []).filter(o => typeof o === 'string');
            const correctIndex = typeof q.correctIndex === 'number' && q.correctIndex >= 0 && q.correctIndex < options.length
                ? q.correctIndex
                : 0;
            return [{
                ...base,
                type: 'generic_written' as const,
                payload: {
                    prompt: q.prompt,
                    answer: options[correctIndex] || '',
                    explanation: q.explanation || ''
                }
            }];
        }
        if (q.kind === 'multiple_choice') {
            const options = (q.options || []).filter(o => typeof o === 'string');
            let correctIndex = 0;
            if (typeof q.correctIndex === 'number' && Number.isInteger(q.correctIndex)) {
                correctIndex = q.correctIndex;
                if (correctIndex < 0 || correctIndex >= options.length) correctIndex = 0;
            }
            return [{
                ...base,
                type: 'generic_mc' as const,
                payload: {
                    prompt: q.prompt,
                    options,
                    correctIndex,
                    explanation: q.explanation || ''
                }
            }];
        }
        if (mode === 'write' && q.kind === 'true_false') {
            return [{
                ...base,
                type: 'generic_written' as const,
                payload: {
                    prompt: q.prompt,
                    answer: q.correctAnswer ? 'True' : 'False',
                    explanation: q.explanation || ''
                }
            }];
        }
        if (q.kind === 'true_false') {
            return [{
                ...base,
                type: 'generic_tf' as const,
                payload: {
                    prompt: q.prompt,
                    correctAnswer: q.correctAnswer === true,
                    explanation: q.explanation || ''
                }
            }];
        }

        // flashcard — split Anki-style cloze deletions into written-answer cards
        const clozeCards = hasCloze(q.prompt)
            ? extractClozeCards(q.prompt)
            : hasCloze(q.answer || '')
                ? extractClozeCards(q.answer || '')
                : []

        if (clozeCards.length) {
            return clozeCards.map((card, i) => ({
                ...base,
                id: `${q.id}-c${i}`,
                type: 'generic_written' as const,
                payload: {
                    prompt: card.prompt,
                    answer: card.answer,
                    explanation: q.explanation || ''
                }
            }));
        }

        return [{
            ...base,
            type: 'generic_flashcard' as const,
            payload: {
                prompt: q.prompt,
                answer: q.answer || '',
                explanation: q.explanation || ''
            }
        }];
    });
}

// ---------------------------------------------------------------------------
// Test mode: auto-generate a mixed test (multiple choice, true/false, written)
// from a vocabulary list OR from a generic question quiz.
// ---------------------------------------------------------------------------

export function buildWriteSession(words: Word[], limit = 20, progressKeyPrefix = ''): Question[] {
    const safe = (words || []).filter(w =>
        w && typeof w.word === 'string' && w.word.trim() && typeof w.ru === 'string'
    )
    if (!safe.length) return []

    const list = shuffle(safe).slice(0, limit)

    const questions: Question[] = []
    for (const w of list) {
        const ts = `${Date.now()}-${Math.random()}`
        questions.push({
            id: `write-word-${w.word}-${ts}`,
            word: w.word,
            type: 'generic_written',
            payload: {
                prompt: `Type the word that means: "${w.ru}"`,
                answer: w.word,
                explanation: ''
            }
        })
        questions.push({
            id: `write-meaning-${w.word}-${ts}`,
            word: w.word,
            type: 'generic_written',
            payload: {
                prompt: `Type the meaning of: "${w.word}"`,
                answer: w.ru,
                explanation: ''
            }
        })
    }

    return scopeSessionProgress(shuffle(questions).slice(0, limit), progressKeyPrefix)
}

export function buildTestSession(
    words: Word[] | undefined,
    questions: QuizQuestion[] | undefined,
    limit = 20,
    progressKeyPrefix = ''
): Question[] {
    let built: Question[] = []

    if (questions && questions.length) {
        // Question quiz: pass through MC/TF, turn flashcards into written answers.
        built = shuffle(questions)
            .filter(q => q && typeof (q.prompt || '') === 'string')
            .slice(0, limit)
.map(q => {
                const base = { id: q.id, word: q.id, image: q.image || '', progressWord: String(q.prompt || q.id) }

                if (q.kind === 'simulation') {
                    return {
                        ...base,
                        type: 'simulation' as const,
                        payload: {
                            prompt: q.prompt,
                            steps: Array.isArray(q.steps) ? q.steps : [],
                            language: q.language || ''
                        }
                    }
                }

                if (q.kind === 'multiple_choice') {
                    const options = (q.options || []).filter(o => typeof o === 'string')
                    let correctIndex = 0
                    if (typeof q.correctIndex === 'number' && Number.isInteger(q.correctIndex)) {
                        correctIndex = q.correctIndex
                        if (correctIndex < 0 || correctIndex >= options.length) correctIndex = 0
                    }
                    return {
                        ...base,
                        type: 'generic_mc' as const,
                        payload: {
                            prompt: q.prompt,
                            options,
                            correctIndex,
                            explanation: q.explanation || ''
                        }
                    }
                }
                if (q.kind === 'true_false') {
                    return {
                        ...base,
                        type: 'generic_tf' as const,
                        payload: {
                            prompt: q.prompt,
                            correctAnswer: q.correctAnswer === true,
                            explanation: q.explanation || ''
                        }
                    }
                }
                return {
                    ...base,
                    type: 'generic_written' as const,
                    payload: {
                        prompt: q.prompt,
                        answer: q.answer || '',
                        explanation: q.explanation || ''
                    }
                }
            })
        return scopeSessionProgress(shuffle(built), progressKeyPrefix)
    }

    const list = (words || []).filter(w =>
        w && typeof w.word === 'string' && w.word.trim() && typeof w.ru === 'string'
    )
    if (!list.length) return []

    const picked = shuffle(list).slice(0, limit)
    picked.forEach(w => {
        // Multiple choice: pick the word from its definition.
        const distractors = shuffle(list.filter(x => x.word !== w.word))
            .slice(0, 3)
            .map(x => x.word)
        const options = shuffle([w.word, ...distractors])

        built.push({
            id: `test-mc-${w.word}-${Date.now()}-${Math.random()}`,
            word: w.word,
            type: 'generic_mc',
            payload: {
                prompt: `Which word best matches: "${w.ru}"?`,
                options,
                correctIndex: options.indexOf(w.word),
                explanation: ''
            }
        })

        // Written: type the word from its definition.
        built.push({
            id: `test-written-${w.word}-${Date.now()}-${Math.random()}`,
            word: w.word,
            type: 'generic_written',
            payload: {
                prompt: `Type the word that means: "${w.ru}"`,
                answer: w.word,
                explanation: ''
            }
        })
    })

    return scopeSessionProgress(shuffle(built).slice(0, limit), progressKeyPrefix)
}
