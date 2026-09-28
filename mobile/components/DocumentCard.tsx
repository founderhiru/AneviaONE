import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../design/theme';
import type { Document } from '../types';
import { Card } from './Card';
import { StatusBadge } from './StatusBadge';

export type DocumentCardProps = {
  document: Document;
  onPress?: () => void;
};

const sourceLabel: Record<Document['source'], string> = {
  camera: 'Camera',
  upload: 'Uploaded',
  whatsapp: 'WhatsApp',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function DocumentCard({ document, onPress }: DocumentCardProps) {
  const theme = useTheme();
  return (
    <Card onPress={onPress} accessibilityLabel={`${document.title}, ${formatDate(document.date)}`}>
      <View style={styles.row}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={[theme.typography.labelLarge, { color: theme.colors.textPrimary }]}>{document.title}</Text>
          <Text style={[theme.typography.bodySmall, { color: theme.colors.textTertiary }]}>
            {formatDate(document.date)}
            {document.provider ? ` · ${document.provider}` : ''}
          </Text>
        </View>
        <StatusBadge label={sourceLabel[document.source]} tone="neutral" />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
});
