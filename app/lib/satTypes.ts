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
  | "sat_cloze";

export interface Question {
  id: string;
  word: string;
  type: QuestionType;
  // payload contains specific text, options, correct index
  payload: any;
}

export type SessionMode = 'learn' | 'drill' | 'exam' | 'mistakes';

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
