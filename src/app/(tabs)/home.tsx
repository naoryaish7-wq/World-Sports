import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useFocusEffect } from 'expo-router';
import { StyleSheet, Text, View, ScrollView, FlatList, Image, TouchableOpacity, TextInput, Modal, Alert, Dimensions, TouchableWithoutFeedback, PanResponder, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import * as ImagePicker from 'expo-image-picker';
import { doc, onSnapshot, collection, addDoc, updateDoc, deleteDoc, serverTimestamp, query, orderBy, limit, getDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db } from '../../firebase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useVideoPlayer, VideoView } from 'expo-video';

const { width, height } = Dimensions.get('window');

const activeVideoPlayers = new Set<any>();

type ThemeMode = 'dark' | 'light';

type ThemePalette = {
  bgPrimary: string;
  bgSurface: string;
  bgElevated: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  accentTextOnButton: string;
  danger: string;
  modalOverlay: string;
  storyOverlay: string;
};

const DARK_THEME: ThemePalette = {
  bgPrimary: '#09090B',
  bgSurface: '#121215',
  bgElevated: '#18181B',
  border: '#27272A',
  textPrimary: '#FAFAFA',
  textSecondary: '#E4E4E7',
  textMuted: '#A1A1AA',
  accent: '#EAB308',
  accentTextOnButton: '#09090B',
  danger: '#EF4444',
  modalOverlay: 'rgba(9,9,11,0.85)',
  storyOverlay: 'rgba(9,9,11,0.95)',
};

const LIGHT_THEME: ThemePalette = {
  bgPrimary: '#F8FAFC',
  bgSurface: '#FFFFFF',
  bgElevated: '#F1F5F9',
  border: '#E2E8F0',
  textPrimary: '#0F172A',
  textSecondary: '#334155',
  textMuted: '#64748B',
  accent: '#EAB308',
  accentTextOnButton: '#09090B',
  danger: '#DC2626',
  modalOverlay: 'rgba(15,23,42,0.55)',
  storyOverlay: 'rgba(15,23,42,0.92)',
};

type Comment = {
  id: string;
  userId?: string;
  user: string;
  avatarUrl: string;
  text: string;
  createdAt?: any;
};

type StoryComment = {
  id: string;
  user: string;
  avatarUrl: string;
  text: string;
  createdAt?: any;
};

type Post = {
  id: string;
  userId?: string;
  userEmail?: string;
  authorName: string;
  authorMeta: string;
  avatarUrl: string;
  text: string;
  imageUrl?: string;
  mediaType?: 'image' | 'video';
  sport?: string;
  likes: number;
  likesList?: string[];
  isLiked?: boolean;
  comments: Comment[];
  createdAt?: any;
};

type Story = {
  id: string;
  userUid?: string;
  name: string;
  imageUrl: string;
  mediaType?: 'image' | 'video';
  avatarUrl: string;
  caption?: string;
  captionStyle?: {
    fontSize: number;
    color: string;
    backgroundColor: string;
    fontWeight: 'normal' | 'bold';
    fontStyle: 'normal' | 'italic';
    offsetX?: number;
    offsetY?: number;
  };
  createdAt?: any;
  isMine?: boolean;
  likesList?: string[];
  viewersList?: string[];
  storyComments?: StoryComment[];
};

type GroupedStory = {
  userUid: string;
  name: string;
  avatarUrl: string;
  stories: Story[];
  isMine?: boolean;
  hasUnwatched?: boolean;
};

type AppNotification = {
  id: string;
  senderUid: string;
  type: 'follow_request' | 'like' | 'comment' | 'game_join' | 'game_leave' | 'game_deleted' | 'game_update' | 'game_chat' | 'game_created' | 'new_post_story' | 'message';
  message: string;
  isRead?: boolean;
  status?: 'pending' | 'accepted' | 'rejected';
  gameId?: string;
  createdAt?: any;
};

const sendExpoPushNotification = async (targetUserId: string, title: string, body: string, data?: any) => {
  try {
    const userDocRef = doc(db, 'users', targetUserId);
    const userSnap = await getDoc(userDocRef);
    if (!userSnap.exists()) return;

    const userData = userSnap.data();
    const pushToken = userData.pushToken;

    if (!pushToken || typeof pushToken !== 'string' || !pushToken.startsWith('ExponentPushToken[')) {
      return;
    }

    const message = {
      to: pushToken,
      sound: 'default',
      title: title,
      body: body,
      data: data || {},
    };

    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });
  } catch (error) {
    console.error('Error sending Expo push notification:', error);
  }
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

function PostVideoPlayer({ uri, isActive }: { uri: string; isActive: boolean }) {
  const player = useVideoPlayer(uri, player => {
    player.loop = true;
    player.staysActiveInBackground = false;
    player.muted = true;
  });

  useEffect(() => {
    activeVideoPlayers.add(player);
    return () => {
      activeVideoPlayers.delete(player);
      try {
        player.pause();
        player.muted = true;
      } catch (e) {}
    };
  }, [player]);

  useEffect(() => {
    try {
      if (isActive) {
        activeVideoPlayers.forEach(p => {
          if (p !== player) {
            try { 
              p.pause(); 
              p.muted = true;
            } catch (e) {}
          }
        });
        player.muted = false;
        player.play();
      } else {
        player.pause();
        player.muted = true;
        player.currentTime = 0;
      }
    } catch (e) {}
  }, [isActive, player]);

  if (!isActive) {
    return null;
  }

  return (
    <VideoView
      style={styles.postImageContent}
      player={player}
      nativeControls={true}
      contentFit="cover"
    />
  );
}

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

function StoryVideoPlayer({ uri, isActive }: { uri: string; isActive: boolean }) {
  const player = useVideoPlayer(uri, player => {
    player.loop = true;
    player.staysActiveInBackground = false;
    player.muted = true;
  });

  useEffect(() => {
    activeVideoPlayers.add(player);
    return () => {
      activeVideoPlayers.delete(player);
      try {
        player.pause();
        player.muted = true;
      } catch (e) {}
    };
  }, [player]);

  useEffect(() => {
    try {
      if (isActive) {
        activeVideoPlayers.forEach(otherPlayer => {
          if (otherPlayer !== player) {
            try { otherPlayer.pause(); otherPlayer.muted = true; } catch (e) {}
          }
        });
        player.muted = false;
        player.play();
      } else {
        player.pause();
        player.muted = true;
        player.currentTime = 0;
      }
    } catch (e) {}
  }, [isActive, player]);

  return (
    <VideoView
      style={styles.fullStoryVideo}
      player={player}
      nativeControls={false}
      contentFit="contain"
    />
  );
}

