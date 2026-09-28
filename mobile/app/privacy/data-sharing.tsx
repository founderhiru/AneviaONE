import React, { useEffect, useState } from 'react';
import { Switch, Text, View } from 'react-native';

import { Card, LoadingState, ScreenContainer, ScreenHeader } from '../../components';
import { useTheme } from '../../design/theme';
import { profileService, type DataSharingSetting } from '../../services/profile/profileService';

export default function DataSharingScreen() {
  const theme = useTheme();
  const [settings, setSettings] = useState<DataSharingSetting[] | null>(null);

  useEffect(() => {
    profileService.getDataSharingSettings().then(setSettings);
  }, []);

  async function toggle(id: string, value: boolean) {
    setSettings((prev) => prev?.map((s) => (s.id === id ? { ...s, enabled: value } : s)) ?? prev);
    await profileService.setDataSharingSetting(id, value);
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
    </ScreenContainer>
  );
}
