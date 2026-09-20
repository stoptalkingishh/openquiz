import { describe, expect, it } from 'vitest'
import { buildGoogleResearchQuery } from '../app/lib/research'

describe('buildGoogleResearchQuery', () => {
    it('uses the complete prompt, correct answer, and explanation intent', () => {
        expect(buildGoogleResearchQuery({ id: 'q1', word: 'short label', type: 'generic_mc', payload: { prompt: 'Which protocol resolves domain names?', options: ['DNS', 'DHCP'], correctIndex: 0 } })).toBe('"Which protocol resolves domain names?" "DNS" explanation')
    })

    it('builds vocabulary-focused queries for recall cards', () => {
        expect(buildGoogleResearchQuery({ id: 'q2', word: 'abate', type: 'recall', payload: { word: 'abate', ru: 'become less intense' } })).toBe('"abate" "become less intense" definition examples')
    })
})
