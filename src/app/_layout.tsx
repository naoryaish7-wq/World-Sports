import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import { Slot } from 'expo-router';
import { AuthProvider } from '../context/AuthContext';
import Purchases from 'react-native-purchases';

export default function RootLayout() {
  useEffect(() => {
    // אתחול ספרית התשלומים של RevenueCat בעליית האפליקציה
    Purchases.setDebugLogsEnabled(true); // מומלץ לשלב בזמן פיתוח ובדיקות

    // אתחול לפי פלטפורמה (יש להחליף מחר במפתחות האמיתיים שתקבל מ-RevenueCat)
    if (Platform.OS === 'ios') {
      Purchases.configure({ apiKey: 'appl_your_ios_api_key_here' });
    } else if (Platform.OS === 'android') {
      Purchases.configure({ apiKey: 'goog_your_android_api_key_here' });
    }
  }, []);

  return (
    <AuthProvider>
      <Slot />
    </AuthProvider>
  );
}