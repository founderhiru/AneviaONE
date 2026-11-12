/**
 * New navigation: Home / Health / Add / Documents / Me. OFF by default, so a normal build
 * keeps today's five tabs. Turn on with EXPO_PUBLIC_NAV_V2=on; turn off again to roll back.
 * (`process.env.EXPO_PUBLIC_*` is referenced literally so Expo can inline it.)
 */
export const NAV_V2: boolean = process.env.EXPO_PUBLIC_NAV_V2 === 'on';
