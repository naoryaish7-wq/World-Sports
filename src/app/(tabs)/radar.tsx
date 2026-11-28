import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { StyleSheet, Text, View, Dimensions, TouchableOpacity, ScrollView, Modal, TextInput, Alert, Linking, Platform, Image, Share } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import MapView, { Marker, Circle, PROVIDER_DEFAULT, MapPressEvent } from 'react-native-maps';
import * as Location from 'expo-location';
import { collection, onSnapshot, doc, addDoc, setDoc, deleteDoc, arrayUnion, arrayRemove, query, orderBy, updateDoc, where, getDocs, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { registerForPushNotificationsAsync } from '../../services/notificationService';
import { syncJoinedMatchToLockWidget } from '../../../utils/lockScreenMatch';

const { width } = Dimensions.get('window');

const getRadarTheme = (isLight: boolean) => ({
  isLight,
  bg: isLight ? '#F4F4F6' : '#09090B',
  surface: isLight ? '#FFFFFF' : '#121215',
  surfaceAlt: isLight ? '#F8F9FA' : '#18181B',
  surfaceDeep: isLight ? '#ECEEF2' : '#09090B',
  border: isLight ? '#E4E4E7' : '#27272A',
  borderSubtle: isLight ? '#D4D4D8' : '#1E1E24',
  text: isLight ? '#09090B' : '#FAFAFA',
  textSecondary: isLight ? '#27272A' : '#E4E4E7',
  textMuted: isLight ? '#52525B' : '#A1A1AA',
  textSubtle: isLight ? '#71717A' : '#71717A',
  accent: '#EAB308',
  accentText: '#09090B',
  overlay: isLight ? 'rgba(9,9,11,0.45)' : 'rgba(9,9,11,0.85)',
  menuOverlay: isLight ? 'rgba(9,9,11,0.35)' : 'rgba(9,9,11,0.75)',
  pillBg: isLight ? 'rgba(255,255,255,0.92)' : 'rgba(9,9,11,0.85)',
});

type ChatMessage = {
  id: string;
  senderId?: string;
  sender?: string;
  senderName?: string;
  text: string;
  time?: string;
  createdAt?: any;
};

type UserProfile = {
  uid: string;
  name?: string;
  userName?: string;
  displayName?: string;
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
  pendingRequests?: string[];
  blockedUsers?: string[];
  expoPushToken?: string;
  pushToken?: string;
  isVip?: boolean;
  isPrivate?: boolean;
  themeMode?: 'dark' | 'light';
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

type MatchModeType = 'knockout' | 'winner_stays' | 'round_robin';

type TournamentMatch = {
  id: number;
  round: string;
  teamA: string;
  teamB: string;
  scoreA?: string;
  scoreB?: string;
  status: 'upcoming' | 'live' | 'finished';
  winner?: string;
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
  players: any[];
  pendingPlayers?: any[];
  accessMode?: 'public' | 'private' | 'friends';
  inviteCode?: string;
  onlyCreatorCanSee?: boolean;
  chat: ChatMessage[];
  teamsResult?: Array<{ id: number; players: any[] }>;
  matchMode?: MatchModeType;
  tournamentMatches?: TournamentMatch[];
  playersPerTeam?: number;
  createdAt?: any;
};

const ALL_AVAILABLE_SPORTS = [
  'Football',
  'Basketball',
  'Tennis',
  'Running',
  'Fitness',
  'Cycling',
  'Swimming'
];

const HOURS_LIST = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES_LIST = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));

const CITY_ENGLISH_MAP: Record<string, string> = {
  'נתניה': 'Netanya',
  'תל אביב': 'Tel Aviv',
  'תל אביב-יפו': 'Tel Aviv',
  'ירושלים': 'Jerusalem',
  'חיפה': 'Haifa',
  'באר שבע': 'Beer Sheva',
  'ראשון לציון': 'Rishon LeZion',
  'פתח תקווה': 'Petah Tikva',
  'אשדוד': 'Ashdod',
  'אשקלון': 'Ashkelon',
  'הרצליה': 'Herzliya',
  'רמת גן': 'Ramat Gan',
  'רעננה': 'Ra\'anana',
  'כפר סבא': 'Kfar Saba',
  'חולון': 'Holon',
  'בת ים': 'Bat Yam',
  'מודיעין': 'Modi\'in',
  'רחובות': 'Rehovot',
  'אילת': 'Eilat',
  'לוס אנג\'לס': 'Los Angeles',
  'ניו יורק': 'New York',
  'לונדון': 'London',
  'פריז': 'Paris',
  'מדריד': 'Madrid',
  'ברצלונה': 'Barcelona',
};

const normalizeCity = (rawCity?: string): string => {
  const value = (rawCity || '').trim();
  if (!value) return 'Current Location';

  if (CITY_ENGLISH_MAP[value]) {
    return CITY_ENGLISH_MAP[value];
  }

  const lower = value.toLowerCase();
  const matchedKey = Object.keys(CITY_ENGLISH_MAP).find(k => k.toLowerCase() === lower);
  if (matchedKey) {
    return CITY_ENGLISH_MAP[matchedKey];
  }

  const englishOnly = value
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!englishOnly) {
    return 'Current Location';
  }

  return englishOnly
    .split(' ')
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

const generateInviteCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

const getSportIconAndColor = (sportName: string, isLight: boolean = false) => {
  const sport = (sportName || '').toLowerCase().trim();

  if (sport.includes('football') || sport.includes('כדורגל') || sport.includes('soccer')) {
    return { icon: 'football', color: '#22C55E', bg: isLight ? '#DCFCE7' : '#143825', border: '#22C55E' };
  }
  if (sport.includes('basketball') || sport.includes('כדורסל')) {
    return { icon: 'basketball', color: '#F97316', bg: isLight ? '#FFEDD5' : '#3D2012', border: '#F97316' };
  }
  if (sport.includes('tennis') || sport.includes('טניס')) {
    return { icon: 'tennisball', color: '#EAB308', bg: isLight ? '#FEF9C3' : '#332E0F', border: '#EAB308' };
  }
  if (sport.includes('running') || sport.includes('ריצה')) {
    return { icon: 'fitness', color: '#3B82F6', bg: isLight ? '#DBEAFE' : '#10223D', border: '#3B82F6' };
  }
  if (sport.includes('gym') || sport.includes('fitness') || sport.includes('כושר') || sport.includes('workout')) {
    return { icon: 'barbell', color: '#EF4444', bg: isLight ? '#FEE2E2' : '#3D1518', border: '#EF4444' };
  }
  if (sport.includes('padel') || sport.includes('פדל')) {
    return { icon: 'planet', color: '#A855F7', bg: isLight ? '#F3E8FF' : '#2C153D', border: '#A855F7' };
  }
  if (sport.includes('cycling') || sport.includes('אופניים')) {
    return { icon: 'bicycle', color: '#06B6D4', bg: isLight ? '#CFFAFE' : '#0F3138', border: '#06B6D4' };
  }
  if (sport.includes('swimming') || sport.includes('שחייה')) {
    return { icon: 'water', color: '#0EA5E9', bg: isLight ? '#E0F2FE' : '#102B3D', border: '#0EA5E9' };
  }

  return { icon: 'trophy', color: '#EAB308', bg: isLight ? '#FEF9C3' : '#332E0F', border: '#EAB308' };
};

