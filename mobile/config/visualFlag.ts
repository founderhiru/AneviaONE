/**
 * Visual direction V2: the green palette and the restyled Biomarkers, Documents and Family
 * screens. OFF unless a build asks for it (EXPO_PUBLIC_VISUAL_V2=on), so the current look
 * ships unchanged until the new one has been checked on a device.
 * (`process.env.EXPO_PUBLIC_*` is referenced literally so Expo can inline it.)
 */
export const VISUAL_V2_ENABLED: boolean = process.env.EXPO_PUBLIC_VISUAL_V2 === 'on';
