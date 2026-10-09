import { useCallback, useEffect, useState } from 'react';

import { checkDateOfBirth, checkFullName, splitDate } from '../services/profile/identityValidation';
import { profileService } from '../services/profile/profileService';
import { GENERIC_ERROR_MESSAGE, ServiceError } from '../services/serviceError';
import type { IdentityProfile } from '../types';

export type IdentityFormFields = {
  fullName: string;
  day: string;
  month: string;
  year: string;
};

/**
 * State for the identity details form (full name + date of birth), shared by
 * Identity details (Me) and the first-time "Set up your health profile"
 * step: loads the saved values, validates with the shared rules and saves
 * through the one identity service. Values are never logged.
 */
export function useIdentityForm() {
  const [saved, setSavedIdentity] = useState<IdentityProfile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fields, setFields] = useState<IdentityFormFields>({ fullName: '', day: '', month: '', year: '' });
  const [nameError, setNameError] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const identity = await profileService.getMyIdentity();
      setFields({ fullName: identity.fullName ?? '', ...splitDate(identity.dateOfBirth) });
      setSavedIdentity(identity);
    } catch (error) {
      setLoadError(error instanceof ServiceError ? error.userMessage : GENERIC_ERROR_MESSAGE);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  // Any edit means what's on screen is no longer what was saved.
  const setField = useCallback((field: keyof IdentityFormFields, value: string) => {
    setFields((prev) => ({ ...prev, [field]: value }));
    setJustSaved(false);
    setSaveError(null);
  }, []);

  /** Validates, then saves both values together. Resolves to whether it saved. */
  const save = useCallback(async (): Promise<boolean> => {
    const name = checkFullName(fields.fullName);
    const dob = checkDateOfBirth(fields.day, fields.month, fields.year);
    setNameError(name.ok ? null : name.error);
    setDateError(dob.ok ? null : dob.error);
    setSaveError(null);
    setJustSaved(false);
    if (!name.ok || !dob.ok) return false;
    setSaving(true);
    try {
      const result = await profileService.updateMyIdentity({ fullName: name.value, dateOfBirth: dob.value });
      setFields((prev) => ({ ...prev, fullName: result.fullName ?? '' }));
      setSavedIdentity(result);
      setJustSaved(true);
      return true;
    } catch (error) {
      // The entered values stay on screen so nothing has to be retyped.
      setSaveError(error instanceof ServiceError ? error.userMessage : GENERIC_ERROR_MESSAGE);
      return false;
    } finally {
      setSaving(false);
    }
  }, [fields]);

  const isEmpty = [fields.fullName, fields.day, fields.month, fields.year].every((v) => v.trim() === '');

  return {
    /** What is saved for this person, once loaded (null while loading or if it failed). */
    saved,
    loaded: saved !== null,
    loadError,
    reload: load,
    fields,
    setField,
    /** Nothing typed in any field. */
    isEmpty,
    nameError,
    dateError,
    saveError,
    saving,
    justSaved,
    save,
  };
}

export type IdentityForm = ReturnType<typeof useIdentityForm>;
