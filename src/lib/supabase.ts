import { createClient } from '@supabase/supabase-js'

// Этот вариант написания Vercel точно пропустит без ошибок
const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL
const supabaseAnonKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)