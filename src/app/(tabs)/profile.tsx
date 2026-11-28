import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Modal, Alert, TextInput, Image, Dimensions, TouchableWithoutFeedback, Platform, Switch, Linking, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { doc, collection, onSnapshot, updateDoc, setDoc, getDoc, arrayUnion, arrayRemove, query, where, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { uploadAsync, FileSystemUploadType } from 'expo-file-system/legacy';
import * as Location from 'expo-location';
import Purchases from 'react-native-purchases';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { useVideoPlayer, VideoView } from 'expo-video';
import { registerForPushNotificationsAsync } from '../../services/notificationService';

const CLOUDINARY_CLOUD_NAME = 'jusifi9d';
const CLOUDINARY_UPLOAD_PRESET = 'world_sports_unsigned';

const uploadAvatarToCloudinary = async (localUri: string): Promise<string> => {
  if (!localUri) return '';
  if (localUri.startsWith('https://')) {
    return localUri;
  }

  const uploadUrl = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;
  const response = await uploadAsync(uploadUrl, localUri, {
    httpMethod: 'POST',
    uploadType: FileSystemUploadType.MULTIPART,
    fieldName: 'file',
    parameters: {
      upload_preset: CLOUDINARY_UPLOAD_PRESET,
      folder: 'world_sports/avatars',
    },
  });

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Cloudinary upload failed (${response.status}): ${response.body}`);
  }

  const parsed = response.body ? JSON.parse(response.body) : {};
  if (!parsed.secure_url) {
    throw new Error('Missing secure_url in Cloudinary response');
  }

  return parsed.secure_url;
};

type ThemeMode = 'dark' | 'light';

type ThemePalette = {
  bgPrimary: string;
  bgSurface: string;
  bgElevated: string;
  border: string;
  borderSubtle: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  accentTextOnButton: string;
  danger: string;
  dangerBg: string;
  switchTrackOff: string;
  switchThumbOff: string;
  modalOverlay: string;
};

const DARK_THEME: ThemePalette = {
  bgPrimary: '#09090B',
  bgSurface: '#121215',
  bgElevated: '#18181B',
  border: '#27272A',
  borderSubtle: '#18181B',
  textPrimary: '#FAFAFA',
  textSecondary: '#D4D4D8',
  textMuted: '#A1A1AA',
  accent: '#EAB308',
  accentTextOnButton: '#09090B',
  danger: '#EF4444',
  dangerBg: '#271215',
  switchTrackOff: '#27272A',
  switchThumbOff: '#71717A',
  modalOverlay: 'rgba(9,9,11,0.85)',
};

const LIGHT_THEME: ThemePalette = {
  bgPrimary: '#F8FAFC',
  bgSurface: '#FFFFFF',
  bgElevated: '#F1F5F9',
  border: '#E2E8F0',
  borderSubtle: '#E2E8F0',
  textPrimary: '#0F172A',
  textSecondary: '#334155',
  textMuted: '#64748B',
  accent: '#EAB308',
  accentTextOnButton: '#09090B',
  danger: '#DC2626',
  dangerBg: '#FEF2F2',
  switchTrackOff: '#CBD5E1',
  switchThumbOff: '#FFFFFF',
  modalOverlay: 'rgba(15,23,42,0.55)',
};

type UserProfile = {
  uid: string;
  name: string;
  city: string;
  country?: string;
  age?: number;
  birthDate?: string;
  email: string;
  avatar?: string;
  sports?: string[];
  sport?: string;
  followers?: string[];
  following?: string[];
  pendingRequests?: string[];
  blockedUsers?: string[];
  expoPushToken?: string;
  pushToken?: string;
  isVip?: boolean;
  isPromoted?: boolean;
  promotedUntil?: any;
  isPrivate?: boolean;
  themeMode?: ThemeMode;
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
  imageUrl: string;
  caption?: string;
  text?: string;
  avatarUrl?: string;
  authorMeta?: string;
  mediaType?: 'image' | 'video';
  likes?: number;
  likesList?: string[];
  isLiked?: boolean;
  comments?: Comment[];
  createdAt?: any;
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

function PostVideoPlayer({ uri, isStoryOpen }: { uri: string; isStoryOpen: boolean }) {
  const player = useVideoPlayer(uri, player => {
    player.loop = true;
    player.staysActiveInBackground = false;
    player.muted = false;
    if (!isStoryOpen) {
      player.play();
    }
  });

  useEffect(() => {
    if (isStoryOpen) {
      try {
        player.pause();
      } catch (e) {}
    }
  }, [isStoryOpen, player]);

  useEffect(() => {
    return () => {
      try {
        player.pause();
      } catch (e) {}
    };
  }, [player]);

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
      player.pause();
      player.muted = true;
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

const { width } = Dimensions.get('window');
const imageSize = (width * 0.85) / 3 - 4;

export default function ProfileScreen() {
  const { firebaseUser, logout, deleteAccount } = useAuth();
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [userPosts, setUserPosts] = useState<PostItem[]>([]);
  const [themeMode, setThemeMode] = useState<ThemeMode>('dark');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  
  const [privateAccount, setPrivateAccount] = useState(false);
  const [notificationsChat, setNotificationsChat] = useState(true);
  const [notificationsLikes, setNotificationsLikes] = useState(true);
  const [notificationsFollows, setNotificationsFollows] = useState(true);
  const [notificationsMatchActivity, setNotificationsMatchActivity] = useState(true);
  const [notificationsAdminActions, setNotificationsAdminActions] = useState(true);
  const [notificationsStoriesPosts, setNotificationsStoriesPosts] = useState(true);

  const palette = themeMode === 'light' ? LIGHT_THEME : DARK_THEME;
  const themedStyles = useMemo(() => createThemedStyles(palette), [palette]);

  useEffect(() => {
    (async () => {
      try {
        const savedTheme = await AsyncStorage.getItem('@world_sports_theme_mode');
        if (savedTheme === 'light' || savedTheme === 'dark') {
          setThemeMode(savedTheme);
        }
      } catch (e) {
        console.error('Error reading saved theme mode:', e);
      }
    })();
  }, []);

  const handleSelectThemeMode = async (mode: ThemeMode) => {
    setThemeMode(mode);
    try {
      await AsyncStorage.setItem('@world_sports_theme_mode', mode);
      if (currentUser?.uid) {
        await updateDoc(doc(db, 'users', currentUser.uid), { themeMode: mode });
      }
    } catch (e) {
      console.error('Error saving theme mode:', e);
    }
  };
  
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      setTick(t => t + 1);
    }, 60000);
    return () => clearInterval(timer);
  }, []);
  
  const [activeModalList, setActiveModalList] = useState<'followers' | 'following' | null>(null);
  const [targetActiveModalList, setTargetActiveModalList] = useState<'followers' | 'following' | null>(null);
  const [blockedUsersModalVisible, setBlockedUsersModalVisible] = useState(false);

  const [selectedUserModalId, setSelectedUserModalId] = useState<string | null>(null);
  const [targetProfileUser, setTargetProfileUser] = useState<UserProfile | null>(null);
  const [targetUserPosts, setTargetUserPosts] = useState<PostItem[]>([]);

  const [vipModalVisible, setVipModalVisible] = useState(false);
  const [settingsModalVisible, setSettingsModalVisible] = useState(false);

  const [selectedPostModal, setSelectedPostModal] = useState<PostItem | null>(null);
  const [commentsModalPost, setCommentsModalPost] = useState<PostItem | null>(null);
  const [modalCommentInput, setModalCommentInput] = useState('');

  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [editName, setEditName] = useState('');
  const [editAvatar, setEditAvatar] = useState('');
  const [zoomedAvatarUri, setZoomedAvatarUri] = useState<string | null>(null);

  const lastTapRef = useRef<{ [postId: string]: number }>({});

  const currentUserId = currentUser?.uid || '';
  const blockedUsersList = Array.isArray(currentUser?.blockedUsers) ? currentUser.blockedUsers : [];

  const isBlockedBidirectional = useCallback((otherUserId?: string, otherUserName?: string): boolean => {
    const cleanName = (otherUserName || '').trim().toLowerCase();
    const resolvedOther = allUsers.find(
      u => (otherUserId && u.uid === otherUserId) || (cleanName && (u.name || '').trim().toLowerCase() === cleanName)
    );
    const resolvedUid = resolvedOther?.uid || otherUserId;
    if (!resolvedUid || resolvedUid === currentUserId) return false;

    const iBlockedThem = blockedUsersList.includes(resolvedUid);
    const theyBlockedMe = Array.isArray(resolvedOther?.blockedUsers) && currentUserId
      ? resolvedOther.blockedUsers.includes(currentUserId)
      : false;

    return iBlockedThem || theyBlockedMe;
  }, [allUsers, blockedUsersList, currentUserId]);

  const sendPushNotificationToUser = useCallback(async (
    targetUid: string,
    subTitle: string,
    body: string,
    extraData: Record<string, any> = {}
  ) => {
    if (!targetUid || targetUid === currentUserId) return;

    try {
      const targetUser = allUsers.find(u => u.uid === targetUid);
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
  }, [allUsers, currentUserId]);

  const createInAppNotification = useCallback(async (
    targetUid: string,
    type: 'new_follower' | 'follow_request' | 'post_like' | 'post_comment',
    message: string,
    subTitle: string,
    extraData: Record<string, any> = {}
  ) => {
    if (!targetUid || targetUid === currentUserId) return;

    await addDoc(collection(db, 'users', targetUid, 'notifications'), {
      senderUid: currentUserId,
      type,
      message,
      ...extraData,
      createdAt: serverTimestamp(),
      status: type === 'follow_request' ? 'pending' : 'unread',
    });

    await sendPushNotificationToUser(targetUid, subTitle, message, {
      type,
      senderUid: currentUserId,
      ...extraData,
    });
  }, [currentUserId, sendPushNotificationToUser]);

  const handleDoubleTap = (postId: string) => {
    const now = Date.now();
    const DOUBLE_TAP_DELAY = 300;
    const lastTap = lastTapRef.current[postId] || 0;

    if (now - lastTap < DOUBLE_TAP_DELAY) {
      toggleLikePost(postId);
    }
    lastTapRef.current[postId] = now;
  };

  const fetchAndSaveAutomaticLocation = async (userId: string) => {
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      let location = await Location.getCurrentPositionAsync({});
      let address = await Location.reverseGeocodeAsync({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });

      if (address && address.length > 0) {
        let currentCity = address[0].city || address[0].subregion || 'Netanya';
        let currentCountry = address[0].country || 'Israel';

        if (currentCity === 'נתניה') currentCity = 'Netanya';
        if (currentCity === 'תל אביב-יפו' || currentCity === 'תל אביב') currentCity = 'Tel Aviv';
        if (currentCity === 'חיפה') currentCity = 'Haifa';
        if (currentCity === 'ירושלים') currentCity = 'Jerusalem';
        if (currentCity === 'באר שבע') currentCity = 'Beer Sheva';
        if (currentCity === 'ראשון לציון') currentCity = 'Rishon LeZion';
        
        if (currentCountry === 'ישראל') currentCountry = 'Israel';

        const userRef = doc(db, 'users', userId);
        await updateDoc(userRef, {
          city: currentCity,
          country: currentCountry,
        });
      }
    } catch (error) {
      console.error('Error auto fetching location:', error);
    }
  };

  useEffect(() => {
    if (!firebaseUser) return;

    const loadUserData = async () => {
      try {
        const userId = firebaseUser.email ? firebaseUser.email.toLowerCase().replace(/[^a-z0-9]/g, '_') : firebaseUser.uid;
        registerForPushNotificationsAsync(userId);
        const userRef = doc(db, 'users', userId);
        
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) {
          await setDoc(userRef, {
            uid: userId,
            name: firebaseUser.email ? firebaseUser.email.split('@')[0] : 'Player',
            city: 'Netanya',
            country: 'Israel',
            age: 20,
            birthDate: '2004-01-01',
            email: firebaseUser.email || '',
            sports: ['Football'],
            avatar: '',
            followers: [],
            following: [],
            pendingRequests: [],
            blockedUsers: [],
            isVip: false,
            isPromoted: false,
            isPrivate: false,
            themeMode: 'dark',
            notifications_chat: true,
            notifications_likes: true,
            notifications_follows: true,
            notifications_matchActivity: true,
            notifications_adminActions: true,
            notifications_storiesPosts: true,
          }, { merge: true });
        }

        fetchAndSaveAutomaticLocation(userId);

        const unsubscribeUser = onSnapshot(userRef, (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data() as any;
            setCurrentUser({
              ...data,
              uid: docSnap.id,
            });
            setEditName(data.name || '');
            setEditAvatar(data.avatar || '');
            if (data.themeMode === 'light' || data.themeMode === 'dark') {
              setThemeMode(data.themeMode);
              AsyncStorage.setItem('@world_sports_theme_mode', data.themeMode).catch(() => {});
            }
            if (data.isPrivate !== undefined) setPrivateAccount(data.isPrivate);
            if (data.notifications_chat !== undefined) setNotificationsChat(data.notifications_chat);
            if (data.notifications_likes !== undefined) setNotificationsLikes(data.notifications_likes);
            if (data.notifications_follows !== undefined) setNotificationsFollows(data.notifications_follows);
            if (data.notifications_matchActivity !== undefined) setNotificationsMatchActivity(data.notifications_matchActivity);
            if (data.notifications_adminActions !== undefined) setNotificationsAdminActions(data.notifications_adminActions);
            if (data.notifications_storiesPosts !== undefined) setNotificationsStoriesPosts(data.notifications_storiesPosts);
          }
        });
        return () => unsubscribeUser();
      } catch (e) {
        console.error('Error loading user profile', e);
      }
    };
    loadUserData();
  }, [firebaseUser]);

  useEffect(() => {
    const unsubscribeAll = onSnapshot(collection(db, 'users'), (snapshot) => {
      const usersList: UserProfile[] = snapshot.docs.map(docSnap => ({
        ...(docSnap.data() as UserProfile),
        uid: docSnap.id,
      }));
      setAllUsers(usersList);
    });
    return () => unsubscribeAll();
  }, []);

  useEffect(() => {
    if (!currentUser) return;

    const postsRef = collection(db, 'posts');
    const unsubscribe = onSnapshot(postsRef, (snapshot) => {
      const allPosts: PostItem[] = snapshot.docs.map(docSnap => {
        const data = docSnap.data();
        const likesList = data.likesList || [];
        return {
          id: docSnap.id,
          ...(data as any),
          likesList,
          likes: likesList.length,
          isLiked: currentUser ? likesList.includes(currentUser.uid) : false,
          comments: data.comments || []
        };
      });

      const filtered = allPosts.filter(p => 
        p.userId === currentUser.uid || 
        p.userEmail === currentUser.email || 
        p.userName === currentUser.name ||
        p.authorName === currentUser.name
      );

      setUserPosts(filtered);

      if (selectedPostModal) {
        const updated = allPosts.find(p => p.id === selectedPostModal.id);
        if (updated) setSelectedPostModal(updated);
      }
      if (commentsModalPost) {
        const updated = allPosts.find(p => p.id === commentsModalPost.id);
        if (updated) setCommentsModalPost(updated);
      }
    });

    return () => unsubscribe();
  }, [currentUser, selectedPostModal?.id, commentsModalPost?.id]);

  useEffect(() => {
    if (!selectedUserModalId) {
      setTargetProfileUser(null);
      setTargetUserPosts([]);
      setTargetActiveModalList(null);
      return;
    }

    const unsubscribe = onSnapshot(
      doc(db, 'users', selectedUserModalId),
      (userSnap) => {
        if (userSnap.exists()) {
          setTargetProfileUser({ uid: userSnap.id, ...(userSnap.data() as Omit<UserProfile, 'uid'>) });
        }
      },
      (e) => {
        console.error('Error fetching target user:', e);
      }
    );

    return () => unsubscribe();
  }, [selectedUserModalId]);

  useEffect(() => {
    if (!targetProfileUser) return;
    if (isBlockedBidirectional(targetProfileUser.uid, targetProfileUser.name)) {
      setTargetUserPosts([]);
      return;
    }

    const postsRef = collection(db, 'posts');
    const unsubscribe = onSnapshot(postsRef, (snapshot) => {
      const allPosts: PostItem[] = snapshot.docs.map(docSnap => {
        const data = docSnap.data();
        const likesList = data.likesList || [];
        return {
          id: docSnap.id,
          ...(data as any),
          likesList,
          likes: likesList.length,
          isLiked: currentUser ? likesList.includes(currentUser.uid) : false,
          comments: data.comments || []
        };
      });

      const filtered = allPosts.filter(p => 
        p.userId === targetProfileUser.uid || 
        p.userName === targetProfileUser.name ||
        p.authorName === targetProfileUser.name
      );

      setTargetUserPosts(filtered);
    });

    return () => unsubscribe();
  }, [targetProfileUser, currentUser, isBlockedBidirectional]);

  const handleTogglePrivacy = async (value: boolean) => {
    setPrivateAccount(value);
    if (!currentUser) return;
    try {
      await updateDoc(doc(db, 'users', currentUser.uid), { isPrivate: value });
      Alert.alert('Privacy Updated', value ? 'Your account is now set to private.' : 'Your account is now public.');
    } catch (e) {
      console.error('Error updating privacy setting:', e);
    }
  };

  const handleUpdateNotificationPref = async (key: string, value: boolean) => {
    if (key === 'chat') setNotificationsChat(value);
    if (key === 'likes') setNotificationsLikes(value);
    if (key === 'follows') setNotificationsFollows(value);
    if (key === 'matchActivity') setNotificationsMatchActivity(value);
    if (key === 'adminActions') setNotificationsAdminActions(value);
    if (key === 'storiesPosts') setNotificationsStoriesPosts(value);

    if (!currentUser) return;
    try {
      await updateDoc(doc(db, 'users', currentUser.uid), {
        [`notifications_${key}`]: value
      });
    } catch (e) {
      console.error('Error updating notification preference:', e);
    }
  };

  const handleManageSubscriptions = async () => {
    const iosUrl = 'https://apps.apple.com/account/subscriptions';
    const androidUrl = 'https://play.google.com/store/account/subscriptions';
    const urlToOpen = Platform.OS === 'ios' ? iosUrl : androidUrl;

    try {
      const supported = await Linking.canOpenURL(urlToOpen);
      if (supported) {
        await Linking.openURL(urlToOpen);
      } else {
        Alert.alert('Manage Subscriptions', 'Please open your device settings (App Store / Google Play) to manage or cancel your active subscriptions.');
      }
    } catch (error) {
      Alert.alert('Error', 'Could not open subscription management page.');
    }
  };

  const handlePurchaseProduct = async (productIdentifier: string, upgradeType: 'vip' | 'boost') => {
    if (!currentUser) return;

    const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

    try {
      if (Platform.OS === 'web' || isExpoGo) {
        const userRef = doc(db, 'users', currentUser.uid);
        if (upgradeType === 'vip') {
          const newVipState = !currentUser.isVip;
          await updateDoc(userRef, { isVip: newVipState });
          Alert.alert(newVipState ? 'Gold VIP Activated! (Mock) 🌟' : 'VIP Status Removed (Mock)');
        } else if (upgradeType === 'boost') {
          const newBoostState = !currentUser.isPromoted;
          const promotionExpiry = newBoostState ? new Date(Date.now() + 24 * 60 * 60 * 1000) : null;
          await updateDoc(userRef, { isPromoted: newBoostState, promotedUntil: promotionExpiry });
          Alert.alert(newBoostState ? 'Spotlight Activated! (Mock) 🚀' : 'Spotlight Boost Removed (Mock)');
        }
        return;
      }

      const offerings = await Purchases.getOfferings();
      if (offerings.current && offerings.current.availablePackages.length > 0) {
        const packageToPurchase = offerings.current.availablePackages.find(
          pkg => pkg.product.identifier === productIdentifier
        ) || offerings.current.availablePackages[0];

        const { customerInfo } = await Purchases.purchasePackage(packageToPurchase);
        
        if (customerInfo) {
          const userRef = doc(db, 'users', currentUser.uid);

          if (upgradeType === 'vip') {
            await updateDoc(userRef, { isVip: true });
            Alert.alert('Gold VIP Activated! 🌟', 'Welcome to VIP membership!');
          } else if (upgradeType === 'boost') {
            const promotionExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
            await updateDoc(userRef, { isPromoted: true, promotedUntil: promotionExpiry });
            Alert.alert('Spotlight Activated! 🚀', 'Your profile is now boosted to the top for 24 hours!');
          }
        }
      } else {
        Alert.alert('Store Error', 'No active products found in RevenueCat dashboard.');
      }
    } catch (error: any) {
      if (!error.userCancelled) {
        console.error('Purchase error:', error);
        Alert.alert('Purchase Error', error.message || 'Could not complete the transaction.');
      }
    }
  };

  const handleRemoveFollower = async (followerUid: string) => {
    if (!currentUser) return;
    Alert.alert(
      "Remove Follower",
      "Are you sure you want to remove this user from your followers?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              const myRef = doc(db, 'users', currentUser.uid);
              const followerRef = doc(db, 'users', followerUid);

              await updateDoc(myRef, {
                followers: arrayRemove(followerUid)
              });

              await updateDoc(followerRef, {
                following: arrayRemove(currentUser.uid)
              });

              Alert.alert("Success", "Follower removed successfully.");
            } catch (error) {
              console.error("Error removing follower:", error);
              Alert.alert("Error", "Could not remove follower.");
            }
          }
        }
      ]
    );
  };

  const handleUnblockUser = async (targetUid: string, targetName?: string) => {
    if (!currentUser || !targetUid || targetUid === currentUser.uid) return;
    Alert.alert(
      'Unblock User',
      `Unblock ${targetName || 'this user'}? They will become visible again across all screens.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unblock',
          onPress: async () => {
            try {
              await updateDoc(doc(db, 'users', currentUser.uid), {
                blockedUsers: arrayRemove(targetUid),
              });
              Alert.alert('User Unblocked', 'This user is visible again across all screens.');
            } catch (e) {
              console.error('Error unblocking user:', e);
              Alert.alert('Error', 'Could not unblock user.');
            }
          },
        },
      ]
    );
  };

  const handleToggleBlockTargetUser = async () => {
    if (!targetProfileUser || !currentUser || !targetProfileUser.uid || targetProfileUser.uid === currentUser.uid) {
      return;
    }

    const targetUid = targetProfileUser.uid;
    const targetDisplayName = targetProfileUser.name || 'this user';
    const alreadyBlocked = blockedUsersList.includes(targetUid);

    if (alreadyBlocked) {
      await handleUnblockUser(targetUid, targetDisplayName);
      return;
    }

    Alert.alert(
      'Block User',
      `Block ${targetDisplayName}? You won't see each other's content or communicate with each other.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: async () => {
            try {
              await updateDoc(doc(db, 'users', currentUser.uid), {
                blockedUsers: arrayUnion(targetUid),
                following: arrayRemove(targetUid),
                followers: arrayRemove(targetUid),
                pendingRequests: arrayRemove(targetUid),
              });

              await updateDoc(doc(db, 'users', targetUid), {
                following: arrayRemove(currentUser.uid),
                followers: arrayRemove(currentUser.uid),
                pendingRequests: arrayRemove(currentUser.uid),
              });

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

  const blockedAccountsList: UserProfile[] = blockedUsersList.map((blockedUid) => {
    const found = allUsers.find((u) => u.uid === blockedUid);
    return (
      found || {
        uid: blockedUid,
        name: blockedUid,
        city: 'Netanya',
        country: 'Israel',
        email: '',
      }
    );
  });

  const followersList = allUsers.filter(
    u => currentUser?.followers?.includes(u.uid) && !isBlockedBidirectional(u.uid, u.name)
  );
  const followingList = allUsers.filter(
    u => currentUser?.following?.includes(u.uid) && !isBlockedBidirectional(u.uid, u.name)
  );

  const targetFollowersList = allUsers.filter(
    u => targetProfileUser?.followers?.includes(u.uid) && !isBlockedBidirectional(u.uid, u.name)
  );
  const targetFollowingList = allUsers.filter(
    u => targetProfileUser?.following?.includes(u.uid) && !isBlockedBidirectional(u.uid, u.name)
  );

  const openUserProfileById = (userId?: string, userName?: string) => {
    const cleanPlayerName = (userName || '').trim().toLowerCase();
    const myCurrentName = (currentUser?.name || '').trim().toLowerCase();

    if (
      (userId && currentUser && userId === currentUser.uid) ||
      (cleanPlayerName && myCurrentName && cleanPlayerName === myCurrentName)
    ) {
      setSelectedPostModal(null);
      setCommentsModalPost(null);
      setActiveModalList(null);
      setTargetActiveModalList(null);
      setSelectedUserModalId(null);
      return;
    }

    setSelectedPostModal(null);
    setCommentsModalPost(null);
    setActiveModalList(null);
    setTargetActiveModalList(null);
    setSelectedUserModalId(null);

    setTimeout(() => {
      let found: UserProfile | undefined = undefined;
      if (userId) {
        found = allUsers.find(u => u.uid === userId);
      }
      if (!found && userName) {
        found = allUsers.find(u => u.name?.toLowerCase() === cleanPlayerName);
      }

      if (found) {
        if (currentUser && found.uid === currentUser.uid) {
          setSelectedUserModalId(null);
        } else {
          setSelectedUserModalId(found.uid);
        }
      } else if (userId) {
        setSelectedUserModalId(userId);
      }
    }, 50);
  };

  const handleLogoutPress = () => {
    Alert.alert("Log Out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      { 
        text: "Log Out", 
        onPress: async () => {
          try {
            await logout();
            router.replace('/');
          } catch (e) {
            console.error('Error logging out', e);
          }
        }, 
        style: "destructive" 
      }
    ]);
  };

  const handleDeleteAccountPress = () => {
    Alert.alert("Delete Account", "This action is irreversible! All your data and posts will be permanently deleted.", [
      { text: "Cancel", style: "cancel" },
      { 
        text: "Delete Permanently", 
        style: "destructive",
        onPress: async () => {
          try {
            await deleteAccount();
            router.replace('/');
          } catch (error: any) {
            Alert.alert("Error", "You may need to re-authenticate before deleting your account.");
          }
        } 
      }
    ]);
  };

  const pickImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      setEditAvatar(result.assets[0].uri);
    }
  };

  const handleSaveProfile = async () => {
    if (!currentUser || isSavingProfile) return;
    try {
      setIsSavingProfile(true);
      const userRef = doc(db, 'users', currentUser.uid);
      const newName = editName.trim();

      if (!newName) {
        Alert.alert('Error', 'Username cannot be empty.');
        return;
      }

      const finalAvatarUrl = editAvatar ? await uploadAvatarToCloudinary(editAvatar) : '';

      await updateDoc(userRef, {
        name: newName,
        avatar: finalAvatarUrl,
      });

      setEditAvatar(finalAvatarUrl);

      const postsQuery = query(collection(db, 'posts'), where('userId', '==', currentUser.uid));
      const postsSnapshot = await getDocs(postsQuery);
      const postUpdatePromises = postsSnapshot.docs.map(postDoc => 
        updateDoc(doc(db, 'posts', postDoc.id), {
          avatarUrl: finalAvatarUrl,
          userName: newName,
          authorName: newName
        })
      );
      await Promise.all(postUpdatePromises);

      setIsEditModalVisible(false);
      Alert.alert('Success', 'Profile updated successfully! 🚀');
    } catch (error) {
      console.error('Error updating profile:', error);
      Alert.alert('Error', 'Could not upload avatar or update profile.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleToggleFollowTarget = async () => {
    if (!targetProfileUser || !currentUser) return;
    if (isBlockedBidirectional(targetProfileUser.uid, targetProfileUser.name)) {
      Alert.alert('Unavailable', 'You cannot follow this user because a block is active.');
      return;
    }
    
    const isApproved = targetProfileUser.followers?.includes(currentUser.uid);
    const hasRequested = targetProfileUser.pendingRequests?.includes(currentUser.uid);
    const isPrivateAccount = targetProfileUser.isPrivate === true;
    const activeFollowerName = currentUser.name || 'Player';

    try {
      const myRef = doc(db, 'users', currentUser.uid);
      const targetRef = doc(db, 'users', targetProfileUser.uid);

      if (isApproved) {
        await updateDoc(targetRef, { followers: arrayRemove(currentUser.uid) });
        await updateDoc(myRef, { following: arrayRemove(targetProfileUser.uid) });
        setTargetProfileUser({
          ...targetProfileUser,
          followers: targetProfileUser.followers?.filter(id => id !== currentUser.uid)
        });
      } else if (hasRequested) {
        await updateDoc(targetRef, { pendingRequests: arrayRemove(currentUser.uid) });
        setTargetProfileUser({
          ...targetProfileUser,
          pendingRequests: targetProfileUser.pendingRequests?.filter(id => id !== currentUser.uid)
        });
      } else if (isPrivateAccount) {
        await updateDoc(targetRef, { pendingRequests: arrayUnion(currentUser.uid) });
        const reqMsg = `${activeFollowerName} requested to follow you. 🔒`;
        await createInAppNotification(
          targetProfileUser.uid,
          'follow_request',
          reqMsg,
          'Follow Request 🔒'
        );
        setTargetProfileUser({
          ...targetProfileUser,
          pendingRequests: [...(targetProfileUser.pendingRequests || []), currentUser.uid]
        });
      } else {
        await updateDoc(targetRef, { followers: arrayUnion(currentUser.uid) });
        await updateDoc(myRef, { following: arrayUnion(targetProfileUser.uid) });
        const followMsg = `${activeFollowerName} started following you! 🤝`;
        await createInAppNotification(
          targetProfileUser.uid,
          'new_follower',
          followMsg,
          'New Follower 🤝'
        );
        setTargetProfileUser({
          ...targetProfileUser,
          followers: [...(targetProfileUser.followers || []), currentUser.uid]
        });
      }
    } catch (error) {
      console.error('Error updating follow status:', error);
    }
  };

  const toggleLikePost = async (postId: string) => {
    if (!currentUser) return;
    const allKnownPosts = [...userPosts, ...targetUserPosts];
    const post = allKnownPosts.find(p => p.id === postId) || selectedPostModal || commentsModalPost;
    if (!post) return;
    if (isBlockedBidirectional(post.userId, post.userName || post.authorName)) return;

    try {
      const postRef = doc(db, 'posts', postId);
      const likesList = post.likesList || [];
      const hasLiked = likesList.includes(currentUser.uid);

      const updatedLikes = hasLiked
        ? likesList.filter(id => id !== currentUser.uid)
        : [...likesList, currentUser.uid];

      await updateDoc(postRef, { likesList: updatedLikes });

      const newLikesCount = updatedLikes.length;
      const newIsLiked = currentUser ? updatedLikes.includes(currentUser.uid) : false;

      if (selectedPostModal && selectedPostModal.id === postId) {
        setSelectedPostModal({ ...selectedPostModal, likesList: updatedLikes, likes: newLikesCount, isLiked: newIsLiked });
      }
      if (commentsModalPost && commentsModalPost.id === postId) {
        setCommentsModalPost({ ...commentsModalPost, likesList: updatedLikes, likes: newLikesCount, isLiked: newIsLiked });
      }

      if (!hasLiked && post.userId && post.userId !== currentUser.uid) {
        const likerName = currentUser.name || 'Player';
        const likeMsg = `${likerName} liked your post! ❤️`;
        await createInAppNotification(post.userId, 'post_like', likeMsg, 'New Like ❤️', {
          postId,
        });
      }
    } catch (e) {
      console.error('Error toggling like:', e);
    }
  };

  const handleAddCommentToPost = async (postId: string) => {
    if (!modalCommentInput.trim() || !currentUser) return;

    const allKnownPosts = [...userPosts, ...targetUserPosts];
    const post = allKnownPosts.find(p => p.id === postId) || commentsModalPost || selectedPostModal;
    if (!post) return;
    if (isBlockedBidirectional(post.userId, post.userName || post.authorName)) {
      Alert.alert('Blocked', 'You cannot comment on posts from this user because a block is active.');
      return;
    }

    const trimmedComment = modalCommentInput.trim();
    const commenterName = currentUser.name || 'Player';

    const newComment: Comment = {
      id: Date.now().toString(),
      userId: currentUser.uid,
      user: commenterName,
      avatarUrl: currentUser.avatar || '',
      text: trimmedComment,
      createdAt: serverTimestamp()
    };

    try {
      const postRef = doc(db, 'posts', postId);
      const updatedComments = [...(post.comments || []), newComment];
      await updateDoc(postRef, { comments: updatedComments });

      setModalCommentInput('');
      const updatedPostObj = { ...post, comments: updatedComments };
      if (commentsModalPost && commentsModalPost.id === postId) {
        setCommentsModalPost(updatedPostObj);
      }
      if (selectedPostModal && selectedPostModal.id === postId) {
        setSelectedPostModal(updatedPostObj);
      }

      if (post.userId && post.userId !== currentUser.uid) {
        const commentMsg = `${commenterName} commented on your post: "${trimmedComment.slice(0, 60)}" 💬`;
        await createInAppNotification(post.userId, 'post_comment', commentMsg, 'New Comment 💬', {
          postId,
        });
      }
    } catch (e) {
      console.error('Error adding comment:', e);
    }
  };

  const postOwner = allUsers.find(u => 
    u.uid === selectedPostModal?.userId || 
    u.name === selectedPostModal?.userName || 
    u.name === selectedPostModal?.authorName
  ) || currentUser;

  const userSportsList = currentUser?.sports || (currentUser?.sport ? [currentUser.sport] : ['Football']);
  const targetSportsList = targetProfileUser?.sports || (targetProfileUser?.sport ? [targetProfileUser.sport] : ['Football']);
  
  const isViewingMyOwnProfile = !!currentUser?.uid && targetProfileUser?.uid === currentUser.uid;
  const isTargetBlockedByMe = targetProfileUser?.uid ? blockedUsersList.includes(targetProfileUser.uid) : false;
  const isTargetBlockingMe = Array.isArray(targetProfileUser?.blockedUsers) && currentUser?.uid
    ? targetProfileUser.blockedUsers.includes(currentUser.uid)
    : false;
  const isAnyBlockBetweenUs = !isViewingMyOwnProfile && (isTargetBlockedByMe || isTargetBlockingMe);

  const isApprovedFollower = targetProfileUser?.followers?.includes(currentUser?.uid || '');
  const hasRequestedFollow = targetProfileUser?.pendingRequests?.includes(currentUser?.uid || '');
  const isPrivateAccount = targetProfileUser?.isPrivate === true;

  const canViewFullProfile = !isAnyBlockBetweenUs && (isViewingMyOwnProfile || !isPrivateAccount || isApprovedFollower);

  return (
    <View style={[styles.container, themedStyles.container]}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.homeCategory}>My Profile</Text>
            <Text style={[styles.appTitle, themedStyles.appTitle]}>World <Text style={{color: palette.accent}}>Sports</Text></Text>
          </View>

          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <TouchableOpacity style={[styles.settingsBtn, themedStyles.settingsBtn]} onPress={() => setSettingsModalVisible(true)} activeOpacity={0.8}>
              <Ionicons name="settings-outline" size={16} color={palette.accent} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.editProfileBtn} onPress={() => setIsEditModalVisible(true)} activeOpacity={0.8}>
              <Ionicons name="pencil" size={14} color={palette.accentTextOnButton} style={{ marginRight: 4 }} />
              <Text style={styles.editProfileBtnText}>Edit</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.headerProfile}>
          <TouchableOpacity 
            style={[styles.avatarLarge, themedStyles.avatarLarge]} 
            onPress={() => {
              if (currentUser?.avatar) setZoomedAvatarUri(currentUser.avatar);
            }}
            activeOpacity={0.7}
          >
            {currentUser?.avatar ? (
              <Image source={{ uri: currentUser.avatar }} style={styles.avatarImage} />
            ) : (
              <Text style={styles.avatarLargeText}>{currentUser?.name ? currentUser.name[0] : 'P'}</Text>
            )}
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={[styles.profileName, themedStyles.profileName]}>{currentUser?.name || 'Loading...'}</Text>
            {currentUser?.isVip && <Ionicons name="checkmark-circle" size={18} color={palette.accent} />}
            {currentUser?.isPrivate && <Ionicons name="lock-closed" size={14} color={palette.danger} />}
          </View>
          
          <View style={styles.sportsTagsRow}>
            {userSportsList.map((sport, index) => (
              <View key={index} style={[styles.sportTagBadge, themedStyles.sportTagBadge]}>
                <Text style={styles.sportTagText}> {sport}</Text>
              </View>
            ))}
          </View>

          <Text style={[styles.profileCity, themedStyles.profileCity]}>
            📍 {currentUser?.city || 'Netanya'}{currentUser?.country ? `, ${currentUser.country}` : ', Israel'} |  Age: {currentUser?.age || 20}
          </Text>
        </View>

        <TouchableOpacity 
          style={[styles.unifiedUpgradeCard, themedStyles.unifiedUpgradeCard]} 
          onPress={() => setVipModalVisible(true)}
          activeOpacity={0.9}
        >
          <View style={styles.vipBannerLeft}>
            <View style={[styles.vipIconCircle, themedStyles.vipIconCircle]}>
              <Ionicons name="star" size={16} color={palette.accent} />
            </View>
            <View>
              <Text style={[styles.vipBannerTitle, themedStyles.vipBannerTitle]}>Subscription & Upgrades Hub 🌟</Text>
              <Text style={[styles.vipBannerSubtitle, themedStyles.vipBannerSubtitle]}>Manage VIP & Spotlight Boost</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color={palette.accent} />
        </TouchableOpacity>

        <View style={[styles.statsRow, themedStyles.statsRow]}>
          <TouchableOpacity style={styles.statBox} onPress={() => setActiveModalList('followers')} activeOpacity={0.8}>
            <Text style={styles.statNumber}>{followersList.length}</Text>
            <Text style={[styles.statLabel, themedStyles.statLabel]}>Followers</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.statBox} onPress={() => setActiveModalList('following')} activeOpacity={0.8}>
            <Text style={styles.statNumber}>{followingList.length}</Text>
            <Text style={[styles.statLabel, themedStyles.statLabel]}>Following</Text>
          </TouchableOpacity>

          <View style={styles.statBox}>
            <Text style={styles.statNumber}>{userPosts.length}</Text>
            <Text style={[styles.statLabel, themedStyles.statLabel]}>Posts</Text>
          </View>
        </View>

        <View style={[styles.postsSectionHeader, themedStyles.postsSectionHeader]}>
          <Ionicons name="grid-outline" size={18} color={palette.accent} />
          <Text style={[styles.sectionTitle, themedStyles.sectionTitle]}>My Posts</Text>
        </View>

        {userPosts.length === 0 ? (
          <View style={[styles.emptyPostsBox, themedStyles.emptyPostsBox]}>
            <Ionicons name="images-outline" size={32} color={palette.textMuted} />
            <Text style={[styles.emptyPostsText, themedStyles.emptyPostsText]}>No posts shared yet.</Text>
          </View>
        ) : (
          <View style={styles.postsGrid}>
            {userPosts.map(post => {
              const isVid = post.mediaType === 'video';
              return (
                <TouchableOpacity key={post.id} style={[styles.postThumbnailBox, themedStyles.postThumbnailBox]} onPress={() => setSelectedPostModal(post)} activeOpacity={0.9}>
                  {isVid ? (
                    <View style={[styles.postThumbnailImage, { backgroundColor: '#000' }]}>
                      {post.imageUrl ? <ProfileVideoThumbnail uri={post.imageUrl} /> : null}
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

      </ScrollView>

      {/* Settings Modal */}
      <Modal visible={settingsModalVisible && !blockedUsersModalVisible} animationType="slide" transparent={true} onRequestClose={() => setSettingsModalVisible(false)}>
        <View style={[styles.modalOverlayCenter, themedStyles.modalOverlayCenter]}>
          <View style={[styles.settingsModalContent, themedStyles.settingsModalContent]}>
            
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.homeCategory}>PREFERENCES</Text>
                <Text style={[styles.modalTitle, themedStyles.modalTitle]}>Settings and activity</Text>
              </View>
              <TouchableOpacity onPress={() => setSettingsModalVisible(false)} activeOpacity={0.8} style={[styles.closeHomeModalBtn, themedStyles.closeHomeModalBtn]}>
                <Ionicons name="close" size={22} color={palette.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>
              
              <Text style={styles.igSectionHeader}>Appearance & Display</Text>

              <View style={[styles.igSettingItemToggle, themedStyles.igSettingItemToggle]}>
                <View style={styles.igSettingLeft}>
                  <Ionicons
                    name={themeMode === 'dark' ? 'moon-outline' : 'sunny-outline'}
                    size={20}
                    color={palette.accent}
                    style={styles.igSettingIcon}
                  />
                  <Text style={[styles.igSettingText, themedStyles.igSettingText]}>
                    {themeMode === 'dark' ? 'Dark Mode' : 'Light Mode'}
                  </Text>
                </View>
                <View style={styles.themeSelectorRow}>
                  <TouchableOpacity
                    style={[
                      styles.themeOptionBtn,
                      themedStyles.themeOptionBtn,
                      themeMode === 'light' && styles.themeOptionBtnActive,
                    ]}
                    onPress={() => handleSelectThemeMode('light')}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name="sunny"
                      size={14}
                      color={themeMode === 'light' ? palette.accentTextOnButton : palette.textMuted}
                    />
                    <Text
                      style={[
                        styles.themeOptionText,
                        { color: themeMode === 'light' ? palette.accentTextOnButton : palette.textMuted },
                      ]}
                    >
                      Light
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.themeOptionBtn,
                      themedStyles.themeOptionBtn,
                      themeMode === 'dark' && styles.themeOptionBtnActive,
                    ]}
                    onPress={() => handleSelectThemeMode('dark')}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name="moon"
                      size={14}
                      color={themeMode === 'dark' ? palette.accentTextOnButton : palette.textMuted}
                    />
                    <Text
                      style={[
                        styles.themeOptionText,
                        { color: themeMode === 'dark' ? palette.accentTextOnButton : palette.textMuted },
                      ]}
                    >
                      Dark
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              <Text style={styles.igSectionHeader}>Your account</Text>
              
              <TouchableOpacity style={[styles.igSettingItem, themedStyles.igSettingItem]} onPress={() => { setSettingsModalVisible(false); setIsEditModalVisible(true); }} activeOpacity={0.7}>
                <View style={styles.igSettingLeft}>
                  <Ionicons name="person-outline" size={20} color={palette.textPrimary} style={styles.igSettingIcon} />
                  <Text style={[styles.igSettingText, themedStyles.igSettingText]}>Edit Personal Profile</Text>
                </View>
                <View style={styles.igSettingRight}>
                  <Text style={[styles.igSettingValue, themedStyles.igSettingValue]}>Name, photo</Text>
                  <Ionicons name="chevron-forward" size={16} color={palette.textMuted} />
                </View>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.igSettingItem, themedStyles.igSettingItem]} onPress={() => { setSettingsModalVisible(false); setVipModalVisible(true); }} activeOpacity={0.7}>
                <View style={styles.igSettingLeft}>
                  <Ionicons name="star-outline" size={20} color={palette.accent} style={styles.igSettingIcon} />
                  <Text style={[styles.igSettingText, { color: palette.accent }]}>Gold VIP & Spotlight Subscriptions</Text>
                </View>
                <View style={styles.igSettingRight}>
                  <Text style={[styles.igSettingValue, themedStyles.igSettingValue]}>{currentUser?.isVip ? 'Active 🌟' : 'Upgrade'}</Text>
                  <Ionicons name="chevron-forward" size={16} color={palette.textMuted} />
                </View>
              </TouchableOpacity>

              <Text style={styles.igSectionHeader}>Who can see your content</Text>

              <View style={[styles.igSettingItemToggle, themedStyles.igSettingItemToggle]}>
                <View style={styles.igSettingLeft}>
                  <Ionicons name="lock-closed-outline" size={20} color="#22C55E" style={styles.igSettingIcon} />
                  <Text style={[styles.igSettingText, themedStyles.igSettingText]}>Private Account</Text>
                </View>
                <Switch 
                  value={privateAccount} 
                  onValueChange={handleTogglePrivacy}
                  trackColor={{ false: palette.switchTrackOff, true: palette.accent }}
                  thumbColor={privateAccount ? '#FAFAFA' : palette.switchThumbOff}
                />
              </View>

              <TouchableOpacity style={[styles.igSettingItem, themedStyles.igSettingItem]} onPress={() => setBlockedUsersModalVisible(true)} activeOpacity={0.7}>
                <View style={styles.igSettingLeft}>
                  <Ionicons name="ban-outline" size={20} color={palette.danger} style={styles.igSettingIcon} />
                  <Text style={[styles.igSettingText, themedStyles.igSettingText]}>Blocked Users</Text>
                </View>
                <View style={styles.igSettingRight}>
                  <Text style={[styles.igSettingValue, themedStyles.igSettingValue]}>{blockedAccountsList.length}</Text>
                  <Ionicons name="chevron-forward" size={16} color={palette.textMuted} />
                </View>
              </TouchableOpacity>

              <Text style={styles.igSectionHeader}>Notification Preferences</Text>

              <View style={[styles.igSettingItemToggle, themedStyles.igSettingItemToggle]}>
                <View style={styles.igSettingLeft}>
                  <Ionicons name="chatbubble-outline" size={20} color="#3B82F6" style={styles.igSettingIcon} />
                  <Text style={[styles.igSettingText, themedStyles.igSettingText]}>Chat Messages</Text>
                </View>
                <Switch 
                  value={notificationsChat} 
                  onValueChange={(val) => handleUpdateNotificationPref('chat', val)}
                  trackColor={{ false: palette.switchTrackOff, true: palette.accent }}
                  thumbColor={notificationsChat ? '#FAFAFA' : palette.switchThumbOff}
                />
              </View>

              <View style={[styles.igSettingItemToggle, themedStyles.igSettingItemToggle]}>
                <View style={styles.igSettingLeft}>
                  <Ionicons name="football-outline" size={20} color={palette.accent} style={styles.igSettingIcon} />
                  <Text style={[styles.igSettingText, themedStyles.igSettingText]}>Match Join / Leave Activity</Text>
                </View>
                <Switch 
                  value={notificationsMatchActivity} 
                  onValueChange={(val) => handleUpdateNotificationPref('matchActivity', val)}
                  trackColor={{ false: palette.switchTrackOff, true: palette.accent }}
                  thumbColor={notificationsMatchActivity ? '#FAFAFA' : palette.switchThumbOff}
                />
              </View>

              <View style={[styles.igSettingItemToggle, themedStyles.igSettingItemToggle]}>
                <View style={styles.igSettingLeft}>
                  <Ionicons name="shield-outline" size={20} color={palette.danger} style={styles.igSettingIcon} />
                  <Text style={[styles.igSettingText, themedStyles.igSettingText]}>Admin Match Deletions</Text>
                </View>
                <Switch 
                  value={notificationsAdminActions} 
                  onValueChange={(val) => handleUpdateNotificationPref('adminActions', val)}
                  trackColor={{ false: palette.switchTrackOff, true: palette.accent }}
                  thumbColor={notificationsAdminActions ? '#FAFAFA' : palette.switchThumbOff}
                />
              </View>

              <View style={[styles.igSettingItemToggle, themedStyles.igSettingItemToggle]}>
                <View style={styles.igSettingLeft}>
                  <Ionicons name="radio-outline" size={20} color="#A855F7" style={styles.igSettingIcon} />
                  <Text style={[styles.igSettingText, themedStyles.igSettingText]}>New Stories & Posts from Following</Text>
                </View>
                <Switch 
                  value={notificationsStoriesPosts} 
                  onValueChange={(val) => handleUpdateNotificationPref('storiesPosts', val)}
                  trackColor={{ false: palette.switchTrackOff, true: palette.accent }}
                  thumbColor={notificationsStoriesPosts ? '#FAFAFA' : palette.switchThumbOff}
                />
              </View>

              <View style={[styles.igSettingItemToggle, themedStyles.igSettingItemToggle]}>
                <View style={styles.igSettingLeft}>
                  <Ionicons name="heart-outline" size={20} color={palette.danger} style={styles.igSettingIcon} />
                  <Text style={[styles.igSettingText, themedStyles.igSettingText]}>Likes & Comments</Text>
                </View>
                <Switch 
                  value={notificationsLikes} 
                  onValueChange={(val) => handleUpdateNotificationPref('likes', val)}
                  trackColor={{ false: palette.switchTrackOff, true: palette.accent }}
                  thumbColor={notificationsLikes ? '#FAFAFA' : palette.switchThumbOff}
                />
              </View>

              <View style={[styles.igSettingItemToggle, themedStyles.igSettingItemToggle]}>
                <View style={styles.igSettingLeft}>
                  <Ionicons name="person-add-outline" size={20} color="#22C55E" style={styles.igSettingIcon} />
                  <Text style={[styles.igSettingText, themedStyles.igSettingText]}>New Followers</Text>
                </View>
                <Switch 
                  value={notificationsFollows} 
                  onValueChange={(val) => handleUpdateNotificationPref('follows', val)}
                  trackColor={{ false: palette.switchTrackOff, true: palette.accent }}
                  thumbColor={notificationsFollows ? '#FAFAFA' : palette.switchThumbOff}
                />
              </View>

              <Text style={styles.igSectionHeader}>More info and support</Text>

              <TouchableOpacity 
                style={[styles.igSettingItem, themedStyles.igSettingItem]} 
                onPress={async () => {
                  const url = 'https://naoryaish7-wq.github.io/World-Sports/';
                  try {
                    const supported = await Linking.canOpenURL(url);
                    if (supported) {
                      await Linking.openURL(url);
                    } else {
                      Alert.alert('Error', 'Could not open the website link.');
                    }
                  } catch (error) {
                    Alert.alert('Error', 'Could not open the website link.');
                  }
                }} 
                activeOpacity={0.7}
              >
                <View style={styles.igSettingLeft}>
                  <Ionicons name="help-circle-outline" size={20} color={palette.textPrimary} style={styles.igSettingIcon} />
                  <Text style={[styles.igSettingText, themedStyles.igSettingText]}>Help & Support </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={palette.textMuted} />
              </TouchableOpacity>

              <TouchableOpacity style={[styles.igSettingItem, themedStyles.igSettingItem]} onPress={() => Alert.alert('About App', 'World Sports Hub v2.4.1\nAll rights reserved.')} activeOpacity={0.7}>
                <View style={styles.igSettingLeft}>
                  <Ionicons name="information-circle-outline" size={20} color={palette.textPrimary} style={styles.igSettingIcon} />
                  <Text style={[styles.igSettingText, themedStyles.igSettingText]}>About App</Text>
                </View>
                <View style={styles.igSettingRight}>
                  <Text style={[styles.igSettingValue, themedStyles.igSettingValue]}>v2.4.1</Text>
                  <Ionicons name="chevron-forward" size={16} color={palette.textMuted} />
                </View>
              </TouchableOpacity>

              <Text style={styles.igSectionHeader}>Login & Actions</Text>

              <TouchableOpacity style={[styles.igSettingItem, themedStyles.igSettingItem]} onPress={() => { setSettingsModalVisible(false); handleLogoutPress(); }} activeOpacity={0.7}>
                <View style={styles.igSettingLeft}>
                  <Ionicons name="log-out-outline" size={20} color={palette.accent} style={styles.igSettingIcon} />
                  <Text style={[styles.igSettingText, { color: palette.accent, fontWeight: 'bold' }]}>Log out</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.igSettingItem, themedStyles.igSettingItem]} onPress={() => { setSettingsModalVisible(false); handleDeleteAccountPress(); }} activeOpacity={0.7}>
                <View style={styles.igSettingLeft}>
                  <Ionicons name="trash-outline" size={20} color={palette.danger} style={styles.igSettingIcon} />
                  <Text style={[styles.igSettingText, { color: palette.danger, fontWeight: 'bold' }]}>Delete Account Permanently</Text>
                </View>
              </TouchableOpacity>

            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Blocked Users Modal */}
      <Modal visible={blockedUsersModalVisible} animationType="slide" transparent={true} onRequestClose={() => setBlockedUsersModalVisible(false)}>
        <View style={[styles.modalOverlayCenter, themedStyles.modalOverlayCenter]}>
          <View style={[styles.modalContentCenter, themedStyles.modalContentCenter]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, themedStyles.modalTitle]}>Blocked Users 🚫</Text>
              <TouchableOpacity onPress={() => setBlockedUsersModalVisible(false)} activeOpacity={0.8} style={[styles.closeHomeModalBtn, themedStyles.closeHomeModalBtn]}>
                <Ionicons name="close" size={22} color={palette.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
              {blockedAccountsList.length === 0 ? (
                <View style={[styles.emptyPostsBox, themedStyles.emptyPostsBox]}>
                  <Ionicons name="checkmark-circle-outline" size={32} color={palette.textMuted} />
                  <Text style={[styles.emptyPostsText, themedStyles.emptyPostsText]}>You haven't blocked any users.</Text>
                </View>
              ) : (
                blockedAccountsList.map((blockedUser) => (
                  <View key={blockedUser.uid} style={[styles.listItem, themedStyles.listItem]}>
                    <View style={[styles.listAvatar, themedStyles.listAvatar]}>
                      {blockedUser.avatar ? (
                        <Image source={{ uri: blockedUser.avatar }} style={{ width: 38, height: 38, borderRadius: 19 }} />
                      ) : (
                        <Text style={{ color: palette.accent, fontWeight: 'bold' }}>
                          {blockedUser.name ? blockedUser.name[0].toUpperCase() : 'P'}
                        </Text>
                      )}
                    </View>
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Text style={[styles.listName, themedStyles.listName]} numberOfLines={1}>{blockedUser.name}</Text>
                        {blockedUser.isVip && <Ionicons name="checkmark-circle" size={14} color={palette.accent} />}
                      </View>
                      <Text style={[styles.listCity, themedStyles.listCity]} numberOfLines={1}>
                        📍 {blockedUser.city || 'Netanya'}{blockedUser.country ? `, ${blockedUser.country}` : ', Israel'}
                      </Text>
                    </View>

                    <TouchableOpacity
                      style={[styles.unblockListBtn, themedStyles.unblockListBtn]}
                      onPress={() => handleUnblockUser(blockedUser.uid, blockedUser.name)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.unblockListBtnText, themedStyles.unblockListBtnText]}>Unblock</Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* VIP Modal */}
      <Modal visible={vipModalVisible} animationType="slide" transparent={true} onRequestClose={() => setVipModalVisible(false)}>
        <View style={[styles.modalOverlayCenter, themedStyles.modalOverlayCenter]}>
          <View style={[styles.modalContentCenter, themedStyles.modalContentCenter]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, themedStyles.modalTitle]}>Subscriptions Hub 🚀</Text>
              <TouchableOpacity onPress={() => setVipModalVisible(false)} activeOpacity={0.8} style={[styles.closeHomeModalBtn, themedStyles.closeHomeModalBtn]}>
                <Ionicons name="close" size={22} color={palette.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={[styles.hubSectionCard, themedStyles.hubSectionCard]}>
                <View style={styles.hubSectionHeaderRow}>
                  <Ionicons name="star" size={22} color={palette.accent} />
                  <Text style={[styles.hubSectionTitle, themedStyles.hubSectionTitle]}>Gold VIP Membership</Text>
                </View>
                <Text style={[styles.hubSectionDesc, themedStyles.hubSectionDesc]}>Get verified gold badge, high visibility, priority in feeds & unlimited direct access ($9.99/mo).</Text>
                
                <TouchableOpacity 
                  style={[styles.hubActionBtn, currentUser?.isVip && [styles.hubActionBtnCancel, themedStyles.hubActionBtnCancel]]} 
                  onPress={() => handlePurchaseProduct('world_sports_vip_monthly', 'vip')}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.hubActionBtnText, { color: palette.accentTextOnButton }, currentUser?.isVip && { color: palette.danger }]}>
                    {currentUser?.isVip ? 'Disable VIP (Mock) ❌' : 'Subscribe to VIP 🌟'}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={[styles.hubSectionCard, themedStyles.hubSectionCard]}>
                <View style={styles.hubSectionHeaderRow}>
                  <Ionicons name="rocket" size={22} color="#3B82F6" />
                  <Text style={[styles.hubSectionTitle, themedStyles.hubSectionTitle]}>Spotlight Profile Boost</Text>
                </View>
                <Text style={[styles.hubSectionDesc, themedStyles.hubSectionDesc]}>Pin your profile to the very top of the Discover feed for 24 hours to gain maximum player reach ($2.99).</Text>
                
                <TouchableOpacity 
                  style={[styles.hubActionBtnBlue, currentUser?.isPromoted && [styles.hubActionBtnCancel, themedStyles.hubActionBtnCancel]]} 
                  onPress={() => handlePurchaseProduct('world_sports_spotlight_boost', 'boost')}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.hubActionBtnText, { color: palette.accentTextOnButton }, currentUser?.isPromoted && { color: palette.danger }]}>
                    {currentUser?.isPromoted ? 'Remove Boost (Mock) ❌' : 'Activate Spotlight Boost 🚀'}
                  </Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity style={[styles.manageStoreSubBtn, themedStyles.manageStoreSubBtn]} onPress={handleManageSubscriptions} activeOpacity={0.85}>
                <Ionicons name="settings-outline" size={16} color={palette.textPrimary} style={{ marginRight: 6 }} />
                <Text style={[styles.manageStoreSubText, themedStyles.manageStoreSubText]}>Manage / Cancel Store Subscriptions </Text>
              </TouchableOpacity>

              <Text style={[styles.billingNotice, themedStyles.billingNotice]}>
                🔒 All purchases and subscriptions are securely processed through your device's app store (Apple App Store / Google Play Billing) and can be managed or canceled anytime via your device settings.
              </Text>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Edit Profile Modal */}
      <Modal visible={isEditModalVisible} animationType="slide" transparent={true} onRequestClose={() => { if (!isSavingProfile) setIsEditModalVisible(false); }}>
        <View style={[styles.modalOverlayCenter, themedStyles.modalOverlayCenter]}>
          <View style={[styles.modalContentCenter, themedStyles.modalContentCenter]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, themedStyles.modalTitle]}>Edit Profile ✏️</Text>
              <TouchableOpacity onPress={() => { if (!isSavingProfile) setIsEditModalVisible(false); }} disabled={isSavingProfile} activeOpacity={0.8} style={[styles.closeHomeModalBtn, themedStyles.closeHomeModalBtn]}>
                <Ionicons name="close" size={22} color={palette.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.editAvatarContainer}>
                <View style={[styles.avatarEditPreview, themedStyles.avatarEditPreview]}>
                  {editAvatar ? (
                    <Image source={{ uri: editAvatar }} style={styles.avatarImage} />
                  ) : (
                    <Text style={styles.avatarLargeText}>{editName ? editName[0] : 'P'}</Text>
                  )}
                </View>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity style={[styles.imagePickBtn, themedStyles.imagePickBtn]} onPress={pickImage} disabled={isSavingProfile} activeOpacity={0.8}>
                    <Text style={styles.imagePickText}>Change Photo</Text>
                  </TouchableOpacity>
                  {editAvatar ? (
                    <TouchableOpacity style={[styles.imageRemoveBtn, themedStyles.imageRemoveBtn]} onPress={() => setEditAvatar('')} disabled={isSavingProfile} activeOpacity={0.8}>
                      <Text style={[styles.imageRemoveText, { color: palette.danger }]}>Remove</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>

              <Text style={[styles.label, themedStyles.label]}>Username / Full Name</Text>
              <TextInput style={[styles.input, themedStyles.input]} value={editName} onChangeText={setEditName} placeholder="Username" placeholderTextColor={palette.textMuted} editable={!isSavingProfile} />

              <TouchableOpacity style={[styles.saveBtn, isSavingProfile && { opacity: 0.7 }]} onPress={handleSaveProfile} disabled={isSavingProfile} activeOpacity={0.85}>
                {isSavingProfile ? (
                  <ActivityIndicator size="small" color={palette.accentTextOnButton} />
                ) : (
                  <Text style={[styles.saveBtnText, { color: palette.accentTextOnButton }]}>Save Changes 🚀</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Followers / Following Modal */}
      <Modal visible={!!activeModalList} animationType="slide" transparent={true} onRequestClose={() => setActiveModalList(null)}>
        <View style={[styles.modalOverlayCenter, themedStyles.modalOverlayCenter]}>
          <View style={[styles.modalContentCenter, themedStyles.modalContentCenter]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, themedStyles.modalTitle]}>
                {activeModalList === 'followers' ? 'Followers 👥' : 'Following 🤝'}
              </Text>
              <TouchableOpacity onPress={() => setActiveModalList(null)} activeOpacity={0.8} style={[styles.closeHomeModalBtn, themedStyles.closeHomeModalBtn]}>
                <Ionicons name="close" size={22} color={palette.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 350 }} showsVerticalScrollIndicator={false}>
              {(activeModalList === 'followers' ? followersList : followingList).map((item) => (
                <View key={item.uid} style={[styles.listItem, themedStyles.listItem]}>
                  <TouchableOpacity 
                    style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }} 
                    onPress={() => {
                      setActiveModalList(null); 
                      openUserProfileById(item.uid, item.name); 
                    }}
                    activeOpacity={0.85}
                  >
                    <View style={[styles.listAvatar, themedStyles.listAvatar]}>
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
                      <Text style={[styles.listCity, themedStyles.listCity]}>📍 {item.city || 'Netanya'}{item.country ? `, ${item.country}` : ', Israel'} |  Age: {item.age || 'N/A'}</Text>
                    </View>
                  </TouchableOpacity>

                  {activeModalList === 'followers' && (
                    <TouchableOpacity 
                      style={[styles.removeFollowerBtn, themedStyles.removeFollowerBtn]}
                      onPress={() => handleRemoveFollower(item.uid)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.removeFollowerBtnText, { color: palette.danger }]}>Remove</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Target User Followers / Following Modal */}
      <Modal visible={!!targetActiveModalList} animationType="slide" transparent={true} onRequestClose={() => setTargetActiveModalList(null)}>
        <View style={[styles.modalOverlayCenter, themedStyles.modalOverlayCenter]}>
          <View style={[styles.modalContentCenter, themedStyles.modalContentCenter]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, themedStyles.modalTitle]}>
                {targetActiveModalList === 'followers' ? 'Followers 👥' : 'Following 🤝'}
              </Text>
              <TouchableOpacity onPress={() => setTargetActiveModalList(null)} activeOpacity={0.8} style={[styles.closeHomeModalBtn, themedStyles.closeHomeModalBtn]}>
                <Ionicons name="close" size={22} color={palette.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 350 }} showsVerticalScrollIndicator={false}>
              {(targetActiveModalList === 'followers' ? targetFollowersList : targetFollowingList).map((item) => (
                <TouchableOpacity 
                  key={item.uid} 
                  style={[styles.listItem, themedStyles.listItem]} 
                  onPress={() => {
                    const nextUserId = item.uid;
                    const nextUserName = item.name;
                    setTargetActiveModalList(null);
                    setSelectedUserModalId(null);
                    setTimeout(() => {
                      openUserProfileById(nextUserId, nextUserName);
                    }, 50);
                  }}
                  activeOpacity={0.85}
                >
                  <View style={[styles.listAvatar, themedStyles.listAvatar]}>
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
                    <Text style={[styles.listCity, themedStyles.listCity]}>📍 {item.city || 'Netanya'}{item.country ? `, ${item.country}` : ', Israel'} |  Age: {item.age || 'N/A'}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={palette.textMuted} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Target User Profile Modal */}
      <Modal visible={!!selectedUserModalId && !targetActiveModalList && !selectedPostModal && !commentsModalPost} animationType="slide" transparent={true} onRequestClose={() => setSelectedUserModalId(null)}>
        <View style={[styles.modalOverlayCenter, themedStyles.modalOverlayCenter]}>
          <View style={[styles.modalContentHomeStyle, themedStyles.modalContentHomeStyle]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.homeCategory}>Player Profile</Text>
                <Text style={[styles.appTitle, themedStyles.appTitle]}>World <Text style={{color: palette.accent}}>Sports</Text></Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedUserModalId(null)} activeOpacity={0.8} style={[styles.closeHomeModalBtn, themedStyles.closeHomeModalBtn]}>
                <Ionicons name="close" size={22} color={palette.textPrimary} />
              </TouchableOpacity>
            </View>

            {targetProfileUser && (
              <ScrollView showsVerticalScrollIndicator={false} nestedScrollEnabled={true}>
                <View style={styles.headerProfile}>
                  <TouchableOpacity 
                    style={[styles.avatarLarge, themedStyles.avatarLarge]}
                    onPress={() => {
                      if (targetProfileUser.avatar && !isAnyBlockBetweenUs) setZoomedAvatarUri(targetProfileUser.avatar);
                    }}
                    activeOpacity={0.7}
                  >
                    {targetProfileUser.avatar && !isAnyBlockBetweenUs ? (
                      <Image source={{ uri: targetProfileUser.avatar }} style={styles.avatarImage} />
                    ) : (
                      <Text style={styles.avatarLargeText}>{targetProfileUser.name ? targetProfileUser.name[0] : 'P'}</Text>
                    )}
                  </TouchableOpacity>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={[styles.profileName, themedStyles.profileName]}>{targetProfileUser.name}</Text>
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

                      <Text style={[styles.profileCity, themedStyles.profileCity]}>
                        📍 {targetProfileUser.city || 'Netanya'}{targetProfileUser.country ? `, ${targetProfileUser.country}` : ', Israel'} |  Age: {targetProfileUser.age || 20}
                      </Text>
                    </>
                  )}
                </View>

                {!isAnyBlockBetweenUs && (
                  <View style={[styles.statsRow, themedStyles.statsRow]}>
                    <TouchableOpacity 
                      style={styles.statBox} 
                      onPress={() => {
                        if (!canViewFullProfile) return;
                        if (isViewingMyOwnProfile) {
                          setSelectedUserModalId(null);
                          setActiveModalList('followers');
                        } else {
                          setTargetActiveModalList('followers');
                        }
                      }}
                      activeOpacity={canViewFullProfile ? 0.8 : 1}
                    >
                      <Text style={styles.statNumber}>{targetFollowersList.length}</Text>
                      <Text style={[styles.statLabel, themedStyles.statLabel]}>Followers</Text>
                    </TouchableOpacity>

                    <TouchableOpacity 
                      style={styles.statBox} 
                      onPress={() => {
                        if (!canViewFullProfile) return;
                        if (isViewingMyOwnProfile) {
                          setSelectedUserModalId(null);
                          setActiveModalList('following');
                        } else {
                          setTargetActiveModalList('following');
                        }
                      }}
                      activeOpacity={canViewFullProfile ? 0.8 : 1}
                    >
                      <Text style={styles.statNumber}>{targetFollowingList.length}</Text>
                      <Text style={[styles.statLabel, themedStyles.statLabel]}>Following</Text>
                    </TouchableOpacity>

                    <View style={styles.statBox}>
                      <Text style={styles.statNumber}>{targetUserPosts.length}</Text>
                      <Text style={[styles.statLabel, themedStyles.statLabel]}>Posts</Text>
                    </View>
                  </View>
                )}

                {!isViewingMyOwnProfile && (
                  <View style={{ marginVertical: 12, gap: 10 }}>
                    {!isAnyBlockBetweenUs && (
                      <TouchableOpacity 
                        style={[
                          styles.profileFollowBtn, 
                          isApprovedFollower && [styles.profileFollowingBtn, themedStyles.profileFollowingBtn],
                          hasRequestedFollow && [styles.requestedFollowBtn, themedStyles.requestedFollowBtn],
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
                          {isApprovedFollower ? 'Following ✓' : hasRequestedFollow ? 'Requested ⏳' : isPrivateAccount ? 'Request Follow 🤝' : 'Follow Player 🤝'}
                        </Text>
                      </TouchableOpacity>
                    )}

                    {!isTargetBlockingMe && (
                      <TouchableOpacity
                        style={[
                          styles.blockProfileBtn,
                          themedStyles.blockProfileBtn,
                          isTargetBlockedByMe && [styles.unblockProfileBtn, themedStyles.unblockProfileBtn],
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
                    <Text style={[styles.privateAccountTitle, themedStyles.privateAccountTitle]}>
                      {isTargetBlockedByMe ? 'You Blocked This User' : 'Content Unavailable'}
                    </Text>
                    <Text style={[styles.privateAccountText, themedStyles.privateAccountText]}>
                      {isTargetBlockedByMe
                        ? 'Unblock this user to view their profile or posts.'
                        : 'You cannot view this profile.'}
                    </Text>
                  </View>
                ) : canViewFullProfile ? (
                  <>
                    <View style={[styles.postsSectionHeader, themedStyles.postsSectionHeader]}>
                      <Ionicons name="grid-outline" size={18} color={palette.accent} />
                      <Text style={[styles.sectionTitle, themedStyles.sectionTitle]}>Posts</Text>
                    </View>

                    {targetUserPosts.length === 0 ? (
                      <View style={[styles.emptyPostsBox, themedStyles.emptyPostsBox]}>
                        <Ionicons name="images-outline" size={32} color={palette.textMuted} />
                        <Text style={[styles.emptyPostsText, themedStyles.emptyPostsText]}>No posts shared yet by this user.</Text>
                      </View>
                    ) : (
                      <View style={styles.postsGrid}>
                        {targetUserPosts.map(post => {
                          const isVid = post.mediaType === 'video';
                          return (
                            <TouchableOpacity key={post.id} style={[styles.postThumbnailBox, themedStyles.postThumbnailBox]} onPress={() => setSelectedPostModal(post)} activeOpacity={0.9}>
                              {isVid ? (
                                <View style={[styles.postThumbnailImage, { backgroundColor: '#000' }]}>
                                  {post.imageUrl ? <ProfileVideoThumbnail uri={post.imageUrl} /> : null}
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
                  <View style={[styles.privateAccountBox, themedStyles.privateAccountBox]}>
                    <Ionicons name="lock-closed" size={40} color={palette.accent} style={{ marginBottom: 8 }} />
                    <Text style={[styles.privateAccountTitle, themedStyles.privateAccountTitle]}>This Account is Private 🔒</Text>
                    <Text style={[styles.privateAccountText, themedStyles.privateAccountText]}>Follow this player to see their posts, stories, and connections.</Text>
                  </View>
                )}

              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Post Details Modal */}
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
                    <TouchableOpacity style={[styles.postAvatarBox, themedStyles.postAvatarBox]} onPress={() => { setSelectedPostModal(null); openUserProfileById(selectedPostModal.userId, selectedPostModal.authorName || selectedPostModal.userName); }} activeOpacity={0.85}>
                      {postOwner?.avatar ? (
                        <Image source={{ uri: postOwner.avatar }} style={styles.avatarImg} />
                      ) : (
                        <Text style={styles.avatarLetterTextSmall}>{postOwner?.name ? postOwner.name[0].toUpperCase() : 'P'}</Text>
                      )}
                    </TouchableOpacity>
                    
                    <View style={styles.postUserInfo}>
                      <TouchableOpacity onPress={() => { setSelectedPostModal(null); openUserProfileById(selectedPostModal.userId, selectedPostModal.authorName || selectedPostModal.userName); }} activeOpacity={0.85}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={[styles.postUserName, themedStyles.postUserName]}>{postOwner?.name || selectedPostModal.authorName || selectedPostModal.userName}</Text>
                          {postOwner?.isVip && <Ionicons name="checkmark-circle" size={14} color={palette.accent} />}
                          
                          <View style={[styles.postSportBadge, themedStyles.postSportBadge]}>
                            <Text style={styles.postSportBadgeText}>⚽ Football</Text>
                          </View>
                        </View>
                      </TouchableOpacity>
                      <Text style={[styles.postUserMeta, themedStyles.postUserMeta]}>{postOwner?.city || 'Netanya'}{postOwner?.country ? `, ${postOwner.country}` : ', Israel'}</Text>
                    </View>

                    <Text style={[styles.postTime, themedStyles.postTime]}>{getTimeAgo(selectedPostModal.createdAt)}</Text>
                  </View>

                  <Text style={[styles.postText, themedStyles.postText]}>{selectedPostModal.caption || selectedPostModal.text}</Text>
                  
                  {selectedPostModal.imageUrl ? (
                    <TouchableWithoutFeedback onPress={() => handleDoubleTap(selectedPostModal.id)}>
                      <View style={[styles.postImageBox, themedStyles.postImageBox]}>
                        {selectedPostModal.mediaType === 'video' ? (
                          <PostVideoPlayer key={`modal_${selectedPostModal.id}`} uri={selectedPostModal.imageUrl} isStoryOpen={false} />
                        ) : (
                          <Image source={{ uri: selectedPostModal.imageUrl }} style={styles.postImageContent} />
                        )}
                      </View>
                    </TouchableWithoutFeedback>
                  ) : null}

                  <View style={[styles.postActionsRow, themedStyles.postActionsRow]}>
                    <TouchableOpacity style={styles.actionBtn} onPress={() => toggleLikePost(selectedPostModal.id)} activeOpacity={0.7}>
                      <Ionicons 
                        name={selectedPostModal.isLiked ? "heart" : "heart-outline"} 
                        size={20} 
                        color={selectedPostModal.isLiked ? palette.danger : palette.textMuted} 
                      />
                      <Text style={[styles.actionText, themedStyles.actionText, selectedPostModal.isLiked && { color: palette.danger, fontWeight: 'bold' }]}>
                        {selectedPostModal.likes || selectedPostModal.likesList?.length || 0} Likes
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.actionBtn} onPress={() => { const current = selectedPostModal; setSelectedPostModal(null); setCommentsModalPost(current); }} activeOpacity={0.7}>
                      <Ionicons name="chatbubble-outline" size={18} color={palette.textMuted} />
                      <Text style={[styles.actionText, themedStyles.actionText]}>{selectedPostModal.comments?.length || 0} Comments</Text>
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
        <View style={[styles.modalOverlayCenter, themedStyles.modalOverlayCenter]}>
          <View style={[styles.commentsModalContent, themedStyles.commentsModalContent]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={[styles.modalTitle, themedStyles.modalTitle]}>Comments</Text>
                <Ionicons name="chatbubble-ellipses-outline" size={18} color={palette.accent} />
              </View>
              <TouchableOpacity onPress={() => setCommentsModalPost(null)} activeOpacity={0.8} style={[styles.closeHomeModalBtn, themedStyles.closeHomeModalBtn]}>
                <Ionicons name="close" size={22} color={palette.textPrimary} />
              </TouchableOpacity>
            </View>

            {commentsModalPost && (
              <View style={{ flex: 1, width: '100%' }}>
                <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 15 }}>
                  {(!commentsModalPost.comments || commentsModalPost.comments.length === 0) ? (
                    <Text style={{ color: palette.textMuted, textAlign: 'center', marginVertical: 30, fontSize: 13 }}>No comments yet. Be the first to comment!</Text>
                  ) : (
                    commentsModalPost.comments
                      .filter(c => !isBlockedBidirectional(c.userId, c.user))
                      .map(c => {
                      const commentTimeAgo = getTimeAgo(c.createdAt);
                      const commentUserObj = allUsers.find(u => u.uid === c.userId || u.name === c.user);
                      return (
                        <View key={c.id} style={styles.commentRow}>
                          <TouchableOpacity onPress={() => { setCommentsModalPost(null); openUserProfileById(c.userId, c.user); }} activeOpacity={0.85}>
                            {c.avatarUrl ? (
                              <Image source={{ uri: c.avatarUrl }} style={styles.commentAvatar} />
                            ) : (
                              <View style={[styles.commentAvatarPlaceholder, themedStyles.commentAvatarPlaceholder]}>
                                <Text style={{ color: palette.accent, fontSize: 10, fontWeight: 'bold' }}>{c.user ? c.user[0].toUpperCase() : 'U'}</Text>
                              </View>
                            )}
                          </TouchableOpacity>
                          <View style={[styles.commentBubble, themedStyles.commentBubble]}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                              <TouchableOpacity onPress={() => { setCommentsModalPost(null); openUserProfileById(c.userId, c.user); }} activeOpacity={0.85}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                  <Text style={styles.commentUser}>{c.user}</Text>
                                  {commentUserObj?.isVip && <Ionicons name="checkmark-circle" size={12} color={palette.accent} />}
                                </View>
                              </TouchableOpacity>
                              <Text style={[styles.commentTimeText, themedStyles.commentTimeText]}>{commentTimeAgo}</Text>
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
                  <TouchableOpacity style={styles.commentSendBtn} onPress={() => handleAddCommentToPost(commentsModalPost.id)} activeOpacity={0.85}>
                    <Ionicons name="arrow-forward" size={16} color={palette.accentTextOnButton} />
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Zoomed Avatar Modal */}
      <Modal visible={!!zoomedAvatarUri} transparent={true} animationType="fade" onRequestClose={() => setZoomedAvatarUri(null)}>
        <View style={styles.zoomedAvatarOverlay}>
          <TouchableOpacity 
            style={[styles.closeZoomedBtn, themedStyles.closeZoomedBtn]} 
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

    </View>
  );
}

const createThemedStyles = (palette: ThemePalette) =>
  StyleSheet.create({
    container: { backgroundColor: palette.bgPrimary },
    appTitle: { color: palette.textPrimary },
    settingsBtn: { backgroundColor: palette.bgSurface, borderColor: palette.border },
    avatarLarge: { backgroundColor: palette.bgElevated },
    profileName: { color: palette.textPrimary },
    sportTagBadge: { backgroundColor: palette.bgElevated },
    profileCity: { color: palette.textMuted },
    unifiedUpgradeCard: { backgroundColor: palette.bgSurface },
    vipIconCircle: { backgroundColor: palette.bgElevated },
    vipBannerTitle: { color: palette.textPrimary },
    vipBannerSubtitle: { color: palette.textMuted },
    statsRow: { backgroundColor: palette.bgElevated, borderColor: palette.border },
    statLabel: { color: palette.textMuted },
    postsSectionHeader: { borderTopColor: palette.border },
    sectionTitle: { color: palette.textPrimary },
    emptyPostsBox: { backgroundColor: palette.bgElevated, borderColor: palette.border },
    emptyPostsText: { color: palette.textMuted },
    postThumbnailBox: { backgroundColor: palette.bgSurface },
    modalOverlayCenter: { backgroundColor: palette.modalOverlay },
    settingsModalContent: { backgroundColor: palette.bgSurface, borderColor: palette.border },
    modalContentHomeStyle: { backgroundColor: palette.bgPrimary, borderColor: palette.border },
    modalContentCenter: { backgroundColor: palette.bgSurface, borderColor: palette.border },
    modalTitle: { color: palette.textPrimary },
    closeHomeModalBtn: { backgroundColor: palette.bgSurface, borderColor: palette.border },
    igSettingItem: { borderBottomColor: palette.borderSubtle },
    igSettingItemToggle: { borderBottomColor: palette.borderSubtle },
    igSettingText: { color: palette.textPrimary },
    igSettingValue: { color: palette.textMuted },
    themeOptionBtn: { backgroundColor: palette.bgElevated, borderColor: palette.border },
    hubSectionCard: { backgroundColor: palette.bgElevated, borderColor: palette.border },
    hubSectionTitle: { color: palette.textPrimary },
    hubSectionDesc: { color: palette.textSecondary },
    hubActionBtnCancel: { backgroundColor: palette.dangerBg, borderColor: palette.danger },
    manageStoreSubBtn: { backgroundColor: palette.bgElevated, borderColor: palette.border },
    manageStoreSubText: { color: palette.textPrimary },
    billingNotice: { color: palette.textMuted },
    avatarEditPreview: { backgroundColor: palette.bgElevated },
    imagePickBtn: { backgroundColor: palette.bgElevated },
    imageRemoveBtn: { backgroundColor: palette.dangerBg, borderColor: palette.danger },
    label: { color: palette.textSecondary },
    input: { backgroundColor: palette.bgPrimary, borderColor: palette.border, color: palette.textPrimary },
    listItem: { backgroundColor: palette.bgPrimary, borderColor: palette.border },
    listAvatar: { backgroundColor: palette.bgElevated },
    listName: { color: palette.textPrimary },
    listCity: { color: palette.textMuted },
    removeFollowerBtn: { backgroundColor: palette.dangerBg, borderColor: palette.danger },
    unblockListBtn: { backgroundColor: palette.bgElevated, borderColor: palette.border },
    unblockListBtnText: { color: palette.textPrimary },
    profileFollowingBtn: { backgroundColor: palette.bgElevated },
    requestedFollowBtn: { backgroundColor: palette.bgElevated, borderWidth: 1, borderColor: palette.border },
    blockProfileBtn: { backgroundColor: palette.bgElevated, borderColor: palette.danger },
    unblockProfileBtn: { backgroundColor: palette.bgElevated, borderColor: palette.border },
    privateAccountBox: { backgroundColor: palette.bgElevated, borderColor: palette.border },
    privateAccountTitle: { color: palette.textPrimary },
    privateAccountText: { color: palette.textMuted },
    postCard: { backgroundColor: palette.bgSurface, borderColor: palette.border },
    postAvatarBox: { backgroundColor: palette.bgElevated },
    postUserName: { color: palette.textPrimary },
    postUserMeta: { color: palette.textMuted },
    postTime: { color: palette.textMuted },
    postText: { color: palette.textSecondary },
    postImageBox: { backgroundColor: palette.bgPrimary, borderColor: palette.border },
    postSportBadge: { backgroundColor: palette.bgElevated, borderColor: palette.border },
    postActionsRow: { borderTopColor: palette.border },
    actionText: { color: palette.textMuted },
    commentsModalContent: { backgroundColor: palette.bgSurface, borderColor: palette.border },
    commentAvatarPlaceholder: { backgroundColor: palette.bgElevated },
    commentBubble: { backgroundColor: palette.bgElevated },
    commentText: { color: palette.textSecondary },
    commentTimeText: { color: palette.textMuted },
    commentInputRow: { borderTopColor: palette.border },
    commentInput: { backgroundColor: palette.bgPrimary, borderColor: palette.border, color: palette.textPrimary },
    closeZoomedBtn: { backgroundColor: '#121215', borderColor: '#27272A' },
  });

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#09090B' },
  scrollContent: { padding: 20, paddingTop: 50, paddingBottom: 40 },
  commentBubble: { flex: 1, marginLeft: 10, padding: 10, borderRadius: 12 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  homeCategory: { color: '#EAB308', fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  appTitle: { color: '#FAFAFA', fontSize: 24, fontWeight: '900', fontStyle: 'italic', letterSpacing: 1 },

  editProfileBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EAB308', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  editProfileBtnText: { color: '#09090B', fontWeight: '900', fontSize: 12 },
  
  settingsBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#121215', borderWidth: 1, borderColor: '#27272A', justifyContent: 'center', alignItems: 'center' },

  settingsModalContent: { backgroundColor: '#121215', borderRadius: 28, padding: 20, borderWidth: 1, borderColor: '#27272A', width: '100%', maxWidth: 420, height: '88%', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.5, shadowRadius: 16, elevation: 12 },
  
  igSectionHeader: { color: '#71717A', fontSize: 13, fontWeight: '700', marginTop: 22, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  igSettingItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: '#18181B' },
  igSettingItemToggle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: '#18181B' },
  igSettingLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 10 },
  igSettingIcon: { marginRight: 14, width: 22, textAlign: 'center' },
  igSettingText: { color: '#FAFAFA', fontSize: 14, fontWeight: '500' },
  igSettingRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  igSettingValue: { color: '#71717A', fontSize: 12 },

  themeSelectorRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  themeOptionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 1 },
  themeOptionBtnActive: { backgroundColor: '#EAB308', borderColor: '#EAB308' },
  themeOptionText: { fontSize: 12, fontWeight: '700' },

  headerProfile: { alignItems: 'center', marginBottom: 16, paddingHorizontal: 20 },
  avatarLarge: { width: 84, height: 84, borderRadius: 42, backgroundColor: '#18181B', borderWidth: 2, borderColor: '#EAB308', justifyContent: 'center', alignItems: 'center', marginBottom: 10, overflow: 'hidden' },
  avatarImage: { width: '100%', height: '100%' },
  avatarLargeText: { color: '#EAB308', fontSize: 32, fontWeight: 'bold' },
  profileName: { color: '#FAFAFA', fontSize: 20, fontWeight: '900' },
  
  sportsTagsRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, marginVertical: 8 },
  sportTagBadge: { backgroundColor: '#18181B', borderWidth: 1, borderColor: '#EAB308', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  sportTagText: { color: '#EAB308', fontSize: 11, fontWeight: '700' },

  profileCity: { color: '#A1A1AA', fontSize: 13, marginTop: 4 },

  unifiedUpgradeCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#121215', borderWidth: 1, borderColor: '#EAB308', marginBottom: 16, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 16, shadowColor: '#EAB308', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4, elevation: 3 },
  vipBannerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  vipIconCircle: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#18181B', borderWidth: 1, borderColor: '#EAB308', justifyContent: 'center', alignItems: 'center' },
  vipBannerTitle: { color: '#FAFAFA', fontSize: 14, fontWeight: 'bold' },
  vipBannerSubtitle: { color: '#A1A1AA', fontSize: 11, marginTop: 1 },

  hubSectionCard: { backgroundColor: '#18181B', borderWidth: 1, borderColor: '#27272A', borderRadius: 14, padding: 16, marginBottom: 16 },
  hubSectionHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  hubSectionTitle: { color: '#FAFAFA', fontSize: 16, fontWeight: 'bold' },
  hubSectionDesc: { color: '#D4D4D8', fontSize: 12, lineHeight: 18, marginBottom: 14 },
  hubActionBtn: { backgroundColor: '#EAB308', borderRadius: 10, height: 42, justifyContent: 'center', alignItems: 'center' },
  hubActionBtnBlue: { backgroundColor: '#3B82F6', borderRadius: 10, height: 42, justifyContent: 'center', alignItems: 'center' },
  hubActionBtnCancel: { backgroundColor: '#271215', borderWidth: 1, borderColor: '#EF4444' },
  hubActionBtnText: { color: '#09090B', fontWeight: '900', fontSize: 13 },

  manageStoreSubBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#27272A', borderWidth: 1, borderColor: '#3F3F46', borderRadius: 12, height: 46, marginBottom: 14 },
  manageStoreSubText: { color: '#FAFAFA', fontWeight: 'bold', fontSize: 13 },

  billingNotice: { color: '#71717A', fontSize: 11, textAlign: 'center', marginBottom: 20, lineHeight: 16, paddingHorizontal: 10 },

  statsRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', backgroundColor: '#18181B', borderRadius: 16, borderWidth: 1, borderColor: '#27272A', paddingVertical: 14, paddingHorizontal: 20, marginBottom: 16 },
  statBox: { alignItems: 'center', flex: 1 },
  statNumber: { color: '#EAB308', fontSize: 18, fontWeight: '900' },
  statLabel: { color: '#A1A1AA', fontSize: 12, marginTop: 2, fontWeight: '600' },

  postsSectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 6, borderTopWidth: 1, borderTopColor: '#27272A', paddingTop: 14 },
  sectionTitle: { color: '#FAFAFA', fontSize: 15, fontWeight: '700' },
  
  postsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 2 },
  postThumbnailBox: { width: imageSize, height: imageSize, backgroundColor: '#121215', borderRadius: 8, overflow: 'hidden' },
  postThumbnailImage: { width: '100%', height: '100%' },
  videoBadgeOverlay: { position: 'absolute', top: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 10, width: 22, height: 22, justifyContent: 'center', alignItems: 'center' },

  emptyPostsBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 30, backgroundColor: '#18181B', borderRadius: 14, borderWidth: 1, borderColor: '#27272A' },
  emptyPostsText: { color: '#71717A', fontSize: 12, marginTop: 6 },

  privateAccountBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40, paddingHorizontal: 20, backgroundColor: '#18181B', borderRadius: 16, borderWidth: 1, borderColor: '#27272A', marginTop: 10 },
  privateAccountTitle: { color: '#FAFAFA', fontSize: 16, fontWeight: 'bold', marginBottom: 6 },
  privateAccountText: { color: '#A1A1AA', fontSize: 12, textAlign: 'center', lineHeight: 18 },

  modalOverlayCenter: { flex: 1, backgroundColor: 'rgba(9,9,11,0.85)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 },
  modalContentHomeStyle: { backgroundColor: '#09090B', borderRadius: 28, padding: 20, borderWidth: 1, borderColor: '#27272A', width: '100%', maxWidth: 420, height: '88%', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.5, shadowRadius: 16, elevation: 12 },
  modalContentCenter: { backgroundColor: '#121215', borderRadius: 28, padding: 20, borderWidth: 1, borderColor: '#27272A', width: '100%', maxWidth: 400, maxHeight: '85%', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 16, elevation: 10 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { color: '#FAFAFA', fontSize: 18, fontWeight: '800' },
  closeHomeModalBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#121215', borderWidth: 1, borderColor: '#27272A', justifyContent: 'center', alignItems: 'center' },

  editAvatarContainer: { alignItems: 'center', marginBottom: 20 },
  avatarEditPreview: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#18181B', borderWidth: 2, borderColor: '#EAB308', justifyContent: 'center', alignItems: 'center', marginBottom: 12, overflow: 'hidden' },
  imagePickBtn: { backgroundColor: '#18181B', borderWidth: 1, borderColor: '#EAB308', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  imagePickText: { color: '#EAB308', fontSize: 12, fontWeight: 'bold' },
  imageRemoveBtn: { backgroundColor: '#271215', borderWidth: 1, borderColor: '#EF4444', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  imageRemoveText: { color: '#EF4444', fontSize: 12, fontWeight: 'bold' },

  label: { color: '#D4D4D8', fontSize: 12, fontWeight: 'bold', marginBottom: 6 },
  input: { backgroundColor: '#09090B', borderWidth: 1, borderColor: '#27272A', borderRadius: 12, paddingHorizontal: 14, height: 46, color: '#FAFAFA', marginBottom: 14, fontSize: 13 },
  saveBtn: { backgroundColor: '#EAB308', borderRadius: 12, height: 48, justifyContent: 'center', alignItems: 'center', marginTop: 10, marginBottom: 20 },
  saveBtnText: { color: '#09090B', fontWeight: '900', fontSize: 15 },
  
  listItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#09090B', padding: 12, borderRadius: 14, marginBottom: 8, borderWidth: 1, borderColor: '#27272A' },
  listAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#18181B', justifyContent: 'center', alignItems: 'center', marginRight: 12, borderWidth: 1, borderColor: '#EAB308', overflow: 'hidden' },
  listName: { color: '#FAFAFA', fontSize: 14, fontWeight: '700' },
  listCity: { color: '#A1A1AA', fontSize: 11, marginTop: 2 },

  removeFollowerBtn: { backgroundColor: '#271215', borderWidth: 1, borderColor: '#EF4444', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  removeFollowerBtnText: { color: '#EF4444', fontSize: 11, fontWeight: 'bold' },

  unblockListBtn: { backgroundColor: '#27272A', borderWidth: 1, borderColor: '#52525B', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  unblockListBtnText: { color: '#FAFAFA', fontSize: 11, fontWeight: '700' },

  profileFollowBtn: { backgroundColor: '#EAB308', borderRadius: 12, height: 44, justifyContent: 'center', alignItems: 'center' },
  profileFollowBtnText: { color: '#09090B', fontWeight: '900', fontSize: 13 },
  profileFollowingBtn: { backgroundColor: '#18181B', borderWidth: 1, borderColor: '#EAB308' },
  profileFollowingBtnText: { color: '#EAB308' },
  requestedFollowBtn: { backgroundColor: '#27272A', borderWidth: 1, borderColor: '#52525B' },

  blockProfileBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', alignSelf: 'center', gap: 4, backgroundColor: '#18181B', borderWidth: 1, borderColor: '#EF4444', borderRadius: 8, height: 26, paddingHorizontal: 10 },
  blockProfileBtnText: { color: '#EF4444', fontWeight: '700', fontSize: 10 },
  unblockProfileBtn: { backgroundColor: '#27272A', borderColor: '#52525B' },

  postCard: { backgroundColor: '#121215', borderWidth: 1, borderColor: '#27272A', borderRadius: 20, padding: 16, marginBottom: 16 },
  postHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  postAvatarBox: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#18181B', borderWidth: 1, borderColor: '#EAB308', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  avatarImg: { width: '100%', height: '100%' },
  avatarLetterTextSmall: { color: '#EAB308', fontSize: 16, fontWeight: 'bold' },
  postUserInfo: { marginLeft: 10, flex: 1 },
  postUserName: { color: '#FAFAFA', fontSize: 14, fontWeight: '700' },
  postUserMeta: { color: '#A1A1AA', fontSize: 11 },
  postTime: { color: '#71717A', fontSize: 11 },
  postText: { color: '#E4E4E7', fontSize: 14, marginBottom: 12, lineHeight: 20 },
  postImageBox: { height: 280, backgroundColor: '#09090B', borderRadius: 14, overflow: 'hidden', marginBottom: 12, borderWidth: 1, borderColor: '#27272A' },
  postImageContent: { width: '100%', height: '100%' },

  postSportBadge: { backgroundColor: '#1F2937', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: '#374151' },
  postSportBadgeText: { color: '#EAB308', fontSize: 10, fontWeight: 'bold' },

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
  commentSendBtn: { backgroundColor: '#EAB308', width: 38, height: 42, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },

  zoomedAvatarOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center' },
  closeZoomedBtn: { position: 'absolute', top: Platform.OS === 'ios' ? 50 : 30, right: 20, zIndex: 30, backgroundColor: '#121215', width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#27272A' },
  zoomedAvatarImage: { width: width * 0.9, height: width * 0.9, resizeMode: 'contain', borderRadius: 20 }
});