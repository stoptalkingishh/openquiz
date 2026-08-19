import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface QuizStore {
    selectedQuizPath: string
    setSelectedQuizPath: (path: string) => void
}

export const useQuizStore = create<QuizStore>()(
    persist(
        (set) => ({
            selectedQuizPath: '/sat/1.json',
            setSelectedQuizPath: (path) => set({ selectedQuizPath: path }),
        }),
        {
            name: 'quiz-storage',
        }
    )
)
