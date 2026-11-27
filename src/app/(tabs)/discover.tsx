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
import * as ImagePicker from 'expo-image-picker';
import { useVideoPlayer, VideoView } from 'expo-video';
import { setAudioModeAsync } from 'expo-audio';
import {
  collection,
  onSnapshot,
  doc,
  updateDoc,
  arrayUnion,
  arrayRemove,
  setDoc,
  addDoc,
  query,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width } = Dimensions.get('window');

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
  isVip?: boolean;
  isPrivate?: boolean;
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

type ChatMessage = {
  id: string;
  senderId: string;
  senderName?: string;
  text: string;
  imageUrl?: string;
  videoUrl?: string;
  mediaType?: 'image' | 'video';
  time?: string;
  createdAt?: any;
};

type PendingMediaDraft = {
  uri: string;
  type: 'image' | 'video';
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

const isVideoFileExtension = (url?: string): boolean => {
  if (!url) return false;
  return /\.(?:mp4|mov|m4v|webm|3gp)(?:\?\S*)?$/i.test(url);
};

const resolveChatMedia = (msg: ChatMessage): {
  imageUri: string | null;
  videoUri: string | null;
} => {
  if (msg.mediaType === 'video' && msg.videoUrl) {
    return { imageUri: null, videoUri: msg.videoUrl };
  }
  if (msg.mediaType === 'image' && msg.imageUrl) {
    return { imageUri: msg.imageUrl, videoUri: null };
  }
  if (msg.videoUrl) {
    return { imageUri: null, videoUri: msg.videoUrl };
  }
  if (msg.imageUrl) {
    if (isVideoFileExtension(msg.imageUrl)) {
      return { imageUri: null, videoUri: msg.imageUrl };
    }
    return { imageUri: msg.imageUrl, videoUri: null };
  }
  return { imageUri: null, videoUri: null };
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

function ChatInlineVideoPlayer({ uri, active }: { uri: string; active: boolean }) {
  const player = useVideoPlayer(uri, p => {
    p.loop = false;
    p.staysActiveInBackground = false;
    p.muted = false;
  });

  useEffect(() => {
    if (!active) {
      try {
        player.pause();
      } catch (e) {}
    }
  }, [active, player]);

  useEffect(() => {
    return () => {
      try {
        player.pause();
      } catch (e) {}
    };
  }, [player]);

  return (
    <VideoView
      style={styles.chatInlineVideo}
      player={player}
      nativeControls={true}
      contentFit="contain"
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

  const [selectedUserModalId, setSelectedUserModalId] = useState<string | null>(null);
  const [targetProfileUser, setTargetProfileUser] = useState<UserProfile | null>(null);
  const [targetActiveModalList, setTargetActiveModalList] = useState<'followers' | 'following' | null>(null);

  const [chatModalVisible, setChatModalVisible] = useState(false);
  const [chatTargetUser, setChatTargetUser] = useState<UserProfile | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [pendingChatMedia, setPendingChatMedia] = useState<PendingMediaDraft | null>(null);
  const [sendingChatMedia, setSendingChatMedia] = useState(false);

  const [selectedPostModal, setSelectedPostModal] = useState<PostItem | null>(null);
  const [commentsModalPost, setCommentsModalPost] = useState<PostItem | null>(null);
  const [modalCommentInput, setModalCommentInput] = useState('');
  const [zoomedAvatarUri, setZoomedAvatarUri] = useState<string | null>(null);

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
    (async () => {
      try {
        const savedEmail = await AsyncStorage.getItem('@saved_user_email');
        if (isMounted && savedEmail) {
          const computedId = savedEmail.toLowerCase().replace(/[^a-z0-9]/g, '_');
          setCurrentUserId(computedId);
        }
      } catch (e) {
        console.error('Error reading saved user email in Discover:', e);
      }
    })();
    return () => {
      isMounted = false;
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

  useEffect(() => {
    if (!currentUserId || !chatTargetUser || !chatModalVisible) {
      setChatMessages([]);
      return;
    }

    const chatId = [currentUserId, chatTargetUser.uid].sort().join('_');
    const messagesRef = collection(db, 'chats', chatId, 'messages');
    const q = query(messagesRef, orderBy('createdAt', 'asc'));

    const unsubscribe = onSnapshot(q, snapshot => {
      const msgs: ChatMessage[] = snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...(docSnap.data() as any),
      }));
      setChatMessages(msgs);
    });

    return () => unsubscribe();
  }, [currentUserId, chatTargetUser, chatModalVisible]);

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

  const handlePickProfileChatMedia = async (mode: 'image' | 'video') => {
    if (!currentUserId || !chatTargetUser) return;
    if (isBlockedBidirectional(chatTargetUser.uid, chatTargetUser.name)) {
      Alert.alert('Messaging Blocked', 'You cannot send media to this user because a block is active.');
      return;
    }

    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission Needed', 'Please allow photo & video library access.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: mode === 'video' ? ['videos'] : ['images'],
        allowsEditing: false,
        quality: 0.75,
        videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
      });

      if (result.canceled || !result.assets || !result.assets[0]?.uri) return;

      setPendingChatMedia({
        uri: result.assets[0].uri,
        type: mode,
      });
    } catch (e) {
      console.error('Error picking media in profile chat:', e);
      Alert.alert('Error', 'Could not select media.');
    }
  };

  const handleSendMessage = async () => {
    const trimmedText = messageInput.trim();
    const mediaDraft = pendingChatMedia;

    if ((!trimmedText && !mediaDraft) || !currentUserId || !chatTargetUser) return;
    if (isBlockedBidirectional(chatTargetUser.uid, chatTargetUser.name)) {
      Alert.alert(
        'Messaging Blocked',
        'You cannot send messages to this user because one of you blocked the other.'
      );
      return;
    }

    const chatId = [currentUserId, chatTargetUser.uid].sort().join('_');
    const activeSenderName = currentUser?.name || 'Player';
    const previewText =
      trimmedText ||
      (mediaDraft?.type === 'video'
        ? 'Sent a video'
        : mediaDraft?.type === 'image'
        ? 'Sent a photo'
        : '');

    setMessageInput('');
    setPendingChatMedia(null);
    if (mediaDraft) setSendingChatMedia(true);

    try {
      const chatDocRef = doc(db, 'chats', chatId);
      await setDoc(
        chatDocRef,
        {
          participants: [currentUserId, chatTargetUser.uid],
          lastMessageText: previewText,
          lastUpdated: serverTimestamp(),
        },
        { merge: true }
      );

      const messagesRef = collection(db, 'chats', chatId, 'messages');
      await addDoc(messagesRef, {
        senderId: currentUserId,
        senderName: activeSenderName,
        text: trimmedText,
        ...(mediaDraft
          ? {
              mediaType: mediaDraft.type,
              ...(mediaDraft.type === 'video'
                ? { videoUrl: mediaDraft.uri }
                : { imageUrl: mediaDraft.uri }),
            }
          : {}),
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        createdAt: serverTimestamp(),
      });

      await addDoc(collection(db, 'users', chatTargetUser.uid, 'notifications'), {
        senderUid: currentUserId,
        type: 'message',
        message: `${activeSenderName} sent you a message: "${previewText.substring(0, 30)}" 💬`,
        createdAt: serverTimestamp(),
        status: 'unread',
      });
    } catch (e) {
      console.error('Error sending message:', e);
      Alert.alert('Error', 'Could not send message.');
    } finally {
      setSendingChatMedia(false);
    }
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
      } else {
        await updateDoc(targetRef, { followers: arrayUnion(currentUserId) });
        await updateDoc(myRef, { following: arrayUnion(targetProfileUser.uid) });
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
      `Block ${targetDisplayName}? You won't see each other's content or communicate with each other.`,
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

    const newComment: Comment = {
      id: Date.now().toString(),
      userId: currentUserId,
      user: currentUser?.name || 'Player',
      avatarUrl: currentUser?.avatar || '',
      text: text.trim(),
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
    chatModalVisible ||
    !!selectedPostModal ||
    !!commentsModalPost ||
    !!zoomedAvatarUri;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <Text style={styles.discoverCategory}>Discover</Text>
          <Text style={styles.appTitle}>
            World <Text style={{ color: '#EAB308' }}>Sports</Text>
          </Text>
        </View>

        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color="#71717A" style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search players by name, city, or sport..."
            placeholderTextColor="#52525B"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} style={{ padding: 4 }}>
              <Ionicons name="close-circle" size={18} color="#71717A" />
            </TouchableOpacity>
          )}
        </View>

        {vipAthletes.length > 0 && searchQuery === '' && (
          <View style={styles.vipFeaturedContainer}>
            <View style={styles.vipFeaturedHeader}>
              <Ionicons name="star" size={16} color="#EAB308" />
              <Text style={styles.vipFeaturedTitle}>Featured Gold VIP Athletes 🌟</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
              {vipAthletes.map(vipUser => (
                <TouchableOpacity
                  key={vipUser.uid}
                  style={styles.vipFeatureCard}
                  onPress={() => openUserProfileById(vipUser.uid, vipUser.name)}
                  activeOpacity={0.85}
                >
                  <View style={styles.vipFeatureAvatarBox}>
                    {vipUser.avatar ? (
                      <Image source={{ uri: vipUser.avatar }} style={styles.avatarImg} />
                    ) : (
                      <Text style={styles.avatarLetter}>{vipUser.name ? vipUser.name[0] : 'P'}</Text>
                    )}
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 }}>
                    <Text style={styles.vipFeatureName} numberOfLines={1}>
                      {vipUser.name}
                    </Text>
                    <Ionicons name="checkmark-circle" size={13} color="#EAB308" />
                  </View>
                  <Text style={styles.vipFeatureCity} numberOfLines={1}>
                    📍 {normalizeCity(vipUser.city)}
                    {vipUser.country ? `, ${vipUser.country}` : ', Israel'}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        <Text style={styles.sectionHeading}>Community Players </Text>

        {filteredUsers.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="people-outline" size={40} color="#52525B" />
            <Text style={styles.emptyText}>No players found matching your search.</Text>
          </View>
        ) : (
          filteredUsers.map(user => (
            <TouchableOpacity
              key={user.uid}
              style={styles.userCard}
              onPress={() => openUserProfileById(user.uid, user.name)}
              activeOpacity={0.85}
            >
              <View style={styles.userAvatarBox}>
                {user.avatar ? (
                  <Image source={{ uri: user.avatar }} style={styles.avatarImg} />
                ) : (
                  <Text style={styles.avatarLetter}>{user.name ? user.name[0] : 'P'}</Text>
                )}
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={styles.userName}>{user.name}</Text>
                  {user.isVip && <Ionicons name="checkmark-circle" size={14} color="#EAB308" />}
                  {user.isPrivate && <Ionicons name="lock-closed" size={12} color="#EF4444" />}
                </View>
                <Text style={styles.userMeta}>
                  📍 {normalizeCity(user.city)}
                  {user.country ? `, ${user.country}` : ', Israel'} | {user.age || 20} yrs
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#71717A" />
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
        <View style={styles.modalOverlayCenter}>
          <View style={styles.modalContentHomeStyle}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.discoverCategory}>PLAYER PROFILE</Text>
                <Text style={styles.appTitle}>
                  World <Text style={{ color: '#EAB308' }}>Sports</Text>
                </Text>
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
                    <Text style={styles.profileName}>{targetProfileUser.name}</Text>
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
                        📍 {normalizeCity(targetProfileUser.city)}, {targetProfileUser.country || 'Israel'} | Age:{' '}
                        {targetProfileUser.age || 20}
                      </Text>
                    </>
                  )}
                </View>

                {!isAnyBlockBetweenUs && (
                  <View style={styles.statsRow}>
                    <TouchableOpacity
                      style={styles.statBox}
                      onPress={() => setTargetActiveModalList('followers')}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.statNumber}>{targetProfileUser.followers?.length || 0}</Text>
                      <Text style={styles.statLabel}>Followers</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.statBox}
                      onPress={() => setTargetActiveModalList('following')}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.statNumber}>{targetProfileUser.following?.length || 0}</Text>
                      <Text style={styles.statLabel}>Following</Text>
                    </TouchableOpacity>

                    <View style={styles.statBox}>
                      <Text style={styles.statNumber}>{targetUserPosts.length}</Text>
                      <Text style={styles.statLabel}>Posts</Text>
                    </View>
                  </View>
                )}

                {targetProfileUser.uid !== currentUserId && currentUserId && (
                  <View style={{ marginBottom: 16, gap: 10 }}>
                    {!isAnyBlockBetweenUs && (
                      <View style={{ flexDirection: 'row', gap: 10 }}>
                        <TouchableOpacity
                          style={[
                            styles.profileFollowBtn,
                            isApprovedFollower && styles.profileFollowingBtn,
                            hasRequestedFollow && {
                              backgroundColor: '#27272A',
                              borderWidth: 1,
                              borderColor: '#52525B',
                            },
                            { flex: 1 },
                          ]}
                          onPress={handleToggleFollowTarget}
                          activeOpacity={0.85}
                        >
                          <Text
                            style={[
                              styles.profileFollowBtnText,
                              isApprovedFollower && styles.profileFollowingBtnText,
                              hasRequestedFollow && { color: '#FAFAFA' },
                            ]}
                          >
                            {isApprovedFollower
                              ? 'Following ✓'
                              : hasRequestedFollow
                              ? 'Requested ⏳'
                              : 'Follow Player 🤝'}
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.chatOpenBtn}
                          onPress={() => {
                            setPendingChatMedia(null);
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

                    {!isTargetBlockingMe && (
                      <TouchableOpacity
                        style={[styles.blockProfileBtn, isTargetBlockedByMe && styles.unblockProfileBtn]}
                        onPress={handleToggleBlockTargetUser}
                        activeOpacity={0.85}
                      >
                        <Ionicons
                          name={isTargetBlockedByMe ? 'person-add-outline' : 'ban-outline'}
                          size={12}
                          color={isTargetBlockedByMe ? '#FAFAFA' : '#EF4444'}
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
                        <Ionicons name="images-outline" size={32} color="#52525B" />
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
                  <View style={styles.privateAccountBox}>
                    <Ionicons name="lock-closed" size={40} color="#EAB308" style={{ marginBottom: 8 }} />
                    <Text style={styles.privateAccountTitle}>This Account is Private 🔒</Text>
                    <Text style={styles.privateAccountText}>
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
            style={styles.closeZoomedBtn}
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
              {(targetActiveModalList === 'followers' ? targetFollowersList : targetFollowingList)
                .filter(item => !isBlockedBidirectional(item.uid, item.name))
                .map(item => (
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
                        <Image
                          source={{ uri: item.avatar }}
                          style={{ width: 36, height: 36, borderRadius: 18 }}
                        />
                      ) : (
                        <Text style={{ color: '#EAB308', fontWeight: 'bold' }}>
                          {item.name ? item.name[0] : 'P'}
                        </Text>
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Text style={styles.listName}>{item.name}</Text>
                        {item.isVip && <Ionicons name="checkmark-circle" size={14} color="#EAB308" />}
                      </View>
                      <Text style={styles.listCity}>
                        📍 {normalizeCity(item.city)}
                        {item.country ? `, ${item.country}` : ', Israel'} | Age: {item.age || 'N/A'}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color="#71717A" />
                  </TouchableOpacity>
                ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={chatModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setPendingChatMedia(null);
          setChatModalVisible(false);
        }}
      >
        <View style={styles.modalOverlayCenter}>
          <View style={styles.modalContentCenter}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={styles.chatHeaderAvatarBox}>
                  {chatTargetUser?.avatar ? (
                    <Image source={{ uri: chatTargetUser.avatar }} style={styles.avatarImg} />
                  ) : (
                    <Text style={{ color: '#EAB308', fontWeight: 'bold' }}>
                      {chatTargetUser?.name ? chatTargetUser.name[0] : 'P'}
                    </Text>
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
              <TouchableOpacity
                onPress={() => {
                  setPendingChatMedia(null);
                  setChatModalVisible(false);
                }}
                activeOpacity={0.8}
              >
                <Ionicons name="close" size={24} color="#FAFAFA" />
              </TouchableOpacity>
            </View>

            {isBlockedBidirectional(chatTargetUser?.uid, chatTargetUser?.name) ? (
              <View style={{ paddingVertical: 30, alignItems: 'center' }}>
                <Ionicons name="ban" size={32} color="#EF4444" />
                <Text style={{ color: '#FAFAFA', fontWeight: '700', marginTop: 10 }}>
                  Messaging Unavailable
                </Text>
                <Text style={{ color: '#A1A1AA', fontSize: 12, textAlign: 'center', marginTop: 4 }}>
                  You cannot send or receive messages with this user while a block is active.
                </Text>
              </View>
            ) : (
              <>
                <ScrollView
                  style={{ maxHeight: 280 }}
                  contentContainerStyle={{ padding: 6 }}
                  showsVerticalScrollIndicator={false}
                >
                  {chatMessages.map(item => {
                    const isMe = item.senderId === currentUserId;
                    const { imageUri, videoUri } = resolveChatMedia(item);

                    return (
                      <View
                        key={item.id}
                        style={[
                          styles.chatBubbleRow,
                          isMe ? styles.chatBubbleRowRight : styles.chatBubbleRowLeft,
                        ]}
                      >
                        <View
                          style={[
                            styles.chatBubbleMsg,
                            isMe ? styles.chatBubbleMe : styles.chatBubbleOther,
                          ]}
                        >
                          {videoUri && (
                            <ChatInlineVideoPlayer
                              uri={videoUri}
                              active={chatModalVisible}
                            />
                          )}
                          {imageUri && (
                            <Image
                              source={{ uri: imageUri }}
                              style={styles.chatInlineImage}
                              resizeMode="cover"
                            />
                          )}
                          {!!item.text && (
                            <Text style={[styles.chatBubbleText, isMe && { color: '#09090B' }]}>
                              {item.text}
                            </Text>
                          )}
                          <Text style={[styles.chatBubbleTime, isMe && { color: '#3F3F46' }]}>
                            {item.time || getTimeAgo(item.createdAt)}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </ScrollView>

                {pendingChatMedia && (
                  <View style={styles.pendingMediaRow}>
                    {pendingChatMedia.type === 'video' ? (
                      <ChatInlineVideoPlayer
                        uri={pendingChatMedia.uri}
                        active={chatModalVisible}
                      />
                    ) : (
                      <Image
                        source={{ uri: pendingChatMedia.uri }}
                        style={styles.pendingMediaThumb}
                        resizeMode="cover"
                      />
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.pendingMediaLabel}>
                        {pendingChatMedia.type === 'video' ? '🎬 Video ready' : '🖼️ Photo ready'}
                      </Text>
                      <Text style={styles.pendingMediaSub}>Synced with Messages tab</Text>
                    </View>
                    <TouchableOpacity onPress={() => setPendingChatMedia(null)}>
                      <Ionicons name="close-circle" size={20} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                )}

                <View style={styles.chatInputRow}>
                  <TouchableOpacity
                    style={[styles.mediaPickBtn, sendingChatMedia && { opacity: 0.5 }]}
                    onPress={() => handlePickProfileChatMedia('image')}
                    disabled={sendingChatMedia}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="image-outline" size={18} color="#EAB308" />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.mediaPickBtn, sendingChatMedia && { opacity: 0.5 }]}
                    onPress={() => handlePickProfileChatMedia('video')}
                    disabled={sendingChatMedia}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="videocam-outline" size={18} color="#38BDF8" />
                  </TouchableOpacity>

                  <TextInput
                    style={styles.chatInputField}
                    placeholder={pendingChatMedia ? 'Add caption...' : 'Type a message...'}
                    placeholderTextColor="#52525B"
                    value={messageInput}
                    onChangeText={setMessageInput}
                  />
                  <TouchableOpacity
                    style={styles.chatSendBtn}
                    onPress={handleSendMessage}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="send" size={16} color="#09090B" />
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!selectedPostModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setSelectedPostModal(null)}
      >
        <View style={styles.modalOverlayCenter}>
          <View style={styles.modalContentHomeStyle}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Post Details 📷</Text>
              <TouchableOpacity
                onPress={() => setSelectedPostModal(null)}
                activeOpacity={0.8}
                style={styles.closeHomeModalBtn}
              >
                <Ionicons name="close" size={22} color="#FAFAFA" />
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
                    <View style={styles.postCard}>
                      <View style={styles.postHeader}>
                        <TouchableOpacity
                          style={styles.postAvatarBox}
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
                            <View style={styles.avatarPlaceholder}>
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
                              <Text style={styles.postUserName}>
                                {postOwner?.name ||
                                  selectedPostModal.userName ||
                                  selectedPostModal.authorName}
                              </Text>
                              {postOwner?.isVip && (
                                <Ionicons name="checkmark-circle" size={14} color="#EAB308" />
                              )}
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

                      <Text style={styles.postText}>
                        {selectedPostModal.caption || selectedPostModal.text}
                      </Text>

                      {selectedPostModal.imageUrl ? (
                        <View style={styles.postImageBox}>
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

                      <View style={styles.postActionsRow}>
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
                                ? '#EF4444'
                                : '#A1A1AA'
                            }
                          />
                          <Text
                            style={[
                              styles.actionText,
                              currentUserId &&
                                selectedPostModal.likesList?.includes(currentUserId) && {
                                  color: '#EF4444',
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
                          <Ionicons name="chatbubble-outline" size={18} color="#A1A1AA" />
                          <Text style={styles.actionText}>
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
        <View style={styles.modalOverlayCenter}>
          <View style={styles.commentsModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Comments 💬</Text>
              <TouchableOpacity
                onPress={() => setCommentsModalPost(null)}
                activeOpacity={0.8}
                style={styles.closeHomeModalBtn}
              >
                <Ionicons name="close" size={22} color="#FAFAFA" />
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
                        color: '#71717A',
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
                                <View style={styles.commentAvatarPlaceholder}>
                                  <Text
                                    style={{ color: '#EAB308', fontSize: 10, fontWeight: 'bold' }}
                                  >
                                    {c.user ? c.user[0].toUpperCase() : 'U'}
                                  </Text>
                                </View>
                              )}
                            </TouchableOpacity>
                            <View
                              style={{
                                flex: 1,
                                marginLeft: 10,
                                backgroundColor: '#18181B',
                                padding: 10,
                                borderRadius: 12,
                              }}
                            >
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
                                      <Ionicons name="checkmark-circle" size={12} color="#EAB308" />
                                    )}
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
                  <TouchableOpacity
                    style={styles.commentSendBtn}
                    onPress={() => handleAddCommentToPost(commentsModalPost.id, true)}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="send" size={14} color="#09090B" />
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
  unblockProfileBtnText: { color: '#FAFAFA' },

  chatOpenBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#EAB308',
    borderRadius: 12,
    height: 44,
    paddingHorizontal: 16,
  },
  chatOpenBtnText: { color: '#09090B', fontWeight: '900', fontSize: 13 },

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

  chatHeaderAvatarBox: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#18181B',
    borderWidth: 1,
    borderColor: '#EAB308',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  chatHeaderTitle: { color: '#FAFAFA', fontSize: 15, fontWeight: '700' },
  chatHeaderSubTitle: { color: '#EAB308', fontSize: 11, fontWeight: '600' },

  chatBubbleRow: { marginBottom: 10, flexDirection: 'row' },
  chatBubbleRowLeft: { justifyContent: 'flex-start' },
  chatBubbleRowRight: { justifyContent: 'flex-end' },
  chatBubbleMsg: { maxWidth: '78%', padding: 11, borderRadius: 16, borderWidth: 1 },
  chatBubbleOther: { backgroundColor: '#18181B', borderColor: '#27272A' },
  chatBubbleMe: { backgroundColor: '#EAB308', borderColor: '#EAB308' },
  chatInlineImage: { width: 190, height: 130, borderRadius: 10, marginBottom: 5 },
  chatInlineVideo: {
    width: 196,
    height: 136,
    borderRadius: 10,
    marginBottom: 5,
    backgroundColor: '#000',
  },
  chatBubbleText: { color: '#FAFAFA', fontSize: 13, fontWeight: '500' },
  chatBubbleTime: { color: '#A1A1AA', fontSize: 9, marginTop: 4, alignSelf: 'flex-end' },

  pendingMediaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#09090B',
    borderWidth: 1,
    borderColor: '#EAB30866',
    borderRadius: 12,
    padding: 8,
    marginBottom: 8,
  },
  pendingMediaThumb: { width: 46, height: 46, borderRadius: 8 },
  pendingMediaLabel: { color: '#FAFAFA', fontSize: 12, fontWeight: '800' },
  pendingMediaSub: { color: '#A1A1AA', fontSize: 10 },

  chatInputRow: {
    flexDirection: 'row',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#27272A',
    gap: 6,
    alignItems: 'center',
  },
  mediaPickBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#09090B',
    borderWidth: 1,
    borderColor: '#27272A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  chatInputField: {
    flex: 1,
    backgroundColor: '#09090B',
    borderWidth: 1,
    borderColor: '#27272A',
    borderRadius: 20,
    height: 42,
    color: '#FAFAFA',
    paddingHorizontal: 12,
    fontSize: 13,
  },
  chatSendBtn: {
    backgroundColor: '#EAB308',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },

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