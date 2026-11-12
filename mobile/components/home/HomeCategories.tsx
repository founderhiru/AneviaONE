import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';

import { AiConsentCard, Avatar, Card, EmptyState, LoadingState, PersonBar, ProcessingState, READING_COPY, readingSteps, ScreenContainer } from '../index';
import { StoredDocumentCard } from '../StoredDocumentCard';
import { wordmarkParts } from '../../config/brand';
import { isDemoMode } from '../../config/appMode';
import { FOREST } from '../../design/brandSurface';
import { useTheme } from '../../design/theme';
import { useAuth } from '../../hooks/useAuth';
import { useAutoRead } from '../../hooks/useAutoRead';
import { useHealthMemoryUpdates } from '../../hooks/useHealthMemoryUpdates';
import { useObligations } from '../../hooks/useObligations';
import { usePeople } from '../../hooks/usePeople';
import { documentsService } from '../../services/documents/documentsService';
import { VAULT_ENABLED } from '../../config/vaultFlag';
import { familyBadge, visibleCategories, lifeBadgeFor, type HomeCategory, type TileBadge } from '../../services/home/categories';
import type { StoredDocument } from '../../types';
import { NoticesCard } from './NoticesCard';

const [wordLead, wordAccent] = wordmarkParts();
const RECENT = 3;

/**
 * CATEGORY-FIRST HOME (build setting EXPO_PUBLIC_HOME_VARIANT=categories; off by default).
 * A short list of places to go, then the newest records. Every tile opens a screen that
 * already works; there is no large reminders panel here (Life Management holds those).
 * Tiles show counts only, never a reminder title or a health detail.
 */
