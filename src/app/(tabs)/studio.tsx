import React from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity } from 'react-native';

export default function StudioScreen() {
  return (
    <View style={styles.container}>
      {/* כותרת עליונה */}
      <View style={styles.header}>
        <Text style={styles.title}>Creator Studio 🎬</Text>
        <Text style={styles.subtitle}>Generate viral matchday posters & highlight reels</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        
        {/* כלי 1: מחולל פוסטרים אוטומטי */}
        <View style={styles.toolCard}>
          <View style={styles.toolBadge}>AI BACKGROUND REMOVAL</View>
          <Text style={styles.toolTitle}>Matchday Poster Generator</Text>
          <Text style={styles.toolDesc}>Upload a photo from your local pitch, automatically remove the background, and place it on a pro Diamond Vibes template.</Text>
          
          <View style={styles.previewBox}>
            <Text style={styles.previewText}>🖼️ Tap to Upload & Generate Poster</Text>
          </View>

          <TouchableOpacity style={styles.actionButton}>
            <Text style={styles.actionButtonText}>Create Matchday Poster</Text>
          </TouchableOpacity>
        </View>

        {/* כלי 2: עורך היילייטס */}
        <View style={styles.toolCard}>
          <View style={[styles.toolBadge, { backgroundColor: '#a855f7' }]}>LIVE STATS STICKER</View>
          <Text style={styles.toolTitle}>Highlight Reels Editor</Text>
          <Text style={styles.toolDesc}>Overlay your live 88 OVR rating badge and stats directly onto your action clips for TikTok & Instagram.</Text>
          
          <TouchableOpacity style={[styles.actionButton, { backgroundColor: '#a855f7' }]}>
            <Text style={styles.actionButtonText}>Edit Video & Add Badge</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', paddingTop: 50 },
  header: { paddingHorizontal: 20, paddingBottom: 15, borderBottomWidth: 1, borderBottomColor: '#222' },
  title: { fontSize: 24, fontWeight: '900', color: '#fff' },
  subtitle: { color: '#888', fontSize: 13, marginTop: 2 },
  scrollContent: { padding: 15 },
  toolCard: { backgroundColor: '#111', borderRadius: 16, padding: 20, marginBottom: 20, borderWidth: 1, borderColor: '#222' },
  toolBadge: { backgroundColor: '#eab308', color: '#000', fontSize: 10, fontWeight: '900', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4, alignSelf: 'flex-start', marginBottom: 10 },
  toolTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 5 },
  toolDesc: { color: '#aaa', fontSize: 13, lineHeight: 18, marginBottom: 15 },
  previewBox: { height: 180, backgroundColor: '#1a1a1a', borderRadius: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#333', borderStyle: 'dashed', marginBottom: 15 },
  previewText: { color: '#666', fontSize: 13, fontWeight: '600' },
  actionButton: { backgroundColor: '#eab308', paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  actionButtonText: { color: '#000', fontWeight: '900', fontSize: 14 }
});