const supportsTournamentDraw = (sportName: string) => {
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

const resolvePlayerInfo = (playerEntry: any, allUsersList: UserProfile[]) => {
  let rawKey = '';
  if (!playerEntry) {
    rawKey = 'Player';
  } else if (typeof playerEntry === 'string') {
    rawKey = playerEntry.replace(/👑|\(me\)/g, '').trim();
  } else if (typeof playerEntry === 'object') {
    rawKey = playerEntry.name || playerEntry.userName || playerEntry.displayName || playerEntry.email || '';
  } else {
    rawKey = String(playerEntry);
  }

  const cleanKey = rawKey.toLowerCase();

  const matchedUser = allUsersList.find(u => {
    if (!u) return false;
    const uUid = (u.uid || '').toLowerCase();
    const uName = (u.name || '').toLowerCase();
    const uUserName = (u.userName || '').toLowerCase();
    const uDisplay = (u.displayName || '').toLowerCase();

    return (
      (uUid && cleanKey.includes(uUid)) ||
      (uName && cleanKey === uName) ||
      (uUserName && cleanKey === uUserName) ||
      (uDisplay && cleanKey === uDisplay) ||
      (cleanKey.includes('@') && uUid.includes(cleanKey.split('@')[0]))
    );
  });

  if (matchedUser) {
    const finalName = matchedUser.name || matchedUser.userName || matchedUser.displayName || rawKey.split('@')[0] || 'Player';
    return {
      name: finalName.replace(/👑|\(me\)/g, '').trim(),
      avatar: matchedUser.avatar || '',
      isVip: !!matchedUser.isVip,
      uid: matchedUser.uid
    };
  }

  if (rawKey.includes('@')) {
    const emailName = rawKey.split('@')[0];
    return {
      name: emailName.charAt(0).toUpperCase() + emailName.slice(1),
      avatar: '',
      isVip: false,
      uid: ''
    };
  }

  return {
    name: rawKey || 'Player',
    avatar: typeof playerEntry === 'object' ? (playerEntry.avatar || '') : '',
    isVip: false,
    uid: ''
  };
};

function PostVideoPlayer({ uri, isStoryOpen, style }: { uri: string; isStoryOpen: boolean; style: any }) {
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

  return <VideoView style={style} player={player} nativeControls={true} contentFit="cover" />;
}

function ProfileVideoThumbnail({ uri, style }: { uri: string; style: any }) {
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
      style={style}
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
  const [isLightMode, setIsLightMode] = useState(false);
  const theme = useMemo(() => getRadarTheme(isLightMode), [isLightMode]);
  const styles = useMemo(() => createStyles(theme), [theme]);

  const mapRef = useRef<MapView | null>(null);
  const [mapType, setMapType] = useState<'standard' | 'hybrid'>('standard');
  const [is3DMode, setIs3DMode] = useState(false);

  const [userSports, setUserSports] = useState<string[]>([]);
  const [gamesList, setGamesList] = useState<GameItem[]>([]);
  const [currentUserId, setCurrentUserId] = useState('');
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [userName, setUserName] = useState('Player');
  const [userAvatar, setUserAvatar] = useState('');
  const [userCoords, setUserCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [autoCity, setAutoCity] = useState('Current Location');
  const [followingIds, setFollowingIds] = useState<string[]>([]);
  const [followersIds, setFollowersIds] = useState<string[]>([]);
  const [blockedUsersList, setBlockedUsersList] = useState<string[]>([]);
  const [allUsersList, setAllUsersList] = useState<UserProfile[]>([]);
  const [allPosts, setAllPosts] = useState<PostItem[]>([]);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSportFilters, setSelectedSportFilters] = useState<string[]>(['All']);
  const [sportFilterModalVisible, setSportFilterModalVisible] = useState(false);

  const [gameActionMenuVisible, setGameActionMenuVisible] = useState(false);
  const [joinByCodeModalVisible, setJoinByCodeModalVisible] = useState(false);
  const [codeInput, setCodeInput] = useState('');
  const [joiningByCode, setJoiningByCode] = useState(false);

  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newSport, setNewSport] = useState('Football');
  const [newVenue, setNewVenue] = useState('');
  const [selectedHour, setSelectedHour] = useState('18');
  const [selectedMinute, setSelectedMinute] = useState('00');
  const [timePickerVisible, setTimePickerVisible] = useState(false);
  const [newMaxPlayers, setNewMaxPlayers] = useState('10');
  const [newDesc, setNewDesc] = useState('');
  const [newAccessMode, setNewAccessMode] = useState<'public' | 'private' | 'friends'>('public');

  const newTime = `${selectedHour}:${selectedMinute}`;

  const [pickedLocation, setPickedLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [isPickingLocation, setIsPickingLocation] = useState(false);

  const [selectedGame, setSelectedGame] = useState<GameItem | null>(null);
  const [studioGameId, setStudioGameId] = useState<string | null>(null);
  const [drawStudioModalVisible, setDrawStudioModalVisible] = useState(false);
  const [selectedMatchMode, setSelectedMatchMode] = useState<MatchModeType>('knockout');
  const [chatMessage, setChatMessage] = useState('');
  const chatScrollRef = useRef<any>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [drawPlayersPerTeam, setDrawPlayersPerTeam] = useState('5');

  const [selectedUserModalId, setSelectedUserModalId] = useState<string | null>(null);
  const [targetProfileUser, setTargetProfileUser] = useState<UserProfile | null>(null);
  const [targetUserPosts, setTargetUserPosts] = useState<PostItem[]>([]);
  const [targetActiveModalList, setTargetActiveModalList] = useState<'followers' | 'following' | null>(null);

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

  const studioGame = gamesList.find(g => g.id === studioGameId) || selectedGame || null;

  const handleCenterOnUser = () => {
    if (!userCoords || !mapRef.current) return;
    mapRef.current.animateCamera(
      {
        center: userCoords,
        pitch: is3DMode ? 45 : 0,
        heading: 0,
        altitude: 1800,
        zoom: 15,
      },
      { duration: 600 }
    );
  };

  const handleToggle3D = () => {
    const next3D = !is3DMode;
    setIs3DMode(next3D);
    if (!mapRef.current) return;
    mapRef.current.animateCamera(
      {
        center: userCoords || { latitude: mapRegion.latitude, longitude: mapRegion.longitude },
        pitch: next3D ? 45 : 0,
      },
      { duration: 500 }
    );
  };

  useEffect(() => {
    let isMounted = true;
    const syncSavedThemeAndUser = async () => {
      try {
        const [savedEmail, savedTheme] = await Promise.all([
          AsyncStorage.getItem('@saved_user_email'),
          AsyncStorage.getItem('@world_sports_theme_mode'),
        ]);
        if (!isMounted) return;
        if (savedTheme === 'light' || savedTheme === 'dark') {
          setIsLightMode(savedTheme === 'light');
        }
        if (savedEmail) {
          const computedId = savedEmail.toLowerCase().replace(/[^a-z0-9]/g, '_');
          setCurrentUserId(prev => {
            if (prev !== computedId) {
              registerForPushNotificationsAsync(computedId);
              return computedId;
            }
            return prev;
          });
        }
      } catch (e) {
        console.error('Error reading saved user email or theme in Radar:', e);
      }
    };

    syncSavedThemeAndUser();
    const pollInterval = setInterval(syncSavedThemeAndUser, 1000);

    return () => {
      isMounted = false;
      clearInterval(pollInterval);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (studioGame?.matchMode) {
      setSelectedMatchMode(studioGame.matchMode);
    }
  }, [studioGame?.id, studioGame?.matchMode]);

  const isBlockedBidirectional = useCallback((otherUserId?: string, otherUserName?: string): boolean => {
    const cleanName = (otherUserName || '').trim().toLowerCase();
    const resolvedOther = allUsersList.find(
      u => (otherUserId && u.uid === otherUserId) || (cleanName && (u.name || u.userName || u.displayName || '').trim().toLowerCase() === cleanName)
    );
    const resolvedUid = resolvedOther?.uid || otherUserId;
    if (!resolvedUid || resolvedUid === currentUserId) return false;

    const iBlockedThem = blockedUsersList.includes(resolvedUid);
    const theyBlockedMe = Array.isArray(resolvedOther?.blockedUsers) && currentUserId
      ? resolvedOther.blockedUsers.includes(currentUserId)
      : false;

    return iBlockedThem || theyBlockedMe;
  }, [allUsersList, blockedUsersList, currentUserId]);

  const sendPushNotificationToUser = useCallback(async (
    targetUid: string,
    subTitle: string,
    body: string,
    extraData: Record<string, any> = {}
  ) => {
    if (!targetUid || targetUid === currentUserId) return;

    try {
      const targetUser = allUsersList.find(u => u.uid === targetUid);
      const pushToken = targetUser?.expoPushToken || targetUser?.pushToken;

      if (!pushToken || typeof pushToken !== 'string' || !pushToken.startsWith('ExponentPushToken')) {
        return;
      }

      const fullTitle = subTitle
        ? `World Sports • ${subTitle.replace(/^World Sports\s*[•\-–:]?\s*/i, '').trim()}`
        : 'World Sports';

      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: pushToken,
          sound: 'default',
          title: fullTitle,
          body,
          data: extraData,
          channelId: 'default',
        }),
      });
    } catch (error) {
      console.error('Error sending push notification:', error);
    }
  }, [allUsersList, currentUserId]);

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
            const cityFound = normalizeCity(reverseGeocode[0].city || reverseGeocode[0].subregion || 'Current Location');
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
    if (!currentUserId) return;

    const unsubscribeUserDoc = onSnapshot(doc(db, 'users', currentUserId), (userSnap) => {
      if (userSnap.exists()) {
        const data = userSnap.data() as UserProfile;
        setCurrentUser({ ...data, uid: userSnap.id });

        if (data.themeMode === 'light' || data.themeMode === 'dark') {
          setIsLightMode(data.themeMode === 'light');
          AsyncStorage.setItem('@world_sports_theme_mode', data.themeMode).catch(() => {});
        }

        if (Array.isArray(data.sports) && data.sports.length > 0) {
          setUserSports(data.sports);
          setNewSport(prev => (data.sports!.includes(prev) ? prev : data.sports![0]));
        } else if (data.sport) {
          setUserSports([data.sport]);
          setNewSport(data.sport);
        } else {
          setUserSports(ALL_AVAILABLE_SPORTS);
        }

        const resolvedName = data.name || data.userName || data.displayName || 'Player';
        setUserName(resolvedName);
        if (data.avatar) setUserAvatar(data.avatar);
        setFollowingIds(Array.isArray(data.following) ? data.following : []);
        setFollowersIds(Array.isArray(data.followers) ? data.followers : []);
        setBlockedUsersList(Array.isArray(data.blockedUsers) ? data.blockedUsers : []);
      }
    });

    return () => unsubscribeUserDoc();
  }, [currentUserId]);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'users'), (snapshot) => {
      const users: UserProfile[] = snapshot.docs.map(docSnap => ({
        uid: docSnap.id,
        ...(docSnap.data() as Omit<UserProfile, 'uid'>)
      }));
      setAllUsersList(users);
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

    const unsubscribe = onSnapshot(doc(db, 'users', selectedUserModalId), (userSnap) => {
      if (userSnap.exists()) {
        setTargetProfileUser({ uid: userSnap.id, ...(userSnap.data() as Omit<UserProfile, 'uid'>) });
      }
    }, (e) => {
      console.error('Error fetching target user:', e);
    });

    return () => unsubscribe();
  }, [selectedUserModalId]);

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

  useEffect(() => {
    if (!targetProfileUser) return;
    if (isBlockedBidirectional(targetProfileUser.uid, targetProfileUser.name || targetProfileUser.userName || targetProfileUser.displayName)) {
      setTargetUserPosts([]);
      return;
    }
    const tName = (targetProfileUser.name || targetProfileUser.userName || targetProfileUser.displayName || '').trim().toLowerCase();
    const filtered = allPosts.filter(p =>
      p.userId === targetProfileUser.uid ||
      (p.userName && p.userName.trim().toLowerCase() === tName) ||
      (p.authorName && p.authorName.trim().toLowerCase() === tName)
    );
    setTargetUserPosts(filtered);
  }, [targetProfileUser, allPosts, isBlockedBidirectional]);

  useEffect(() => {
    const calculateAverageAge = async () => {
      if (!selectedGame || !selectedGame.players || selectedGame.players.length === 0) {
        setTeamAverageAge('N/A');
        return;
      }

      try {
        let totalAge = 0;
        let countWithAge = 0;

        for (const playerEntry of selectedGame.players) {
          const info = resolvePlayerInfo(playerEntry, allUsersList);
          const cleanName = info.name.toLowerCase();
          if (!cleanName) continue;

          let userAge: number | undefined = undefined;

          const myNameStr = (currentUser?.name || currentUser?.userName || currentUser?.displayName || userName || '').trim().toLowerCase();
          if (currentUser && currentUser.age && (cleanName === myNameStr || cleanName === 'me')) {
            userAge = Number(currentUser.age);
          }

          if (!userAge) {
            const foundUser = allUsersList.find(u => {
              const uN = (u.name || u.userName || u.displayName || '').trim().toLowerCase();
              return uN === cleanName || u.uid === info.uid;
            });
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
        return updated || prev;
      });
    });
    return () => unsubscribe();
  }, []);

  const isAllSelected = selectedSportFilters.includes('All');

  const handleToggleSportFilter = (sportName: string) => {
    if (sportName === 'All') {
      setSelectedSportFilters(['All']);
      return;
    }

    setSelectedSportFilters(prev => {
      const withoutAll = prev.filter(item => item !== 'All');
      const exists = withoutAll.includes(sportName);
      if (exists) {
        const next = withoutAll.filter(item => item !== sportName);
        return next.length === 0 ? ['All'] : next;
      }
      return [...withoutAll, sportName];
    });
  };

  const openMapsNavigation = (venue: string, city: string) => {
    const queryStr = encodeURIComponent(`${venue}, ${normalizeCity(city)}`);
    const url = Platform.OS === 'ios' ? `maps:0,0?q=${queryStr}` : `geo:0,0?q=${queryStr}`;
    Linking.openURL(url);
  };

  const handleShareGameCode = async (
    gameTitle: string,
    gameSport: string,
    venueName: string,
    city: string,
    time: string,
    creatorName: string,
    inviteCode?: string
  ) => {
    const codePart = inviteCode ? `🔑 Game Code: ${inviteCode}` : '🔑 Game Code unavailable';
    const messageBody =
      `⚽ ${gameTitle} (${gameSport})\n` +
      `📍 ${venueName}, ${normalizeCity(city)} | ⏰ ${time}\n` +
      `👑 ${creatorName}\n` +
      `${codePart}`;

    try {
      await Share.share({ message: messageBody });
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

  const handleJoinByCode = async () => {
    const cleanCode = codeInput.trim().toUpperCase();
    if (!cleanCode) {
      Alert.alert('Missing Code', 'Please enter a game code.');
      return;
    }

    setJoiningByCode(true);
    try {
      const q = query(collection(db, 'games'), where('inviteCode', '==', cleanCode));
      const snap = await getDocs(q);

      if (snap.empty) {
        Alert.alert('Invalid Code ❌', 'No active game found with this code.');
        setJoiningByCode(false);
        return;
      }

      const gameDoc = snap.docs[0];
      let gameData: GameItem = { id: gameDoc.id, ...(gameDoc.data() as Omit<GameItem, 'id'>) };
      const activeName = userName || 'Player';
      const currentPlayers = gameData.players || [];

      const isAlreadyJoined = currentPlayers.some(
        p => resolvePlayerInfo(p, allUsersList).name.trim().toLowerCase() === activeName.trim().toLowerCase()
      );

      if (!isAlreadyJoined) {
        if (currentPlayers.length >= gameData.maxPlayers) {
          Alert.alert('Game Full 🔴', 'This game has reached maximum capacity.');
          setJoiningByCode(false);
          return;
        }

        await updateDoc(doc(db, 'games', gameData.id), {
          players: arrayUnion(activeName)
        });
        gameData = {
          ...gameData,
          players: [...currentPlayers, activeName]
        };

        await syncJoinedMatchToLockWidget(currentUserId, {
          matchId: gameData.id,
          title: gameData.title || `${gameData.sport || 'Sport'} Match`,
          sport: gameData.sport || 'Sport',
          city: normalizeCity(gameData.city || autoCity),
          timeLabel: gameData.time || 'Today',
          playersCount: gameData.players.length,
          maxPlayers: gameData.maxPlayers,
          joinedCode: gameData.inviteCode,
        });

        await notifyGamePlayers(
          currentPlayers,
          'game_join',
          `${activeName} joined your game "${gameData.title}". ⚽`,
          gameData.id,
          currentUserId,
          `${gameData.title} ⚽`
        );
      }

      setCodeInput('');
      setJoinByCodeModalVisible(false);
      setSelectedGame(gameData);
      if (gameData.latitude && gameData.longitude) {
        setMapRegion(prev => ({
          ...prev,
          latitude: gameData.latitude,
          longitude: gameData.longitude,
        }));
      }
      Alert.alert('Joined Game 🔑', `You're in "${gameData.title}"!`);
    } catch (e) {
      console.error('Error joining by code:', e);
      Alert.alert('Error', 'Could not join game by code.');
    } finally {
      setJoiningByCode(false);
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
    setStudioGameId(null);
    setDrawStudioModalVisible(false);
    setSelectedPostModal(null);
    setCommentsModalPost(null);
    setTargetActiveModalList(null);
    setSelectedUserModalId(null);

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      let found: UserProfile | undefined = undefined;
      if (userId) {
        found = allUsersList.find(u => u.uid === userId);
      }
      if (!found && playerName) {
        found = allUsersList.find(u => {
          const uN = (u.name || u.userName || u.displayName || '').trim().toLowerCase();
          return uN === cleanPlayerName;
        });
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
    if (isBlockedBidirectional(targetProfileUser.uid, targetProfileUser.name || targetProfileUser.userName || targetProfileUser.displayName)) {
      Alert.alert('Unavailable', 'You cannot follow this user because a block is active.');
      return;
    }

    const isApproved = targetProfileUser.followers?.includes(currentUserId);
    const hasRequested = targetProfileUser.pendingRequests?.includes(currentUserId);
    const isPrivateAccount = targetProfileUser.isPrivate === true;
    const activeFollowerName = userName || currentUser?.name || currentUser?.userName || currentUser?.displayName || 'Player';

    try {
      const myRef = doc(db, 'users', currentUserId);
      const targetRef = doc(db, 'users', targetProfileUser.uid);

      if (isApproved) {
        await updateDoc(targetRef, { followers: arrayRemove(currentUserId) });
        await updateDoc(myRef, { following: arrayRemove(targetProfileUser.uid) });
        setTargetProfileUser({
          ...targetProfileUser,
          followers: targetProfileUser.followers?.filter(id => id !== currentUserId)
        });
      } else if (hasRequested) {
        await updateDoc(targetRef, { pendingRequests: arrayRemove(currentUserId) });
        setTargetProfileUser({
          ...targetProfileUser,
          pendingRequests: targetProfileUser.pendingRequests?.filter(id => id !== currentUserId)
        });
      } else if (isPrivateAccount) {
        await updateDoc(targetRef, { pendingRequests: arrayUnion(currentUserId) });
        setTargetProfileUser({
          ...targetProfileUser,
          pendingRequests: [...(targetProfileUser.pendingRequests || []), currentUserId]
        });

        const reqMsg = `${activeFollowerName} requested to follow you. 🔒`;
        await addDoc(collection(db, 'users', targetProfileUser.uid, 'notifications'), {
          senderUid: currentUserId,
          type: 'follow_request',
          message: reqMsg,
          createdAt: serverTimestamp(),
          status: 'unread'
        });

        await sendPushNotificationToUser(targetProfileUser.uid, 'Follow Request 🔒', reqMsg, {
          type: 'follow_request',
          senderUid: currentUserId,
        });
      } else {
        await updateDoc(targetRef, { followers: arrayUnion(currentUserId) });
        await updateDoc(myRef, { following: arrayUnion(targetProfileUser.uid) });
        setTargetProfileUser({
          ...targetProfileUser,
          followers: [...(targetProfileUser.followers || []), currentUserId]
        });

        const followMsg = `${activeFollowerName} started following you! 🤝`;
        await addDoc(collection(db, 'users', targetProfileUser.uid, 'notifications'), {
          senderUid: currentUserId,
          type: 'new_follower',
          message: followMsg,
          createdAt: serverTimestamp(),
          status: 'unread'
        });

        await sendPushNotificationToUser(targetProfileUser.uid, 'New Follower 🤝', followMsg, {
          type: 'new_follower',
          senderUid: currentUserId,
        });
      }
    } catch (error) {
      console.error('Error updating follow status:', error);
    }
  };

  const handleToggleBlockTargetUser = async () => {
    if (!targetProfileUser || !currentUserId || !targetProfileUser.uid || targetProfileUser.uid === currentUserId) {
      return;
    }

    const targetUid = targetProfileUser.uid;
    const targetDisplayName = targetProfileUser.name || targetProfileUser.userName || targetProfileUser.displayName || 'this user';
    const alreadyBlocked = blockedUsersList.includes(targetUid);

    if (alreadyBlocked) {
      Alert.alert(
        'Unblock User',
        `Are you sure you want to unblock ${targetDisplayName}?`,
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
      `Block ${targetDisplayName}? You won't see each other's content or interact with each other.`,
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
              setFollowingIds(prev => prev.filter(id => id !== targetUid));
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

  const toggleLike = async (postId: string) => {
    if (!currentUserId) return;
    const post = allPosts.find(p => p.id === postId) || selectedPostModal;
    if (!post) return;
    if (isBlockedBidirectional(post.userId, post.userName || post.authorName)) return;

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
    if (!text.trim() || !currentUserId) return;

    const post = allPosts.find(p => p.id === postId) || commentsModalPost || selectedPostModal;
    if (!post) return;
    if (isBlockedBidirectional(post.userId, post.userName || post.authorName)) {
      Alert.alert('Blocked', 'You cannot comment on posts from this user because a block is active.');
      return;
    }

    const newComment: Comment = {
      id: Date.now().toString(),
      userId: currentUserId,
      user: userName,
      avatarUrl: userAvatar || '',
      text: text.trim(),
      createdAt: serverTimestamp()
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
    if (!studioGame) return;
    if (!supportsTournamentDraw(studioGame.sport)) {
      Alert.alert('Not Available', 'Team draw is available only for football, basketball, and tennis.');
      return;
    }
    const playersList = studioGame.players || [];
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

    const newTeams: Array<{ id: number; players: any[] }> = [];
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
      const gameRef = doc(db, 'games', studioGame.id);
      await updateDoc(gameRef, {
        teamsResult: newTeams,
        playersPerTeam: effectiveTeamSize,
        tournamentMatches: []
      });
      Alert.alert('Teams Shuffled! 🎲', `Created ${newTeams.length} teams from ${totalPlayers} players.`);
    } catch (e) {
      console.error('Error saving team draw:', e);
      Alert.alert('Error', 'Could not save team draw results.');
    }
  };

  const buildMatchesForMode = (
    teams: Array<{ id: number; players: any[] }>,
    mode: MatchModeType
  ): TournamentMatch[] => {
    const teamNames = teams.map(t => `Team #${t.id}`);
    const matches: TournamentMatch[] = [];
    let matchIdCounter = 1;

    if (mode === 'winner_stays') {
      const firstA = teamNames[0];
      const firstB = teamNames[1];
      matches.push({
        id: matchIdCounter++,
        round: 'Winner Stays • Match 1',
        teamA: firstA,
        teamB: firstB,
        status: 'live'
      });

      const bench = teamNames.slice(2);
      bench.forEach((benchTeam, idx) => {
        matches.push({
          id: matchIdCounter++,
          round: `Winner Stays • Queue #${idx + 1}`,
          teamA: 'Current Winner',
          teamB: benchTeam,
          status: 'upcoming'
        });
      });
      return matches;
    }

    if (mode === 'round_robin') {
      for (let i = 0; i < teamNames.length; i++) {
        for (let j = i + 1; j < teamNames.length; j++) {
          matches.push({
            id: matchIdCounter++,
            round: `League • Match #${matchIdCounter - 1}`,
            teamA: teamNames[i],
            teamB: teamNames[j],
            status: 'upcoming'
          });
        }
      }
      return matches;
    }

    let currentRoundTeams = [...teamNames];
    let roundName =
      currentRoundTeams.length > 4
        ? 'Quarter-Finals'
        : currentRoundTeams.length > 2
        ? 'Semi-Finals'
        : 'Grand Final';

    if (currentRoundTeams.length % 2 !== 0) {
      currentRoundTeams.push('Bye');
    }

    let nextRoundTeams: string[] = [];
    for (let i = 0; i < currentRoundTeams.length; i += 2) {
      const teamA = currentRoundTeams[i];
      const teamB = currentRoundTeams[i + 1];

      matches.push({
        id: matchIdCounter++,
        round: roundName,
        teamA,
        teamB,
        status: 'upcoming'
      });

      if (teamB === 'Bye') {
        nextRoundTeams.push(teamA);
      } else {
        nextRoundTeams.push(`Winner of #${matchIdCounter - 1}`);
      }
    }

    if (nextRoundTeams.length > 1) {
      let subRoundName = nextRoundTeams.length > 2 ? 'Semi-Finals' : 'Grand Final';
      let finalRoundTeams: string[] = [];

      for (let i = 0; i < nextRoundTeams.length; i += 2) {
        if (i + 1 < nextRoundTeams.length) {
          matches.push({
            id: matchIdCounter++,
            round: subRoundName,
            teamA: nextRoundTeams[i],
            teamB: nextRoundTeams[i + 1],
            status: 'upcoming'
          });
          finalRoundTeams.push(`Winner of #${matchIdCounter - 1}`);
        }
      }

      if (finalRoundTeams.length >= 2) {
        matches.push({
          id: matchIdCounter++,
          round: 'Grand Final',
          teamA: finalRoundTeams[0],
          teamB: finalRoundTeams[1],
          status: 'upcoming'
        });
      }
    }

    return matches;
  };

  const handleGenerateTournamentBracket = async (modeOverride?: MatchModeType) => {
    if (!studioGame) return;
    if (!supportsTournamentDraw(studioGame.sport)) {
      Alert.alert('Not Available', 'Matchups draw is available only for football, basketball, and tennis.');
      return;
    }

    const activeMode = modeOverride || selectedMatchMode;
    let teams = studioGame.teamsResult;
    const playersList = studioGame.players || [];

    if (!teams || teams.length < 2) {
      if (playersList.length < 2) {
        Alert.alert('Notice ⚠️', 'You need at least 2 players registered in the game to draw matchups.');
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
      Alert.alert('Error', 'Need at least 2 teams to draw matchups.');
      return;
    }

    const matches = buildMatchesForMode(teams, activeMode);

    try {
      const gameRef = doc(db, 'games', studioGame.id);
      await updateDoc(gameRef, {
        teamsResult: teams,
        matchMode: activeMode,
        tournamentMatches: matches
      });
    } catch (e) {
      console.error('Error generating tournament:', e);
      Alert.alert('Error', 'Could not generate matchups.');
    }
  };

  const handleSelectMatchMode = async (mode: MatchModeType) => {
    setSelectedMatchMode(mode);
    if (!studioGame || !isUserAdmin(studioGame)) return;
    try {
      await updateDoc(doc(db, 'games', studioGame.id), { matchMode: mode });
      if ((studioGame.teamsResult || []).length >= 2) {
        const updatedMatches = buildMatchesForMode(studioGame.teamsResult!, mode);
        await updateDoc(doc(db, 'games', studioGame.id), { tournamentMatches: updatedMatches });
      }
    } catch (e) {
      console.error('Error updating match mode:', e);
    }
  };

  const handleSetWinnerStaysResult = async (matchId: number, winnerTeam: string, loserTeam: string) => {
    if (!studioGame || !isUserAdmin(studioGame)) return;
    const currentMatches = studioGame.tournamentMatches || [];
    const matchIndex = currentMatches.findIndex(m => m.id === matchId);
    if (matchIndex === -1) return;

    const updatedMatches = currentMatches.map((m, idx) => {
      if (idx === matchIndex) {
        return { ...m, status: 'finished' as const, winner: winnerTeam };
      }
      if (idx === matchIndex + 1) {
        return {
          ...m,
          teamA: winnerTeam,
          status: 'live' as const
        };
      }
      return m;
    });

    const nextQueuedMatch: TournamentMatch = {
      id: currentMatches.length + 1,
      round: `Winner Stays • Rotation #${currentMatches.length + 1}`,
      teamA: winnerTeam,
      teamB: loserTeam,
      status: 'upcoming'
    };

    const finalMatches = [...updatedMatches, nextQueuedMatch];

    try {
      await updateDoc(doc(db, 'games', studioGame.id), {
        tournamentMatches: finalMatches
      });
    } catch (e) {
      console.error('Error advancing winner stays queue:', e);
    }
  };

  const handleCreateGame = async () => {
    const sportToSave = newSport || userSports[0] || 'Football';
    if (!newTitle.trim() || !newVenue.trim() || !newDesc.trim() || !sportToSave) {
      Alert.alert('Error', 'Please fill in all required fields.');
      return;
    }

    try {
      const gameLat = pickedLocation ? pickedLocation.latitude : (userCoords ? userCoords.latitude : 32.3215);
      const gameLon = pickedLocation ? pickedLocation.longitude : (userCoords ? userCoords.longitude : 34.8532);
      const activeName = userName || 'Player';
      const titleToSave = newTitle.trim();
      const venueToSave = newVenue.trim();
      const timeToSave = newTime.trim();
      const inviteCodeToSave = generateInviteCode();
      const normalizedCity = normalizeCity(autoCity);

      const newGameRef = await addDoc(collection(db, 'games'), {
        title: titleToSave,
        sport: sportToSave,
        venueName: venueToSave,
        city: normalizedCity,
        time: timeToSave,
        latitude: gameLat,
        longitude: gameLon,
        description: newDesc.trim(),
        creator: currentUserId,
        creatorName: activeName,
        maxPlayers: parseInt(newMaxPlayers) || 10,
        players: [activeName],
        pendingPlayers: [],
        accessMode: newAccessMode,
        inviteCode: inviteCodeToSave,
        onlyCreatorCanSee: false,
        chat: [],
        teamsResult: [],
        matchMode: 'knockout',
        tournamentMatches: [],
        createdAt: serverTimestamp()
      });

      const followersQuery = query(
        collection(db, 'users'),
        where('followers', 'array-contains', currentUserId)
      );
      const followersSnapshot = await getDocs(followersQuery);
      const followerIds = followersSnapshot.docs
        .map(profileDoc => profileDoc.id)
        .filter(uid => !!uid && uid !== currentUserId);

      await Promise.all(followerIds.map(async (uid) => {
        const msg = `${activeName} you follow created a new game! ⚽`;
        await addDoc(collection(db, 'users', uid, 'notifications'), {
          senderUid: currentUserId,
          type: 'game_created',
          message: msg,
          gameId: newGameRef.id,
          createdAt: serverTimestamp(),
          status: 'unread'
        });

        await sendPushNotificationToUser(uid, `New ${sportToSave} Game 📍`, msg, {
          type: 'game_created',
          gameId: newGameRef.id,
          senderUid: currentUserId,
        });
      }));

      setCreateModalVisible(false);
      setTimePickerVisible(false);
      setPickedLocation(null);
      setNewTitle('');
      setNewVenue('');
      setNewDesc('');
      setNewAccessMode('public');

      Alert.alert('Game Created 🔑', `Game published!\nGame Code: ${inviteCodeToSave}`, [
        { text: 'OK', onPress: () => {} },
        {
          text: 'Share Code 🔑',
          onPress: () => {
            handleShareGameCode(
              titleToSave,
              sportToSave,
              venueToSave,
              normalizedCity,
              timeToSave,
              activeName,
              inviteCodeToSave
            );
          }
        }
      ]);
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Could not create game.');
    }
  };

  const notifyGamePlayers = async (
    playerNames: any[],
    type: 'game_join' | 'game_leave' | 'game_deleted' | 'game_chat' | 'game_kick' | 'game_approved',
    message: string,
    gameId: string,
    senderUid: string = currentUserId,
    pushSubTitle: string = 'New Update ⚽'
  ) => {
    const recipientIds = Array.from(new Set(
      (playerNames || [])
        .map(p => {
          const info = resolvePlayerInfo(p, allUsersList);
          const cleanName = info.name.toLowerCase();
          return allUsersList.find(u => {
            const uN = (u.name || u.userName || u.displayName || '').trim().toLowerCase();
            return uN === cleanName || u.uid === info.uid;
          })?.uid;
        })
        .filter((uid): uid is string => !!uid && uid !== senderUid)
    ));

    await Promise.all(recipientIds.map(async (uid) => {
      await addDoc(collection(db, 'users', uid, 'notifications'), {
        senderUid,
        type,
        message,
        gameId,
        createdAt: serverTimestamp(),
        status: 'unread'
      });

      await sendPushNotificationToUser(uid, pushSubTitle, message, {
        type,
        gameId,
        senderUid,
      });
    }));
  };

  const handleJoinGame = async (game: GameItem) => {
    const activeName = userName || 'Player';
    const activeNameLower = activeName.trim().toLowerCase();
    const playersList = game.players || [];
    const isAlreadyJoined = playersList.some(
      p => resolvePlayerInfo(p, allUsersList).name.trim().toLowerCase() === activeNameLower
    );

    if (isAlreadyJoined) {
      Alert.alert('Already Joined', 'You are already registered for this game.');
      return;
    }

    const pendingList = game.pendingPlayers || [];
    const isAlreadyPending = pendingList.some(
      p => resolvePlayerInfo(p, allUsersList).name.trim().toLowerCase() === activeNameLower
    );

    if (isAlreadyPending) {
      try {
        const matchingPending = pendingList.find(
          p => resolvePlayerInfo(p, allUsersList).name.trim().toLowerCase() === activeNameLower
        );
        if (matchingPending) {
          await updateDoc(doc(db, 'games', game.id), {
            pendingPlayers: arrayRemove(matchingPending)
          });
        }
        Alert.alert('Request Cancelled ❌', 'Your join request has been cancelled.');
      } catch (e) {
        console.error('Error cancelling join request:', e);
      }
      return;
    }

    if (playersList.length >= game.maxPlayers) {
      Alert.alert('Game Full', 'Sorry, this game has reached maximum capacity.');
      return;
    }

    if (game.accessMode === 'friends') {
      Alert.alert('Friend Game Locked 🔒', 'Use the game code in Join by Code to enter this game.');
      return;
    }

    if (game.accessMode === 'private') {
      try {
        await updateDoc(doc(db, 'games', game.id), {
          pendingPlayers: arrayUnion(activeName)
        });

        const adminUid = allUsersList.find(u => {
          const uN = (u.name || u.userName || u.displayName || '').trim().toLowerCase();
          const cN = (game.creatorName || '').trim().toLowerCase();
          return uN === cN || u.uid === game.creator;
        })?.uid;

        if (adminUid && adminUid !== currentUserId) {
          const reqMsg = `${activeName} requested to join your private game "${game.title}". 🔒`;
          await addDoc(collection(db, 'users', adminUid, 'notifications'), {
            senderUid: currentUserId,
            type: 'game_request',
            message: reqMsg,
            gameId: game.id,
            createdAt: serverTimestamp(),
            status: 'unread'
          });

          await sendPushNotificationToUser(adminUid, 'Join Request 🔒', reqMsg, {
            type: 'game_request',
            gameId: game.id,
            senderUid: currentUserId,
          });
        }

        Alert.alert('Request Sent ⏳', 'Your request to join has been sent to the game admin for approval.');
      } catch (e) {
        console.error('Error sending request to join:', e);
      }
      return;
    }

    try {
      await setDoc(doc(db, 'games', game.id), { players: arrayUnion(activeName) }, { merge: true });
      await syncJoinedMatchToLockWidget(currentUserId, {
        matchId: game.id,
        title: game.title || `${game.sport || 'Sport'} Match`,
        sport: game.sport || 'Sport',
        city: normalizeCity(game.city || autoCity),
        timeLabel: game.time || 'Today',
        playersCount: playersList.length + 1,
        maxPlayers: game.maxPlayers,
        joinedCode: game.inviteCode,
      });
      await notifyGamePlayers(
        playersList,
        'game_join',
        `${activeName} joined your game "${game.title}". ⚽`,
        game.id,
        currentUserId,
        `${game.title} ⚽`
      );
      Alert.alert('Success 🤝', 'You have joined the team!');
    } catch (e) { console.error('Error joining game or sending notifications:', e); }
  };

  const handleApproveRequest = async (game: GameItem, playerEntry: any) => {
    try {
      const info = resolvePlayerInfo(playerEntry, allUsersList);
      const pName = info.name;
      const updatedPending = (game.pendingPlayers || []).filter(p => resolvePlayerInfo(p, allUsersList).name !== pName);
      const updatedPlayers = [...(game.players || []), pName];

      await updateDoc(doc(db, 'games', game.id), {
        players: updatedPlayers,
        pendingPlayers: updatedPending
      });

      const approvedUserObj = allUsersList.find(u => {
        const uN = (u.name || u.userName || u.displayName || '').trim().toLowerCase();
        return uN === pName.toLowerCase() || u.uid === info.uid;
      });
      if (approvedUserObj) {
        const approvedMsg = `Your request to join "${game.title}" was approved! 🎉`;
        await addDoc(collection(db, 'users', approvedUserObj.uid, 'notifications'), {
          senderUid: currentUserId,
          type: 'game_approved',
          message: approvedMsg,
          gameId: game.id,
          createdAt: serverTimestamp(),
          status: 'unread'
        });

        await sendPushNotificationToUser(approvedUserObj.uid, 'Request Approved 🎉', approvedMsg, {
          type: 'game_approved',
          gameId: game.id,
          senderUid: currentUserId,
        });
      }

      Alert.alert('Approved ✓', `${pName} was approved and added to the game!`);
    } catch (e) {
      console.error('Error approving player:', e);
    }
  };

  const handleRejectRequest = async (game: GameItem, playerEntry: any) => {
    try {
      const info = resolvePlayerInfo(playerEntry, allUsersList);
      const pName = info.name;
      const updatedPending = (game.pendingPlayers || []).filter(p => resolvePlayerInfo(p, allUsersList).name !== pName);
      await updateDoc(doc(db, 'games', game.id), {
        pendingPlayers: updatedPending
      });

      const rejectedUserObj = allUsersList.find(u => {
        const uN = (u.name || u.userName || u.displayName || '').trim().toLowerCase();
        return uN === pName.toLowerCase() || u.uid === info.uid;
      });
      if (rejectedUserObj) {
        const rejectedMsg = `Your request to join "${game.title}" was declined by the manager. ❌`;
        await addDoc(collection(db, 'users', rejectedUserObj.uid, 'notifications'), {
          senderUid: currentUserId,
          type: 'game_kick',
          message: rejectedMsg,
          gameId: game.id,
          createdAt: serverTimestamp(),
          status: 'unread'
        });

        await sendPushNotificationToUser(rejectedUserObj.uid, 'Request Declined ❌', rejectedMsg, {
          type: 'game_kick',
          gameId: game.id,
          senderUid: currentUserId,
        });
      }

      Alert.alert('Rejected', `Request from ${pName} was declined.`);
    } catch (e) {
      console.error('Error rejecting player:', e);
    }
  };

  const handleKickPlayer = async (game: GameItem, playerEntry: any) => {
    const info = resolvePlayerInfo(playerEntry, allUsersList);
    const pName = info.name;
    Alert.alert('Kick Player ❌', `Are you sure you want to remove ${pName} from the game?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Kick',
        style: 'destructive',
        onPress: async () => {
          try {
            const updatedPlayers = (game.players || []).filter(p => resolvePlayerInfo(p, allUsersList).name !== pName);
            await updateDoc(doc(db, 'games', game.id), {
              players: updatedPlayers
            });

            const kickedUserObj = allUsersList.find(u => {
              const uN = (u.name || u.userName || u.displayName || '').trim().toLowerCase();
              return uN === pName.toLowerCase() || u.uid === info.uid;
            });
            if (kickedUserObj) {
              const kickedMsg = `You were removed from the game "${game.title}" by the manager. ❌`;
              await addDoc(collection(db, 'users', kickedUserObj.uid, 'notifications'), {
                senderUid: currentUserId,
                type: 'game_kick',
                message: kickedMsg,
                gameId: game.id,
                createdAt: serverTimestamp(),
                status: 'unread'
              });

              await sendPushNotificationToUser(kickedUserObj.uid, 'Removed from Game ❌', kickedMsg, {
                type: 'game_kick',
                gameId: game.id,
                senderUid: currentUserId,
              });
            }

            Alert.alert('Removed', `${pName} has been kicked from the game.`);
          } catch (e) {
            console.error('Error kicking player:', e);
          }
        }
      }
    ]);
  };

  const handleLeaveGame = async (game: GameItem) => {
    const activeName = userName || 'Player';
    const activeNameLower = activeName.trim().toLowerCase();
    try {
      const updatedPlayers = (game.players || []).filter(
        p => resolvePlayerInfo(p, allUsersList).name.trim().toLowerCase() !== activeNameLower
      );
      await notifyGamePlayers(
        game.players || [],
        'game_leave',
        `${activeName} left your game "${game.title}".`,
        game.id,
        currentUserId,
        `${game.title} ⚽`
      );
      if (updatedPlayers.length === 0) {
        await deleteDoc(doc(db, 'games', game.id));
        await syncJoinedMatchToLockWidget(currentUserId, null);
        setSelectedGame(null);
        Alert.alert('Left Game', 'You left the game and it was removed.');
        return;
      }

      let newCreatorName = game.creatorName;
      if ((game.creatorName || '').trim().toLowerCase() === activeNameLower) {
        newCreatorName = resolvePlayerInfo(updatedPlayers[0], allUsersList).name;
      }

      await setDoc(doc(db, 'games', game.id), {
        players: updatedPlayers,
        creatorName: newCreatorName,
      }, { merge: true });

      await syncJoinedMatchToLockWidget(currentUserId, null);
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
            const game = gamesList.find(g => g.id === gameId) || selectedGame;
            if (game) {
              await notifyGamePlayers(
                game.players || [],
                'game_deleted',
                `The game "${game.title}" was deleted by its manager. 🗑️`,
                game.id,
                currentUserId,
                'Game Cancelled 🗑️'
              );
            }
            await deleteDoc(doc(db, 'games', gameId));
            await syncJoinedMatchToLockWidget(currentUserId, null);
            setSelectedGame(null);
          } catch (e) { console.error('Error deleting game or notifying players:', e); }
        }
      }
    ]);
  };

  const handleSendTeamChatMessage = async (gameId: string) => {
    if (!chatMessage.trim()) return;
    const trimmedMsg = chatMessage.trim();
    const newMessage: ChatMessage = {
      id: Date.now().toString(),
      senderId: currentUserId,
      sender: userName || 'Player',
      text: trimmedMsg,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    try {
      const gameRef = doc(db, 'games', gameId);
      const updatedChat = selectedGame ? [...(selectedGame.chat || []), newMessage] : [newMessage];
      await setDoc(gameRef, { chat: updatedChat }, { merge: true });
      if (selectedGame) {
        await notifyGamePlayers(
          selectedGame.players || [],
          'game_chat',
          `${userName || 'A player'} sent a message in "${selectedGame.title}": ${trimmedMsg.slice(0, 60)} 💬`,
          gameId,
          currentUserId,
          `${selectedGame.title} 💬`
        );
      }
      setChatMessage('');
      setTimeout(() => {
        chatScrollRef.current?.scrollToEnd({ animated: true });
      }, 100);
    } catch (e) { console.error(e); }
  };

  const isUserAdmin = useCallback((game: GameItem) => {
    const cName = (game.creatorName || '').trim().toLowerCase();
    const uName = (userName || '').trim().toLowerCase();
    return cName === uName || (!!currentUserId && game.creator === currentUserId);
  }, [userName, currentUserId]);

  const filteredGames = gamesList.filter(game => {
    if (isBlockedBidirectional(game.creator, game.creatorName)) return false;

    const activeNameLower = (userName || '').trim().toLowerCase();
    const isPlayerInGame = (game.players || []).some(
      p => resolvePlayerInfo(p, allUsersList).name.trim().toLowerCase() === activeNameLower
    );
    if (game.onlyCreatorCanSee && !isUserAdmin(game) && !isPlayerInGame) {
      return false;
    }

    if (game.accessMode === 'friends') {
      const isMyGame = isUserAdmin(game) || isPlayerInGame;
      if (!isMyGame) return false;
    }

    if (!isAllSelected && selectedSportFilters.length > 0) {
      const gameSportLower = (game.sport || '').toLowerCase().trim();

      const matchesAnySelected = selectedSportFilters.some(filterSport => {
        const filterLower = filterSport.toLowerCase().trim();
        return (
          gameSportLower.includes(filterLower) ||
          filterLower.includes(gameSportLower) ||
          (filterLower.includes('football') && (gameSportLower.includes('soccer') || gameSportLower.includes('כדורגל'))) ||
          (filterLower.includes('fitness') && (gameSportLower.includes('gym') || gameSportLower.includes('כושר')))
        );
      });

      if (!matchesAnySelected) return false;
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const titleMatch = game.title.toLowerCase().includes(q);
      const venueMatch = game.venueName.toLowerCase().includes(q);
      const cityMatch = normalizeCity(game.city).toLowerCase().includes(q) || game.city.toLowerCase().includes(q);
      const codeMatch = (game.inviteCode || '').toLowerCase().includes(q);
      if (!titleMatch && !venueMatch && !cityMatch && !codeMatch) return false;
    }

    return true;
  });

  const nearbyMutualFriends = allUsersList.filter(u => {
    if (u.uid === currentUserId) return false;
    if (isBlockedBidirectional(u.uid, u.name || u.userName || u.displayName)) return false;
    const isMutual = followingIds.includes(u.uid) && followersIds.includes(u.uid);
    if (!isMutual) return false;
    if (!userCoords || !u.latitude || !u.longitude) return false;
    const dist = calculateDistance(userCoords.latitude, userCoords.longitude, u.latitude, u.longitude);
    return dist <= 10;
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

  const canViewPostsContent = !isAnyBlockBetweenUs && (isViewingMyOwnProfile || !isPrivateAccount || isApprovedFollower);
  const activeCustomSports = selectedSportFilters.filter(s => s !== 'All');
  const currentFilterSportStyle = activeCustomSports.length === 1
    ? getSportIconAndColor(activeCustomSports[0], isLightMode)
    : { icon: 'options-outline', color: '#EAB308', bg: isLightMode ? '#FEF9C3' : '#332E0F', border: '#EAB308' };
  const filterButtonLabel = isAllSelected || activeCustomSports.length === 0
    ? 'Filter'
    : activeCustomSports.length === 1
      ? activeCustomSports[0]
      : `${activeCustomSports[0]} +${activeCustomSports.length - 1}`;

  return (
    <View style={styles.container}>

      <View style={styles.headerRow}>
        <View>
          <Text style={styles.homeCategory}>Find</Text>
          <Text style={styles.appTitle}>World <Text style={{color: '#EAB308'}}>Sports</Text></Text>
        </View>
        <TouchableOpacity style={styles.createGameBtn} onPress={() => setGameActionMenuVisible(true)}>
          <Ionicons name="add-circle" size={16} color="#09090B" style={{ marginRight: 4 }} />
          <Text style={styles.createGameBtnText}>Game Hub 📍</Text>
          <Ionicons name="chevron-down" size={14} color="#09090B" style={{ marginLeft: 3 }} />
        </TouchableOpacity>
      </View>

      <Modal visible={gameActionMenuVisible} transparent={true} animationType="fade" onRequestClose={() => setGameActionMenuVisible(false)}>
        <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => setGameActionMenuVisible(false)}>
          <View style={styles.actionMenuCard}>
            <Text style={styles.actionMenuTitle}>Choose Action</Text>

            <TouchableOpacity
              style={styles.actionMenuOptionBtn}
              activeOpacity={0.85}
              onPress={() => {
                setGameActionMenuVisible(false);
                setCreateModalVisible(true);
              }}
            >
              <View style={[styles.actionMenuIconCircle, { backgroundColor: '#EAB30822' }]}>
                <Ionicons name="add-circle" size={20} color="#EAB308" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.actionMenuOptionTitle}>Create Game</Text>
                <Text style={styles.actionMenuOptionSub}>Publish a game + generate secret code</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionMenuOptionBtn}
              activeOpacity={0.85}
              onPress={() => {
                setGameActionMenuVisible(false);
                setJoinByCodeModalVisible(true);
              }}
            >
              <View style={[styles.actionMenuIconCircle, { backgroundColor: '#3B82F622' }]}>
                <Ionicons name="key" size={20} color="#3B82F6" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.actionMenuOptionTitle}>Join by Code</Text>
                <Text style={styles.actionMenuOptionSub}>Enter a 6-character game code</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={joinByCodeModalVisible} transparent={true} animationType="fade" onRequestClose={() => setJoinByCodeModalVisible(false)}>
        <View style={styles.modalOverlayCenter}>
          <View style={styles.modalContentCenter}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Join by Code 🔑</Text>
              <TouchableOpacity onPress={() => setJoinByCodeModalVisible(false)}>
                <Ionicons name="close" size={22} color={theme.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Enter Game Code</Text>
            <TextInput
              style={[styles.input, { textAlign: 'center', fontSize: 18, fontWeight: '900', letterSpacing: 3, color: '#EAB308' }]}
              placeholder="e.g. X7K9P2"
              placeholderTextColor={theme.textSubtle}
              value={codeInput}
              onChangeText={(txt) => setCodeInput(txt.toUpperCase())}
              maxLength={8}
              autoCapitalize="characters"
            />

            <TouchableOpacity
              style={[styles.publishBtn, joiningByCode && { opacity: 0.6 }]}
              onPress={handleJoinByCode}
              disabled={joiningByCode}
            >
              <Text style={styles.publishBtnText}>{joiningByCode ? 'Joining...' : 'Join Game 🚀'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <View style={styles.mapWrapper}>
        <MapView
          ref={mapRef}
          provider={PROVIDER_DEFAULT}
          style={styles.map}
          region={mapRegion}
          mapType={mapType}
          userInterfaceStyle={isLightMode ? 'light' : 'dark'}
          showsBuildings={true}
          showsCompass={false}
          showsScale={false}
          pitchEnabled={true}
          rotateEnabled={true}
          showsUserLocation={false}
          onPress={handleMapPressForCreating}
        >
          {userCoords && (
            <Circle
              center={userCoords}
              radius={1500}
              strokeWidth={1.5}
              strokeColor="rgba(234, 179, 8, 0.55)"
              fillColor="rgba(234, 179, 8, 0.08)"
            />
          )}

          {userCoords && currentUser && (
            <Marker
              coordinate={userCoords}
              title="You Are Here"
              onPress={() => openUserProfileById(currentUser.uid, currentUser.name || currentUser.userName || currentUser.displayName)}
            >
              <View style={styles.myLocationMarker}>
                <View style={styles.myLocationPulseRing}>
                  <View style={styles.myLocationAvatarBox}>
                    {userAvatar ? (
                      <Image source={{ uri: userAvatar }} style={{ width: '100%', height: '100%' }} />
                    ) : (
                      <Text style={styles.myLocationAvatarText}>{userName ? userName[0] : 'P'}</Text>
                    )}
                  </View>
                </View>
                <View style={styles.markerNamePill}>
                  <Text style={styles.myLocationNameText}>{userName}</Text>
                  {currentUser?.isVip && <Ionicons name="checkmark-circle" size={10} color="#EAB308" />}
                </View>
              </View>
            </Marker>
          )}

          {nearbyMutualFriends.map((friend) => {
            const friendName = friend.name || friend.userName || friend.displayName || 'Friend';
            return (
              <Marker
                key={`friend-${friend.uid}`}
                coordinate={{ latitude: friend.latitude!, longitude: friend.longitude! }}
                onPress={() => openUserProfileById(friend.uid, friendName)}
              >
                <View style={styles.friendMarkerContainer}>
                  <View style={styles.friendAvatarBox}>
                    {friend.avatar ? (
                      <Image source={{ uri: friend.avatar }} style={{ width: '100%', height: '100%' }} />
                    ) : (
                      <Text style={styles.friendAvatarText}>{friendName[0]}</Text>
                    )}
                  </View>
                  <View style={styles.markerNamePill}>
                    <Text style={styles.friendMarkerName}>{friendName}</Text>
                    {friend.isVip && <Ionicons name="checkmark-circle" size={10} color="#EAB308" />}
                  </View>
                </View>
              </Marker>
            );
          })}

          {filteredGames.map((game) => {
            const currentPlayersCount = game.players?.length || 0;
            const { icon, color, bg, border } = getSportIconAndColor(game.sport, isLightMode);

            return (
              <Marker
                key={game.id}
                coordinate={{ latitude: game.latitude, longitude: game.longitude }}
                onPress={() => setSelectedGame(game)}
              >
                <View style={{ alignItems: 'center' }}>
                  <View style={[styles.customMarkerContainer, { backgroundColor: bg, borderColor: border }]}>
                    <View style={[styles.markerIconBox, { backgroundColor: color }]}>
                      <Ionicons name={icon as any} size={13} color="#09090B" />
                    </View>
                    <View style={styles.markerTextBox}>
                      <Text style={styles.markerTitleText} numberOfLines={1}>{game.title}</Text>
                      <Text style={[styles.markerPlayersText, { color }]}>👥 {currentPlayersCount}/{game.maxPlayers}</Text>
                    </View>
                  </View>
                  <View style={[styles.markerPointerTriangle, { borderTopColor: border }]} />
                </View>
              </Marker>
            );
          })}

          {pickedLocation && <Marker coordinate={pickedLocation} pinColor="gold" title="Chosen Venue Location" />}
        </MapView>

        <View style={styles.floatingMapControls}>
          <TouchableOpacity style={styles.mapControlBtn} onPress={handleCenterOnUser} activeOpacity={0.85}>
            <Ionicons name="locate" size={18} color="#EAB308" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.mapControlBtn, is3DMode && styles.mapControlBtnActive]}
            onPress={handleToggle3D}
            activeOpacity={0.85}
          >
            <Text style={[styles.mapControlBtnText, is3DMode && { color: '#09090B' }]}>3D</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.mapControlBtn, mapType === 'hybrid' && styles.mapControlBtnActive]}
            onPress={() => setMapType(prev => (prev === 'standard' ? 'hybrid' : 'standard'))}
            activeOpacity={0.85}
          >
            <Ionicons
              name={mapType === 'hybrid' ? 'map' : 'layers'}
              size={17}
              color={mapType === 'hybrid' ? '#09090B' : theme.text}
            />
          </TouchableOpacity>
        </View>
      </View>

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

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={styles.sheetTitle}>Nearby Games & Meetups 🏟️</Text>
          <Text style={styles.sheetSubtitle}>{filteredGames.length} active</Text>
        </View>

        <View style={styles.searchAndFilterRow}>
          <View style={styles.searchBarContainer}>
            <Ionicons name="search" size={16} color={theme.textMuted} style={{ marginRight: 8 }} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search game, location, or city... "
              placeholderTextColor={theme.textSubtle}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={16} color={theme.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity
            style={[
              styles.filterButton,
              !isAllSelected && { borderColor: currentFilterSportStyle.color, backgroundColor: currentFilterSportStyle.bg }
            ]}
            onPress={() => setSportFilterModalVisible(true)}
            activeOpacity={0.8}
          >
            <Ionicons
              name={isAllSelected ? 'options-outline' : (getSportIconAndColor(activeCustomSports[0], isLightMode).icon as any)}
              size={15}
              color={isAllSelected ? '#EAB308' : currentFilterSportStyle.color}
            />
            <Text style={[styles.filterButtonText, !isAllSelected && { color: currentFilterSportStyle.color }]}>
              {filterButtonLabel}
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60, paddingTop: 4 }}>
          {filteredGames.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="compass-outline" size={36} color={theme.textSubtle} />
              <Text style={styles.emptyNoticeText}>No games found matching your search or filters.</Text>
            </View>
          ) : (
            filteredGames.map(game => {
              const distance = userCoords ? calculateDistance(userCoords.latitude, userCoords.longitude, game.latitude, game.longitude) : 0;
              const spotsLeft = game.maxPlayers - (game.players?.length || 0);
              const timeCreatedStr = getTimeAgo(game.createdAt);
              const timeRemainingStr = getRemainingTime(game.createdAt);
              const sportStyle = getSportIconAndColor(game.sport, isLightMode);

              return (
                <TouchableOpacity key={game.id} style={[styles.gameCard, { borderColor: sportStyle.border + '66', backgroundColor: sportStyle.bg }]} onPress={() => setSelectedGame(game)}>
                  <View style={styles.gameHeaderRow}>
                    <Text style={[styles.sportTag, { color: sportStyle.color }]}>
                      {game.sport}
                      {game.accessMode === 'private' ? ' 🔒 Private' : game.accessMode === 'friends' ? ' 🔑 Friends' : ''}
                    </Text>
                    <Text style={styles.distanceTag}>📍 {distance} km away</Text>
                  </View>
                  <Text style={styles.gameTitle}>{game.title}</Text>
                  <Text style={styles.venueText}>🏟️ {game.venueName} ({normalizeCity(game.city)}) | ⏰ {game.time} | 👑 Admin: {game.creatorName}</Text>

                  <View style={styles.gameTimerRow}>
                    <Text style={styles.timerText}>⏳ Created: {timeCreatedStr}</Text>
                    <Text style={styles.timerExpiryText}>⌛ Expires in: {timeRemainingStr}</Text>
                  </View>

                  <View style={styles.gameFooterRow}>
                    <Text style={[styles.spotsTag, spotsLeft === 0 && { color: '#EF4444' }]}>
                      {spotsLeft > 0 ? `👥 ${spotsLeft} spots left (${game.players?.length || 0}/${game.maxPlayers})` : '🔴 Full Game'}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      {isUserAdmin(game) && game.inviteCode && (
                        <TouchableOpacity
                          onPress={() => handleShareGameCode(
                            game.title,
                            game.sport,
                            game.venueName,
                            game.city,
                            game.time,
                            game.creatorName,
                            game.inviteCode
                          )}
                          style={{ padding: 4 }}
                        >
                          <Ionicons name="key-outline" size={16} color={sportStyle.color} />
                        </TouchableOpacity>
                      )}
                      <Text style={[styles.detailsLink, { color: sportStyle.color }]}>View Details ›</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      </View>

      <Modal visible={sportFilterModalVisible} transparent={true} animationType="fade" onRequestClose={() => setSportFilterModalVisible(false)}>
        <View style={styles.modalOverlayCenter}>
          <View style={styles.modalContentCenter}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Filter by Sport </Text>
              <TouchableOpacity onPress={() => setSportFilterModalVisible(false)} activeOpacity={0.8}>
                <Ionicons name="close" size={22} color={theme.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 10 }}>
              <TouchableOpacity
                style={[styles.filterOptionItem, isAllSelected && styles.filterOptionItemActive]}
                onPress={() => handleToggleSportFilter('All')}
                activeOpacity={0.8}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={[styles.filterIconCircle, { backgroundColor: isLightMode ? '#FEF9C3' : '#332E0F' }]}>
                    <Ionicons name="apps" size={14} color="#EAB308" />
                  </View>
                  <Text style={[styles.filterOptionText, isAllSelected && styles.filterOptionTextActive]}>All Sports (All)</Text>
                </View>
                {isAllSelected && <Ionicons name="checkmark" size={18} color="#EAB308" />}
              </TouchableOpacity>

              {ALL_AVAILABLE_SPORTS.map(sport => {
                const isSelected = !isAllSelected && selectedSportFilters.includes(sport);
                const { icon, color, bg } = getSportIconAndColor(sport, isLightMode);

                return (
                  <TouchableOpacity
                    key={sport}
                    style={[
                      styles.filterOptionItem,
                      isSelected && { backgroundColor: theme.surfaceAlt, borderColor: color },
                      isAllSelected && { opacity: 0.55 }
                    ]}
                    onPress={() => handleToggleSportFilter(sport)}
                    activeOpacity={0.8}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View style={[styles.filterIconCircle, { backgroundColor: bg }]}>
                        <Ionicons name={icon as any} size={14} color={color} />
                      </View>
                      <Text style={[styles.filterOptionText, isSelected && { color, fontWeight: 'bold' }]}>{sport}</Text>
                    </View>
                    {isSelected && <Ionicons name="checkmark" size={18} color={color} />}
                  </TouchableOpacity>
                );
              })}

              <TouchableOpacity
                style={styles.publishBtn}
                onPress={() => setSportFilterModalVisible(false)}
                activeOpacity={0.85}
              >
                <Text style={styles.publishBtnText}>Apply Filter ✓</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={!!selectedGame} transparent={true} animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContentLarge}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>🏟️ Game Hub</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                {selectedGame && isUserAdmin(selectedGame) && selectedGame.inviteCode && (
                  <TouchableOpacity
                    onPress={() => handleShareGameCode(
                      selectedGame.title,
                      selectedGame.sport,
                      selectedGame.venueName,
                      selectedGame.city,
                      selectedGame.time,
                      selectedGame.creatorName,
                      selectedGame.inviteCode
                    )}
                  >
                    <Ionicons name="key-outline" size={20} color="#EAB308" />
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => setSelectedGame(null)}>
                  <Ionicons name="close" size={24} color={theme.text} />
                </TouchableOpacity>
              </View>
            </View>

            {selectedGame && (() => {
              const adminUserObj = allUsersList.find(u => {
                const uN = (u.name || u.userName || u.displayName || '').trim().toLowerCase();
                const cN = (selectedGame.creatorName || '').trim().toLowerCase();
                return uN === cN || u.uid === selectedGame.creator;
              });
              const timeCreatedStr = getTimeAgo(selectedGame.createdAt);
              const timeRemainingStr = getRemainingTime(selectedGame.createdAt);
              const sportStyle = getSportIconAndColor(selectedGame.sport, isLightMode);

              const activeNameLower = (userName || 'Player').trim().toLowerCase();
              const isAlreadyPending = (selectedGame.pendingPlayers || []).some(
                p => resolvePlayerInfo(p, allUsersList).name.trim().toLowerCase() === activeNameLower
              );
              const isAlreadyJoined = (selectedGame.players || []).some(
                p => resolvePlayerInfo(p, allUsersList).name.trim().toLowerCase() === activeNameLower
              );

              return (
                <ScrollView showsVerticalScrollIndicator={false}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={[styles.detailSportBadge, { backgroundColor: sportStyle.color, color: '#09090B' }]}>{selectedGame.sport} ({selectedGame.accessMode === 'private' ? '🔒 Private' : selectedGame.accessMode === 'friends' ? '🔑 Friends' : '🌍 Public'})</Text>
                    {isUserAdmin(selectedGame) && (
                      <TouchableOpacity onPress={() => handleDeleteGame(selectedGame.id)} style={styles.deleteGameBtn}>
                        <Ionicons name="trash-outline" size={16} color="#EF4444" />
                        <Text style={{ color: '#EF4444', fontWeight: 'bold', fontSize: 12, marginLeft: 4 }}>Delete Game</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  <Text style={styles.detailTitle}>{selectedGame.title}</Text>

                  {isUserAdmin(selectedGame) && selectedGame.inviteCode && (
                    <View style={[styles.detailBox, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderColor: '#EAB30866' }]}>
                      <View>
                        <Text style={[styles.detailLabel, { color: '#EAB308', marginBottom: 2 }]}>🔑 Game Code (Admin Only):</Text>
                        <Text style={{ color: theme.text, fontSize: 16, fontWeight: '900', letterSpacing: 2 }}>{selectedGame.inviteCode}</Text>
                      </View>
                      <TouchableOpacity
                        style={{ backgroundColor: '#EAB308', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 }}
                        onPress={() => handleShareGameCode(
                          selectedGame.title,
                          selectedGame.sport,
                          selectedGame.venueName,
                          selectedGame.city,
                          selectedGame.time,
                          selectedGame.creatorName,
                          selectedGame.inviteCode
                        )}
                      >
                        <Text style={{ color: '#09090B', fontWeight: '800', fontSize: 12 }}>Send Code</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  <View style={styles.modalTimerBox}>
                    <Text style={styles.modalTimerText}>⏳ Created {timeCreatedStr}</Text>
                    <Text style={styles.modalTimerExpiryText}>⌛ {timeRemainingStr} before expiry</Text>
                  </View>

                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 4 }}>
                    <Text style={styles.adminInfoText}> Game Admin:</Text>
                    <Text style={{ color: sportStyle.color, fontSize: 12, fontWeight: 'bold' }}>{selectedGame.creatorName}</Text>
                    {adminUserObj?.isVip && <Ionicons name="checkmark-circle" size={12} color="#EAB308" />}
                  </View>

                  <TouchableOpacity style={[styles.navigateBtn, { backgroundColor: sportStyle.color }]} onPress={() => openMapsNavigation(selectedGame.venueName, selectedGame.city)}>
                    <Ionicons name="navigate" size={16} color="#09090B" style={{ marginRight: 6 }} />
                    <Text style={styles.navigateBtnText}>Navigate to Location 🗺️</Text>
                  </TouchableOpacity>

                  <Text style={styles.detailVenue}>📍 {selectedGame.venueName}, {normalizeCity(selectedGame.city)} | ⏰ {selectedGame.time}</Text>

                  <View style={styles.detailBox}>
                    <Text style={styles.detailLabel}>📊 Team Average Age:</Text>
                    <Text style={{ color: sportStyle.color, fontSize: 14, fontWeight: 'bold' }}> {teamAverageAge}</Text>
                  </View>

                  <View style={styles.detailBox}>
                    <Text style={styles.detailLabel}>Description & Rules:</Text>
                    <Text style={styles.detailText}>{selectedGame.description}</Text>
                  </View>

                  {supportsTournamentDraw(selectedGame.sport) && (
                    <TouchableOpacity
                      style={[styles.studioLaunchBtn, { borderColor: sportStyle.color, backgroundColor: sportStyle.bg }]}
                      activeOpacity={0.85}
                      onPress={() => {
                        setStudioGameId(selectedGame.id);
                        setSelectedGame(null);
                        if (timeoutRef.current) clearTimeout(timeoutRef.current);
                        timeoutRef.current = setTimeout(() => {
                          setDrawStudioModalVisible(true);
                        }, 120);
                      }}
                    >
                      <View style={[styles.studioLaunchIconWrap, { backgroundColor: sportStyle.color }]}>
                        <Ionicons name="flash" size={18} color="#09090B" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.studioLaunchTitle, { color: sportStyle.color }]}>Teams & Matchups Studio</Text>
                        <Text style={styles.studioLaunchSub}>
                          {isUserAdmin(selectedGame)
                            ? 'Draw teams & choose tournament or winner-stays format'
                            : 'View drawn teams & match schedule'}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={20} color={sportStyle.color} />
                    </TouchableOpacity>
                  )}

                  {isUserAdmin(selectedGame) && selectedGame.accessMode === 'private' && selectedGame.pendingPlayers && selectedGame.pendingPlayers.length > 0 && (
                    <View style={styles.detailBox}>
                      <Text style={[styles.detailLabel, { color: '#EAB308', fontSize: 13 }]}>⏳ Pending Join Requests ({selectedGame.pendingPlayers.length}):</Text>
                      {selectedGame.pendingPlayers.map((reqPlayer, rIdx) => {
                        const reqInfo = resolvePlayerInfo(reqPlayer, allUsersList);
                        return (
                          <View key={rIdx} style={styles.pendingRequestCard}>
                            <Text style={{ color: theme.text, fontWeight: 'bold', fontSize: 12 }}>{reqInfo.name}</Text>
                            <View style={{ flexDirection: 'row', gap: 6 }}>
                              <TouchableOpacity style={{ backgroundColor: '#22C55E', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 }} onPress={() => handleApproveRequest(selectedGame, reqPlayer)}>
                                <Text style={{ color: '#09090B', fontWeight: 'bold', fontSize: 11 }}>Approve ✓</Text>
                              </TouchableOpacity>
                              <TouchableOpacity style={{ backgroundColor: '#EF4444', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 }} onPress={() => handleRejectRequest(selectedGame, reqPlayer)}>
                                <Text style={{ color: '#FAFAFA', fontWeight: 'bold', fontSize: 11 }}>Reject ✕</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  )}

                  <View style={styles.detailBox}>
                    <Text style={styles.detailLabel}>👥 Team Members ({selectedGame.players?.length || 0} / {selectedGame.maxPlayers}) - Tap profile:</Text>
                    <View style={styles.playersGridContainerSmall}>
                      {selectedGame.players?.map((playerEntry, index) => {
                        const info = resolvePlayerInfo(playerEntry, allUsersList);

                        const myNameStr = (userName || '').trim().toLowerCase();
                        const isMe = info.name.toLowerCase() === myNameStr || info.name.toLowerCase() === 'me';
                        const isCreatorAdmin = index === 0 || info.name.toLowerCase() === (selectedGame.creatorName || '').trim().toLowerCase();

                        return (
                          <TouchableOpacity
                            key={`player_${index}`}
                            style={[styles.playerChipSmallGrid, { borderColor: sportStyle.color + '66', backgroundColor: sportStyle.bg }, isMe && { borderColor: '#EAB308', backgroundColor: isLightMode ? '#FEF9C3' : '#332E0F' }]}
                            activeOpacity={0.7}
                            onPress={() => {
                              if (info.uid) {
                                openUserProfileById(info.uid, info.name);
                              } else {
                                openUserProfileById(undefined, info.name);
                              }
                            }}
                          >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                              <Text style={[styles.playerChipTextSmallGrid, { color: isMe ? '#EAB308' : sportStyle.color }]}>
                                {info.name} {isCreatorAdmin ? '👑' : ''} {isMe ? '(me)' : ''}
                              </Text>
                              {info.isVip && <Ionicons name="checkmark-circle" size={10} color="#EAB308" />}
                            </View>

                            {isUserAdmin(selectedGame) && !isMe && (
                              <TouchableOpacity
                                onPress={(e) => {
                                  e.stopPropagation();
                                  handleKickPlayer(selectedGame, playerEntry);
                                }}
                                style={{ padding: 2, marginLeft: 4 }}
                                activeOpacity={0.7}
                              >
                                <Ionicons name="close-circle" size={14} color="#EF4444" />
                              </TouchableOpacity>
                            )}
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
                        selectedGame.chat
                          .filter(msg => !isBlockedBidirectional(msg.senderId, msg.sender))
                          .map(msg => {
                          const senderUserObj = allUsersList.find(u => {
                            const uN = (u.name || u.userName || u.displayName || '').trim().toLowerCase();
                            return uN === (msg.sender || '').trim().toLowerCase();
                          });
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
                        placeholderTextColor={theme.textSubtle}
                        value={chatMessage}
                        onChangeText={setChatMessage}
                      />
                      <TouchableOpacity style={[styles.chatSendBtn, { backgroundColor: sportStyle.color }]} onPress={() => handleSendTeamChatMessage(selectedGame.id)}>
                        <Ionicons name="send" size={14} color="#09090B" />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {isAlreadyJoined ? (
                    <TouchableOpacity style={styles.leaveBtn} onPress={() => handleLeaveGame(selectedGame)}>
                      <Text style={styles.leaveBtnText}>Leave Game 🚪</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={[
                        styles.modalJoinBtn,
                        isAlreadyPending ? { backgroundColor: isLightMode ? '#FEE2E2' : '#1F1214', borderWidth: 1, borderColor: '#EF4444' } : { backgroundColor: sportStyle.color },
                        (selectedGame.players?.length >= selectedGame.maxPlayers || selectedGame.accessMode === 'friends') && !isAlreadyPending && { backgroundColor: theme.surfaceAlt }
                      ]}
                      onPress={() => handleJoinGame(selectedGame)}
                    >
                      <Text style={[
                        styles.modalJoinBtnText,
                        isAlreadyPending && { color: '#EF4444' },
                        (selectedGame.players?.length >= selectedGame.maxPlayers || selectedGame.accessMode === 'friends') && !isAlreadyPending && { color: theme.textMuted }
                      ]}>
                        {selectedGame.accessMode === 'friends'
                          ? 'Code Required (Join by Code) 🔑'
                          : isAlreadyPending
                          ? 'Cancel Request ❌'
                          : selectedGame.accessMode === 'private'
                          ? 'Request to Join 🔒'
                          : selectedGame.players?.length >= selectedGame.maxPlayers
                          ? 'Game Full 🔴'
                          : 'Join This Game 🤝'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </ScrollView>
              );
            })()}
          </View>
        </View>
      </Modal>

      <Modal
        visible={drawStudioModalVisible && !!studioGame}
        transparent={true}
        animationType="slide"
        onRequestClose={() => {
          setDrawStudioModalVisible(false);
          setStudioGameId(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.studioModalSheet}>
            {studioGame && (() => {
              const sportStyle = getSportIconAndColor(studioGame.sport, isLightMode);
              const isAdmin = isUserAdmin(studioGame);
              const teams = studioGame.teamsResult || [];
              const matches = studioGame.tournamentMatches || [];
              const activeMode = studioGame.matchMode || selectedMatchMode;

              return (
                <>
                  <View style={styles.studioHeader}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Ionicons name="trophy" size={14} color={sportStyle.color} />
                        <Text style={[styles.studioEyebrow, { color: sportStyle.color }]}>
                          {studioGame.sport.toUpperCase()} • {teams.length} TEAMS
                        </Text>
                      </View>
                      <Text style={styles.studioMainTitle} numberOfLines={1}>{studioGame.title}</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.studioCloseBtn}
                      onPress={() => {
                        setDrawStudioModalVisible(false);
                        setStudioGameId(null);
                      }}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="close" size={22} color={theme.text} />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.modeSelectorBar}>
                    <TouchableOpacity
                      style={[
                        styles.modeChipBtn,
                        activeMode === 'knockout' && { backgroundColor: sportStyle.color, borderColor: sportStyle.color }
                      ]}
                      onPress={() => handleSelectMatchMode('knockout')}
                      activeOpacity={0.85}
                    >
                      <Text style={[styles.modeChipText, activeMode === 'knockout' && styles.modeChipTextActive]}>
                        Tournament
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.modeChipBtn,
                        activeMode === 'winner_stays' && { backgroundColor: '#EAB308', borderColor: '#EAB308' }
                      ]}
                      onPress={() => handleSelectMatchMode('winner_stays')}
                      activeOpacity={0.85}
                    >
                      <Text style={[styles.modeChipText, activeMode === 'winner_stays' && styles.modeChipTextActive]}>
                        Winner Stays
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.modeChipBtn,
                        activeMode === 'round_robin' && { backgroundColor: '#3B82F6', borderColor: '#3B82F6' }
                      ]}
                      onPress={() => handleSelectMatchMode('round_robin')}
                      activeOpacity={0.85}
                    >
                      <Text style={[styles.modeChipText, activeMode === 'round_robin' && styles.modeChipTextActive]}>
                        Round Robin
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <ScrollView
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ paddingBottom: 32 }}
                  >
                    <View style={styles.twoColumnsWrapper}>
                      <View style={[styles.studioColumnCard, { borderColor: sportStyle.color + '44' }]}>
                        <View style={styles.columnTopHeader}>
                          <View style={[styles.columnBadgeIcon, { backgroundColor: sportStyle.color + '22' }]}>
                            <Ionicons name="shield" size={16} color={sportStyle.color} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.columnTitle}>Teams</Text>
                            <Text style={styles.columnSubtitle}>{teams.length} squads</Text>
                          </View>
                        </View>

                        {isAdmin && (
                          <View style={styles.columnActionPanel}>
                            <View style={styles.teamSizeRow}>
                              <Text style={styles.teamSizeLabel}>Per team:</Text>
                              <TextInput
                                style={[styles.compactSizeInput, { borderColor: sportStyle.color + '88' }]}
                                keyboardType="numeric"
                                value={drawPlayersPerTeam}
                                onChangeText={setDrawPlayersPerTeam}
                                maxLength={2}
                              />
                            </View>
                            <TouchableOpacity
                              style={[styles.columnPrimaryBtn, { backgroundColor: sportStyle.color }]}
                              onPress={handleRunAutoDraw}
                              activeOpacity={0.85}
                            >
                              <Ionicons name="shuffle" size={14} color="#09090B" />
                              <Text style={styles.columnPrimaryBtnText}>Draw Teams</Text>
                            </TouchableOpacity>
                          </View>
                        )}

                        {teams.length === 0 ? (
                          <View style={styles.columnEmptyState}>
                            <Ionicons name="shield-outline" size={26} color={theme.textSubtle} />
                            <Text style={styles.columnEmptyText}>No teams drawn yet</Text>
                          </View>
                        ) : (
                          <View style={{ gap: 8 }}>
                            {teams.map(team => {
                              const teamColors = ['#22C55E', '#F97316', '#3B82F6', '#A855F7', '#EF4444', '#EAB308'];
                              const accentCol = teamColors[(team.id - 1) % teamColors.length];
                              return (
                                <View key={team.id} style={[styles.studioTeamBox, { borderTopColor: accentCol }]}>
                                  <View style={styles.studioTeamHeader}>
                                    <Text style={[styles.studioTeamName, { color: accentCol }]}>Team #{team.id}</Text>
                                    <Text style={styles.studioTeamCount}>{team.players.length}p</Text>
                                  </View>
                                  <View style={{ gap: 4 }}>
                                    {team.players.map((playerEntry, pIdx) => {
                                      const info = resolvePlayerInfo(playerEntry, allUsersList);
                                      return (
                                        <View key={pIdx} style={styles.studioPlayerPill}>
                                          <Text style={styles.studioPlayerPillText} numberOfLines={1}>{info.name}</Text>
                                          {info.isVip && <Ionicons name="checkmark-circle" size={11} color="#EAB308" />}
                                        </View>
                                      );
                                    })}
                                  </View>
                                </View>
                              );
                            })}
                          </View>
                        )}
                      </View>

                      <View style={[styles.studioColumnCard, { borderColor: '#EAB30844' }]}>
                        <View style={styles.columnTopHeader}>
                          <View style={[styles.columnBadgeIcon, { backgroundColor: '#EAB30822' }]}>
                            <Ionicons name="git-compare" size={16} color="#EAB308" />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.columnTitle}>
                              {activeMode === 'winner_stays'
                                ? 'Winner Stays'
                                : activeMode === 'round_robin'
                                ? 'League'
                                : 'Bracket'}
                            </Text>
                            <Text style={styles.columnSubtitle}>{matches.length} games</Text>
                          </View>
                        </View>

                        {isAdmin && (
                          <View style={styles.columnActionPanel}>
                            <TouchableOpacity
                              style={[styles.columnPrimaryBtn, { backgroundColor: '#EAB308' }]}
                              onPress={() => handleGenerateTournamentBracket(activeMode)}
                              activeOpacity={0.85}
                            >
                              <Ionicons name="trophy" size={14} color="#09090B" />
                              <Text style={styles.columnPrimaryBtnText}>
                                {activeMode === 'winner_stays' ? 'Start Rotation' : 'Generate Games'}
                              </Text>
                            </TouchableOpacity>
                          </View>
                        )}

                        {matches.length === 0 ? (
                          <View style={styles.columnEmptyState}>
                            <Ionicons name="trophy-outline" size={26} color={theme.textSubtle} />
                            <Text style={styles.columnEmptyText}>No schedule yet</Text>
                          </View>
                        ) : (
                          <View style={{ gap: 8 }}>
                            {matches.map(match => {
                              const canPickWinner =
                                isAdmin &&
                                activeMode === 'winner_stays' &&
                                match.status !== 'finished' &&
                                !match.teamA.includes('Winner') &&
                                !match.teamB.includes('Bye');

                              return (
                                <View key={match.id} style={styles.studioMatchBox}>
                                  <View style={styles.studioMatchTop}>
                                    <Text style={styles.studioMatchNum}>#{match.id}</Text>
                                    <Text style={styles.studioMatchRound} numberOfLines={1}>{match.round}</Text>
                                  </View>

                                  <View style={styles.studioSidePill}>
                                    <Text style={styles.studioSideText} numberOfLines={1}>
                                      {match.teamA} {match.winner === match.teamA ? '👑' : ''}
                                    </Text>
                                  </View>

                                  <View style={styles.studioVsDivider}>
                                    <View style={styles.studioLine} />
                                    <Text style={styles.studioVsLabel}>VS</Text>
                                    <View style={styles.studioLine} />
                                  </View>

                                  <View style={styles.studioSidePill}>
                                    <Text
                                      style={[
                                        styles.studioSideText,
                                        match.teamB === 'Bye' && { color: theme.textSubtle, fontStyle: 'italic' }
                                      ]}
                                      numberOfLines={1}
                                    >
                                      {match.teamB} {match.winner === match.teamB ? '👑' : ''}
                                    </Text>
                                  </View>

                                  {canPickWinner && (
                                    <View style={styles.winnerPickRow}>
                                      <TouchableOpacity
                                        style={styles.winnerPickBtn}
                                        onPress={() => handleSetWinnerStaysResult(match.id, match.teamA, match.teamB)}
                                      >
                                        <Text style={styles.winnerPickBtnText} numberOfLines={1}>{match.teamA} Wins</Text>
                                      </TouchableOpacity>
                                      <TouchableOpacity
                                        style={styles.winnerPickBtn}
                                        onPress={() => handleSetWinnerStaysResult(match.id, match.teamB, match.teamA)}
                                      >
                                        <Text style={styles.winnerPickBtnText} numberOfLines={1}>{match.teamB} Wins</Text>
                                      </TouchableOpacity>
                                    </View>
                                  )}
                                </View>
                              );
                            })}
                          </View>
                        )}
                      </View>
                    </View>
                  </ScrollView>
                </>
              );
            })()}
          </View>
        </View>
      </Modal>

      <Modal visible={!!selectedUserModalId && !targetActiveModalList && !selectedPostModal && !commentsModalPost} animationType="slide" transparent={true} onRequestClose={() => setSelectedUserModalId(null)}>
        <View style={styles.modalOverlayCenter}>
          <View style={styles.modalContentHomeStyle}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.discoverCategory}>Player Profile</Text>
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
                <Ionicons name="close" size={22} color={theme.text} />
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
                      if (targetProfileUser.avatar && !isAnyBlockBetweenUs) {
                        setZoomedAvatarUri(targetProfileUser.avatar);
                      }
                    }}
                    activeOpacity={0.7}
                  >
                    {targetProfileUser.avatar && !isAnyBlockBetweenUs ? (
                      <Image source={{ uri: targetProfileUser.avatar }} style={styles.avatarImage} />
                    ) : (
                      <Text style={styles.avatarLargeText}>{targetProfileUser.name || targetProfileUser.userName || targetProfileUser.displayName ? (targetProfileUser.name || targetProfileUser.userName || targetProfileUser.displayName)?.[0] : 'P'}</Text>
                    )}
                  </TouchableOpacity>

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    <Text style={styles.profileName}>{targetProfileUser.name || targetProfileUser.userName || targetProfileUser.displayName}</Text>
                    {targetProfileUser.isVip && <Ionicons name="checkmark-circle" size={18} color="#EAB308" />}
                    {targetProfileUser.isPrivate && <Ionicons name="lock-closed" size={14} color="#EF4444" />}
                  </View>

                  {!isAnyBlockBetweenUs && (
                    <>
                      <View style={styles.sportsTagsRow}>
                        {targetSportsList.map((sport: string, index: number) => (
                          <View key={index} style={styles.sportTagBadge}>
                            <Text style={styles.sportTagText}> {sport}</Text>
                          </View>
                        ))}
                      </View>

                      <Text style={styles.profileCity}>
                        📍 {normalizeCity(targetProfileUser.city)}, {targetProfileUser.country || 'Israel'} |  Age: {targetProfileUser.age || 20}
                      </Text>
                    </>
                  )}
                </View>

                {!isAnyBlockBetweenUs && (
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
                )}

                {!isViewingMyOwnProfile && (
                  <View style={{ marginBottom: 16, gap: 10 }}>
                    {!isAnyBlockBetweenUs && currentUserId && (
                      <TouchableOpacity
                        style={[
                          styles.profileFollowBtn,
                          isApprovedFollower && styles.profileFollowingBtn,
                          hasRequestedFollow && { backgroundColor: theme.surfaceAlt, borderWidth: 1, borderColor: theme.textSubtle }
                        ]}
                        onPress={handleToggleFollowTarget}
                        activeOpacity={0.85}
                      >
                        <Text style={[
                          styles.profileFollowBtnText,
                          isApprovedFollower && styles.profileFollowingBtnText,
                          hasRequestedFollow && { color: theme.text }
                        ]}>
                          {isApprovedFollower ? 'Following ✓' : hasRequestedFollow ? 'Requested ⏳' : 'Follow Player 🤝'}
                        </Text>
                      </TouchableOpacity>
                    )}

                    {!isTargetBlockingMe && currentUserId && (
                      <TouchableOpacity
                        style={[
                          styles.blockProfileBtn,
                          isTargetBlockedByMe && styles.unblockProfileBtn,
                        ]}
                        onPress={handleToggleBlockTargetUser}
                        activeOpacity={0.85}
                      >
                        <Ionicons
                          name={isTargetBlockedByMe ? 'person-add-outline' : 'ban-outline'}
                          size={12}
                          color={isTargetBlockedByMe ? theme.text : '#EF4444'}
                        />
                        <Text
                          style={[
                            styles.blockProfileBtnText,
                            isTargetBlockedByMe && styles.unblockProfileBtnText,
                          ]}
                        >
                          {isTargetBlockedByMe ? 'Unblock' : 'Block'}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}

                {isAnyBlockBetweenUs ? (
                  <View style={styles.privateAccountBox}>
                    <Ionicons name="ban" size={40} color="#EF4444" style={{ marginBottom: 8 }} />
                    <Text style={styles.privateAccountTitle}>
                      {isTargetBlockedByMe ? 'You Blocked This User' : 'Content Unavailable'}
                    </Text>
                    <Text style={styles.privateAccountText}>
                      {isTargetBlockedByMe
                        ? 'Unblock this user to view their profile, posts, or send messages.'
                        : 'You cannot view this profile or communicate with this user.'}
                    </Text>
                  </View>
                ) : canViewPostsContent ? (
                  <>
                    <View style={styles.postsSectionHeader}>
                      <Ionicons name="grid-outline" size={18} color="#EAB308" />
                      <Text style={styles.sectionTitle}>Player Posts</Text>
                    </View>

                    {targetUserPosts.length === 0 ? (
                      <View style={styles.emptyPostsBox}>
                        <Ionicons name="images-outline" size={32} color={theme.textSubtle} />
                        <Text style={styles.emptyPostsText}>No posts shared yet by this user.</Text>
                      </View>
                    ) : (
                      <View style={styles.postsGrid}>
                        {targetUserPosts.map(post => {
                          const isVid = post.mediaType === 'video';
                          return (
                            <TouchableOpacity
                              key={post.id}
                              style={styles.postThumbnailBox}
                              onPress={() => setSelectedPostModal(post)}
                              activeOpacity={0.7}
                            >
                              {isVid ? (
                                <View style={[styles.postThumbnailImage, { backgroundColor: '#000', position: 'relative' }]}>
                                  {post.imageUrl ? <ProfileVideoThumbnail uri={post.imageUrl} style={styles.postThumbnailImage} /> : null}
                                  <View style={styles.videoBadgeOverlay}>
                                    <Ionicons name="play" size={14} color="#FAFAFA" />
                                  </View>
                                </View>
                              ) : (
                                <Image source={{ uri: post.imageUrl }} style={styles.postThumbnailImage} />
                              )}
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}
                  </>
                ) : (
                  <View style={styles.privateAccountBox}>
                    <Ionicons name="lock-closed" size={40} color="#EAB308" style={{ marginBottom: 8 }} />
                    <Text style={styles.privateAccountTitle}>This Account is Private 🔒</Text>
                    <Text style={styles.privateAccountText}>Follow this account to see their photos and videos.</Text>
                  </View>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

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

      <Modal visible={!!targetActiveModalList} animationType="slide" transparent={true} onRequestClose={() => setTargetActiveModalList(null)}>
        <View style={styles.modalOverlayCenter}>
          <View style={styles.modalContentCenter}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {targetActiveModalList === 'followers' ? 'Followers 👥' : 'Following 🤝'}
              </Text>
              <TouchableOpacity onPress={() => setTargetActiveModalList(null)} activeOpacity={0.8}>
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 350 }} showsVerticalScrollIndicator={false}>
              {(targetActiveModalList === 'followers' ? targetFollowersList : targetFollowingList)
                .filter((item) => !isBlockedBidirectional(item.uid, item.name || item.userName || item.displayName))
                .map((item) => {
                const itemName = item.name || item.userName || item.displayName || 'Player';
                return (
                  <TouchableOpacity
                    key={item.uid}
                    style={styles.listItem}
                    onPress={() => {
                      setTargetActiveModalList(null);
                      setSelectedUserModalId(null);
                      if (timeoutRef.current) clearTimeout(timeoutRef.current);
                      timeoutRef.current = setTimeout(() => {
                        openUserProfileById(item.uid, itemName);
                      }, 50);
                    }}
                    activeOpacity={0.85}
                  >
                    <View style={styles.listAvatar}>
                      {item.avatar ? (
                        <Image source={{ uri: item.avatar }} style={{ width: 36, height: 36, borderRadius: 18 }} />
                      ) : (
                        <Text style={{color: '#EAB308', fontWeight: 'bold'}}>{itemName[0]}</Text>
                      )}
                    </View>
                    <View style={{flex: 1}}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Text style={styles.listName}>{itemName}</Text>
                        {item.isVip && <Ionicons name="checkmark-circle" size={14} color="#EAB308" />}
                      </View>
                      <Text style={styles.listCity}>📍 {normalizeCity(item.city)} |  Age: {item.age || 'N/A'}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={theme.textSubtle} />
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={!!selectedPostModal} animationType="slide" transparent={true} onRequestClose={() => setSelectedPostModal(null)}>
        <View style={styles.modalOverlayCenter}>
          <View style={styles.modalContentHomeStyle}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Post Details 📷</Text>
              <TouchableOpacity onPress={() => setSelectedPostModal(null)} activeOpacity={0.8} style={styles.closeHomeModalBtn}>
                <Ionicons name="close" size={22} color={theme.text} />
              </TouchableOpacity>
            </View>

            {selectedPostModal && (() => {
              const postOwner = allUsersList.find(u => {
                const uN = (u.name || u.userName || u.displayName || '').trim().toLowerCase();
                const pN = (selectedPostModal.userName || selectedPostModal.authorName || '').trim().toLowerCase();
                return u.uid === selectedPostModal.userId || uN === pN;
              });
              const ownerName = postOwner?.name || postOwner?.userName || postOwner?.displayName || selectedPostModal.userName || selectedPostModal.authorName || 'Player';
              const isVid = selectedPostModal.mediaType === 'video';

              return (
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }} nestedScrollEnabled={true}>
                  <View style={styles.postCard}>
                    <View style={styles.postHeader}>
                      <TouchableOpacity style={styles.postAvatarBox} onPress={() => { setSelectedPostModal(null); openUserProfileById(selectedPostModal.userId, ownerName); }} activeOpacity={0.85}>
                        {postOwner?.avatar || selectedPostModal.avatarUrl ? (
                          <Image source={{ uri: postOwner?.avatar || selectedPostModal.avatarUrl }} style={styles.avatarImg} />
                        ) : (
                          <View style={styles.avatarPlaceholder}>
                            <Text style={styles.avatarPlaceholderText}>{ownerName[0]?.toUpperCase() || 'P'}</Text>
                          </View>
                        )}
                      </TouchableOpacity>

                      <View style={styles.postUserInfo}>
                        <TouchableOpacity onPress={() => { setSelectedPostModal(null); openUserProfileById(selectedPostModal.userId, ownerName); }} activeOpacity={0.85}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <Text style={styles.postUserName}>{ownerName}</Text>
                            {postOwner?.isVip && <Ionicons name="checkmark-circle" size={14} color="#EAB308" />}
                          </View>
                        </TouchableOpacity>
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
                        {isVid ? (
                          <PostVideoPlayer key={`modal_radar_${selectedPostModal.id}`} uri={selectedPostModal.imageUrl} isStoryOpen={false} style={styles.postImageContent} />
                        ) : (
                          <Image source={{ uri: selectedPostModal.imageUrl }} style={styles.postImageContent} />
                        )}
                      </View>
                    ) : null}

                    <View style={styles.postActionsRow}>
                      <TouchableOpacity style={styles.actionBtn} onPress={() => toggleLike(selectedPostModal.id)} activeOpacity={0.7}>
                        <Ionicons
                          name={currentUserId && selectedPostModal.likesList?.includes(currentUserId) ? "heart" : "heart-outline"}
                          size={20}
                          color={currentUserId && selectedPostModal.likesList?.includes(currentUserId) ? "#EF4444" : theme.textMuted}
                        />
                        <Text style={[styles.actionText, currentUserId && selectedPostModal.likesList?.includes(currentUserId) && { color: '#EF4444', fontWeight: 'bold' }]}>
                          {selectedPostModal.likesList?.length || 0} Likes
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity style={styles.actionBtn} onPress={() => { setSelectedPostModal(null); setCommentsModalPost(selectedPostModal); }} activeOpacity={0.7}>
                        <Ionicons name="chatbubble-outline" size={18} color={theme.textMuted} />
                        <Text style={styles.actionText}>{selectedPostModal.comments?.length || 0} Comments</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </ScrollView>
              );
            })()}
          </View>
        </View>
      </Modal>

      <Modal visible={!!commentsModalPost} animationType="slide" transparent={true} onRequestClose={() => setCommentsModalPost(null)}>
        <View style={styles.modalOverlayCenter}>
          <View style={styles.commentsModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Comments 💬</Text>
              <TouchableOpacity onPress={() => setCommentsModalPost(null)} activeOpacity={0.8} style={styles.closeHomeModalBtn}>
                <Ionicons name="close" size={22} color={theme.text} />
              </TouchableOpacity>
            </View>

            {commentsModalPost && (
              <View style={{ flex: 1, width: '100%' }}>
                <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 15 }}>
                  {commentsModalPost.comments?.length === 0 ? (
                    <Text style={{ color: theme.textSubtle, textAlign: 'center', marginVertical: 30, fontSize: 13 }}>No comments yet. Be the first to comment!</Text>
                  ) : (
                    commentsModalPost.comments
                      ?.filter(c => !isBlockedBidirectional(c.userId, c.user))
                      .map(c => {
                      const commentTimeAgo = getTimeAgo(c.createdAt);
                      const commentUserObj = allUsersList.find(u => {
                        const uN = (u.name || u.userName || u.displayName || '').trim().toLowerCase();
                        return u.uid === c.userId || uN === (c.user || '').trim().toLowerCase();
                      });
                      const commentAuthorName = commentUserObj?.name || commentUserObj?.userName || commentUserObj?.displayName || c.user || 'User';
                      return (
                        <View key={c.id} style={styles.commentRow}>
                          <TouchableOpacity onPress={() => { setCommentsModalPost(null); openUserProfileById(c.userId, commentAuthorName); }} activeOpacity={0.85}>
                            {c.avatarUrl ? (
                              <Image source={{ uri: c.avatarUrl }} style={styles.commentAvatar} />
                            ) : (
                              <View style={styles.commentAvatarPlaceholder}>
                                <Text style={{ color: '#EAB308', fontSize: 10, fontWeight: 'bold' }}>{commentAuthorName[0]?.toUpperCase() || 'U'}</Text>
                              </View>
                            )}
                          </TouchableOpacity>
                          <View style={styles.commentBubbleBox}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                              <TouchableOpacity onPress={() => { setCommentsModalPost(null); openUserProfileById(c.userId, commentAuthorName); }} activeOpacity={0.85}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                  <Text style={styles.commentUser}>{commentAuthorName}</Text>
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
                    placeholderTextColor={theme.textSubtle}
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
              <TouchableOpacity onPress={() => { setTimePickerVisible(false); setCreateModalVisible(false); }}>
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} nestedScrollEnabled={true}>
              <Text style={styles.label}>Game Title *</Text>
              <TextInput style={styles.input} placeholder="e.g. Friday Match" placeholderTextColor={theme.textSubtle} value={newTitle} onChangeText={setNewTitle} />

              <Text style={styles.label}>Select Sport *</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
                {(userSports.length > 0 ? userSports : ALL_AVAILABLE_SPORTS).map(sport => (
                  <TouchableOpacity key={sport} style={[styles.sportChip, newSport === sport && styles.sportChipActive]} onPress={() => setNewSport(sport)}>
                    <Text style={[styles.sportChipText, newSport === sport && styles.sportChipTextActive]}>{sport}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={styles.label}>Game Access Mode *</Text>
              <View style={styles.accessModesContainer}>
                <TouchableOpacity
                  style={[styles.accessCard, newAccessMode === 'public' && styles.accessCardActive]}
                  onPress={() => setNewAccessMode('public')}
                  activeOpacity={0.85}
                >
                  <View style={[styles.accessIconBox, newAccessMode === 'public' && { backgroundColor: '#22C55E22', borderColor: '#22C55E' }]}>
                    <Ionicons name="globe-outline" size={20} color={newAccessMode === 'public' ? '#22C55E' : theme.textMuted} />
                  </View>
                  <Text style={[styles.accessCardTitle, newAccessMode === 'public' && { color: '#22C55E' }]}>Public</Text>
                  <Text style={styles.accessCardDesc}>Everyone can join freely</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.accessCard, newAccessMode === 'private' && styles.accessCardActive]}
                  onPress={() => setNewAccessMode('private')}
                  activeOpacity={0.85}
                >
                  <View style={[styles.accessIconBox, newAccessMode === 'private' && { backgroundColor: '#EAB30822', borderColor: '#EAB308' }]}>
                    <Ionicons name="lock-closed-outline" size={20} color={newAccessMode === 'private' ? '#EAB308' : theme.textMuted} />
                  </View>
                  <Text style={[styles.accessCardTitle, newAccessMode === 'private' && { color: '#EAB308' }]}>Private</Text>
                  <Text style={styles.accessCardDesc}>Requires admin approval</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.accessCard, newAccessMode === 'friends' && styles.accessCardActive]}
                  onPress={() => setNewAccessMode('friends')}
                  activeOpacity={0.85}
                >
                  <View style={[styles.accessIconBox, newAccessMode === 'friends' && { backgroundColor: '#3B82F622', borderColor: '#3B82F6' }]}>
                    <Ionicons name="key-outline" size={20} color={newAccessMode === 'friends' ? '#3B82F6' : theme.textMuted} />
                  </View>
                  <Text style={[styles.accessCardTitle, newAccessMode === 'friends' && { color: '#3B82F6' }]}>Friends</Text>
                  <Text style={styles.accessCardDesc}>Join via game code only</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.label}>Court / Location Name *</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
                <TextInput style={[styles.input, { flex: 1, marginBottom: 0 }]} placeholder="e.g. Central Court" placeholderTextColor={theme.textSubtle} value={newVenue} onChangeText={setNewVenue} />
                <TouchableOpacity style={styles.mapSearchBtn} onPress={() => { setTimePickerVisible(false); setCreateModalVisible(false); setIsPickingLocation(true); }}>
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
                  <TouchableOpacity
                    style={styles.timePickerTriggerBtn}
                    onPress={() => setTimePickerVisible(prev => !prev)}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="time-outline" size={16} color="#EAB308" />
                    <Text style={styles.timePickerTriggerText}>{newTime}</Text>
                    <Ionicons
                      name={timePickerVisible ? 'chevron-up' : 'chevron-down'}
                      size={14}
                      color={theme.textMuted}
                    />
                  </TouchableOpacity>
                </View>
              </View>

              {timePickerVisible && (
                <View style={styles.inlineTimePickerBox}>
                  <View style={styles.timeColumnsRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.timeColumnHeading}>Hour</Text>
                      <ScrollView
                        style={styles.timeColumnScroll}
                        nestedScrollEnabled={true}
                        showsVerticalScrollIndicator={false}
                      >
                        {HOURS_LIST.map(hr => {
                          const active = selectedHour === hr;
                          return (
                            <TouchableOpacity
                              key={hr}
                              style={[styles.timeOptionChip, active && styles.timeOptionChipActive]}
                              onPress={() => setSelectedHour(hr)}
                            >
                              <Text style={[styles.timeOptionLabel, active && styles.timeOptionLabelActive]}>
                                {hr}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text style={styles.timeColumnHeading}>Minute</Text>
                      <ScrollView
                        style={styles.timeColumnScroll}
                        nestedScrollEnabled={true}
                        showsVerticalScrollIndicator={false}
                      >
                        {MINUTES_LIST.map(min => {
                          const active = selectedMinute === min;
                          return (
                            <TouchableOpacity
                              key={min}
                              style={[styles.timeOptionChip, active && styles.timeOptionChipActive]}
                              onPress={() => setSelectedMinute(min)}
                            >
                              <Text style={[styles.timeOptionLabel, active && styles.timeOptionLabelActive]}>
                                {min}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={styles.doneTimeBtn}
                    onPress={() => setTimePickerVisible(false)}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.doneTimeBtnText}>Done ({newTime}) ✓</Text>
                  </TouchableOpacity>
                </View>
              )}

              <Text style={styles.label}>Max Players *</Text>
              <TextInput style={styles.input} placeholder="10" placeholderTextColor={theme.textSubtle} keyboardType="numeric" value={newMaxPlayers} onChangeText={setNewMaxPlayers} />

              <Text style={styles.label}>Description *</Text>
              <TextInput style={[styles.input, { height: 70, textAlignVertical: 'top' }]} placeholder="Details..." placeholderTextColor={theme.textSubtle} multiline value={newDesc} onChangeText={setNewDesc} />

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

const createStyles = (theme: ReturnType<typeof getRadarTheme>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 50, paddingBottom: 12, backgroundColor: theme.surface, borderBottomWidth: 1, borderBottomColor: theme.border },
  homeCategory: { color: '#EAB308', fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  discoverCategory: { color: '#EAB308', fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  appTitle: { color: theme.text, fontSize: 22, fontWeight: '900', fontStyle: 'italic' },
  createGameBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EAB308', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16 },
  createGameBtnText: { color: '#09090B', fontWeight: '800', fontSize: 12 },

  menuOverlay: { flex: 1, backgroundColor: theme.menuOverlay, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  actionMenuCard: { width: '100%', maxWidth: 360, backgroundColor: theme.surface, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: theme.border, gap: 10 },
  actionMenuTitle: { color: theme.text, fontSize: 16, fontWeight: '900', marginBottom: 4 },
  actionMenuOptionBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: theme.surfaceDeep, borderWidth: 1, borderColor: theme.border, padding: 12, borderRadius: 14 },
  actionMenuIconCircle: { width: 38, height: 38, borderRadius: 19, justifyContent: 'center', alignItems: 'center' },
  actionMenuOptionTitle: { color: theme.text, fontSize: 14, fontWeight: '800' },
  actionMenuOptionSub: { color: theme.textMuted, fontSize: 11, marginTop: 2 },

  mapWrapper: { width: Dimensions.get('window').width, height: Dimensions.get('window').height * 0.45, position: 'relative' },
  map: { width: '100%', height: '100%' },

  floatingMapControls: { position: 'absolute', right: 14, top: 14, gap: 8, zIndex: 20 },
  mapControlBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: theme.pillBg, borderWidth: 1, borderColor: theme.border, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.35, shadowRadius: 4, elevation: 5 },
  mapControlBtnActive: { backgroundColor: '#EAB308', borderColor: '#EAB308' },
  mapControlBtnText: { color: theme.text, fontSize: 11, fontWeight: '900' },

  myLocationMarker: { alignItems: 'center' },
  myLocationPulseRing: { width: 46, height: 46, borderRadius: 23, backgroundColor: 'rgba(234, 179, 8, 0.22)', justifyContent: 'center', alignItems: 'center' },
  myLocationAvatarBox: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.surfaceAlt, borderWidth: 2, borderColor: '#EAB308', justifyContent: 'center', alignItems: 'center', overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.8, shadowRadius: 2, elevation: 5 },
  myLocationAvatarText: { color: '#EAB308', fontWeight: 'bold', fontSize: 14 },
  myLocationNameText: { color: theme.text, fontSize: 10, fontWeight: 'bold' },

  friendMarkerContainer: { alignItems: 'center' },
  friendAvatarBox: { width: 38, height: 38, borderRadius: 19, backgroundColor: theme.surfaceAlt, borderWidth: 2, borderColor: '#3B82F6', justifyContent: 'center', alignItems: 'center', overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.8, shadowRadius: 2, elevation: 5 },
  friendAvatarText: { color: '#3B82F6', fontWeight: 'bold', fontSize: 14 },
  friendMarkerName: { color: theme.text, fontSize: 10, fontWeight: 'bold' },
  markerNamePill: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.pillBg, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginTop: 2, gap: 2 },

  customMarkerContainer: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, borderWidth: 1.5, paddingHorizontal: 6, paddingVertical: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.8, shadowRadius: 2, elevation: 5 },
  markerIconBox: { width: 22, height: 22, borderRadius: 11, justifyContent: 'center', alignItems: 'center', marginRight: 5 },
  markerTextBox: { maxWidth: 100 },
  markerTitleText: { color: theme.text, fontSize: 10, fontWeight: 'bold' },
  markerPlayersText: { fontSize: 9, fontWeight: 'bold' },
  markerPointerTriangle: { width: 0, height: 0, borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 7, borderLeftColor: 'transparent', borderRightColor: 'transparent', marginTop: -1 },

  pickingBanner: { position: 'absolute', top: 110, alignSelf: 'center', backgroundColor: '#EAB308', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, flexDirection: 'row', alignItems: 'center', zIndex: 50 },
  pickingBannerText: { color: '#09090B', fontWeight: 'bold', fontSize: 12 },

  bottomSheet: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '52%', backgroundColor: theme.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 10, borderWidth: 1, borderColor: theme.border },
  dragHandle: { width: 40, height: 4, backgroundColor: theme.textSubtle, borderRadius: 2, alignSelf: 'center', marginBottom: 8 },
  sheetTitle: { color: theme.text, fontSize: 17, fontWeight: '900' },
  sheetSubtitle: { color: theme.textMuted, fontSize: 11 },

  searchAndFilterRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, marginBottom: 8 },
  searchBarContainer: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: theme.surfaceDeep, borderWidth: 1, borderColor: theme.border, borderRadius: 12, paddingHorizontal: 10, height: 40 },
  searchInput: { flex: 1, color: theme.text, fontSize: 12, height: '100%' },

  filterButton: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.surfaceDeep, borderWidth: 1, borderColor: theme.border, paddingHorizontal: 12, height: 40, borderRadius: 12 },
  filterButtonText: { color: '#EAB308', fontSize: 12, fontWeight: 'bold' },

  filterOptionItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: theme.surfaceDeep, borderWidth: 1, borderColor: theme.border, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, marginBottom: 8 },
  filterOptionItemActive: { backgroundColor: theme.surfaceAlt, borderColor: '#EAB308' },
  filterOptionText: { color: theme.textSecondary, fontSize: 13, fontWeight: '600' },
  filterOptionTextActive: { color: '#EAB308', fontWeight: 'bold' },

  filterIconCircle: { width: 26, height: 26, borderRadius: 13, justifyContent: 'center', alignItems: 'center' },

  emptyBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 30 },
  emptyNoticeText: { color: theme.textSubtle, textAlign: 'center', marginTop: 10 },

  gameCard: { borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1 },
  gameHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  sportTag: { fontSize: 12, fontWeight: 'bold' },
  distanceTag: { color: theme.textMuted, fontSize: 12 },
  gameTitle: { color: theme.text, fontSize: 15, fontWeight: 'bold', marginBottom: 2 },
  venueText: { color: theme.textSecondary, fontSize: 12, marginBottom: 6 },

  gameTimerRow: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: theme.surfaceAlt, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, marginBottom: 8 },
  timerText: { color: theme.textMuted, fontSize: 10, fontWeight: '600' },
  timerExpiryText: { color: '#EAB308', fontSize: 10, fontWeight: 'bold' },

  modalTimerBox: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: theme.surfaceAlt, padding: 8, borderRadius: 8, marginBottom: 10, borderWidth: 1, borderColor: theme.border },
  modalTimerText: { color: theme.textMuted, fontSize: 11, fontWeight: '600' },
  modalTimerExpiryText: { color: '#EAB308', fontSize: 11, fontWeight: 'bold' },

  gameFooterRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 8 },
  spotsTag: { color: '#22C55E', fontSize: 11, fontWeight: 'bold' },
  detailsLink: { fontSize: 12, fontWeight: 'bold' },

  modalOverlay: { flex: 1, backgroundColor: theme.overlay, justifyContent: 'flex-end' },
  modalContent: { backgroundColor: theme.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, height: '82%', borderWidth: 1, borderColor: theme.border },
  modalContentLarge: { backgroundColor: theme.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, height: '90%', borderWidth: 1, borderColor: theme.border },

  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, width: '100%' },
  modalTitle: { color: theme.text, fontSize: 18, fontWeight: 'bold' },

  label: { color: theme.textMuted, fontSize: 12, fontWeight: 'bold', marginBottom: 6, alignSelf: 'flex-start' },
  input: { backgroundColor: theme.surfaceDeep, borderWidth: 1, borderColor: theme.border, borderRadius: 10, paddingHorizontal: 12, height: 44, color: theme.text, marginBottom: 14, width: '100%' },

  timePickerTriggerBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: theme.surfaceDeep, borderWidth: 1, borderColor: theme.border, borderRadius: 10, paddingHorizontal: 12, height: 44, marginBottom: 14 },
  timePickerTriggerText: { color: theme.text, fontSize: 14, fontWeight: '800' },
  inlineTimePickerBox: { backgroundColor: theme.surfaceDeep, borderWidth: 1, borderColor: '#EAB30866', borderRadius: 14, padding: 12, marginBottom: 14 },
  timeColumnsRow: { flexDirection: 'row', gap: 12 },
  timeColumnHeading: { color: theme.textMuted, fontSize: 12, fontWeight: '800', textAlign: 'center', marginBottom: 8 },
  timeColumnScroll: { maxHeight: 165, backgroundColor: theme.surface, borderRadius: 12, borderWidth: 1, borderColor: theme.border, padding: 6 },
  timeOptionChip: { paddingVertical: 8, borderRadius: 8, alignItems: 'center', marginBottom: 4 },
  timeOptionChipActive: { backgroundColor: '#EAB308' },
  timeOptionLabel: { color: theme.textSecondary, fontSize: 14, fontWeight: '700' },
  timeOptionLabelActive: { color: '#09090B', fontWeight: '900' },
  doneTimeBtn: { backgroundColor: '#EAB308', borderRadius: 10, height: 36, justifyContent: 'center', alignItems: 'center', marginTop: 10 },
  doneTimeBtnText: { color: '#09090B', fontWeight: '900', fontSize: 13 },

  mapSearchBtn: { backgroundColor: '#EAB308', borderRadius: 10, height: 44, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 6 },
  mapSearchBtnText: { color: '#09090B', fontWeight: 'bold', fontSize: 12 },

  sportChip: { backgroundColor: theme.surfaceDeep, borderWidth: 1, borderColor: theme.border, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, marginRight: 8 },
  sportChipActive: { backgroundColor: theme.surfaceAlt, borderColor: '#EAB308' },
  sportChipText: { color: theme.textMuted, fontSize: 12, fontWeight: 'bold' },
  sportChipTextActive: { color: '#EAB308' },

  accessModesContainer: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  accessCard: { flex: 1, backgroundColor: theme.surfaceDeep, borderWidth: 1.5, borderColor: theme.border, borderRadius: 14, padding: 12, alignItems: 'center' },
  accessCardActive: { backgroundColor: theme.surfaceAlt, borderColor: '#EAB308' },
  accessIconBox: { width: 34, height: 34, borderRadius: 17, backgroundColor: theme.surfaceAlt, borderWidth: 1, borderColor: theme.border, justifyContent: 'center', alignItems: 'center', marginBottom: 6 },
  accessCardTitle: { color: theme.text, fontSize: 12, fontWeight: 'bold', marginBottom: 2 },
  accessCardDesc: { color: theme.textSubtle, fontSize: 9, textAlign: 'center', lineHeight: 12 },

  publishBtn: { backgroundColor: '#EAB308', borderRadius: 12, height: 46, justifyContent: 'center', alignItems: 'center', marginTop: 10, marginBottom: 10, width: '100%' },
  publishBtnText: { color: '#09090B', fontWeight: '900', fontSize: 15 },

  detailSportBadge: { alignSelf: 'flex-start', fontSize: 11, fontWeight: '900', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, overflow: 'hidden' },
  deleteGameBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.isLight ? '#FEE2E2' : '#1F1214', borderWidth: 1, borderColor: '#EF4444', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  detailTitle: { color: theme.text, fontSize: 20, fontWeight: 'bold', marginTop: 10, marginBottom: 4 },
  adminInfoText: { color: theme.textMuted, fontSize: 12 },

  navigateBtn: { borderRadius: 10, height: 38, justifyContent: 'center', alignItems: 'center', marginBottom: 10, flexDirection: 'row' },
  navigateBtnText: { color: '#09090B', fontWeight: 'bold', fontSize: 13 },

  detailVenue: { color: theme.textSecondary, fontSize: 13, marginBottom: 14 },
  detailBox: { backgroundColor: theme.surfaceDeep, borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: theme.border },
  detailLabel: { color: theme.textMuted, fontSize: 12, fontWeight: 'bold', marginBottom: 6 },
  detailText: { color: theme.text, fontSize: 13 },
  pendingRequestCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: theme.surface, padding: 8, borderRadius: 8, marginTop: 6 },

  studioLaunchBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, borderWidth: 1.5, marginBottom: 12 },
  studioLaunchIconWrap: { width: 38, height: 38, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  studioLaunchTitle: { fontSize: 14, fontWeight: '900' },
  studioLaunchSub: { color: theme.textMuted, fontSize: 11, marginTop: 2 },

  studioModalSheet: { backgroundColor: theme.surfaceDeep, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 16, height: '92%', borderWidth: 1, borderColor: theme.border },
  studioHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: theme.surface, padding: 14, borderRadius: 18, borderWidth: 1, borderColor: theme.border, marginBottom: 10 },
  studioEyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 0.6 },
  studioMainTitle: { color: theme.text, fontSize: 18, fontWeight: '900', marginTop: 2 },
  studioCloseBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: theme.surfaceAlt, borderWidth: 1, borderColor: theme.border, justifyContent: 'center', alignItems: 'center' },

  modeSelectorBar: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  modeChipBtn: { flex: 1, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, paddingVertical: 8, borderRadius: 10, alignItems: 'center' },
  modeChipText: { color: theme.textMuted, fontSize: 11, fontWeight: '800' },
  modeChipTextActive: { color: '#09090B', fontWeight: '900' },

  twoColumnsWrapper: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  studioColumnCard: { flex: 1, backgroundColor: theme.surface, borderRadius: 18, padding: 10, borderWidth: 1.5 },
  columnTopHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: theme.border },
  columnBadgeIcon: { width: 32, height: 32, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  columnTitle: { color: theme.text, fontSize: 13, fontWeight: '900' },
  columnSubtitle: { color: theme.textMuted, fontSize: 10, fontWeight: '700', marginTop: 1 },

  columnActionPanel: { backgroundColor: theme.surfaceDeep, borderRadius: 12, padding: 8, borderWidth: 1, borderColor: theme.border, marginBottom: 10, gap: 8 },
  teamSizeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  teamSizeLabel: { color: theme.textMuted, fontSize: 11, fontWeight: '700' },
  compactSizeInput: { backgroundColor: theme.surface, borderWidth: 1, borderRadius: 8, width: 42, height: 30, color: theme.text, textAlign: 'center', fontSize: 12, fontWeight: '900' },
  columnPrimaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 36, borderRadius: 10, paddingHorizontal: 8 },
  columnPrimaryBtnText: { color: '#09090B', fontSize: 11, fontWeight: '900' },

  columnEmptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 28, backgroundColor: theme.surfaceDeep, borderRadius: 12, borderWidth: 1, borderColor: theme.borderSubtle },
  columnEmptyText: { color: theme.textSubtle, fontSize: 11, marginTop: 6, textAlign: 'center' },

  studioTeamBox: { backgroundColor: theme.surfaceDeep, borderRadius: 12, padding: 8, borderWidth: 1, borderColor: theme.border, borderTopWidth: 3 },
  studioTeamHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  studioTeamName: { fontSize: 11, fontWeight: '900', letterSpacing: 0.4 },
  studioTeamCount: { color: theme.textMuted, fontSize: 10, fontWeight: '800', backgroundColor: theme.surfaceAlt, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 5 },
  studioPlayerPill: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 },
  studioPlayerPillText: { color: theme.textSecondary, fontSize: 11, fontWeight: '700', flex: 1 },

  studioMatchBox: { backgroundColor: theme.surfaceDeep, borderRadius: 12, padding: 8, borderWidth: 1, borderColor: theme.border },
  studioMatchTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  studioMatchNum: { color: '#EAB308', fontSize: 10, fontWeight: '900', backgroundColor: theme.isLight ? '#FEF9C3' : '#332E0F', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
  studioMatchRound: { color: theme.textMuted, fontSize: 9, fontWeight: '700', maxWidth: '72%' },
  studioSidePill: { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, borderRadius: 8, padding: 7, alignItems: 'center' },
  studioSideText: { color: theme.text, fontSize: 12, fontWeight: '900', textAlign: 'center' },
  studioVsDivider: { flexDirection: 'row', alignItems: 'center', gap: 6, marginVertical: 5 },
  studioLine: { flex: 1, height: 1, backgroundColor: theme.border },
  studioVsLabel: { color: '#EF4444', fontSize: 9, fontWeight: '900' },

  winnerPickRow: { flexDirection: 'row', gap: 4, marginTop: 6 },
  winnerPickBtn: { flex: 1, backgroundColor: theme.surfaceAlt, borderWidth: 1, borderColor: '#22C55E66', borderRadius: 6, paddingVertical: 4, paddingHorizontal: 4, alignItems: 'center' },
  winnerPickBtnText: { color: '#22C55E', fontSize: 9, fontWeight: '800' },

  playersGridContainerSmall: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  playerChipSmallGrid: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, borderWidth: 1.5, alignSelf: 'flex-start' },
  playerChipTextSmallGrid: { fontSize: 12, fontWeight: 'bold' },

  listItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.surfaceDeep, padding: 12, borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: theme.border },
  listAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.surfaceAlt, justifyContent: 'center', alignItems: 'center', marginRight: 12, borderWidth: 1, borderColor: '#EAB308', overflow: 'hidden' },
  listName: { color: theme.text, fontSize: 14, fontWeight: 'bold' },
  listCity: { color: theme.textMuted, fontSize: 11, marginTop: 2 },

  chatScrollContainer: { maxHeight: 150, backgroundColor: theme.surfaceDeep, borderRadius: 10, borderWidth: 1, borderColor: theme.border, paddingHorizontal: 8, marginBottom: 8 },
  noChatText: { color: theme.textSubtle, fontSize: 12, fontStyle: 'italic', textAlign: 'center', paddingVertical: 15 },
  chatBubble: { backgroundColor: theme.surfaceAlt, padding: 8, borderRadius: 10, marginBottom: 6, borderWidth: 1, borderColor: theme.border },
  chatSender: { fontSize: 11, fontWeight: 'bold' },
  chatText: { color: theme.text, fontSize: 13, marginTop: 2 },
  chatTime: { color: theme.textMuted, fontSize: 9, alignSelf: 'flex-end', marginTop: 2 },
  chatInputRowGame: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  chatInput: { flex: 1, backgroundColor: theme.surfaceDeep, borderWidth: 1, borderColor: theme.border, borderRadius: 8, height: 36, color: theme.text, paddingHorizontal: 10, fontSize: 12 },
  chatSendBtn: { backgroundColor: '#EAB308', width: 38, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },

  modalJoinBtn: { borderRadius: 12, height: 46, justifyContent: 'center', alignItems: 'center', marginTop: 10, marginBottom: 20 },
  modalJoinBtnText: { color: '#09090B', fontWeight: '900', fontSize: 15 },
  leaveBtn: { backgroundColor: theme.isLight ? '#FEE2E2' : '#1F1214', borderWidth: 1, borderColor: '#EF4444', borderRadius: 12, height: 46, justifyContent: 'center', alignItems: 'center', marginTop: 10, marginBottom: 20 },
  leaveBtnText: { color: '#EF4444', fontWeight: '900', fontSize: 15 },

  zoomedAvatarOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center' },
  closeZoomedBtn: { position: 'absolute', top: 50, right: 20, zIndex: 30, backgroundColor: '#121215', width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#27272A' },
  zoomedAvatarImage: { width: width * 0.9, height: width * 0.9, resizeMode: 'contain', borderRadius: 20 },

  modalOverlayCenter: { flex: 1, backgroundColor: theme.overlay, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 },
  modalContentHomeStyle: { backgroundColor: theme.surfaceDeep, borderRadius: 28, padding: 20, borderWidth: 1, borderColor: theme.border, width: '100%', maxWidth: 420, height: '88%', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.5, shadowRadius: 16, elevation: 12 },
  modalContentCenter: { backgroundColor: theme.surface, borderRadius: 28, padding: 20, borderWidth: 1, borderColor: theme.border, width: '100%', maxWidth: 400, maxHeight: '85%', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 16, elevation: 10 },
  closeHomeModalBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, justifyContent: 'center', alignItems: 'center' },

  headerProfile: { alignItems: 'center', marginBottom: 16, paddingHorizontal: 20 },
  avatarLarge: { width: 84, height: 84, borderRadius: 42, backgroundColor: theme.surfaceAlt, borderWidth: 2, borderColor: '#EAB308', justifyContent: 'center', alignItems: 'center', marginBottom: 10, overflow: 'hidden' },
  avatarImage: { width: '100%', height: '100%' },
  avatarLargeText: { color: '#EAB308', fontSize: 32, fontWeight: 'bold' },
  profileName: { color: theme.text, fontSize: 20, fontWeight: '900' },
  sportsTagsRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, marginVertical: 8 },
  sportTagBadge: { backgroundColor: theme.surfaceAlt, borderWidth: 1, borderColor: '#EAB308', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  sportTagText: { color: '#EAB308', fontSize: 11, fontWeight: '700' },
  profileCity: { color: theme.textMuted, fontSize: 13, marginTop: 4 },

  statsRow: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: theme.surfaceAlt, borderRadius: 16, borderWidth: 1, borderColor: theme.border, padding: 14, marginBottom: 16 },
  statBox: { alignItems: 'center' },
  statNumber: { color: '#EAB308', fontSize: 18, fontWeight: '900' },
  statLabel: { color: theme.textMuted, fontSize: 12, marginTop: 2, fontWeight: '600' },

  profileFollowBtn: { backgroundColor: '#EAB308', borderRadius: 12, height: 44, justifyContent: 'center', alignItems: 'center' },
  profileFollowBtnText: { color: '#09090B', fontWeight: '900', fontSize: 13 },
  profileFollowingBtn: { backgroundColor: theme.surfaceAlt, borderWidth: 1, borderColor: '#EAB308' },
  profileFollowingBtnText: { color: '#EAB308' },

  blockProfileBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', alignSelf: 'center', gap: 4, backgroundColor: theme.surfaceAlt, borderWidth: 1, borderColor: '#EF4444', borderRadius: 8, height: 26, paddingHorizontal: 10 },
  blockProfileBtnText: { color: '#EF4444', fontWeight: '700', fontSize: 10 },
  unblockProfileBtn: { backgroundColor: theme.surfaceAlt, borderColor: theme.textSubtle },
  unblockProfileBtnText: { color: theme.text },

  postsSectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 6, borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 14 },
  sectionTitle: { color: theme.text, fontSize: 15, fontWeight: '700' },
  postsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 2 },
  postThumbnailBox: { width: (width * 0.85) / 3 - 4, height: (width * 0.85) / 3 - 4, backgroundColor: theme.surface, borderRadius: 8, overflow: 'hidden' },
  postThumbnailImage: { width: '100%', height: '100%' },
  videoBadgeOverlay: { position: 'absolute', top: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 10, width: 22, height: 22, justifyContent: 'center', alignItems: 'center' },
  emptyPostsBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 30, backgroundColor: theme.surfaceAlt, borderRadius: 14, borderWidth: 1, borderColor: theme.border },
  emptyPostsText: { color: theme.textSubtle, fontSize: 12, marginTop: 6 },

  privateAccountBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40, paddingHorizontal: 20, backgroundColor: theme.surfaceAlt, borderRadius: 16, borderWidth: 1, borderColor: theme.border, marginTop: 10 },
  privateAccountTitle: { color: theme.text, fontSize: 16, fontWeight: 'bold', marginBottom: 6 },
  privateAccountText: { color: theme.textMuted, fontSize: 12, textAlign: 'center', lineHeight: 18 },

  postCard: { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, borderRadius: 20, padding: 16, marginBottom: 16 },
  postHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  postAvatarBox: { width: 42, height: 42, borderRadius: 21, backgroundColor: theme.surfaceAlt, borderWidth: 1, borderColor: '#EAB308', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  avatarImg: { width: '100%', height: '100%' },
  avatarPlaceholder: { width: 42, height: 42, borderRadius: 21, backgroundColor: theme.surfaceAlt, borderWidth: 1, borderColor: '#EAB308', justifyContent: 'center', alignItems: 'center' },
  avatarPlaceholderText: { color: '#EAB308', fontSize: 16, fontWeight: 'bold' },
  postUserInfo: { marginLeft: 10, flex: 1 },
  postUserName: { color: theme.text, fontSize: 14, fontWeight: '700' },
  sportBadge: { backgroundColor: theme.surfaceAlt, borderWidth: 1, borderColor: theme.border, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8, marginRight: 8 },
  sportBadgeText: { color: '#EAB308', fontSize: 10, fontWeight: '700' },
  postTime: { color: theme.textSubtle, fontSize: 11 },
  postText: { color: theme.textSecondary, fontSize: 14, marginBottom: 12, lineHeight: 20 },
  postImageBox: { height: 320, backgroundColor: theme.surfaceDeep, borderRadius: 14, overflow: 'hidden', marginBottom: 12, borderWidth: 1, borderColor: theme.border, position: 'relative' },
  postImageContent: { width: '100%', height: '100%' },
  postActionsRow: { flexDirection: 'row', gap: 20, borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 12 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionText: { color: theme.textMuted, fontSize: 13, fontWeight: '600' },

  commentsModalContent: { backgroundColor: theme.surface, borderRadius: 28, padding: 20, borderWidth: 1, borderColor: theme.border, width: '100%', maxWidth: 400, height: '75%', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 16, elevation: 10 },
  commentRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  commentAvatar: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: '#EAB308', overflow: 'hidden' },
  commentAvatarPlaceholder: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: '#EAB308', backgroundColor: theme.surfaceAlt, justifyContent: 'center', alignItems: 'center' },
  commentBubbleBox: { flex: 1, marginLeft: 10, backgroundColor: theme.surfaceAlt, padding: 10, borderRadius: 12 },
  commentUser: { color: '#EAB308', fontSize: 12, fontWeight: '700' },
  commentText: { color: theme.textSecondary, fontSize: 13 },
  commentTimeText: { color: theme.textSubtle, fontSize: 10 },
  commentInputRow: { flexDirection: 'row', gap: 8, alignItems: 'center', borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 12, marginTop: 4 },
  commentInput: { flex: 1, backgroundColor: theme.surfaceDeep, borderWidth: 1, borderColor: theme.border, borderRadius: 12, height: 42, color: theme.text, paddingHorizontal: 12, fontSize: 13 },
  commentSendBtn: { backgroundColor: '#EAB308', width: 38, height: 42, borderRadius: 12, justifyContent: 'center', alignItems: 'center' }
});