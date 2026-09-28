import React, { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { Button, Card, ProcessingState, ScreenContainer, ScreenHeader, SecondaryButton, SuccessCheck, type ProcessingStep } from '../../components';
import { useTheme } from '../../design/theme';
import { documentsService, type ProcessingResult } from '../../services/documents/documentsService';
import type { DocumentProcessingStatus, DocumentSource } from '../../types';

type FlowStep = 'choose' | 'processing' | 'updated';

const STEP_LABELS: Record<DocumentProcessingStatus, string> = {
  received: 'Report received',
  identifying: 'Reading document',
  extracting: 'Extracting health information',
  comparing: 'Comparing with your history',
  updating_memory: 'Updating Health Memory',
  complete: 'Updating Health Memory',
  failed: 'Something went wrong',
};

const STEP_ORDER: DocumentProcessingStatus[] = ['received', 'identifying', 'extracting', 'comparing', 'updating_memory'];

export default function AddRecordScreen() {
  const theme = useTheme();
  const [step, setStep] = useState<FlowStep>('choose');
  const [currentStatus, setCurrentStatus] = useState<DocumentProcessingStatus>('received');
  const [result, setResult] = useState<ProcessingResult | null>(null);
  const [permissionError, setPermissionError] = useState<string | undefined>();

  async function startProcessing(source: DocumentSource, fileUri?: string) {
    setStep('processing');
    const outcome = await documentsService.processNewDocument({ source, fileUri }, (update) => setCurrentStatus(update.status));
    setResult(outcome);
    setStep('updated');
  }

  async function handleCamera() {
    setPermissionError(undefined);
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setPermissionError('Camera access is needed to take a photo of your report.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (result.canceled) return;
    startProcessing('camera', result.assets[0]?.uri);
  }

  async function handleUpload() {
    setPermissionError(undefined);
    const result = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], multiple: false });
    if (result.canceled) return;
    startProcessing('upload', result.assets?.[0]?.uri);
  }

  function handleWhatsApp() {
    router.replace('/whatsapp');
  }

  function handleManual() {
    Alert.alert(
      'Add manually',
      'Manually entering a record without a document is coming soon. For now, scan or upload a report to add it to your Health Memory.'
    );
  }

  if (step === 'processing') {
    const steps: ProcessingStep[] = STEP_ORDER.map((status) => ({
      id: status,
      label: STEP_LABELS[status],
      status: currentStatus === status ? 'active' : STEP_ORDER.indexOf(currentStatus) > STEP_ORDER.indexOf(status) || currentStatus === 'complete' ? 'done' : 'pending',
    }));
    return (
      <ScreenContainer scroll={false} contentStyle={{ justifyContent: 'center' }}>
        <ProcessingState title="Understanding your report…" steps={steps} />
      </ScreenContainer>
    );
  }

  if (step === 'updated' && result) {
    const counts = [
      { label: `${result.observationCount} health observation${result.observationCount === 1 ? '' : 's'}`, icon: 'analytics-outline' as const },
      { label: `${result.newEncounterCount} new encounter${result.newEncounterCount === 1 ? '' : 's'}`, icon: 'calendar-outline' as const },
      { label: `${result.historicalComparisonCount} historical comparison${result.historicalComparisonCount === 1 ? '' : 's'}`, icon: 'trending-up-outline' as const },
    ];
    return (
      <ScreenContainer scroll={false} contentStyle={{ justifyContent: 'space-between' }}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: theme.spacing.md }}>
          <SuccessCheck />
          <Text style={[theme.typography.headingLarge, { color: theme.colors.textPrimary, textAlign: 'center' }]} accessibilityRole="header">
            Added to Health Memory
          </Text>
          <Text style={[theme.typography.bodyMedium, { color: theme.colors.textTertiary, textAlign: 'center' }]}>
            {result.document.title} has been added to your Health Memory.
          </Text>
          <Card style={{ width: '100%' }}>
            <View style={{ gap: theme.spacing.sm }}>
              {counts.map((item) => (
                <View key={item.label} style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
                  <Ionicons name={item.icon} size={18} color={theme.colors.brandPrimary} />
                  <Text style={[theme.typography.bodyMedium, { color: theme.colors.textPrimary }]}>{item.label}</Text>
                </View>
              ))}
            </View>
          </Card>
        </View>
        <View style={{ gap: theme.spacing.sm }}>
          <Button label="See what changed →" onPress={() => router.replace('/changes')} />
          <SecondaryButton label="Done" onPress={() => router.replace('/(tabs)/home')} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer scroll={false}>
      <ScreenHeader title="Add to Health Memory" onBack={() => router.back()} />
      <Text style={[theme.typography.bodyMedium, { color: theme.colors.textTertiary, marginTop: theme.spacing.xs }]}>
        Choose how you&rsquo;d like to add this record.
      </Text>
      <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.md }}>
        <Card onPress={handleCamera} accessibilityLabel="Scan document">
          <Row icon="camera" label="Scan document" />
        </Card>
        <Card onPress={handleUpload} accessibilityLabel="Upload document">
          <Row icon="cloud-upload-outline" label="Upload document" />
        </Card>
        <Card onPress={handleWhatsApp} accessibilityLabel="Send via WhatsApp">
          <Row icon="logo-whatsapp" label="WhatsApp" />
        </Card>
        <Card onPress={handleManual} accessibilityLabel="Add manually">
          <Row icon="create-outline" label="Add manually" />
        </Card>
        {permissionError ? (
          <Text style={[theme.typography.bodySmall, { color: theme.colors.danger }]} accessibilityLiveRegion="polite">
            {permissionError}
          </Text>
        ) : null}
      </View>
    </ScreenContainer>
  );
}

function Row({ icon, label }: { icon: keyof typeof Ionicons.glyphMap; label: string }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
      <Ionicons name={icon} size={22} color={theme.colors.brandPrimary} />
      <Text style={[theme.typography.labelLarge, { color: theme.colors.textPrimary }]}>{label}</Text>
    </View>
  );
}
