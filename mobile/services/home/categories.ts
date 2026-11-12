/**
 * The categories on the category-first Home. Every tile opens a screen that exists.
 * Identity, Documents and Insurance open the personal documents folder, and are shown only when
 * that folder is switched on for the build (config/vaultFlag.ts).
 */
import type { Ionicons } from '@expo/vector-icons';

import { summarise, type ComingUpSummary, type Obligation } from '../obligations/comingUp';

export type HomeCategoryKey = 'health' | 'identity' | 'family' | 'documents' | 'insurance' | 'life';

export type HomeCategory = {
  key: HomeCategoryKey;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: '/(tabs)/health' | '/family' | '/reminders' | '/vault?group=identity' | '/vault?group=documents' | '/vault?group=insurance';
  /** Needs the personal documents folder (build setting; see config/vaultFlag.ts). */
  vault?: boolean;
};

export const HOME_CATEGORIES: HomeCategory[] = [
  { key: 'health', title: 'Health', subtitle: 'Reports, results and your health history', icon: 'heart-outline', route: '/(tabs)/health' },
  { key: 'identity', title: 'Identity', subtitle: 'Keep your ID files in one safe place', icon: 'id-card-outline', route: '/vault?group=identity', vault: true },
  { key: 'family', title: 'Family', subtitle: 'People, and who can see their records', icon: 'people-outline', route: '/family' },
  { key: 'documents', title: 'Documents', subtitle: 'Education, property, legal and other files', icon: 'folder-open-outline', route: '/vault?group=documents', vault: true },
  { key: 'insurance', title: 'Insurance', subtitle: 'Policies and certificates', icon: 'shield-checkmark-outline', route: '/vault?group=insurance', vault: true },
  { key: 'life', title: 'Life Management', subtitle: 'Reminders and important dates', icon: 'calendar-outline', route: '/reminders' },
];

/** The tiles to show: folder tiles only when the personal documents folder is switched on. */
export const visibleCategories = (vaultEnabled: boolean): HomeCategory[] => HOME_CATEGORIES.filter((c) => !c.vault || vaultEnabled);

export type TileBadge = { text: string; tone: 'danger' | 'neutral' };

/** What Life Management's tile says about the reminders (counts only; never a title or a kind). */
export function lifeBadge(summary: ComingUpSummary): TileBadge | null {
  if (summary.overdue > 0) return { text: `${summary.overdue} overdue`, tone: 'danger' };
  if (summary.soon > 0) return { text: `${summary.soon} due soon`, tone: 'neutral' };
  if (summary.total > 0) return { text: `${summary.total} coming up`, tone: 'neutral' };
  return null;
}

export function lifeBadgeFor(list: Obligation[] | null, today: Date): TileBadge | null {
  return list === null ? null : lifeBadge(summarise(list, today));
}

/** How many people are on the Family tile ("You and 2 others"), or null when it is just you. */
export function familyBadge(peopleCount: number): TileBadge | null {
  if (peopleCount <= 1) return null;
  const others = peopleCount - 1;
  return { text: `You and ${others} ${others === 1 ? 'other' : 'others'}`, tone: 'neutral' };
}
