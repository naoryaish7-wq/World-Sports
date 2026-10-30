import React, { useState, useEffect } from 'react';
import { I18nManager, View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ייבוא ספריות השפה
import { getLocales } from 'expo-localization';
import { I18n } from 'i18n-js';

import ProfileScreen from './src/screens/ProfileScreen';
import LoginScreen from './index'; // <-- כאן משנים לפי המיקום של קובץ ה־index שלך (למשל './index' או './src/index')

// הגדרת המילון שלנו
const translations = {
  en: {
    feed: 'Feed',
    radar: 'Radar',
    studio: 'Studio',
    profile: 'Profile',
    placeholder: 'Screen Coming Soon'
  },
  he: {
    feed: 'פיד',
    radar: 'ראדאר',
    studio: 'יצירה',
    profile: 'פרופיל',
    placeholder: 'המסך יעלה בקרוב'
  }
};

const i18n = new I18n(translations);
const deviceLanguage = getLocales()[0].languageCode;
i18n.locale = deviceLanguage;
i18n.enableFallback = true;

const isRTL = i18n.locale === 'he' || i18n.locale === 'ar';
I18nManager.allowRTL(isRTL);
I18nManager.forceRTL(isRTL);

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const FeedScreen = () => <View style={styles.placeholder}><Text style={styles.text}>{i18n.t('placeholder')}</Text></View>;
const RadarScreen = () => <View style={styles.placeholder}><Text style={styles.text}>{i18n.t('placeholder')}</Text></View>;
const StudioScreen = () => <View style={styles.placeholder}><Text style={styles.text}>{i18n.t('placeholder')}</Text></View>;

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerStyle: { backgroundColor: '#1E1E1E' },
        headerTintColor: '#FFF',
        headerTitleStyle: { fontWeight: 'bold' },
        tabBarStyle: {
          backgroundColor: '#1E1E1E',
          borderTopWidth: 0,
          height: 60,
          paddingBottom: 10,
        },
        tabBarActiveTintColor: '#E8B321',
        tabBarInactiveTintColor: '#888',
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;
          if (route.name === i18n.t('feed')) iconName = focused ? 'home' : 'home-outline';
          else if (route.name === i18n.t('radar')) iconName = focused ? 'map' : 'map-outline';
          else if (route.name === i18n.t('studio')) iconName = focused ? 'add-circle' : 'add-circle-outline';
          else if (route.name === i18n.t('profile')) iconName = focused ? 'person' : 'person-outline';
          
          return <Ionicons name={iconName} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name={i18n.t('feed')} component={FeedScreen} options={{ title: 'World SPORT' }} />
      <Tab.Screen name={i18n.t('radar')} component={RadarScreen} />
      <Tab.Screen name={i18n.t('studio')} component={StudioScreen} />
      <Tab.Screen name={i18n.t('profile')} component={ProfileScreen} options={{ headerShown: false }} />
    </Tab.Navigator>
  );
}

export default function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [userLoggedIn, setUserLoggedIn] = useState(false);

  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        const savedEmail = await AsyncStorage.getItem('@saved_user_email');
        if (savedEmail) {
          setUserLoggedIn(true);
        } else {
          setUserLoggedIn(false);
        }
      } catch (e) {
        setUserLoggedIn(false);
      } finally {
        setIsLoading(false);
      }
    };

    checkAuthStatus();
  }, []);

  if (isLoading) {
    return (
      <View style={styles.loaderContainer}>
        <ActivityIndicator size="large" color="#E8B321" />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          {userLoggedIn ? (
            <Stack.Screen name="MainApp" component={MainTabs} />
          ) : (
            <Stack.Screen name="Login" component={LoginScreen} />
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#121212',
  },
  text: {
    color: '#FFF',
    fontSize: 24,
    fontWeight: 'bold',
  },
  loaderContainer: {
    flex: 1,
    backgroundColor: '#030703',
    justifyContent: 'center',
    alignItems: 'center',
  }
});