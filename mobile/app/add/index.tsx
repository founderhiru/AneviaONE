import React, { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import {
  Button,
  Card,
  ErrorState,
  ProcessingState,
  ReadReportPanel,
  ScreenContainer,
  ScreenHeader,
  SecondaryButton,
  SuccessCheck,
  type ProcessingStep,
} from '../../components';
import { useTheme } from '../../design/theme';
import { useReadReport } from '../../hooks/useReadReport';
import { useSingleFlight } from '../../hooks/useSingleFlight';
import {
  CAPTURE_METHODS,
  MAX_PAGES,
  choosePhotoPages,
  pagesToPdf,
  photographPage,
  pickPdf,
  type CaptureMethod,
  type CapturedPage,
  type PageResult,
} from '../../services/documents/capture';
import { DOCUMENT_STATUS_PRESENTATION, documentsService } from '../../services/documents/documentsService';
import { GENERIC_ERROR_MESSAGE, ServiceError } from '../../services/serviceError';
import type { PickedFile, StoredDocument, UploadResult, UploadStage } from '../../types';

type FlowStep = 'choose' | 'preparing' | 'uploading' | 'done' | 'error';

const CAPTURE_ICONS: Record<CaptureMethod, keyof typeof Ionicons.glyphMap> = {
  pdf: 'document-text-outline',
  camera: 'camera-outline',
  library: 'images-outline',
  scan: 'scan-outline',
};

/** Asks whether to photograph another page of a scan. */
function askForAnotherPage(count: number): Promise<boolean> {
  return new Promise((resolve) =>
    Alert.alert(
      `${count} page${count === 1 ? '' : 's'} captured`,
      'Add another page to this document?',
      [
        { text: 'Done', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Add page', onPress: () => resolve(true) },
      ],
      { cancelable: false }
    )
  );
}

const STAGE_LABELS: Record<UploadStage, string> = {
  validating: 'Checking the file',
  uploading: 'Uploading securely',
  saving: 'Saving to your records',
};

const STAGE_ORDER: UploadStage[] = ['validating', 'uploading', 'saving'];

/**
 * Add Health Record: Upload PDF, Take Photo, Choose Photo or Scan Document.
 * Every path ends in one PDF → validate → store the original privately →
 * record it, all through `documentsService` (real in production, in-memory
 * in demo mode). Photos and scans become a PDF of the pages on the device
 * (services/documents/capture.ts); nothing reads or interprets them here.
 * The result screen only reports what actually happened: the counts card
 * appears only when the service returns a processing summary (demo). A real
 * PDF then goes on to be read on the server — after explicit consent —
 * with progress shown as Uploading → Processing → Reading report → Ready.
 */
export default function AddRecordScreen() {
  const theme = useTheme();
  const [step, setStep] = useState<FlowStep>('choose');
  const [stage, setStage] = useState<UploadStage>('validating');
  const [result, setResult] = useState<UploadResult | null>(null);
  const [failure, setFailure] = useState<{ message: string; retryable: boolean } | null>(null);
  const [pickedFile, setPickedFile] = useState<PickedFile | null>(null);
  const captureOnce = useSingleFlight();

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

  function showDenied(message: string) {
    Alert.alert('Permission needed', message, [
      { text: 'Not now', style: 'cancel' },
      { text: 'Upload PDF instead', onPress: () => capture('pdf') },
    ]);
  }

  async function uploadPages(pages: CapturedPage[], method: Exclude<CaptureMethod, 'pdf'>) {
    setFailure(null);
    setStep('preparing');
    let file: PickedFile;
    try {
      file = await pagesToPdf(pages, method);
    } catch {
      setPickedFile(null);
      setFailure({ message: 'We couldn’t turn those pages into a document. Please try again.', retryable: false });
      setStep('error');
      return;
    }
    await upload(file);
  }

  async function collectScanPages(): Promise<PageResult> {
    const pages: CapturedPage[] = [];
    while (pages.length < MAX_PAGES) {
      const result = await photographPage();
      if (result.kind === 'permission_denied') return result;
      if (result.kind === 'cancelled') break;
      pages.push(...result.pages);
      if (pages.length >= MAX_PAGES || !(await askForAnotherPage(pages.length))) break;
    }
    return pages.length ? { kind: 'pages', pages } : { kind: 'cancelled' };
  }

  /** Runs one capture method; a second tap while one is open is ignored. */
  function capture(method: CaptureMethod) {
    return captureOnce(async () => {
      try {
        if (method === 'pdf') {
          const result = await pickPdf();
          if (result.kind === 'file') await upload(result.file);
          return;
        }
        const result = method === 'camera' ? await photographPage() : method === 'library' ? await choosePhotoPages() : await collectScanPages();
        if (result.kind === 'permission_denied') showDenied(result.message);
        else if (result.kind === 'pages') await uploadPages(result.pages, method);
      } catch {
        setPickedFile(null);
        setFailure({ message: GENERIC_ERROR_MESSAGE, retryable: false });
        setStep('error');
      }
    });
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

  if (step === 'preparing') {
    return (
      <ScreenContainer scroll={false} contentStyle={{ justifyContent: 'center' }}>
        <ProcessingState title="Preparing your document…" steps={[{ id: 'pdf', label: 'Saving the pages as a PDF', status: 'active' }]} />
      </ScreenContainer>
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

  if (step === 'done' && result && !result.processing) {
    return <StoredResult document={result.document} />;
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
    <ScreenContainer>
      <ScreenHeader title="Add Health Record" onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/home'))} />
      <Text style={[theme.typography.bodyMedium, { color: theme.colors.textTertiary }]}>
        Add a report, prescription or scan. It&rsquo;s stored privately in your Health Memory.
      </Text>
      <View style={{ gap: theme.spacing.sm }} testID="add-record-options">
        {CAPTURE_METHODS.map(({ method, label, description }) => (
          <Card key={method} onPress={() => capture(method)} accessibilityLabel={label}>
            <Row icon={CAPTURE_ICONS[method]} label={label} description={description} testID={`capture-${method}`} />
          </Card>
        ))}
      </View>
      <Text style={[theme.typography.bodySmall, { color: theme.colors.textTertiary }]}>
        Photos and scans are saved as a PDF of the pages, exactly as captured.
      </Text>
      <View style={{ gap: theme.spacing.sm }}>
        <Text style={[theme.typography.labelMedium, { color: theme.colors.textSecondary }]}>More ways</Text>
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

/**
 * After a real upload: the original is stored, then read on the server
 * (consent first) — a PDF from its text, a photo or scan from images of its
 * pages. Either way the results go through the same checks.
 */
function StoredResult({ document }: { document: StoredDocument }) {
  const theme = useTheme();
  const reading = useReadReport(document.id, { autoStart: true });
  const ready = reading.view.kind === 'state' && reading.view.state.phase === 'ready';
  return (
    <ScreenContainer contentStyle={{ justifyContent: 'space-between' }}>
      <View style={{ gap: theme.spacing.md }}>
        <View style={{ alignItems: 'center', gap: theme.spacing.sm }}>
          <SuccessCheck />
          <Text style={[theme.typography.headingLarge, { color: theme.colors.textPrimary, textAlign: 'center' }]} accessibilityRole="header">
            {ready ? 'Added to Health Memory' : 'Stored securely'}
          </Text>
          <Text style={[theme.typography.bodyMedium, { color: theme.colors.textTertiary, textAlign: 'center' }]}>
            {document.originalFilename}
          </Text>
        </View>
        <ReadReportPanel
          view={reading.view}
          onAllow={reading.allow}
          onDecline={reading.decline}
          onRead={reading.read}
          onViewResults={() => router.replace('/(tabs)/health')}
        />
      </View>
      <View style={{ gap: theme.spacing.sm }}>
        <Button label="View document" onPress={() => router.replace(`/documents/${document.id}`)} />
        <SecondaryButton label="Done" onPress={() => router.replace('/(tabs)/home')} />
      </View>
    </ScreenContainer>
  );
}

function Row({
  icon,
  label,
  description,
  testID,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  description?: string;
  testID?: string;
}) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }} testID={testID}>
      <Ionicons name={icon} size={22} color={theme.colors.brandPrimary} />
      <View style={{ flex: 1 }}>
        <Text style={[theme.typography.labelLarge, { color: theme.colors.textPrimary }]}>{label}</Text>
        {description ? <Text style={[theme.typography.bodySmall, { color: theme.colors.textTertiary }]}>{description}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
    </View>
  );
}
