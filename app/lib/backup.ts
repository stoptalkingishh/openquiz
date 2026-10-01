/**
 * Versioned account backups.
 *
 * The Profile screen's "Export JSON" file used to contain only custom quizzes
 * and word progress, so restoring it silently dropped folders, daily stats and
 * per-quiz study history. A backup is now an explicit, versioned envelope
 * carrying every user-owned category, validated before anything is written.
 *
 * This module is deliberately pure: it only parses, validates and merges
 * plain objects. Persistence and account assertions live in `db.ts`.
 */

/** Marker so a backup can never be mistaken for a quiz-export array. */
export const BACKUP_FORMAT = 'openquiz-backup'

/** Current backup schema version. Bumped whenever the envelope changes shape. */
export const BACKUP_VERSION = 2

export type ImportMode = 'merge' | 'replace'

export interface BackupData {
    quizzes: any[]
    folders: any[]
    progress: Record<string, any>
    dailyStats: Record<string, any>
    quizStats: Record<string, any>
    deletedIds: { quizzes: string[]; folders: string[] }
}

export interface BackupEnvelope {
    format: string
    version: number
    exportedAt: string
    /** Account that produced the backup. Informational: restore rebinds data. */
    accountId: string
    data: BackupData
}

export interface BackupValidation {
    ok: boolean
    errors: string[]
    warnings: string[]
    backup: BackupEnvelope | null
}

function isPlainObject(value: unknown): value is Record<string, any> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function emptyData(): BackupData {
    return { quizzes: [], folders: [], progress: {}, dailyStats: {}, quizStats: {}, deletedIds: { quizzes: [], folders: [] } }
}

/** Reject anything that is not a list of records with a string id. */
function readIdList(value: unknown, label: string, errors: string[]): any[] {
    if (value === undefined || value === null) return []
    if (!Array.isArray(value)) {
        errors.push(`"${label}" must be a list.`)
        return []
    }
    const records: any[] = []
    value.forEach((record, i) => {
        if (!isPlainObject(record) || typeof record.id !== 'string' || !record.id.trim()) {
            errors.push(`${label} #${i + 1}: missing a string "id".`)
            return
        }
        records.push(record)
    })
    return records
}

/** Reject anything that is not a map of key -> plain object. */
function readRecordMap(value: unknown, label: string, errors: string[]): Record<string, any> {
    if (value === undefined || value === null) return {}
    if (!isPlainObject(value)) {
        errors.push(`"${label}" must be an object keyed by id.`)
        return {}
    }
    const records: Record<string, any> = {}
    for (const [key, record] of Object.entries(value)) {
        if (!isPlainObject(record)) {
            errors.push(`${label} "${key}": must be an object.`)
            continue
        }
        records[key] = record
    }
    return records
}

/**
 * Parse and validate a backup payload.
 *
 * Records are re-bound to `owner`, the account doing the restore: a backup is
 * meant to be restorable on a different device, and the restoring account is
 * the only one allowed to own them afterwards. Isolation is enforced
 * structurally by `db.ts` (per-account storage slots plus the `user_id` /
 * `${userId}:` filters on every read), so no record keeps the exporting
 * account's identity once imported.
 */
