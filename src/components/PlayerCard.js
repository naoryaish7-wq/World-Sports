import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

export default function PlayerCard({ name, rating, pac, sho, pas, dri, def, phy }) {
  const [isFlipped, setIsFlipped] = useState(false);

  return (
    <TouchableOpacity 
      activeOpacity={0.9} 
      onPress={() => setIsFlipped(!isFlipped)} 
      style={styles.cardContainer}
    >
      {!isFlipped ? (
        /* הצד הקדמי: תמונה רגילה של הבן אדם והסטטיסטיקות האישיות */
        <View style={styles.cardFront}>
          <View style={styles.imagePlaceholder}>
            <Text style={styles.imageText}>👤 {name}</Text> 
          </View>

          <Text style={styles.rating}>{rating} OVR</Text>

          <View style={styles.statsContainer}>
            <Text style={styles.statText}>PAC {pac}</Text>
            <Text style={styles.statText}>DRI {dri}</Text>
            <Text style={styles.statText}>SHO {sho}</Text>
            <Text style={styles.statText}>DEF {def}</Text>
            <Text style={styles.statText}>PAS {pas}</Text>
            <Text style={styles.statText}>PHY {phy}</Text>
          </View>
          <Text style={styles.flipHint}>✨ Tap to flip (In-Form AI Mode)</Text>
        </View>
      ) : (
        /* הצד האחורי: תמונה/אנימציה מגניבה של השחקן עצמו במצב AI / In-Form */
        <View style={styles.cardBack}>
          <View style={styles.aiImagePlaceholder}>
            <Text style={styles.aiBadge}>🔥 IN-FORM</Text>
            <Text style={styles.aiImageText}>⚡ {name} AI ⚡</Text>
            <Text style={styles.aiSubText}>Ultimate Energy Mode</Text>
          </View>
          <Text style={styles.ratingBack}>{rating + 3} OVR</Text>
          <Text style={styles.flipHintBack}>🔄 Tap to flip back</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  cardContainer: { width: 220, height: 320 },
  cardFront: { flex: 1, backgroundColor: '#eab308', padding: 20, borderRadius: 16, alignItems: 'center', justifyContent: 'space-between', elevation: 5, borderWidth: 2, borderColor: '#fef08a' },
  cardBack: { flex: 1, backgroundColor: '#1a0033', padding: 20, borderRadius: 16, alignItems: 'center', justifyContent: 'space-between', elevation: 5, borderWidth: 2, borderColor: '#a855f7' },
  imagePlaceholder: { width: 80, height: 80, backgroundColor: '#fcd34d', borderRadius: 40, justifyContent: 'center', alignItems: 'center', marginTop: 10 },
  imageText: { fontWeight: '900', fontSize: 14, color: '#333' },
  rating: { fontSize: 22, fontWeight: '900', color: '#000' },
  statsContainer: { flexDirection: 'row', flexWrap: 'wrap', width: 160, justifyContent: 'space-between' },
  statText: { width: '45%', fontWeight: 'bold', marginVertical: 2, fontSize: 13, color: '#000' },
  aiImagePlaceholder: { width: '100%', height: 180, backgroundColor: '#2e004f', borderRadius: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#c084fc', marginTop: 5 },
  aiBadge: { backgroundColor: '#a855f7', color: '#fff', fontSize: 10, fontWeight: '900', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, marginBottom: 10 },
  aiImageText: { color: '#fff', fontSize: 18, fontWeight: '900', fontStyle: 'italic' },
  aiSubText: { color: '#d8b4fe', fontSize: 11, marginTop: 5 },
  ratingBack: { fontSize: 24, fontWeight: '900', color: '#a855f7' },
  flipHint: { fontSize: 10, color: '#555', fontWeight: 'bold', marginBottom: 5 },
  flipHintBack: { fontSize: 10, color: '#888', fontWeight: 'bold', marginBottom: 5 }
});