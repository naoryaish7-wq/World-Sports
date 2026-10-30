import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { collection, query, orderBy, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import AsyncStorage from '@react-native-async-storage/async-storage';

type NotificationItem = {
  id: string;
  type: 'like' | 'comment' | 'follow' | 'post' | 'story' | 'message';
  senderName: string;
  senderAvatar?: string;
  text: string;
  createdAt: Date;
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

    // שליפת כל המשתמשים כדי למשוך שמות ואווטארים
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

    let allList: NotificationItem[] = [];

    // 1. מאזין למשתמש המחובר כדי לזהות עוקבים חדשים ורשימת following
    const unsubUserDoc = onSnapshot(doc(db, 'users', currentUserId), (userDoc) => {
      if (!userDoc.exists()) return;
      const userData = userDoc.data();
      const followers = userData.followers || [];
      const following = userData.following || [];

      // עיבוד עוקבים חדשים
      followers.forEach((followerId: string) => {
        const followerObj = allUsersList.find(u => u.uid === followerId);
        if (followerObj) {
          allList.push({
            id: `follow_${followerId}`,
            type: 'follow',
            senderName: followerObj.name || 'Player',
            senderAvatar: followerObj.avatar,
            text: 'started following you 🤝',
            createdAt: new Date(userData.updatedAt || Date.now())
          });
        }
      });

      // 2. מאזין לפוסטים (גם תגובות, לייקים, וגם פוסטים חדשים ממי שאני עוקב אחריו)
      const unsubPosts = onSnapshot(query(collection(db, 'posts'), orderBy('createdAt', 'desc')), (postSnap) => {
        postSnap.docs.forEach(docSnap => {
          const data = docSnap.data();
          const postAuthorId = data.userId;

          // א. פוסט חדש ממי שאני עוקב אחריו
          if (following.includes(postAuthorId)) {
            const authorObj = allUsersList.find(u => u.uid === postAuthorId);
            allList.push({
              id: `post_${docSnap.id}`,
              type: 'post',
              senderName: authorObj?.name || data.authorName || 'Player',
              senderAvatar: authorObj?.avatar || data.avatarUrl,
              text: 'uploaded a new post 📝',
              createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date()
            });
          }

          // ב. לייקים ותגובות על הפוסטים שלי
          if (postAuthorId === currentUserId) {
            // תגובות
            if (data.comments && Array.isArray(data.comments)) {
              data.comments.forEach((c: any) => {
                if (c.userId !== currentUserId) {
                  const senderObj = allUsersList.find(u => u.uid === c.userId);
                  allList.push({
                    id: c.id || Math.random().toString(),
                    type: 'comment',
                    senderName: c.user || 'User',
                    senderAvatar: senderObj?.avatar || c.avatarUrl,
                    text: `commented: "${c.text}"`,
                    createdAt: c.createdAt?.toDate ? c.createdAt.toDate() : new Date()
                  });
                }
              });
            }
            // לייקים
            if (data.likesList && Array.isArray(data.likesList)) {
              data.likesList.forEach((likerId: string) => {
                if (likerId !== currentUserId) {
                  const likerObj = allUsersList.find(u => u.uid === likerId);
                  if (likerObj) {
                    allList.push({
                      id: `${docSnap.id}_like_${likerId}`,
                      type: 'like',
                      senderName: likerObj.name || 'Player',
                      senderAvatar: likerObj.avatar,
                      text: 'liked your post ❤️',
                      createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date()
                    });
                  }
                }
              });
            }
          }
        });
      });

      // 3. מאזין לסטוריז של מי שאני עוקב אחריו
      const unsubStories = onSnapshot(query(collection(db, 'stories'), orderBy('createdAt', 'desc')), (storySnap) => {
        storySnap.docs.forEach(docSnap => {
          const data = docSnap.data();
          if (following.includes(data.userUid)) {
            const authorObj = allUsersList.find(u => u.uid === data.userUid);
            allList.push({
              id: `story_${docSnap.id}`,
              type: 'story',
              senderName: authorObj?.name || data.name || 'Player',
              senderAvatar: authorObj?.avatar || data.avatarUrl,
              text: 'added a new story 📸',
              createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date()
            });
          }
        });
      });

      // מיון כלל ההתראות מהחדש ישן
      allList.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      setNotifications([...allList]);

      return () => {
        unsubPosts();
        unsubStories();
      };
    });

    return () => unsubUserDoc();
  }, [currentUserId, allUsersList]);

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
          notifications.map((item) => (
            <View key={item.id} style={styles.notificationCard}>
              <View style={styles.avatarBox}>
                {item.senderAvatar ? (
                  <Image source={{ uri: item.senderAvatar }} style={{ width: '100%', height: '100%' }} />
                ) : (
                  <Text style={{ color: '#EAB308', fontWeight: 'bold' }}>{item.senderName ? item.senderName[0].toUpperCase() : 'U'}</Text>
                )}
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.notificationText}>
                  <Text style={{ fontWeight: 'bold', color: '#EAB308' }}>{item.senderName} </Text>
                  {item.text}
                </Text>
              </View>
              <Ionicons 
                name={
                  item.type === 'like' ? "heart" :
                  item.type === 'follow' ? "person-add" :
                  item.type === 'story' ? "camera" : "chatbubble"
                } 
                size={16} 
                color={item.type === 'like' ? "#EF4444" : "#EAB308"} 
              />
            </View>
          ))
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
  notificationText: { color: '#E4E4E7', fontSize: 12.5, lineHeight: 18 }
});