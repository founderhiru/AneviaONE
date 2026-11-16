/**
 * The Connected Health source registry: what AneviaONE can (or one day will) bring in.
 *
 * Honesty rules, enforced by tests:
 *  - A source is `available` or `connected` ONLY if something real backs it: an adapter that is
 *    registered in `ADAPTERS` (none yet), or, for medical records, the existing upload flow.
 *  - Wearables never claim a direct connection. They reach AneviaONE, when they do, through a
 *    health platform (Apple Health / Health Connect).
 *  - Nothing here holds credentials, tokens or API keys.
 */

export type SourceGroup = 'platform' | 'wearable' | 'records' | 'future';
/** coming_soon = not built; available = can be used now; connected = in use now. */
export type SourceStatus = 'coming_soon' | 'available' | 'connected';
/** direct = AneviaONE talks to the source; via_platform = data arrives through a health platform;
 * upload = the person adds files themselves. */
export type SourcePath = 'direct' | 'via_platform' | 'upload';
export type HealthPlatformId = 'apple_health' | 'health_connect';
export type IconName = 'heart-outline' | 'fitness-outline' | 'watch-outline' | 'pulse-outline' | 'moon-outline' | 'barbell-outline' | 'flask-outline' | 'document-text-outline' | 'medkit-outline' | 'folder-open-outline' | 'business-outline' | 'git-network-outline' | 'heart-circle-outline' | 'phone-portrait-outline';

export type Integration = {
  id: string;
  name: string;
  group: SourceGroup;
  icon: IconName;
  status: SourceStatus;
  path: SourcePath;
  /** For via_platform sources: the platforms they may share through. */
  via?: HealthPlatformId[];
  /** One plain sentence on what it is. */
  summary: string;
  /** The kinds of data it could share. */
  dataTypes: string[];
  /** Where to go when it is available (an existing screen). */
  route?: '/add' | '/documents';
  /** Extra, honest detail (eligibility, device support). */
  note?: string;
};

export const PLATFORM_NAME: Record<HealthPlatformId, string> = {
  apple_health: 'Apple Health',
  health_connect: 'Health Connect',
};

