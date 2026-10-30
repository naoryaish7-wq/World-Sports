import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, Dimensions, TouchableOpacity, ScrollView, Modal, TextInput, Alert, Linking, Platform, Image, KeyboardAvoidingView, FlatList, Share } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Marker, PROVIDER_DEFAULT, MapPressEvent } from 'react-native-maps';
import * as Location from 'expo-location';
import { collection, onSnapshot, doc, getDoc, addDoc, setDoc, deleteDoc, arrayUnion, arrayRemove, query, orderBy, updateDoc, where } from 'firebase/firestore';
import { db } from '../../firebase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { registerForPushNotificationsAsync, triggerLocalNotification } from '../../services/notificationService';

type ChatMessage = {
  id: string;
  senderId?: string;
  sender?: string;
  text: string;
  time?: string;
  createdAt?: any;
};

type UserProfile = {
  uid: string;
  name: string;
  sport?: string;
  sports?: string[];
  age?: number;
  city: string;
  country?: string;
  avatar?: string;
  level?: number;
  xp?: number;
  latitude?: number;
  longitude?: number;
  followers?: string[];
  following?: string[];
  isVip?: boolean;
};

type Comment = {
  id: string;
  userId: string;
  user: string;
  avatarUrl: string;
  text: string;
  createdAt?: any;
};

type PostItem = {
  id: string;
  userId?: string;
  userEmail?: string;
  userName?: string;
  authorName?: string;
  imageUrl: string;
  caption?: string;
  text?: string;
  avatarUrl?: string;
  likesList?: string[];
  comments?: Comment[];
  createdAt?: any;
};

type GameItem = {
  id: string;
  title: string;
  sport: string;
  venueName: string;
  city: string;
  latitude: number;
  longitude: number;
  description: string;
  time: string;
  creator: string;
  creatorName: string;
  maxPlayers: number;
  players: string[];
  chat: ChatMessage[];
};

const getSportIcon = (sportName: string) => {
  switch (sportName?.toLowerCase()) {
    case 'football':
    case 'כדורגל':
      return 'football';
    case 'basketball':
    case 'כדורסל':
      return 'basketball';
    case 'tennis':
    case 'טניס':
      return 'tennisball';
    case 'running':
    case 'ריצה':
      return 'fitness';
    default:
      return 'football';
  }
};

const getTimeAgo = (timestamp: any) => {
  if (!timestamp) return 'Just now';
  try {
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    if (isNaN(date.getTime())) return 'Just now';
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
    return 'Just now';
  }
};

const { width } = Dimensions.get('window');
const imageSize = width / 3 - 2;

