import { isDemoMode } from './appMode';

/**
 * Whether the personal documents folder ("Vault files") is shown. It needs the
 * `vault_files` table and the private `personal-vault` bucket in the database, so it
 * stays OFF in a real build until that migration has been applied AND the release
 * gates for identity files are closed. Demo builds show it so it can be reviewed.
 * (`process.env.EXPO_PUBLIC_*` is referenced literally so Expo can inline it.)
 */
export const VAULT_ENABLED: boolean = isDemoMode || process.env.EXPO_PUBLIC_VAULT_FILES === 'on';
