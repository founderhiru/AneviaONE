import { isDemoMode } from '../../config/appMode';
import type { HealthProfile } from '../../types';
import { healthService } from '../health/healthService';
import { ServiceError } from '../serviceError';

export type DataSharingSetting = {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
};

/**
 * Profile / account-settings service boundary — backs the Me and Privacy &
 * Security screens. Destructive/data-sensitive actions are modeled
 * explicitly so the real backend calls have an obvious seam:
 *   data sharing  → `consents` ledger (proposed schema)
 *   download      → Edge Function `export-my-data`
 *   delete        → Edge Function `delete-account`
 * None of those exist yet, so production reports them as unavailable instead
 * of pretending a request was made.
 */
export interface ProfileService {
  getHealthProfile(): Promise<HealthProfile>;
  getDataSharingSettings(): Promise<DataSharingSetting[]>;
  setDataSharingSetting(id: string, enabled: boolean): Promise<void>;
  requestDataDownload(): Promise<{ requested: true }>;
  requestAccountDeletion(): Promise<{ requested: true }>;
}

const delay = <T,>(value: T) => new Promise<T>((resolve) => setTimeout(() => resolve(value), 300));

const SHARING_OPTIONS: DataSharingSetting[] = [
  {
    id: 'share-doctor-brief',
    label: 'Allow sharing a Doctor Brief',
    description: 'Lets you generate and share a summary with a doctor when you choose to.',
    enabled: false,
  },
  {
    id: 'share-anonymized-research',
    label: 'Anonymized research contribution',
    description: 'Share de-identified data to help improve health insights. Off by default.',
    enabled: false,
  },
];

/** DEMO MODE ONLY — in-memory settings and simulated requests. */
let demoSharingSettings: DataSharingSetting[] = SHARING_OPTIONS.map((s) =>
  s.id === 'share-doctor-brief' ? { ...s, enabled: true } : s
);

export const demoProfileService: ProfileService = {
  getHealthProfile: () => healthService.getHealthProfile(),
  getDataSharingSettings: () => delay(demoSharingSettings),
  async setDataSharingSetting(id, enabled) {
    demoSharingSettings = demoSharingSettings.map((s) => (s.id === id ? { ...s, enabled } : s));
    await delay(undefined);
  },
  requestDataDownload: () => delay({ requested: true }),
  requestAccountDeletion: () => delay({ requested: true }),
};

const notAvailable = (what: string) =>
  new ServiceError('not_available', `${what} isn’t available in the app yet. Your data has not been changed.`);

/**
 * PRODUCTION (Phase 1). Nothing has been shared, so every option shows as
 * off, and changes/requests are refused honestly until their backend exists.
 */
export const productionProfileService: ProfileService = {
  getHealthProfile: () => healthService.getHealthProfile(),
  getDataSharingSettings: async () => SHARING_OPTIONS,
  async setDataSharingSetting() {
    throw notAvailable('Changing sharing preferences');
  },
  async requestDataDownload() {
    throw notAvailable('Downloading your data');
  },
  async requestAccountDeletion() {
    throw notAvailable('Deleting your account');
  },
};

export const profileService: ProfileService = isDemoMode ? demoProfileService : productionProfileService;
