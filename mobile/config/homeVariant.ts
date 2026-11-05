/**
 * Which Home the app shows. The new Home (what changed, with graphs) is the
 * default; EXPO_PUBLIC_HOME_VARIANT=classic brings back the previous design,
 * kept unchanged, until the new one is proven. A build setting, not a user one.
 * (`process.env.EXPO_PUBLIC_*` is referenced literally so Expo can inline it.)
 */
export type HomeVariant = 'v2' | 'classic';
export const HOME_VARIANT: HomeVariant = process.env.EXPO_PUBLIC_HOME_VARIANT === 'classic' ? 'classic' : 'v2';
