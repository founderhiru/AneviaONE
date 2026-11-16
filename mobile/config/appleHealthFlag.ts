/**
 * Whether the Apple Health connection is offered on Connected Health. OFF unless a build asks
 * for it (EXPO_PUBLIC_APPLE_HEALTH=on). Even when on, it appears only on an iPhone whose build
 * includes the HealthKit component (never in Expo Go or on Android).
 * (`process.env.EXPO_PUBLIC_*` is referenced literally so Expo can inline it.)
 */
export const APPLE_HEALTH_ENABLED: boolean = process.env.EXPO_PUBLIC_APPLE_HEALTH === 'on';
