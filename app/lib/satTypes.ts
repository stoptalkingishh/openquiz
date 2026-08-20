/**
 * SAT Vocabulary Types
 */

export interface Word {
  word: string;
  ru: string;
  synonyms: string[];
  simple_examples: string[];
  advanced_example: string;
  confusions: string[];
}

export interface WordProgress {
  word: string;         // key
  strength?: number;     // 0..1, how well known (optional for compatibility)
  lastSeen: number;     // timestamp
  nextDue?: number;      // when to show again (optional)
  seenCount?: number;    // how many times seen (optional)
  wrongStreak?: number;  // consecutive errors (optional)
  status?: 'new' | 'learning' | 'mastered'; // derived status (optional)
  // Additional fields used by satSessionManager
  difficulty?: 'easy' | 'hard';
  reviewCount?: number;
  mistakes?: number;
  mistakesToday?: number;
  lastMistakeTime?: number;
}

export type QuestionType =
  | "recall"
  | "simple_usage"
  | "contrast"
  | "sat_cloze"
  | "generic_mc"
  | "generic_tf"
  | "generic_flashcard"
  | "generic_written";

export interface Question {
  id: string;
  word: string;
  type: QuestionType;
  // payload contains specific text, options, correct index
  payload: any;
}

export type SessionMode = 'learn' | 'drill' | 'exam' | 'mistakes' | 'test';

export interface DailyProgress {
  date: string;
  wordsLearned: number;
  wordsDrilled: number;
  wordsExamined: number;
  mistakesCount: number;
  accuracy: number;
}

// Aliases for backward compatibility
export type SATWord = Word;

export interface UserStats {
  totalWords: number;
  wordsLearned: number;
  streak: number;
  todayProgress: DailyProgress;
  mistakesByWord: Map<string, number>;
  focusWords: string[];
}

export type LearnRound = 'recall' | 'simple_usage' | 'contrast';

export interface LearnSession {
  mode: 'learn';
  words: SATWord[];
  currentRound: LearnRound;
  currentWordIndex: number;
  wordFeedback: Map<string, 'easy' | 'hard'>;
  completedRounds: LearnRound[];
}

export interface DrillQuestion {
  sentence: string;
  correctWord: string;
  options: string[];
  explanation: string;
}

export interface DrillSession {
  mode: 'drill';
  questions: DrillQuestion[];
  currentIndex: number;
  score: number;
}

export interface ExamQuestion {
  sentence: string;
  correctWord: string;
  options: string[];
  wordTested: string;
}

export interface ExamSession {
  mode: 'exam';
  questions: ExamQuestion[];
  currentIndex: number;
  score: number;
  timeRemaining: number;
  startTime: number;
}

export interface MistakesSession {
  mode: 'mistakes';
  words: string[];
  questions: DrillQuestion[];
  currentIndex: number;
  score: number;
}

// Union type for all sessions
export type Session = LearnSession | DrillSession | ExamSession | MistakesSession;

// ---------------------------------------------------------------------------
// Generic (manual) quizzes — any subject, not just vocabulary
// ---------------------------------------------------------------------------

export type QuizQuestionKind = 'multiple_choice' | 'true_false' | 'flashcard';

export interface QuizQuestion {
  id: string;
  kind: QuizQuestionKind;
  prompt: string;
  options?: string[];      // for multiple_choice
  correctIndex?: number;   // for multiple_choice
  correctAnswer?: boolean; // for true_false
  answer?: string;         // answer shown for flashcard (and optional explanation)
  explanation?: string;    // optional explanation shown after answering (MC/TF)
}

/** A custom quiz: either a vocabulary list (`words`) or generic questions (`questions`). */
export interface CustomQuiz {
  id: string;
  user_id: string;
  name: string;
  description: string;
  words?: Word[];
  questions?: QuizQuestion[];
  is_public: boolean;
  author_name: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Quizlet-style organizing and study stats
// ---------------------------------------------------------------------------

/** A folder that groups any quizzes together. */
export interface Folder {
  id: string;
  user_id: string;
  name: string;
  quiz_ids: string[];
  created_at: string;
}

/** One finished study session (any mode). */
export interface QuizSessionRecord {
  date: string;
  correct: number;
  total: number;
  seconds?: number;
}

/** Aggregated stats for a single quiz (keyed by quiz id). */
export interface QuizStats {
  plays: number;
  bestCorrect: number;
  bestAccuracy: number;
  lastStudied: string;
  quizName: string;
  history: QuizSessionRecord[];
}
