import React, { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import {
  Button,
  Card,
  ErrorState,
  ProcessingState,
  ScreenContainer,
  ScreenHeader,
  SecondaryButton,
  SuccessCheck,
  type ProcessingStep,
} from '../../components';
import { useTheme } from '../../design/theme';
import { DOCUMENT_STATUS_PRESENTATION, documentsService } from '../../services/documents/documentsService';
import { GENERIC_ERROR_MESSAGE, ServiceError } from '../../services/serviceError';
import type { PickedFile, UploadResult, UploadStage } from '../../types';

type FlowStep = 'choose' | 'uploading' | 'done' | 'error';

const STAGE_LABELS: Record<UploadStage, string> = {
  validating: 'Checking the file',
  uploading: 'Uploading securely',
  saving: 'Saving to your records',
};

const STAGE_ORDER: UploadStage[] = ['validating', 'uploading', 'saving'];

/**
 * Add Record. Pick a PDF → validate → store the original privately → record
 * it, all through `documentsService` (real in production, in-memory in demo
 * mode). The result screen only reports what actually happened: the counts
 * card appears only when the service returns a processing summary.
 */
export default function AddRecordScreen() {
  const theme = useTheme();
  const [step, setStep] = useState<FlowStep>('choose');
  const [stage, setStage] = useState<UploadStage>('validating');
  const [result, setResult] = useState<UploadResult | null>(null);
  const [failure, setFailure] = useState<{ message: string; retryable: boolean } | null>(null);
  const [pickedFile, setPickedFile] = useState<PickedFile | null>(null);

  async function upload(file: PickedFile) {
    setPickedFile(file);
    setFailure(null);
    setStage('validating');
    setStep('uploading');
    try {
      setResult(await documentsService.uploadDocument(file, setStage));
      setStep('done');
    } catch (error) {
      setFailure(
        error instanceof ServiceError
          ? { message: error.userMessage, retryable: error.retryable }
          : { message: GENERIC_ERROR_MESSAGE, retryable: true }
      );
      setStep('error');
    }
  }

  function handleCamera() {
    Alert.alert('Scan document', 'Scanning with your camera is coming soon. For now, please upload a PDF of your report.');
  }

  async function handleUpload() {
    const picked = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf'],
      multiple: false,
      copyToCacheDirectory: true,
    });
    if (picked.canceled) return;
    const asset = picked.assets?.[0];
    if (!asset) return;
    upload({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType, size: asset.size });
  }

  function handleWhatsApp() {
    router.replace('/whatsapp');
  }

  function handleManual() {
    Alert.alert(
      'Add manually',
      'Manually entering a record without a document is coming soon. For now, upload a report to add it to your Health Memory.'
    );
  }

  if (step === 'uploading') {
    const steps: ProcessingStep[] = STAGE_ORDER.map((s) => ({
      id: s,
      label: STAGE_LABELS[s],
      status: s === stage ? 'active' : STAGE_ORDER.indexOf(stage) > STAGE_ORDER.indexOf(s) ? 'done' : 'pending',
    }));
    return (
      <ScreenContainer scroll={false} contentStyle={{ justifyContent: 'center' }}>
        <ProcessingState title="Uploading your report…" steps={steps} />
      </ScreenContainer>
    );
  }

  if (step === 'error' && failure) {
    return (
      <ScreenContainer scroll={false} contentStyle={{ justifyContent: 'space-between' }}>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <ErrorState
            title="Upload didn’t finish"
            description={failure.message}
            retryLabel="Try again"
            onRetry={failure.retryable && pickedFile ? () => upload(pickedFile) : undefined}
          />
        </View>
        <SecondaryButton label="Choose another file" onPress={() => setStep('choose')} />
      </ScreenContainer>
    );
  }

  if (step === 'done' && result) {
    const { document, processing } = result;
    const counts = processing
      ? [
          { label: `${processing.observationCount} health observation${processing.observationCount === 1 ? '' : 's'}`, icon: 'analytics-outline' as const },
          { label: `${processing.newEncounterCount} new encounter${processing.newEncounterCount === 1 ? '' : 's'}`, icon: 'calendar-outline' as const },
          { label: `${processing.historicalComparisonCount} historical comparison${processing.historicalComparisonCount === 1 ? '' : 's'}`, icon: 'trending-up-outline' as const },
        ]
      : null;
    return (
      <ScreenContainer scroll={false} contentStyle={{ justifyContent: 'space-between' }}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: theme.spacing.md }}>
          <SuccessCheck />
          <Text style={[theme.typography.headingLarge, { color: theme.colors.textPrimary, textAlign: 'center' }]} accessibilityRole="header">
            {counts ? 'Added to Health Memory' : 'Stored securely'}
          </Text>
          <Text style={[theme.typography.bodyMedium, { color: theme.colors.textTertiary, textAlign: 'center' }]}>
            {document.originalFilename}
          </Text>
          {counts ? (
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
          ) : (
            <Text style={[theme.typography.bodySmall, { color: theme.colors.textTertiary, textAlign: 'center' }]}>
              {DOCUMENT_STATUS_PRESENTATION[document.status].description}
            </Text>
          )}
        </View>
        <View style={{ gap: theme.spacing.sm }}>
          {counts ? (
            <Button label="See what changed →" onPress={() => router.replace('/changes')} />
          ) : (
            <Button label="View document" onPress={() => router.replace(`/documents/${document.id}`)} />
          )}
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
