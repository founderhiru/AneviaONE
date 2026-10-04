import { useEffect, useState } from 'react';

import { isAppleSignInAvailable } from '../services/auth/appleAuth';

/** Whether to offer Sign in with Apple here (iOS with Apple sign-in available). */
export function useAppleSignInAvailable(): boolean {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    let mounted = true;
    isAppleSignInAvailable().then((value) => mounted && setAvailable(value));
    return () => {
      mounted = false;
    };
  }, []);
  return available;
}
