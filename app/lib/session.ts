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

    // 1. Select candidates by priority - prioritize new/weak words, avoid recently seen
    const candidates = allWords
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
            questions.push(makeSimpleUsageQuestion(w, allWords));
            questions.push(makeSatClozeQuestion(w, allWords));
        } else if (mode === "drill") {
            questions.push(makeSimpleUsageQuestion(w, allWords));
            questions.push(makeSatClozeQuestion(w, allWords));
        } else if (mode === "exam") {
            questions.push(makeSatClozeQuestion(w, allWords));
        } else if (mode === "mistakes") {
            const p = progressMap[w.word];
            if (p && (p.wrongStreak || 0) > 0) {
                questions.push(makeSatClozeQuestion(w, allWords));
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
        type: 'recall',
        payload: {
            word: word.word,
            ru: word.ru,
            synonyms: word.synonyms,
            example: word.simple_examples[0]
        }
    };
}

function makeSimpleUsageQuestion(word: Word, allWords: Word[]): Question {
    const correctSentence = word.simple_examples[0];
    // Simple cloze: replace word with blank
    const parts = correctSentence.split(new RegExp(`\\b${word.word}\\w*\\b`, 'i'));
    const sentenceWithBlank = parts.length > 1 ? parts.join('_______') : correctSentence.replace(word.word, '_______');

    // Distractors: confusions + random
    const distractors = shuffle([
        ...word.confusions,
        ...shuffle(allWords).slice(0, 3).map(w => w.word)
    ]).slice(0, 3);

    const options = shuffle([word.word, ...distractors]);

    return {
        id: `usage-${word.word}-${Date.now()}-${Math.random()}`,
        word: word.word,
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
    const correctSentence = word.advanced_example;
    // Regex to replace the word and its variations (e.g. contending, contended)
    // For simplicity, we just look for the word stem or exact match if possible
    const regex = new RegExp(`\\b${word.word}\\w*\\b`, 'i');
    const sentenceWithBlank = correctSentence.replace(regex, '_______');

    const distractors = shuffle([
        ...word.confusions,
        ...shuffle(allWords).slice(0, 3).map(w => w.word)
    ]).slice(0, 3);

    const options = shuffle([word.word, ...distractors]);

    return {
        id: `sat-${word.word}-${Date.now()}-${Math.random()}`,
        word: word.word,
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

    return shuffle(list).map(q => {
        const base = {
            id: q.id,
            word: q.id,
        };

        if (q.kind === 'multiple_choice') {
            return {
                ...base,
                type: 'generic_mc' as const,
                payload: {
                    prompt: q.prompt,
                    options: q.options || [],
                    correctIndex: q.correctIndex ?? 0,
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
