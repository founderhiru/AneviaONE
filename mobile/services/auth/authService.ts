import { isSupabaseConfigured } from '../supabaseClient';
import { mockAuthService } from './mockAuthService';
import { supabaseAuthService } from './supabaseAuthService';
import type { AuthService } from './authTypes';

/**
 * The single entry point screens should import. Automatically selects the
 * real Supabase-backed implementation once configured, and otherwise falls
 * back to the isolated mock so the UI stays fully reviewable without
 * credentials. Never used to fake a "production" success path — the two
 * implementations are kept in separate files precisely so this seam is
 * explicit and auditable.
 */
export const authService: AuthService = isSupabaseConfigured ? supabaseAuthService : mockAuthService;

export * from './authTypes';
