import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Image, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db } from '../firebase';
import AsyncStorage from '@react-native-async-storage/async-storage';

type NotificationItem = {
  id: string;
  senderUid?: string;
  type: 'like' | 'comment' | 'follow_request' | 'follow' | 'post' | 'story' | 'message' | 'new_post_story' | 'game_join' | 'game_leave' | 'game_deleted' | 'game_update' | 'game_chat' | 'game_created';
  message: string;
  createdAt?: any;
  status?: 'pending' | 'accepted' | 'rejected';
  gameId?: string; // מזהה המשחק במידת הרלוונטיות
};

const getTimeAgo = (timestamp: any) => {
  if (!timestamp) return 'Just now';
  try {
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
    
    let interval = seconds / 31536000;
    if (interval > 1) return `${Math.floor(interval)}y ago`;
    interval = seconds / 2592000;
    if (interval > 1) return `${Math.floor(interval)}mo ago`;
    interval = seconds / 86400;
    if (interval > 1) return `${Math.floor(interval)}d ago`;
    interval = seconds / 3600;
    if (interval > 1) return `${Math.floor(interval)}h ago`;
    interval = seconds / 60;
    if (interval > 1) return `${Math.floor(interval)}m ago`;
    return 'Just now';
  } catch (e) {
    return 'Recently';
  }
};