export function HomeCategories() {
  const theme = useTheme();
  const { user } = useAuth();
  const { people, active } = usePeople();
  const autoRead = useAutoRead();
  const [documents, setDocuments] = useState<StoredDocument[] | null>(null);
  const [documentsError, setDocumentsError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const reminders = useObligations(active?.id ?? (isDemoMode ? 'demo-person' : null));

  const loadDocuments = useCallback(async () => {
    try {
      setDocuments(await documentsService.listDocuments());
      setDocumentsError(false);
    } catch {
      setDocumentsError(true);
      setDocuments((prev) => prev ?? []);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadDocuments();
  }, [loadDocuments]);
  useFocusEffect(
    useCallback(() => {
      loadDocuments();
    }, [loadDocuments]),
  );
  useHealthMemoryUpdates(loadDocuments);

  async function handleRefresh() {
    setRefreshing(true);
    await Promise.all([loadDocuments(), autoRead.refresh(), reminders.reload()]);
    setRefreshing(false);
  }

  const badges: Record<HomeCategory['key'], TileBadge | null> = {
    health: null,
    identity: null,
    documents: null,
    insurance: null,
    family: familyBadge(people.length),
    life: lifeBadgeFor(reminders.visible, new Date()),
  };

  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }} testID="home-header">
      <Text style={[theme.typography.headingMedium, { flex: 1, color: theme.colors.textPrimary, fontWeight: '500' }]} accessibilityRole="header" numberOfLines={1}>
        {wordLead}
        <Text style={{ color: theme.colors.accent, fontWeight: '700' }}>{wordAccent}</Text>
      </Text>
      <Pressable
        onPress={() => router.push('/add')}
        accessibilityRole="button"
        accessibilityLabel="Add Health Record"
        testID="home-add-record"
        hitSlop={8}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 36, paddingHorizontal: theme.spacing.sm, borderRadius: theme.radius.pill, backgroundColor: FOREST.field, opacity: pressed ? 0.85 : 1 })}
      >
        <Ionicons name="add" size={18} color={FOREST.text} />
        <Text style={[theme.typography.labelMedium, { color: FOREST.text }]}>Add</Text>
      </Pressable>
      <Pressable onPress={() => router.push('/(tabs)/me')} accessibilityRole="button" accessibilityLabel="Your profile" testID="home-profile" hitSlop={8} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
        <Avatar name={user?.fullName} size={36} />
      </Pressable>
    </View>
  );

  const readingStatus = autoRead.showConsent ? (
    <AiConsentCard title={autoRead.waitingForConsent > 1 ? 'Read your reports for you?' : undefined} onAllow={autoRead.allow} onDecline={autoRead.decline} />
  ) : autoRead.reading > 0 ? (
    <Card testID="home-reading">
      <ProcessingState title={READING_COPY.title} description={READING_COPY.description} steps={readingSteps('reading')} />
    </Card>
  ) : null;

  const recent = (documents ?? []).slice(0, RECENT);
  const firstName = user?.fullName?.trim().split(/\s+/)[0];

  return (
    <ScreenContainer refreshing={refreshing} onRefresh={handleRefresh}>
      <NoticesCard />
      <PersonBar />
      {header}

      <View style={{ gap: 2 }} testID="home-greeting">
        <Text style={[theme.typography.bodyMedium, { color: theme.colors.textTertiary }]}>{firstName ? `Hello, ${firstName}` : 'Hello'}</Text>
        <Text style={[theme.typography.headingLarge, { color: theme.colors.textPrimary }]} accessibilityRole="header">
          Your life. Your intelligence.
        </Text>
        <Text style={[theme.typography.bodyMedium, { color: theme.colors.textSecondary }]}>Your health, family and reminders, in one place.</Text>
      </View>

      {readingStatus}

      <Text style={[theme.typography.labelLarge, { color: theme.colors.textSecondary }]} accessibilityRole="header">
        Your information
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }} testID="home-categories">
        {visibleCategories(VAULT_ENABLED).map((c) => (
          <CategoryTile key={c.key} category={c} badge={badges[c.key]} />
        ))}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={[theme.typography.labelLarge, { color: theme.colors.textSecondary }]} accessibilityRole="header">
          Recently added
        </Text>
        {recent.length > 0 ? (
          <Pressable onPress={() => router.push('/documents')} accessibilityRole="button" testID="home-view-all" hitSlop={8}>
            <Text style={[theme.typography.labelMedium, { color: theme.colors.accent }]}>View all</Text>
          </Pressable>
        ) : null}
      </View>

      {documents === null ? (
        <LoadingState label="Loading your records…" />
      ) : documentsError && recent.length === 0 ? (
        <Pressable onPress={loadDocuments} accessibilityRole="button" testID="home-records-retry">
          <Text style={[theme.typography.bodySmall, { color: theme.colors.textTertiary }]}>We couldn&rsquo;t load your records. Tap to try again.</Text>
        </Pressable>
      ) : recent.length === 0 ? (
        <EmptyState title="Your records will appear here" description="Upload your first document to get started." actionLabel="Add health record" onActionPress={() => router.push('/add')} />
      ) : (
        <View style={{ gap: theme.spacing.sm }} testID="home-recent">
          {recent.map((d) => (
            <StoredDocumentCard key={d.id} document={d} onPress={() => router.push(`/documents/${d.id}`)} />
          ))}
        </View>
      )}
    </ScreenContainer>
  );
}

function CategoryTile({ category, badge }: { category: HomeCategory; badge: TileBadge | null }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={() => router.push(category.route)}
      accessibilityRole="button"
      accessibilityLabel={badge ? `${category.title}. ${category.subtitle}. ${badge.text}` : `${category.title}. ${category.subtitle}`}
      testID={`home-category-${category.key}`}
      style={({ pressed }) => ({
        flexGrow: 1,
        flexBasis: '46%',
        maxWidth: '100%',
        minHeight: 120,
        gap: theme.spacing.xs,
        padding: theme.spacing.md,
        borderRadius: theme.radius.lg,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Ionicons name={category.icon} size={26} color={theme.colors.accent} />
      <Text style={[theme.typography.labelLarge, { color: theme.colors.textPrimary }]}>{category.title}</Text>
      <Text style={[theme.typography.bodySmall, { color: theme.colors.textTertiary }]}>{category.subtitle}</Text>
      {badge ? (
        <Text style={[theme.typography.labelMedium, { color: badge.tone === 'danger' ? theme.colors.danger : theme.colors.accent }]} testID={`home-category-${category.key}-badge`}>
          {badge.text}
        </Text>
      ) : null}
    </Pressable>
  );
}
