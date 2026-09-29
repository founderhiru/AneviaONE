import React, { useEffect, useState } from 'react';
import { Switch, Text, View } from 'react-native';

import { Card, LoadingState, ScreenContainer, ScreenHeader } from '../../components';
import { useTheme } from '../../design/theme';
import { profileService, type DataSharingSetting } from '../../services/profile/profileService';
import { GENERIC_ERROR_MESSAGE, ServiceError } from '../../services/serviceError';

export default function DataSharingScreen() {
  const theme = useTheme();
  const [settings, setSettings] = useState<DataSharingSetting[] | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    profileService.getDataSharingSettings().then(setSettings);
  }, []);

  async function toggle(id: string, value: boolean) {
    setSaveError(null);
    setSettings((prev) => prev?.map((s) => (s.id === id ? { ...s, enabled: value } : s)) ?? prev);
    try {
      await profileService.setDataSharingSetting(id, value);
    } catch (error) {
      // Never show a preference as saved when it wasn't.
      setSettings((prev) => prev?.map((s) => (s.id === id ? { ...s, enabled: !value } : s)) ?? prev);
      setSaveError(error instanceof ServiceError ? error.userMessage : GENERIC_ERROR_MESSAGE);
    }
  }

  return (
    <ScreenContainer>
      <ScreenHeader title="Data Sharing" />
      {settings === null ? (
        <LoadingState label="Loading settings…" />
      ) : (
        settings.map((setting) => (
          <Card key={setting.id}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: theme.spacing.sm }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[theme.typography.labelLarge, { color: theme.colors.textPrimary }]}>{setting.label}</Text>
                <Text style={[theme.typography.bodySmall, { color: theme.colors.textTertiary }]}>{setting.description}</Text>
              </View>
              <Switch
                value={setting.enabled}
                onValueChange={(value) => toggle(setting.id, value)}
                trackColor={{ true: theme.colors.brandPrimary, false: theme.colors.border }}
                accessibilityLabel={setting.label}
              />
            </View>
          </Card>
        ))
      )}
      {saveError ? (
        <Text style={[theme.typography.bodySmall, { color: theme.colors.danger }]} accessibilityLiveRegion="polite">
          {saveError}
        </Text>
      ) : null}
    </ScreenContainer>
  );
}
