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

/** A custom quiz path is private to the account that selected it. */
export function clearPrivateQuizSelection() {
    const { selectedQuizPath, setSelectedQuizPath } = useQuizStore.getState()
    if (selectedQuizPath.startsWith('/custom-quiz/')) setSelectedQuizPath('/sat/1.json')
}