export const INTEGRATIONS: Integration[] = [
  // — Health platforms —
  {
    id: 'apple_health',
    name: 'Apple Health',
    group: 'platform',
    icon: 'heart-outline',
    status: 'coming_soon',
    path: 'direct',
    summary: 'Bring in the activity, sleep and vitals your iPhone already collects.',
    dataTypes: ['Steps and activity', 'Sleep', 'Heart rate', 'Workouts'],
    note: 'iPhone only. You choose each data type; AneviaONE reads only what you allow.',
  },
  {
    id: 'health_connect',
    name: 'Health Connect',
    group: 'platform',
    icon: 'fitness-outline',
    status: 'coming_soon',
    path: 'direct',
    summary: 'Bring in data from the Android apps and devices that share to Health Connect.',
    dataTypes: ['Steps and activity', 'Sleep', 'Heart rate', 'Workouts'],
    note: 'Android only. You choose each data type; AneviaONE reads only what you allow.',
  },
  // — Wearables: never direct; through a health platform —
  { id: 'apple_watch', name: 'Apple Watch', group: 'wearable', icon: 'watch-outline', status: 'coming_soon', path: 'via_platform', via: ['apple_health'], summary: 'Its data reaches AneviaONE through Apple Health.', dataTypes: ['Activity', 'Heart rate', 'Sleep'] },
  { id: 'fitbit', name: 'Fitbit', group: 'wearable', icon: 'pulse-outline', status: 'coming_soon', path: 'via_platform', via: ['health_connect'], summary: 'On Android, its data can reach AneviaONE through Health Connect.', dataTypes: ['Activity', 'Heart rate', 'Sleep'] },
  { id: 'garmin', name: 'Garmin', group: 'wearable', icon: 'barbell-outline', status: 'coming_soon', path: 'via_platform', via: ['apple_health', 'health_connect'], summary: 'May share through Apple Health or Health Connect, depending on the Garmin app.', dataTypes: ['Activity', 'Workouts', 'Sleep'] },
  { id: 'oura', name: 'Oura', group: 'wearable', icon: 'moon-outline', status: 'coming_soon', path: 'via_platform', via: ['apple_health', 'health_connect'], summary: 'May share through Apple Health or Health Connect, depending on the Oura app.', dataTypes: ['Sleep', 'Readiness', 'Heart rate'] },
  { id: 'whoop', name: 'WHOOP', group: 'wearable', icon: 'heart-circle-outline', status: 'coming_soon', path: 'via_platform', via: ['apple_health', 'health_connect'], summary: 'May share through Apple Health or Health Connect, depending on the WHOOP app.', dataTypes: ['Recovery', 'Sleep', 'Strain'] },
  // — Medical records: live through the existing upload —
  { id: 'lab_reports', name: 'Blood tests and lab reports', group: 'records', icon: 'flask-outline', status: 'available', path: 'upload', summary: 'Upload a PDF, photo or scan. AneviaONE reads the results into your Health Memory.', dataTypes: ['Test results', 'Dates', 'Reference ranges'], route: '/add' },
  { id: 'prescriptions', name: 'Prescriptions', group: 'records', icon: 'medkit-outline', status: 'available', path: 'upload', summary: 'Upload a PDF or photo. AneviaONE reads each medicine, dose and schedule exactly as written.', dataTypes: ['Medicines', 'Dose and schedule', 'Prescribing Doctor'], route: '/add', note: 'Printed prescriptions read best. Handwritten ones are often held for you to check.' },
  { id: 'consultations', name: 'Doctor consultation records', group: 'records', icon: 'document-text-outline', status: 'coming_soon', path: 'upload', summary: 'Structured reading of consultation notes is not available yet.', dataTypes: ['Visit notes', 'Diagnoses', 'Advice'] },
  // — Future —
  { id: 'lab_partners', name: 'Laboratory partners', group: 'future', icon: 'business-outline', status: 'coming_soon', path: 'direct', summary: 'Receive your reports directly from partner labs, with your permission.', dataTypes: ['Lab results'] },
  { id: 'abdm', name: 'ABDM / ABHA', group: 'future', icon: 'git-network-outline', status: 'coming_soon', path: 'direct', summary: 'Link records through India’s Ayushman Bharat Digital Mission.', dataTypes: ['Health records'], note: 'Subject to eligibility and integration requirements.' },
  { id: 'other_providers', name: 'Other healthcare providers', group: 'future', icon: 'phone-portrait-outline', status: 'coming_soon', path: 'direct', summary: 'More supported data providers will be listed here when they are ready.', dataTypes: [] },
];

/**
 * Adapters that connect a source to AneviaONE. This static list stays empty: an adapter is only
 * real on a device that can run it. The first one, Apple Health (services/connected/appleHealth.ts),
 * is offered at run time only when the build asks for it (EXPO_PUBLIC_APPLE_HEALTH=on) and the
 * iPhone supports it; otherwise Apple Health stays `coming_soon` as listed above. Everything
 * else in the `platform` and `wearable` groups has no adapter and can only be `coming_soon`.
 */
export interface SourceAdapter {
  id: string;
  /** Ask the person for permission and start sharing. */
  connect(): Promise<void>;
  /** Stop sharing and forget the connection. */
  disconnect(): Promise<void>;
  /** When data last arrived, if ever. */
  lastSyncedAt(): Promise<string | null>;
}
export const ADAPTERS: SourceAdapter[] = [];

export function byGroup(group: SourceGroup): Integration[] {
  return INTEGRATIONS.filter((i) => i.group === group);
}

export function viaText(item: Integration): string | null {
  if (item.path !== 'via_platform' || !item.via?.length) return null;
  return `Through ${item.via.map((p) => PLATFORM_NAME[p]).join(' or ')}`;
}

export const STATUS_LABEL: Record<SourceStatus, string> = {
  coming_soon: 'Coming soon',
  available: 'Available',
  connected: 'Connected',
};
