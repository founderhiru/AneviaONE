import React, { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { useTheme } from '../../design/theme';
import { custodyService, noticeText, type AccountNotice } from '../../services/custody/custodyService';
import { SecondaryButton } from '../SecondaryButton';
import { Card } from '../Card';

/**
 * Short in-app notices, e.g. "Your access to Dad's records ended because an account was deleted".
 * No health content; nothing is sent outside the app. Shows nothing when there is nothing to say.
 */
export function NoticesCard() {
  const theme = useTheme();
  const [notices, setNotices] = useState<AccountNotice[]>([]);

  useEffect(() => {
    let live = true;
    custodyService
      .listNotices()
      .then((list) => live && setNotices(list.filter((n) => !n.read)))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  const dismiss = useCallback(async (id: string) => {
    setNotices((prev) => prev.filter((n) => n.id !== id));
    await custodyService.markNoticeRead(id).catch(() => undefined);
  }, []);

  if (notices.length === 0) return null;
  return (
    <View style={{ gap: theme.spacing.xs }} testID="notices">
      {notices.map((n) => (
        <Card key={n.id}>
          <View style={{ gap: theme.spacing.xs }}>
            <Text style={[theme.typography.bodyMedium, { color: theme.colors.textPrimary }]} testID={`notice-${n.id}`}>{noticeText(n)}</Text>
            <SecondaryButton label="Dismiss" onPress={() => dismiss(n.id)} testID={`notice-dismiss-${n.id}`} />
          </View>
        </Card>
      ))}
    </View>
  );
}