export function validateBackup(input: unknown, owner: string): BackupValidation {
    const errors: string[] = []
    const warnings: string[] = []

    let parsed: any = input
    if (typeof input === 'string') {
        try {
            parsed = JSON.parse(input)
        } catch (err: any) {
            return { ok: false, errors: [`Invalid JSON: ${err?.message || 'could not be parsed'}`], warnings, backup: null }
        }
    }

    // Legacy export shape: a bare { quizzes, progress } object with no envelope.
    if (isPlainObject(parsed) && parsed.format !== BACKUP_FORMAT && isPlainObject(parsed.data)) {
        return {
            ok: false,
            errors: [`This file has no backup marker. Re-export with a current OpenQuiz version; it was not imported.`],
            warnings,
            backup: null
        }
    }
    if (isPlainObject(parsed) && parsed.format !== BACKUP_FORMAT && (Array.isArray(parsed.quizzes) || isPlainObject(parsed.progress))) {
        warnings.push('This is a legacy export (quizzes and progress only). Folders, daily stats and study history cannot be recovered from it.')
        return {
            ok: true,
            errors,
            warnings,
            backup: {
                format: BACKUP_FORMAT,
                version: 1,
                exportedAt: '',
                accountId: '',
                data: { ...emptyData(), quizzes: readIdList(parsed.quizzes, 'quizzes', errors), progress: readRecordMap(parsed.progress, 'progress', errors) }
            }
        }
    }

    if (!isPlainObject(parsed)) return { ok: false, errors: ['A backup must be a JSON object.'], warnings, backup: null }
    if (parsed.format !== BACKUP_FORMAT) {
        return { ok: false, errors: ['This file is not an OpenQuiz backup.'], warnings, backup: null }
    }

    const version = parsed.version
    if (!Number.isInteger(version)) {
        return { ok: false, errors: ['Backup version is missing or not a number.'], warnings, backup: null }
    }
    if (version > BACKUP_VERSION) {
        return {
            ok: false,
            errors: [`This backup was created by a newer OpenQuiz (format v${version}; this build reads up to v${BACKUP_VERSION}). Update the site and try again.`],
            warnings,
            backup: null
        }
    }
    if (version < 1) {
        return { ok: false, errors: [`Unsupported backup version ${version}.`], warnings, backup: null }
    }
    if (version < BACKUP_VERSION) {
        warnings.push(`Backup format v${version} was upgraded to v${BACKUP_VERSION} on import.`)
    }

    const raw = isPlainObject(parsed.data) ? parsed.data : {}
    if (!isPlainObject(parsed.data)) errors.push('Backup is missing its "data" section.')

    const quizzes = readIdList(raw.quizzes, 'quizzes', errors)
    const folders = readIdList(raw.folders, 'folders', errors)
    const progress = readRecordMap(raw.progress, 'progress', errors)
    const dailyStats = readRecordMap(raw.dailyStats, 'dailyStats', errors)
    const quizStats = readRecordMap(raw.quizStats, 'quizStats', errors)
    const deletedRaw = isPlainObject(raw.deletedIds) ? raw.deletedIds : {}

    const deletedIds = {
        quizzes: Array.isArray(deletedRaw.quizzes) ? deletedRaw.quizzes.filter((id: any) => typeof id === 'string') : [],
        folders: Array.isArray(deletedRaw.folders) ? deletedRaw.folders.filter((id: any) => typeof id === 'string') : []
    }

    // Rebind ownership to the restoring account. A backup is portable, so the
    // exporting account's id must not survive the import — otherwise the
    // restored records would be invisible to (and could not be distinguished
    // from) this account's own data.
    const sourceAccount = typeof parsed.accountId === 'string' ? parsed.accountId : ''
    if (sourceAccount && sourceAccount !== owner) {
        warnings.push(`Backup was created by a different account; its records were imported into the current account.`)
    }
    const ownQuizzes = quizzes.map(q => ({ ...q, user_id: owner }))
    const ownFolders = folders.map(f => ({ ...f, user_id: owner }))

    // Daily stats are keyed `${userId}:${date}`. Re-key them to the restoring
    // account so the analytics read filter keeps matching.
    const ownDailyStats: Record<string, any> = {}
    for (const [key, entry] of Object.entries(dailyStats)) {
        const date = String(entry.date || key.split(':').slice(1).join(':') || '')
        if (!date) {
            warnings.push(`Daily stat "${key}" has no date and was skipped.`)
            continue
        }
        ownDailyStats[`${owner}:${date}`] = { ...entry, user_id: owner, date }
    }

    // Progress keys are quiz-scoped (`${quizPath}::${word}`) and carry no
    // owner field — the whole bucket belongs to whoever exported it, so it is
    // restored as-is into the restoring account's bucket.
    const data: BackupData = { quizzes: ownQuizzes, folders: ownFolders, progress, dailyStats: ownDailyStats, quizStats, deletedIds }

    const backup: BackupEnvelope = {
        format: BACKUP_FORMAT,
        version: BACKUP_VERSION,
        exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : '',
        accountId: typeof parsed.accountId === 'string' ? parsed.accountId : '',
        data
    }

    return { ok: errors.length === 0, errors, warnings, backup: errors.length === 0 ? backup : null }
}

export function buildBackupEnvelope(accountId: string, data: BackupData, exportedAt = new Date().toISOString()): BackupEnvelope {
    return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt, accountId, data }
}

