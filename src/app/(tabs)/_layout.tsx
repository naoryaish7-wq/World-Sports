import React, { useEffect, useState } from 'react';
import { Tabs, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { View, ActivityIndicator, StyleSheet } from 'react-native';

export default function TabLayout() {
  const [isChecking, setIsChecking] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const verifyUser = async () => {
      try {
        const savedEmail = await AsyncStorage.getItem('@saved_user_email');
        if (savedEmail) {
          setIsAuthenticated(true);
        } else {
          setIsAuthenticated(false);
          router.replace('/'); 
        }
      } catch (e) {
        setIsAuthenticated(false);
        router.replace('/');
      } finally {
        setIsChecking(false);
      }
    };

    verifyUser();
  }, []);

  if (isChecking) {
    return (
      <View style={styles.loaderContainer}>
        <ActivityIndicator size="large" color="#eab308" />
      </View>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#0d110f',
          borderTopColor: '#1f2e24',
          height: 60,
          paddingBottom: 8,
        },
        tabBarActiveTintColor: '#eab308',
        tabBarInactiveTintColor: '#888',
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarIcon: (props: any) => (
            <Ionicons name="home" size={props.size} color={props.color} />
          ),
        }}
      />
      <Tabs.Screen
        name="radar"
        options={{
          title: 'Find',
          tabBarIcon: (props: any) => (
            <Ionicons name="football" size={props.size} color={props.color} />
          ),
        }}
      />
      <Tabs.Screen
        name="discover"
        options={{
          title: 'Discover',
          tabBarIcon: (props: any) => (
            <Ionicons name="search" size={props.size} color={props.color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: (props: any) => (
            <Ionicons name="person" size={props.size} color={props.color} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  loaderContainer: {
    flex: 1,
    backgroundColor: '#030703',
    justifyContent: 'center',
    alignItems: 'center',
  },
});