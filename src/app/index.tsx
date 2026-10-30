import React, { useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ScrollView, Alert, KeyboardAvoidingView, Platform, Modal, FlatList, Dimensions } from 'react-native';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { router } from 'expo-router';
import { Ionicons, FontAwesome } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';

const { width } = Dimensions.get('window');
const SPORTS_LIST = ['Football ⚽', 'Basketball 🏀', 'Tennis 🎾', 'Running 🏃‍♂️', 'Fitness 💪', 'Cycling 🚴‍♂️', 'Swimming 🏊‍♂️'];

// פונקציית עזר מדויקת לחישוב גיל מתוך תאריך לידה (YYYY-MM-DD)
const calculateAge = (birthDateString: string) => {
  if (!birthDateString) return null;
  
  const parts = birthDateString.split('-');
  if (parts.length !== 3) return null;

  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1; 
  const day = parseInt(parts[2], 10);

  if (isNaN(year) || isNaN(month) || isNaN(day)) return null;

  const birthDate = new Date(year, month, day);
  const today = new Date();

  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }

  return age >= 0 ? age : null;
};

export default function LoginScreen() {
  const { login, register } = useAuth();

  const [isLoginMode, setIsLoginMode] = useState(false); 
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState(''); 
  const [birthDate, setBirthDate] = useState(''); 
  
  const [selectedSports, setSelectedSports] = useState<string[]>([]);
  const [isSportModalVisible, setIsSportModalVisible] = useState(false);

  const handleSwitchMode = async (loginMode: boolean) => {
    setIsLoginMode(loginMode);
    if (loginMode && email.trim()) {
      try {
        const cleanEmail = email.trim().toLowerCase();
        const userId = cleanEmail.replace(/[^a-z0-9]/g, '_');
        const userSnap = await getDoc(doc(db, 'users', userId));
        if (userSnap.exists()) {
          const data = userSnap.data();
          if (data.sports && Array.isArray(data.sports)) {
            setSelectedSports(data.sports);
          }
        }
      } catch (e) {
        console.error('Error fetching user existing sports', e);
      }
    }
  };

  const toggleSportSelection = (sport: string) => {
    if (selectedSports.includes(sport)) {
      setSelectedSports(selectedSports.filter(s => s !== sport));
    } else {
      setSelectedSports([...selectedSports, sport]);
    }
  };

  const handleAuth = async () => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const cleanEmail = email.trim().toLowerCase();

    if (!emailRegex.test(cleanEmail)) {
      Alert.alert('Invalid Email', 'Please enter a valid email address.');
      return;
    }

    if (!password || password.length < 6) {
      Alert.alert('Password Required', 'Please enter a password of at least 6 characters.');
      return;
    }

    const userId = cleanEmail.replace(/[^a-z0-9]/g, '_');

    if (isLoginMode) {
      // Login Mode
      try {
        await login(cleanEmail, password);

        if (selectedSports.length > 0) {
          await setDoc(doc(db, 'users', userId), {
            sports: selectedSports,
          }, { merge: true });
        }
        
        router.replace('/(tabs)/home');
      } catch (error: any) {
        console.error(error);
        Alert.alert('Login Error', error?.message || 'Could not log in. Check your credentials.');
      }
    } else {
      // Sign Up Mode
      const trimmedName = name.trim();
      
      if (!trimmedName || !birthDate.trim()) {
        Alert.alert('Error', 'Please fill in your name and birth date.');
        return;
      }

      const userAge = calculateAge(birthDate.trim());
      if (userAge === null || userAge < 0 || userAge > 120) {
        Alert.alert('Invalid Birth Date', 'Please enter a valid birth date in YYYY-MM-DD format.');
        return;
      }

      const validUsernameRegex = /^[a-zA-Z0-9_\-\.]+$/;
      if (!validUsernameRegex.test(trimmedName)) {
        Alert.alert('Invalid Username', 'Username cannot contain spaces or forbidden special characters.');
        return;
      }

      if (selectedSports.length === 0) {
        Alert.alert('Sports Required', 'Please select at least one favorite sport.');
        return;
      }

      try {
        await register(cleanEmail, password, trimmedName);

        await setDoc(doc(db, 'users', userId), {
          name: trimmedName,
          email: cleanEmail,
          birthDate: birthDate.trim(),
          age: userAge,
          sports: selectedSports,
        }, { merge: true });
        
        router.replace('/(tabs)/home');
      } catch (error: any) {
        console.error(error);
        Alert.alert('Registration Error', error?.message || 'Could not create account.');
      }
    }
  };

  const handleGoogleLogin = () => {
    Alert.alert('Google Sign-In', 'Connecting with Google...');
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* Header Branding */}
        <View style={styles.heroSection}>
          <View style={styles.badgeIconBox}>
            <Ionicons name="trophy" size={32} color="#EAB308" />
          </View>
          <Text style={styles.title}>WORLD SPORTS</Text>
          <Text style={styles.subtitle}>
            {isLoginMode ? 'Welcome back, champion! Ready to dominate?' : 'Join the global community of elite athletes'}
          </Text>
        </View>

        {/* Mode Switcher Tabs */}
        <View style={styles.modeSwitchRow}>
          <TouchableOpacity 
            style={[styles.modeTab, !isLoginMode && styles.modeTabActive]} 
            onPress={() => handleSwitchMode(false)}
            activeOpacity={0.8}
          >
            <Ionicons name="person-add-outline" size={16} color={!isLoginMode ? '#EAB308' : '#71717A'} style={{ marginRight: 6 }} />
            <Text style={[styles.modeTabText, !isLoginMode && styles.modeTabTextActive]}>Sign Up</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.modeTab, isLoginMode && styles.modeTabActive]} 
            onPress={() => handleSwitchMode(true)}
            activeOpacity={0.8}
          >
            <Ionicons name="log-in-outline" size={16} color={isLoginMode ? '#EAB308' : '#71717A'} style={{ marginRight: 6 }} />
            <Text style={[styles.modeTabText, isLoginMode && styles.modeTabTextActive]}>Log In</Text>
          </TouchableOpacity>
        </View>

        {/* Main Form Card */}
        <View style={styles.formBox}>
          {!isLoginMode && (
            <View style={styles.inputGroup}>
              <Text style={styles.label}>USERNAME / FULL NAME</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="person-outline" size={18} color="#71717A" style={styles.inputIcon} />
                <TextInput 
                  style={styles.input} 
                  placeholder="e.g. David_Levi" 
                  placeholderTextColor="#52525B" 
                  value={name} 
                  onChangeText={setName} 
                  autoCapitalize="none" 
                />
              </View>
            </View>
          )}

          <View style={styles.inputGroup}>
            <Text style={styles.label}>EMAIL ADDRESS</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="mail-outline" size={18} color="#71717A" style={styles.inputIcon} />
              <TextInput 
                style={styles.input} 
                placeholder="player@gmail.com" 
                placeholderTextColor="#52525B" 
                value={email} 
                onChangeText={setEmail} 
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>PASSWORD</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed-outline" size={18} color="#71717A" style={styles.inputIcon} />
              <TextInput 
                style={styles.input} 
                placeholder="At least 6 characters" 
                placeholderTextColor="#52525B" 
                secureTextEntry 
                value={password} 
                onChangeText={setPassword} 
                autoCapitalize="none" 
              />
            </View>
          </View>

          {!isLoginMode && (
            <View style={styles.inputGroup}>
              <Text style={styles.label}>BIRTH DATE (YYYY-MM-DD)</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="calendar-outline" size={18} color="#71717A" style={styles.inputIcon} />
                <TextInput 
                  style={styles.input} 
                  placeholder="2007-01-01" 
                  placeholderTextColor="#52525B" 
                  value={birthDate} 
                  onChangeText={setBirthDate} 
                />
              </View>
            </View>
          )}

          <View style={styles.inputGroup}>
            <Text style={styles.label}>{isLoginMode ? 'UPDATE SPORTS (OPTIONAL)' : 'FAVORITE SPORTS'}</Text>
            <TouchableOpacity style={styles.sportDropdownBtn} onPress={() => setIsSportModalVisible(true)} activeOpacity={0.8}>
              <Ionicons name="football-outline" size={18} color="#EAB308" style={styles.inputIcon} />
              <Text style={[styles.sportDropdownText, selectedSports.length === 0 && { color: '#52525B' }]} numberOfLines={1}>
                {selectedSports.length > 0 ? selectedSports.join(', ') : 'Select your favorite sports...'}
              </Text>
              <Ionicons name="chevron-forward" size={16} color="#71717A" />
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={[styles.btn, { marginTop: 10 }]} onPress={handleAuth} activeOpacity={0.85}>
            <Text style={styles.btnText}>
              {isLoginMode ? 'LOG IN & UPDATE 🚀' : 'CREATE ACCOUNT & ENTER 🌍'}
            </Text>
          </TouchableOpacity>

          <View style={styles.dividerRow}>
            <View style={styles.line} />
            <Text style={styles.dividerText}>OR</Text>
            <View style={styles.line} />
          </View>

          <TouchableOpacity style={styles.googleBtn} onPress={handleGoogleLogin} activeOpacity={0.85}>
            <FontAwesome name="google" size={18} color="#FAFAFA" style={{ marginRight: 10 }} />
            <Text style={styles.googleBtnText}>Continue with Google</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>

      {/* Modern Sports Selection Modal */}
      <Modal visible={isSportModalVisible} transparent={true} animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalIndicator} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Your Sports 🏅</Text>
              <TouchableOpacity onPress={() => setIsSportModalVisible(false)} style={styles.closeModalBtn}>
                <Ionicons name="close" size={20} color="#FAFAFA" />
              </TouchableOpacity>
            </View>

            <FlatList
              data={SPORTS_LIST}
              keyExtractor={(item) => item}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => {
                const isSelected = selectedSports.includes(item);
                return (
                  <TouchableOpacity 
                    style={[styles.modalItem, isSelected && styles.modalItemActive]} 
                    onPress={() => toggleSportSelection(item)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.modalItemText, isSelected && styles.modalItemTextActive]}>{item}</Text>
                    <View style={[styles.checkboxCircle, isSelected && styles.checkboxCircleActive]}>
                      {isSelected && <Ionicons name="checkmark" size={14} color="#09090B" />}
                    </View>
                  </TouchableOpacity>
                );
              }}
            />

            <TouchableOpacity style={styles.modalDoneBtn} onPress={() => setIsSportModalVisible(false)} activeOpacity={0.85}>
              <Text style={styles.modalDoneBtnText}>Confirm Selection ✓</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#09090B' },
  scrollContent: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  
  heroSection: { alignItems: 'center', marginBottom: 25 },
  badgeIconBox: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#18181B', borderWidth: 1, borderColor: '#27272A', justifyContent: 'center', alignItems: 'center', marginBottom: 12, shadowColor: '#EAB308', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.2, shadowRadius: 10, elevation: 5 },
  title: { fontSize: 24, fontWeight: '900', color: '#FAFAFA', fontStyle: 'italic', letterSpacing: 1 },
  subtitle: { fontSize: 13, color: '#A1A1AA', textAlign: 'center', marginTop: 6, paddingHorizontal: 20 },
  
  modeSwitchRow: { flexDirection: 'row', backgroundColor: '#121215', borderRadius: 14, padding: 4, borderWidth: 1, borderColor: '#27272A', marginBottom: 20 },
  modeTab: { flex: 1, flexDirection: 'row', paddingVertical: 12, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  modeTabActive: { backgroundColor: '#18181B', borderWidth: 1, borderColor: '#3F3F46' },
  modeTabText: { color: '#71717A', fontWeight: '700', fontSize: 13 },
  modeTabTextActive: { color: '#EAB308' },

  formBox: { backgroundColor: '#121215', padding: 20, borderRadius: 20, borderWidth: 1, borderColor: '#27272A', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 8 },
  inputGroup: { marginBottom: 16 },
  label: { color: '#A1A1AA', fontSize: 11, fontWeight: '800', marginBottom: 6, letterSpacing: 0.5 },
  
  inputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#09090B', borderWidth: 1, borderColor: '#27272A', borderRadius: 12, height: 50, paddingHorizontal: 14 },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, color: '#FAFAFA', fontSize: 14 },
  
  sportDropdownBtn: { backgroundColor: '#09090B', borderWidth: 1, borderColor: '#27272A', borderRadius: 12, height: 50, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14 },
  sportDropdownText: { color: '#FAFAFA', fontSize: 14, flex: 1, marginLeft: 10, marginRight: 10 },

  btn: { backgroundColor: '#EAB308', borderRadius: 12, height: 52, justifyContent: 'center', alignItems: 'center', shadowColor: '#EAB308', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 },
  btnText: { color: '#09090B', fontWeight: '900', fontSize: 15, letterSpacing: 0.5 },

  dividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 18 },
  line: { flex: 1, height: 1, backgroundColor: '#27272A' },
  dividerText: { color: '#71717A', fontSize: 12, fontWeight: '700', marginHorizontal: 10 },

  googleBtn: { backgroundColor: '#18181B', borderRadius: 12, height: 52, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#27272A' },
  googleBtnText: { color: '#FAFAFA', fontWeight: '700', fontSize: 14 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#121215', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, height: '60%', borderWidth: 1, borderColor: '#27272A' },
  modalIndicator: { width: 40, height: 4, backgroundColor: '#3F3F46', borderRadius: 2, alignSelf: 'center', marginBottom: 15 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { color: '#FAFAFA', fontSize: 18, fontWeight: '800' },
  closeModalBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#18181B', justifyContent: 'center', alignItems: 'center' },
  
  modalItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#09090B', padding: 16, borderRadius: 14, marginBottom: 10, borderWidth: 1, borderColor: '#27272A' },
  modalItemActive: { backgroundColor: '#18181B', borderColor: '#EAB308' },
  modalItemText: { color: '#D4D4D8', fontSize: 14, fontWeight: '600' },
  modalItemTextActive: { color: '#EAB308', fontWeight: '700' },
  
  checkboxCircle: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#3F3F46', justifyContent: 'center', alignItems: 'center' },
  checkboxCircleActive: { backgroundColor: '#EAB308', borderColor: '#EAB308' },

  modalDoneBtn: { backgroundColor: '#EAB308', borderRadius: 14, height: 50, justifyContent: 'center', alignItems: 'center', marginTop: 15 },
  modalDoneBtnText: { color: '#09090B', fontWeight: '900', fontSize: 15 }
});