import { router, type Href } from 'expo-router';

/**
 * The one sign-in screen is Welcome: its sheet holds the only sign-in form
 * (the mobile number, then Google / Apple / Email). Every signed-out entry
 * point — launch, Explore's "Make it yours", an expired session, any future
 * "Get started" or "Sign in" — opens it, so there is a single sign-in UI.
 *
 * Google, Apple and Email continue on their own steps (`/(auth)/login?method=…`);
 * those are steps of this one flow, not sign-in screens of their own.
 */
export const AUTH_ROUTE = '/(auth)/welcome' as const;
const METHOD_ROUTE = '/(auth)/login' as const;

export type AuthMethod = 'google' | 'apple' | 'email';

export function authHref(method?: AuthMethod): Href {
  return method ? `${METHOD_ROUTE}?method=${method}` : AUTH_ROUTE;
}

/**
 * Opens sign-in from anywhere (or one method's step). Opened this way,
 * Welcome shows Back, which returns to the screen that called it.
 */
export function openAuth(method?: AuthMethod) {
  router.push(method ? authHref(method) : { pathname: AUTH_ROUTE, params: { from: 'app' } });
}
