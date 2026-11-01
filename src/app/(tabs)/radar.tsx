import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, Dimensions, TouchableOpacity, ScrollView, Modal, TextInput, Alert, Linking, Platform, Image, KeyboardAvoidingView, FlatList, Share } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import MapView, { Marker, PROVIDER_DEFAULT, MapPressEvent } from 'react-native-maps';
import * as Location from 'expo-location';
import { collection, onSnapshot, doc, getDoc, addDoc, setDoc, deleteDoc, arrayUnion, arrayRemove, query, orderBy, updateDoc, where } from 'firebase/firestore';
import { db } from '../../firebase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { registerForPushNotificationsAsync, triggerLocalNotification } from '../../services/notificationService';

const { width, height } = Dimensions.get('window');

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
  userId?: string;
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
  authorMeta?: string;
  imageUrl?: string;
  mediaType?: 'image' | 'video';
  caption?: string;
  text?: string;
  sport?: string;
  avatarUrl?: string;
  likesList?: string[];
  comments?: Comment[];
  createdAt?: any;
};

type TournamentMatch = {
  id: number;
  teamA: string;
  teamB: string;
  round: string;
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
  teamsResult?: Array<{ id: number; players: string[] }>;
  tournamentMatches?: TournamentMatch[];
  playersPerTeam?: number;
  createdAt?: any;
};

const getSportIconAndColor = (sportName: string) => {
  const sport = (sportName || '').toLowerCase().trim();

  if (sport.includes('football') || sport.includes('כדורגל') || sport.includes('soccer')) {
    return { icon: 'football', color: '#22C55E', bg: '#143825', border: '#22C55E' };
  }
  if (sport.includes('basketball') || sport.includes('כדורסל')) {
    return { icon: 'basketball', color: '#F97316', bg: '#3D2012', border: '#F97316' };
  }
  if (sport.includes('tennis') || sport.includes('טניס')) {
    return { icon: 'tennisball', color: '#EAB308', bg: '#332E0F', border: '#EAB308' };
  }
  if (sport.includes('running') || sport.includes('ריצה')) {
    return { icon: 'fitness', color: '#3B82F6', bg: '#10223D', border: '#3B82F6' };
  }
  if (sport.includes('gym') || sport.includes('fitness') || sport.includes('כושר') || sport.includes('workout')) {
    return { icon: 'barbell', color: '#EF4444', bg: '#3D1518', border: '#EF4444' };
  }
  if (sport.includes('padel') || sport.includes('פדל')) {
    return { icon: 'planet', color: '#A855F7', bg: '#2C153D', border: '#A855F7' };
  }
  if (sport.includes('cycling') || sport.includes('אופניים')) {
    return { icon: 'bicycle', color: '#06B6D4', bg: '#0F3138', border: '#06B6D4' };
  }
  if (sport.includes('swimming') || sport.includes('שחייה')) {
    return { icon: 'water', color: '#0EA5E9', bg: '#102B3D', border: '#0EA5E9' };
  }

  return { icon: 'trophy', color: '#EAB308', bg: '#332E0F', border: '#EAB308' };
};

const supportsTournamentDraw = (sportName: string) => {
  // הגרלות וטורנירים מותרים רק בכדורגל, כדורסל ובטניס.
  // בדיקה מול שם הענף המקורי מאפשרת גם שמות בעברית וגם באנגלית,
  // ומתעלמת מתוספות כמו אימוג'י או טקסט מסביב לשם.
  const sport = (sportName || '').toLowerCase().trim();

  return (
    sport.includes('football') ||
    sport.includes('soccer') ||
    sport.includes('futbol') ||
    sport.includes('כדורגל') ||
    sport.includes('basketball') ||
    sport.includes('כדורסל') ||
    sport.includes('tennis') ||
    sport.includes('טניס')
  );
};

function PostVideoPlayer({ uri, isStoryOpen }: { uri: string; isStoryOpen: boolean }) {
  const player = useVideoPlayer(uri, player => {
    player.loop = true;
    player.staysActiveInBackground = false;
    player.muted = false;
    if (!isStoryOpen) player.play();
  });

  useEffect(() => {
    if (isStoryOpen) {
      try { player.pause(); } catch (e) {}
    }
  }, [isStoryOpen, player]);

  useEffect(() => {
    return () => {
      try { player.pause(); } catch (e) {}
    };
  }, [player]);

  return <VideoView style={styles.postImageContent} player={player} nativeControls={true} contentFit="cover" />;
}


// תצוגה מקדימה של סרטון בפרופיל: מציג את הפריים הראשון בלי להתחיל לנגן.
function ProfileVideoThumbnail({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, player => {
    player.loop = false;
    player.staysActiveInBackground = false;
    player.muted = true;
  });

  useEffect(() => {
    try {
      player.muted = true;
      player.pause();
      player.currentTime = 0;
    } catch (e) {}
    return () => {
      try {
        player.pause();
        player.muted = true;
      } catch (e) {}
    };
  }, [player]);

  return (
    <VideoView
      style={styles.postThumbnailImage}
      player={player}
      nativeControls={false}
      contentFit="cover"
    />
  );
}

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

