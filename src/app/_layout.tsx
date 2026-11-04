import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import { Slot } from 'expo-router';
import { AuthProvider } from '../context/AuthContext';
import Purchases from 'react-native-purchases';
import Constants, { ExecutionEnvironment } from 'expo-constants';

export default function RootLayout() {
  useEffect(() => {
    // בדיקה האם אנחנו רצים בסביבת Expo Go או ב-Web
    const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

    if (Platform.OS === 'web' || isExpoGo) {
      console.log('RevenueCat SDK is disabled in Expo Go / Web mode for local development.');
      return;
    }

    // אתחול ספרית התשלומים של RevenueCat בעליית האפליקציה (במכשיר נייטיב אמיתי / Build)
    Purchases.setDebugLogsEnabled(true);

    if (Platform.OS === 'ios') {
      Purchases.configure({ apiKey: 'test_eEmfPazutPANPxEVorKLObvelQe' });
    } else if (Platform.OS === 'android') {
      Purchases.configure({ apiKey: 'test_eEmfPazutPANPxEVorKLObvelQe' });
    }
  }, []);

  return (
    <AuthProvider>
      <Slot />
    </AuthProvider>
  );
}