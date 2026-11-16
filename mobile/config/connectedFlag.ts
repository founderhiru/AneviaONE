import { isDemoMode } from './appMode';

/**
 * Whether the Connected Health page is offered (a row on Me). It is a front-end page:
 * medical records are live (they reuse the existing upload and documents), every other
 * source is honestly marked Coming soon. OFF unless a build asks for it
 * (EXPO_PUBLIC_CONNECTED_HEALTH=on); demo builds show it so it can be reviewed.
 * (`process.env.EXPO_PUBLIC_*` is referenced literally so Expo can inline it.)
 */
export const CONNECTED_HEALTH_ENABLED: boolean = isDemoMode || process.env.EXPO_PUBLIC_CONNECTED_HEALTH === 'on';
