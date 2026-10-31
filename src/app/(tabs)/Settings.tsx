import React, { useState } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Alert, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function SettingsScreen({ navigation, onLogout }: { navigation?: any; onLogout?: () => void }) {
  const [accountType, setAccountType] = useState('Personal');

  const handleLogout = async () => {
    Alert.alert('התנתקות', 'האם אתה בטוח שתרצה להתנתק מהחשבון?', [
      { text: 'ביטול', style: 'cancel' },
      { 
        text: 'התנתק', 
        style: 'destructive', 
        onPress: async () => {
          await AsyncStorage.removeItem('@saved_user_email');
          if (onLogout) onLogout();
        } 
      }
    ]);
  };

  const renderSectionHeader = (title: string) => (
    <Text style={styles.sectionHeader}>{title}</Text>
  );

  const renderSettingItem = (
    icon: keyof typeof Ionicons.glyphMap, 
    title: string, 
    value?: string, 
    onPress?: () => void, 
    isDestructive: boolean = false
  ) => (
    <TouchableOpacity style={styles.settingItem} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.settingLeft}>
        <Ionicons name={icon} size={20} color={isDestructive ? '#EF4444' : '#FAFAFA'} style={styles.settingIcon} />
        <Text style={[styles.settingText, isDestructive && { color: '#EF4444' }]}>{title}</Text>
      </View>
      <View style={styles.settingRight}>
        {value ? <Text style={styles.settingValue}>{value}</Text> : null}
        <Ionicons name="chevron-forward" size={16} color="#71717A" />
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* כותרת עליונה */}
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => navigation?.goBack ? navigation.goBack() : null} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color="#FAFAFA" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings and activity</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        
        {/* חיפוש בהגדרות */}
        <TouchableOpacity style={styles.searchBar} activeOpacity={0.8}>
          <Ionicons name="search" size={18} color="#71717A" style={{ marginRight: 8 }} />
          <Text style={styles.searchText}>Search</Text>
        </TouchableOpacity>

        {/* Your account */}
        {renderSectionHeader('Your account')}
        {renderSettingItem('person-outline', 'Meta Account', 'Password, security, personal details', () => {
          Alert.alert('Meta Account', 'ניהול פרטי חשבון אבטחה ופרופיל.');
        })}

        {/* How you use your app */}
        {renderSectionHeader('How you use World Sports')}
        {renderSettingItem('bookmark-outline', 'Saved', '', () => Alert.alert('Saved', 'הפוסטים השמורים שלך.'))}
        {renderSettingItem('time-outline', 'Your activity', '', () => Alert.alert('Your activity', 'ניהול זמן מסך ופעילות.'))}
        {renderSettingItem('notifications-outline', 'Notifications', 'On', () => Alert.alert('Notifications', 'הגדרות התראות פוש.'))}
        {renderSettingItem('moon-outline', 'Time management', '', () => Alert.alert('Time management', 'הגבלת שימוש יומית.'))}

        {/* Who can see your content */}
        {renderSectionHeader('Who can see your content')}
        {renderSettingItem('lock-closed-outline', 'Account privacy', 'Public', () => Alert.alert('Privacy', 'שינוי סטטוס חשבון לציבורי או פרטי.'))}
        {renderSettingItem('people-outline', 'Close Friends', '0', () => Alert.alert('Close Friends', 'ניהול רשימת חברים קרובים.'))}
        {renderSettingItem('eye-off-outline', 'Hide story and live', '', () => Alert.alert('Hide', 'הסתרת סטטוסים ושידורים.'))}

        {/* How others can interact with you */}
        {renderSectionHeader('How others can interact with you')}
        {renderSettingItem('chatbubble-outline', 'Messages and story replies', '', () => Alert.alert('Messages', 'הגדרות מי יכול לשלוח הודעות.'))}
        {renderSettingItem('at-outline', 'Tags and mentions', '', () => Alert.alert('Tags', 'ניהול תיוגים בפסטים ובסטורי.'))}
        {renderSettingItem('chatbubbles-outline', 'Comments', '', () => Alert.alert('Comments', 'סינון תגובות פוגעניות.'))}

        {/* Your app and media */}
        {renderSectionHeader('Your app and media')}
        {renderSettingItem('phone-portrait-outline', 'Device permissions', '', () => Alert.alert('Permissions', 'גישה למצלמה, מיקום ונוטיפיקציות.'))}
        {renderSettingItem('language-outline', 'Language and translations', 'English', () => Alert.alert('Language', 'שינוי שפת האפליקציה.'))}
        {renderSettingItem('cellular-outline', 'Media quality', '', () => Alert.alert('Media Quality', 'איכות העלאת תמונות וסרטונים.'))}

        {/* More info and support */}
        {renderSectionHeader('More info and support')}
        {renderSettingItem('help-circle-outline', 'Help', '', () => Linking.openURL('https://support.google.com'))}
        {renderSettingItem('shield-checkmark-outline', 'Privacy Center', '', () => Linking.openURL('https://privacy.google.com'))}
        {renderSettingItem('information-circle-outline', 'About', '', () => Alert.alert('About World Sports', 'גרסה 1.0.0 - כל הזכויות שמורות.'))}

        {/* Login / Logout */}
        {renderSectionHeader('Login')}
        {renderSettingItem('log-out-outline', 'Log out', '', handleLogout, true)}

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#09090B' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 50, paddingBottom: 12, backgroundColor: '#121215', borderBottomWidth: 1, borderBottomColor: '#27272A' },
  backButton: { padding: 4 },
  headerTitle: { color: '#FAFAFA', fontSize: 16, fontWeight: 'bold' },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 40 },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#18181B', borderRadius: 10, paddingHorizontal: 12, height: 40, marginVertical: 14, borderWidth: 1, borderColor: '#27272A' },
  searchText: { color: '#71717A', fontSize: 14 },
  sectionHeader: { color: '#71717A', fontSize: 13, fontWeight: '700', marginTop: 20, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  settingItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: '#18181B' },
  settingLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 10 },
  settingIcon: { marginRight: 14, width: 22 },
  settingText: { color: '#FAFAFA', fontSize: 14, fontWeight: '500' },
  settingRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  settingValue: { color: '#71717A', fontSize: 12 }
});