export default function NotificationsScreen() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [currentUserId, setCurrentUserId] = useState('');
  const [allUsersList, setAllUsersList] = useState<any[]>([]);

  useEffect(() => {
    const initUser = async () => {
      const savedEmail = await AsyncStorage.getItem('@saved_user_email');
      if (savedEmail) {
        setCurrentUserId(savedEmail.toLowerCase().replace(/[^a-z0-9]/g, '_'));
      }
    };
    initUser();

    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      const users = snapshot.docs.map(docSnap => ({
        uid: docSnap.id,
        ...(docSnap.data() as any)
      }));
      setAllUsersList(users);
    });
    return () => unsubUsers();
  }, []);

  useEffect(() => {
    if (!currentUserId) return;

    const notifRef = collection(db, 'users', currentUserId, 'notifications');
    const q = query(notifRef, orderBy('createdAt', 'desc'));

    const unsubscribeNotifs = onSnapshot(q, (snapshot) => {
      const loadedNotifs: NotificationItem[] = snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...(docSnap.data() as any)
      }));
      setNotifications(loadedNotifs);
    }, (error) => {
      console.error('Error fetching notifications:', error);
    });

    return () => unsubscribeNotifs();
  }, [currentUserId]);

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'like':
        return { name: "heart", color: "#EF4444" };
      case 'follow_request':
      case 'follow':
        return { name: "person-add", color: "#EAB308" };
      case 'comment':
      case 'message':
      case 'game_chat':
        return { name: "chatbubble", color: "#EAB308" };
      case 'game_join':
      case 'game_leave':
      case 'game_deleted':
      case 'game_update':
      case 'game_created':
        return { name: "football", color: "#3B82F6" };
      case 'story':
      case 'new_post_story':
        return { name: "camera", color: "#EAB308" };
      default:
        return { name: "notifications", color: "#EAB308" };
    }
  };


  const handleFollowRequest = async (item: NotificationItem, accept: boolean) => {
    if (!currentUserId || !item.senderUid) return;
    try {
      const myRef = doc(db, 'users', currentUserId);
      const requesterRef = doc(db, 'users', item.senderUid);
      const notificationRef = doc(db, 'users', currentUserId, 'notifications', item.id);
      if (accept) {
        await updateDoc(myRef, {
          followers: arrayUnion(item.senderUid),
          pendingRequests: arrayRemove(item.senderUid)
        });
        await updateDoc(requesterRef, { following: arrayUnion(currentUserId) });
        await updateDoc(notificationRef, { status: 'accepted', message: 'You accepted this follow request.' });
      } else {
        await updateDoc(myRef, { pendingRequests: arrayRemove(item.senderUid) });
        await updateDoc(notificationRef, { status: 'rejected', message: 'You declined this follow request.' });
      }
    } catch (error) {
      console.error('Error handling follow request:', error);
      Alert.alert('Error', accept ? 'Could not approve the follow request.' : 'Could not decline the follow request.');
    }
  };

  // פונקציית ניתוב בלחיצה על התראה ספציפית
  const handleNotificationPress = (item: NotificationItem) => {
    if (item.type === 'like' || item.type === 'comment' || item.type === 'follow' || item.type === 'follow_request' || item.type === 'new_post_story') {
      // מעבר לפרופיל המשתמש שביצע את הפעולה
      if (item.senderUid) {
        // ניתן להתאים את הנתיב בהתאם למבנה הניתובים שלך באפליקציה (למשל router.push)
        router.push({ pathname: '/profile/[id]', params: { id: item.senderUid } } as any);
      }
    } else if (item.type === 'message') {
      // מעבר לצ'אט האישי
      if (item.senderUid) {
        router.push({ pathname: '/chat/[id]', params: { id: item.senderUid } } as any);
      }
    } else if (item.type === 'game_deleted') {
      // המשחק כבר נמחק, לכן מחזירים את המשתמש למסך המשחקים.
      router.push('/(tabs)/radar' as any);
    } else if (item.type === 'game_join' || item.type === 'game_leave' || item.type === 'game_update' || item.type === 'game_chat' || item.type === 'game_created') {
      if (item.gameId) {
        router.push({ pathname: '/game/[id]', params: { id: item.gameId } } as any);
      } else {
        router.push('/(tabs)/radar' as any);
      }
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={20} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {notifications.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="notifications-off-outline" size={45} color="#52525B" />
            <Text style={styles.emptyText}>No new notifications right now</Text>
          </View>
        ) : (
          notifications.map((item) => {
            const senderUser = allUsersList.find(u => u.uid === item.senderUid);
            const senderName = senderUser?.name || 'Player';
            const senderAvatar = senderUser?.avatar;
            const iconConfig = getNotificationIcon(item.type);

            const isPendingFollowRequest = item.type === 'follow_request' && item.status === 'pending';
            return (
              <View key={item.id} style={styles.notificationCard}>
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}
                  onPress={() => handleNotificationPress(item)}
                  activeOpacity={0.8}
                >
                <View style={styles.avatarBox}>
                  {senderAvatar ? (
                    <Image source={{ uri: senderAvatar }} style={{ width: '100%', height: '100%' }} />
                  ) : (
                    <Text style={{ color: '#EAB308', fontWeight: 'bold' }}>{senderName ? senderName[0].toUpperCase() : 'U'}</Text>
                  )}
                </View>

                <View style={{ flex: 1, marginLeft: 10, marginRight: 8 }}>
                  <Text style={styles.notificationText}>
                    {item.message || 'You have a new notification.'}
                  </Text>
                  <Text style={styles.timeText}>{getTimeAgo(item.createdAt)}</Text>
                </View>

                <Ionicons
                  name={iconConfig.name as any}
                  size={16}
                  color={iconConfig.color}
                />
                </TouchableOpacity>
                {isPendingFollowRequest ? (
                  <View style={{ flexDirection: 'row', gap: 6, marginLeft: 8 }}>
                    <TouchableOpacity
                      onPress={() => handleFollowRequest(item, true)}
                      style={{ backgroundColor: '#EAB308', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8 }}
                    >
                      <Text style={{ color: '#09090B', fontWeight: 'bold', fontSize: 11 }}>Accept</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleFollowRequest(item, false)}
                      style={{ backgroundColor: '#27272A', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8 }}
                    >
                      <Text style={{ color: '#EF4444', fontWeight: 'bold', fontSize: 11 }}>Reject</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#09090B' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 50, paddingBottom: 15, borderBottomWidth: 1, borderBottomColor: '#1F1F23' },
  backBtn: { width: 32, height: 32, justifyContent: 'center', alignItems: 'center', backgroundColor: '#18181B', borderRadius: 16, borderWidth: 1, borderColor: '#27272A' },
  headerTitle: { color: '#FAFAFA', fontSize: 16, fontWeight: '700' },
  scrollContent: { padding: 16 },
  emptyBox: { alignItems: 'center', justifyContent: 'center', marginTop: 100 },
  emptyText: { color: '#71717A', fontSize: 13, marginTop: 10 },
  notificationCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#121215', borderWidth: 1, borderColor: '#27272A', padding: 12, borderRadius: 12, marginBottom: 10 },
  avatarBox: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#18181B', borderWidth: 1, borderColor: '#EAB308', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  notificationText: { color: '#E4E4E7', fontSize: 12.5, lineHeight: 18 },
  timeText: { color: '#71717A', fontSize: 10, marginTop: 3 }
});