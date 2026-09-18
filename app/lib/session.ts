import { Word, WordProgress, Question, SessionMode, QuizQuestion } from './satTypes';

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

function uniqueOptions(correct: string, distractors: string[]): string[] {
    const seen = new Set<string>()
    return [correct, ...distractors].filter(value => {
        const key = String(value).trim().toLocaleLowerCase()
        if (!key || seen.has(key)) return false
        seen.add(key)
        return true
    })
}

export function updateProgress(prev: WordProgress | undefined, correct: boolean, word: string): WordProgress {
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
    let strength = base.strength || 0;
    let wrongStreak = base.wrongStreak || 0;

    if (correct) {
        wrongStreak = 0;
        strength = Math.min(1, strength + 0.15);
    } else {
        wrongStreak += 1;
        strength = Math.max(0, strength - 0.2);
    }

    // Intervals: 10m, 8h, 2d, 5d
    const intervals = [10 * 60e3, 8 * 60 * 60e3, 2 * 24 * 60 * 60e3, 5 * 24 * 60 * 60e3];
    const idx = Math.min(intervals.length - 1, Math.floor(strength * intervals.length));
    const nextDue = now + intervals[idx];

    let status: 'new' | 'learning' | 'mastered' = 'learning';
    if ((base.seenCount || 0) === 0) status = 'new';
    if (strength > 0.8) status = 'mastered';

    return {
        ...base,
        seenCount,
        lastSeen: now,
        strength,
        wrongStreak,
        nextDue,
        status
    };
}

export function buildSession(
    mode: SessionMode,
    allWords: Word[],
    progressMap: Record<string, WordProgress>,
    limit?: number // undefined means all words
): Question[] {
    const now = Date.now();

    // Drop malformed entries so a bad custom quiz can never crash the build.
    const safeWords = (allWords || []).filter(w =>
        w && typeof w.word === 'string' && w.word.trim() && typeof w.ru === 'string'
    );

    // 1. Select candidates by priority - prioritize new/weak words, avoid recently seen
    const candidates = safeWords
        .map(w => {
            const p = progressMap[w.word];
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
            const p = progressMap[w.word];
            if (p && (p.wrongStreak || 0) > 0) {
                questions.push(makeSatClozeQuestion(w, safeWords));
            }
        }
    }

    // 3. Shuffle
    questions = shuffle(questions);

    // 4. Limit
    return questions.slice(0, limit);
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
    // Simple cloze: replace word with blank
    let sentenceWithBlank
    if (correctSentence) {
        const parts = correctSentence.split(new RegExp(`\\b${escapeRegExp(word.word)}\\w*\\b`, 'i'))
        sentenceWithBlank = parts.length > 1 ? parts.join('_______') : correctSentence.replace(word.word, '_______')
    } else {
        sentenceWithBlank = word.word
    }

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
    // Regex to replace the word and its variations (e.g. contending, contended)
    // For simplicity, we just look for the word stem or exact match if possible
    let sentenceWithBlank: string
    if (correctSentence) {
        const regex = new RegExp(`\\b${escapeRegExp(word.word)}\\w*\\b`, 'i')
        const replaced = correctSentence.replace(regex, '_______')
        sentenceWithBlank = replaced === correctSentence ? correctSentence.replace(word.word, '_______') : replaced
    } else {
        sentenceWithBlank = word.word
    }

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
    limit?: number
): Question[] {
    let list: QuizQuestion[] = [...questions];

    if (mode === 'mistakes') {
        list = list.filter(q => {
            const p = progressMap[q.id];
            return p && (p.wrongStreak || 0) > 0;
        });
        if (list.length === 0) return [];
    }

    if (limit !== undefined) {
        list = list.slice(0, limit);
    }

    return shuffle(list)
        .filter(q => q && typeof q.prompt === 'string' && q.prompt.trim())
        .map(q => {
        const base = {
            id: q.id,
            word: q.id,
            image: q.image || ''
        };

        if (q.kind === 'simulation') {
            return {
                ...base,
                type: 'simulation' as const,
                payload: {
                    prompt: q.prompt,
                    steps: Array.isArray(q.steps) ? q.steps : [],
                    language: q.language || ''
                }
            };
        }

        if (q.kind === 'multiple_choice') {
            const options = (q.options || []).filter(o => typeof o === 'string');
            let correctIndex = 0;
            if (typeof q.correctIndex === 'number' && Number.isInteger(q.correctIndex)) {
                correctIndex = q.correctIndex;
                if (correctIndex < 0 || correctIndex >= options.length) correctIndex = 0;
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
            };
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
            };
        }
        // flashcard
        return {
            ...base,
            type: 'generic_flashcard' as const,
            payload: {
                prompt: q.prompt,
                answer: q.answer || '',
                explanation: q.explanation || ''
            }
        };
    });
}

// ---------------------------------------------------------------------------
// Test mode: auto-generate a mixed test (multiple choice, true/false, written)
// from a vocabulary list OR from a generic question quiz.
// ---------------------------------------------------------------------------

export function buildTestSession(
    words: Word[] | undefined,
    questions: QuizQuestion[] | undefined,
    limit = 20
): Question[] {
    let built: Question[] = []

    if (questions && questions.length) {
        // Question quiz: pass through MC/TF, turn flashcards into written answers.
        built = shuffle(questions)
            .filter(q => q && typeof (q.prompt || '') === 'string')
            .slice(0, limit)
.map(q => {
                const base = { id: q.id, word: q.id, image: q.image || '' }

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
        return shuffle(built)
    }

    const list = words || []
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

    return shuffle(built)
}
