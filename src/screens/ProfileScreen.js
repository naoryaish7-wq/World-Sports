import React from 'react';
import { StyleSheet, Text, View, SafeAreaView } from 'react-native';
import PlayerCard from '../components/PlayerCard'; // שים לב לנתיב

export default function ProfileScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.subtitle}>כרטיס השחקן שלך</Text>
      </View>
      
      <PlayerCard 
        username="Diamond_Vibes" 
        overall="88" 
        position="CAM" 
      />
      
      <Text style={styles.instructions}>
        לחץ על הקלף כדי להפוך
      </Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
    alignItems: 'center',
    paddingTop: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 20,
    width: '100%',
  },
  subtitle: {
    fontSize: 20,
    color: '#E8B321', // צבע זהב
    fontWeight: 'bold',
  },
  instructions: {
    color: '#888',
    marginTop: 20,
    fontSize: 14,
  }
});