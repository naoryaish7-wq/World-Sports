import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  ScrollView,
  Image,
  TouchableOpacity,
  Modal,
  Dimensions,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import { setAudioModeAsync } from 'expo-audio';
import {
  collection,
  onSnapshot,
  doc,
  addDoc,
  updateDoc,
  arrayUnion,
  arrayRemove,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { registerForPushNotificationsAsync } from '../../services/notificationService';

const { width } = Dimensions.get('window');

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
  imageUrl?: string;
  mediaType?: 'image' | 'video';
  caption?: string;
  text?: string;
  sport?: string;
  avatarUrl?: string;
  authorMeta?: string;
  likesList?: string[];
  comments?: Comment[];
  createdAt?: any;
};

const normalizeCity = (rawCity?: string): string => {
  const value = (rawCity || '').trim();
  if (!value) return 'Netanya';
  const lower = value.toLowerCase();
  if (value.includes('נתניה') || lower.includes('netanya')) return 'Netanya';
  if (value.includes('תל אביב') || lower.includes('tel aviv') || lower.includes('tel-aviv')) return 'Tel Aviv';
  if (value.includes('חיפה') || lower.includes('haifa')) return 'Haifa';
  if (value.includes('ראשון לציון') || lower.includes('rishon lezion') || lower.includes('rishon')) return 'Rishon LeZion';
  if (value.includes('ירושלים') || lower.includes('jerusalem')) return 'Jerusalem';
  if (value.includes('באר שבע') || lower.includes('beer sheva') || lower.includes('beersheva')) return 'Beer Sheva';
  return value.charAt(0).toUpperCase() + value.slice(1);
};

