import { useEffect } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useShareIntent } from 'expo-share-intent';

import { useAuth } from '../hooks/useAuth';
import { hasPendingSharedFile, pickedFileFromShare, setPendingSharedFile } from '../navigation/sharedFile';

/**
 * Receives a PDF shared into AneviaONE and opens Add Record with it. A share
 * received while signed out (or before onboarding is done) waits, and is
 * handled once the person is in — it is never uploaded or read automatically.
 */
export function ShareIntentHandler() {
  const { user } = useAuth();
  const router = useRouter();
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntent();

  useEffect(() => {
    if (hasShareIntent) {
      const result = pickedFileFromShare(shareIntent?.files);
      resetShareIntent();
      if (result.ok) setPendingSharedFile(result.file);
      else Alert.alert('Can’t add this', result.message);
    }
  }, [hasShareIntent, shareIntent, resetShareIntent]);

  const ready = Boolean(user?.onboardingComplete && user?.identityOnboardingComplete);
  useEffect(() => {
    if (ready && hasPendingSharedFile()) router.push('/add');
    // Re-check when the person becomes ready, and when a new share is parked.
  }, [ready, hasShareIntent, router]);

  return null;
}
