import { isDemoMode } from '../../config/appMode';
import { mockAuthService } from './mockAuthService';
import { supabaseAuthService } from './supabaseAuthService';
import type { AuthService } from './authTypes';

/**
 * The single entry point screens should import.
 *
 *   production mode → real Supabase Auth, always. If Supabase is not
 *                     configured the root layout shows a configuration
 *                     screen; it NEVER silently falls back to the mock.
 *   demo mode       → the isolated mock (explicit opt-in, visibly badged).
 */
export const authService: AuthService = isDemoMode ? mockAuthService : supabaseAuthService;

export * from './authTypes';
