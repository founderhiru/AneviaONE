import { mockHealthProfile } from '../../mock';
import type { HealthProfile } from '../../types';

export type DataSharingSetting = {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
};

/**
 * Profile / account-settings service boundary — backs the Me and Privacy &
 * Security screens. Destructive/data-sensitive actions (`downloadMyData`,
 * `deleteAccount`) are modeled explicitly even though only UI-skeleton
 * behavior exists today, so the real backend calls have an obvious seam.
 */
export interface ProfileService {
  getHealthProfile(): Promise<HealthProfile>;
  getDataSharingSettings(): Promise<DataSharingSetting[]>;
  setDataSharingSetting(id: string, enabled: boolean): Promise<void>;
  requestDataDownload(): Promise<{ requested: true }>;
  requestAccountDeletion(): Promise<{ requested: true }>;
}

const delay = <T,>(value: T) => new Promise<T>((resolve) => setTimeout(() => resolve(value), 300));

let dataSharingSettings: DataSharingSetting[] = [
  {
    id: 'share-doctor-brief',
    label: 'Allow sharing a Doctor Brief',
    description: 'Lets you generate and share a summary with a doctor when you choose to.',
    enabled: true,
  },
  {
    id: 'share-anonymized-research',
    label: 'Anonymized research contribution',
    description: 'Share de-identified data to help improve health insights. Off by default.',
    enabled: false,
  },
];

export const profileService: ProfileService = {
  getHealthProfile: () => delay(mockHealthProfile),
  getDataSharingSettings: () => delay(dataSharingSettings),
  async setDataSharingSetting(id, enabled) {
    dataSharingSettings = dataSharingSettings.map((s) => (s.id === id ? { ...s, enabled } : s));
    await delay(undefined);
  },
  requestDataDownload: () => delay({ requested: true }),
  requestAccountDeletion: () => delay({ requested: true }),
};
