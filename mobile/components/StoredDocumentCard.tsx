import React from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../design/theme';
import { presentDocumentStatus, formatFileSize } from '../services/documents/documentsService';
import type { StoredDocument } from '../types';
import { Card } from './Card';
import { StatusBadge } from './StatusBadge';

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** "Uploaded today", "Uploaded yesterday" or "Uploaded 12 Sept 2026". */
export function uploadedLabel(iso: string, now = new Date()): string {
  const date = new Date(iso);
  if (sameDay(date, now)) return 'Uploaded today';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(date, yesterday)) return 'Uploaded yesterday';
  return `Uploaded ${date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`;
}

/** One of the person's real stored documents (Home's recent records, My documents). */
export function StoredDocumentCard({ document, onPress }: { document: StoredDocument; onPress: () => void }) {
  const theme = useTheme();
  const presentation = presentDocumentStatus(document);
  const when = uploadedLabel(document.uploadedAt ?? document.createdAt);
  return (
    <Card onPress={onPress} accessibilityLabel={`${document.originalFilename}, ${when}, ${presentation.label}`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }} testID={`stored-document-${document.id}`}>
        <Ionicons
          name={document.source === 'camera' ? 'camera-outline' : 'document-text-outline'}
          size={24}
          color={theme.colors.brandPrimary}
        />
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={[theme.typography.labelLarge, { color: theme.colors.textPrimary }]} numberOfLines={1}>
            {document.originalFilename}
          </Text>
          <Text style={[theme.typography.bodySmall, { color: theme.colors.textTertiary }]}>
            {when} · {formatFileSize(document.fileSizeBytes)}
          </Text>
          <StatusBadge label={presentation.label} tone={presentation.tone} />
        </View>
        <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
      </View>
    </Card>
  );
}
