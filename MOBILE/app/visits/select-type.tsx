import React, { useEffect } from 'react';
import { View, Text } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTheme } from '../../context/ThemeContext';

export default function SelectVisitTypeScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{
    clientId?: string;
    clientName?: string;
    siteId?: string;
    siteName?: string;
    plannedId?: string;
    checkInTime?: string;
    checkOutTime?: string;
    customVisitId?: string;
    isCustom?: string;
    customClientName?: string;
    customSiteName?: string;
  }>();

  useEffect(() => {
    const sName = params.siteName || params.customSiteName || '';
    const cName = params.clientName || params.customClientName || '';
    const qp = `clientId=${params.clientId || ''}&clientName=${encodeURIComponent(cName)}&siteId=${params.siteId || ''}&siteName=${encodeURIComponent(sName)}&plannedId=${params.plannedId || ''}&checkInTime=${params.checkInTime || ''}&checkOutTime=${params.checkOutTime || ''}&customVisitId=${params.customVisitId || ''}&isCustom=${params.isCustom || ''}&customClientName=${encodeURIComponent(cName)}&customSiteName=${encodeURIComponent(sName)}`;
    router.replace(`/visits/scan-checklist?${qp}`);
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700' }}>Opening Site QR Scanner...</Text>
    </View>
  );
}
