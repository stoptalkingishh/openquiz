import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

const MANIFEST = join(process.cwd(), 'public', 'manifest.webmanifest')
const SETS = join(process.cwd(), 'public', 'sat', 'quiz-sets.json')

type ManifestIcon = { src: string; sizes: string; type?: string; purpose?: string }

function readManifest() {
    return JSON.parse(readFileSync(MANIFEST, 'utf8')) as { icons?: ManifestIcon[] }
}

/** Width and height straight out of the PNG IHDR chunk. */
function pngSize(file: string) {
    const buf = readFileSync(file)
    expect(buf.subarray(1, 4).toString('ascii')).toBe('PNG')
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}

describe('quiz-sets manifest', () => {
    it('every manifest file_path resolves to a bundled data file', () => {
        const manifest = JSON.parse(readFileSync(SETS, 'utf8')) as { id: string; file_path: string }[]
        expect(manifest.length).toBeGreaterThan(0)

        const missing = manifest
            .filter(set => !existsSync(join(process.cwd(), 'public', set.file_path.replace(/^\//, ''))))
            .map(set => `${set.id} -> ${set.file_path}`)

        expect(missing).toEqual([])
    })
})

describe('PWA manifest', () => {
    it('declares icon sizes that match the actual PNG dimensions', () => {
        const icons = readManifest().icons ?? []
        expect(icons.length).toBeGreaterThan(0)

        const problems: string[] = []
        for (const icon of icons) {
            const file = join(process.cwd(), 'public', icon.src.replace(/^\//, ''))
            if (!existsSync(file)) {
                problems.push(`${icon.src} is missing`)
                continue
            }
            const { width, height } = pngSize(file)
            const [declaredWidth, declaredHeight] = icon.sizes.split('x').map(Number)
            if (declaredWidth !== width || declaredHeight !== height) {
                problems.push(`${icon.src}: manifest declares ${icon.sizes}, file is ${width}x${height}`)
            }
        }

        expect(problems).toEqual([])
    })

    it('ships a maskable icon so Android masks padding instead of cropping artwork', () => {
        const maskable = (readManifest().icons ?? []).filter(icon => icon.purpose === 'maskable')
        expect(maskable.length).toBeGreaterThan(0)
    })
})