export default function HomeScreen() {
  const { user } = useAuth();
  const [isScreenFocused, setIsScreenFocused] = useState(true);
  const [themeMode, setThemeMode] = useState<ThemeMode>('dark');

  const palette = themeMode === 'light' ? LIGHT_THEME : DARK_THEME;
  const themedStyles = useMemo(() => createThemedStyles(palette), [palette]);

  useFocusEffect(
    useCallback(() => {
      setIsScreenFocused(true);
      AsyncStorage.getItem('@world_sports_theme_mode')
        .then(savedTheme => {
          if (savedTheme === 'light' || savedTheme === 'dark') {
            setThemeMode(savedTheme);
          }
        })
        .catch(() => {});

      return () => {
        setIsScreenFocused(false);
        stopAllVideos();
        setActiveGroupIndex(null);
      };
    }, [])
  );

  const [liveAvatar, setLiveAvatar] = useState(user?.avatarUrl || '');
  const [liveName, setLiveName] = useState(user?.name || 'Player');
  const [liveMeta, setLiveMeta] = useState('Israel, Netanya');
  const [userSports, setUserSports] = useState<string[]>([]);
  const [followingList, setFollowingList] = useState<string[]>([]);
  const [pendingRequestsList, setPendingRequestsList] = useState<string[]>([]);
  const [blockedUsersList, setBlockedUsersList] = useState<string[]>([]);
  const [currentUserId, setCurrentUserId] = useState('');
  const [allUsersList, setAllUsersList] = useState<any[]>([]);
  const [liveUserData, setLiveUserData] = useState<any>(null);

  const [notificationsModalVisible, setNotificationsModalVisible] = useState(false);
  const [notificationsList, setNotificationsList] = useState<AppNotification[]>([]);

  const [zoomedAvatarUri, setZoomedAvatarUri] = useState<string | null>(null);
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);

  const appLoadTimeRef = useRef<number>(Date.now());

  const isBlockedBidirectional = useCallback((otherUserId?: string, otherUserName?: string): boolean => {
    const cleanName = (otherUserName || '').trim().toLowerCase();
    const resolvedOther = allUsersList.find(
      u => (otherUserId && u.uid === otherUserId) || (cleanName && u.name?.trim().toLowerCase() === cleanName)
    );
    const resolvedUid = resolvedOther?.uid || otherUserId;
    if (!resolvedUid || resolvedUid === currentUserId) return false;

    const iBlockedThem = blockedUsersList.includes(resolvedUid);
    const theyBlockedMe = Array.isArray(resolvedOther?.blockedUsers) && currentUserId
      ? resolvedOther.blockedUsers.includes(currentUserId)
      : false;

    return iBlockedThem || theyBlockedMe;
  }, [allUsersList, blockedUsersList, currentUserId]);

  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      setTick(t => t + 1);
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot: any) => {
      const users = snapshot.docs.map((docSnap: any) => ({
        uid: docSnap.id,
        ...(docSnap.data() as any)
      }));
      setAllUsersList(users);
    });
    return () => unsubUsers();
  }, []);

  useEffect(() => {
    let isMounted = true;
    const syncThemeFromStorage = async () => {
      try {
        const savedTheme = await AsyncStorage.getItem('@world_sports_theme_mode');
        if (isMounted && (savedTheme === 'light' || savedTheme === 'dark')) {
          setThemeMode(savedTheme);
        }
      } catch {}
    };

    syncThemeFromStorage();
    const themePoll = setInterval(syncThemeFromStorage, 1000);

    return () => {
      isMounted = false;
      clearInterval(themePoll);
    };
  }, []);

  useEffect(() => {
    let unsubscribeDoc: (() => void) | undefined;

    const fetchLiveUserData = async () => {
      try {
        const savedEmail = await AsyncStorage.getItem('@saved_user_email');
        const resolvedId = savedEmail
          ? savedEmail.toLowerCase().replace(/[^a-z0-9]/g, '_')
          : (user?.id || '');

        if (resolvedId) {
          setCurrentUserId(resolvedId);
          unsubscribeDoc = onSnapshot(doc(db, 'users', resolvedId), (docSnap: any) => {
            if (docSnap.exists()) {
              const data = docSnap.data();
              setLiveUserData({ uid: docSnap.id, ...data });
              if (data.themeMode === 'light' || data.themeMode === 'dark') {
                setThemeMode(data.themeMode);
                AsyncStorage.setItem('@world_sports_theme_mode', data.themeMode).catch(() => {});
              }
              if (data.avatar !== undefined) setLiveAvatar(data.avatar);
              if (data.name) setLiveName(data.name);
              if (data.country && data.city) {
                setLiveMeta(`${data.country}, ${data.city} `);
              }
              if (data.sports) {
                setUserSports(data.sports);
              } else if (data.sport) {
                setUserSports([data.sport]);
              }
              if (data.following) {
                setFollowingList(data.following);
              }
              if (data.pendingRequests) {
                setPendingRequestsList(data.pendingRequests);
              }
              setBlockedUsersList(Array.isArray(data.blockedUsers) ? data.blockedUsers : []);
            }
          });
        }
      } catch (e) {
        console.error('Error fetching live user data in Home', e);
      }
    };

    fetchLiveUserData();
    return () => {
      if (unsubscribeDoc) unsubscribeDoc();
    };
  }, [user?.id]);

  useEffect(() => {
    if (!currentUserId) return;
    const notifRef = collection(db, 'users', currentUserId, 'notifications');
    const q = query(notifRef, orderBy('createdAt', 'desc'));

    const unsubscribeNotifs = onSnapshot(q, (snapshot) => {
      const loadedNotifs: AppNotification[] = snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...(docSnap.data() as any)
      }));
      setNotificationsList(loadedNotifs);
    }, (error) => {
      console.error('Error listening to notifications:', error);
    });

    return () => unsubscribeNotifs();
  }, [currentUserId]);

  const [stories, setStories] = useState<Story[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [storyCommentInput, setStoryCommentInput] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'stories'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot: any) => {
      const now = new Date().getTime();
      const storiesList: Story[] = [];

      snapshot.docChanges().forEach(async (change: any) => {
        if (change.type === 'added' && currentUserId) {
          const sData = change.doc.data();
          const sAuthorUid = sData.userUid;
          const sCreatedAt = sData.createdAt?.toMillis ? sData.createdAt.toMillis() : (sData.createdAt?.seconds ? sData.createdAt.seconds * 1000 : Date.now());

          if (
            sAuthorUid &&
            sAuthorUid !== currentUserId &&
            followingList.includes(sAuthorUid) &&
            !isBlockedBidirectional(sAuthorUid, sData.name) &&
            sCreatedAt > appLoadTimeRef.current
          ) {
            try {
              const msg = `${sData.name || 'Someone'} uploaded a new story! 📸`;
              await addDoc(collection(db, 'users', currentUserId, 'notifications'), {
                senderUid: sAuthorUid,
                type: 'new_post_story',
                message: msg,
                createdAt: serverTimestamp()
              });
              await sendExpoPushNotification(currentUserId, 'World Sports ', msg);
            } catch (e) {
              console.error('Error adding story notification:', e);
            }
          }
        }
      });

      snapshot.docs.forEach((docSnap: any) => {
        const data = docSnap.data();
        const createdAtDate = data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt || now);
        const diffHours = (now - createdAtDate.getTime()) / (1000 * 60 * 60);

        if (diffHours <= 24) {
          const authorDoc = allUsersList.find(u => u.uid === data.userUid || u.name === data.name);
          const resolvedAvatar = authorDoc?.avatar || data.avatarUrl || '';
          const isMineStory = (!!currentUserId && data.userUid === currentUserId) || (!!liveName && data.name === liveName);

          if (!isMineStory && isBlockedBidirectional(data.userUid, data.name)) {
            return;
          }

          if (isMineStory || followingList.includes(data.userUid)) {
            storiesList.push({
              id: docSnap.id,
              userUid: data.userUid || authorDoc?.uid,
              name: data.name,
              imageUrl: data.imageUrl,
              mediaType: data.mediaType || 'image',
              avatarUrl: resolvedAvatar,
              caption: data.caption,
              captionStyle: data.captionStyle,
              createdAt: data.createdAt,
              isMine: isMineStory,
              likesList: data.likesList || [],
              viewersList: data.viewersList || [],
              storyComments: data.storyComments || []
            });
          }
        }
      });
      setStories(storiesList);
    });
    return () => unsubscribe();
  }, [currentUserId, liveName, allUsersList, followingList, isBlockedBidirectional]);

  useEffect(() => {
    const q = query(
      collection(db, 'posts'), 
      orderBy('createdAt', 'desc'),
      limit(15)
    );
    const unsubscribe = onSnapshot(q, (snapshot: any) => {
      snapshot.docChanges().forEach(async (change: any) => {
        if (change.type === 'added' && currentUserId) {
          const pData = change.doc.data();
          const pAuthorUid = pData.userId;
          const pAuthorName = pData.authorName || pData.userName;
          const pCreatedAt = pData.createdAt?.toMillis ? pData.createdAt.toMillis() : (pData.createdAt?.seconds ? pData.createdAt.seconds * 1000 : Date.now());

          if (
            pAuthorUid &&
            pAuthorUid !== currentUserId &&
            followingList.includes(pAuthorUid) &&
            !isBlockedBidirectional(pAuthorUid, pAuthorName) &&
            pCreatedAt > appLoadTimeRef.current
          ) {
            try {
              const msg = `${pAuthorName || 'Someone'} published a new post! 🚀`;
              await addDoc(collection(db, 'users', currentUserId, 'notifications'), {
                senderUid: pAuthorUid,
                type: 'new_post_story',
                message: msg,
                createdAt: serverTimestamp()
              });
              await sendExpoPushNotification(currentUserId, 'World Sports ⚽', msg);
            } catch (e) {
              console.error('Error adding post notification:', e);
            }
          }
        }
      });

      const postsList: Post[] = snapshot.docs.map((docSnap: any) => {
        const data = docSnap.data();
        const likesList = data.likesList || [];
        
        const authorDoc = allUsersList.find(u => u.uid === data.userId || u.name === (data.userName || data.authorName));
        const resolvedAvatar = authorDoc?.avatar || data.avatarUrl || '';

        return {
          id: docSnap.id,
          userId: data.userId || authorDoc?.uid,
          userEmail: data.userEmail,
          authorName: data.userName || data.authorName || 'Player',
          authorMeta: data.authorMeta || 'Israel, Netanya',
          avatarUrl: resolvedAvatar,
          text: data.caption || data.text || '',
          imageUrl: data.imageUrl || undefined,
          mediaType: data.mediaType || 'image',
          sport: data.sport || 'Football',
          likes: likesList.length,
          likesList: likesList,
          isLiked: currentUserId ? likesList.includes(currentUserId) : false,
          comments: data.comments || [],
          createdAt: data.createdAt,
        };
      });
      setPosts(postsList);
    }, (error) => {
      console.error('Error listening to posts:', error);
    });
    return () => unsubscribe();
  }, [currentUserId, allUsersList, followingList, isBlockedBidirectional]);

  const [activeGroupIndex, setActiveGroupIndex] = useState<number | null>(null);
  const [activeStoryInGroupIndex, setActiveStoryInGroupIndex] = useState<number>(0);
  
  const progressAnim = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<Animated.CompositeAnimation | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const progressValueRef = useRef(0);

  const rawGroupedStories: GroupedStory[] = [];
  const myStories = stories.filter(s => s.isMine || (!!currentUserId && s.userUid === currentUserId) || (!!liveName && s.name === liveName));
  
  const otherStories = stories.filter(s => {
    if (s.isMine || (!!currentUserId && s.userUid === currentUserId) || (!!liveName && s.name === liveName)) return false;
    if (isBlockedBidirectional(s.userUid, s.name)) return false;
    const isFollowed = s.userUid ? followingList.includes(s.userUid) : false;
    return isFollowed;
  });

  if (myStories.length > 0) {
    const hasUnwatchedMine = myStories.some(st => {
      const viewers = st.viewersList || [];
      return !viewers.includes(currentUserId);
    });
    rawGroupedStories.push({
      userUid: currentUserId || 'mine',
      name: liveName,
      avatarUrl: liveAvatar,
      stories: myStories,
      isMine: true,
      hasUnwatched: hasUnwatchedMine
    });
  }

  const otherUsersMap = new Map<string, Story[]>();
  otherStories.forEach(st => {
    const key = st.userUid || st.name;
    if (!otherUsersMap.has(key)) {
      otherUsersMap.set(key, []);
    }
    otherUsersMap.get(key)?.push(st);
  });

  otherUsersMap.forEach((userStoriesList, key) => {
    const hasUnwatched = userStoriesList.some(st => {
      const viewers = st.viewersList || [];
      const isOwner = st.isMine || st.userUid === currentUserId;
      return !isOwner && !viewers.includes(currentUserId);
    });

    rawGroupedStories.push({
      userUid: key,
      name: userStoriesList[0].name,
      avatarUrl: userStoriesList[0].avatarUrl,
      stories: userStoriesList,
      isMine: false,
      hasUnwatched
    });
  });

  const groupedStories = [...rawGroupedStories].sort((a, b) => {
    if (a.hasUnwatched && !b.hasUnwatched) return -1;
    if (!a.hasUnwatched && b.hasUnwatched) return 1;
    return 0;
  });

  useEffect(() => {
    const id = progressAnim.addListener(({ value }) => {
      progressValueRef.current = value;
    });
    return () => {
      progressAnim.removeListener(id);
    };
  }, []);

  const recordStoryView = async (story: Story) => {
    if (!currentUserId || story.isMine || story.userUid === currentUserId) return;
    const viewers = story.viewersList || [];
    if (!viewers.includes(currentUserId)) {
      try {
        const storyRef = doc(db, 'stories', story.id);
        await updateDoc(storyRef, {
          viewersList: arrayUnion(currentUserId)
        });
      } catch (e) {
        console.error('Error recording story view:', e);
      }
    }
  };

  const startStoryTimer = (startValue: number = 0) => {
    if (timerRef.current) timerRef.current.stop();

    const remainingDuration = (1 - startValue) * 5000;
    if (remainingDuration <= 0) {
      handleNextStoryInGroup();
      return;
    }

    timerRef.current = Animated.timing(progressAnim, {
      toValue: 1,
      duration: remainingDuration,
      useNativeDriver: false,
    });

    timerRef.current.start(({ finished }) => {
      if (finished) {
        progressValueRef.current = 0;
        progressAnim.setValue(0);
        handleNextStoryInGroup();
      }
    });
  };

  useEffect(() => {
    if (activeGroupIndex === null) {
      if (timerRef.current) timerRef.current.stop();
      setIsPaused(false);
      progressAnim.setValue(0);
      progressValueRef.current = 0;
      return;
    }

    const currentGroup = groupedStories[activeGroupIndex];
    if (currentGroup && currentGroup.stories[activeStoryInGroupIndex]) {
      recordStoryView(currentGroup.stories[activeStoryInGroupIndex]);
    }

    startStoryTimer(progressValueRef.current);

    return () => {
      if (timerRef.current) timerRef.current.stop();
    };
  }, [activeGroupIndex, activeStoryInGroupIndex]);

  const handlePressInStory = () => {
    setIsPaused(true);
    if (timerRef.current) timerRef.current.stop();
    progressAnim.stopAnimation((value) => {
      progressValueRef.current = value;
    });
  };

  const handlePressOutStory = () => {
    setIsPaused(false);
    startStoryTimer(progressValueRef.current);
  };

  const [selectedUserModalId, setSelectedUserModalId] = useState<string | null>(null);
  const [targetProfileUser, setTargetProfileUser] = useState<any | null>(null);
  const [targetUserPosts, setTargetUserPosts] = useState<Post[]>([]);
  const [targetActiveModalList, setTargetActiveModalList] = useState<'followers' | 'following' | null>(null);

  const [selectedPostModal, setSelectedPostModal] = useState<Post | null>(null);
  const [commentsModalPost, setCommentsModalPost] = useState<Post | null>(null);
  const [modalCommentInput, setModalCommentInput] = useState('');

  const stopAllVideos = () => {
    activeVideoPlayers.forEach(p => {
      try {
        p.pause();
        p.muted = true;
        p.currentTime = 0;
      } catch (e) {}
    });
    setActiveVideoId(null);
  };

  useEffect(() => {
    if (!isScreenFocused) {
      stopAllVideos();
      setActiveGroupIndex(null);
    }
  }, [isScreenFocused]);

  const openUserProfileById = useCallback((userId?: string, playerName?: string) => {
    const cleanUserId = (userId || '').trim();
    const cleanPlayerName = (playerName || '').trim().toLowerCase();
    const myCurrentName = (liveName || '').trim().toLowerCase();

    if (cleanUserId && currentUserId && cleanUserId === currentUserId) {
      return;
    }

    let foundUser = cleanUserId
      ? allUsersList.find(u => u.uid === cleanUserId)
      : undefined;

    if (!foundUser && cleanPlayerName) {
      foundUser = allUsersList.find(u => (u.name || '').trim().toLowerCase() === cleanPlayerName);
    }

    const resolvedTargetId = foundUser?.uid || cleanUserId;
    if (!resolvedTargetId) {
      return;
    }

    if (currentUserId && resolvedTargetId === currentUserId) {
      return;
    }

    if (!cleanUserId && cleanPlayerName && myCurrentName && cleanPlayerName === myCurrentName) {
      return;
    }

    stopAllVideos();
    setActiveGroupIndex(null);
    setTargetActiveModalList(null);
    setSelectedPostModal(null);
    setCommentsModalPost(null);
    setNotificationsModalVisible(false);

    if (foundUser) {
      setTargetProfileUser(foundUser);
    }
    setSelectedUserModalId(resolvedTargetId);
  }, [allUsersList, currentUserId, liveName]);

  useEffect(() => {
    if (!selectedUserModalId) {
      setTargetProfileUser(null);
      setTargetUserPosts([]);
      return;
    }

    const unsubscribe = onSnapshot(doc(db, 'users', selectedUserModalId), (userSnap: any) => {
      if (userSnap.exists()) {
        setTargetProfileUser({ uid: userSnap.id, ...(userSnap.data() as any) });
      } else {
        const cached = allUsersList.find(u => u.uid === selectedUserModalId);
        if (cached) {
          setTargetProfileUser(cached);
        }
      }
    }, (e) => {
      console.error('Error fetching target user:', e);
    });

    return () => unsubscribe();
  }, [selectedUserModalId, allUsersList]);

  const handleToggleBlockTargetUser = async () => {
    if (!targetProfileUser || !currentUserId || !targetProfileUser.uid || targetProfileUser.uid === currentUserId) {
      return;
    }

    const targetUid = targetProfileUser.uid;
    const alreadyBlocked = blockedUsersList.includes(targetUid);

    if (alreadyBlocked) {
      Alert.alert(
        'Unblock User',
        `Are you sure you want to unblock ${targetProfileUser.name || 'this user'}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Unblock',
            onPress: async () => {
              try {
                await updateDoc(doc(db, 'users', currentUserId), {
                  blockedUsers: arrayRemove(targetUid),
                });
                setBlockedUsersList(prev => prev.filter(id => id !== targetUid));
                Alert.alert('User Unblocked', 'You can now see and interact with this user again.');
              } catch (e) {
                console.error('Error unblocking user:', e);
                Alert.alert('Error', 'Could not unblock user.');
              }
            },
          },
        ]
      );
      return;
    }

    Alert.alert(
      'Block User',
      `Block ${targetProfileUser.name || 'this user'}? You won't see each other's content or communicate with each other.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: async () => {
            try {
              await updateDoc(doc(db, 'users', currentUserId), {
                blockedUsers: arrayUnion(targetUid),
                following: arrayRemove(targetUid),
                followers: arrayRemove(targetUid),
                pendingRequests: arrayRemove(targetUid),
              });

              await updateDoc(doc(db, 'users', targetUid), {
                following: arrayRemove(currentUserId),
                followers: arrayRemove(currentUserId),
                pendingRequests: arrayRemove(currentUserId),
              });

              setBlockedUsersList(prev => (prev.includes(targetUid) ? prev : [...prev, targetUid]));
              setFollowingList(prev => prev.filter(id => id !== targetUid));
              Alert.alert('User Blocked', 'This user has been blocked and hidden.');
            } catch (e) {
              console.error('Error blocking user:', e);
              Alert.alert('Error', 'Could not block user.');
            }
          },
        },
      ]
    );
  };

  useEffect(() => {
    if (!targetProfileUser) {
      setTargetUserPosts([]);
      return;
    }

    if (isBlockedBidirectional(targetProfileUser.uid, targetProfileUser.name)) {
      setTargetUserPosts([]);
      return;
    }

    const normalize = (value?: string) => (value || '').trim().toLowerCase();
    const targetUid = normalize(targetProfileUser.uid);
    const targetName = normalize(targetProfileUser.name);
    const targetEmail = normalize(targetProfileUser.email || targetProfileUser.userEmail);
    const targetEmailId = targetEmail ? targetEmail.replace(/[^a-z0-9]/g, '_') : '';

    const unsubscribe = onSnapshot(collection(db, 'posts'), (snapshot: any) => {
      const profilePosts: Post[] = snapshot.docs.map((docSnap: any) => {
        const data = docSnap.data();
        const likesList = data.likesList || [];
        return {
          id: docSnap.id,
          userId: data.userId,
          userEmail: data.userEmail,
          authorName: data.userName || data.authorName || 'Player',
          authorMeta: data.authorMeta || 'Israel, Netanya',
          avatarUrl: data.avatarUrl || targetProfileUser.avatar || '',
          text: data.caption || data.text || '',
          imageUrl: data.imageUrl || undefined,
          mediaType: data.mediaType || 'image',
          sport: data.sport || 'Football',
          likes: likesList.length,
          likesList,
          isLiked: currentUserId ? likesList.includes(currentUserId) : false,
          comments: data.comments || [],
          createdAt: data.createdAt,
        };
      }).filter((post: any) => {
        const postUserId = normalize(post.userId);
        const postEmail = normalize(post.userEmail);
        const postName = normalize(post.authorName);
        const postEmailId = postEmail ? postEmail.replace(/[^a-z0-9]/g, '_') : '';

        return (
          (!!targetUid && postUserId === targetUid) ||
          (!!targetEmail && postEmail === targetEmail) ||
          (!!targetEmailId && (postUserId === targetEmailId || postEmailId === targetEmailId)) ||
          (!!targetName && postName === targetName)
        );
      });

      const getPostTime = (value: any) => {
        if (!value) return 0;
        if (typeof value.toMillis === 'function') return value.toMillis();
        if (typeof value.toDate === 'function') return value.toDate().getTime();
        const time = new Date(value).getTime();
        return Number.isNaN(time) ? 0 : time;
      };

      profilePosts.sort((a, b) => getPostTime(b.createdAt) - getPostTime(a.createdAt));
      setTargetUserPosts(profilePosts);
    }, (error: any) => {
      console.error('Error loading profile posts:', error);
      setTargetUserPosts([]);
    });

    return () => unsubscribe();
  }, [targetProfileUser, currentUserId, isBlockedBidirectional]);

  const handleAcceptRequest = async (notifId: string, requesterUid: string) => {
    if (!currentUserId) return;
    if (isBlockedBidirectional(requesterUid)) {
      Alert.alert('Blocked', 'You cannot accept requests from a blocked user.');
      return;
    }
    try {
      const myRef = doc(db, 'users', currentUserId);
      const requesterRef = doc(db, 'users', requesterUid);
      const notifRef = doc(db, 'users', currentUserId, 'notifications', notifId);

      await updateDoc(myRef, {
        followers: arrayUnion(requesterUid),
        pendingRequests: arrayRemove(requesterUid)
      });

      await updateDoc(requesterRef, {
        following: arrayUnion(currentUserId)
      });

      await updateDoc(notifRef, {
        status: 'accepted',
        message: 'You accepted this follow request.'
      });

      setPendingRequestsList(prev => prev.filter(id => id !== requesterUid));
      if (targetProfileUser && targetProfileUser.uid === requesterUid) {
        setTargetProfileUser({
          ...targetProfileUser,
          followers: [...(targetProfileUser.followers || []), currentUserId],
          pendingRequests: targetProfileUser.pendingRequests?.filter((id: string) => id !== currentUserId)
        });
      }

      const acceptMsg = `${liveName} accepted your follow request. 🎉`;
      await addDoc(collection(db, 'users', requesterUid, 'notifications'), {
        senderUid: currentUserId,
        type: 'follow_request',
        message: acceptMsg,
        status: 'accepted',
        createdAt: serverTimestamp()
      });
      await sendExpoPushNotification(requesterUid, 'World Sports ⚽', acceptMsg);

      Alert.alert('Success', 'Follow request approved! 🎉');
    } catch (error) {
      console.error('Error accepting request:', error);
      Alert.alert('Error', 'Could not accept the request.');
    }
  };

  const handleRejectRequest = async (notifId: string, requesterUid: string) => {
    if (!currentUserId) return;
    try {
      const myRef = doc(db, 'users', currentUserId);
      const notifRef = doc(db, 'users', currentUserId, 'notifications', notifId);

      await updateDoc(myRef, {
        pendingRequests: arrayRemove(requesterUid)
      });

      await updateDoc(notifRef, {
        status: 'rejected',
        message: 'You declined this follow request.'
      });

      setPendingRequestsList(prev => prev.filter(id => id !== requesterUid));
      if (targetProfileUser && targetProfileUser.uid === requesterUid) {
        setTargetProfileUser({
          ...targetProfileUser,
          pendingRequests: targetProfileUser.pendingRequests?.filter((id: string) => id !== currentUserId)
        });
      }

      Alert.alert('Request Declined', 'The follow request was updated.');
    } catch (error) {
      console.error('Error rejecting request:', error);
      Alert.alert('Error', 'Could not decline the request.');
    }
  };

  const handleToggleFollowTarget = async () => {
    if (!targetProfileUser || !currentUserId || !targetProfileUser.uid) return;

    if (isBlockedBidirectional(targetProfileUser.uid, targetProfileUser.name)) {
      Alert.alert('Unavailable', 'You cannot follow this user because a block is active.');
      return;
    }

    try {
      const myRef = doc(db, 'users', currentUserId);
      const targetRef = doc(db, 'users', targetProfileUser.uid);

      const [mySnap, targetSnap] = await Promise.all([getDoc(myRef), getDoc(targetRef)]);
      if (!targetSnap.exists()) {
        Alert.alert('Error', 'This account could not be found.');
        return;
      }

      const myData = mySnap.exists() ? mySnap.data() : {};
      const targetData = targetSnap.data();
      const targetFollowers: string[] = targetData.followers || [];
      const myFollowing: string[] = myData.following || [];
      const targetPending: string[] = targetData.pendingRequests || [];
      const isApproved = targetFollowers.includes(currentUserId) || myFollowing.includes(targetProfileUser.uid);
      const hasRequested = targetPending.includes(currentUserId);
      const isPrivateAccount = targetData.isPrivate === true;

      if (isApproved) {
        await updateDoc(targetRef, { followers: arrayRemove(currentUserId) });
        await updateDoc(myRef, { following: arrayRemove(targetProfileUser.uid) });
        setFollowingList(prev => prev.filter(id => id !== targetProfileUser.uid));
        setTargetProfileUser({
          ...targetProfileUser,
          followers: targetFollowers.filter(id => id !== currentUserId),
          pendingRequests: targetPending
        });
      } else if (hasRequested) {
        await updateDoc(targetRef, { pendingRequests: arrayRemove(currentUserId) });
        setTargetProfileUser({
          ...targetProfileUser,
          pendingRequests: targetPending.filter(id => id !== currentUserId)
        });
      } else if (isPrivateAccount) {
        await updateDoc(targetRef, { pendingRequests: arrayUnion(currentUserId) });
        
        const reqMsg = `${liveName} requested to follow you.`;
        await addDoc(collection(db, 'users', targetProfileUser.uid, 'notifications'), {
          senderUid: currentUserId,
          type: 'follow_request',
          message: reqMsg,
          status: 'pending',
          createdAt: serverTimestamp()
        });
        await sendExpoPushNotification(targetProfileUser.uid, 'World Sports ⚽', reqMsg);

        setTargetProfileUser({
          ...targetProfileUser,
          pendingRequests: [...targetPending, currentUserId]
        });
        Alert.alert('Request sent', 'Your follow request was sent.');
      } else {
        await updateDoc(targetRef, { followers: arrayUnion(currentUserId) });
        await updateDoc(myRef, { following: arrayUnion(targetProfileUser.uid) });
        setFollowingList(prev => prev.includes(targetProfileUser.uid) ? prev : [...prev, targetProfileUser.uid]);
        setTargetProfileUser({
          ...targetProfileUser,
          followers: [...targetFollowers, currentUserId]
        });

        const followMsg = `${liveName} started following you.`;
        await addDoc(collection(db, 'users', targetProfileUser.uid, 'notifications'), {
          senderUid: currentUserId,
          type: 'follow_request',
          message: followMsg,
          status: 'accepted',
          createdAt: serverTimestamp()
        });
        await sendExpoPushNotification(targetProfileUser.uid, 'World Sports ⚽', followMsg);
      }
    } catch (error) {
      console.error('Error updating follow status / sending follow request notification:', error);
      Alert.alert('Error', 'Could not update follow status. Please try again.');
    }
  };

  const handleReportPost = async (postId: string) => {
    Alert.alert(
      'Report Post',
      'Are you sure you want to report this post for inappropriate content?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Report', 
          style: 'destructive', 
          onPress: async () => {
            try {
              if (currentUserId) {
                await addDoc(collection(db, 'reports'), {
                  postId: postId,
                  reporterId: currentUserId,
                  createdAt: serverTimestamp(),
                  status: 'pending'
                });
              }
              Alert.alert('Thank You', 'The report has been submitted to administration. We will review it shortly.');
            } catch (e) {
              console.error('Error reporting post:', e);
              Alert.alert('Error', 'Could not submit report.');
            }
          } 
        }
      ]
    );
  };

  const handleReportStory = async (storyId: string) => {
    Alert.alert(
      'Report Story',
      'Are you sure you want to report this story for inappropriate content?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Report', 
          style: 'destructive', 
          onPress: async () => {
            try {
              if (currentUserId) {
                await addDoc(collection(db, 'reports'), {
                  storyId: storyId,
                  reporterId: currentUserId,
                  createdAt: serverTimestamp(),
                  status: 'pending'
                });
              }
              Alert.alert('Thank You', 'The report has been submitted to administration. We will review it shortly.');
            } catch (e) {
              console.error('Error reporting story:', e);
              Alert.alert('Error', 'Could not submit report.');
            }
          } 
        }
      ]
    );
  };

  const [storyModalVisible, setStoryModalVisible] = useState(false);
  const [selectedStoryUri, setSelectedStoryUri] = useState<string | null>(null);
  const [storyMediaType, setStoryMediaType] = useState<'image' | 'video'>('image');
  const [storyCaption, setStoryCaption] = useState('');
  
  const [storyFontSize, setStoryFontSize] = useState<number>(20);
  const [storyTextColor, setStoryTextColor] = useState<string>('#ffffff');
  const [storyBgColor, setStoryBgColor] = useState<string>('rgba(0,0,0,0.6)');
  const [storyFontWeight, setStoryFontWeight] = useState<'normal' | 'bold'>('bold');
  const [storyFontStyle, setStoryFontStyle] = useState<'normal' | 'italic'>('normal');

  const pan = useRef(new Animated.ValueXY()).current;
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: Animated.event(
        [null, { dx: pan.x, dy: pan.y }],
        { useNativeDriver: false }
      ),
      onPanResponderRelease: () => {
        pan.flattenOffset();
      },
      onPanResponderGrant: () => {
        pan.setOffset({
          x: (pan.x as any)._value,
          y: (pan.y as any)._value,
        });
        pan.setValue({ x: 0, y: 0 });
      },
    })
  ).current;

  const [createPostVisible, setCreatePostVisible] = useState(false);
  const [newPostText, setNewPostText] = useState('');
  const [newPostImage, setNewPostImage] = useState<string | null>(null);
  const [newPostMediaType, setNewPostMediaType] = useState<'image' | 'video'>('image');
  const [selectedPostSport, setSelectedPostSport] = useState<string>('');

  const lastTapRef = useRef<{ [postId: string]: number }>({});

  const handleDoubleTap = (postId: string) => {
    const now = Date.now();
    const DOUBLE_TAP_DELAY = 300;
    const lastTap = lastTapRef.current[postId] || 0;

    if (now - lastTap < DOUBLE_TAP_DELAY) {
      toggleLike(postId);
    }
    lastTapRef.current[postId] = now;
  };

  const toggleLike = async (postId: string) => {
    if (!currentUserId) return;
    const post = posts.find(p => p.id === postId);
    if (!post) return;
    if (isBlockedBidirectional(post.userId, post.authorName)) return;

    try {
      const postRef = doc(db, 'posts', postId);
      const currentLikesList = post.likesList || [];
      const hasLiked = currentLikesList.includes(currentUserId);

      let updatedLikesList = hasLiked 
        ? currentLikesList.filter(id => id !== currentUserId)
        : [...currentLikesList, currentUserId];

      await updateDoc(postRef, {
        likesList: updatedLikesList
      });

      if (!hasLiked && post.userId && post.userId !== currentUserId) {
        const likeMsg = `${liveName} liked your post. ❤️`;
        await addDoc(collection(db, 'users', post.userId, 'notifications'), {
          senderUid: currentUserId,
          type: 'like',
          message: likeMsg,
          createdAt: serverTimestamp(),
          status: 'unread'
        });
        await sendExpoPushNotification(post.userId, 'World Sports ⚽', likeMsg);
      }

      if (selectedPostModal && selectedPostModal.id === postId) {
        setSelectedPostModal({
          ...selectedPostModal,
          likesList: updatedLikesList,
          likes: updatedLikesList.length,
          isLiked: currentUserId ? updatedLikesList.includes(currentUserId) : false
        });
      }
      if (commentsModalPost && commentsModalPost.id === postId) {
        setCommentsModalPost({
          ...commentsModalPost,
          likesList: updatedLikesList,
          likes: updatedLikesList.length,
          isLiked: currentUserId ? updatedLikesList.includes(currentUserId) : false
        });
      }
    } catch (e) {
      console.error('Error toggling like:', e);
    }
  };

  const toggleStoryLike = async (storyId: string) => {
    if (!currentUserId) return;
    const story = stories.find(s => s.id === storyId);
    if (!story) return;
    if (isBlockedBidirectional(story.userUid, story.name)) return;

    try {
      const storyRef = doc(db, 'stories', storyId);
      const likesList = story.likesList || [];
      const hasLiked = likesList.includes(currentUserId);
      const updatedLikes = hasLiked
        ? likesList.filter(id => id !== currentUserId)
        : [...likesList, currentUserId];

      await updateDoc(storyRef, { likesList: updatedLikes });

      if (!hasLiked && story.userUid && story.userUid !== currentUserId) {
        const storyLikeMsg = `${liveName} liked your story. ❤️`;
        await addDoc(collection(db, 'users', story.userUid, 'notifications'), {
          senderUid: currentUserId,
          type: 'like',
          message: storyLikeMsg,
          createdAt: serverTimestamp(),
          status: 'unread'
        });
        await sendExpoPushNotification(story.userUid, 'World Sports ⚽', storyLikeMsg);
      }
    } catch (e) {
      console.error('Error toggling story like:', e);
    }
  };

  const handleAddStoryComment = async (storyId: string) => {
    if (!storyCommentInput || !storyCommentInput.trim()) return;
    const newComment: StoryComment = {
      id: Date.now().toString(),
      user: liveName,
      avatarUrl: liveAvatar || '',
      text: storyCommentInput.trim(),
      createdAt: new Date()
    };

    try {
      const storyRef = doc(db, 'stories', storyId);
      const story = stories.find(s => s.id === storyId);
      if (story) {
        if (isBlockedBidirectional(story.userUid, story.name)) {
          Alert.alert('Blocked', 'You cannot reply to this story because a block is active.');
          return;
        }
        const currentComments = story.storyComments || [];
        const updatedStoryComments = [...currentComments, newComment];
        await updateDoc(storyRef, { storyComments: updatedStoryComments });
        
        if (story.userUid && story.userUid !== currentUserId) {
          const replyMsg = `${liveName} replied to your story: "${storyCommentInput.trim()}" 💬`;
          await addDoc(collection(db, 'users', story.userUid, 'notifications'), {
            senderUid: currentUserId,
            type: 'comment',
            message: replyMsg,
            createdAt: serverTimestamp(),
            status: 'unread'
          });
          await sendExpoPushNotification(story.userUid, 'World Sports ⚽', replyMsg);
        }

        setStories(prevStories => prevStories.map(st => st.id === storyId ? { ...st, storyComments: updatedStoryComments } : st));
      }
      setStoryCommentInput('');
    } catch (e) {
      console.error('Error adding story comment:', e);
    }
  };

  const handleDeletePost = async (postId: string) => {
    Alert.alert('Delete Post', 'Are you sure you want to delete this post?', [
      { text: 'Cancel', style: 'cancel' },
      { 
        text: 'Delete', 
        style: 'destructive', 
        onPress: async () => {
          try {
            await deleteDoc(doc(db, 'posts', postId));
            if (selectedPostModal?.id === postId) {
              setSelectedPostModal(null);
            }
            if (commentsModalPost?.id === postId) {
              setCommentsModalPost(null);
            }
          } catch (e) {
            console.error('Error deleting post:', e);
          }
        } 
      }
    ]);
  };

  const handleDeleteStory = (storyId: string) => {
    Alert.alert('Delete Story', 'Are you sure you want to delete your story?', [
      { text: 'Cancel', style: 'cancel' },
      { 
        text: 'Delete', 
        style: 'destructive', 
        onPress: async () => {
          try {
            await deleteDoc(doc(db, 'stories', storyId));
            setActiveGroupIndex(null);
          } catch (e) {
            console.error('Error deleting story from Firestore:', e);
          }
        } 
      }
    ]);
  };

  const handlePickStoryMedia = async () => {
    stopAllVideos();

    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsEditing: true,
      aspect: [9, 16],
      quality: 0.8,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const asset = result.assets[0];
      setSelectedStoryUri(asset.uri);
      setStoryMediaType(asset.type === 'video' ? 'video' : 'image');
      setStoryCaption('');
      setStoryFontSize(20);
      setStoryTextColor('#ffffff');
      setStoryBgColor('rgba(0,0,0,0.6)');
      setStoryFontWeight('bold');
      setStoryFontStyle('normal');
      pan.setValue({ x: 0, y: 0 });
      setStoryModalVisible(true);
    }
  };

  const handlePublishStory = async () => {
    if (!selectedStoryUri) return;

    try {
      await addDoc(collection(db, 'stories'), {
        userUid: currentUserId,
        name: liveName,
        imageUrl: selectedStoryUri,
        mediaType: storyMediaType,
        avatarUrl: liveAvatar || '',
        caption: storyCaption.trim() ? storyCaption : '',
        captionStyle: {
          fontSize: storyFontSize,
          color: storyTextColor,
          backgroundColor: storyBgColor,
          fontWeight: storyFontWeight,
          fontStyle: storyFontStyle,
          offsetX: (pan.x as any)._value || 0,
          offsetY: (pan.y as any)._value || 0,
        },
        createdAt: serverTimestamp(),
        likesList: [],
        viewersList: [],
        storyComments: [],
      });

      setStoryModalVisible(false);
      setSelectedStoryUri(null);
      setStoryCaption('');
      Alert.alert('Success', 'Story published and saved for 24 hours! 📸');
    } catch (e) {
      console.error('Error publishing story:', e);
      Alert.alert('Error', 'Could not publish story.');
    }
  };

  const handleNextStoryInGroup = () => {
    setStoryCommentInput('');
    progressValueRef.current = 0;
    progressAnim.setValue(0);
    if (activeGroupIndex !== null) {
      const currentGroup = groupedStories[activeGroupIndex];
      if (activeStoryInGroupIndex < currentGroup.stories.length - 1) {
        setActiveStoryInGroupIndex(activeStoryInGroupIndex + 1);
      } else if (activeGroupIndex < groupedStories.length - 1) {
        setActiveGroupIndex(activeGroupIndex + 1);
        setActiveStoryInGroupIndex(0);
      } else {
        setActiveGroupIndex(null);
        setActiveStoryInGroupIndex(0);
      }
    }
  };

  const handlePrevStoryInGroup = () => {
    setStoryCommentInput('');
    progressValueRef.current = 0;
    progressAnim.setValue(0);
    if (activeGroupIndex !== null) {
      if (activeStoryInGroupIndex > 0) {
        setActiveStoryInGroupIndex(activeStoryInGroupIndex - 1);
      } else if (activeGroupIndex > 0) {
        const prevGroupIdx = activeGroupIndex - 1;
        setActiveGroupIndex(prevGroupIdx);
        setActiveStoryInGroupIndex(groupedStories[prevGroupIdx].stories.length - 1);
      } else {
        setActiveStoryInGroupIndex(0);
      }
    }
  };

  const handleCreatePost = async () => {
    if (!newPostText.trim() && !newPostImage) return;

    const availableSportsList = userSports.length > 0 ? userSports : ['Football'];
    const assignedSport = selectedPostSport || availableSportsList[0];

    if (!selectedPostSport && availableSportsList.length > 0) {
      setSelectedPostSport(availableSportsList[0]);
    }

    try {
      const savedEmail = await AsyncStorage.getItem('@saved_user_email') || '';

      await addDoc(collection(db, 'posts'), {
        userId: currentUserId,
        userEmail: savedEmail,
        userName: liveName,
        authorName: liveName,
        authorMeta: liveMeta,
        avatarUrl: liveAvatar || '',
        caption: newPostText,
        imageUrl: newPostImage || '',
        mediaType: newPostMediaType,
        sport: assignedSport,
        likesList: [],
        comments: [],
        createdAt: serverTimestamp()
      });

      setNewPostText('');
      setNewPostImage(null);
      setNewPostMediaType('image');
      setSelectedPostSport('');
      setCreatePostVisible(false);
      Alert.alert('Success', 'Post published successfully! 🚀');
    } catch (e) {
      console.error('Error creating post:', e);
      Alert.alert('Error', 'Could not publish post.');
    }
  };

  const pickPostMedia = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsEditing: true,
      quality: 0.8,
    });
    if (!result.canceled && result.assets && result.assets.length > 0) {
      const asset = result.assets[0];
      setNewPostImage(asset.uri);
      setNewPostMediaType(asset.type === 'video' ? 'video' : 'image');
    }
  };

  const handleAddComment = async (postId: string, isModal: boolean = false) => {
    const text = isModal ? modalCommentInput : commentInputs[postId];
    if (!text || !text.trim()) return;

    const post = posts.find(p => p.id === postId) || (commentsModalPost?.id === postId ? commentsModalPost : null);
    if (!post) return;

    if (isBlockedBidirectional(post.userId, post.authorName)) {
      Alert.alert('Blocked', 'You cannot comment on posts from this user because a block is active.');
      return;
    }

    const newComment: Comment = {
      id: Date.now().toString(),
      userId: currentUserId,
      user: liveName,
      avatarUrl: liveAvatar || '',
      text: text.trim(),
      createdAt: new Date()
    };

    try {
      const postRef = doc(db, 'posts', postId);
      const updatedComments = [...post.comments, newComment];
      await updateDoc(postRef, { comments: updatedComments });

      if (post.userId && post.userId !== currentUserId) {
        const commentMsg = `${liveName} commented on your post: "${text.trim()}" 💬`;
        await addDoc(collection(db, 'users', post.userId, 'notifications'), {
          senderUid: currentUserId,
          type: 'comment',
          message: commentMsg,
          createdAt: serverTimestamp(),
          status: 'unread'
        });
        await sendExpoPushNotification(post.userId, 'World Sports ⚽', commentMsg);
      }

      if (isModal) {
        setModalCommentInput('');
        setCommentsModalPost(prev => prev ? { ...prev, comments: updatedComments } : null);
      } else {
        setCommentInputs({ ...commentInputs, [postId]: '' });
      }

      setPosts(prevPosts => prevPosts.map(p => p.id === postId ? { ...p, comments: updatedComments } : p));
    } catch (e) {
      console.error('Error adding comment:', e);
    }
  };

  const [commentInputs, setCommentInputs] = useState<{ [postId: string]: string }>({});

  const filteredPosts = posts.filter(post => {
    const matchesSport = userSports.length === 0 || (post.sport && userSports.includes(post.sport)) || !post.sport;
    if (!matchesSport) return false;

    const isMine = (!!currentUserId && post.userId === currentUserId) || (!!liveName && post.authorName === liveName);
    if (isMine) return true;

    if (isBlockedBidirectional(post.userId, post.authorName)) return false;

    const postAuthor = allUsersList.find(u => u.uid === post.userId || u.name === post.authorName);
    if (!postAuthor || !postAuthor.isPrivate) return true;

    const isFollowingAuthor = postAuthor.followers?.includes(currentUserId);
    return isFollowingAuthor;
  }).sort((a, b) => {
    const authorA = allUsersList.find(u => u.uid === a.userId || u.name === a.authorName);
    const authorB = allUsersList.find(u => u.uid === b.userId || u.name === b.authorName);

    const isVipA = authorA?.isVip ? 1 : 0;
    const isVipB = authorB?.isVip ? 1 : 0;
    if (isVipA !== isVipB) {
      return isVipB - isVipA;
    }

    const now = Date.now();
    const promotedUntilA = authorA?.promotedUntil?.toMillis ? authorA.promotedUntil.toMillis() : (authorA?.promotedUntil?.seconds ? authorA.promotedUntil.seconds * 1000 : 0);
    const promotedUntilB = authorB?.promotedUntil?.toMillis ? authorB.promotedUntil.toMillis() : (authorB?.promotedUntil?.seconds ? authorB.promotedUntil.seconds * 1000 : 0);

    const isPromotedA = (authorA?.isPromoted && promotedUntilA > now) ? 1 : 0;
    const isPromotedB = (authorB?.isPromoted && promotedUntilB > now) ? 1 : 0;
    if (isPromotedA !== isPromotedB) {
      return isPromotedB - isPromotedA;
    }

    const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
    const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
    return timeB - timeA;
  });

  const targetFollowersList = allUsersList.filter(u => targetProfileUser?.followers?.includes(u.uid));
  const targetFollowingList = allUsersList.filter(u => targetProfileUser?.following?.includes(u.uid));
  const targetSportsList = targetProfileUser?.sports || (targetProfileUser?.sport ? [targetProfileUser.sport] : ['Football']);
  
  const isViewingMyOwnProfile = !!currentUserId && targetProfileUser?.uid === currentUserId;
  const isTargetBlockedByMe = targetProfileUser?.uid ? blockedUsersList.includes(targetProfileUser.uid) : false;
  const isTargetBlockingMe = Array.isArray(targetProfileUser?.blockedUsers) && currentUserId
    ? targetProfileUser.blockedUsers.includes(currentUserId)
    : false;
  const isAnyBlockBetweenUs = !isViewingMyOwnProfile && (isTargetBlockedByMe || isTargetBlockingMe);

  const isApprovedFollower = targetProfileUser?.followers?.includes(currentUserId || '');
  const hasRequestedFollow = targetProfileUser?.pendingRequests?.includes(currentUserId || '');
  const isPrivateAccount = targetProfileUser?.isPrivate === true;

  const canViewFullProfile = !isAnyBlockBetweenUs && (isViewingMyOwnProfile || !isPrivateAccount || isApprovedFollower);

  const isAnyModalOpen = activeGroupIndex !== null || !!selectedUserModalId || !!selectedPostModal || !!commentsModalPost || notificationsModalVisible;

  const screenFocusedRef = useRef(isScreenFocused);
  const modalOpenRef = useRef(isAnyModalOpen);
  useEffect(() => { screenFocusedRef.current = isScreenFocused; }, [isScreenFocused]);
  useEffect(() => { modalOpenRef.current = isAnyModalOpen; }, [isAnyModalOpen]);

  const viewabilityConfig = { itemVisiblePercentThreshold: 60 };
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: Array<any> }) => {
    if (!screenFocusedRef.current || modalOpenRef.current) {
      setActiveVideoId(null);
      activeVideoPlayers.forEach(p => {
        try { p.pause(); p.muted = true; } catch (e) {}
      });
      return;
    }

    const visibleVideo = viewableItems.find(
      item => item.item.mediaType === 'video' && item.isViewable
    );
    setActiveVideoId(visibleVideo ? visibleVideo.item.id : null);
  }).current;

  return (
    <View style={[styles.container, themedStyles.container]}>
      <FlatList 
        data={filteredPosts}
        keyExtractor={(item) => item.id}
        style={[styles.container, themedStyles.container]} 
        contentContainerStyle={styles.scrollContent} 
        showsVerticalScrollIndicator={false}
        viewabilityConfig={viewabilityConfig}
        onViewableItemsChanged={onViewableItemsChanged}
        ListHeaderComponent={
          <>
            <View style={styles.headerRow}>
              <View>
                <Text style={styles.homeCategory}>Home</Text>
                <Text style={[styles.appTitle, themedStyles.appTitle]}>World <Text style={{color: palette.accent}}>Sports</Text></Text>
              </View>

              <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                <TouchableOpacity 
                  style={[styles.notificationBellBtn, themedStyles.notificationBellBtn]} 
                  onPress={() => {
                    stopAllVideos();
                    setNotificationsModalVisible(true);
                  }}
                  activeOpacity={0.8}
                >
                  <Ionicons name="notifications-outline" size={20} color={palette.accent} />
                  {notificationsList.some(n => n.status === 'pending' || !n.isRead) && (
                    <View style={{
                      position: 'absolute',
                      top: -2,
                      right: -2,
                      backgroundColor: palette.danger,
                      width: 10,
                      height: 10,
                      borderRadius: 5,
                      borderWidth: 1,
                      borderColor: palette.bgPrimary
                    }} />
                  )}
                </TouchableOpacity>

                <TouchableOpacity style={styles.createBtn} onPress={() => { stopAllVideos(); setCreatePostVisible(true); }} activeOpacity={0.85}>
                  <Ionicons name="add" size={16} color={palette.accentTextOnButton} style={{ marginRight: 4 }} />
                  <Text style={[styles.createBtnText, { color: palette.accentTextOnButton }]}>Post</Text>
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.storiesContainer}>
              <TouchableOpacity style={styles.storyItem} onPress={handlePickStoryMedia} activeOpacity={0.85}>
                <View style={[styles.myStoryRing, themedStyles.avatarPlaceholder, { borderColor: palette.accent }]}>
                  {liveAvatar ? (
                    <Image source={{ uri: liveAvatar }} style={styles.storyImg} />
                  ) : (
                    <View style={[styles.avatarPlaceholder, themedStyles.avatarPlaceholder]}>
                      <Text style={styles.avatarPlaceholderText}>{liveName ? liveName[0].toUpperCase() : 'P'}</Text>
                    </View>
                  )}
                  <View style={[styles.plusBadge, { borderColor: palette.bgPrimary }]}>
                    <Ionicons name="add" size={12} color={palette.accentTextOnButton} />
                  </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 6 }}>
                  <Text style={[styles.storyName, themedStyles.storyName]}>Add Story</Text>
                  {allUsersList.find(u => u.uid === currentUserId)?.isVip && (
                    <Ionicons name="checkmark-circle" size={12} color={palette.accent} />
                  )}
                </View>
              </TouchableOpacity>

              {groupedStories.map((group, groupIndex) => {
                const groupUserObj = allUsersList.find(u => u.uid === group.userUid || u.name === group.name);
                const hasUnwatchedStories = group.hasUnwatched;

                return (
                  <View key={group.userUid} style={styles.storyItem}>
                    <TouchableOpacity 
                      style={[
                        styles.storyRing,
                        themedStyles.avatarPlaceholder,
                        group.isMine && styles.myStoryRingActive,
                        hasUnwatchedStories ? { borderColor: palette.accent } : { borderColor: palette.textMuted }
                      ]} 
                      onPress={() => {
                        stopAllVideos();
                        setActiveGroupIndex(groupIndex);
                        setActiveStoryInGroupIndex(0);
                      }}
                      activeOpacity={0.85}
                    >
                      {group.avatarUrl ? (
                        <Image source={{ uri: group.avatarUrl }} style={styles.storyImg} />
                      ) : (
                        <View style={[styles.avatarPlaceholder, themedStyles.avatarPlaceholder]}>
                          <Text style={styles.avatarPlaceholderText}>{group.name ? group.name[0].toUpperCase() : 'S'}</Text>
                        </View>
                      )}
                    </TouchableOpacity>

                    <TouchableOpacity 
                      onPress={() => {
                        if (!group.isMine) {
                          openUserProfileById(group.userUid, group.name);
                        }
                      }}
                      hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                      activeOpacity={group.isMine ? 1 : 0.7}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 6 }}
                    >
                      <Text style={[styles.storyName, themedStyles.storyName]} numberOfLines={1}>{group.isMine ? 'Your Story' : group.name}</Text>
                      {groupUserObj?.isVip && (
                        <Ionicons name="checkmark-circle" size={12} color={palette.accent} />
                      )}
                    </TouchableOpacity>
                  </View>
                );
              })}
            </ScrollView>
          </>
        }
        ListEmptyComponent={
          <View style={[styles.emptyFeedBox, themedStyles.emptyFeedBox]}>
            <Ionicons name="football-outline" size={48} color={palette.textMuted} />
            <Text style={[styles.emptyFeedText, themedStyles.emptyFeedText]}>No posts found for your selected sports. Be the first to share!</Text>
          </View>
        }
        renderItem={({ item: post }) => {
          const postTimeAgo = getTimeAgo(post.createdAt);
          const authorUserObj = allUsersList.find(u => u.uid === post.userId || u.name === post.authorName);
          const isVideo = post.mediaType === 'video';
          
          const promotedUntilTime = authorUserObj?.promotedUntil?.toMillis ? authorUserObj.promotedUntil.toMillis() : (authorUserObj?.promotedUntil?.seconds ? authorUserObj.promotedUntil.seconds * 1000 : 0);
          const isPostPromoted = authorUserObj?.isPromoted && promotedUntilTime > Date.now();

          const isVideoActive = isScreenFocused && !isAnyModalOpen && activeVideoId === post.id;

          return (
            <View key={post.id} style={[styles.postCard, themedStyles.postCard, isPostPromoted && { borderColor: '#3B82F6', borderWidth: 1.5 }]}>
              
              <View style={styles.postHeader}>
                <TouchableOpacity
                  style={[styles.postAvatarBox, themedStyles.avatarPlaceholder]}
                  onPress={() => openUserProfileById(post.userId, post.authorName)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  activeOpacity={0.75}
                >
                  {post.avatarUrl ? (
                    <Image source={{ uri: post.avatarUrl }} style={styles.avatarImg} />
                  ) : (
                    <View style={[styles.avatarPlaceholder, themedStyles.avatarPlaceholder]}>
                      <Text style={styles.avatarPlaceholderText}>{post.authorName ? post.authorName[0].toUpperCase() : 'P'}</Text>
                    </View>
                  )}
                </TouchableOpacity>
                
                <View style={styles.postUserInfo}>
                  <TouchableOpacity
                    onPress={() => openUserProfileById(post.userId, post.authorName)}
                    hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
                    activeOpacity={0.75}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Text style={[styles.postUserName, themedStyles.postUserName]}>{post.authorName}</Text>
                      {authorUserObj?.isVip && <Ionicons name="checkmark-circle" size={14} color={palette.accent} />}
                      {isPostPromoted && <Ionicons name="rocket" size={14} color="#3B82F6" style={{ marginLeft: 2 }} />}
                    </View>
                  </TouchableOpacity>
                  <Text style={[styles.postUserMeta, themedStyles.postUserMeta]}>{post.authorMeta}</Text>
                </View>

                {post.sport && (
                  <View style={[styles.sportBadge, themedStyles.sportBadge]}>
                    <Text style={styles.sportBadgeText}>{post.sport}</Text>
                  </View>
                )}

                <TouchableOpacity onPress={() => handleReportPost(post.id)} style={{ marginLeft: 6, marginRight: 2 }} activeOpacity={0.7}>
                  <Ionicons name="flag-outline" size={16} color={palette.textMuted} />
                </TouchableOpacity>

                {(post.authorName === liveName || post.userId === currentUserId) && (
                  <TouchableOpacity onPress={() => handleDeletePost(post.id)} style={{ marginLeft: 6, marginRight: 4 }} activeOpacity={0.7}>
                    <Ionicons name="trash-outline" size={16} color={palette.danger} />
                  </TouchableOpacity>
                )}

                <Text style={[styles.postTime, themedStyles.postTime]}>{postTimeAgo}</Text>
              </View>

              <Text style={[styles.postText, themedStyles.postText]}>{post.text}</Text>
              
              {post.imageUrl ? (
                <TouchableWithoutFeedback onPress={() => {
                  if (isVideo) setActiveVideoId(post.id);
                  handleDoubleTap(post.id);
                }}>
                  <View style={[styles.postImageBox, themedStyles.postImageBox]}>
                    {isVideo ? (
                      <PostVideoPlayer key={post.id} uri={post.imageUrl} isActive={isVideoActive} />
                    ) : (
                      <Image source={{ uri: post.imageUrl }} style={styles.postImageContent} />
                    )}
                  </View>
                </TouchableWithoutFeedback>
              ) : null}

              <View style={[styles.postActionsRow, themedStyles.postActionsRow]}>
                <TouchableOpacity style={styles.actionBtn} onPress={() => toggleLike(post.id)} activeOpacity={0.7}>
                  <Ionicons 
                    name={post.isLiked ? "heart" : "heart-outline"} 
                    size={20} 
                    color={post.isLiked ? palette.danger : palette.textMuted} 
                  />
                  <Text style={[styles.actionText, themedStyles.actionText, post.isLiked && { color: palette.danger, fontWeight: 'bold' }]}>
                    {post.likes} Likes
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.actionBtn} onPress={() => {
                  stopAllVideos();
                  setCommentsModalPost(post);
                }} activeOpacity={0.7}>
                  <Ionicons name="chatbubble-outline" size={18} color={palette.textMuted} />
                  <Text style={[styles.actionText, themedStyles.actionText]}>{post.comments.length} Comments</Text>
                </TouchableOpacity>
              </View>

            </View>
          );
        }}
      />

      <Modal visible={notificationsModalVisible} animationType="slide" transparent={true} onRequestClose={() => setNotificationsModalVisible(false)}>
        <View style={[styles.modalOverlayCenter, themedStyles.modalOverlayCenter]}>
          <View style={[styles.modalContentCenter, themedStyles.modalContentCenter]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, themedStyles.modalTitle]}>Notifications History 🔔</Text>
              <TouchableOpacity onPress={() => setNotificationsModalVisible(false)} activeOpacity={0.8}>
                <Ionicons name="close" size={24} color={palette.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
              {notificationsList.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                  <Ionicons name="notifications-off-outline" size={36} color={palette.textMuted} />
                  <Text style={{ color: palette.textMuted, fontSize: 13, marginTop: 10 }}>No notifications yet.</Text>
                </View>
              ) : (
                notificationsList.map((notif) => {
                  const senderUser = allUsersList.find(u => u.uid === notif.senderUid);
                  const isPending = notif.type === 'follow_request' && notif.status === 'pending';

                  return (
                    <TouchableOpacity 
                      key={notif.id} 
                      style={[styles.listItem, themedStyles.listItem]}
                      onPress={() => openUserProfileById(notif.senderUid, senderUser?.name)}
                      activeOpacity={0.85}
                    >
                      <View style={[styles.listAvatar, themedStyles.avatarPlaceholder]}>
                        {senderUser?.avatar ? (
                          <Image source={{ uri: senderUser.avatar }} style={{ width: 36, height: 36, borderRadius: 18 }} />
                        ) : (
                          <Text style={{color: palette.accent, fontWeight: 'bold'}}>{senderUser?.name ? senderUser.name[0] : 'U'}</Text>
                        )}
                      </View>
                      
                      <View style={{flex: 1, marginRight: 8}}>
                        <Text style={[styles.listName, themedStyles.listName]}>{notif.message}</Text>
                        <Text style={[styles.listCity, themedStyles.listCity]}>{getTimeAgo(notif.createdAt)}</Text>
                      </View>

                      {isPending ? (
                        <View style={{ flexDirection: 'row', gap: 6 }}>
                          <TouchableOpacity 
                            style={{ backgroundColor: palette.accent, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 }}
                            onPress={() => handleAcceptRequest(notif.id, notif.senderUid)}
                            activeOpacity={0.8}
                          >
                            <Text style={{ color: palette.accentTextOnButton, fontWeight: 'bold', fontSize: 11 }}>Accept</Text>
                          </TouchableOpacity>

                          <TouchableOpacity 
                            style={[styles.secondaryActionChip, themedStyles.secondaryActionChip]}
                            onPress={() => handleRejectRequest(notif.id, notif.senderUid)}
                            activeOpacity={0.8}
                          >
                            <Text style={{ color: palette.danger, fontWeight: 'bold', fontSize: 11 }}>Reject</Text>
                          </TouchableOpacity>
                        </View>
                      ) : notif.status === 'accepted' || notif.status === 'rejected' ? (
                        <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: notif.status === 'accepted' ? '#064E3B' : palette.bgElevated }}>
                          <Text style={{ color: notif.status === 'accepted' ? '#34D399' : palette.textMuted, fontSize: 10, fontWeight: 'bold' }}>
                            {notif.status === 'accepted' ? 'Accepted ✓' : 'Declined ✕'}
                          </Text>
                        </View>
                      ) : null}
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={!!commentsModalPost} animationType="slide" transparent={true} onRequestClose={() => setCommentsModalPost(null)}>
        <View style={[styles.modalOverlayCenter, themedStyles.modalOverlayCenter]}>
          <View style={[styles.commentsModalContent, themedStyles.modalContentCenter]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, themedStyles.modalTitle]}>Comments 💬</Text>
              <TouchableOpacity onPress={() => setCommentsModalPost(null)} activeOpacity={0.8} style={[styles.closeHomeModalBtn, themedStyles.closeHomeModalBtn]}>
                <Ionicons name="close" size={22} color={palette.textPrimary} />
              </TouchableOpacity>
            </View>

            {commentsModalPost && (
              <View style={{ flex: 1, width: '100%' }}>
                <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 15 }}>
                  {commentsModalPost.comments.length === 0 ? (
                    <Text style={{ color: palette.textMuted, textAlign: 'center', marginVertical: 30, fontSize: 13 }}>No comments yet. Be the first to comment!</Text>
                  ) : (
                    commentsModalPost.comments
                      .filter(c => !isBlockedBidirectional(c.userId, c.user))
                      .map(c => {
                      const commentTimeAgo = getTimeAgo(c.createdAt);
                      const commentUserObj = allUsersList.find(u => u.uid === c.userId || u.name === c.user);
                      return (
                        <View key={c.id} style={styles.commentRow}>
                          <TouchableOpacity
                            onPress={() => openUserProfileById(c.userId, c.user)}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            activeOpacity={0.75}
                          >
                            {c.avatarUrl ? (
                              <Image source={{ uri: c.avatarUrl }} style={styles.commentAvatar} />
                            ) : (
                              <View style={[styles.commentAvatarPlaceholder, themedStyles.avatarPlaceholder]}>
                                <Text style={{ color: palette.accent, fontSize: 10, fontWeight: 'bold' }}>{c.user ? c.user[0].toUpperCase() : 'U'}</Text>
                              </View>
                            )}
                          </TouchableOpacity>
                          <View style={[styles.commentBubble, themedStyles.commentBubble]}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                              <TouchableOpacity
                                onPress={() => openUserProfileById(c.userId, c.user)}
                                hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
                                activeOpacity={0.75}
                              >
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                  <Text style={styles.commentUser}>{c.user}</Text>
                                  {commentUserObj?.isVip && <Ionicons name="checkmark-circle" size={12} color={palette.accent} />}
                                </View>
                              </TouchableOpacity>
                              <Text style={[styles.commentTimeText, themedStyles.postTime]}>{commentTimeAgo}</Text>
                            </View>
                            <Text style={[styles.commentText, themedStyles.commentText]}>{c.text}</Text>
                          </View>
                        </View>
                      );
                    })
                  )}
                </ScrollView>

                <View style={[styles.commentInputRow, themedStyles.commentInputRow]}>
                  <TextInput 
                    style={[styles.commentInput, themedStyles.commentInput]} 
                    placeholder="Write a comment..." 
                    placeholderTextColor={palette.textMuted}
                    value={modalCommentInput}
                    onChangeText={setModalCommentInput}
                  />
                  <TouchableOpacity style={styles.commentSendBtn} onPress={() => handleAddComment(commentsModalPost.id, true)} activeOpacity={0.85}>
                    <Ionicons name="send" size={14} color={palette.accentTextOnButton} />
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={storyModalVisible} transparent={true} animationType="slide" onRequestClose={() => setStoryModalVisible(false)}>
        <View style={[styles.storyModalOverlay, { backgroundColor: palette.storyOverlay }]}>
          <TouchableOpacity style={[styles.closeStoryBtn, themedStyles.storyFloatingBtn]} onPress={() => setStoryModalVisible(false)} activeOpacity={0.8}>
            <Ionicons name="close" size={24} color={palette.textPrimary} />
          </TouchableOpacity>

          <View style={[styles.storyEditorCard, themedStyles.modalContentCenter]}>
            {selectedStoryUri && (
              <View style={[styles.storyCanvasBox, themedStyles.storyCanvasBox]}>
                {storyMediaType === 'video' ? (
                  <PostVideoPlayer key="editor_video" uri={selectedStoryUri} isActive={false} />
                ) : (
                  <Image source={{ uri: selectedStoryUri }} style={styles.storyCanvasImage} />
                )}
                
                {storyCaption ? (
                  <Animated.View 
                    style={[
                      styles.captionOverlayBox, 
                      { backgroundColor: storyBgColor },
                      { transform: [{ translateX: pan.x }, { translateY: pan.y }] }
                    ]}
                    {...panResponder.panHandlers}
                  >
                    <Text style={[styles.captionOverlayText, { 
                      fontSize: storyFontSize, 
                      color: storyTextColor, 
                      fontWeight: storyFontWeight, 
                      fontStyle: storyFontStyle 
                    }]}>
                      {storyCaption}
                    </Text>
                  </Animated.View>
                ) : null}
              </View>
            )}

            <View style={styles.storyControlsRow}>
              <View style={[styles.controlGroup, themedStyles.controlGroup]}>
                <TouchableOpacity style={[styles.miniBtn, themedStyles.miniBtn]} onPress={() => setStoryFontSize(prev => Math.max(12, prev - 2))} activeOpacity={0.7}>
                  <Text style={[styles.miniBtnText, themedStyles.miniBtnText]}>A-</Text>
                </TouchableOpacity>
                <Text style={{ color: palette.textPrimary, fontSize: 12, marginHorizontal: 6, fontWeight: '700' }}>{storyFontSize}</Text>
                <TouchableOpacity style={[styles.miniBtn, themedStyles.miniBtn]} onPress={() => setStoryFontSize(prev => Math.min(40, prev + 2))} activeOpacity={0.7}>
                  <Text style={[styles.miniBtnText, themedStyles.miniBtnText]}>A+</Text>
                </TouchableOpacity>
              </View>

              <View style={[styles.controlGroup, themedStyles.controlGroup]}>
                <TouchableOpacity 
                  style={[styles.miniBtn, themedStyles.miniBtn, storyFontWeight === 'bold' && styles.activeMiniBtn]} 
                  onPress={() => setStoryFontWeight(prev => prev === 'bold' ? 'normal' : 'bold')}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.miniBtnText, themedStyles.miniBtnText, storyFontWeight === 'bold' && { color: palette.accentTextOnButton }, { fontWeight: 'bold' }]}>B</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.miniBtn, themedStyles.miniBtn, storyFontStyle === 'italic' && styles.activeMiniBtn]} 
                  onPress={() => setStoryFontStyle(prev => prev === 'italic' ? 'normal' : 'italic')}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.miniBtnText, themedStyles.miniBtnText, storyFontStyle === 'italic' && { color: palette.accentTextOnButton }, { fontStyle: 'italic' }]}>I</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.colorPaletteRow}>
              {['#ffffff', '#000000', '#EAB308', '#EF4444', '#22C55E', '#3B82F6', '#EC4899'].map(color => (
                <TouchableOpacity 
                  key={color} 
                  style={[styles.colorCircle, { backgroundColor: color, borderColor: palette.border }, storyTextColor === color && { borderWidth: 3, borderColor: palette.textPrimary }]} 
                  onPress={() => setStoryTextColor(color)}
                  activeOpacity={0.8}
                />
              ))}
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bgOptionsRow}>
              <TouchableOpacity 
                style={[styles.bgOptionChip, themedStyles.bgOptionChip, storyBgColor === 'rgba(0,0,0,0.6)' && themedStyles.activeBgChip]} 
                onPress={() => setStoryBgColor('rgba(0,0,0,0.6)')}
              >
                <Text style={[styles.bgOptionText, themedStyles.bgOptionText]}>Dark BG</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.bgOptionChip, themedStyles.bgOptionChip, storyBgColor === 'rgba(255,255,255,0.8)' && themedStyles.activeBgChip]} 
                onPress={() => setStoryBgColor('rgba(255,255,255,0.8)')}
              >
                <Text style={[styles.bgOptionText, { color: '#000' }]}>Light BG</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.bgOptionChip, themedStyles.bgOptionChip, storyBgColor === 'rgba(234,179,8,0.8)' && themedStyles.activeBgChip]} 
                onPress={() => setStoryBgColor('rgba(234,179,8,0.8)')}
              >
                <Text style={[styles.bgOptionText, { color: '#000' }]}>Gold BG</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.bgOptionChip, themedStyles.bgOptionChip, storyBgColor === 'transparent' && themedStyles.activeBgChip]} 
                onPress={() => setStoryBgColor('transparent')}
              >
                <Text style={[styles.bgOptionText, themedStyles.bgOptionText]}>No BG</Text>
              </TouchableOpacity>
            </ScrollView>

            <TextInput 
              style={[styles.storyTextInput, themedStyles.commentInput]} 
              placeholder="Type text on story..." 
              placeholderTextColor={palette.textMuted}
              value={storyCaption}
              onChangeText={setStoryCaption}
            />

            <TouchableOpacity style={styles.publishStoryBtn} onPress={handlePublishStory} activeOpacity={0.85}>
              <Text style={[styles.publishStoryBtnText, { color: palette.accentTextOnButton }]}>Share to Story 🚀</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={activeGroupIndex !== null} transparent={true} animationType="fade" onRequestClose={() => setActiveGroupIndex(null)}>
        <View style={[styles.storyModalOverlay, { backgroundColor: palette.storyOverlay }]}>
          <TouchableOpacity style={[styles.closeStoryBtn, themedStyles.storyFloatingBtn]} onPress={() => { setActiveGroupIndex(null); setStoryCommentInput(''); }} activeOpacity={0.8}>
            <Ionicons name="close" size={24} color={palette.textPrimary} />
          </TouchableOpacity>

          {activeGroupIndex !== null && groupedStories[activeGroupIndex] && (() => {
            const currentGroup = groupedStories[activeGroupIndex];
            const currentStory = currentGroup.stories[activeStoryInGroupIndex] || currentGroup.stories[0];
            const storyTimeAgo = getTimeAgo(currentStory.createdAt);
            const storyLikesList = currentStory.likesList || [];
            const storyViewersList = currentStory.viewersList || [];
            const isStoryLiked = currentUserId ? storyLikesList.includes(currentUserId) : false;
            const storyCommentsList = currentStory.storyComments || [];
            const isStoryMine = currentGroup.isMine;
            const headerUserObj = allUsersList.find(u => u.uid === currentGroup.userUid || u.name === currentGroup.name);
            const isStoryVideo = currentStory.mediaType === 'video';

            return (
              <TouchableWithoutFeedback 
                onPressIn={handlePressInStory} 
                onPressOut={handlePressOutStory}
              >
                <View style={styles.storyViewerScrollContentContainer}>
                  <View style={[styles.storyViewerCard, themedStyles.modalContentCenter]}>
                    
                    <View style={[styles.storyProgressBarsRow, { backgroundColor: palette.border }]}>
                      {currentGroup.stories.map((st, idx) => {
                        let widthInterpolate: any = 0;
                        if (idx < activeStoryInGroupIndex) widthInterpolate = '100%';
                        else if (idx === activeStoryInGroupIndex) {
                          widthInterpolate = progressAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: ['0%', '100%']
                          });
                        } else {
                          widthInterpolate = '0%';
                        }

                        return (
                          <View key={st.id} style={[styles.storyProgressBarContainer, { backgroundColor: palette.bgElevated }]}>
                            <Animated.View style={[styles.storyProgressBarFill, { backgroundColor: palette.accent, width: widthInterpolate }]} />
                          </View>
                        );
                      })}
                    </View>

                    <View style={styles.storyHeaderUserRow}>
                      <TouchableOpacity 
                        style={styles.storyHeaderUserBtn}
                        onPress={() => openUserProfileById(currentGroup.userUid, currentGroup.name)}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        activeOpacity={0.75}
                      >
                        <View style={[styles.storyHeaderAvatar, themedStyles.avatarPlaceholder]}>
                          {currentGroup.avatarUrl ? (
                            <Image source={{ uri: currentGroup.avatarUrl }} style={styles.storyImg} />
                          ) : (
                            <Text style={{ color: palette.accent, fontWeight: 'bold', fontSize: 11 }}>{currentGroup.name ? currentGroup.name[0] : 'P'}</Text>
                          )}
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Text style={[styles.fullStoryName, themedStyles.postUserName]}>
                            {currentGroup.name} {isStoryMine ? '(me)' : ''}
                          </Text>
                          {headerUserObj?.isVip && <Ionicons name="checkmark-circle" size={13} color={palette.accent} />}
                        </View>
                      </TouchableOpacity>
                      <Text style={{ color: palette.textMuted, fontSize: 11 }}>{storyTimeAgo}</Text>
                    </View>

                    <View style={styles.fullStoryMediaBox}>
                      {isStoryVideo ? (
                        <StoryVideoPlayer key={currentStory.id} uri={currentStory.imageUrl} isActive={isScreenFocused && activeGroupIndex !== null} />
                      ) : (
                        <Image source={{ uri: currentStory.imageUrl }} style={styles.fullStoryImage} />
                      )}
                    </View>
                    
                    {currentStory.caption && (
                      <View style={[
                        styles.captionViewerBox, 
                        { 
                          backgroundColor: currentStory.captionStyle?.backgroundColor || 'rgba(0,0,0,0.6)',
                          transform: [
                            { translateX: currentStory.captionStyle?.offsetX || 0 },
                            { translateY: currentStory.captionStyle?.offsetY || 0 }
                          ]
                        }
                      ]}>
                        <Text style={[styles.captionOverlayText, { 
                          fontSize: currentStory.captionStyle?.fontSize || 20, 
                          color: currentStory.captionStyle?.color || '#ffffff',
                          fontWeight: currentStory.captionStyle?.fontWeight || 'bold',
                          fontStyle: currentStory.captionStyle?.fontStyle || 'normal'
                        }]}>
                          {currentStory.caption}
                        </Text>
                      </View>
                    )}

                    {isStoryMine ? (
                      <View style={[styles.creatorInsightsBox, themedStyles.creatorInsightsBox]}>
                        <Text style={[styles.creatorInsightsTitle, { color: palette.accent }]}>📊 Story Analytics</Text>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                          <Text style={{ color: palette.accent, fontSize: 12 }}>👁️ Total Views: {storyViewersList.length}</Text>
                          <Text style={{ color: palette.accent, fontSize: 12 }}>❤️ Total Likes: {storyLikesList.length}</Text>
                        </View>

                        <Text style={{ color: palette.accent, fontSize: 12, fontWeight: 'bold', marginTop: 4, marginBottom: 2 }}>👥 Viewed by:</Text>
                        <ScrollView style={{ maxHeight: 70 }} nestedScrollEnabled={true}>
                          {storyViewersList.length === 0 ? (
                            <Text style={{ color: palette.textMuted, fontSize: 11, fontStyle: 'italic' }}>No views yet.</Text>
                          ) : (
                            storyViewersList.map(viewerUid => {
                              const viewerUser = allUsersList.find(u => u.uid === viewerUid);
                              if (!viewerUser) return null;
                              return (
                                <TouchableOpacity 
                                  key={viewerUid} 
                                  style={[styles.viewerItemRow, themedStyles.viewerItemRow]}
                                  onPress={() => openUserProfileById(viewerUser.uid, viewerUser.name)}
                                  activeOpacity={0.8}
                                >
                                  {viewerUser.avatar ? (
                                    <Image source={{ uri: viewerUser.avatar }} style={styles.viewerAvatar} />
                                  ) : (
                                    <View style={[styles.viewerAvatar, themedStyles.avatarPlaceholder, { justifyContent: 'center', alignItems: 'center' }]}>
                                      <Text style={{ color: palette.accent, fontSize: 10, fontWeight: 'bold' }}>{viewerUser.name ? viewerUser.name[0] : 'U'}</Text>
                                    </View>
                                  )}
                                  <Text style={{ color: palette.textPrimary, fontSize: 11, fontWeight: '600', marginLeft: 6 }}>{viewerUser.name}</Text>
                                  {viewerUser.isVip && <Ionicons name="checkmark-circle" size={12} color={palette.accent} style={{ marginLeft: 4 }} />}
                                </TouchableOpacity>
                              );
                            })
                          )}
                        </ScrollView>
                        
                        <Text style={{ color: palette.accent, fontSize: 12, fontWeight: 'bold', marginTop: 6, marginBottom: 4 }}>💬 Comments ({storyCommentsList.length}):</Text>
                        {storyCommentsList.length === 0 ? (
                          <Text style={{ color: palette.textMuted, fontSize: 11, fontStyle: 'italic' }}>No comments on this story yet.</Text>
                        ) : (
                          storyCommentsList.map(sc => (
                            <View key={sc.id} style={[styles.storyCommentItem, themedStyles.viewerItemRow]}>
                              <Text style={{ color: palette.accent, fontWeight: 'bold', fontSize: 11 }}>{sc.user}:</Text>
                              <Text style={{ color: palette.textPrimary, fontSize: 11, marginLeft: 4 }}>{sc.text}</Text>
                            </View>
                          ))
                        )}
                      </View>
                    ) : (
                      <View style={{ alignItems: 'center', marginTop: 10, width: '100%', paddingHorizontal: 15 }}>
                        <TouchableOpacity style={[styles.storyLikeRow, themedStyles.storyLikeRow]} onPress={() => toggleStoryLike(currentStory.id)} activeOpacity={0.8}>
                          <Ionicons name={isStoryLiked ? "heart" : "heart-outline"} size={20} color={isStoryLiked ? palette.danger : palette.textPrimary} />
                          <Text style={{ color: palette.textPrimary, fontSize: 13, fontWeight: 'bold' }}>{storyLikesList.length} Likes</Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    {!isStoryMine && (
                      <View style={styles.storyCommentInputRow}>
                        <TextInput 
                          style={[styles.storyCommentInputField, themedStyles.commentInput]}
                          placeholder="Reply to story..."
                          placeholderTextColor={palette.textMuted}
                          value={storyCommentInput}
                          onChangeText={setStoryCommentInput}
                        />
                        <TouchableOpacity style={styles.storyCommentSendBtn} onPress={() => handleAddStoryComment(currentStory.id)} activeOpacity={0.85}>
                           <Ionicons name="send" size={14} color={palette.accentTextOnButton} />
                        </TouchableOpacity>
                      </View>
                    )}

                    {!isStoryMine && (
                      <TouchableOpacity 
                        style={[styles.reportStoryIconBtn, themedStyles.storyFloatingBtn]} 
                        onPress={() => handleReportStory(currentStory.id)}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="flag-outline" size={18} color={palette.textMuted} />
                      </TouchableOpacity>
                    )}

                    {isStoryMine && (
                      <TouchableOpacity 
                        style={[styles.deleteStoryIconBtn, themedStyles.storyFloatingBtn]} 
                        onPress={() => handleDeleteStory(currentStory.id)}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="trash-outline" size={18} color={palette.danger} />
                      </TouchableOpacity>
                    )}

                    <TouchableOpacity style={styles.storyTapLeft} onPress={handlePrevStoryInGroup} />
                    <TouchableOpacity style={styles.storyTapRight} onPress={handleNextStoryInGroup} />
                  </View>
                </View>
              </TouchableWithoutFeedback>
            );
          })()}
        </View>
      </Modal>

      <Modal visible={!!selectedUserModalId && !targetActiveModalList && !selectedPostModal && !commentsModalPost} animationType="slide" transparent={true} onRequestClose={() => setSelectedUserModalId(null)}>
        <View style={[styles.modalOverlayCenter, themedStyles.modalOverlayCenter]}>
          <View style={[styles.modalContentHomeStyle, themedStyles.modalContentHomeStyle]}>
            
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.homeCategory}>Player Profile</Text>
                <Text style={[styles.appTitle, themedStyles.appTitle]}>World <Text style={{color: palette.accent}}>Sports</Text></Text>
              </View>
              <TouchableOpacity 
                onPress={() => {
                  setTargetActiveModalList(null);
                  setSelectedUserModalId(null);
                }} 
                activeOpacity={0.8} 
                style={[styles.closeHomeModalBtn, themedStyles.closeHomeModalBtn]}
              >
                <Ionicons name="close" size={22} color={palette.textPrimary} />
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
                    style={[styles.avatarLarge, themedStyles.avatarPlaceholder]} 
                    onPress={() => {
                      if (targetProfileUser.avatar && !isAnyBlockBetweenUs) {
                        setZoomedAvatarUri(targetProfileUser.avatar);
                      }
                    }}
                    activeOpacity={0.7}
                  >
                    {targetProfileUser.avatar && !isAnyBlockBetweenUs ? (
                      <Image source={{ uri: targetProfileUser.avatar }} style={styles.avatarImage} />
                    ) : (
                      <Text style={styles.avatarLargeText}>{targetProfileUser.name ? targetProfileUser.name[0] : 'P'}</Text>
                    )}
                  </TouchableOpacity>

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    <Text style={[styles.profileName, themedStyles.postUserName]}>{targetProfileUser.name}</Text>
                    {targetProfileUser.isVip && <Ionicons name="checkmark-circle" size={18} color={palette.accent} />}
                    {targetProfileUser.isPrivate && <Ionicons name="lock-closed" size={14} color={palette.danger} />}
                  </View>
                  
                  {!isAnyBlockBetweenUs && (
                    <>
                      <View style={styles.sportsTagsRow}>
                        {targetSportsList.map((sport: string, index: number) => (
                          <View key={index} style={[styles.sportTagBadge, themedStyles.sportTagBadge]}>
                            <Text style={styles.sportTagText}> {sport}</Text>
                          </View>
                        ))}
                      </View>

                      <Text style={[styles.profileCity, themedStyles.postUserMeta]}>
                        📍 {targetProfileUser.city || 'Netanya'}, {targetProfileUser.country || 'Israel'} |  Age: {targetProfileUser.age || 20}
                      </Text>
                    </>
                  )}
                </View>

                {!isAnyBlockBetweenUs && (
                  <View style={[styles.statsRow, themedStyles.statsRow]}>
                    <TouchableOpacity 
                      style={styles.statBox} 
                      onPress={() => setTargetActiveModalList('followers')} 
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.statNumber, { color: palette.accent }]}>{targetProfileUser.followers?.length || 0}</Text>
                      <Text style={[styles.statLabel, themedStyles.postUserMeta]}>Followers</Text>
                    </TouchableOpacity>

                    <TouchableOpacity 
                      style={styles.statBox} 
                      onPress={() => setTargetActiveModalList('following')} 
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.statNumber, { color: palette.accent }]}>{targetProfileUser.following?.length || 0}</Text>
                      <Text style={[styles.statLabel, themedStyles.postUserMeta]}>Following</Text>
                    </TouchableOpacity>

                    <View style={styles.statBox}>
                      <Text style={[styles.statNumber, { color: palette.accent }]}>{targetUserPosts.length}</Text>
                      <Text style={[styles.statLabel, themedStyles.postUserMeta]}>Posts</Text>
                    </View>
                  </View>
                )}

                {!isViewingMyOwnProfile && (
                  <View style={{ marginBottom: 16, gap: 10 }}>
                    {!isAnyBlockBetweenUs && currentUserId && (
                      <TouchableOpacity 
                        style={[
                          styles.profileFollowBtn, 
                          isApprovedFollower && [styles.profileFollowingBtn, themedStyles.profileFollowingBtn],
                          hasRequestedFollow && [styles.secondaryActionChip, themedStyles.secondaryActionChip],
                        ]} 
                        onPress={handleToggleFollowTarget}
                        activeOpacity={0.85}
                      >
                        <Text style={[
                          styles.profileFollowBtnText, 
                          { color: palette.accentTextOnButton },
                          isApprovedFollower && styles.profileFollowingBtnText,
                          hasRequestedFollow && { color: palette.textPrimary }
                        ]}>
                          {isApprovedFollower ? 'Following ✓' : hasRequestedFollow ? 'Requested ⏳' : 'Follow Player 🤝'}
                        </Text>
                      </TouchableOpacity>
                    )}

                    {!isTargetBlockingMe && currentUserId && (
                      <TouchableOpacity
                        style={[
                          styles.blockProfileBtn,
                          themedStyles.blockProfileBtn,
                          isTargetBlockedByMe && [styles.secondaryActionChip, themedStyles.secondaryActionChip],
                        ]}
                        onPress={handleToggleBlockTargetUser}
                        activeOpacity={0.85}
                      >
                        <Ionicons
                          name={isTargetBlockedByMe ? 'person-add-outline' : 'ban-outline'}
                          size={12}
                          color={isTargetBlockedByMe ? palette.textPrimary : palette.danger}
                        />
                        <Text
                          style={[
                            styles.blockProfileBtnText,
                            { color: palette.danger },
                            isTargetBlockedByMe && { color: palette.textPrimary },
                          ]}
                        >
                          {isTargetBlockedByMe ? 'Unblock' : 'Block'}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}

                {isAnyBlockBetweenUs ? (
                  <View style={[styles.privateAccountBox, themedStyles.privateAccountBox]}>
                    <Ionicons name="ban" size={40} color={palette.danger} style={{ marginBottom: 8 }} />
                    <Text style={[styles.privateAccountTitle, themedStyles.postUserName]}>
                      {isTargetBlockedByMe ? 'You Blocked This User' : 'Content Unavailable'}
                    </Text>
                    <Text style={[styles.privateAccountText, themedStyles.postUserMeta]}>
                      {isTargetBlockedByMe
                        ? 'Unblock this user to view their profile or posts.'
                        : 'You cannot view this profile.'}
                    </Text>
                  </View>
                ) : canViewFullProfile ? (
                  <>
                    <View style={[styles.postsSectionHeader, themedStyles.postsSectionHeader]}>
                      <Ionicons name="grid-outline" size={18} color={palette.accent} />
                      <Text style={[styles.sectionTitle, themedStyles.postUserName]}>Player Posts</Text>
                    </View>

                    {targetUserPosts.length === 0 ? (
                      <View style={[styles.emptyPostsBox, themedStyles.emptyPostsBox]}>
                        <Ionicons name="images-outline" size={32} color={palette.textMuted} />
                        <Text style={[styles.emptyPostsText, themedStyles.postTime]}>No posts shared yet by this user.</Text>
                      </View>
                    ) : (
                      <View style={styles.postsGrid}>
                        {targetUserPosts.map(post => {
                          const isVid = post.mediaType === 'video';
                          return (
                            <TouchableOpacity 
                              key={post.id} 
                              style={[styles.postThumbnailBox, themedStyles.postThumbnailBox]} 
                              onPress={() => {
                                stopAllVideos();
                                setSelectedPostModal(post);
                              }} 
                              activeOpacity={0.7}
                            >
                              {post.imageUrl && !isVid ? (
                                <Image source={{ uri: post.imageUrl }} style={styles.postThumbnailImage} />
                              ) : isVid ? (
                                <View style={[styles.postThumbnailImage, themedStyles.avatarPlaceholder, { position: 'relative' }]}>
                                  {!!post.imageUrl && <ProfileVideoThumbnail uri={post.imageUrl} />}
                                  <View style={styles.videoBadgeOverlay}>
                                    <Ionicons name="play" size={14} color="#FAFAFA" />
                                  </View>
                                </View>
                              ) : (
                                <View style={[styles.postThumbnailImage, styles.textPostThumbnail, themedStyles.avatarPlaceholder]}>
                                  <Ionicons name="document-text-outline" size={22} color={palette.accent} />
                                  <Text style={[styles.postThumbnailText, themedStyles.postText]} numberOfLines={5}>
                                    {post.text || 'Text post'}
                                  </Text>
                                </View>
                              )}
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}
                  </>
                ) : (
                  <View style={[styles.privateAccountBox, themedStyles.privateAccountBox]}>
                    <Ionicons name="lock-closed" size={40} color={palette.accent} style={{ marginBottom: 8 }} />
                    <Text style={[styles.privateAccountTitle, themedStyles.postUserName]}>This Account is Private 🔒</Text>
                    <Text style={[styles.privateAccountText, themedStyles.postUserMeta]}>Follow this account to see their photos and videos.</Text>
                  </View>
                )}

              </ScrollView>
            )}

          </View>
        </View>
      </Modal>

      <Modal visible={!!selectedPostModal} animationType="slide" transparent={true} onRequestClose={() => setSelectedPostModal(null)}>
        <View style={[styles.modalOverlayCenter, themedStyles.modalOverlayCenter]}>
          <View style={[styles.modalContentHomeStyle, themedStyles.modalContentHomeStyle]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, themedStyles.modalTitle]}>Post Details 📷</Text>
              <TouchableOpacity onPress={() => setSelectedPostModal(null)} activeOpacity={0.8} style={[styles.closeHomeModalBtn, themedStyles.closeHomeModalBtn]}>
                <Ionicons name="close" size={22} color={palette.textPrimary} />
              </TouchableOpacity>
            </View>

            {selectedPostModal && (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }} nestedScrollEnabled={true}>
                <View style={[styles.postCard, themedStyles.postCard]}>
                  <View style={styles.postHeader}>
                    <TouchableOpacity
                      style={[styles.postAvatarBox, themedStyles.avatarPlaceholder]}
                      onPress={() => openUserProfileById(selectedPostModal.userId, selectedPostModal.authorName)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      activeOpacity={0.75}
                    >
                      {selectedPostModal.avatarUrl ? (
                        <Image source={{ uri: selectedPostModal.avatarUrl }} style={styles.avatarImg} />
                      ) : (
                        <View style={[styles.avatarPlaceholder, themedStyles.avatarPlaceholder]}>
                          <Text style={styles.avatarPlaceholderText}>{selectedPostModal.authorName ? selectedPostModal.authorName[0].toUpperCase() : 'P'}</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                    
                    <View style={styles.postUserInfo}>
                      <TouchableOpacity
                        onPress={() => openUserProfileById(selectedPostModal.userId, selectedPostModal.authorName)}
                        hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
                        activeOpacity={0.75}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Text style={[styles.postUserName, themedStyles.postUserName]}>{selectedPostModal.authorName}</Text>
                          {allUsersList.find(u => u.uid === selectedPostModal.userId || u.name === selectedPostModal.authorName)?.isVip && <Ionicons name="checkmark-circle" size={14} color={palette.accent} />}
                        </View>
                      </TouchableOpacity>
                      <Text style={[styles.postUserMeta, themedStyles.postUserMeta]}>{selectedPostModal.authorMeta}</Text>
                    </View>

                    {selectedPostModal.sport && (
                      <View style={[styles.sportBadge, themedStyles.sportBadge]}>
                        <Text style={styles.sportBadgeText}>{selectedPostModal.sport}</Text>
                      </View>
                    )}
                    <Text style={[styles.postTime, themedStyles.postTime]}>{getTimeAgo(selectedPostModal.createdAt)}</Text>
                  </View>

                  <Text style={[styles.postText, themedStyles.postText]}>{selectedPostModal.text}</Text>
                  
                  {selectedPostModal.imageUrl ? (
                    <TouchableWithoutFeedback onPress={() => handleDoubleTap(selectedPostModal.id)}>
                      <View style={[styles.postImageBox, themedStyles.postImageBox]}>
                        {selectedPostModal.mediaType === 'video' ? (
                          <PostVideoPlayer key={`modal_${selectedPostModal.id}`} uri={selectedPostModal.imageUrl} isActive={true} />
                        ) : (
                          <Image source={{ uri: selectedPostModal.imageUrl }} style={styles.postImageContent} />
                        )}
                      </View>
                    </TouchableWithoutFeedback>
                  ) : null}

                  <View style={[styles.postActionsRow, themedStyles.postActionsRow]}>
                    <TouchableOpacity style={styles.actionBtn} onPress={() => toggleLike(selectedPostModal.id)} activeOpacity={0.7}>
                      <Ionicons 
                        name={selectedPostModal.isLiked ? "heart" : "heart-outline"} 
                        size={20} 
                        color={selectedPostModal.isLiked ? palette.danger : palette.textMuted} 
                      />
                      <Text style={[styles.actionText, themedStyles.actionText, selectedPostModal.isLiked && { color: palette.danger, fontWeight: 'bold' }]}>
                        {selectedPostModal.likes} Likes
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.actionBtn} onPress={() => { setSelectedPostModal(null); setCommentsModalPost(selectedPostModal); }} activeOpacity={0.7}>
                      <Ionicons name="chatbubble-outline" size={18} color={palette.textMuted} />
                      <Text style={[styles.actionText, themedStyles.actionText]}>{selectedPostModal.comments.length} Comments</Text>
                    </TouchableOpacity>
                  </View>

                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={!!zoomedAvatarUri} transparent={true} animationType="fade" onRequestClose={() => setZoomedAvatarUri(null)}>
        <View style={styles.zoomedAvatarOverlay}>
          <TouchableOpacity 
            style={[styles.closeZoomedBtn, themedStyles.storyFloatingBtn]} 
            onPress={() => setZoomedAvatarUri(null)}
            activeOpacity={0.8}
          >
            <Ionicons name="close" size={24} color={palette.textPrimary} />
          </TouchableOpacity>
          {zoomedAvatarUri && (
            <Image source={{ uri: zoomedAvatarUri }} style={styles.zoomedAvatarImage} />
          )}
        </View>
      </Modal>

      <Modal visible={!!targetActiveModalList} animationType="slide" transparent={true} onRequestClose={() => setTargetActiveModalList(null)}>
        <View style={[styles.modalOverlayCenter, themedStyles.modalOverlayCenter]}>
          <View style={[styles.modalContentCenter, themedStyles.modalContentCenter]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, themedStyles.modalTitle]}>
                {targetActiveModalList === 'followers' ? 'Followers 👥' : 'Following 🤝'}
              </Text>
              <TouchableOpacity onPress={() => setTargetActiveModalList(null)} activeOpacity={0.8}>
                <Ionicons name="close" size={24} color={palette.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 350 }} showsVerticalScrollIndicator={false}>
              {(targetActiveModalList === 'followers' ? targetFollowersList : targetFollowingList)
                .filter((item: any) => !isBlockedBidirectional(item.uid, item.name))
                .map((item: any) => (
                <TouchableOpacity 
                  key={item.uid} 
                  style={[styles.listItem, themedStyles.listItem]} 
                  onPress={() => openUserProfileById(item.uid, item.name)}
                  activeOpacity={0.85}
                >
                  <View style={[styles.listAvatar, themedStyles.avatarPlaceholder]}>
                    {item.avatar ? (
                      <Image source={{ uri: item.avatar }} style={{ width: 36, height: 36, borderRadius: 18 }} />
                    ) : (
                      <Text style={{color: palette.accent, fontWeight: 'bold'}}>{item.name ? item.name[0] : 'P'}</Text>
                    )}
                  </View>
                  <View style={{flex: 1}}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Text style={[styles.listName, themedStyles.listName]}>{item.name}</Text>
                      {item.isVip && <Ionicons name="checkmark-circle" size={14} color={palette.accent} />}
                    </View>
                    <Text style={[styles.listCity, themedStyles.listCity]}>📍 {item.city} |  Age: {item.age || 'N/A'}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={palette.textMuted} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={createPostVisible} transparent={true} animationType="fade" onRequestClose={() => setCreatePostVisible(false)}>
        <View style={[styles.modalOverlayCenter, themedStyles.modalOverlayCenter]}>
          <View style={[styles.modalContentCenter, themedStyles.modalContentCenter]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, themedStyles.modalTitle]}>Create New Post 📝</Text>
              <TouchableOpacity onPress={() => setCreatePostVisible(false)} activeOpacity={0.8}>
                <Ionicons name="close" size={24} color={palette.textPrimary} />
              </TouchableOpacity>
            </View>

            <TextInput 
              style={[styles.createPostInput, themedStyles.commentInput]} 
              placeholder="What's on your mind about football/sports?" 
              placeholderTextColor={palette.textMuted} 
              multiline 
              value={newPostText} 
              onChangeText={newText => setNewPostText(newText)} 
            />

            <Text style={{ color: palette.textPrimary, fontSize: 13, fontWeight: '700', marginBottom: 6 }}>Select Sport Category:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12, maxHeight: 40 }}>
              {(userSports.length > 0 ? userSports : ['Football']).map((sp) => {
                const isSelected = selectedPostSport === sp || (!selectedPostSport && sp === (userSports[0] || 'Football'));
                return (
                  <TouchableOpacity
                    key={sp}
                    onPress={() => setSelectedPostSport(sp)}
                    style={{
                      backgroundColor: isSelected ? palette.accent : palette.bgElevated,
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: 10,
                      marginRight: 6,
                      borderWidth: 1,
                      borderColor: isSelected ? palette.accent : palette.border,
                      justifyContent: 'center',
                      alignItems: 'center'
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={{ color: isSelected ? palette.accentTextOnButton : palette.textPrimary, fontSize: 12, fontWeight: 'bold' }}>
                       {sp}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <TouchableOpacity style={[styles.pickImageBtn, themedStyles.commentInput]} onPress={pickPostMedia} activeOpacity={0.8}>
              <Ionicons name={newPostMediaType === 'video' ? 'videocam-outline' : 'image-outline'} size={18} color={palette.accent} />
              <Text style={styles.pickImageText}>
                {newPostImage ? (newPostMediaType === 'video' ? 'Video Attached ✓' : 'Image Attached ✓') : 'Attach Media from Gallery'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.publishBtn} onPress={handleCreatePost} activeOpacity={0.85}>
              <Text style={[styles.publishBtnText, { color: palette.accentTextOnButton }]}>Publish Post 🚀</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const createThemedStyles = (palette: ThemePalette) =>
  StyleSheet.create({
    container: { backgroundColor: palette.bgPrimary },
    appTitle: { color: palette.textPrimary },
    notificationBellBtn: { backgroundColor: palette.bgSurface, borderColor: palette.border },
    avatarPlaceholder: { backgroundColor: palette.bgElevated },
    storyName: { color: palette.textMuted },
    emptyFeedBox: { backgroundColor: palette.bgSurface, borderColor: palette.border },
    emptyFeedText: { color: palette.textMuted },
    postCard: { backgroundColor: palette.bgSurface, borderColor: palette.border },
    postUserName: { color: palette.textPrimary },
    postUserMeta: { color: palette.textMuted },
    sportBadge: { backgroundColor: palette.bgElevated, borderColor: palette.border },
    postTime: { color: palette.textMuted },
    postText: { color: palette.textSecondary },
    postImageBox: { backgroundColor: palette.bgPrimary, borderColor: palette.border },
    postActionsRow: { borderTopColor: palette.border },
    actionText: { color: palette.textMuted },
    modalOverlayCenter: { backgroundColor: palette.modalOverlay },
    modalContentCenter: { backgroundColor: palette.bgSurface, borderColor: palette.border },
    modalContentHomeStyle: { backgroundColor: palette.bgPrimary, borderColor: palette.border },
    closeHomeModalBtn: { backgroundColor: palette.bgSurface, borderColor: palette.border },
    listItem: { backgroundColor: palette.bgPrimary, borderColor: palette.border },
    listName: { color: palette.textPrimary },
    listCity: { color: palette.textMuted },
    secondaryActionChip: { backgroundColor: palette.bgElevated, borderWidth: 1, borderColor: palette.border },
    commentBubble: { backgroundColor: palette.bgElevated },
    commentText: { color: palette.textSecondary },
    commentInputRow: { borderTopColor: palette.border },
    commentInput: { backgroundColor: palette.bgPrimary, borderColor: palette.border, color: palette.textPrimary },
    storyFloatingBtn: { backgroundColor: palette.bgElevated, borderColor: palette.border },
    storyCanvasBox: { backgroundColor: palette.bgPrimary, borderColor: palette.border },
    controlGroup: { backgroundColor: palette.bgElevated, borderColor: palette.border },
    miniBtn: { backgroundColor: palette.bgPrimary, borderColor: palette.border },
    miniBtnText: { color: palette.textPrimary },
    bgOptionChip: { backgroundColor: palette.bgElevated, borderColor: palette.border },
    activeBgChip: { borderColor: palette.accent, backgroundColor: palette.bgPrimary },
    bgOptionText: { color: palette.textPrimary },
    creatorInsightsBox: { backgroundColor: palette.bgElevated, borderColor: palette.accent },
    viewerItemRow: { backgroundColor: palette.bgPrimary, borderColor: palette.border },
    storyLikeRow: { backgroundColor: palette.bgElevated, borderColor: palette.border },
    sportTagBadge: { backgroundColor: palette.bgElevated },
    statsRow: { backgroundColor: palette.bgElevated, borderColor: palette.border },
    profileFollowingBtn: { backgroundColor: palette.bgElevated },
    blockProfileBtn: { backgroundColor: palette.bgElevated, borderColor: palette.danger },
    postsSectionHeader: { borderTopColor: palette.border },
    emptyPostsBox: { backgroundColor: palette.bgElevated, borderColor: palette.border },
    postThumbnailBox: { backgroundColor: palette.bgSurface },
    privateAccountBox: { backgroundColor: palette.bgElevated, borderColor: palette.border },
  });

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#09090B' },
  scrollContent: { padding: 20, paddingTop: 50, paddingBottom: 40 },
  
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  homeCategory: { color: '#EAB308', fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  appTitle: { color: '#FAFAFA', fontSize: 24, fontWeight: '900', fontStyle: 'italic', letterSpacing: 1 },
  
  createBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EAB308', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, shadowColor: '#EAB308', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 6, elevation: 4 },
  createBtnText: { color: '#09090B', fontWeight: '800', fontSize: 12 },
  
  notificationBellBtn: { 
    width: 38, 
    height: 38, 
    borderRadius: 19, 
    backgroundColor: '#121215', 
    borderWidth: 1, 
    borderColor: '#27272A', 
    justifyContent: 'center', 
    alignItems: 'center',
    position: 'relative'
  },

  storiesContainer: { marginBottom: 25 },
  storyItem: { alignItems: 'center', marginRight: 16 },
  myStoryRing: { width: 68, height: 68, borderRadius: 34, borderWidth: 2, borderColor: '#EAB308', justifyContent: 'center', alignItems: 'center', position: 'relative', backgroundColor: '#18181B', overflow: 'hidden' },
  myStoryRingActive: { borderWidth: 2, borderColor: '#EAB308' },
  storyRing: { width: 68, height: 68, borderRadius: 34, borderWidth: 2, justifyContent: 'center', alignItems: 'center', backgroundColor: '#18181B', overflow: 'hidden' },
  unwatchedRing: { borderColor: '#EAB308' }, 
  watchedRing: { borderColor: '#52525B' },    
  storyImg: { width: '100%', height: '100%' },
  avatarPlaceholder: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center', backgroundColor: '#18181B' },
  avatarPlaceholderText: { color: '#EAB308', fontSize: 20, fontWeight: 'bold' },
  plusBadge: { position: 'absolute', bottom: 2, right: 2, backgroundColor: '#EAB308', borderRadius: 9, width: 20, height: 20, justifyContent: 'center', alignItems: 'center', borderWidth: 1.5, borderColor: '#09090B' },
  storyName: { color: '#A1A1AA', fontSize: 11, fontWeight: '600' },

  emptyFeedBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 50, backgroundColor: '#121215', borderRadius: 20, borderWidth: 1, borderColor: '#27272A', marginBottom: 16 },
  emptyFeedText: { color: '#71717A', fontSize: 13, marginTop: 10, textAlign: 'center', paddingHorizontal: 20 },

  postCard: { backgroundColor: '#121215', borderWidth: 1, borderColor: '#27272A', borderRadius: 20, padding: 16, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5 },
  postHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  postAvatarBox: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#18181B', borderWidth: 1, borderColor: '#EAB308', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  avatarImg: { width: '100%', height: '100%' },
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

  commentRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  commentAvatar: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: '#EAB308', overflow: 'hidden' },
  commentAvatarPlaceholder: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: '#EAB308', backgroundColor: '#18181B', justifyContent: 'center', alignItems: 'center' },
  commentUser: { color: '#EAB308', fontSize: 12, fontWeight: '700' },
  commentText: { color: '#D4D4D8', fontSize: 13 },
  commentTimeText: { color: '#71717A', fontSize: 10 },
  commentBubble: { flex: 1, marginLeft: 10, backgroundColor: '#18181B', padding: 10, borderRadius: 12 },
  secondaryActionChip: { backgroundColor: '#27272A', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#52525B' },
  
  commentsModalContent: { backgroundColor: '#121215', borderRadius: 28, padding: 20, borderWidth: 1, borderColor: '#27272A', width: '100%', maxWidth: 400, height: '75%', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 16, elevation: 10 },
  commentInputRow: { flexDirection: 'row', gap: 8, alignItems: 'center', borderTopWidth: 1, borderTopColor: '#27272A', paddingTop: 12, marginTop: 4 },
  commentInput: { flex: 1, backgroundColor: '#09090B', borderWidth: 1, borderColor: '#27272A', borderRadius: 12, height: 42, color: '#FAFAFA', paddingHorizontal: 12, fontSize: 13 },
  commentSendBtn: { backgroundColor: '#EAB308', width: 38, height: 42, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },

  storyModalOverlay: { flex: 1, backgroundColor: 'rgba(9,9,11,0.95)', justifyContent: 'center', alignItems: 'center', position: 'relative' },
  closeStoryBtn: { position: 'absolute', top: 50, right: 20, zIndex: 20, backgroundColor: '#18181B', width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#27272A' },
  storyViewerScrollContentContainer: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 10, width: '100%' },
  storyViewerCard: { width: width * 0.96, height: height * 0.92, backgroundColor: '#121215', borderRadius: 24, overflow: 'hidden', alignItems: 'center', position: 'relative', paddingBottom: 15, borderWidth: 1, borderColor: '#27272A' },
  storyEditorCard: { width: '92%', height: '88%', backgroundColor: '#121215', borderRadius: 24, overflow: 'hidden', alignItems: 'center', padding: 16, borderWidth: 1, borderColor: '#27272A' },
  
  storyCanvasBox: { width: '100%', height: '52%', position: 'relative', justifyContent: 'center', alignItems: 'center', borderRadius: 16, overflow: 'hidden', backgroundColor: '#09090B', borderWidth: 1, borderColor: '#27272A' },
  storyCanvasImage: { width: '100%', height: '100%', resizeMode: 'cover' },

  storyControlsRow: { flexDirection: 'row', justifyContent: 'space-around', width: '100%', marginVertical: 10 },
  controlGroup: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#18181B', borderRadius: 10, padding: 4, borderWidth: 1, borderColor: '#27272A' },
  miniBtn: { width: 32, height: 32, justifyContent: 'center', alignItems: 'center', backgroundColor: '#09090B', borderRadius: 8, marginHorizontal: 2, borderWidth: 1, borderColor: '#27272A' },
  activeMiniBtn: { backgroundColor: '#EAB308', borderColor: '#EAB308' },
  miniBtnText: { color: '#FAFAFA', fontWeight: 'bold', fontSize: 12 },

  colorPaletteRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 10 },
  colorCircle: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: '#27272A' },

  bgOptionsRow: { flexDirection: 'row', marginBottom: 10, maxHeight: 36 },
  bgOptionChip: { backgroundColor: '#18181B', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, marginRight: 6, borderWidth: 1, borderColor: '#27272A', justifyContent: 'center' },
  activeBgChip: { borderColor: '#EAB308', backgroundColor: '#27272A' },
  bgOptionText: { color: '#FAFAFA', fontSize: 11, fontWeight: '700' },

  fullStoryMediaBox: { 
    width: '100%', 
    flex: 1, 
    backgroundColor: '#000000', 
    justifyContent: 'center', 
    alignItems: 'center', 
    overflow: 'hidden' 
  },
  fullStoryImage: { width: '100%', height: '100%', resizeMode: 'contain' },
  fullStoryVideo: { width: '100%', height: '100%' },
  fullStoryName: { color: '#FAFAFA', fontSize: 14, fontWeight: '700' },
  
  storyHeaderUserRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', paddingHorizontal: 16, paddingVertical: 8, zIndex: 25 },
  storyHeaderUserBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, zIndex: 25 },
  storyHeaderAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#18181B', borderWidth: 1, borderColor: '#EAB308', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },

  storyProgressBarsRow: { flexDirection: 'row', width: '92%', height: 3, backgroundColor: '#27272A', marginTop: 8, gap: 4, borderRadius: 2, overflow: 'hidden' },
  storyProgressBarContainer: { flex: 1, height: '100%', backgroundColor: '#3F3F46', overflow: 'hidden' },
  storyProgressBarFill: { height: '100%', backgroundColor: '#EAB308' },

  storyLikeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, backgroundColor: '#18181B', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#27272A' },
  creatorInsightsBox: { width: '90%', backgroundColor: '#18181B', borderRadius: 14, padding: 8, marginTop: 6, borderWidth: 1, borderColor: '#EAB308' },
  creatorInsightsTitle: { color: '#EAB308', fontWeight: 'bold', fontSize: 12, marginBottom: 2 },
  viewerItemRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#09090B', padding: 4, borderRadius: 8, marginTop: 2, borderWidth: 1, borderColor: '#27272A' },
  viewerAvatar: { width: 22, height: 22, borderRadius: 11, borderWidth: 1, borderColor: '#EAB308', overflow: 'hidden' },
  storyCommentItem: { flexDirection: 'row', backgroundColor: '#09090B', padding: 4, borderRadius: 8, marginTop: 2, borderWidth: 1, borderColor: '#27272A' },

  storyCommentInputRow: { flexDirection: 'row', width: '90%', marginTop: 6, gap: 8, alignItems: 'center' },
  storyCommentInputField: { flex: 1, backgroundColor: '#09090B', borderWidth: 1, borderColor: '#27272A', borderRadius: 12, height: 36, color: '#FAFAFA', paddingHorizontal: 12, fontSize: 12 },
  storyCommentSendBtn: { backgroundColor: '#EAB308', width: 36, height: 36, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },

  deleteStoryIconBtn: { position: 'absolute', top: 52, left: 16, backgroundColor: '#18181B', width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center', zIndex: 20, borderWidth: 1, borderColor: '#27272A' },
  reportStoryIconBtn: { position: 'absolute', top: 52, left: 16, backgroundColor: '#18181B', width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center', zIndex: 20, borderWidth: 1, borderColor: '#27272A' },

  storyTapLeft: { position: 'absolute', top: 90, left: 0, width: '35%', height: '65%', zIndex: 10 },
  storyTapRight: { position: 'absolute', top: 90, right: 0, width: '35%', height: '65%', zIndex: 10 },

  captionOverlayBox: { position: 'absolute', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, maxWidth: '85%', alignSelf: 'center' },
  captionViewerBox: { position: 'absolute', top: 200, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, maxWidth: '85%', alignSelf: 'center', zIndex: 5 },
  captionOverlayText: { textAlign: 'center' },

  storyTextInput: { width: '100%', backgroundColor: '#09090B', borderWidth: 1, borderColor: '#27272A', borderRadius: 12, color: '#FAFAFA', paddingHorizontal: 14, height: 44, marginBottom: 12, fontSize: 13 },
  publishStoryBtn: { width: '100%', backgroundColor: '#EAB308', borderRadius: 12, height: 46, justifyContent: 'center', alignItems: 'center', shadowColor: '#EAB308', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 6, elevation: 4 },
  publishStoryBtnText: { color: '#09090B', fontWeight: '900', fontSize: 15 },

  modalOverlayCenter: { flex: 1, backgroundColor: 'rgba(9,9,11,0.85)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 },
  
  modalContentHomeStyle: { backgroundColor: '#09090B', borderRadius: 28, padding: 20, borderWidth: 1, borderColor: '#27272A', width: '100%', maxWidth: 420, height: '88%', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.5, shadowRadius: 16, elevation: 12 },
  closeHomeModalBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#121215', borderWidth: 1, borderColor: '#27272A', justifyContent: 'center', alignItems: 'center' },

  modalContentCenter: { backgroundColor: '#121215', borderRadius: 28, padding: 20, borderWidth: 1, borderColor: '#27272A', width: '100%', maxWidth: 400, maxHeight: '85%', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 16, elevation: 10 },
  
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { color: '#FAFAFA', fontSize: 18, fontWeight: '800' },

  createPostInput: { backgroundColor: '#09090B', borderWidth: 1, borderColor: '#27272A', borderRadius: 14, color: '#FAFAFA', padding: 14, height: 110, textAlignVertical: 'top', marginBottom: 12, fontSize: 14 },
  pickImageBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#09090B', borderWidth: 1, borderColor: '#27272A', borderRadius: 12, height: 46, paddingHorizontal: 14, marginBottom: 16 },
  pickImageText: { color: '#EAB308', fontSize: 13, fontWeight: '600' },
  publishBtn: { backgroundColor: '#EAB308', borderRadius: 14, height: 48, justifyContent: 'center', alignItems: 'center', marginBottom: 6 },
  publishBtnText: { color: '#09090B', fontWeight: '900', fontSize: 15 },

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

  blockProfileBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', alignSelf: 'center', gap: 4, backgroundColor: '#18181B', borderWidth: 1, borderColor: '#EF4444', borderRadius: 8, height: 26, paddingHorizontal: 10 },
  blockProfileBtnText: { color: '#EF4444', fontWeight: '700', fontSize: 10 },

  postsSectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 6, borderTopWidth: 1, borderTopColor: '#27272A', paddingTop: 14 },
  sectionTitle: { color: '#FAFAFA', fontSize: 15, fontWeight: '700' },
  postsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 2 },
  postThumbnailBox: { width: (width * 0.85) / 3 - 4, height: (width * 0.85) / 3 - 4, backgroundColor: '#121215', borderRadius: 8, overflow: 'hidden' },
  postThumbnailImage: { width: '100%', height: '100%' },
  textPostThumbnail: { backgroundColor: '#18181B', justifyContent: 'center', alignItems: 'center', padding: 8 },
  postThumbnailText: { color: '#E4E4E7', fontSize: 10, lineHeight: 14, textAlign: 'center', marginTop: 5 },
  videoBadgeOverlay: { position: 'absolute', top: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 10, width: 22, height: 22, justifyContent: 'center', alignItems: 'center' },
  emptyPostsBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 30, backgroundColor: '#18181B', borderRadius: 14, borderWidth: 1, borderColor: '#27272A' },
  emptyPostsText: { color: '#71717A', fontSize: 12, marginTop: 6 },
  
  privateAccountBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40, paddingHorizontal: 20, backgroundColor: '#18181B', borderRadius: 16, borderWidth: 1, borderColor: '#27272A', marginTop: 10 },
  privateAccountTitle: { color: '#FAFAFA', fontSize: 16, fontWeight: 'bold', marginBottom: 6 },
  privateAccountText: { color: '#A1A1AA', fontSize: 12, textAlign: 'center', lineHeight: 18 },

  listItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#09090B', padding: 12, borderRadius: 14, marginBottom: 8, borderWidth: 1, borderColor: '#27272A' },
  listAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#18181B', justifyContent: 'center', alignItems: 'center', marginRight: 12, borderWidth: 1, borderColor: '#EAB308', overflow: 'hidden' },
  listName: { color: '#FAFAFA', fontSize: 14, fontWeight: '700' },
  listCity: { color: '#A1A1AA', fontSize: 11, marginTop: 2 },

  zoomedAvatarOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center' },
  closeZoomedBtn: { position: 'absolute', top: 50, right: 20, zIndex: 30, backgroundColor: '#121215', width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#27272A' },
  zoomedAvatarImage: { width: width * 0.9, height: width * 0.9, resizeMode: 'contain', borderRadius: 20 }
});