import React, { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { Button, Card, ProcessingState, ScreenContainer, ScreenHeader, SecondaryButton, type ProcessingStep } from '../../components';
import { useTheme } from '../../design/theme';
import { documentsService } from '../../services/documents/documentsService';
import type { Document, DocumentProcessingStatus, DocumentSource } from '../../types';

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
  const [resultDocument, setResultDocument] = useState<Document | null>(null);
  const [permissionError, setPermissionError] = useState<string | undefined>();

  async function startProcessing(source: DocumentSource, fileUri?: string) {
    setStep('processing');
    const doc = await documentsService.processNewDocument({ source, fileUri }, (update) => setCurrentStatus(update.status));
    setResultDocument(doc);
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

  if (step === 'updated' && resultDocument) {
    return (
      <ScreenContainer scroll={false} contentStyle={{ justifyContent: 'space-between' }}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: theme.spacing.sm }}>
          <Ionicons name="checkmark-circle" size={56} color={theme.colors.success} />
          <Text style={[theme.typography.headingLarge, { color: theme.colors.textPrimary, textAlign: 'center' }]} accessibilityRole="header">
            Health Memory Updated
          </Text>
          <Text style={[theme.typography.bodyMedium, { color: theme.colors.textTertiary, textAlign: 'center' }]}>
            {resultDocument.title} has been added to your Health Memory.
          </Text>
        </View>
        <View style={{ gap: theme.spacing.sm }}>
          <Button label="View What Changed" onPress={() => router.replace('/changes')} />
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
