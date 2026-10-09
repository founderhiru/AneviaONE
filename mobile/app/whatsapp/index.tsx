import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Button, Card, LoadingState, ScreenContainer, ScreenHeader, SecondaryButton, StatusBadge, TextInput } from '../../components';
import { useTheme } from '../../design/theme';
import { useAuth } from '../../hooks/useAuth';
import { whatsappService } from '../../services/whatsapp/whatsappService';
import type { WhatsAppConnection } from '../../types';

export default function WhatsAppScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const [connection, setConnection] = useState<WhatsAppConnection | null>(null);
  const [mobileNumber, setMobileNumber] = useState(user?.mobileNumber ?? '');
  const [connecting, setConnecting] = useState(false);
  const [errorText, setErrorText] = useState<string | undefined>();

  useEffect(() => {
    whatsappService.getConnectionStatus().then(setConnection);
  }, []);

  async function handleConnect() {
    setErrorText(undefined);
    setConnecting(true);
    const result = await whatsappService.connect(mobileNumber);
    setConnecting(false);
    if (!result.success) {
      setErrorText(result.errorMessage);
      return;
    }
    setConnection(result.connection);
  }

  async function handleDisconnect() {
    await whatsappService.disconnect();
    setConnection({ status: 'not_connected' });
  }

  if (connection === null) {
    return (
      <ScreenContainer>
        <ScreenHeader title="Connect WhatsApp" />
        <LoadingState label="Checking connection status…" />
      </ScreenContainer>
    );
  }

  const isConnected = connection.status === 'connected';

  return (
    <ScreenContainer>
      <ScreenHeader title="Connect WhatsApp" />

      {!whatsappService.isProductionReady() ? (
        <View
          style={{
            backgroundColor: theme.colors.warningSubtle,
            borderRadius: theme.radius.sm,
            padding: theme.spacing.sm,
          }}
        >
          <Text style={[theme.typography.bodySmall, { color: theme.colors.warning }]}>
            Preview only — sending reports through WhatsApp isn&rsquo;t switched on yet.
          </Text>
        </View>
      ) : null}

      <Text style={[theme.typography.bodyMedium, { color: theme.colors.textSecondary }]}>
        Send health reports directly to your Health Memory through WhatsApp.
      </Text>

      {isConnected ? (
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, marginBottom: theme.spacing.sm }}>
            <Ionicons name="logo-whatsapp" size={28} color={theme.colors.success} />
            <View>
              <Text style={[theme.typography.labelLarge, { color: theme.colors.textPrimary }]}>WhatsApp</Text>
              <StatusBadge label="Connected" tone="success" />
            </View>
          </View>
          <Text style={[theme.typography.bodyMedium, { color: theme.colors.textSecondary }]}>
            You can now send reports to your Health Memory from {connection.maskedNumber}.
          </Text>
          <View style={{ flexDirection: 'row', gap: theme.spacing.sm, marginTop: theme.spacing.sm }}>
            <SecondaryButton label="Disconnect" onPress={handleDisconnect} fullWidth={false} />
          </View>
        </Card>
      ) : (
        <>
          <Card>
            <Text style={[theme.typography.labelLarge, { color: theme.colors.textPrimary, marginBottom: theme.spacing.xs }]}>
              What WhatsApp can do
            </Text>
            <BulletRow text="Send health documents from a chat you already use" />
            <BulletRow text="Receive processing notifications" />
            <BulletRow text="Later, ask quick questions about your health" />
          </Card>
          <Card>
            <Text style={[theme.typography.labelLarge, { color: theme.colors.textPrimary, marginBottom: theme.spacing.xs }]}>
              What WhatsApp can&rsquo;t do
            </Text>
            <BulletRow text="It won't show sensitive health details in notifications" />
            <BulletRow text="It won't share your data with anyone else" />
          </Card>
          <Card>
            <Text style={[theme.typography.bodySmall, { color: theme.colors.textTertiary }]}>
              Notifications stay generic, e.g. &ldquo;Your health report has been processed.&rdquo; with an
              &ldquo;Open in app&rdquo; action — never the details themselves.
            </Text>
          </Card>

          <TextInput
            label="Mobile number to connect"
            placeholder="98765 43210"
            keyboardType="phone-pad"
            value={mobileNumber}
            onChangeText={setMobileNumber}
            errorText={errorText}
          />
          <Button label="Connect WhatsApp" onPress={handleConnect} loading={connecting} disabled={mobileNumber.length < 10} />
        </>
      )}
    </ScreenContainer>
  );
}

function BulletRow({ text }: { text: string }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: theme.spacing.xs, marginBottom: 4 }}>
      <Text style={{ color: theme.colors.textTertiary }}>•</Text>
      <Text style={[theme.typography.bodySmall, { color: theme.colors.textSecondary, flex: 1 }]}>{text}</Text>
    </View>
  );
}