const getRemainingTime = (timestamp: any) => {
  if (!timestamp) return '24h left';
  try {
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    if (isNaN(date.getTime())) return '24h left';
    
    const expiryTime = date.getTime() + 24 * 60 * 60 * 1000;
    const remainingMs = expiryTime - Date.now();

    if (remainingMs <= 0) return 'Expired';

    const totalMinutes = Math.floor(remainingMs / (1000 * 60));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m left`;
    }
    return `${minutes}m left`;
  } catch (e) {
    return '24h left';
  }
};

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
  const [allPosts, setAllPosts] = useState<PostItem[]>([]);

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

  const [drawPlayersPerTeam, setDrawPlayersPerTeam] = useState('5');
  const [activeManagerTab, setActiveManagerTab] = useState<'draw' | 'tournament'>('draw');

  const [selectedUserModalId, setSelectedUserModalId] = useState<string | null>(null);
  const [targetProfileUser, setTargetProfileUser] = useState<UserProfile | null>(null);
  const [targetUserPosts, setTargetUserPosts] = useState<PostItem[]>([]);
  const [targetActiveModalList, setTargetActiveModalList] = useState<'followers' | 'following' | null>(null);

  const [chatModalVisible, setChatModalVisible] = useState(false);
  const [chatTargetUser, setChatTargetUser] = useState<UserProfile | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [messageInput, setMessageInput] = useState('');

  const [selectedPostModal, setSelectedPostModal] = useState<PostItem | null>(null);
  const [commentsModalPost, setCommentsModalPost] = useState<PostItem | null>(null);
  const [modalCommentInput, setModalCommentInput] = useState('');

  const [zoomedAvatarUri, setZoomedAvatarUri] = useState<string | null>(null);
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
            let cityFound = reverseGeocode[0].city || reverseGeocode[0].subregion || 'Netanya';
            if (cityFound.includes('נתניה') || cityFound.includes('Netanya')) cityFound = 'Netanya';
            else if (cityFound.includes('תל אביב') || cityFound.includes('Tel Aviv')) cityFound = 'Tel Aviv';
            else if (cityFound.includes('חיפה') || cityFound.includes('Haifa')) cityFound = 'Haifa';
            else if (cityFound.includes('ראשון לציון') || cityFound.includes('Rishon LeZion')) cityFound = 'Rishon LeZion';
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
        triggerLocalNotification('New Follower! 👤', 'Someone new started following your profile!');
      }
      prevFollowersLength.current = followers.length;
    });

    const chatsQuery = query(collection(db, 'chats'), where('participants', 'array-contains', currentUserId));
    const unsubscribeChatNotif = onSnapshot(chatsQuery, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'modified') {
          triggerLocalNotification('New Message 💬', 'You received a new private chat message.');
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
              triggerLocalNotification('New Like! ❤️', `You now have a total of ${currentLikes} likes on your post.`);
            }
            if (currentComments > prevState.comments) {
              triggerLocalNotification('New Comment! 📝', `You now have a total of ${currentComments} comments on your post.`);
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
                'New Game Nearby! 🏟️',
                `A ${gameData.sport} game "${gameData.title}" was created less than 500m from you!`
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
        triggerLocalNotification('Game Removed ⚠️', 'The game admin deleted the match.');
        setSelectedGame(null);
        return;
      }
      const updatedGame = docSnap.data() as GameItem;
      
      if (updatedGame.chat && selectedGame.chat && updatedGame.chat.length > selectedGame.chat.length) {
        const lastMsg = updatedGame.chat[updatedGame.chat.length - 1];
        if (lastMsg.sender !== userName) {
          triggerLocalNotification('New Team Message 💬', `${lastMsg.sender}: ${lastMsg.text}`);
        }
      }

      if (updatedGame.players && selectedGame.players) {
        if (updatedGame.players.length > selectedGame.players.length) {
          triggerLocalNotification('Player Joined! 🤝', 'A new player has joined the squad.');
        } else if (updatedGame.players.length < selectedGame.players.length) {
          triggerLocalNotification('Player Left 🚪', 'A player has left the squad.');
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

  // טוענים את כל הפוסטים פעם אחת, כמו במסך Discover.
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'posts'),
      (snapshot) => {
        const postsList: PostItem[] = snapshot.docs.map(docSnap => ({
          id: docSnap.id,
          ...(docSnap.data() as Omit<PostItem, 'id'>)
        }));
        setAllPosts(postsList);
      },
      (error) => {
        console.error('Error loading posts in Radar:', error);
        setAllPosts([]);
      }
    );

    return () => unsubscribe();
  }, []);

  // מסננים מתוך רשימת הפוסטים המלאה לפי המשתמש שמוצג בפרופיל.
  useEffect(() => {
    if (!targetProfileUser) {
      setTargetUserPosts([]);
      return;
    }

    const normalize = (value?: string) => (value || '').trim().toLowerCase();
    const targetUid = normalize(targetProfileUser.uid);
    const targetName = normalize(targetProfileUser.name);
    const targetEmail = normalize((targetProfileUser as any).email || (targetProfileUser as any).userEmail);
    const targetEmailId = targetEmail
      ? targetEmail.replace(/[^a-z0-9]/g, '_')
      : '';

    const filtered = allPosts.filter(post => {
      const postUserId = normalize(post.userId);
      const postEmail = normalize(post.userEmail);
      const postUserName = normalize(post.userName);
      const postAuthorName = normalize(post.authorName);
      const postEmailId = postEmail ? postEmail.replace(/[^a-z0-9]/g, '_') : '';

      return (
        (!!targetUid && postUserId === targetUid) ||
        (!!targetEmail && postEmail === targetEmail) ||
        (!!targetEmailId && (postUserId === targetEmailId || postEmailId === targetEmailId)) ||
        (!!targetName && postUserName === targetName) ||
        (!!targetName && postAuthorName === targetName)
      );
    });

    filtered.sort((a, b) => {
      const getTime = (value: any) => {
        if (!value) return 0;
        if (typeof value.toMillis === 'function') return value.toMillis();
        if (typeof value.toDate === 'function') return value.toDate().getTime();
        const time = new Date(value).getTime();
        return Number.isNaN(time) ? 0 : time;
      };
      return getTime(b.createdAt) - getTime(a.createdAt);
    });

    setTargetUserPosts(filtered);
  }, [targetProfileUser, allPosts]);

  useEffect(() => {
    if (!currentUserId || !chatTargetUser || !chatModalVisible) return;

    const chatId = [currentUserId, chatTargetUser.uid].sort().join('_');
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
  }, [currentUserId, chatTargetUser, chatModalVisible]);

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
      const now = Date.now();
      const markers: GameItem[] = [];

      snapshot.docs.forEach(docSnap => {
        const data = docSnap.data();
        const createdAtDate = data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt || now);
        const diffHours = (now - createdAtDate.getTime()) / (1000 * 60 * 60);

        if (diffHours <= 24) {
          markers.push({
            id: docSnap.id,
            ...(data as Omit<GameItem, 'id'>)
          });
        }
      });

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
        message: `⚽ Join the game "${gameTitle}" (${gameSport})!\n📍 Venue: ${venueName}, ${city}\n⏰ Time: ${time}\n👑 Admin: ${creatorName}\n\nClick the link to open and join directly in the app:\n${gameDeepLink}`,
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
      (userId && currentUserId && userId === currentUserId) ||
      (cleanPlayerName && myCurrentName && cleanPlayerName === myCurrentName)
    ) {
      return; 
    }

    setSelectedGame(null);
    setSelectedPostModal(null);
    setCommentsModalPost(null);
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
    if (!targetProfileUser || !currentUserId) return;
    const isFollowing = targetProfileUser.followers?.includes(currentUserId);

    try {
      const myRef = doc(db, 'users', currentUserId);
      const targetRef = doc(db, 'users', targetProfileUser.uid);

      if (isFollowing) {
        await updateDoc(myRef, { following: arrayRemove(targetProfileUser.uid) });
        await updateDoc(targetRef, { followers: arrayRemove(currentUserId) });
        setTargetProfileUser({
          ...targetProfileUser,
          followers: targetProfileUser.followers?.filter(id => id !== currentUserId)
        });
      } else {
        await updateDoc(myRef, { following: arrayUnion(targetProfileUser.uid) });
        await updateDoc(targetRef, { followers: arrayUnion(currentUserId) });
        setTargetProfileUser({
          ...targetProfileUser,
          followers: [...(targetProfileUser.followers || []), currentUserId]
        });
      }
    } catch (error) {
      console.error('Error updating follow status:', error);
    }
  };

  const handleSendMessage = async () => {
    if (!messageInput.trim() || !currentUserId || !chatTargetUser) return;

    const chatId = [currentUserId, chatTargetUser.uid].sort().join('_');
    const textToSend = messageInput.trim();
    setMessageInput('');

    try {
      const chatDocRef = doc(db, 'chats', chatId);
      await setDoc(chatDocRef, {
        participants: [currentUserId, chatTargetUser.uid],
        lastUpdated: new Date()
      }, { merge: true });

      const messagesRef = collection(db, 'chats', chatId, 'messages');
      await addDoc(messagesRef, {
        senderId: currentUserId,
        text: textToSend,
        createdAt: new Date()
      });
    } catch (e) {
      console.error('Error sending message:', e);
      alert('Could not send message. Please try again.');
    }
  };

  const toggleLike = async (postId: string) => {
    if (!currentUserId) return;
    const post = targetUserPosts.find(p => p.id === postId) || selectedPostModal;
    if (!post) return;

    try {
      const postRef = doc(db, 'posts', postId);
      const likesList = post.likesList || [];
      const hasLiked = likesList.includes(currentUserId);

      const updatedLikes = hasLiked
        ? likesList.filter(id => id !== currentUserId)
        : [...likesList, currentUserId];

      await updateDoc(postRef, { likesList: updatedLikes });

      if (selectedPostModal && selectedPostModal.id === postId) {
        setSelectedPostModal({ ...selectedPostModal, likesList: updatedLikes });
      }
      if (commentsModalPost && commentsModalPost.id === postId) {
        setCommentsModalPost({ ...commentsModalPost, likesList: updatedLikes });
      }
    } catch (e) {
      console.error('Error toggling like:', e);
    }
  };

  const handleAddCommentToPost = async (postId: string, isModal: boolean = false) => {
    const text = isModal ? modalCommentInput : '';
    if (!text.trim()) return;

    const post = targetUserPosts.find(p => p.id === postId) || commentsModalPost || selectedPostModal;
    if (!post) return;

    const newComment: Comment = {
      id: Date.now().toString(),
      userId: currentUserId,
      user: userName,
      avatarUrl: userAvatar || '',
      text: text.trim(),
      createdAt: new Date()
    };

    try {
      const postRef = doc(db, 'posts', postId);
      const updatedComments = [...(post.comments || []), newComment];
      await updateDoc(postRef, { comments: updatedComments });

      if (isModal) {
        setModalCommentInput('');
        setCommentsModalPost(prev => prev ? { ...prev, comments: updatedComments } : null);
      }
      if (selectedPostModal && selectedPostModal.id === postId) {
        setSelectedPostModal(prev => prev ? { ...prev, comments: updatedComments } : null);
      }
    } catch (e) {
      console.error('Error adding comment:', e);
    }
  };

  const handleRunAutoDraw = async () => {
    if (!selectedGame) return;
    if (!supportsTournamentDraw(selectedGame.sport)) {
      Alert.alert('Not Available', 'Team draw is available only for football, basketball, and tennis.');
      return;
    }
    const playersList = selectedGame.players || [];
    const totalPlayers = playersList.length;

    if (totalPlayers === 0) {
      Alert.alert('Error', 'No registered players found for the draw.');
      return;
    }

    let teamSize = parseInt(drawPlayersPerTeam, 10);
    if (isNaN(teamSize) || teamSize <= 0) {
      teamSize = 5;
    }

    const shuffled = [...playersList];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    const newTeams: Array<{ id: number; players: string[] }> = [];
    let currentTeamIndex = 1;
    const effectiveTeamSize = totalPlayers < teamSize ? Math.max(1, Math.floor(totalPlayers / 2)) || 1 : teamSize;

    for (let i = 0; i < shuffled.length; i += effectiveTeamSize) {
      const teamPlayers = shuffled.slice(i, i + effectiveTeamSize);
      newTeams.push({
        id: currentTeamIndex++,
        players: teamPlayers,
      });
    }

    try {
      const gameRef = doc(db, 'games', selectedGame.id);
      await updateDoc(gameRef, {
        teamsResult: newTeams,
        playersPerTeam: effectiveTeamSize
      });
      Alert.alert('Success! 🎲', `Dynamic draw completed for ${totalPlayers} active players!`);
    } catch (e) {
      console.error('Error saving team draw:', e);
      Alert.alert('Error', 'Could not save team draw results.');
    }
  };

  const handleGenerateTournamentBracket = async () => {
    if (!selectedGame) return;
    if (!supportsTournamentDraw(selectedGame.sport)) {
      Alert.alert('Not Available', 'Tournament fixtures are available only for football, basketball, and tennis.');
      return;
    }
    
    let teams = selectedGame.teamsResult;
    const playersList = selectedGame.players || [];

    if (!teams || teams.length < 2) {
      if (playersList.length < 2) {
        Alert.alert('Notice ⚠️', 'You need at least 2 players registered in the game to build a tournament bracket.');
        return;
      }
      
      const totalPlayers = playersList.length;
      const effectiveTeamSize = totalPlayers < 2 ? 1 : Math.max(1, Math.floor(totalPlayers / 2));
      const shuffled = [...playersList];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }

      teams = [];
      let idx = 1;
      for (let i = 0; i < shuffled.length; i += effectiveTeamSize) {
        teams.push({ id: idx++, players: shuffled.slice(i, i + effectiveTeamSize) });
      }
    }

    if (teams.length < 2) {
      Alert.alert('Error', 'Need at least 2 teams or participants to generate a tournament bracket.');
      return;
    }

    const matches: TournamentMatch[] = [];
    for (let i = 0; i < teams.length; i += 2) {
      if (i + 1 < teams.length) {
        matches.push({
          id: matches.length + 1,
          teamA: `Team #${teams[i].id} (${teams[i].players.join(', ')})`,
          teamB: `Team #${teams[i+1].id} (${teams[i+1].players.join(', ')})`,
          round: 'Match Fixture'
        });
      } else {
        matches.push({
          id: matches.length + 1,
          teamA: `Team #${teams[i].id} (${teams[i].players.join(', ')})`,
          teamB: 'Bye (Direct Advance)',
          round: 'Preliminary'
        });
      }
    }

    try {
      const gameRef = doc(db, 'games', selectedGame.id);
      await updateDoc(gameRef, {
        teamsResult: teams,
        tournamentMatches: matches
      });
      Alert.alert('Tournament Ready! 🏆', 'Dynamic bracket and match fixtures generated successfully!');
    } catch (e) {
      console.error('Error generating tournament:', e);
      Alert.alert('Error', 'Could not generate tournament bracket.');
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
        teamsResult: [],
        tournamentMatches: [],
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
  const isFollowingTarget = targetProfileUser?.followers?.includes(currentUserId || '');
  const isViewingMyOwnProfile = targetProfileUser?.uid === currentUserId;

  return (
    <View style={styles.container}>
      
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.homeCategory}>Find</Text>
          <Text style={styles.appTitle}>World <Text style={{color: '#EAB308'}}>Sports</Text></Text>
        </View>
        <TouchableOpacity style={styles.createGameBtn} onPress={() => setCreateModalVisible(true)}>
          <Ionicons name="add-circle" size={16} color="#09090B" style={{ marginRight: 4 }} />
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
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(9,9,11,0.85)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginTop: 2, gap: 2 }}>
                <Text style={styles.myLocationNameText}>{userName}</Text>
                {currentUser?.isVip && <Ionicons name="checkmark-circle" size={10} color="#EAB308" />}
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
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(9,9,11,0.85)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginTop: 2, gap: 2 }}>
                <Text style={styles.friendMarkerName}>{friend.name}</Text>
                {friend.isVip && <Ionicons name="checkmark-circle" size={10} color="#EAB308" />}
              </View>
            </View>
          </Marker>
        ))}

        {filteredGames.map((game) => {
          const currentPlayersCount = game.players?.length || 0;
          const { icon, color, bg, border } = getSportIconAndColor(game.sport);

          return (
            <Marker 
              key={game.id} 
              coordinate={{ latitude: game.latitude, longitude: game.longitude }}
              onPress={() => setSelectedGame(game)}
            >
              <View style={[styles.customMarkerContainer, { backgroundColor: bg, borderColor: border }]}>
                <View style={[styles.markerIconBox, { backgroundColor: color }]}>
                  <Ionicons name={icon as any} size={13} color="#09090B" />
                </View>
                <View style={styles.markerTextBox}>
                  <Text style={styles.markerTitleText} numberOfLines={1}>{game.title}</Text>
                  <Text style={[styles.markerPlayersText, { color }]}>👥 {currentPlayersCount}/{game.maxPlayers}</Text>
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
            <Text style={{ color: '#09090B', fontWeight: 'bold', textDecorationLine: 'underline', marginLeft: 10 }}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.bottomSheet}>
        <View style={styles.dragHandle} />
        <Text style={styles.sheetTitle}>Nearby Games & Meetups 🏟️</Text>
        <Text style={styles.sheetSubtitle}>Showing active events (Auto-removes after 24 hours)</Text>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
          {filteredGames.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="compass-outline" size={36} color="#71717A" />
              <Text style={styles.emptyNoticeText}>No games found nearby for your selected sports.</Text>
            </View>
          ) : (
            filteredGames.map(game => {
              const distance = userCoords ? calculateDistance(userCoords.latitude, userCoords.longitude, game.latitude, game.longitude) : 0;
              const spotsLeft = game.maxPlayers - (game.players?.length || 0);
              const timeCreatedStr = getTimeAgo(game.createdAt);
              const timeRemainingStr = getRemainingTime(game.createdAt);
              const sportStyle = getSportIconAndColor(game.sport);

              return (
                <TouchableOpacity key={game.id} style={[styles.gameCard, { borderColor: sportStyle.border + '55', backgroundColor: sportStyle.bg + '22' }]} onPress={() => setSelectedGame(game)}>
                  <View style={styles.gameHeaderRow}>
                    <Text style={[styles.sportTag, { color: sportStyle.color }]}>🏅 {game.sport}</Text>
                    <Text style={styles.distanceTag}>📍 {distance} km away</Text>
                  </View>
                  <Text style={styles.gameTitle}>{game.title}</Text>
                  <Text style={styles.venueText}>🏟️ {game.venueName} | ⏰ {game.time} | 👑 Admin: {game.creatorName}</Text>
                  
                  <View style={styles.gameTimerRow}>
                    <Text style={styles.timerText}>⏳ Created: {timeCreatedStr}</Text>
                    <Text style={styles.timerExpiryText}>⌛ Expires in: {timeRemainingStr}</Text>
                  </View>

                  <View style={styles.gameFooterRow}>
                    <Text style={[styles.spotsTag, spotsLeft === 0 && { color: '#EF4444' }]}>
                      {spotsLeft > 0 ? `👥 ${spotsLeft} spots left (${game.players?.length || 0}/${game.maxPlayers})` : '🔴 Full Game'}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <TouchableOpacity onPress={() => handleShareGame(game.id, game.title, game.sport, game.venueName, game.city, game.time, game.creatorName)} style={{ padding: 4 }}>
                        <Ionicons name="share-social-outline" size={16} color={sportStyle.color} />
                      </TouchableOpacity>
                      <Text style={[styles.detailsLink, { color: sportStyle.color }]}>View Details ›</Text>
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
              <Text style={styles.modalTitle}>🏟️ Game & Tournament Hub</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                {selectedGame && (
                  <TouchableOpacity onPress={() => handleShareGame(selectedGame.id, selectedGame.title, selectedGame.sport, selectedGame.venueName, selectedGame.city, selectedGame.time, selectedGame.creatorName)}>
                    <Ionicons name="share-social-outline" size={20} color="#EAB308" />
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => setSelectedGame(null)}>
                  <Ionicons name="close" size={24} color="#FAFAFA" />
                </TouchableOpacity>
              </View>
            </View>

            {selectedGame && (() => {
              const adminUserObj = allUsersList.find(u => u.name?.toLowerCase() === selectedGame.creatorName?.toLowerCase() || u.uid === selectedGame.creator);
              const timeCreatedStr = getTimeAgo(selectedGame.createdAt);
              const timeRemainingStr = getRemainingTime(selectedGame.createdAt);
              const sportStyle = getSportIconAndColor(selectedGame.sport);

              return (
                <ScrollView showsVerticalScrollIndicator={false}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={[styles.detailSportBadge, { backgroundColor: sportStyle.color, color: '#09090B' }]}>{selectedGame.sport}</Text>
                    {isUserAdmin(selectedGame) && (
                      <TouchableOpacity onPress={() => handleDeleteGame(selectedGame.id)} style={styles.deleteGameBtn}>
                        <Ionicons name="trash-outline" size={16} color="#EF4444" />
                        <Text style={{ color: '#EF4444', fontWeight: 'bold', fontSize: 12, marginLeft: 4 }}>Delete Game</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  <Text style={styles.detailTitle}>{selectedGame.title}</Text>
                  
                  <View style={styles.modalTimerBox}>
                    <Text style={styles.modalTimerText}>⏳ Created {timeCreatedStr}</Text>
                    <Text style={styles.modalTimerExpiryText}>⌛ {timeRemainingStr} before auto-removal</Text>
                  </View>

                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 4 }}>
                    <Text style={styles.adminInfoText}>👑 Game Admin:</Text>
                    <Text style={{ color: sportStyle.color, fontSize: 12, fontWeight: 'bold' }}>{selectedGame.creatorName}</Text>
                    {adminUserObj?.isVip && <Ionicons name="checkmark-circle" size={12} color="#EAB308" />}
                  </View>
                  
                  <TouchableOpacity style={[styles.navigateBtn, { backgroundColor: sportStyle.color }]} onPress={() => openMapsNavigation(selectedGame.venueName, selectedGame.city)}>
                    <Ionicons name="navigate" size={16} color="#09090B" style={{ marginRight: 6 }} />
                    <Text style={styles.navigateBtnText}>Navigate to Venue 🗺️</Text>
                  </TouchableOpacity>

                  <Text style={styles.detailVenue}>📍 {selectedGame.venueName}, {selectedGame.city} | ⏰ {selectedGame.time}</Text>
                  
                  <View style={styles.detailBox}>
                    <Text style={styles.detailLabel}>📊 Team Average Age:</Text>
                    <Text style={{ color: sportStyle.color, fontSize: 14, fontWeight: 'bold' }}>🎂 {teamAverageAge}</Text>
                  </View>

                  <View style={styles.detailBox}>
                    <Text style={styles.detailLabel}>Description & Rules:</Text>
                    <Text style={styles.detailText}>{selectedGame.description}</Text>
                  </View>

                  {isUserAdmin(selectedGame) && supportsTournamentDraw(selectedGame.sport) && (
                    <View style={styles.detailBox}>
                      <Text style={[styles.detailLabel, { color: sportStyle.color, fontSize: 14 }]}>⚡ Dynamic Tournament Hub (Admin)</Text>
                      
                      <View style={styles.adminTabsRow}>
                        <TouchableOpacity 
                          style={[styles.adminTabBtn, activeManagerTab === 'draw' && { backgroundColor: sportStyle.color }]}
                          onPress={() => setActiveManagerTab('draw')}
                        >
                          <Text style={[styles.adminTabText, activeManagerTab === 'draw' && { color: '#09090B', fontWeight: 'bold' }]}>🎲 Team Draw</Text>
                        </TouchableOpacity>

                        <TouchableOpacity 
                          style={[styles.adminTabBtn, activeManagerTab === 'tournament' && { backgroundColor: sportStyle.color }]}
                          onPress={() => setActiveManagerTab('tournament')}
                        >
                          <Text style={[styles.adminTabText, activeManagerTab === 'tournament' && { color: '#09090B', fontWeight: 'bold' }]}>🏆 Tournament Brackets</Text>
                        </TouchableOpacity>
                      </View>

                      {activeManagerTab === 'draw' ? (
                        <View style={{ marginTop: 6 }}>
                          <Text style={{ color: '#D4D4D8', fontSize: 12, marginBottom: 8 }}>Shuffle {selectedGame.players?.length || 0} participants into balanced teams:</Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                            <Text style={{ color: '#A1A1AA', fontSize: 12 }}>Players per team:</Text>
                            <TextInput
                              style={styles.drawInput}
                              keyboardType="numeric"
                              value={drawPlayersPerTeam}
                              onChangeText={setDrawPlayersPerTeam}
                              placeholder="5"
                              placeholderTextColor="#52525B"
                            />
                            <TouchableOpacity style={[styles.drawBtn, { backgroundColor: sportStyle.color }]} onPress={handleRunAutoDraw}>
                              <Ionicons name="shuffle" size={14} color="#09090B" style={{ marginRight: 4 }} />
                              <Text style={styles.drawBtnText}>Run Draw 🚀</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      ) : (
                        <View style={{ marginTop: 6 }}>
                          <Text style={{ color: '#D4D4D8', fontSize: 12, marginBottom: 8 }}>Generate match fixtures based on active participants:</Text>
                          <TouchableOpacity style={[styles.drawBtn, { backgroundColor: sportStyle.color, width: '100%', height: 40, justifyContent: 'center' }]} onPress={handleGenerateTournamentBracket}>
                            <Ionicons name="git-branch" size={14} color="#09090B" style={{ marginRight: 6 }} />
                            <Text style={[styles.drawBtnText, { fontSize: 14 }]}>Generate Tournament Fixtures 🏆</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  )}

                  {supportsTournamentDraw(selectedGame.sport) && selectedGame.teamsResult && selectedGame.teamsResult.length > 0 && (
                    <View style={styles.detailBox}>
                      <Text style={[styles.detailLabel, { color: sportStyle.color, fontSize: 14 }]}>👥 Teams Formed ({selectedGame.teamsResult.length} Teams):</Text>
                      {selectedGame.teamsResult.map(team => (
                        <View key={team.id} style={styles.teamResultCard}>
                          <Text style={styles.teamResultHeader}>Team #{team.id}</Text>
                          {team.players.map((pName, pIdx) => (
                            <Text key={pIdx} style={styles.teamResultPlayer}>• {pName}</Text>
                          ))}
                        </View>
                      ))}
                    </View>
                  )}

                  {supportsTournamentDraw(selectedGame.sport) && selectedGame.tournamentMatches && selectedGame.tournamentMatches.length > 0 && (
                    <View style={styles.detailBox}>
                      <Text style={[styles.detailLabel, { color: sportStyle.color, fontSize: 14 }]}>⚔️ Tournament Fixtures (Matches):</Text>
                      {selectedGame.tournamentMatches.map(match => (
                        <View key={match.id} style={styles.matchFixtureCard}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                            <Text style={{ color: '#EAB308', fontSize: 10, fontWeight: 'bold' }}>Match #{match.id}</Text>
                            <Text style={{ color: '#71717A', fontSize: 10 }}>{match.round}</Text>
                          </View>
                          <View style={styles.matchTeamsRow}>
                            <Text style={styles.matchTeamText}>{match.teamA}</Text>
                            <Text style={{ color: '#EF4444', fontWeight: '900', fontSize: 12 }}>VS</Text>
                            <Text style={styles.matchTeamText}>{match.teamB}</Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  )}

                  <View style={styles.detailBox}>
                    <Text style={styles.detailLabel}>👥 Team Members ({selectedGame.players?.length || 0} / {selectedGame.maxPlayers}) - Tap to view profile:</Text>
                    <View style={styles.playersChipsContainer}>
                      {selectedGame.players?.map((player, index) => {
                        const isMe = (player || '').trim().toLowerCase() === (userName || '').trim().toLowerCase();
                        const playerUserObj = allUsersList.find(u => u.name?.toLowerCase() === player.toLowerCase());
                        return (
                          <TouchableOpacity 
                            key={index} 
                            style={[styles.playerChip, isMe && { borderColor: sportStyle.color, backgroundColor: '#18181B' }]} 
                            onPress={() => openUserProfileById(playerUserObj?.uid, player)}
                          >
                            <Ionicons name="person" size={12} color={sportStyle.color} style={{ marginRight: 4 }} />
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                              <Text style={styles.playerChipText}>
                                {player} {index === 0 ? '👑' : ''} {isMe ? '(me)' : ''}
                              </Text>
                              {playerUserObj?.isVip && <Ionicons name="checkmark-circle" size={12} color="#EAB308" />}
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
                                <Text style={[styles.chatSender, { color: sportStyle.color }]}>{msg.sender}</Text>
                                {senderUserObj?.isVip && <Ionicons name="checkmark-circle" size={11} color="#EAB308" />}
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
                        placeholderTextColor="#52525B" 
                        value={chatMessage} 
                        onChangeText={setChatMessage} 
                      />
                      <TouchableOpacity style={[styles.chatSendBtn, { backgroundColor: sportStyle.color }]} onPress={() => handleSendTeamChatMessage(selectedGame.id)}>
                        <Ionicons name="send" size={14} color="#09090B" />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {selectedGame.players?.includes(userName) ? (
                    <TouchableOpacity style={styles.leaveBtn} onPress={() => handleLeaveGame(selectedGame)}>
                      <Text style={styles.leaveBtnText}>Leave Game 🚪</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity style={[styles.modalJoinBtn, { backgroundColor: sportStyle.color }, selectedGame.players?.length >= selectedGame.maxPlayers && { backgroundColor: '#27272A' }]} onPress={() => handleJoinGame(selectedGame)}>
                      <Text style={styles.modalJoinBtnText}>{selectedGame.players?.length >= selectedGame.maxPlayers ? 'Game Full 🔴' : 'Join This Game 🤝'}</Text>
                    </TouchableOpacity>
                  )}
                </ScrollView>
              );
            })()}
          </View>
        </View>
      </Modal>

      {/* Player Profile Modal */}
      <Modal visible={!!selectedUserModalId && !targetActiveModalList && !selectedPostModal && !commentsModalPost} animationType="slide" transparent={true} onRequestClose={() => setSelectedUserModalId(null)}>
        <View style={styles.modalOverlayCenter}>
          <View style={styles.modalContentHomeStyle}>
            
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.homeCategory}>PLAYER PROFILE</Text>
                <Text style={styles.appTitle}>World <Text style={{color: '#EAB308'}}>Sports</Text></Text>
              </View>
              <TouchableOpacity 
                onPress={() => {
                  setTargetActiveModalList(null);
                  setSelectedUserModalId(null);
                }} 
                activeOpacity={0.8} 
                style={styles.closeHomeModalBtn}
              >
                <Ionicons name="close" size={22} color="#FAFAFA" />
              </TouchableOpacity>
            </View>

            {targetProfileUser && (
              <ScrollView 
                style={{ flex: 1 }} 
                contentContainerStyle={{ paddingBottom: 40 }} 
                showsVerticalScrollIndicator={false}
                nestedScrollEnabled={true}
              >
                
                <View style={styles.headerProfile}>
                  <TouchableOpacity 
                    style={styles.avatarLarge} 
                    onPress={() => {
                      if (targetProfileUser.avatar) {
                        setZoomedAvatarUri(targetProfileUser.avatar);
                      }
                    }}
                    activeOpacity={0.7}
                  >
                    {targetProfileUser.avatar ? (
                      <Image source={{ uri: targetProfileUser.avatar }} style={styles.avatarImage} />
                    ) : (
                      <Text style={styles.avatarLargeText}>{targetProfileUser.name ? targetProfileUser.name[0] : 'P'}</Text>
                    )}
                  </TouchableOpacity>

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    <Text style={styles.profileName}>{targetProfileUser.name}</Text>
                    {targetProfileUser.isVip && <Ionicons name="checkmark-circle" size={18} color="#EAB308" />}
                  </View>
                  
                  <View style={styles.sportsTagsRow}>
                    {targetSportsList.map((sport: string, index: number) => (
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
                  <TouchableOpacity style={styles.statBox} onPress={() => setTargetActiveModalList('followers')} activeOpacity={0.8}>
                    <Text style={styles.statNumber}>{targetProfileUser.followers?.length || 0}</Text>
                    <Text style={styles.statLabel}>Followers</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.statBox} onPress={() => setTargetActiveModalList('following')} activeOpacity={0.8}>
                    <Text style={styles.statNumber}>{targetProfileUser.following?.length || 0}</Text>
                    <Text style={styles.statLabel}>Following</Text>
                  </TouchableOpacity>

                  <View style={styles.statBox}>
                    <Text style={styles.statNumber}>{targetUserPosts.length}</Text>
                    <Text style={styles.statLabel}>Posts</Text>
                  </View>
                </View>

                {!isViewingMyOwnProfile && currentUserId && (
                  <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
                    <TouchableOpacity 
                      style={[styles.profileFollowBtn, isFollowingTarget && styles.profileFollowingBtn, { flex: 1 }]} 
                      onPress={handleToggleFollowTarget}
                      activeOpacity={0.85}
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
                      activeOpacity={0.85}
                    >
                      <Ionicons name="chatbubbles-outline" size={18} color="#09090B" />
                      <Text style={styles.chatOpenBtnText}>Message 💬</Text>
                    </TouchableOpacity>
                  </View>
                )}

                <View style={styles.postsSectionHeader}>
                  <Ionicons name="grid-outline" size={18} color="#EAB308" />
                  <Text style={styles.sectionTitle}>Player Posts</Text>
                </View>

                {targetUserPosts.length === 0 ? (
                  <View style={styles.emptyPostsBox}>
                    <Ionicons name="images-outline" size={32} color="#52525B" />
                    <Text style={styles.emptyPostsText}>No posts shared yet by this user.</Text>
                  </View>
                ) : (
                  <View style={styles.postsGrid}>
                    {targetUserPosts.map(post => {
                      return (
                        <TouchableOpacity 
                          key={post.id} 
                          style={styles.postThumbnailBox} 
                          onPress={() => setSelectedPostModal(post)} 
                          activeOpacity={0.7}
                        >
                          {post.mediaType === 'video' && post.imageUrl ? (
                            <View style={[styles.postThumbnailImage, { backgroundColor: '#000', position: 'relative' }]}>
                              <ProfileVideoThumbnail uri={post.imageUrl} />
                              <View style={styles.videoBadgeOverlay}>
                                <Ionicons name="play" size={14} color="#FAFAFA" />
                              </View>
                            </View>
                          ) : post.imageUrl ? (
                            <Image source={{ uri: post.imageUrl }} style={styles.postThumbnailImage} />
                          ) : (
                            <View style={[styles.postThumbnailImage, { justifyContent: 'center', alignItems: 'center', backgroundColor: '#18181B' }]}>
                              <Ionicons name="document-text-outline" size={20} color="#EAB308" />
                            </View>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}

              </ScrollView>
            )}

          </View>
        </View>
      </Modal>

      {/* Zoomed Avatar Modal */}
      <Modal visible={!!zoomedAvatarUri} transparent={true} animationType="fade" onRequestClose={() => setZoomedAvatarUri(null)}>
        <View style={styles.zoomedAvatarOverlay}>
          <TouchableOpacity 
            style={styles.closeZoomedBtn} 
            onPress={() => setZoomedAvatarUri(null)}
            activeOpacity={0.8}
          >
            <Ionicons name="close" size={24} color="#FAFAFA" />
          </TouchableOpacity>
          {zoomedAvatarUri && (
            <Image source={{ uri: zoomedAvatarUri }} style={styles.zoomedAvatarImage} />
          )}
        </View>
      </Modal>

      {/* Followers / Following List Modal */}
      <Modal visible={!!targetActiveModalList} animationType="slide" transparent={true} onRequestClose={() => setTargetActiveModalList(null)}>
        <View style={styles.modalOverlayCenter}>
          <View style={styles.modalContentCenter}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {targetActiveModalList === 'followers' ? 'Followers 👥' : 'Following 🤝'}
              </Text>
              <TouchableOpacity onPress={() => setTargetActiveModalList(null)} activeOpacity={0.8}>
                <Ionicons name="close" size={24} color="#FAFAFA" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 350 }} showsVerticalScrollIndicator={false}>
              {(targetActiveModalList === 'followers' ? targetFollowersList : targetFollowingList).map((item) => (
                <TouchableOpacity 
                  key={item.uid} 
                  style={styles.listItem} 
                  onPress={() => {
                    setTargetActiveModalList(null);
                    setSelectedUserModalId(null);
                    setTimeout(() => {
                      openUserProfileById(item.uid, item.name);
                    }, 50);
                  }}
                  activeOpacity={0.85}
                >
                  <View style={styles.listAvatar}>
                    {item.avatar ? (
                      <Image source={{ uri: item.avatar }} style={{ width: 36, height: 36, borderRadius: 18 }} />
                    ) : (
                      <Text style={{color: '#EAB308', fontWeight: 'bold'}}>{item.name ? item.name[0] : 'P'}</Text>
                    )}
                  </View>
                  <View style={{flex: 1}}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Text style={styles.listName}>{item.name}</Text>
                      {item.isVip && <Ionicons name="checkmark-circle" size={14} color="#EAB308" />}
                    </View>
                    <Text style={styles.listCity}>📍 {item.city} | 🎂 Age: {item.age || 'N/A'}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#71717A" />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Chat Modal */}
      <Modal visible={chatModalVisible} animationType="slide" transparent={true} onRequestClose={() => setChatModalVisible(false)}>
        <View style={styles.modalOverlayCenter}>
          <View style={styles.modalContentCenter}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={styles.chatHeaderAvatarBox}>
                  {chatTargetUser?.avatar ? (
                    <Image source={{ uri: chatTargetUser.avatar }} style={styles.avatarImg} />
                  ) : (
                    <Text style={{ color: '#EAB308', fontWeight: 'bold' }}>{chatTargetUser?.name ? chatTargetUser.name[0] : 'P'}</Text>
                  )}
                </View>
                <View>
                  <Text style={styles.chatHeaderTitle}>Chat</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text style={styles.chatHeaderSubTitle}>{chatTargetUser?.name || 'Player'}</Text>
                    {chatTargetUser?.isVip && <Ionicons name="checkmark-circle" size={13} color="#EAB308" />}
                  </View>
                </View>
              </View>
              <TouchableOpacity onPress={() => setChatModalVisible(false)} activeOpacity={0.8}>
                <Ionicons name="close" size={24} color="#FAFAFA" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 280 }} contentContainerStyle={{ padding: 6 }} showsVerticalScrollIndicator={false}>
              {chatMessages.map(item => {
                const isMe = item.senderId === currentUserId;
                return (
                  <View key={item.id} style={[styles.chatBubbleRow, isMe ? styles.chatBubbleRowRight : styles.chatBubbleRowLeft]}>
                    <View style={[styles.chatBubbleMsg, isMe ? styles.chatBubbleMe : styles.chatBubbleOther]}>
                      <Text style={[styles.chatBubbleText, isMe && { color: '#09090B' }]}>{item.text}</Text>
                      <Text style={[styles.chatBubbleTime, isMe && { color: '#3F3F46' }]}>{getTimeAgo(item.createdAt)}</Text>
                    </View>
                  </View>
                );
              })}
            </ScrollView>

            <View style={styles.chatInputRow}>
              <TextInput 
                style={styles.chatInputField}
                placeholder="Type a message..."
                placeholderTextColor="#52525B"
                value={messageInput}
                onChangeText={setMessageInput}
              />
              <TouchableOpacity style={styles.chatSendBtn} onPress={handleSendMessage} activeOpacity={0.85}>
                <Ionicons name="send" size={16} color="#09090B" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Post Details Modal */}
      <Modal visible={!!selectedPostModal} animationType="slide" transparent={true} onRequestClose={() => setSelectedPostModal(null)}>
        <View style={styles.modalOverlayCenter}>
          <View style={styles.modalContentHomeStyle}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Post Details 📷</Text>
              <TouchableOpacity onPress={() => setSelectedPostModal(null)} activeOpacity={0.8} style={styles.closeHomeModalBtn}>
                <Ionicons name="close" size={22} color="#FAFAFA" />
              </TouchableOpacity>
            </View>

            {selectedPostModal && (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }} nestedScrollEnabled={true}>
                <View style={styles.postCard}>
                  <View style={styles.postHeader}>
                    <TouchableOpacity style={styles.postAvatarBox} onPress={() => { setSelectedPostModal(null); openUserProfileById(selectedPostModal.userId, selectedPostModal.authorName || selectedPostModal.userName); }} activeOpacity={0.85}>
                      {selectedPostModal.avatarUrl ? (
                        <Image source={{ uri: selectedPostModal.avatarUrl }} style={styles.avatarImg} />
                      ) : (
                        <View style={styles.avatarPlaceholder}>
                          <Text style={styles.avatarPlaceholderText}>{selectedPostModal.authorName ? selectedPostModal.authorName[0].toUpperCase() : 'P'}</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                    
                    <View style={styles.postUserInfo}>
                      <TouchableOpacity onPress={() => { setSelectedPostModal(null); openUserProfileById(selectedPostModal.userId, selectedPostModal.authorName || selectedPostModal.userName); }} activeOpacity={0.85}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Text style={styles.postUserName}>{selectedPostModal.authorName || selectedPostModal.userName}</Text>
                          {allUsersList.find(u => u.uid === selectedPostModal.userId || u.name === selectedPostModal.authorName)?.isVip && <Ionicons name="checkmark-circle" size={14} color="#EAB308" />}
                        </View>
                      </TouchableOpacity>
                      <Text style={styles.postUserMeta}>{selectedPostModal.authorMeta || ''}</Text>
                    </View>

                    {selectedPostModal.sport && (
                      <View style={styles.sportBadge}>
                        <Text style={styles.sportBadgeText}>{selectedPostModal.sport}</Text>
                      </View>
                    )}
                    <Text style={styles.postTime}>{getTimeAgo(selectedPostModal.createdAt)}</Text>
                  </View>

                  <Text style={styles.postText}>{selectedPostModal.caption || selectedPostModal.text}</Text>
                  
                  {selectedPostModal.imageUrl ? (
                    <View style={styles.postImageBox}>
                      {selectedPostModal.mediaType === 'video' ? (
                        <PostVideoPlayer key={`modal_radar_${selectedPostModal.id}`} uri={selectedPostModal.imageUrl} isStoryOpen={false} />
                      ) : (
                        <Image source={{ uri: selectedPostModal.imageUrl }} style={styles.postImageContent} />
                      )}
                    </View>
                  ) : null}

                  <View style={styles.postActionsRow}>
                    <TouchableOpacity style={styles.actionBtn} onPress={() => toggleLike(selectedPostModal.id)} activeOpacity={0.7}>
                      <Ionicons 
                        name={selectedPostModal.likesList?.includes(currentUserId) ? "heart" : "heart-outline"} 
                        size={20} 
                        color={selectedPostModal.likesList?.includes(currentUserId) ? "#EF4444" : "#A1A1AA"} 
                      />
                      <Text style={[styles.actionText, selectedPostModal.likesList?.includes(currentUserId) && { color: '#EF4444', fontWeight: 'bold' }]}>
                        {selectedPostModal.likesList?.length || 0} Likes
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.actionBtn} onPress={() => { setSelectedPostModal(null); setCommentsModalPost(selectedPostModal); }} activeOpacity={0.7}>
                      <Ionicons name="chatbubble-outline" size={18} color="#A1A1AA" />
                      <Text style={styles.actionText}>{selectedPostModal.comments?.length || 0} Comments</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Comments Modal */}
      <Modal visible={!!commentsModalPost} animationType="slide" transparent={true} onRequestClose={() => setCommentsModalPost(null)}>
        <View style={styles.modalOverlayCenter}>
          <View style={styles.commentsModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Comments 💬</Text>
              <TouchableOpacity onPress={() => setCommentsModalPost(null)} activeOpacity={0.8} style={styles.closeHomeModalBtn}>
                <Ionicons name="close" size={22} color="#FAFAFA" />
              </TouchableOpacity>
            </View>

            {commentsModalPost && (
              <View style={{ flex: 1, width: '100%' }}>
                <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 15 }}>
                  {commentsModalPost.comments?.length === 0 ? (
                    <Text style={{ color: '#71717A', textAlign: 'center', marginVertical: 30, fontSize: 13 }}>No comments yet. Be the first to comment!</Text>
                  ) : (
                    commentsModalPost.comments?.map(c => {
                      const commentTimeAgo = getTimeAgo(c.createdAt);
                      const commentUserObj = allUsersList.find(u => u.uid === c.userId || u.name === c.user);
                      return (
                        <View key={c.id} style={styles.commentRow}>
                          <TouchableOpacity onPress={() => { setCommentsModalPost(null); openUserProfileById(c.userId, c.user); }} activeOpacity={0.85}>
                            {c.avatarUrl ? (
                              <Image source={{ uri: c.avatarUrl }} style={styles.commentAvatar} />
                            ) : (
                              <View style={styles.commentAvatarPlaceholder}>
                                <Text style={{ color: '#EAB308', fontSize: 10, fontWeight: 'bold' }}>{c.user ? c.user[0].toUpperCase() : 'U'}</Text>
                              </View>
                            )}
                          </TouchableOpacity>
                          <View style={{ flex: 1, marginLeft: 10, backgroundColor: '#18181B', padding: 10, borderRadius: 12 }}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                              <TouchableOpacity onPress={() => { setCommentsModalPost(null); openUserProfileById(c.userId, c.user); }} activeOpacity={0.85}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                  <Text style={styles.commentUser}>{c.user}</Text>
                                  {commentUserObj?.isVip && <Ionicons name="checkmark-circle" size={12} color="#EAB308" />}
                                </View>
                              </TouchableOpacity>
                              <Text style={styles.commentTimeText}>{commentTimeAgo}</Text>
                            </View>
                            <Text style={styles.commentText}>{c.text}</Text>
                          </View>
                        </View>
                      );
                    })
                  )}
                </ScrollView>

                <View style={styles.commentInputRow}>
                  <TextInput 
                    style={styles.commentInput} 
                    placeholder="Write a comment..." 
                    placeholderTextColor="#52525B"
                    value={modalCommentInput}
                    onChangeText={setModalCommentInput}
                  />
                  <TouchableOpacity style={styles.commentSendBtn} onPress={() => handleAddCommentToPost(commentsModalPost.id, true)} activeOpacity={0.85}>
                    <Ionicons name="send" size={14} color="#09090B" />
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={createModalVisible} transparent={true} animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create New Game 📍</Text>
              <TouchableOpacity onPress={() => setCreateModalVisible(false)}>
                <Ionicons name="close" size={24} color="#FAFAFA" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.label}>Game Title *</Text>
              <TextInput style={styles.input} placeholder="e.g. Friday Match" placeholderTextColor="#52525B" value={newTitle} onChangeText={setNewTitle} />

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
                <TextInput style={[styles.input, { flex: 1, marginBottom: 0 }]} placeholder="e.g. Central Court" placeholderTextColor="#52525B" value={newVenue} onChangeText={setNewVenue} />
                <TouchableOpacity style={styles.mapSearchBtn} onPress={() => { setCreateModalVisible(false); setIsPickingLocation(true); }}>
                  <Ionicons name="map" size={18} color="#09090B" />
                  <Text style={styles.mapSearchBtnText}>{pickedLocation ? 'Pinned ✓' : 'Pick on Map'}</Text>
                </TouchableOpacity>
              </View>

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>City</Text>
                  <TextInput style={[styles.input, { color: '#EAB308' }]} value={autoCity} editable={false} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Time *</Text>
                  <TextInput style={styles.input} placeholder="18:00" placeholderTextColor="#52525B" value={newTime} onChangeText={setNewTime} />
                </View>
              </View>

              <Text style={styles.label}>Max Players *</Text>
              <TextInput style={styles.input} placeholder="10" placeholderTextColor="#52525B" keyboardType="numeric" value={newMaxPlayers} onChangeText={setNewMaxPlayers} />

              <Text style={styles.label}>Description *</Text>
              <TextInput style={[styles.input, { height: 70, textAlignVertical: 'top' }]} placeholder="Details..." placeholderTextColor="#52525B" multiline value={newDesc} onChangeText={setNewDesc} />

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
  container: { flex: 1, backgroundColor: '#09090B' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 50, paddingBottom: 12, backgroundColor: '#121215', borderBottomWidth: 1, borderBottomColor: '#27272A' },
  homeCategory: { color: '#EAB308', fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  appTitle: { color: '#FAFAFA', fontSize: 22, fontWeight: '900', fontStyle: 'italic' },
  createGameBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EAB308', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16 },
  createGameBtnText: { color: '#09090B', fontWeight: '800', fontSize: 12 },

  map: { width: Dimensions.get('window').width, height: Dimensions.get('window').height * 0.45 },
  
  myLocationMarker: { alignItems: 'center' },
  myLocationAvatarBox: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#18181B', borderWidth: 2, borderColor: '#EAB308', justifyContent: 'center', alignItems: 'center', overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.8, shadowRadius: 2, elevation: 5 },
  myLocationAvatarText: { color: '#EAB308', fontWeight: 'bold', fontSize: 14 },
  myLocationNameText: { color: '#FAFAFA', fontSize: 10, fontWeight: 'bold' },

  friendMarkerContainer: { alignItems: 'center' },
  friendAvatarBox: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#18181B', borderWidth: 2, borderColor: '#3B82F6', justifyContent: 'center', alignItems: 'center', overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.8, shadowRadius: 2, elevation: 5 },
  friendAvatarText: { color: '#3B82F6', fontWeight: 'bold', fontSize: 14 },
  friendMarkerName: { color: '#FAFAFA', fontSize: 10, fontWeight: 'bold' },

  customMarkerContainer: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, borderWidth: 1.5, paddingHorizontal: 6, paddingVertical: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.8, shadowRadius: 2, elevation: 5 },
  markerIconBox: { width: 22, height: 22, borderRadius: 11, justifyContent: 'center', alignItems: 'center', marginRight: 5 },
  markerTextBox: { maxWidth: 100 },
  markerTitleText: { color: '#FAFAFA', fontSize: 10, fontWeight: 'bold' },
  markerPlayersText: { fontSize: 9, fontWeight: 'bold' },
  
  pickingBanner: { position: 'absolute', top: 110, alignSelf: 'center', backgroundColor: '#EAB308', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, flexDirection: 'row', alignItems: 'center', zIndex: 50 },
  pickingBannerText: { color: '#09090B', fontWeight: 'bold', fontSize: 12 },

  bottomSheet: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '50%', backgroundColor: '#121215', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 10, borderWidth: 1, borderColor: '#27272A' },
  dragHandle: { width: 40, height: 4, backgroundColor: '#3F3F46', borderRadius: 2, alignSelf: 'center', marginBottom: 12 },
  sheetTitle: { color: '#FAFAFA', fontSize: 18, fontWeight: '900' },
  sheetSubtitle: { color: '#A1A1AA', fontSize: 12, marginBottom: 15 },

  emptyBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 30 },
  emptyNoticeText: { color: '#71717A', textAlign: 'center', marginTop: 30 },

  gameCard: { borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1 },
  gameHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  sportTag: { fontSize: 12, fontWeight: 'bold' },
  distanceTag: { color: '#A1A1AA', fontSize: 12 },
  gameTitle: { color: '#FAFAFA', fontSize: 15, fontWeight: 'bold', marginBottom: 2 },
  venueText: { color: '#D4D4D8', fontSize: 12, marginBottom: 6 },
  
  gameTimerRow: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#18181B', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, marginBottom: 8 },
  timerText: { color: '#A1A1AA', fontSize: 10, fontWeight: '600' },
  timerExpiryText: { color: '#EAB308', fontSize: 10, fontWeight: 'bold' },

  modalTimerBox: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#18181B', padding: 8, borderRadius: 8, marginBottom: 10, borderWidth: 1, borderColor: '#27272A' },
  modalTimerText: { color: '#A1A1AA', fontSize: 11, fontWeight: '600' },
  modalTimerExpiryText: { color: '#EAB308', fontSize: 11, fontWeight: 'bold' },

  gameFooterRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#18181B', paddingTop: 8 },
  spotsTag: { color: '#22C55E', fontSize: 11, fontWeight: 'bold' },
  detailsLink: { fontSize: 12, fontWeight: 'bold' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(9,9,11,0.85)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#121215', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, height: '75%', borderWidth: 1, borderColor: '#27272A' },
  modalContentLarge: { backgroundColor: '#121215', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, height: '90%', borderWidth: 1, borderColor: '#27272A' },
  
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, width: '100%' },
  modalTitle: { color: '#FAFAFA', fontSize: 18, fontWeight: 'bold' },
  
  label: { color: '#A1A1AA', fontSize: 12, fontWeight: 'bold', marginBottom: 6, alignSelf: 'flex-start' },
  input: { backgroundColor: '#09090B', borderWidth: 1, borderColor: '#27272A', borderRadius: 10, paddingHorizontal: 12, height: 44, color: '#FAFAFA', marginBottom: 14, width: '100%' },
  
  mapSearchBtn: { backgroundColor: '#EAB308', borderRadius: 10, height: 44, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 6 },
  mapSearchBtnText: { color: '#09090B', fontWeight: 'bold', fontSize: 12 },

  sportChip: { backgroundColor: '#09090B', borderWidth: 1, borderColor: '#27272A', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, marginRight: 8 },
  sportChipActive: { backgroundColor: '#18181B', borderColor: '#EAB308' },
  sportChipText: { color: '#A1A1AA', fontSize: 12, fontWeight: 'bold' },
  sportChipTextActive: { color: '#EAB308' },

  publishBtn: { backgroundColor: '#EAB308', borderRadius: 12, height: 46, justifyContent: 'center', alignItems: 'center', marginTop: 10, marginBottom: 10, width: '100%' },
  publishBtnText: { color: '#09090B', fontWeight: '900', fontSize: 15 },

  detailSportBadge: { alignSelf: 'flex-start', fontSize: 11, fontWeight: '900', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, overflow: 'hidden' },
  deleteGameBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1F1214', borderWidth: 1, borderColor: '#EF4444', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  detailTitle: { color: '#FAFAFA', fontSize: 20, fontWeight: 'bold', marginTop: 10, marginBottom: 4 },
  adminInfoText: { color: '#A1A1AA', fontSize: 12 },
  
  navigateBtn: { borderRadius: 10, height: 38, justifyContent: 'center', alignItems: 'center', marginBottom: 10, flexDirection: 'row' },
  navigateBtnText: { color: '#09090B', fontWeight: 'bold', fontSize: 13 },

  detailVenue: { color: '#D4D4D8', fontSize: 13, marginBottom: 14 },
  detailBox: { backgroundColor: '#09090B', borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#27272A' },
  detailLabel: { color: '#A1A1AA', fontSize: 12, fontWeight: 'bold', marginBottom: 6 },
  detailText: { color: '#FAFAFA', fontSize: 13 },

  adminTabsRow: { flexDirection: 'row', backgroundColor: '#18181B', borderRadius: 10, padding: 4, marginBottom: 10 },
  adminTabBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  adminTabText: { color: '#A1A1AA', fontSize: 12, fontWeight: '600' },
  
  playersChipsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  playerChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#18181B', borderWidth: 1, borderColor: '#EAB308', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  playerChipText: { color: '#FAFAFA', fontSize: 12, fontWeight: 'bold' },

  drawInput: { backgroundColor: '#121215', borderWidth: 1, borderColor: '#27272A', borderRadius: 8, width: 50, height: 36, color: '#FAFAFA', textAlign: 'center', fontSize: 13 },
  drawBtn: { flexDirection: 'row', alignItems: 'center', borderRadius: 8, paddingHorizontal: 12, height: 36 },
  drawBtnText: { color: '#09090B', fontWeight: 'bold', fontSize: 12 },

  teamResultCard: { backgroundColor: '#121215', borderWidth: 1, borderColor: '#27272A', borderRadius: 10, padding: 10, marginTop: 8 },
  teamResultHeader: { color: '#FAFAFA', fontSize: 13, fontWeight: 'bold', marginBottom: 4 },
  teamResultPlayer: { color: '#D4D4D8', fontSize: 12, marginBottom: 2 },

  matchFixtureCard: { backgroundColor: '#121215', borderWidth: 1, borderColor: '#27272A', borderRadius: 10, padding: 10, marginTop: 8 },
  matchTeamsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  matchTeamText: { color: '#FAFAFA', fontSize: 13, fontWeight: 'bold' },

  listItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#09090B', padding: 12, borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: '#27272A' },
  listAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#18181B', justifyContent: 'center', alignItems: 'center', marginRight: 12, borderWidth: 1, borderColor: '#EAB308', overflow: 'hidden' },
  listName: { color: '#FAFAFA', fontSize: 14, fontWeight: 'bold' },
  listCity: { color: '#A1A1AA', fontSize: 11, marginTop: 2 },

  chatScrollContainer: { maxHeight: 150, backgroundColor: '#09090B', borderRadius: 10, borderWidth: 1, borderColor: '#27272A', paddingHorizontal: 8, marginBottom: 8 },
  noChatText: { color: '#71717A', fontSize: 12, fontStyle: 'italic', textAlign: 'center', paddingVertical: 15 },
  chatBubble: { backgroundColor: '#18181B', padding: 8, borderRadius: 10, marginBottom: 6, borderWidth: 1, borderColor: '#27272A' },
  chatSender: { fontSize: 11, fontWeight: 'bold' },
  chatText: { color: '#FAFAFA', fontSize: 13, marginTop: 2 },
  chatTime: { color: '#A1A1AA', fontSize: 9, alignSelf: 'flex-end', marginTop: 2 },
  chatInputRowGame: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  chatInput: { flex: 1, backgroundColor: '#09090B', borderWidth: 1, borderColor: '#27272A', borderRadius: 8, height: 36, color: '#FAFAFA', paddingHorizontal: 10, fontSize: 12 },

  modalJoinBtn: { borderRadius: 12, height: 46, justifyContent: 'center', alignItems: 'center', marginTop: 10, marginBottom: 20 },
  modalJoinBtnText: { color: '#09090B', fontWeight: '900', fontSize: 15 },
  leaveBtn: { backgroundColor: '#1F1214', borderWidth: 1, borderColor: '#EF4444', borderRadius: 12, height: 46, justifyContent: 'center', alignItems: 'center', marginTop: 10, marginBottom: 20 },
  leaveBtnText: { color: '#EF4444', fontWeight: '900', fontSize: 15 },

  zoomedAvatarOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center' },
  closeZoomedBtn: { position: 'absolute', top: 50, right: 20, zIndex: 30, backgroundColor: '#121215', width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#27272A' },
  zoomedAvatarImage: { width: width * 0.9, height: width * 0.9, resizeMode: 'contain', borderRadius: 20 },

  modalOverlayCenter: { flex: 1, backgroundColor: 'rgba(9,9,11,0.85)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 },
  modalContentHomeStyle: { backgroundColor: '#09090B', borderRadius: 28, padding: 20, borderWidth: 1, borderColor: '#27272A', width: '100%', maxWidth: 420, height: '88%', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.5, shadowRadius: 16, elevation: 12 },
  modalContentCenter: { backgroundColor: '#121215', borderRadius: 28, padding: 20, borderWidth: 1, borderColor: '#27272A', width: '100%', maxWidth: 400, maxHeight: '85%', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 16, elevation: 10 },
  closeHomeModalBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#121215', borderWidth: 1, borderColor: '#27272A', justifyContent: 'center', alignItems: 'center' },

  headerProfile: { alignItems: 'center', marginBottom: 16, paddingHorizontal: 20 },
  avatarLarge: { width: 84, height: 84, borderRadius: 42, backgroundColor: '#18181B', borderWidth: 2, borderColor: '#EAB308', justifyContent: 'center', alignItems: 'center', marginBottom: 10, overflow: 'hidden' },
  avatarImage: { width: '100%', height: '100%' },
  avatarLargeText: { color: '#EAB308', fontSize: 32, fontWeight: 'bold' },
  profileName: { color: '#FAFAFA', fontSize: 20, fontWeight: '900' },
  sportsTagsRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, marginVertical: 8 },
  sportTagBadge: { backgroundColor: '#18181B', borderWidth: 1, borderColor: '#EAB308', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  sportTagText: { color: '#EAB308', fontSize: 11, fontWeight: '700' },
  profileCity: { color: '#A1A1AA', fontSize: 13, marginTop: 4 },

  statsRow: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: '#18181B', borderRadius: 16, borderWidth: 1, borderColor: '#27272A', padding: 14, marginBottom: 16 },
  statBox: { alignItems: 'center' },
  statNumber: { color: '#EAB308', fontSize: 18, fontWeight: '900' },
  statLabel: { color: '#A1A1AA', fontSize: 12, marginTop: 2, fontWeight: '600' },

  profileFollowBtn: { backgroundColor: '#EAB308', borderRadius: 12, height: 44, justifyContent: 'center', alignItems: 'center' },
  profileFollowBtnText: { color: '#09090B', fontWeight: '900', fontSize: 13 },
  profileFollowingBtn: { backgroundColor: '#18181B', borderWidth: 1, borderColor: '#EAB308' },
  profileFollowingBtnText: { color: '#EAB308' },

  chatOpenBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#EAB308', borderRadius: 12, height: 44, paddingHorizontal: 16 },
  chatOpenBtnText: { color: '#09090B', fontWeight: '900', fontSize: 13 },

  postsSectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 6, borderTopWidth: 1, borderTopColor: '#27272A', paddingTop: 14 },
  sectionTitle: { color: '#FAFAFA', fontSize: 15, fontWeight: '700' },
  postsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 2 },
  postThumbnailBox: { width: (width * 0.85) / 3 - 4, height: (width * 0.85) / 3 - 4, backgroundColor: '#121215', borderRadius: 8, overflow: 'hidden' },
  postThumbnailImage: { width: '100%', height: '100%' },
  videoBadgeOverlay: { position: 'absolute', top: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 10, width: 22, height: 22, justifyContent: 'center', alignItems: 'center' },
  emptyPostsBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 30, backgroundColor: '#18181B', borderRadius: 14, borderWidth: 1, borderColor: '#27272A' },
  emptyPostsText: { color: '#71717A', fontSize: 12, marginTop: 6 },

  chatHeaderAvatarBox: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#18181B', borderWidth: 1, borderColor: '#EAB308', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  chatHeaderTitle: { color: '#FAFAFA', fontSize: 15, fontWeight: '700' },
  chatHeaderSubTitle: { color: '#EAB308', fontSize: 11, fontWeight: '600' },
  chatBubbleRow: { marginBottom: 10, flexDirection: 'row' },
  chatBubbleRowLeft: { justifyContent: 'flex-start' },
  chatBubbleRowRight: { justifyContent: 'flex-end' },
  chatBubbleMsg: { maxWidth: '75%', padding: 12, borderRadius: 16, borderWidth: 1 },
  chatBubbleOther: { backgroundColor: '#18181B', borderColor: '#27272A' },
  chatBubbleMe: { backgroundColor: '#EAB308', borderColor: '#EAB308' },
  chatBubbleText: { color: '#FAFAFA', fontSize: 13, fontWeight: '500' },
  chatBubbleTime: { color: '#A1A1AA', fontSize: 9, marginTop: 4, alignSelf: 'flex-end' },
  chatInputRow: { flexDirection: 'row', paddingTop: 12, borderTopWidth: 1, borderTopColor: '#27272A', gap: 8, alignItems: 'center' },
  chatInputField: { flex: 1, backgroundColor: '#09090B', borderWidth: 1, borderColor: '#27272A', borderRadius: 20, height: 42, color: '#FAFAFA', paddingHorizontal: 14, fontSize: 13 },
  chatSendBtn: { backgroundColor: '#EAB308', width: 42, height: 42, borderRadius: 21, justifyContent: 'center', alignItems: 'center' },

  postCard: { backgroundColor: '#121215', borderWidth: 1, borderColor: '#27272A', borderRadius: 20, padding: 16, marginBottom: 16 },
  postHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  postAvatarBox: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#18181B', borderWidth: 1, borderColor: '#EAB308', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  avatarImg: { width: '100%', height: '100%' },
  avatarPlaceholder: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#18181B', borderWidth: 1, borderColor: '#EAB308', justifyContent: 'center', alignItems: 'center' },
  avatarPlaceholderText: { color: '#EAB308', fontSize: 16, fontWeight: 'bold' },
  postUserInfo: { marginLeft: 10, flex: 1 },
  postUserName: { color: '#FAFAFA', fontSize: 14, fontWeight: '700' },
  postUserMeta: { color: '#A1A1AA', fontSize: 11 },
  sportBadge: { backgroundColor: '#18181B', borderWidth: 1, borderColor: '#27272A', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8, marginRight: 8 },
  sportBadgeText: { color: '#EAB308', fontSize: 10, fontWeight: '700' },
  postTime: { color: '#71717A', fontSize: 11 },
  postText: { color: '#E4E4E7', fontSize: 14, marginBottom: 12, lineHeight: 20 },
  postImageBox: { height: 320, backgroundColor: '#09090B', borderRadius: 14, overflow: 'hidden', marginBottom: 12, borderWidth: 1, borderColor: '#27272A', position: 'relative' },
  postImageContent: { width: '100%', height: '100%' },
  postActionsRow: { flexDirection: 'row', gap: 20, borderTopWidth: 1, borderTopColor: '#27272A', paddingTop: 12 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionText: { color: '#A1A1AA', fontSize: 13, fontWeight: '600' },

  commentsModalContent: { backgroundColor: '#121215', borderRadius: 28, padding: 20, borderWidth: 1, borderColor: '#27272A', width: '100%', maxWidth: 400, height: '75%', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 16, elevation: 10 },
  commentRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  commentAvatar: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: '#EAB308', overflow: 'hidden' },
  commentAvatarPlaceholder: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: '#EAB308', backgroundColor: '#18181B', justifyContent: 'center', alignItems: 'center' },
  commentUser: { color: '#EAB308', fontSize: 12, fontWeight: '700' },
  commentText: { color: '#D4D4D8', fontSize: 13 },
  commentTimeText: { color: '#71717A', fontSize: 10 },
  commentInputRow: { flexDirection: 'row', gap: 8, alignItems: 'center', borderTopWidth: 1, borderTopColor: '#27272A', paddingTop: 12, marginTop: 4 },
  commentInput: { flex: 1, backgroundColor: '#09090B', borderWidth: 1, borderColor: '#27272A', borderRadius: 12, height: 42, color: '#FAFAFA', paddingHorizontal: 12, fontSize: 13 },
  commentSendBtn: { backgroundColor: '#EAB308', width: 38, height: 42, borderRadius: 12, justifyContent: 'center', alignItems: 'center' }
});