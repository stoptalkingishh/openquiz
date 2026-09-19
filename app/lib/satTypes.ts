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
  image?: string; // URL or data URI — shown with the term (Quizlet-style media)
}

export interface WordProgress {
  word: string;         // key
  strength?: number;     // 0..1, how well known (optional for compatibility)
  lastSeen: number;     // timestamp
  nextDue?: number;      // when to show again (optional)
  seenCount?: number;    // how many times seen (optional)
  wrongStreak?: number;  // consecutive errors (optional)
  status?: 'new' | 'learning' | 'mastered'; // derived status (optional)
  ease?: number;         // SM-2 ease factor (default ~2.5, floored at 1.3)
  repetitions?: number;  // consecutive successful reviews
  interval?: number;     // days until next review
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
  | "generic_written"
  | "simulation";

export interface Question {
  id: string;
  progressKey?: string;
  word: string;
  type: QuestionType;
  image?: string; // media shown with the question (Quizlet-style)
  // payload contains specific text, options, correct index
  payload: any;
}

export type SessionMode = 'learn' | 'drill' | 'exam' | 'mistakes' | 'test' | 'write';

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

export type QuizQuestionKind = 'multiple_choice' | 'true_false' | 'flashcard' | 'simulation';

// ---------------------------------------------------------------------------
// Simulations (Comptia-style performance-based questions)
// ---------------------------------------------------------------------------

export type SimulationStepKind = 'choice' | 'checkbox' | 'config' | 'placement';

/**
 * A single graded step inside an interactive simulation. Each step is scored
 * independently; the whole simulation is marked correct only when every step
 * is correct, but the review shows per-step results.
 */
export interface SimulationStep {
  id: string;
  kind: SimulationStepKind;
  title: string;          // instruction / question text
  image?: string;         // optional media for the step

  // `choice` — pick one option
  options?: string[];
  correctIndex?: number;

  // `checkbox` — toggle individual statements/controls on/off
  items?: { id: string; label: string; correct: boolean }[];

  // `config` — same UI as checkbox (toggle), kept distinct for authoring clarity
  config?: { id: string; label: string; correct: boolean }[];

  // `placement` — drag/order items into slots (e.g. network topology, order of operations)
  itemsToPlace?: string[];   // item labels available to assign
  slots?: string[];          // slot labels in fixed order
  correctMapping?: number[]; // for each item index, the slot index it belongs in

  explanation?: string;      // shown in the review when the step is wrong
}

export interface QuizQuestion {
  id: string;
  kind: QuizQuestionKind;
  prompt: string;
  image?: string;          // URL or data URI — shown alongside the question (Quizlet-style)
  options?: string[];      // for multiple_choice
  correctIndex?: number;   // for multiple_choice
  correctAnswer?: boolean; // for true_false
  answer?: string;         // answer shown for flashcard (and optional explanation)
  explanation?: string;    // optional explanation shown after answering (MC/TF)

  // simulations
  steps?: SimulationStep[]; // for kind === 'simulation'
  language?: string;       // optional hint for code/other language content
}

/** A custom quiz: either a vocabulary list (`words`) or generic questions (`questions`). */
export interface CustomQuiz {
  id: string;
  user_id: string;
  name: string;
  description: string;
  tags?: string[];
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
  id?: string;
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
