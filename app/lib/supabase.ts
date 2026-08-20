import { createClient, SupabaseClient } from '@supabase/supabase-js'

/**
 * Supabase client for the static build.
 *
 * Falls back to offline/local mode when no keys are configured, so the site
 * keeps working on any static host without credentials. Once NEXT_PUBLIC_*
 * variables are present at build time, auth + cloud storage switch on.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

export const supabase: SupabaseClient | null = isSupabaseConfigured
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null