function PostVideoPlayer({ uri, isPaused }: { uri: string; isPaused: boolean }) {
  const player = useVideoPlayer(uri, p => {
    p.loop = true;
    p.staysActiveInBackground = false;
    p.muted = false;
    if (!isPaused) {
      try {
        p.play();
      } catch (e) {}
    }
  });

  useEffect(() => {
    try {
      if (isPaused) {
        player.pause();
      } else {
        player.play();
      }
    } catch (e) {}
  }, [isPaused, player]);

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
  const player = useVideoPlayer(uri, p => {
    p.loop = false;
    p.staysActiveInBackground = false;
    p.muted = true;
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

export default function DiscoverScreen() {
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [allPosts, setAllPosts] = useState<PostItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [themeMode, setThemeMode] = useState<ThemeMode>('dark');

  const [selectedUserModalId, setSelectedUserModalId] = useState<string | null>(null);
  const [targetProfileUser, setTargetProfileUser] = useState<UserProfile | null>(null);
  const [targetActiveModalList, setTargetActiveModalList] = useState<'followers' | 'following' | null>(null);

  const [selectedPostModal, setSelectedPostModal] = useState<PostItem | null>(null);
  const [commentsModalPost, setCommentsModalPost] = useState<PostItem | null>(null);
  const [modalCommentInput, setModalCommentInput] = useState('');
  const [zoomedAvatarUri, setZoomedAvatarUri] = useState<string | null>(null);

  const palette = themeMode === 'light' ? LIGHT_THEME : DARK_THEME;
  const themedStyles = useMemo(() => createThemedStyles(palette), [palette]);

  const blockedUsersList = Array.isArray(currentUser?.blockedUsers) ? currentUser.blockedUsers : [];

  useEffect(() => {
    setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: false,
      interruptionMode: 'mixWithOthers',
    }).catch(() => {});
  }, []);

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
          setThemeMode(savedTheme);
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
        console.error('Error reading saved user email or theme in Discover:', e);
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
    if (!currentUserId) return;

    const userRef = doc(db, 'users', currentUserId);
    const unsubscribe = onSnapshot(userRef, docSnap => {
      if (docSnap.exists()) {
        const nextUser: UserProfile = {
          uid: docSnap.id,
          ...(docSnap.data() as Omit<UserProfile, 'uid'>),
        };
        setCurrentUser(nextUser);
        if (nextUser.themeMode === 'light' || nextUser.themeMode === 'dark') {
          setThemeMode(nextUser.themeMode);
          AsyncStorage.setItem('@world_sports_theme_mode', nextUser.themeMode).catch(() => {});
        }
      } else {
        setCurrentUser(prev => {
          if (prev && prev.uid === currentUserId) return prev;
          return {
            uid: currentUserId,
            name: currentUserId,
            email: '',
            city: 'Netanya',
            country: 'Israel',
            blockedUsers: [],
          };
        });
      }
    });

    return () => unsubscribe();
  }, [currentUserId]);

  const isBlockedBidirectional = useCallback(
    (otherUserId?: string, otherUserName?: string): boolean => {
      const cleanName = (otherUserName || '').trim().toLowerCase();
      const resolvedOther = allUsers.find(
        u =>
          (otherUserId && u.uid === otherUserId) ||
          (cleanName && (u.name || '').trim().toLowerCase() === cleanName)
      );
      const resolvedUid = resolvedOther?.uid || otherUserId;
      if (!resolvedUid || resolvedUid === currentUserId) return false;

      const iBlockedThem = blockedUsersList.includes(resolvedUid);
      const theyBlockedMe =
        Array.isArray(resolvedOther?.blockedUsers) && currentUserId
          ? resolvedOther.blockedUsers.includes(currentUserId)
          : false;

      return iBlockedThem || theyBlockedMe;
    },
    [allUsers, blockedUsersList, currentUserId]
  );

  const sendPushNotificationToUser = useCallback(
    async (
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
    },
    [allUsers, currentUserId]
  );

  const createInAppNotification = useCallback(
    async (
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
        status: 'unread',
      });

      await sendPushNotificationToUser(targetUid, subTitle, message, {
        type,
        senderUid: currentUserId,
        ...extraData,
      });
    },
    [currentUserId, sendPushNotificationToUser]
  );

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'users'), snapshot => {
      const usersList: UserProfile[] = snapshot.docs.map(docSnap => ({
        uid: docSnap.id,
        ...(docSnap.data() as Omit<UserProfile, 'uid'>),
      }));
      setAllUsers(usersList);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'posts'), snapshot => {
      const postsList: PostItem[] = snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<PostItem, 'id'>),
      }));
      setAllPosts(postsList);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!selectedUserModalId) {
      setTargetProfileUser(null);
      setTargetActiveModalList(null);
      return;
    }

    const unsubscribe = onSnapshot(
      doc(db, 'users', selectedUserModalId),
      userSnap => {
        if (userSnap.exists()) {
          setTargetProfileUser({
            uid: userSnap.id,
            ...(userSnap.data() as Omit<UserProfile, 'uid'>),
          });
        }
      },
      e => {
        console.error('Error fetching target user in Discover:', e);
      }
    );

    return () => unsubscribe();
  }, [selectedUserModalId]);

  const targetUserPosts = useMemo(() => {
    if (!targetProfileUser) return [];
    if (isBlockedBidirectional(targetProfileUser.uid, targetProfileUser.name)) {
      return [];
    }
    return allPosts.filter(
      p =>
        p.userId === targetProfileUser.uid ||
        p.userName === targetProfileUser.name ||
        p.authorName === targetProfileUser.name
    );
  }, [targetProfileUser, allPosts, isBlockedBidirectional]);

  const openUserProfileById = (userId?: string, playerName?: string) => {
    const cleanPlayerName = (playerName || '').trim().toLowerCase();
    const myCurrentName = (currentUser?.name || '').trim().toLowerCase();

    if (
      (userId && currentUserId && userId === currentUserId) ||
      (cleanPlayerName && myCurrentName && cleanPlayerName === myCurrentName)
    ) {
      return;
    }

    setSelectedPostModal(null);
    setCommentsModalPost(null);
    setTargetActiveModalList(null);
    setSelectedUserModalId(null);

    setTimeout(() => {
      let found: UserProfile | undefined = undefined;
      if (userId) {
        found = allUsers.find(u => u.uid === userId);
      }
      if (!found && playerName) {
        found = allUsers.find(u => u.name?.toLowerCase() === cleanPlayerName);
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
    if (isBlockedBidirectional(targetProfileUser.uid, targetProfileUser.name)) {
      Alert.alert('Unavailable', 'You cannot follow this user because a block is active.');
      return;
    }

    const isApproved = targetProfileUser.followers?.includes(currentUserId);
    const hasRequested = targetProfileUser.pendingRequests?.includes(currentUserId);
    const isPrivateAccount = targetProfileUser.isPrivate === true;
    const activeFollowerName = currentUser?.name || 'Player';

    try {
      const myRef = doc(db, 'users', currentUserId);
      const targetRef = doc(db, 'users', targetProfileUser.uid);

      if (isApproved) {
        await updateDoc(targetRef, { followers: arrayRemove(currentUserId) });
        await updateDoc(myRef, { following: arrayRemove(targetProfileUser.uid) });
      } else if (hasRequested) {
        await updateDoc(targetRef, { pendingRequests: arrayRemove(currentUserId) });
      } else if (isPrivateAccount) {
        await updateDoc(targetRef, { pendingRequests: arrayUnion(currentUserId) });
        const reqMsg = `${activeFollowerName} requested to follow you. 🔒`;
        await createInAppNotification(
          targetProfileUser.uid,
          'follow_request',
          reqMsg,
          'Follow Request 🔒'
        );
      } else {
        await updateDoc(targetRef, { followers: arrayUnion(currentUserId) });
        await updateDoc(myRef, { following: arrayUnion(targetProfileUser.uid) });
        const followMsg = `${activeFollowerName} started following you! 🤝`;
        await createInAppNotification(
          targetProfileUser.uid,
          'new_follower',
          followMsg,
          'New Follower 🤝'
        );
      }
    } catch (error) {
      console.error('Error updating follow status:', error);
    }
  };

  const handleToggleBlockTargetUser = async () => {
    if (
      !targetProfileUser ||
      !currentUserId ||
      !targetProfileUser.uid ||
      targetProfileUser.uid === currentUserId
    ) {
      return;
    }

    const targetUid = targetProfileUser.uid;
    const targetDisplayName = targetProfileUser.name || 'this user';
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

      if (!hasLiked && post.userId && post.userId !== currentUserId) {
        const likerName = currentUser?.name || 'Player';
        const likeMsg = `${likerName} liked your post! ❤️`;
        await createInAppNotification(post.userId, 'post_like', likeMsg, 'New Like ❤️', {
          postId,
        });
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
      Alert.alert(
        'Blocked',
        'You cannot comment on posts from this user because a block is active.'
      );
      return;
    }

    const trimmedComment = text.trim();
    const commenterName = currentUser?.name || 'Player';

    const newComment: Comment = {
      id: Date.now().toString(),
      userId: currentUserId,
      user: commenterName,
      avatarUrl: currentUser?.avatar || '',
      text: trimmedComment,
      createdAt: serverTimestamp(),
    };

    try {
      const postRef = doc(db, 'posts', postId);
      const updatedComments = [...(post.comments || []), newComment];
      await updateDoc(postRef, { comments: updatedComments });

      if (isModal) {
        setModalCommentInput('');
        setCommentsModalPost(prev => (prev ? { ...prev, comments: updatedComments } : null));
      }
      if (selectedPostModal && selectedPostModal.id === postId) {
        setSelectedPostModal(prev => (prev ? { ...prev, comments: updatedComments } : null));
      }

      if (post.userId && post.userId !== currentUserId) {
        const commentMsg = `${commenterName} commented on your post: "${trimmedComment.slice(0, 60)}" 💬`;
        await createInAppNotification(post.userId, 'post_comment', commentMsg, 'New Comment 💬', {
          postId,
        });
      }
    } catch (e) {
      console.error('Error adding comment:', e);
    }
  };

  const filteredUsers = allUsers.filter(
    u =>
      u.uid !== currentUserId &&
      !isBlockedBidirectional(u.uid, u.name) &&
      (u.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.city?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.country?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (u.sports && u.sports.some(s => s.toLowerCase().includes(searchQuery.toLowerCase()))))
  );

  const vipAthletes = allUsers.filter(
    u => u.isVip && u.uid !== currentUserId && !isBlockedBidirectional(u.uid, u.name)
  );
  const targetSportsList =
    targetProfileUser?.sports || (targetProfileUser?.sport ? [targetProfileUser.sport] : ['Football']);

  const isViewingMyOwnProfile = !!currentUserId && targetProfileUser?.uid === currentUserId;
  const isTargetBlockedByMe = targetProfileUser?.uid
    ? blockedUsersList.includes(targetProfileUser.uid)
    : false;
  const isTargetBlockingMe =
    Array.isArray(targetProfileUser?.blockedUsers) && currentUserId
      ? targetProfileUser.blockedUsers.includes(currentUserId)
      : false;
  const isAnyBlockBetweenUs = !isViewingMyOwnProfile && (isTargetBlockedByMe || isTargetBlockingMe);

  const isApprovedFollower = targetProfileUser?.followers?.includes(currentUserId || '');
  const hasRequestedFollow = targetProfileUser?.pendingRequests?.includes(currentUserId || '');
  const isPrivateAccount = targetProfileUser?.isPrivate === true;

  const canViewPostsContent =
    !isAnyBlockBetweenUs && (isViewingMyOwnProfile || !isPrivateAccount || isApprovedFollower);

  const targetFollowersList = allUsers.filter(u => targetProfileUser?.followers?.includes(u.uid));
  const targetFollowingList = allUsers.filter(u => targetProfileUser?.following?.includes(u.uid));

  const isAnyModalCoveringFeed =
    !!selectedUserModalId ||
    !!targetActiveModalList ||
    !!selectedPostModal ||
    !!commentsModalPost ||
    !!zoomedAvatarUri;

  return (
    <View style={[styles.container, themedStyles.container]}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <Text style={styles.discoverCategory}>Discover</Text>
          <Text style={[styles.appTitle, themedStyles.appTitle]}>
            World <Text style={{ color: palette.accent }}>Sports</Text>
          </Text>
        </View>

        <View style={[styles.searchBox, themedStyles.searchBox]}>
          <Ionicons name="search" size={18} color={palette.textMuted} style={{ marginRight: 8 }} />
          <TextInput
            style={[styles.searchInput, themedStyles.searchInput]}
            placeholder="Search players by name, city, or sport..."
            placeholderTextColor={palette.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} style={{ padding: 4 }}>
              <Ionicons name="close-circle" size={18} color={palette.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {vipAthletes.length > 0 && searchQuery === '' && (
          <View style={[styles.vipFeaturedContainer, themedStyles.vipFeaturedContainer]}>
            <View style={styles.vipFeaturedHeader}>
              <Ionicons name="star" size={16} color={palette.accent} />
              <Text style={styles.vipFeaturedTitle}>Featured Gold VIP Athletes 🌟</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
              {vipAthletes.map(vipUser => (
                <TouchableOpacity
                  key={vipUser.uid}
                  style={[styles.vipFeatureCard, themedStyles.vipFeatureCard]}
                  onPress={() => openUserProfileById(vipUser.uid, vipUser.name)}
                  activeOpacity={0.85}
                >
                  <View style={[styles.vipFeatureAvatarBox, themedStyles.vipFeatureAvatarBox]}>
                    {vipUser.avatar ? (
                      <Image source={{ uri: vipUser.avatar }} style={styles.avatarImg} />
                    ) : (
                      <Text style={styles.avatarLetter}>{vipUser.name ? vipUser.name[0] : 'P'}</Text>
                    )}
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 }}>
                    <Text style={[styles.vipFeatureName, themedStyles.vipFeatureName]} numberOfLines={1}>
                      {vipUser.name}
                    </Text>
                    <Ionicons name="checkmark-circle" size={13} color={palette.accent} />
                  </View>
                  <Text style={[styles.vipFeatureCity, themedStyles.vipFeatureCity]} numberOfLines={1}>
                    📍 {normalizeCity(vipUser.city)}
                    {vipUser.country ? `, ${vipUser.country}` : ', Israel'}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        <Text style={[styles.sectionHeading, themedStyles.sectionHeading]}>Community Players </Text>

        {filteredUsers.length === 0 ? (
          <View style={[styles.emptyBox, themedStyles.emptyBox]}>
            <Ionicons name="people-outline" size={40} color={palette.textMuted} />
            <Text style={[styles.emptyText, themedStyles.emptyText]}>No players found matching your search.</Text>
          </View>
        ) : (
          filteredUsers.map(user => (
            <TouchableOpacity
              key={user.uid}
              style={[styles.userCard, themedStyles.userCard]}
              onPress={() => openUserProfileById(user.uid, user.name)}
              activeOpacity={0.85}
            >
              <View style={[styles.userAvatarBox, themedStyles.userAvatarBox]}>
                {user.avatar ? (
                  <Image source={{ uri: user.avatar }} style={styles.avatarImg} />
                ) : (
                  <Text style={styles.avatarLetter}>{user.name ? user.name[0] : 'P'}</Text>
                )}
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={[styles.userName, themedStyles.userName]}>{user.name}</Text>
                  {user.isVip && <Ionicons name="checkmark-circle" size={14} color={palette.accent} />}
                  {user.isPrivate && <Ionicons name="lock-closed" size={12} color={palette.danger} />}
                </View>
                <Text style={[styles.userMeta, themedStyles.userMeta]}>
                  📍 {normalizeCity(user.city)}
                  {user.country ? `, ${user.country}` : ', Israel'} | Age: {user.age || 20}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={palette.textMuted} />
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      <Modal
        visible={!!selectedUserModalId && !targetActiveModalList && !selectedPostModal && !commentsModalPost}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setSelectedUserModalId(null)}
      >
        <View style={[styles.modalOverlayCenter, themedStyles.modalOverlayCenter]}>
          <View style={[styles.modalContentHomeStyle, themedStyles.modalContentHomeStyle]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.discoverCategory}>PLAYER PROFILE</Text>
                <Text style={[styles.appTitle, themedStyles.appTitle]}>
                  World <Text style={{ color: palette.accent }}>Sports</Text>
                </Text>
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
                    style={[styles.avatarLarge, themedStyles.avatarLarge]}
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
                      <Text style={styles.avatarLargeText}>
                        {targetProfileUser.name ? targetProfileUser.name[0] : 'P'}
                      </Text>
                    )}
                  </TouchableOpacity>

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
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
                        📍 {normalizeCity(targetProfileUser.city)}, {targetProfileUser.country || 'Israel'} | Age: {' '}
                        {targetProfileUser.age || 20}
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
                      <Text style={styles.statNumber}>{targetProfileUser.followers?.length || 0}</Text>
                      <Text style={[styles.statLabel, themedStyles.statLabel]}>Followers</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.statBox}
                      onPress={() => setTargetActiveModalList('following')}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.statNumber}>{targetProfileUser.following?.length || 0}</Text>
                      <Text style={[styles.statLabel, themedStyles.statLabel]}>Following</Text>
                    </TouchableOpacity>

                    <View style={styles.statBox}>
                      <Text style={styles.statNumber}>{targetUserPosts.length}</Text>
                      <Text style={[styles.statLabel, themedStyles.statLabel]}>Posts</Text>
                    </View>
                  </View>
                )}

                {targetProfileUser.uid !== currentUserId && currentUserId && (
                  <View style={{ marginBottom: 16, gap: 10 }}>
                    {!isAnyBlockBetweenUs && (
                      <TouchableOpacity
                        style={[
                          styles.profileFollowBtn,
                          isApprovedFollower && [styles.profileFollowingBtn, themedStyles.profileFollowingBtn],
                          hasRequestedFollow && [styles.requestedBtn, themedStyles.requestedBtn],
                        ]}
                        onPress={handleToggleFollowTarget}
                        activeOpacity={0.85}
                      >
                        <Text
                          style={[
                            styles.profileFollowBtnText,
                            { color: palette.accentTextOnButton },
                            isApprovedFollower && styles.profileFollowingBtnText,
                            hasRequestedFollow && { color: palette.textPrimary },
                          ]}
                        >
                          {isApprovedFollower
                            ? 'Following ✓'
                            : hasRequestedFollow
                            ? 'Requested ⏳'
                            : 'Follow Player 🤝'}
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
                ) : canViewPostsContent ? (
                  <>
                    <View style={[styles.postsSectionHeader, themedStyles.postsSectionHeader]}>
                      <Ionicons name="grid-outline" size={18} color={palette.accent} />
                      <Text style={[styles.sectionTitle, themedStyles.sectionTitle]}>Player Posts</Text>
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
                            <TouchableOpacity
                              key={post.id}
                              style={[styles.postThumbnailBox, themedStyles.postThumbnailBox]}
                              onPress={() => setSelectedPostModal(post)}
                              activeOpacity={0.7}
                            >
                              {isVid ? (
                                <View
                                  style={[
                                    styles.postThumbnailImage,
                                    { backgroundColor: '#000', position: 'relative' },
                                  ]}
                                >
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
                    <Text style={[styles.privateAccountText, themedStyles.privateAccountText]}>
                      Follow this account to see their photos and videos.
                    </Text>
                  </View>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!zoomedAvatarUri}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setZoomedAvatarUri(null)}
      >
        <View style={styles.zoomedAvatarOverlay}>
          <TouchableOpacity
            style={[styles.closeZoomedBtn, themedStyles.closeZoomedBtn]}
            onPress={() => setZoomedAvatarUri(null)}
            activeOpacity={0.8}
          >
            <Ionicons name="close" size={24} color="#FAFAFA" />
          </TouchableOpacity>
          {zoomedAvatarUri && <Image source={{ uri: zoomedAvatarUri }} style={styles.zoomedAvatarImage} />}
        </View>
      </Modal>

      <Modal
        visible={!!targetActiveModalList}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setTargetActiveModalList(null)}
      >
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
                .filter(item => !isBlockedBidirectional(item.uid, item.name))
                .map(item => (
                  <TouchableOpacity
                    key={item.uid}
                    style={[styles.listItem, themedStyles.listItem]}
                    onPress={() => {
                      setTargetActiveModalList(null);
                      setSelectedUserModalId(null);
                      setTimeout(() => {
                        openUserProfileById(item.uid, item.name);
                      }, 50);
                    }}
                    activeOpacity={0.85}
                  >
                    <View style={[styles.listAvatar, themedStyles.listAvatar]}>
                      {item.avatar ? (
                        <Image
                          source={{ uri: item.avatar }}
                          style={{ width: 36, height: 36, borderRadius: 18 }}
                        />
                      ) : (
                        <Text style={{ color: palette.accent, fontWeight: 'bold' }}>
                          {item.name ? item.name[0] : 'P'}
                        </Text>
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Text style={[styles.listName, themedStyles.listName]}>{item.name}</Text>
                        {item.isVip && <Ionicons name="checkmark-circle" size={14} color={palette.accent} />}
                      </View>
                      <Text style={[styles.listCity, themedStyles.listCity]}>
                        📍 {normalizeCity(item.city)}
                        {item.country ? `, ${item.country}` : ', Israel'} | Age: {item.age || 'N/A'}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={palette.textMuted} />
                  </TouchableOpacity>
                ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!selectedPostModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setSelectedPostModal(null)}
      >
        <View style={[styles.modalOverlayCenter, themedStyles.modalOverlayCenter]}>
          <View style={[styles.modalContentHomeStyle, themedStyles.modalContentHomeStyle]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, themedStyles.modalTitle]}>Post Details 📷</Text>
              <TouchableOpacity
                onPress={() => setSelectedPostModal(null)}
                activeOpacity={0.8}
                style={[styles.closeHomeModalBtn, themedStyles.closeHomeModalBtn]}
              >
                <Ionicons name="close" size={22} color={palette.textPrimary} />
              </TouchableOpacity>
            </View>

            {selectedPostModal &&
              (() => {
                const postOwner = allUsers.find(
                  u =>
                    u.uid === selectedPostModal.userId ||
                    u.name === selectedPostModal.userName ||
                    u.name === selectedPostModal.authorName
                );
                const isVid = selectedPostModal.mediaType === 'video';

                return (
                  <ScrollView
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ paddingBottom: 30 }}
                    nestedScrollEnabled={true}
                  >
                    <View style={[styles.postCard, themedStyles.postCard]}>
                      <View style={styles.postHeader}>
                        <TouchableOpacity
                          style={[styles.postAvatarBox, themedStyles.postAvatarBox]}
                          onPress={() => {
                            setSelectedPostModal(null);
                            openUserProfileById(
                              selectedPostModal.userId,
                              postOwner?.name || selectedPostModal.userName
                            );
                          }}
                          activeOpacity={0.85}
                        >
                          {postOwner?.avatar || selectedPostModal.avatarUrl ? (
                            <Image
                              source={{ uri: postOwner?.avatar || selectedPostModal.avatarUrl }}
                              style={styles.avatarImg}
                            />
                          ) : (
                            <View style={[styles.avatarPlaceholder, themedStyles.avatarPlaceholder]}>
                              <Text style={styles.avatarPlaceholderText}>
                                {postOwner?.name ? postOwner.name[0].toUpperCase() : 'P'}
                              </Text>
                            </View>
                          )}
                        </TouchableOpacity>

                        <View style={styles.postUserInfo}>
                          <TouchableOpacity
                            onPress={() => {
                              setSelectedPostModal(null);
                              openUserProfileById(
                                selectedPostModal.userId,
                                postOwner?.name || selectedPostModal.userName
                              );
                            }}
                            activeOpacity={0.85}
                          >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                              <Text style={[styles.postUserName, themedStyles.postUserName]}>
                                {postOwner?.name ||
                                  selectedPostModal.userName ||
                                  selectedPostModal.authorName}
                              </Text>
                              {postOwner?.isVip && (
                                <Ionicons name="checkmark-circle" size={14} color={palette.accent} />
                              )}
                            </View>
                          </TouchableOpacity>
                        </View>

                        {selectedPostModal.sport && (
                          <View style={[styles.sportBadge, themedStyles.sportBadge]}>
                            <Text style={styles.sportBadgeText}>{selectedPostModal.sport}</Text>
                          </View>
                        )}
                        <Text style={[styles.postTime, themedStyles.postTime]}>{getTimeAgo(selectedPostModal.createdAt)}</Text>
                      </View>

                      <Text style={[styles.postText, themedStyles.postText]}>
                        {selectedPostModal.caption || selectedPostModal.text}
                      </Text>

                      {selectedPostModal.imageUrl ? (
                        <View style={[styles.postImageBox, themedStyles.postImageBox]}>
                          {isVid ? (
                            <PostVideoPlayer
                              key={`modal_disc_${selectedPostModal.id}`}
                              uri={selectedPostModal.imageUrl}
                              isPaused={!selectedPostModal || isAnyModalCoveringFeed === false}
                            />
                          ) : (
                            <Image source={{ uri: selectedPostModal.imageUrl }} style={styles.postImageContent} />
                          )}
                        </View>
                      ) : null}

                      <View style={[styles.postActionsRow, themedStyles.postActionsRow]}>
                        <TouchableOpacity
                          style={styles.actionBtn}
                          onPress={() => toggleLike(selectedPostModal.id)}
                          activeOpacity={0.7}
                        >
                          <Ionicons
                            name={
                              currentUserId && selectedPostModal.likesList?.includes(currentUserId)
                                ? 'heart'
                                : 'heart-outline'
                            }
                            size={20}
                            color={
                              currentUserId && selectedPostModal.likesList?.includes(currentUserId)
                                ? palette.danger
                                : palette.textMuted
                            }
                          />
                          <Text
                            style={[
                              styles.actionText,
                              themedStyles.actionText,
                              currentUserId &&
                                selectedPostModal.likesList?.includes(currentUserId) && {
                                  color: palette.danger,
                                  fontWeight: 'bold',
                                },
                            ]}
                          >
                            {selectedPostModal.likesList?.length || 0} Likes
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.actionBtn}
                          onPress={() => {
                            setSelectedPostModal(null);
                            setCommentsModalPost(selectedPostModal);
                          }}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="chatbubble-outline" size={18} color={palette.textMuted} />
                          <Text style={[styles.actionText, themedStyles.actionText]}>
                            {selectedPostModal.comments?.length || 0} Comments
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </ScrollView>
                );
              })()}
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!commentsModalPost}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setCommentsModalPost(null)}
      >
        <View style={[styles.modalOverlayCenter, themedStyles.modalOverlayCenter]}>
          <View style={[styles.commentsModalContent, themedStyles.commentsModalContent]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, themedStyles.modalTitle]}>Comments 💬</Text>
              <TouchableOpacity
                onPress={() => setCommentsModalPost(null)}
                activeOpacity={0.8}
                style={[styles.closeHomeModalBtn, themedStyles.closeHomeModalBtn]}
              >
                <Ionicons name="close" size={22} color={palette.textPrimary} />
              </TouchableOpacity>
            </View>

            {commentsModalPost && (
              <View style={{ flex: 1, width: '100%' }}>
                <ScrollView
                  style={{ flex: 1 }}
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={{ paddingBottom: 15 }}
                >
                  {commentsModalPost.comments?.length === 0 ? (
                    <Text
                      style={{
                        color: palette.textMuted,
                        textAlign: 'center',
                        marginVertical: 30,
                        fontSize: 13,
                      }}
                    >
                      No comments yet. Be the first to comment!
                    </Text>
                  ) : (
                    commentsModalPost.comments
                      ?.filter(c => !isBlockedBidirectional(c.userId, c.user))
                      .map(c => {
                        const commentTimeAgo = getTimeAgo(c.createdAt);
                        const commentUserObj = allUsers.find(
                          u => u.uid === c.userId || u.name === c.user
                        );
                        return (
                          <View key={c.id} style={styles.commentRow}>
                            <TouchableOpacity
                              onPress={() => {
                                setCommentsModalPost(null);
                                openUserProfileById(c.userId, c.user);
                              }}
                              activeOpacity={0.85}
                            >
                              {c.avatarUrl ? (
                                <Image source={{ uri: c.avatarUrl }} style={styles.commentAvatar} />
                              ) : (
                                <View style={[styles.commentAvatarPlaceholder, themedStyles.commentAvatarPlaceholder]}>
                                  <Text
                                    style={{ color: palette.accent, fontSize: 10, fontWeight: 'bold' }}
                                  >
                                    {c.user ? c.user[0].toUpperCase() : 'U'}
                                  </Text>
                                </View>
                              )}
                            </TouchableOpacity>
                            <View style={[styles.commentBubble, themedStyles.commentBubble]}>
                              <View
                                style={{
                                  flexDirection: 'row',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  marginBottom: 2,
                                }}
                              >
                                <TouchableOpacity
                                  onPress={() => {
                                    setCommentsModalPost(null);
                                    openUserProfileById(c.userId, c.user);
                                  }}
                                  activeOpacity={0.85}
                                >
                                  <View
                                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                                  >
                                    <Text style={styles.commentUser}>{c.user}</Text>
                                    {commentUserObj?.isVip && (
                                      <Ionicons name="checkmark-circle" size={12} color={palette.accent} />
                                    )}
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
                  <TouchableOpacity
                    style={styles.commentSendBtn}
                    onPress={() => handleAddCommentToPost(commentsModalPost.id, true)}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="send" size={14} color={palette.accentTextOnButton} />
                  </TouchableOpacity>
                </View>
              </View>
            )}
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
    searchBox: { backgroundColor: palette.bgSurface, borderColor: palette.border },
    searchInput: { color: palette.textPrimary },
    vipFeaturedContainer: { backgroundColor: palette.bgSurface },
    vipFeatureCard: { backgroundColor: palette.bgPrimary, borderColor: palette.border },
    vipFeatureAvatarBox: { backgroundColor: palette.bgElevated },
    vipFeatureName: { color: palette.textPrimary },
    vipFeatureCity: { color: palette.textMuted },
    sectionHeading: { color: palette.textPrimary },
    userCard: { backgroundColor: palette.bgSurface, borderColor: palette.border },
    userAvatarBox: { backgroundColor: palette.bgElevated },
    userName: { color: palette.textPrimary },
    userMeta: { color: palette.textMuted },
    emptyBox: { backgroundColor: palette.bgSurface, borderColor: palette.border },
    emptyText: { color: palette.textMuted },
    modalOverlayCenter: { backgroundColor: palette.modalOverlay },
    modalContentHomeStyle: { backgroundColor: palette.bgPrimary, borderColor: palette.border },
    modalContentCenter: { backgroundColor: palette.bgSurface, borderColor: palette.border },
    closeHomeModalBtn: { backgroundColor: palette.bgSurface, borderColor: palette.border },
    avatarLarge: { backgroundColor: palette.bgElevated },
    profileName: { color: palette.textPrimary },
    sportTagBadge: { backgroundColor: palette.bgElevated },
    profileCity: { color: palette.textMuted },
    statsRow: { backgroundColor: palette.bgElevated, borderColor: palette.border },
    statLabel: { color: palette.textMuted },
    profileFollowingBtn: { backgroundColor: palette.bgElevated },
    requestedBtn: { backgroundColor: palette.bgElevated, borderWidth: 1, borderColor: palette.border },
    blockProfileBtn: { backgroundColor: palette.bgElevated, borderColor: palette.danger },
    unblockProfileBtn: { backgroundColor: palette.bgElevated, borderColor: palette.border },
    privateAccountBox: { backgroundColor: palette.bgElevated, borderColor: palette.border },
    privateAccountTitle: { color: palette.textPrimary },
    privateAccountText: { color: palette.textMuted },
    postsSectionHeader: { borderTopColor: palette.border },
    sectionTitle: { color: palette.textPrimary },
    emptyPostsBox: { backgroundColor: palette.bgElevated, borderColor: palette.border },
    emptyPostsText: { color: palette.textMuted },
    postThumbnailBox: { backgroundColor: palette.bgSurface },
    listItem: { backgroundColor: palette.bgPrimary, borderColor: palette.border },
    listAvatar: { backgroundColor: palette.bgElevated },
    listName: { color: palette.textPrimary },
    listCity: { color: palette.textMuted },
    postCard: { backgroundColor: palette.bgSurface, borderColor: palette.border },
    postAvatarBox: { backgroundColor: palette.bgElevated },
    avatarPlaceholder: { backgroundColor: palette.bgElevated },
    postUserName: { color: palette.textPrimary },
    sportBadge: { backgroundColor: palette.bgElevated, borderColor: palette.border },
    postTime: { color: palette.textMuted },
    postText: { color: palette.textSecondary },
    postImageBox: { backgroundColor: palette.bgPrimary, borderColor: palette.border },
    postActionsRow: { borderTopColor: palette.border },
    actionText: { color: palette.textMuted },
    commentsModalContent: { backgroundColor: palette.bgSurface, borderColor: palette.border },
    commentAvatarPlaceholder: { backgroundColor: palette.bgElevated },
    commentBubble: { backgroundColor: palette.bgElevated },
    commentUser: { color: palette.accent },
    commentText: { color: palette.textSecondary },
    commentTimeText: { color: palette.textMuted },
    commentInputRow: { borderTopColor: palette.border },
    commentInput: { backgroundColor: palette.bgPrimary, borderColor: palette.border, color: palette.textPrimary },
    closeZoomedBtn: { backgroundColor: palette.bgSurface, borderColor: palette.border },
  });

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#09090B' },
  scrollContent: { padding: 20, paddingTop: 50, paddingBottom: 40 },
  headerRow: { marginBottom: 16 },
  discoverCategory: { color: '#EAB308', fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  appTitle: {
    color: '#FAFAFA',
    fontSize: 24,
    fontWeight: '900',
    fontStyle: 'italic',
    letterSpacing: 1,
  },

  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#121215',
    borderWidth: 1,
    borderColor: '#27272A',
    borderRadius: 14,
    paddingHorizontal: 12,
    height: 44,
    marginBottom: 18,
  },
  searchInput: { flex: 1, color: '#FAFAFA', fontSize: 13 },

  vipFeaturedContainer: {
    marginBottom: 20,
    backgroundColor: '#121215',
    borderWidth: 1,
    borderColor: '#EAB308',
    borderRadius: 20,
    padding: 14,
  },
  vipFeaturedHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  vipFeaturedTitle: { color: '#EAB308', fontSize: 13, fontWeight: '700' },
  vipFeatureCard: {
    width: 90,
    alignItems: 'center',
    backgroundColor: '#09090B',
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: '#27272A',
  },
  vipFeatureAvatarBox: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#18181B',
    borderWidth: 2,
    borderColor: '#EAB308',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  vipFeatureName: { color: '#FAFAFA', fontSize: 12, fontWeight: '700' },
  vipFeatureCity: { color: '#A1A1AA', fontSize: 10, marginTop: 2 },

  sectionHeading: { color: '#FAFAFA', fontSize: 15, fontWeight: '700', marginBottom: 12 },

  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#121215',
    borderWidth: 1,
    borderColor: '#27272A',
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
  },
  userAvatarBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#18181B',
    borderWidth: 1,
    borderColor: '#EAB308',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarLetter: { color: '#EAB308', fontSize: 18, fontWeight: 'bold' },
  userName: { color: '#FAFAFA', fontSize: 14, fontWeight: '700' },
  userMeta: { color: '#A1A1AA', fontSize: 11, marginTop: 2 },

  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    backgroundColor: '#121215',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#27272A',
  },
  emptyText: { color: '#71717A', fontSize: 13, marginTop: 8 },

  modalOverlayCenter: {
    flex: 1,
    backgroundColor: 'rgba(9,9,11,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalContentHomeStyle: {
    backgroundColor: '#09090B',
    borderRadius: 28,
    padding: 20,
    borderWidth: 1,
    borderColor: '#27272A',
    width: '100%',
    maxWidth: 420,
    height: '88%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 12,
  },
  modalContentCenter: {
    backgroundColor: '#121215',
    borderRadius: 28,
    padding: 20,
    borderWidth: 1,
    borderColor: '#27272A',
    width: '100%',
    maxWidth: 400,
    maxHeight: '85%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 10,
  },
  closeHomeModalBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#121215',
    borderWidth: 1,
    borderColor: '#27272A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    width: '100%',
  },
  modalTitle: { color: '#FAFAFA', fontSize: 18, fontWeight: 'bold' },

  headerProfile: { alignItems: 'center', marginBottom: 16, paddingHorizontal: 20 },
  avatarLarge: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: '#18181B',
    borderWidth: 2,
    borderColor: '#EAB308',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
    overflow: 'hidden',
  },
  avatarImage: { width: '100%', height: '100%' },
  avatarLargeText: { color: '#EAB308', fontSize: 32, fontWeight: 'bold' },
  profileName: { color: '#FAFAFA', fontSize: 20, fontWeight: '900' },

  sportsTagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
    marginVertical: 8,
  },
  sportTagBadge: {
    backgroundColor: '#18181B',
    borderWidth: 1,
    borderColor: '#EAB308',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  sportTagText: { color: '#EAB308', fontSize: 11, fontWeight: '700' },

  profileCity: { color: '#A1A1AA', fontSize: 13, marginTop: 4 },

  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: '#18181B',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#27272A',
    padding: 14,
    marginBottom: 16,
  },
  statBox: { alignItems: 'center' },
  statNumber: { color: '#EAB308', fontSize: 18, fontWeight: '900' },
  statLabel: { color: '#A1A1AA', fontSize: 12, marginTop: 2, fontWeight: '600' },

  postsSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: '#27272A',
    paddingTop: 14,
  },
  sectionTitle: { color: '#FAFAFA', fontSize: 15, fontWeight: '700' },

  postsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 2 },
  postThumbnailBox: {
    width: (width * 0.85) / 3 - 4,
    height: (width * 0.85) / 3 - 4,
    backgroundColor: '#121215',
    borderRadius: 8,
    overflow: 'hidden',
  },
  postThumbnailImage: { width: '100%', height: '100%' },
  videoBadgeOverlay: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 10,
    width: 22,
    height: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },

  emptyPostsBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 30,
    backgroundColor: '#18181B',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#27272A',
  },
  emptyPostsText: { color: '#71717A', fontSize: 12, marginTop: 6 },

  privateAccountBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
    backgroundColor: '#18181B',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#27272A',
    marginTop: 10,
  },
  privateAccountTitle: { color: '#FAFAFA', fontSize: 16, fontWeight: 'bold', marginBottom: 6 },
  privateAccountText: { color: '#A1A1AA', fontSize: 12, textAlign: 'center', lineHeight: 18 },

  profileFollowBtn: {
    backgroundColor: '#EAB308',
    borderRadius: 12,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileFollowBtnText: { color: '#09090B', fontWeight: '900', fontSize: 13 },
  profileFollowingBtn: { backgroundColor: '#18181B', borderWidth: 1, borderColor: '#EAB308' },
  profileFollowingBtnText: { color: '#EAB308' },

  blockProfileBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    gap: 4,
    backgroundColor: '#18181B',
    borderWidth: 1,
    borderColor: '#EF4444',
    borderRadius: 8,
    height: 26,
    paddingHorizontal: 10,
  },
  blockProfileBtnText: { color: '#EF4444', fontWeight: '700', fontSize: 10 },
  unblockProfileBtn: { backgroundColor: '#27272A', borderColor: '#52525B' },

  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#09090B',
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#27272A',
  },
  listAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#18181B',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#EAB308',
    overflow: 'hidden',
  },
  listName: { color: '#FAFAFA', fontSize: 14, fontWeight: 'bold' },
  listCity: { color: '#A1A1AA', fontSize: 11, marginTop: 2 },

  postCard: {
    backgroundColor: '#121215',
    borderWidth: 1,
    borderColor: '#27272A',
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
  },
  postHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  postAvatarBox: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#18181B',
    borderWidth: 1,
    borderColor: '#EAB308',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatarPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#18181B',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarPlaceholderText: { color: '#EAB308', fontSize: 14, fontWeight: 'bold' },
  postUserInfo: { marginLeft: 10, flex: 1 },
  postUserName: { color: '#FAFAFA', fontSize: 14, fontWeight: '700' },
  sportBadge: {
    backgroundColor: '#18181B',
    borderWidth: 1,
    borderColor: '#27272A',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
    marginRight: 8,
  },
  sportBadgeText: { color: '#EAB308', fontSize: 10, fontWeight: '700' },
  postTime: { color: '#71717A', fontSize: 11 },
  postText: { color: '#E4E4E7', fontSize: 14, marginBottom: 12, lineHeight: 20 },
  postImageBox: {
    height: 320,
    backgroundColor: '#09090B',
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#27272A',
    position: 'relative',
  },
  postImageContent: { width: '100%', height: '100%' },
  postActionsRow: {
    flexDirection: 'row',
    gap: 20,
    borderTopWidth: 1,
    borderTopColor: '#27272A',
    paddingTop: 12,
  },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionText: { color: '#A1A1AA', fontSize: 13, fontWeight: '600' },

  commentsModalContent: {
    backgroundColor: '#121215',
    borderRadius: 28,
    padding: 20,
    borderWidth: 1,
    borderColor: '#27272A',
    width: '100%',
    maxWidth: 400,
    height: '75%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 10,
  },
  commentRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  commentAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#EAB308',
    overflow: 'hidden',
  },
  commentAvatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#EAB308',
    backgroundColor: '#18181B',
    justifyContent: 'center',
    alignItems: 'center',
  },
  commentBubble: {
    flex: 1,
    marginLeft: 10,
    backgroundColor: '#18181B',
    padding: 10,
    borderRadius: 12,
  },
  commentUser: { color: '#EAB308', fontSize: 12, fontWeight: '700' },
  commentText: { color: '#D4D4D8', fontSize: 13 },
  commentTimeText: { color: '#71717A', fontSize: 10 },
  commentInputRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#27272A',
    paddingTop: 12,
    marginTop: 4,
  },
  commentInput: {
    flex: 1,
    backgroundColor: '#09090B',
    borderWidth: 1,
    borderColor: '#27272A',
    borderRadius: 12,
    height: 42,
    color: '#FAFAFA',
    paddingHorizontal: 12,
    fontSize: 13,
  },
  commentSendBtn: {
    backgroundColor: '#EAB308',
    width: 38,
    height: 42,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },

  zoomedAvatarOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeZoomedBtn: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 30,
    backgroundColor: '#121215',
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#27272A',
  },
  zoomedAvatarImage: { width: width * 0.9, height: width * 0.9, resizeMode: 'contain', borderRadius: 20 },
});