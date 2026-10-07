import { useEffect, useState } from 'react';

import { getSignInMethods, type SignInMethods } from '../services/auth/signInMethods';

/** The enabled sign-in methods; null while unknown or unreadable. */
export function useSignInMethods(): SignInMethods | null {
  const [methods, setMethods] = useState<SignInMethods | null>(null);
  useEffect(() => {
    let mounted = true;
    getSignInMethods().then((value) => mounted && setMethods(value));
    return () => {
      mounted = false;
    };
  }, []);
  return methods;
}
