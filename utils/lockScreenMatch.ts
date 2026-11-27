import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../src/firebase';

export type LockScreenMatchPayload = {
  matchId: string;
  title: string;
  sport: string;
  city: string;
  timeLabel: string;
  playersCount: number;
  maxPlayers?: number;
  joinedCode?: string;
};

export const LOCK_SCREEN_MATCH_STORAGE_KEY = '@world_sports_active_lock_match';
export const APP_GROUP_IDENTIFIER = 'group.com.naor823.WorldSports';

export async function syncJoinedMatchToLockWidget(
  userId: string | undefined,
  match: LockScreenMatchPayload | null
) {
  try {
    if (!match) {
      await AsyncStorage.removeItem(LOCK_SCREEN_MATCH_STORAGE_KEY);
      if (userId) {
        await deleteDoc(doc(db, 'users', userId, 'activeMatch', 'current')).catch(() => {});
      }
      return;
    }

    await AsyncStorage.setItem(LOCK_SCREEN_MATCH_STORAGE_KEY, JSON.stringify(match));

    if (userId) {
      await setDoc(
        doc(db, 'users', userId, 'activeMatch', 'current'),
        {
          ...match,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }
  } catch (err) {
    console.error('Error syncing active match for lock widget:', err);
  }
}