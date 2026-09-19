import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

describe('quiz-sets manifest', () => {
    it('every manifest file_path resolves to a bundled data file', () => {
        const manifestPath = join(process.cwd(), 'public', 'sat', 'quiz-sets.json')
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { id: string; file_path: string }[]
        expect(manifest.length).toBeGreaterThan(0)

        const missing = manifest
            .filter(set => !existsSync(join(process.cwd(), 'public', set.file_path.replace(/^\//, ''))))
            .map(set => `${set.id} -> ${set.file_path}`)

        expect(missing).toEqual([])
    })
})