export default function RadarScreen() {
  const [userSports, setUserSports] = useState<string[]>([]);
  const [gamesList, setGamesList] = useState<GameItem[]>([]);
  const [currentUserId, setCurrentUserId] = useState('');
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [userName, setUserName] = useState('Player');
  const [userAvatar, setUserAvatar] = useState('');
  const [userCoords, setUserCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [autoCity, setAutoCity] = useState('Netanya');
  const [followingIds, setFollowingIds] = useState<string[]>([]);
  const [allUsersList, setAllUsersList] = useState<UserProfile[]>([]);

  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newSport, setNewSport] = useState('');
  const [newVenue, setNewVenue] = useState('');
  const [newTime, setNewTime] = useState('18:00');
  const [newMaxPlayers, setNewMaxPlayers] = useState('10');
  const [newDesc, setNewDesc] = useState('');
  
  const [pickedLocation, setPickedLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [isPickingLocation, setIsPickingLocation] = useState(false);

  const [selectedGame, setSelectedGame] = useState<GameItem | null>(null);
  const [chatMessage, setChatMessage] = useState('');
  const chatScrollRef = useRef<any>(null);

  const [selectedUserModalId, setSelectedUserModalId] = useState<string | null>(null);
  const [targetProfileUser, setTargetProfileUser] = useState<UserProfile | null>(null);
  const [targetUserPosts, setTargetUserPosts] = useState<PostItem[]>([]);
  const [targetActiveModalList, setTargetActiveModalList] = useState<'followers' | 'following' | null>(null);

  const [chatModalVisible, setChatModalVisible] = useState(false);
  const [chatTargetUser, setChatTargetUser] = useState<UserProfile | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [messageInput, setMessageInput] = useState('');

  const [selectedPostModal, setSelectedPostModal] = useState<PostItem | null>(null);
  const [commentInput, setCommentInput] = useState('');

  const [teamAverageAge, setTeamAverageAge] = useState<number | string>('Calculating...');

  const [mapRegion, setMapRegion] = useState({
    latitude: 32.3215,
    longitude: 34.8532,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  });

  const prevFollowersLength = useRef<number>(0);
  const postsStateRef = useRef<{ [postId: string]: { likes: number; comments: number } }>({});

  useEffect(() => {
    const handleDeepLink = async (event: { url: string }) => {
      const data = event.url;
      if (data && data.includes('game/')) {
        const gameId = data.split('game/')[1]?.split('?')[0];
        if (gameId) {
          try {
            const gameSnap = await getDoc(doc(db, 'games', gameId));
            if (gameSnap.exists()) {
              setSelectedGame({ id: gameSnap.id, ...(gameSnap.data() as Omit<GameItem, 'id'>) });
            }
          } catch (e) {
            console.error('Error opening shared game link:', e);
          }
        }
      }
    };

    Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink({ url });
    });

    const sub = Linking.addEventListener('url', handleDeepLink);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          let location = await Location.getCurrentPositionAsync({});
          const coords = { latitude: location.coords.latitude, longitude: location.coords.longitude };
          setUserCoords(coords);
          setMapRegion({ ...coords, latitudeDelta: 0.05, longitudeDelta: 0.05 });

          let reverseGeocode = await Location.reverseGeocodeAsync(coords);
          if (reverseGeocode.length > 0) {
            const cityFound = reverseGeocode[0].city || reverseGeocode[0].subregion || 'Netanya';
            setAutoCity(cityFound);
          }

          const savedEmail = await AsyncStorage.getItem('@saved_user_email');
          if (savedEmail) {
            const userId = savedEmail.toLowerCase().replace(/[^a-z0-9]/g, '_');
            await setDoc(doc(db, 'users', userId), {
              latitude: coords.latitude,
              longitude: coords.longitude
            }, { merge: true });
          }
        }
      } catch (error) {
        console.error(error);
      }
    })();
  }, []);

  useEffect(() => {
    const loadUserData = async () => {
      try {
        const savedEmail = await AsyncStorage.getItem('@saved_user_email');
        if (savedEmail) {
          const userId = savedEmail.toLowerCase().replace(/[^a-z0-9]/g, '_');
          setCurrentUserId(userId);
          
          registerForPushNotificationsAsync(userId);

          const unsubscribeUserDoc = onSnapshot(doc(db, 'users', userId), (userSnap) => {
            if (userSnap.exists()) {
              const data = userSnap.data() as UserProfile;
              setCurrentUser({ ...data, uid: userSnap.id });
              if (data.sports) {
                setUserSports(data.sports);
                setNewSport(data.sports[0]);
              } else if (data.sport) {
                setUserSports([data.sport]);
                setNewSport(data.sport);
              }
              if (data.name) setUserName(data.name);
              if (data.avatar) setUserAvatar(data.avatar);
              if (data.following) {
                setFollowingIds(data.following);
              } else {
                setFollowingIds([]);
              }
            }
          });
          return () => unsubscribeUserDoc();
        }
      } catch (e) {
        console.error(e);
      }
    };
    loadUserData();
  }, []);

  useEffect(() => {
    if (!currentUser || !currentUserId) return;

    const userDocRef = doc(db, 'users', currentUserId);
    const unsubscribeUserNotif = onSnapshot(userDocRef, (docSnap) => {
      if (!docSnap.exists()) return;
      const data = docSnap.data();
      const followers = data.followers || [];

      if (prevFollowersLength.current > 0 && followers.length > prevFollowersLength.current) {
        triggerLocalNotification('עוקב חדש! 👤', 'מישהו חדש החל לעקוב אחריך בפרופיל!');
      }
      prevFollowersLength.current = followers.length;
    });

    const chatsQuery = query(collection(db, 'chats'), where('participants', 'array-contains', currentUserId));
    const unsubscribeChatNotif = onSnapshot(chatsQuery, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'modified') {
          triggerLocalNotification('הודעה חדשה 💬', 'קיבלת הודעה חדשה בצ\'אט האישי.');
        }
      });
    });

    const postsQuery = collection(db, 'posts');
    const unsubscribePostsNotif = onSnapshot(postsQuery, (snapshot) => {
      snapshot.docs.forEach((docSnap) => {
        const postData = docSnap.data();
        const postId = docSnap.id;
        const isMyPost = postData.userId === currentUserId || postData.userName === currentUser.name;
        
        const currentLikes = postData.likesList?.length || 0;
        const currentComments = postData.comments?.length || 0;

        if (isMyPost) {
          const prevState = postsStateRef.current[postId];
          if (prevState) {
            if (currentLikes > prevState.likes) {
              triggerLocalNotification('לייק חדש! ❤️', `יש לך כעת סך הכל ${currentLikes} לייקים על הפוסט שלך.`);
            }
            if (currentComments > prevState.comments) {
              triggerLocalNotification('תגובה חדשה! 📝', `יש לך כעת סך הכל ${currentComments} תגובות על הפוסט שלך בזמן אמת.`);
            }
          }
          postsStateRef.current[postId] = { likes: currentLikes, comments: currentComments };
        }
      });
    });

    const gamesNotifQuery = collection(db, 'games');
    const unsubscribeGamesNotif = onSnapshot(gamesNotifQuery, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const gameData = change.doc.data() as GameItem;
          const userSports = currentUser.sports || [currentUser.sport] || [];

          if (userSports.includes(gameData.sport) && userCoords) {
            const distKm = calculateDistance(userCoords.latitude, userCoords.longitude, gameData.latitude, gameData.longitude);
            if (distKm <= 0.5) {
              triggerLocalNotification(
                'משחק חדש בקרבת מקום! 🏟️',
                `נוצר משחק ${gameData.sport} "${gameData.title}" במרחק של פחות מ־500 מטר ממך!`
              );
            }
          }
        }
      });
    });

    return () => {
      unsubscribeUserNotif();
      unsubscribeChatNotif();
      unsubscribePostsNotif();
      unsubscribeGamesNotif();
    };
  }, [currentUser, currentUserId, userCoords]);

  useEffect(() => {
    if (!selectedGame || !currentUserId) return;

    const gameDocRef = doc(db, 'games', selectedGame.id);
    const unsubscribeSelectedGame = onSnapshot(gameDocRef, (docSnap) => {
      if (!docSnap.exists()) {
        triggerLocalNotification('הקבוצה נמחקה ⚠️', 'מנהל הקבוצה מחק את המשחק.');
        setSelectedGame(null);
        return;
      }
      const updatedGame = docSnap.data() as GameItem;
      
      if (updatedGame.chat && selectedGame.chat && updatedGame.chat.length > selectedGame.chat.length) {
        const lastMsg = updatedGame.chat[updatedGame.chat.length - 1];
        if (lastMsg.sender !== userName) {
          triggerLocalNotification('הודעה קבוצתית חדשה 💬', `${lastMsg.sender}: ${lastMsg.text}`);
        }
      }

      if (updatedGame.players && selectedGame.players) {
        if (updatedGame.players.length > selectedGame.players.length) {
          triggerLocalNotification('שחקן הצטרף למשחק! 🤝', 'שחקן חדש נכנס לסגל הקבוצה.');
        } else if (updatedGame.players.length < selectedGame.players.length) {
          triggerLocalNotification('שחקן עזב את המשחק 🚪', 'שחקן עזב את סגל הקבוצה.');
        }
      }

      setSelectedGame(prev => prev ? { ...prev, ...updatedGame } : null);
    });

    return () => unsubscribeSelectedGame();
  }, [selectedGame?.id]);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'users'), (snapshot) => {
      const users: UserProfile[] = snapshot.docs.map(docSnap => ({
        uid: docSnap.id,
        ...(docSnap.data() as Omit<UserProfile, 'uid'>)
      }));
      setAllUsersList(users);

      AsyncStorage.getItem('@saved_user_email').then(email => {
        if (email) {
          const myId = email.toLowerCase().replace(/[^a-z0-9]/g, '_');
          const me = users.find(u => u.uid === myId);
          if (me) {
            setCurrentUser(me);
            if (me.name) setUserName(me.name);
            if (me.avatar) setUserAvatar(me.avatar);
            if (me.following) setFollowingIds(me.following);
          }
        }
      });
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!selectedUserModalId) {
      setTargetProfileUser(null);
      setTargetUserPosts([]);
      setTargetActiveModalList(null);
      return;
    }

    const fetchTargetUser = async () => {
      try {
        const userSnap = await getDoc(doc(db, 'users', selectedUserModalId));
        if (userSnap.exists()) {
          setTargetProfileUser({ uid: userSnap.id, ...(userSnap.data() as Omit<UserProfile, 'uid'>) });
        }
      } catch (e) {
        console.error('Error fetching target user:', e);
      }
    };

    fetchTargetUser();
  }, [selectedUserModalId]);

  useEffect(() => {
    if (!targetProfileUser) return;

    const postsRef = collection(db, 'posts');
    const unsubscribe = onSnapshot(postsRef, (snapshot) => {
      const allPosts: PostItem[] = snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<PostItem, 'id'>)
      }));

      const filtered = allPosts.filter(p => 
        p.userId === targetProfileUser.uid || 
        p.userName === targetProfileUser.name ||
        p.authorName === targetProfileUser.name
      );

      setTargetUserPosts(filtered);
    });

    return () => unsubscribe();
  }, [targetProfileUser]);

  useEffect(() => {
    if (!currentUser || !chatTargetUser || !chatModalVisible) return;

    const chatId = [currentUser.uid, chatTargetUser.uid].sort().join('_');
    const messagesRef = collection(db, 'chats', chatId, 'messages');
    const q = query(messagesRef, orderBy('createdAt', 'asc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs: ChatMessage[] = snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...(docSnap.data() as any)
      }));
      setChatMessages(msgs);
    });

    return () => unsubscribe();
  }, [currentUser, chatTargetUser, chatModalVisible]);

  useEffect(() => {
    const calculateAverageAge = async () => {
      if (!selectedGame || !selectedGame.players || selectedGame.players.length === 0) {
        setTeamAverageAge('N/A');
        return;
      }

      try {
        let totalAge = 0;
        let countWithAge = 0;

        for (const playerStr of selectedGame.players) {
          if (!playerStr || typeof playerStr !== 'string') continue;
          
          const cleanName = playerStr.replace(/👑|\(me\)/g, '').trim().toLowerCase();
          if (!cleanName) continue;

          let userAge: number | undefined = undefined;

          if (currentUser && currentUser.age && (cleanName === currentUser.name?.toLowerCase().trim() || cleanName === 'me' || cleanName === userName.toLowerCase().trim())) {
            userAge = Number(currentUser.age);
          }

          if (!userAge) {
            const foundUser = allUsersList.find(u => u.name?.toLowerCase().trim() === cleanName);
            if (foundUser && foundUser.age) {
              userAge = Number(foundUser.age);
            }
          }

          if (userAge && !isNaN(userAge) && userAge > 0) {
            totalAge += userAge;
            countWithAge++;
          }
        }

        if (countWithAge > 0) {
          if (selectedGame.players.length === 1 && countWithAge === 1) {
            setTeamAverageAge(`${totalAge} years old`);
          } else {
            const avg = Math.round(totalAge / countWithAge);
            setTeamAverageAge(`${avg} years old (Avg)`);
          }
        } else {
          setTeamAverageAge('Not specified');
        }
      } catch (e) {
        console.error('Age calculation error:', e);
        setTeamAverageAge('N/A');
      }
    };

    calculateAverageAge();
  }, [selectedGame, allUsersList, currentUser, userName]);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'games'), (snapshot) => {
      const markers: GameItem[] = snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<GameItem, 'id'>)
      }));
      setGamesList(markers);

      setSelectedGame(prev => {
        if (!prev) return null;
        const updated = markers.find(g => g.id === prev.id);
        return updated || null;
      });
    });
    return () => unsubscribe();
  }, []);

  const openMapsNavigation = (venue: string, city: string) => {
    const queryStr = encodeURIComponent(`${venue}, ${city}`);
    const url = Platform.OS === 'ios' ? `maps:0,0?q=${queryStr}` : `geo:0,0?q=${queryStr}`;
    Linking.openURL(url);
  };

  const handleShareGame = async (gameId: string, gameTitle: string, gameSport: string, venueName: string, city: string, time: string, creatorName: string) => {
    const gameDeepLink = `findgames://game/${gameId}`;
    try {
      await Share.share({
        message: `⚽ בואו להצטרף למשחק "${gameTitle}" (${gameSport})!\n📍 מיקום: ${venueName}, ${city}\n⏰ שעה: ${time}\n👑 מנהל המשחק: ${creatorName}\n\nלפתיחה והצטרפות ישירה למשחק באפליקציה לחצו על הקישור:\n${gameDeepLink}`,
      });
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
    const R = 6371;
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Number((R * c).toFixed(1));
  };

  const handleMapPressForCreating = (e: MapPressEvent) => {
    if (isPickingLocation) {
      const coords = e.nativeEvent.coordinate;
      setPickedLocation(coords);
      setIsPickingLocation(false);
      setCreateModalVisible(true);
      Alert.alert('Location Selected 📍', 'Venue coordinates pinned successfully!');
    }
  };

  const openUserProfileById = (userId?: string, playerName?: string) => {
    const cleanPlayerName = (playerName || '').trim().toLowerCase();
    const myCurrentName = (userName || '').trim().toLowerCase();

    if (
      (userId && currentUser && userId === currentUser.uid) ||
      (cleanPlayerName && myCurrentName && cleanPlayerName === myCurrentName)
    ) {
      return; 
    }

    setSelectedGame(null);
    setSelectedPostModal(null);
    setTargetActiveModalList(null);
    setSelectedUserModalId(null);

    setTimeout(() => {
      let found: UserProfile | undefined = undefined;
      if (userId) {
        found = allUsersList.find(u => u.uid === userId);
      }
      if (!found && playerName) {
        found = allUsersList.find(u => u.name?.toLowerCase() === cleanPlayerName);
      }

      if (found) {
        setSelectedUserModalId(found.uid);
      } else if (userId) {
        setSelectedUserModalId(userId);
      }
    }, 60);
  };

  const handleToggleFollowTarget = async () => {
    if (!targetProfileUser || !currentUser) return;
    const isFollowing = targetProfileUser.followers?.includes(currentUser.uid);

    try {
      const myRef = doc(db, 'users', currentUser.uid);
      const targetRef = doc(db, 'users', targetProfileUser.uid);

      if (isFollowing) {
        await updateDoc(myRef, { following: arrayRemove(targetProfileUser.uid) });
        await updateDoc(targetRef, { followers: arrayRemove(currentUser.uid) });
        setTargetProfileUser({
          ...targetProfileUser,
          followers: targetProfileUser.followers?.filter(id => id !== currentUser.uid)
        });
      } else {
        await updateDoc(myRef, { following: arrayUnion(targetProfileUser.uid) });
        await updateDoc(targetRef, { followers: arrayUnion(currentUser.uid) });
        setTargetProfileUser({
          ...targetProfileUser,
          followers: [...(targetProfileUser.followers || []), currentUser.uid]
        });
      }
    } catch (error) {
      console.error('Error updating follow status:', error);
    }
  };

  const handleSendMessage = async () => {
    if (!messageInput.trim() || !currentUser || !chatTargetUser) return;

    const chatId = [currentUser.uid, chatTargetUser.uid].sort().join('_');
    const textToSend = messageInput.trim();
    setMessageInput('');

    try {
      const chatDocRef = doc(db, 'chats', chatId);
      await setDoc(chatDocRef, {
        participants: [currentUser.uid, chatTargetUser.uid],
        lastUpdated: new Date()
      }, { merge: true });

      const messagesRef = collection(db, 'chats', chatId, 'messages');
      await addDoc(messagesRef, {
        senderId: currentUser.uid,
        text: textToSend,
        createdAt: new Date()
      });
    } catch (e) {
      console.error('Error sending message:', e);
      alert('Could not send message. Please try again.');
    }
  };

  const toggleLikePost = async () => {
    if (!selectedPostModal || !currentUser) return;
    try {
      const postRef = doc(db, 'posts', selectedPostModal.id);
      const likesList = selectedPostModal.likesList || [];
      const hasLiked = likesList.includes(currentUser.uid);

      const updatedLikes = hasLiked
        ? likesList.filter(id => id !== currentUser.uid)
        : [...likesList, currentUser.uid];

      await updateDoc(postRef, { likesList: updatedLikes });
      setSelectedPostModal({ ...selectedPostModal, likesList: updatedLikes });
    } catch (e) {
      console.error('Error toggling like:', e);
    }
  };

  const handleAddCommentToPost = async () => {
    if (!commentInput.trim() || !selectedPostModal || !currentUser) return;

    const newComment: Comment = {
      id: Date.now().toString(),
      userId: currentUser.uid,
      user: currentUser.name,
      avatarUrl: currentUser.avatar || '',
      text: commentInput.trim(),
      createdAt: new Date()
    };

    try {
      const postRef = doc(db, 'posts', selectedPostModal.id);
      const updatedComments = [...(selectedPostModal.comments || []), newComment];
      await updateDoc(postRef, { comments: updatedComments });

      setSelectedPostModal({ ...selectedPostModal, comments: updatedComments });
      setCommentInput('');
    } catch (e) {
      console.error('Error adding comment:', e);
    }
  };

  const handleCreateGame = async () => {
    if (!newTitle.trim() || !newVenue.trim() || !newDesc.trim() || !newSport) {
      Alert.alert('Error', 'Please fill in all required fields.');
      return;
    }

    try {
      const gameLat = pickedLocation ? pickedLocation.latitude : (userCoords ? userCoords.latitude : 32.3215);
      const gameLon = pickedLocation ? pickedLocation.longitude : (userCoords ? userCoords.longitude : 34.8532);
      const activeName = userName || 'Player';

      const newGameRef = await addDoc(collection(db, 'games'), {
        title: newTitle.trim(),
        sport: newSport,
        venueName: newVenue.trim(),
        city: autoCity,
        time: newTime.trim(),
        latitude: gameLat,
        longitude: gameLon,
        description: newDesc.trim(),
        creator: currentUserId,
        creatorName: activeName,
        maxPlayers: parseInt(newMaxPlayers) || 10,
        players: [activeName],
        chat: [],
        createdAt: new Date()
      });

      setCreateModalVisible(false);
      setPickedLocation(null);
      setNewTitle('');
      setNewVenue('');
      setNewDesc('');
      
      Alert.alert('Success 📍', 'Game published to the map successfully!', [
        { text: 'OK', onPress: () => {} },
        { 
          text: 'Share Game 🔗', 
          onPress: () => {
            handleShareGame(
              newGameRef.id,
              newTitle.trim(),
              newSport,
              newVenue.trim(),
              autoCity,
              newTime.trim(),
              activeName
            );
          } 
        }
      ]);
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Could not create game.');
    }
  };

  const handleJoinGame = async (game: GameItem) => {
    const activeName = userName || 'Player';
    if (game.players && game.players.includes(activeName)) {
      Alert.alert('Already Joined', 'You are already registered for this game.');
      return;
    }
    if (game.players && game.players.length >= game.maxPlayers) {
      Alert.alert('Game Full', 'Sorry, this game has reached maximum capacity.');
      return;
    }

    try {
      await setDoc(doc(db, 'games', game.id), { players: arrayUnion(activeName) }, { merge: true });
      Alert.alert('Success 🤝', 'You have joined the team!');
    } catch (e) { console.error(e); }
  };

  const handleLeaveGame = async (game: GameItem) => {
    const activeName = userName || 'Player';
    try {
      const updatedPlayers = game.players.filter(p => p !== activeName);
      if (updatedPlayers.length === 0) {
        await deleteDoc(doc(db, 'games', game.id));
        setSelectedGame(null);
        Alert.alert('Left Game', 'You left the game and it was removed.');
        return;
      }

      let newCreatorName = game.creatorName;
      if (game.creatorName === activeName) {
        newCreatorName = updatedPlayers[0];
      }

      await setDoc(doc(db, 'games', game.id), {
        players: updatedPlayers,
        creatorName: newCreatorName,
      }, { merge: true });

      setSelectedGame(null);
      Alert.alert('Left Game', 'You have left the game.');
    } catch (e) { console.error(e); }
  };

  const handleDeleteGame = async (gameId: string) => {
    Alert.alert('Delete Game', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { 
        text: 'Delete', 
        style: 'destructive', 
        onPress: async () => {
          try {
            await deleteDoc(doc(db, 'games', gameId));
            setSelectedGame(null);
          } catch (e) { console.error(e); }
        } 
      }
    ]);
  };

  const handleSendTeamChatMessage = async (gameId: string) => {
    if (!chatMessage.trim()) return;
    const newMessage: ChatMessage = {
      id: Date.now().toString(),
      sender: userName || 'Player',
      text: chatMessage.trim(),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    try {
      const gameRef = doc(db, 'games', gameId);
      const updatedChat = selectedGame ? [...selectedGame.chat, newMessage] : [newMessage];
      await setDoc(gameRef, { chat: updatedChat }, { merge: true });
      setChatMessage('');
      setTimeout(() => {
        chatScrollRef.current?.scrollToEnd({ animated: true });
      }, 100);
    } catch (e) { console.error(e); }
  };

  const filteredGames = gamesList.filter(game => userSports.length === 0 || userSports.includes(game.sport));
  const isUserAdmin = (game: GameItem) => game.creatorName === userName || game.creator === currentUserId;

  const nearbyFollowingUsers = allUsersList.filter(u => {
    if (!followingIds.includes(u.uid)) return false;
    if (!userCoords || !u.latitude || !u.longitude) return false;
    const dist = calculateDistance(userCoords.latitude, userCoords.longitude, u.latitude, u.longitude);
    return dist <= 5;
  });

  const targetFollowersList = allUsersList.filter(u => targetProfileUser?.followers?.includes(u.uid));
  const targetFollowingList = allUsersList.filter(u => targetProfileUser?.following?.includes(u.uid));
  const targetSportsList = targetProfileUser?.sports || (targetProfileUser?.sport ? [targetProfileUser.sport] : ['Football']);
  const isFollowingTarget = targetProfileUser?.followers?.includes(currentUser?.uid || '');
  const isViewingMyOwnProfile = targetProfileUser?.uid === currentUser?.uid;

  const postOwner = allUsersList.find(u => 
    u.uid === selectedPostModal?.userId || 
    u.name === selectedPostModal?.userName || 
    u.name === selectedPostModal?.authorName
  ) || currentUser;

  return (
    <View style={styles.container}>
      
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.homeCategory}>Find</Text>
          <Text style={styles.appTitle}>Find <Text style={{color: '#eab308'}}>Games</Text></Text>
        </View>
        <TouchableOpacity style={styles.createGameBtn} onPress={() => setCreateModalVisible(true)}>
          <Ionicons name="add-circle" size={16} color="#000" style={{ marginRight: 4 }} />
          <Text style={styles.createGameBtnText}>Create Game 📍</Text>
        </TouchableOpacity>
      </View>

      <MapView
        provider={PROVIDER_DEFAULT}
        style={styles.map}
        region={mapRegion}
        showsUserLocation={false}
        onPress={handleMapPressForCreating}
      >
        {userCoords && currentUser && (
          <Marker 
            coordinate={userCoords} 
            title="You Are Here"
            onPress={() => openUserProfileById(currentUser.uid, currentUser.name)}
          >
            <View style={styles.myLocationMarker}>
              <View style={styles.myLocationAvatarBox}>
                {userAvatar ? (
                  <Image source={{ uri: userAvatar }} style={{ width: '100%', height: '100%' }} />
                ) : (
                  <Text style={styles.myLocationAvatarText}>{userName ? userName[0] : 'P'}</Text>
                )}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginTop: 2, gap: 2 }}>
                <Text style={styles.myLocationNameText}>{userName}</Text>
                {currentUser?.isVip && <Ionicons name="checkmark-circle" size={10} color="#eab308" />}
              </View>
            </View>
          </Marker>
        )}

        {nearbyFollowingUsers.map((friend) => (
          <Marker
            key={`friend-${friend.uid}`}
            coordinate={{ latitude: friend.latitude!, longitude: friend.longitude! }}
            onPress={() => openUserProfileById(friend.uid, friend.name)}
          >
            <View style={styles.friendMarkerContainer}>
              <View style={styles.friendAvatarBox}>
                {friend.avatar ? (
                  <Image source={{ uri: friend.avatar }} style={{ width: '100%', height: '100%' }} />
                ) : (
                  <Text style={styles.friendAvatarText}>{friend.name ? friend.name[0] : 'F'}</Text>
                )}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.8)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginTop: 2, gap: 2 }}>
                <Text style={styles.friendMarkerName}>{friend.name}</Text>
                {friend.isVip && <Ionicons name="checkmark-circle" size={10} color="#eab308" />}
              </View>
            </View>
          </Marker>
        ))}

        {filteredGames.map((game) => {
          const currentPlayersCount = game.players?.length || 0;
          const iconName = getSportIcon(game.sport);

          return (
            <Marker 
              key={game.id} 
              coordinate={{ latitude: game.latitude, longitude: game.longitude }}
              onPress={() => setSelectedGame(game)}
            >
              <View style={styles.customMarkerContainer}>
                <View style={styles.markerIconBox}>
                  <Ionicons name={iconName as any} size={14} color="#000" />
                </View>
                <View style={styles.markerTextBox}>
                  <Text style={styles.markerTitleText} numberOfLines={1}>{game.title}</Text>
                  <Text style={styles.markerPlayersText}>👥 {currentPlayersCount}/{game.maxPlayers}</Text>
                </View>
              </View>
            </Marker>
          );
        })}

        {pickedLocation && <Marker coordinate={pickedLocation} pinColor="gold" title="Chosen Venue Location" />}
      </MapView>

      {isPickingLocation && (
        <View style={styles.pickingBanner}>
          <Text style={styles.pickingBannerText}>📍 Tap anywhere on the map to pin your venue location!</Text>
          <TouchableOpacity onPress={() => setIsPickingLocation(false)}>
            <Text style={{ color: '#000', fontWeight: 'bold', textDecorationLine: 'underline', marginLeft: 10 }}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.bottomSheet}>
        <View style={styles.dragHandle} />
        <Text style={styles.sheetTitle}>Nearby Games & Meetups 🏟️</Text>
        <Text style={styles.sheetSubtitle}>Showing events based on your favorite sports</Text>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
          {filteredGames.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="compass-outline" size={36} color="#666" />
              <Text style={styles.emptyNoticeText}>No games found nearby for your selected sports.</Text>
            </View>
          ) : (
            filteredGames.map(game => {
              const distance = userCoords ? calculateDistance(userCoords.latitude, userCoords.longitude, game.latitude, game.longitude) : 0;
              const spotsLeft = game.maxPlayers - (game.players?.length || 0);

              return (
                <TouchableOpacity key={game.id} style={styles.gameCard} onPress={() => setSelectedGame(game)}>
                  <View style={styles.gameHeaderRow}>
                    <Text style={styles.sportTag}>🏅 {game.sport}</Text>
                    <Text style={styles.distanceTag}>📍 {distance} km away</Text>
                  </View>
                  <Text style={styles.gameTitle}>{game.title}</Text>
                  <Text style={styles.venueText}>🏟️ {game.venueName} | ⏰ {game.time} | 👑 Admin: {game.creatorName}</Text>
                  
                  <View style={styles.gameFooterRow}>
                    <Text style={[styles.spotsTag, spotsLeft === 0 && { color: '#ef4444' }]}>
                      {spotsLeft > 0 ? `👥 ${spotsLeft} spots left (${game.players?.length || 0}/${game.maxPlayers})` : '🔴 Full Game'}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <TouchableOpacity onPress={() => handleShareGame(game.id, game.title, game.sport, game.venueName, game.city, game.time, game.creatorName)} style={{ padding: 4 }}>
                        <Ionicons name="share-social-outline" size={16} color="#eab308" />
                      </TouchableOpacity>
                      <Text style={styles.detailsLink}>View Details ›</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      </View>

      <Modal visible={!!selectedGame} transparent={true} animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContentLarge}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>🏟️ Game & Team Details</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                {selectedGame && (
                  <TouchableOpacity onPress={() => handleShareGame(selectedGame.id, selectedGame.title, selectedGame.sport, selectedGame.venueName, selectedGame.city, selectedGame.time, selectedGame.creatorName)}>
                    <Ionicons name="share-social-outline" size={20} color="#eab308" />
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => setSelectedGame(null)}>
                  <Ionicons name="close" size={24} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>

            {selectedGame && (() => {
              const adminUserObj = allUsersList.find(u => u.name?.toLowerCase() === selectedGame.creatorName?.toLowerCase() || u.uid === selectedGame.creator);
              return (
                <ScrollView showsVerticalScrollIndicator={false}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={styles.detailSportBadge}>{selectedGame.sport}</Text>
                    {isUserAdmin(selectedGame) && (
                      <TouchableOpacity onPress={() => handleDeleteGame(selectedGame.id)} style={styles.deleteGameBtn}>
                        <Ionicons name="trash-outline" size={16} color="#ef4444" />
                        <Text style={{ color: '#ef4444', fontWeight: 'bold', fontSize: 12, marginLeft: 4 }}>Delete Game</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  <Text style={styles.detailTitle}>{selectedGame.title}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 4 }}>
                    <Text style={styles.adminInfoText}>👑 Game Admin:</Text>
                    <Text style={{ color: '#eab308', fontSize: 12, fontWeight: 'bold' }}>{selectedGame.creatorName}</Text>
                    {adminUserObj?.isVip && <Ionicons name="checkmark-circle" size={12} color="#eab308" />}
                  </View>
                  
                  <TouchableOpacity style={styles.navigateBtn} onPress={() => openMapsNavigation(selectedGame.venueName, selectedGame.city)}>
                    <Ionicons name="navigate" size={16} color="#000" style={{ marginRight: 6 }} />
                    <Text style={styles.navigateBtnText}>Navigate to Venue 🗺️</Text>
                  </TouchableOpacity>

                  <Text style={styles.detailVenue}>📍 {selectedGame.venueName}, {selectedGame.city} | ⏰ {selectedGame.time}</Text>
                  
                  <View style={styles.detailBox}>
                    <Text style={styles.detailLabel}>📊 Team Average Age:</Text>
                    <Text style={{ color: '#eab308', fontSize: 14, fontWeight: 'bold' }}>🎂 {teamAverageAge}</Text>
                  </View>

                  <View style={styles.detailBox}>
                    <Text style={styles.detailLabel}>Description & Rules:</Text>
                    <Text style={styles.detailText}>{selectedGame.description}</Text>
                  </View>

                  <View style={styles.detailBox}>
                    <Text style={styles.detailLabel}>👥 Team Members ({selectedGame.players?.length || 0} / {selectedGame.maxPlayers}) - Tap to view profile:</Text>
                    <View style={styles.playersChipsContainer}>
                      {selectedGame.players?.map((player, index) => {
                        const isMe = (player || '').trim().toLowerCase() === (userName || '').trim().toLowerCase();
                        const playerUserObj = allUsersList.find(u => u.name?.toLowerCase() === player.toLowerCase());
                        return (
                          <TouchableOpacity 
                            key={index} 
                            style={[styles.playerChip, isMe && { borderColor: '#eab308', backgroundColor: '#1a221a' }]} 
                            onPress={() => openUserProfileById(playerUserObj?.uid, player)}
                          >
                            <Ionicons name="person" size={12} color="#eab308" style={{ marginRight: 4 }} />
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                              <Text style={styles.playerChipText}>
                                {player} {index === 0 ? '👑' : ''} {isMe ? '(me)' : ''}
                              </Text>
                              {playerUserObj?.isVip && <Ionicons name="checkmark-circle" size={12} color="#eab308" />}
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>

                  <View style={styles.detailBox}>
                    <Text style={styles.detailLabel}>💬 Team Chat:</Text>
                    <ScrollView 
                      ref={chatScrollRef}
                      style={styles.chatScrollContainer}
                      contentContainerStyle={{ paddingVertical: 6 }}
                      showsVerticalScrollIndicator={true}
                    >
                      {(!selectedGame.chat || selectedGame.chat.length === 0) ? (
                        <Text style={styles.noChatText}>No messages yet. Say hello! 👋</Text>
                      ) : (
                        selectedGame.chat.map(msg => {
                          const senderUserObj = allUsersList.find(u => u.name?.toLowerCase() === msg.sender?.toLowerCase());
                          return (
                            <View key={msg.id} style={styles.chatBubble}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                <Text style={styles.chatSender}>{msg.sender}</Text>
                                {senderUserObj?.isVip && <Ionicons name="checkmark-circle" size={11} color="#eab308" />}
                              </View>
                              <Text style={styles.chatText}>{msg.text}</Text>
                              <Text style={styles.chatTime}>{msg.time}</Text>
                            </View>
                          );
                        })
                      )}
                    </ScrollView>
                    <View style={styles.chatInputRowGame}>
                      <TextInput 
                        style={styles.chatInput} 
                        placeholder="Message team..." 
                        placeholderTextColor="#666" 
                        value={chatMessage} 
                        onChangeText={setChatMessage} 
                      />
                      <TouchableOpacity style={styles.chatSendBtn} onPress={() => handleSendTeamChatMessage(selectedGame.id)}>
                        <Ionicons name="send" size={14} color="#000" />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {selectedGame.players?.includes(userName) ? (
                    <TouchableOpacity style={styles.leaveBtn} onPress={() => handleLeaveGame(selectedGame)}>
                      <Text style={styles.leaveBtnText}>Leave Game 🚪</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity style={[styles.modalJoinBtn, selectedGame.players?.length >= selectedGame.maxPlayers && { backgroundColor: '#333' }]} onPress={() => handleJoinGame(selectedGame)}>
                      <Text style={styles.modalJoinBtnText}>{selectedGame.players?.length >= selectedGame.maxPlayers ? 'Game Full 🔴' : 'Join This Game 🤝'}</Text>
                    </TouchableOpacity>
                  )}
                </ScrollView>
              );
            })()}
          </View>
        </View>
      </Modal>

      {/* מודל פרופיל שחקן */}
      <Modal visible={!!selectedUserModalId && !targetActiveModalList && !selectedPostModal} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContentLarge}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Player Profile 🏅</Text>
              <TouchableOpacity onPress={() => setSelectedUserModalId(null)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            {targetProfileUser && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.headerProfile}>
                  <View style={styles.avatarLarge}>
                    {targetProfileUser.avatar ? (
                      <Image source={{ uri: targetProfileUser.avatar }} style={styles.avatarImage} />
                    ) : (
                      <Text style={styles.avatarLargeText}>{targetProfileUser.name ? targetProfileUser.name[0] : 'P'}</Text>
                    )}
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={styles.profileName}>{targetProfileUser.name}</Text>
                    {targetProfileUser.isVip && <Ionicons name="checkmark-circle" size={18} color="#eab308" />}
                  </View>
                  
                  <View style={styles.sportsTagsRow}>
                    {targetSportsList.map((sport, index) => (
                      <View key={index} style={styles.sportTagBadge}>
                        <Text style={styles.sportTagText}>🏅 {sport}</Text>
                      </View>
                    ))}
                  </View>

                  <Text style={styles.profileCity}>
                    📍 {targetProfileUser.city || 'Netanya'}, {targetProfileUser.country || 'Israel'} | 🎂 Age: {targetProfileUser.age || 20}
                  </Text>
                </View>

                <View style={styles.statsRow}>
                  <TouchableOpacity style={styles.statBox} onPress={() => setTargetActiveModalList('followers')}>
                    <Text style={styles.statNumber}>{targetProfileUser.followers?.length || 0}</Text>
                    <Text style={styles.statLabel}>Followers</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.statBox} onPress={() => setTargetActiveModalList('following')}>
                    <Text style={styles.statNumber}>{targetProfileUser.following?.length || 0}</Text>
                    <Text style={styles.statLabel}>Following</Text>
                  </TouchableOpacity>

                  <View style={styles.statBox}>
                    <Text style={styles.statNumber}>{targetUserPosts.length}</Text>
                    <Text style={styles.statLabel}>Posts</Text>
                  </View>
                </View>

                {!isViewingMyOwnProfile && currentUser && (
                  <View style={{ flexDirection: 'row', gap: 10, marginVertical: 12 }}>
                    <TouchableOpacity 
                      style={[styles.profileFollowBtn, isFollowingTarget && styles.profileFollowingBtn, { flex: 1 }]} 
                      onPress={handleToggleFollowTarget}
                    >
                      <Text style={[styles.profileFollowBtnText, isFollowingTarget && styles.profileFollowingBtnText]}>
                        {isFollowingTarget ? 'Following ✓' : 'Follow Player 🤝'}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity 
                      style={styles.chatOpenBtn} 
                      onPress={() => {
                        setChatTargetUser(targetProfileUser);
                        setSelectedUserModalId(null);
                        setChatModalVisible(true);
                      }}
                    >
                      <Ionicons name="chatbubbles-outline" size={18} color="#000" />
                      <Text style={styles.chatOpenBtnText}>Message 💬</Text>
                    </TouchableOpacity>
                  </View>
                )}

                <View style={styles.postsSectionHeader}>
                  <Ionicons name="grid-outline" size={18} color="#eab308" />
                  <Text style={styles.sectionTitle}>Posts</Text>
                </View>

                {targetUserPosts.length === 0 ? (
                  <View style={styles.emptyPostsBox}>
                    <Ionicons name="images-outline" size={32} color="#555" />
                    <Text style={styles.emptyPostsText}>No posts shared yet by this user.</Text>
                  </View>
                ) : (
                  <View style={styles.postsGrid}>
                    {targetUserPosts.map(post => (
                      <TouchableOpacity key={post.id} style={styles.postThumbnailBox} onPress={() => setSelectedPostModal(post)}>
                        <Image source={{ uri: post.imageUrl }} style={styles.postThumbnailImage} />
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* מודל עוקבים / נעקבים */}
      <Modal visible={!!targetActiveModalList} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {targetActiveModalList === 'followers' ? 'Followers 👥' : 'Following 🤝'}
              </Text>
              <TouchableOpacity onPress={() => setTargetActiveModalList(null)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <FlatList
              data={targetActiveModalList === 'followers' ? targetFollowersList : targetFollowingList}
              keyExtractor={(item) => item.uid}
              renderItem={({ item }) => (
                <TouchableOpacity 
                  style={styles.listItem} 
                  onPress={() => {
                    setTargetActiveModalList(null);
                    setSelectedUserModalId(null);
                    setTimeout(() => {
                      openUserProfileById(item.uid, item.name);
                    }, 50);
                  }}
                >
                  <View style={styles.listAvatar}>
                    {item.avatar ? (
                      <Image source={{ uri: item.avatar }} style={{ width: 36, height: 36, borderRadius: 18 }} />
                    ) : (
                      <Text style={{color: '#eab308', fontWeight: 'bold'}}>{item.name ? item.name[0] : 'P'}</Text>
                    )}
                  </View>
                  <View style={{flex: 1}}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Text style={styles.listName}>{item.name}</Text>
                      {item.isVip && <Ionicons name="checkmark-circle" size={14} color="#eab308" />}
                    </View>
                    <Text style={styles.listCity}>📍 {item.city} | 🎂 Age: {item.age || 'N/A'}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#888" />
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={styles.emptyNoticeText}>No users to show here.</Text>
              }
            />
          </View>
        </View>
      </Modal>

      <Modal visible={chatModalVisible} animationType="slide" transparent={true}>
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
          style={styles.chatModalOverlay}
        >
          <View style={styles.chatModalContainer}>
            <View style={styles.chatHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={styles.chatHeaderAvatarBox}>
                  {chatTargetUser?.avatar ? (
                    <Image source={{ uri: chatTargetUser.avatar }} style={styles.avatarImg} />
                  ) : (
                    <Text style={{ color: '#eab308', fontWeight: 'bold' }}>{chatTargetUser?.name ? chatTargetUser.name[0] : 'P'}</Text>
                  )}
                </View>
                <View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text style={styles.chatHeaderTitle}>{chatTargetUser?.name || 'Player'}</Text>
                    {chatTargetUser?.isVip && <Ionicons name="checkmark-circle" size={14} color="#eab308" />}
                  </View>
                  <Text style={styles.chatHeaderSubTitle}>Direct Message</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setChatModalVisible(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <FlatList
              data={chatMessages}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ padding: 16, flexGrow: 1 }}
              renderItem={({ item }) => {
                const isMe = item.senderId === currentUser?.uid;
                return (
                  <View style={[styles.chatBubbleRow, isMe ? styles.chatBubbleRowRight : styles.chatBubbleRowLeft]}>
                    <View style={[styles.chatBubbleMsg, isMe ? styles.chatBubbleMe : styles.chatBubbleOther]}>
                      <Text style={[styles.chatBubbleText, isMe && { color: '#000' }]}>{item.text}</Text>
                      <Text style={[styles.chatBubbleTime, isMe && { color: '#333' }]}>{getTimeAgo(item.createdAt)}</Text>
                    </View>
                  </View>
                );
              }}
              ListEmptyComponent={
                <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 40 }}>
                  <Ionicons name="chatbubble-outline" size={40} color="#444" />
                  <Text style={{ color: '#777', marginTop: 10, fontSize: 13 }}>No messages yet. Say hello! 👋</Text>
                </View>
              }
            />

            <View style={styles.chatInputRow}>
              <TextInput 
                style={styles.chatInputField}
                placeholder="Type a message..."
                placeholderTextColor="#666"
                value={messageInput}
                onChangeText={setMessageInput}
              />
              <TouchableOpacity style={styles.chatSendBtn} onPress={handleSendMessage}>
                <Ionicons name="send" size={16} color="#000" />
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={!!selectedPostModal} animationType="slide" transparent={true}>
        <View style={styles.postModalOverlay}>
          <View style={styles.postModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Post Details 📸</Text>
              <TouchableOpacity onPress={() => setSelectedPostModal(null)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            {selectedPostModal && (() => {
              const postTimeAgo = getTimeAgo(selectedPostModal.createdAt);
              return (
                <ScrollView showsVerticalScrollIndicator={false}>
                  <TouchableOpacity 
                    style={styles.postHeaderRowModal} 
                    activeOpacity={0.6}
                    onPress={() => {
                      setSelectedPostModal(null);
                      openUserProfileById(selectedPostModal.userId, postOwner?.name);
                    }}
                  >
                    <View style={styles.postAvatarBoxModal}>
                      {postOwner?.avatar ? (
                        <Image source={{ uri: postOwner.avatar }} style={styles.avatarImg} />
                      ) : (
                        <Text style={styles.avatarLetterTextSmall}>{postOwner?.name ? postOwner.name[0] : 'P'}</Text>
                      )}
                    </View>
                    <View style={{ marginLeft: 10, flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Text style={styles.postUserNameModal}>{postOwner?.name || selectedPostModal.userName || 'Player'}</Text>
                        {postOwner?.isVip && <Ionicons name="checkmark-circle" size={14} color="#eab308" />}
                      </View>
                      <Text style={styles.postUserMetaModal}>{postOwner?.city || 'Netanya'}, {postOwner?.country || 'Israel'}</Text>
                    </View>
                    <Text style={{ color: '#666', fontSize: 11 }}>{postTimeAgo}</Text>
                  </TouchableOpacity>

                  {selectedPostModal.caption || selectedPostModal.text ? (
                    <Text style={styles.postTextModal}>{selectedPostModal.caption || selectedPostModal.text}</Text>
                  ) : null}

                  {selectedPostModal.imageUrl ? (
                    <View style={styles.postImageBoxModal}>
                      <Image source={{ uri: selectedPostModal.imageUrl }} style={styles.postImageContentModal} />
                    </View>
                  ) : null}

                  <View style={styles.postActionsRowModal}>
                    <TouchableOpacity style={styles.actionBtn} onPress={toggleLikePost}>
                      <Ionicons 
                        name={currentUser && selectedPostModal.likesList?.includes(currentUser.uid) ? "heart" : "heart-outline"} 
                        size={20} 
                        color={currentUser && selectedPostModal.likesList?.includes(currentUser.uid) ? "#ef4444" : "#888"} 
                      />
                      <Text style={[styles.actionText, currentUser && selectedPostModal.likesList?.includes(currentUser.uid) && { color: '#ef4444', fontWeight: 'bold' }]}>
                        {selectedPostModal.likesList?.length || 0} Likes
                      </Text>
                    </TouchableOpacity>
                    <View style={styles.actionBtn}>
                      <Ionicons name="chatbubble-outline" size={18} color="#aaa" />
                      <Text style={styles.actionText}>{selectedPostModal.comments?.length || 0} Comments</Text>
                    </View>
                  </View>

                  <View style={styles.commentsSectionModal}>
                    {selectedPostModal.comments?.map(c => {
                      const commentTimeAgo = getTimeAgo(c.createdAt);
                      const commentUserObj = allUsersList.find(u => u.uid === c.userId || u.name === c.user);
                      return (
                        <TouchableOpacity 
                          key={c.id} 
                          style={styles.commentRowModal}
                          activeOpacity={0.6}
                          onPress={() => {
                            setSelectedPostModal(null);
                            openUserProfileById(c.userId, c.user);
                          }}
                        >
                          {c.avatarUrl ? (
                            <Image source={{ uri: c.avatarUrl }} style={styles.commentAvatarModal} />
                          ) : (
                            <View style={styles.commentAvatarLetterModal}>
                              <Text style={{ color: '#eab308', fontSize: 10, fontWeight: 'bold' }}>{c.user ? c.user[0] : 'P'}</Text>
                            </View>
                          )}
                          <View style={{ flex: 1, marginLeft: 8 }}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                <Text style={styles.commentUserModal}>{c.user}</Text>
                                {commentUserObj?.isVip && <Ionicons name="checkmark-circle" size={12} color="#eab308" />}
                              </View>
                              <Text style={{ color: '#666', fontSize: 10 }}>{commentTimeAgo}</Text>
                            </View>
                            <Text style={styles.commentTextModal}>{c.text}</Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}

                    <View style={styles.commentInputRowModal}>
                      <TextInput 
                        style={styles.commentInputModal} 
                        placeholder="Write a comment..." 
                        placeholderTextColor="#666"
                        value={commentInput}
                        onChangeText={setCommentInput}
                      />
                      <TouchableOpacity style={styles.commentSendBtnModal} onPress={handleAddCommentToPost}>
                        <Ionicons name="send" size={14} color="#000" />
                      </TouchableOpacity>
                    </View>
                  </View>
                </ScrollView>
              );
            })()}
          </View>
        </View>
      </Modal>

      <Modal visible={createModalVisible} transparent={true} animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create New Game 📍</Text>
              <TouchableOpacity onPress={() => setCreateModalVisible(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.label}>Game Title *</Text>
              <TextInput style={styles.input} placeholder="e.g. Friday Match" placeholderTextColor="#666" value={newTitle} onChangeText={setNewTitle} />

              <Text style={styles.label}>Select Sport *</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
                {userSports.map(sport => (
                  <TouchableOpacity key={sport} style={[styles.sportChip, newSport === sport && styles.sportChipActive]} onPress={() => setNewSport(sport)}>
                    <Text style={[styles.sportChipText, newSport === sport && styles.sportChipTextActive]}>{sport}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={styles.label}>Court / Venue Name *</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
                <TextInput style={[styles.input, { flex: 1, marginBottom: 0 }]} placeholder="e.g. Central Court" placeholderTextColor="#666" value={newVenue} onChangeText={setNewVenue} />
                <TouchableOpacity style={styles.mapSearchBtn} onPress={() => { setCreateModalVisible(false); setIsPickingLocation(true); }}>
                  <Ionicons name="map" size={18} color="#000" />
                  <Text style={styles.mapSearchBtnText}>{pickedLocation ? 'Pinned ✓' : 'Pick on Map'}</Text>
                </TouchableOpacity>
              </View>

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>City</Text>
                  <TextInput style={[styles.input, { color: '#eab308' }]} value={autoCity} editable={false} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Time *</Text>
                  <TextInput style={styles.input} placeholder="18:00" placeholderTextColor="#666" value={newTime} onChangeText={setNewTime} />
                </View>
              </View>

              <Text style={styles.label}>Max Players *</Text>
              <TextInput style={styles.input} placeholder="10" placeholderTextColor="#666" keyboardType="numeric" value={newMaxPlayers} onChangeText={setNewMaxPlayers} />

              <Text style={styles.label}>Description *</Text>
              <TextInput style={[styles.input, { height: 70, textAlignVertical: 'top' }]} placeholder="Details..." placeholderTextColor="#666" multiline value={newDesc} onChangeText={setNewDesc} />

              <TouchableOpacity style={styles.publishBtn} onPress={handleCreateGame}>
                <Text style={styles.publishBtnText}>Publish to Map 🚀</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#030703' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 50, paddingBottom: 12, backgroundColor: '#0d110f', borderBottomWidth: 1, borderBottomColor: '#1f2e24' },
  homeCategory: { color: '#eab308', fontSize: 11, fontWeight: 'bold', letterSpacing: 1 },
  appTitle: { color: '#fff', fontSize: 22, fontWeight: '900', fontStyle: 'italic' },
  createGameBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#eab308', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16 },
  createGameBtnText: { color: '#000', fontWeight: 'bold', fontSize: 12 },

  map: { width: Dimensions.get('window').width, height: Dimensions.get('window').height * 0.45 },
  
  myLocationMarker: { alignItems: 'center' },
  myLocationAvatarBox: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#16221a', borderWidth: 2, borderColor: '#eab308', justifyContent: 'center', alignItems: 'center', overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.8, shadowRadius: 2, elevation: 5 },
  myLocationAvatarText: { color: '#eab308', fontWeight: 'bold', fontSize: 14 },
  myLocationNameText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },

  friendMarkerContainer: { alignItems: 'center' },
  friendAvatarBox: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#16221a', borderWidth: 2, borderColor: '#3b82f6', justifyContent: 'center', alignItems: 'center', overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.8, shadowRadius: 2, elevation: 5 },
  friendAvatarText: { color: '#3b82f6', fontWeight: 'bold', fontSize: 14 },
  friendMarkerName: { color: '#fff', fontSize: 10, fontWeight: 'bold' },

  customMarkerContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0d110f', borderRadius: 16, borderWidth: 1, borderColor: '#eab308', paddingHorizontal: 6, paddingVertical: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.8, shadowRadius: 2, elevation: 5 },
  markerIconBox: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#eab308', justifyContent: 'center', alignItems: 'center', marginRight: 5 },
  markerTextBox: { maxWidth: 100 },
  markerTitleText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
  markerPlayersText: { color: '#eab308', fontSize: 9, fontWeight: 'bold' },
  
  pickingBanner: { position: 'absolute', top: 110, alignSelf: 'center', backgroundColor: '#eab308', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, flexDirection: 'row', alignItems: 'center', zIndex: 50 },
  pickingBannerText: { color: '#000', fontWeight: 'bold', fontSize: 12 },

  bottomSheet: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '50%', backgroundColor: '#0d110f', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 10, borderWidth: 1, borderColor: '#1f2e24' },
  dragHandle: { width: 40, height: 4, backgroundColor: '#333', borderRadius: 2, alignSelf: 'center', marginBottom: 12 },
  sheetTitle: { color: '#fff', fontSize: 18, fontWeight: '900' },
  sheetSubtitle: { color: '#888', fontSize: 12, marginBottom: 15 },

  emptyBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 30 },
  emptyNoticeText: { color: '#666', textAlign: 'center', marginTop: 30 },

  gameCard: { backgroundColor: '#030703', borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#1f2e24' },
  gameHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  sportTag: { color: '#eab308', fontSize: 12, fontWeight: 'bold' },
  distanceTag: { color: '#888', fontSize: 12 },
  gameTitle: { color: '#fff', fontSize: 15, fontWeight: 'bold', marginBottom: 2 },
  venueText: { color: '#aaa', fontSize: 12, marginBottom: 8 },
  gameFooterRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#16221a', paddingTop: 8 },
  spotsTag: { color: '#22c55e', fontSize: 11, fontWeight: 'bold' },
  detailsLink: { color: '#eab308', fontSize: 12, fontWeight: 'bold' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#0d110f', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, height: '75%', borderWidth: 1, borderColor: '#1f2e24' },
  modalContentLarge: { backgroundColor: '#0d110f', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, height: '85%', borderWidth: 1, borderColor: '#1f2e24' },
  
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, width: '100%' },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  
  label: { color: '#ccc', fontSize: 12, fontWeight: 'bold', marginBottom: 6, alignSelf: 'flex-start' },
  input: { backgroundColor: '#030703', borderWidth: 1, borderColor: '#1f2e24', borderRadius: 10, paddingHorizontal: 12, height: 44, color: '#fff', marginBottom: 14, width: '100%' },
  
  mapSearchBtn: { backgroundColor: '#eab308', borderRadius: 10, height: 44, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 6 },
  mapSearchBtnText: { color: '#000', fontWeight: 'bold', fontSize: 12 },

  sportChip: { backgroundColor: '#030703', borderWidth: 1, borderColor: '#1f2e24', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, marginRight: 8 },
  sportChipActive: { backgroundColor: '#16221a', borderColor: '#eab308' },
  sportChipText: { color: '#888', fontSize: 12, fontWeight: 'bold' },
  sportChipTextActive: { color: '#eab308' },

  publishBtn: { backgroundColor: '#eab308', borderRadius: 12, height: 46, justifyContent: 'center', alignItems: 'center', marginTop: 10, marginBottom: 10, width: '100%' },
  publishBtnText: { color: '#000', fontWeight: '900', fontSize: 15 },

  detailSportBadge: { color: '#000', backgroundColor: '#eab308', alignSelf: 'flex-start', fontSize: 11, fontWeight: '900', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, overflow: 'hidden' },
  deleteGameBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a0809', borderWidth: 1, borderColor: '#ef4444', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  detailTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold', marginTop: 10, marginBottom: 4 },
  adminInfoText: { color: '#888', fontSize: 12 },
  
  navigateBtn: { flexDirection: 'row', backgroundColor: '#eab308', borderRadius: 10, height: 38, justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  navigateBtnText: { color: '#000', fontWeight: 'bold', fontSize: 13 },

  detailVenue: { color: '#aaa', fontSize: 13, marginBottom: 14 },
  detailBox: { backgroundColor: '#030703', borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#1f2e24' },
  detailLabel: { color: '#888', fontSize: 12, fontWeight: 'bold', marginBottom: 6 },
  detailText: { color: '#fff', fontSize: 13 },
  
  playersChipsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  playerChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#16221a', borderWidth: 1, borderColor: '#eab308', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  playerChipText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },

  headerProfile: { alignItems: 'center', marginBottom: 15, paddingHorizontal: 20 },
  avatarLarge: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#16221a', borderWidth: 2, borderColor: '#eab308', justifyContent: 'center', alignItems: 'center', marginBottom: 10, overflow: 'hidden' },
  avatarImage: { width: '100%', height: '100%' },
  avatarLargeText: { color: '#eab308', fontSize: 32, fontWeight: 'bold' },
  profileName: { color: '#fff', fontSize: 20, fontWeight: '900' },
  sportsTagsRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, marginVertical: 6 },
  sportTagBadge: { backgroundColor: '#16221a', borderWidth: 1, borderColor: '#eab308', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  sportTagText: { color: '#eab308', fontSize: 11, fontWeight: 'bold' },
  profileCity: { color: '#888', fontSize: 13, marginTop: 4 },

  statsRow: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: '#0d110f', borderRadius: 16, borderWidth: 1, borderColor: '#1f2e24', padding: 14, marginBottom: 20, marginHorizontal: 20 },
  statBox: { alignItems: 'center' },
  statNumber: { color: '#eab308', fontSize: 18, fontWeight: '900' },
  statLabel: { color: '#888', fontSize: 12, marginTop: 2 },

  profileFollowBtn: { backgroundColor: '#eab308', borderRadius: 12, height: 42, justifyContent: 'center', alignItems: 'center' },
  profileFollowBtnText: { color: '#000', fontWeight: '900', fontSize: 13 },
  profileFollowingBtn: { backgroundColor: '#16221a', borderWidth: 1, borderColor: '#eab308' },
  profileFollowingBtnText: { color: '#eab308' },

  chatOpenBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#eab308', borderRadius: 12, height: 42, paddingHorizontal: 14 },
  chatOpenBtnText: { color: '#000', fontWeight: '900', fontSize: 13 },

  postsSectionHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginBottom: 10, gap: 6, borderTopWidth: 1, borderTopColor: '#1f2e24', paddingTop: 15 },
  sectionTitle: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  postsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 2 },
  postThumbnailBox: { width: imageSize, height: imageSize, backgroundColor: '#0d110f' },
  postThumbnailImage: { width: '100%', height: '100%' },
  emptyPostsBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40, backgroundColor: '#0d110f', marginHorizontal: 20, borderRadius: 16, borderWidth: 1, borderColor: '#1f2e24' },
  emptyPostsText: { color: '#666', fontSize: 13, marginTop: 8 },

  listItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#030703', padding: 12, borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: '#1f2e24' },
  listAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#16221a', justifyContent: 'center', alignItems: 'center', marginRight: 12, borderWidth: 1, borderColor: '#eab308', overflow: 'hidden' },
  listName: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  listCity: { color: '#888', fontSize: 11, marginTop: 2 },

  chatModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  chatModalContainer: { backgroundColor: '#0d110f', borderTopLeftRadius: 24, borderTopRightRadius: 24, height: '85%', borderWidth: 1, borderColor: '#1f2e24', display: 'flex', flexDirection: 'column' },
  chatHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#1f2e24' },
  chatHeaderAvatarBox: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#16221a', borderWidth: 1, borderColor: '#eab308', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  chatHeaderTitle: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  chatHeaderSubTitle: { color: '#eab308', fontSize: 11, fontWeight: '600' },
  chatBubbleRow: { marginBottom: 10, flexDirection: 'row' },
  chatBubbleRowLeft: { justifyContent: 'flex-start' },
  chatBubbleRowRight: { justifyContent: 'flex-end' },
  chatBubbleMsg: { maxWidth: '75%', padding: 10, borderRadius: 14, borderWidth: 1 },
  chatBubbleOther: { backgroundColor: '#16221a', borderColor: '#1f2e24' },
  chatBubbleMe: { backgroundColor: '#eab308', borderColor: '#eab308' },
  chatBubbleText: { color: '#000', fontSize: 13, fontWeight: '500' },
  chatBubbleTime: { color: '#444', fontSize: 9, marginTop: 4, alignSelf: 'flex-end' },
  chatInputRow: { flexDirection: 'row', padding: 12, borderTopWidth: 1, borderTopColor: '#1f2e24', backgroundColor: '#0d110f', gap: 8, alignItems: 'center' },
  chatInputField: { flex: 1, backgroundColor: '#030703', borderWidth: 1, borderColor: '#1f2e24', borderRadius: 20, height: 40, color: '#fff', paddingHorizontal: 14, fontSize: 13 },
  chatSendBtn: { backgroundColor: '#eab308', width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },

  postModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  postModalContent: { backgroundColor: '#0d110f', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, height: '80%', borderWidth: 1, borderColor: '#1f2e24' },
  postHeaderRowModal: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  postAvatarBoxModal: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#16221a', borderWidth: 1, borderColor: '#eab308', overflow: 'hidden', justifyContent: 'center', alignItems: 'center' },
  avatarImg: { width: '100%', height: '100%' },
  avatarLetterTextSmall: { color: '#eab308', fontSize: 16, fontWeight: 'bold' },
  postUserNameModal: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  postUserMetaModal: { color: '#888', fontSize: 11 },
  postTextModal: { color: '#fff', fontSize: 14, marginBottom: 12 },
  postImageBoxModal: { height: 260, backgroundColor: '#030703', borderRadius: 12, overflow: 'hidden', marginBottom: 12, borderWidth: 1, borderColor: '#1a261f' },
  postImageContentModal: { width: '100%', height: '100%' },
  postActionsRowModal: { flexDirection: 'row', gap: 20, marginBottom: 12, borderTopWidth: 1, borderTopColor: '#1a261f', paddingTop: 10 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionText: { color: '#888', fontSize: 13 },
  commentsSectionModal: { borderTopWidth: 1, borderTopColor: '#1a261f', paddingTop: 10 },
  commentRowModal: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  commentAvatarModal: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, borderColor: '#eab308' },
  commentAvatarLetterModal: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, borderColor: '#eab308', backgroundColor: '#16221a', justifyContent: 'center', alignItems: 'center' },
  commentUserModal: { color: '#eab308', fontSize: 12, fontWeight: 'bold' },
  commentTextModal: { color: '#ccc', fontSize: 12 },
  commentInputRowModal: { flexDirection: 'row', gap: 8, marginTop: 10, alignItems: 'center' },
  commentInputModal: { flex: 1, backgroundColor: '#030703', borderWidth: 1, borderColor: '#1f2e24', borderRadius: 8, height: 36, color: '#fff', paddingHorizontal: 10, fontSize: 12 },
  commentSendBtnModal: { backgroundColor: '#eab308', width: 32, height: 36, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },

  chatScrollContainer: { maxHeight: 150, backgroundColor: '#030703', borderRadius: 10, borderWidth: 1, borderColor: '#1f2e24', paddingHorizontal: 8, marginBottom: 8 },
  noChatText: { color: '#666', fontSize: 12, fontStyle: 'italic', textAlign: 'center', paddingVertical: 15 },
  chatBubble: { backgroundColor: '#16221a', padding: 8, borderRadius: 10, marginBottom: 6, borderWidth: 1, borderColor: '#1f2e24' },
  chatSender: { color: '#eab308', fontSize: 11, fontWeight: 'bold' },
  chatText: { color: '#fff', fontSize: 13, marginTop: 2 },
  chatTime: { color: '#888', fontSize: 9, alignSelf: 'flex-end', marginTop: 2 },
  chatInputRowGame: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  chatInput: { flex: 1, backgroundColor: '#030703', borderWidth: 1, borderColor: '#1f2e24', borderRadius: 8, height: 36, color: '#fff', paddingHorizontal: 10, fontSize: 12 },

  modalJoinBtn: { backgroundColor: '#eab308', borderRadius: 12, height: 46, justifyContent: 'center', alignItems: 'center', marginTop: 10, marginBottom: 20 },
  modalJoinBtnText: { color: '#000', fontWeight: '900', fontSize: 15 },
  leaveBtn: { backgroundColor: '#1a0809', borderWidth: 1, borderColor: '#ef4444', borderRadius: 12, height: 46, justifyContent: 'center', alignItems: 'center', marginTop: 10, marginBottom: 20 },
  leaveBtnText: { color: '#ef4444', fontWeight: '900', fontSize: 15 }
});