export function serializeBackup(accountId: string, data: BackupData): string {
    return JSON.stringify(buildBackupEnvelope(accountId, data), null, 2)
}

// ---------------------------------------------------------------------------
// Merging
// ---------------------------------------------------------------------------

function newest<T extends Record<string, any>>(a: T | undefined, b: T | undefined): T {
    if (!a) return b as T
    if (!b) return a
    return (Number(b.updatedAt ?? b.updated_at ?? b.lastStudied ?? 0) || 0) >=
        (Number(a.updatedAt ?? a.updated_at ?? a.lastStudied ?? 0) || 0) ? b : a
}

/**
 * Merge an incoming backup into the account's current data.
 *
 * `merge` keeps existing records and lets the backup contribute anything new
 * (newest record wins per id). `replace` discards the current data entirely, so
 * a restore on a fresh profile and a restore over an existing one converge on
 * the same result.
 */
export function mergeBackupData(current: BackupData, incoming: BackupData, mode: ImportMode): BackupData {
    if (mode === 'replace') return {
        quizzes: [...incoming.quizzes],
        folders: [...incoming.folders],
        progress: { ...incoming.progress },
        dailyStats: { ...incoming.dailyStats },
        quizStats: { ...incoming.quizStats },
        deletedIds: { quizzes: [...incoming.deletedIds.quizzes], folders: [...incoming.deletedIds.folders] }
    }

    const quizzesById = new Map<string, any>()
    current.quizzes.forEach(q => quizzesById.set(q.id, q))
    incoming.quizzes.forEach(q => quizzesById.set(q.id, newest(quizzesById.get(q.id), q)))

    const foldersById = new Map<string, any>()
    current.folders.forEach(f => foldersById.set(f.id, f))
    incoming.folders.forEach(f => {
        const existing = foldersById.get(f.id)
        if (!existing) { foldersById.set(f.id, f); return }
        // Union the membership so a folder restored from an older backup does
        // not drop quizzes filed in it since.
        foldersById.set(f.id, { ...existing, ...newest(existing, f), quiz_ids: Array.from(new Set([...(existing.quiz_ids || []), ...(f.quiz_ids || [])])) })
    })

    const progress = { ...current.progress }
    for (const [key, record] of Object.entries(incoming.progress)) {
        progress[key] = newest(progress[key], record) ?? record
    }

    const dailyStats = { ...current.dailyStats }
    for (const [key, entry] of Object.entries(incoming.dailyStats)) {
        const existing = dailyStats[key]
        if (!existing) { dailyStats[key] = entry; continue }
        const answer_sessions = { ...(existing.answer_sessions || {}) }
        for (const [sessionId, count] of Object.entries((entry as any).answer_sessions || {})) {
            answer_sessions[sessionId] = Math.max(Number(answer_sessions[sessionId]) || 0, Number(count) || 0)
        }
        dailyStats[key] = { ...newest(existing, entry), answer_sessions }
    }

    const quizStats = { ...current.quizStats }
    for (const [id, stats] of Object.entries(incoming.quizStats)) {
        const existing: any = quizStats[id]
        if (!existing) { quizStats[id] = stats; continue }
        const history = [...(existing.history || []), ...(stats.history || [])]
            .filter((entry: any, i: number, entries: any[]) =>
                entries.findIndex((e: any) => entry.id && e.id ? e.id === entry.id : e.date === entry.date && e.correct === entry.correct && e.total === entry.total) === i)
            .sort((a: any, b: any) => String(a.date).localeCompare(String(b.date)))
        quizStats[id] = {
            ...newest(existing, stats),
            history,
            plays: Math.max(existing.plays || 0, (stats as any).plays || 0, history.length),
            bestCorrect: Math.max(existing.bestCorrect || 0, (stats as any).bestCorrect || 0),
            bestAccuracy: Math.max(existing.bestAccuracy || 0, (stats as any).bestAccuracy || 0)
        }
    }

    return {
        quizzes: Array.from(quizzesById.values()),
        folders: Array.from(foldersById.values()),
        progress,
        dailyStats,
        quizStats,
        deletedIds: {
            quizzes: Array.from(new Set([...current.deletedIds.quizzes, ...incoming.deletedIds.quizzes])),
            folders: Array.from(new Set([...current.deletedIds.folders, ...incoming.deletedIds.folders]))
        }
    }
}