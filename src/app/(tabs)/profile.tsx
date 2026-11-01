import React, { useState, useRef, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Modal, Alert, TextInput, Image, Dimensions, TouchableWithoutFeedback, Platform, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { doc, collection, onSnapshot, updateDoc, setDoc, getDoc, arrayUnion, arrayRemove, query, where, getDocs, addDoc, orderBy } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import Purchases from 'react-native-purchases';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { useVideoPlayer, VideoView } from 'expo-video';

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
  isVip?: boolean;
  isPromoted?: boolean;
  promotedUntil?: any;
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

type ChatMessage = {
  id: string;
  senderId: string;
  text: string;
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
  
  const [privateAccount, setPrivateAccount] = useState(false);
  const [notificationsChat, setNotificationsChat] = useState(true);
  const [notificationsLikes, setNotificationsLikes] = useState(true);
  const [notificationsFollows, setNotificationsFollows] = useState(true);
  const [notificationsMatchActivity, setNotificationsMatchActivity] = useState(true);
  const [notificationsAdminActions, setNotificationsAdminActions] = useState(true);
  const [notificationsStoriesPosts, setNotificationsStoriesPosts] = useState(true);
  
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      setTick(t => t + 1);
    }, 60000);
    return () => clearInterval(timer);
  }, []);
  
  const [activeModalList, setActiveModalList] = useState<'followers' | 'following' | null>(null);
  const [targetActiveModalList, setTargetActiveModalList] = useState<'followers' | 'following' | null>(null);

  const [selectedUserModalId, setSelectedUserModalId] = useState<string | null>(null);
  const [targetProfileUser, setTargetProfileUser] = useState<UserProfile | null>(null);
  const [targetUserPosts, setTargetUserPosts] = useState<PostItem[]>([]);

  const [chatModalVisible, setChatModalVisible] = useState(false);
  const [chatTargetUser, setChatTargetUser] = useState<UserProfile | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [messageInput, setMessageInput] = useState('');

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

  const handleDoubleTap = (postId: string) => {
    const now = Date.now();
    const DOUBLE_TAP_DELAY = 300;
    const lastTap = lastTapRef.current[postId] || 0;

    if (now - lastTap < DOUBLE_TAP_DELAY) {
      toggleLikePost(postId);
    }
    lastTapRef.current[postId] = now;
  };

  useEffect(() => {
    if (!firebaseUser) return;

    const loadUserData = async () => {
      try {
        const userId = firebaseUser.email ? firebaseUser.email.toLowerCase().replace(/[^a-z0-9]/g, '_') : firebaseUser.uid;
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
            isVip: false,
            isPromoted: false,
            isPrivate: false,
            notifications_chat: true,
            notifications_likes: true,
            notifications_follows: true,
            notifications_matchActivity: true,
            notifications_adminActions: true,
            notifications_storiesPosts: true,
          }, { merge: true });
        }

        const unsubscribeUser = onSnapshot(userRef, (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data() as any;
            setCurrentUser({
              ...data,
              uid: docSnap.id,
            });
            setEditName(data.name || '');
            setEditAvatar(data.avatar || '');
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
  }, [targetProfileUser, currentUser]);

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
    }
  };

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

  const handlePurchaseProduct = async (productIdentifier: string, upgradeType: 'vip' | 'boost') => {
    if (!currentUser) return;

    const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

    try {
      if (Platform.OS === 'web' || isExpoGo) {
        const userRef = doc(db, 'users', currentUser.uid);
        if (upgradeType === 'vip') {
          await updateDoc(userRef, { isVip: true });
          Alert.alert('Gold VIP Activated! (Mock) 🌟', 'Welcome to VIP membership!');
        } else if (upgradeType === 'boost') {
          const promotionExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
          await updateDoc(userRef, { isPromoted: true, promotedUntil: promotionExpiry });
          Alert.alert('Spotlight Activated! (Mock) 🚀', 'Your profile is now boosted to the top for 24 hours!');
        }
        return;
      }

      const { customerInfo } = await Purchases.purchaseProduct(productIdentifier);
      
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

  const followersList = allUsers.filter(u => currentUser?.followers?.includes(u.uid));
  const followingList = allUsers.filter(u => currentUser?.following?.includes(u.uid));

  const targetFollowersList = allUsers.filter(u => targetProfileUser?.followers?.includes(u.uid));
  const targetFollowingList = allUsers.filter(u => targetProfileUser?.following?.includes(u.uid));

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
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
    });

    if (!result.canceled) {
      setEditAvatar(result.assets[0].uri);
    }
  };

  const handleSaveProfile = async () => {
    if (!currentUser) return;
    try {
      const userRef = doc(db, 'users', currentUser.uid);
      const newName = editName.trim();

      if (!newName) {
        Alert.alert('Error', 'Username cannot be empty.');
        return;
      }

      await updateDoc(userRef, {
        name: newName,
        avatar: editAvatar,
      });

      const postsQuery = query(collection(db, 'posts'), where('userId', '==', currentUser.uid));
      const postsSnapshot = await getDocs(postsQuery);
      const postUpdatePromises = postsSnapshot.docs.map(postDoc => 
        updateDoc(doc(db, 'posts', postDoc.id), {
          avatarUrl: editAvatar,
          userName: newName,
          authorName: newName
        })
      );
      await Promise.all(postUpdatePromises);

      setIsEditModalVisible(false);
      Alert.alert('Success', 'Profile updated successfully! 🚀');
    } catch (error) {
      console.error('Error updating profile:', error);
      Alert.alert('Error', 'Could not update profile.');
    }
  };

  const handleToggleFollowTarget = async () => {
    if (!targetProfileUser || !currentUser) return;
    
    const isApproved = targetProfileUser.followers?.includes(currentUser.uid);
    const hasRequested = targetProfileUser.pendingRequests?.includes(currentUser.uid);
    const isPrivateAccount = targetProfileUser.isPrivate === true;

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
        
        await addDoc(collection(db, 'users', targetProfileUser.uid, 'notifications'), {
          senderUid: currentUser.uid,
          type: 'follow_request',
          message: `${currentUser.name} requested to follow you.`,
          status: 'pending',
          createdAt: new Date()
        });

        setTargetProfileUser({
          ...targetProfileUser,
          pendingRequests: [...(targetProfileUser.pendingRequests || []), currentUser.uid]
        });
      } else {
        await updateDoc(targetRef, { followers: arrayUnion(currentUser.uid) });
        await updateDoc(myRef, { following: arrayUnion(targetProfileUser.uid) });
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
    } catch (e) {
      console.error('Error toggling like:', e);
    }
  };

  const handleAddCommentToPost = async (postId: string) => {
    if (!modalCommentInput.trim() || !currentUser) return;

    const allKnownPosts = [...userPosts, ...targetUserPosts];
    const post = allKnownPosts.find(p => p.id === postId) || commentsModalPost || selectedPostModal;
    if (!post) return;

    const newComment: Comment = {
      id: Date.now().toString(),
      userId: currentUser.uid,
      user: currentUser.name,
      avatarUrl: currentUser.avatar || '',
      text: modalCommentInput.trim(),
      createdAt: new Date()
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
  
  const isViewingMyOwnProfile = targetProfileUser?.uid === currentUser?.uid;
  const isApprovedFollower = targetProfileUser?.followers?.includes(currentUser?.uid || '');
  const hasRequestedFollow = targetProfileUser?.pendingRequests?.includes(currentUser?.uid || '');
  const isPrivateAccount = targetProfileUser?.isPrivate === true;

  const canViewFullProfile = isViewingMyOwnProfile || !isPrivateAccount || isApprovedFollower;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.homeCategory}>MY PROFILE</Text>
            <Text style={styles.appTitle}>World <Text style={{color: '#EAB308'}}>Sports</Text></Text>
          </View>

          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <TouchableOpacity style={styles.settingsBtn} onPress={() => setSettingsModalVisible(true)} activeOpacity={0.8}>
              <Ionicons name="settings-outline" size={16} color="#EAB308" />
            </TouchableOpacity>

            <TouchableOpacity style={styles.editProfileBtn} onPress={() => setIsEditModalVisible(true)} activeOpacity={0.8}>
              <Ionicons name="pencil" size={14} color="#09090B" style={{ marginRight: 4 }} />
              <Text style={styles.editProfileBtnText}>Edit</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.headerProfile}>
          <TouchableOpacity 
            style={styles.avatarLarge} 
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
            <Text style={styles.profileName}>{currentUser?.name || 'Loading...'}</Text>
            {currentUser?.isVip && <Ionicons name="checkmark-circle" size={18} color="#EAB308" />}
            {currentUser?.isPrivate && <Ionicons name="lock-closed" size={14} color="#EF4444" />}
          </View>
          
          <View style={styles.sportsTagsRow}>
            {userSportsList.map((sport, index) => (
              <View key={index} style={styles.sportTagBadge}>
                <Text style={styles.sportTagText}>🏅 {sport}</Text>
              </View>
            ))}
          </View>

          <Text style={styles.profileCity}>
            📍 {currentUser?.city || 'Netanya'}, {currentUser?.country || 'Israel'} | 🎂 Age: {currentUser?.age || 20}
          </Text>
        </View>

        <TouchableOpacity 
          style={styles.unifiedUpgradeCard} 
          onPress={() => setVipModalVisible(true)}
          activeOpacity={0.9}
        >
          <View style={styles.vipBannerLeft}>
            <View style={styles.vipIconCircle}>
              <Ionicons name="star" size={16} color="#EAB308" />
            </View>
            <View>
              <Text style={styles.vipBannerTitle}>Subscription & Upgrades Hub 🌟</Text>
              <Text style={styles.vipBannerSubtitle}>Manage VIP & Spotlight Boost</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#EAB308" />
        </TouchableOpacity>

        <View style={styles.statsRow}>
          <TouchableOpacity style={styles.statBox} onPress={() => setActiveModalList('followers')} activeOpacity={0.8}>
            <Text style={styles.statNumber}>{currentUser?.followers?.length || 0}</Text>
            <Text style={styles.statLabel}>Followers</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.statBox} onPress={() => setActiveModalList('following')} activeOpacity={0.8}>
            <Text style={styles.statNumber}>{currentUser?.following?.length || 0}</Text>
            <Text style={styles.statLabel}>Following</Text>
          </TouchableOpacity>

          <View style={styles.statBox}>
            <Text style={styles.statNumber}>{userPosts.length}</Text>
            <Text style={styles.statLabel}>Posts</Text>
          </View>
        </View>

        <View style={styles.postsSectionHeader}>
          <Ionicons name="grid-outline" size={18} color="#EAB308" />
          <Text style={styles.sectionTitle}>My Posts</Text>
        </View>

        {userPosts.length === 0 ? (
          <View style={styles.emptyPostsBox}>
            <Ionicons name="images-outline" size={32} color="#52525B" />
            <Text style={styles.emptyPostsText}>No posts shared yet.</Text>
          </View>
        ) : (
          <View style={styles.postsGrid}>
            {userPosts.map(post => {
              const isVid = post.mediaType === 'video';
              return (
                <TouchableOpacity key={post.id} style={styles.postThumbnailBox} onPress={() => setSelectedPostModal(post)} activeOpacity={0.9}>
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

      {/* מודל הגדרות */}
      <Modal visible={settingsModalVisible} animationType="slide" transparent={true} onRequestClose={() => setSettingsModalVisible(false)}>
        <View style={styles.modalOverlayCenter}>
          <View style={styles.settingsModalContent}>
            
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.homeCategory}>PREFERENCES</Text>
                <Text style={styles.modalTitle}>Settings and activity</Text>
              </View>
              <TouchableOpacity onPress={() => setSettingsModalVisible(false)} activeOpacity={0.8} style={styles.closeHomeModalBtn}>
                <Ionicons name="close" size={22} color="#FAFAFA" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>
              
              <Text style={styles.igSectionHeader}>Your account</Text>
              
              <TouchableOpacity style={styles.igSettingItem} onPress={() => { setSettingsModalVisible(false); setIsEditModalVisible(true); }} activeOpacity={0.7}>
                <View style={styles.igSettingLeft}>
                  <Ionicons name="person-outline" size={20} color="#FAFAFA" style={styles.igSettingIcon} />
                  <Text style={styles.igSettingText}>Edit Personal Profile</Text>
                </View>
                <View style={styles.igSettingRight}>
                  <Text style={styles.igSettingValue}>Name, photo</Text>
                  <Ionicons name="chevron-forward" size={16} color="#71717A" />
                </View>
              </TouchableOpacity>

              <TouchableOpacity style={styles.igSettingItem} onPress={() => { setSettingsModalVisible(false); setVipModalVisible(true); }} activeOpacity={0.7}>
                <View style={styles.igSettingLeft}>
                  <Ionicons name="star-outline" size={20} color="#EAB308" style={styles.igSettingIcon} />
                  <Text style={[styles.igSettingText, { color: '#EAB308' }]}>Gold VIP & Spotlight Subscriptions</Text>
                </View>
                <View style={styles.igSettingRight}>
                  <Text style={styles.igSettingValue}>{currentUser?.isVip ? 'Active 🌟' : 'Upgrade'}</Text>
                  <Ionicons name="chevron-forward" size={16} color="#71717A" />
                </View>
              </TouchableOpacity>

              <Text style={styles.igSectionHeader}>Who can see your content</Text>

              <View style={styles.igSettingItemToggle}>
                <View style={styles.igSettingLeft}>
                  <Ionicons name="lock-closed-outline" size={20} color="#22C55E" style={styles.igSettingIcon} />
                  <Text style={styles.igSettingText}>Private Account</Text>
                </View>
                <Switch 
                  value={privateAccount} 
                  onValueChange={handleTogglePrivacy}
                  trackColor={{ false: '#27272A', true: '#EAB308' }}
                  thumbColor={privateAccount ? '#FAFAFA' : '#71717A'}
                />
              </View>

              <Text style={styles.igSectionHeader}>Notification Preferences</Text>

              <View style={styles.igSettingItemToggle}>
                <View style={styles.igSettingLeft}>
                  <Ionicons name="chatbubble-outline" size={20} color="#3B82F6" style={styles.igSettingIcon} />
                  <Text style={styles.igSettingText}>Chat Messages</Text>
                </View>
                <Switch 
                  value={notificationsChat} 
                  onValueChange={(val) => handleUpdateNotificationPref('chat', val)}
                  trackColor={{ false: '#27272A', true: '#EAB308' }}
                  thumbColor={notificationsChat ? '#FAFAFA' : '#71717A'}
                />
              </View>

              <View style={styles.igSettingItemToggle}>
                <View style={styles.igSettingLeft}>
                  <Ionicons name="football-outline" size={20} color="#EAB308" style={styles.igSettingIcon} />
                  <Text style={styles.igSettingText}>Match Join / Leave Activity</Text>
                </View>
                <Switch 
                  value={notificationsMatchActivity} 
                  onValueChange={(val) => handleUpdateNotificationPref('matchActivity', val)}
                  trackColor={{ false: '#27272A', true: '#EAB308' }}
                  thumbColor={notificationsMatchActivity ? '#FAFAFA' : '#71717A'}
                />
              </View>

              <View style={styles.igSettingItemToggle}>
                <View style={styles.igSettingLeft}>
                  <Ionicons name="shield-outline" size={20} color="#EF4444" style={styles.igSettingIcon} />
                  <Text style={styles.igSettingText}>Admin Match Deletions</Text>
                </View>
                <Switch 
                  value={notificationsAdminActions} 
                  onValueChange={(val) => handleUpdateNotificationPref('adminActions', val)}
                  trackColor={{ false: '#27272A', true: '#EAB308' }}
                  thumbColor={notificationsAdminActions ? '#FAFAFA' : '#71717A'}
                />
              </View>

              <View style={styles.igSettingItemToggle}>
                <View style={styles.igSettingLeft}>
                  <Ionicons name="radio-outline" size={20} color="#A855F7" style={styles.igSettingIcon} />
                  <Text style={styles.igSettingText}>New Stories & Posts from Following</Text>
                </View>
                <Switch 
                  value={notificationsStoriesPosts} 
                  onValueChange={(val) => handleUpdateNotificationPref('storiesPosts', val)}
                  trackColor={{ false: '#27272A', true: '#EAB308' }}
                  thumbColor={notificationsStoriesPosts ? '#FAFAFA' : '#71717A'}
                />
              </View>

              <View style={styles.igSettingItemToggle}>
                <View style={styles.igSettingLeft}>
                  <Ionicons name="heart-outline" size={20} color="#EF4444" style={styles.igSettingIcon} />
                  <Text style={styles.igSettingText}>Likes & Comments</Text>
                </View>
                <Switch 
                  value={notificationsLikes} 
                  onValueChange={(val) => handleUpdateNotificationPref('likes', val)}
                  trackColor={{ false: '#27272A', true: '#EAB308' }}
                  thumbColor={notificationsLikes ? '#FAFAFA' : '#71717A'}
                />
              </View>

              <View style={styles.igSettingItemToggle}>
                <View style={styles.igSettingLeft}>
                  <Ionicons name="person-add-outline" size={20} color="#22C55E" style={styles.igSettingIcon} />
                  <Text style={styles.igSettingText}>New Followers</Text>
                </View>
                <Switch 
                  value={notificationsFollows} 
                  onValueChange={(val) => handleUpdateNotificationPref('follows', val)}
                  trackColor={{ false: '#27272A', true: '#EAB308' }}
                  thumbColor={notificationsFollows ? '#FAFAFA' : '#71717A'}
                />
              </View>

              <Text style={styles.igSectionHeader}>More info and support</Text>

              <TouchableOpacity style={styles.igSettingItem} onPress={() => Alert.alert('Help & Support', 'For assistance with World Sports, please contact us at support@worldsports.com')} activeOpacity={0.7}>
                <View style={styles.igSettingLeft}>
                  <Ionicons name="help-circle-outline" size={20} color="#FAFAFA" style={styles.igSettingIcon} />
                  <Text style={styles.igSettingText}>Help & Support</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#71717A" />
              </TouchableOpacity>

              <TouchableOpacity style={styles.igSettingItem} onPress={() => Alert.alert('About App', 'World Sports Hub v2.4.1\nAll rights reserved.')} activeOpacity={0.7}>
                <View style={styles.igSettingLeft}>
                  <Ionicons name="information-circle-outline" size={20} color="#FAFAFA" style={styles.igSettingIcon} />
                  <Text style={styles.igSettingText}>About App</Text>
                </View>
                <View style={styles.igSettingRight}>
                  <Text style={styles.igSettingValue}>v2.4.1</Text>
                  <Ionicons name="chevron-forward" size={16} color="#71717A" />
                </View>
              </TouchableOpacity>

              <Text style={styles.igSectionHeader}>Login & Actions</Text>

              <TouchableOpacity style={styles.igSettingItem} onPress={() => { setSettingsModalVisible(false); handleLogoutPress(); }} activeOpacity={0.7}>
                <View style={styles.igSettingLeft}>
                  <Ionicons name="log-out-outline" size={20} color="#EAB308" style={styles.igSettingIcon} />
                  <Text style={[styles.igSettingText, { color: '#EAB308', fontWeight: 'bold' }]}>Log out</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity style={styles.igSettingItem} onPress={() => { setSettingsModalVisible(false); handleDeleteAccountPress(); }} activeOpacity={0.7}>
                <View style={styles.igSettingLeft}>
                  <Ionicons name="trash-outline" size={20} color="#EF4444" style={styles.igSettingIcon} />
                  <Text style={[styles.igSettingText, { color: '#EF4444', fontWeight: 'bold' }]}>Delete Account Permanently</Text>
                </View>
              </TouchableOpacity>

            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* מודל חנות VIP */}
      <Modal visible={vipModalVisible} animationType="slide" transparent={true} onRequestClose={() => setVipModalVisible(false)}>
        <View style={styles.modalOverlayCenter}>
          <View style={styles.modalContentCenter}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Subscriptions Hub 🚀</Text>
              <TouchableOpacity onPress={() => setVipModalVisible(false)} activeOpacity={0.8} style={styles.closeHomeModalBtn}>
                <Ionicons name="close" size={22} color="#FAFAFA" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.hubSectionCard}>
                <View style={styles.hubSectionHeaderRow}>
                  <Ionicons name="star" size={22} color="#EAB308" />
                  <Text style={styles.hubSectionTitle}>Gold VIP Membership</Text>
                </View>
                <Text style={styles.hubSectionDesc}>Get verified gold badge, high visibility, priority in feeds & unlimited direct access ($9.99/mo).</Text>
                
                <TouchableOpacity 
                  style={[styles.hubActionBtn, currentUser?.isVip && styles.hubActionBtnCancel]} 
                  onPress={() => handlePurchaseProduct('world_sports_vip_monthly', 'vip')}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.hubActionBtnText, currentUser?.isVip && styles.hubActionBtnCancelText]}>
                    {currentUser?.isVip ? 'Cancel VIP Subscription ❌' : 'Subscribe to VIP 🌟'}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.hubSectionCard}>
                <View style={styles.hubSectionHeaderRow}>
                  <Ionicons name="rocket" size={22} color="#3B82F6" />
                  <Text style={styles.hubSectionTitle}>Spotlight Profile Boost</Text>
                </View>
                <Text style={styles.hubSectionDesc}>Pin your profile to the very top of the Discover feed for 24 hours to gain maximum player reach ($2.99).</Text>
                
                <TouchableOpacity 
                  style={[styles.hubActionBtnBlue, currentUser?.isPromoted && styles.hubActionBtnCancel]} 
                  onPress={() => handlePurchaseProduct('world_sports_spotlight_boost', 'boost')}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.hubActionBtnText, currentUser?.isPromoted && styles.hubActionBtnCancelText]}>
                    {currentUser?.isPromoted ? 'Remove Spotlight Boost ❌' : 'Activate Spotlight Boost 🚀'}
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.billingNotice}>
                🔒 All purchases and subscriptions are securely processed through your device's app store (Apple App Store / Google Play Billing) and can be managed anytime.
              </Text>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* מודל עריכת פרופיל */}
      <Modal visible={isEditModalVisible} animationType="slide" transparent={true} onRequestClose={() => setIsEditModalVisible(false)}>
        <View style={styles.modalOverlayCenter}>
          <View style={styles.modalContentCenter}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Profile ✏️</Text>
              <TouchableOpacity onPress={() => setIsEditModalVisible(false)} activeOpacity={0.8} style={styles.closeHomeModalBtn}>
                <Ionicons name="close" size={22} color="#FAFAFA" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.editAvatarContainer}>
                <View style={styles.avatarEditPreview}>
                  {editAvatar ? (
                    <Image source={{ uri: editAvatar }} style={styles.avatarImage} />
                  ) : (
                    <Text style={styles.avatarLargeText}>{editName ? editName[0] : 'P'}</Text>
                  )}
                </View>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity style={styles.imagePickBtn} onPress={pickImage} activeOpacity={0.8}>
                    <Text style={styles.imagePickText}>Change Photo</Text>
                  </TouchableOpacity>
                  {editAvatar ? (
                    <TouchableOpacity style={styles.imageRemoveBtn} onPress={() => setEditAvatar('')} activeOpacity={0.8}>
                      <Text style={styles.imageRemoveText}>Remove</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>

              <Text style={styles.label}>Username / Full Name</Text>
              <TextInput style={styles.input} value={editName} onChangeText={setEditName} placeholder="Username" placeholderTextColor="#52525B" />

              <TouchableOpacity style={styles.saveBtn} onPress={handleSaveProfile} activeOpacity={0.85}>
                <Text style={styles.saveBtnText}>Save Changes 🚀</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* מודל עוקבים / נעקבים שלי */}
      <Modal visible={!!activeModalList} animationType="slide" transparent={true} onRequestClose={() => setActiveModalList(null)}>
        <View style={styles.modalOverlayCenter}>
          <View style={styles.modalContentCenter}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {activeModalList === 'followers' ? 'Followers 👥' : 'Following 🤝'}
              </Text>
              <TouchableOpacity onPress={() => setActiveModalList(null)} activeOpacity={0.8} style={styles.closeHomeModalBtn}>
                <Ionicons name="close" size={22} color="#FAFAFA" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 350 }} showsVerticalScrollIndicator={false}>
              {(activeModalList === 'followers' ? followersList : followingList).map((item) => (
                <View key={item.uid} style={styles.listItem}>
                  <TouchableOpacity 
                    style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }} 
                    onPress={() => {
                      setActiveModalList(null); 
                      openUserProfileById(item.uid, item.name); 
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
                  </TouchableOpacity>

                  {activeModalList === 'followers' && (
                    <TouchableOpacity 
                      style={styles.removeFollowerBtn}
                      onPress={() => handleRemoveFollower(item.uid)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.removeFollowerBtnText}>Remove</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* מודל עוקבים / נעקבים של משתמש אחר */}
      <Modal visible={!!targetActiveModalList} animationType="slide" transparent={true} onRequestClose={() => setTargetActiveModalList(null)}>
        <View style={styles.modalOverlayCenter}>
          <View style={styles.modalContentCenter}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {targetActiveModalList === 'followers' ? 'Followers 👥' : 'Following 🤝'}
              </Text>
              <TouchableOpacity onPress={() => setTargetActiveModalList(null)} activeOpacity={0.8} style={styles.closeHomeModalBtn}>
                <Ionicons name="close" size={22} color="#FAFAFA" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 350 }} showsVerticalScrollIndicator={false}>
              {(targetActiveModalList === 'followers' ? targetFollowersList : targetFollowingList).map((item) => (
                <TouchableOpacity 
                  key={item.uid} 
                  style={styles.listItem} 
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

      {/* מודל פרופיל משתמש אחר */}
      <Modal visible={!!selectedUserModalId && !targetActiveModalList && !selectedPostModal && !commentsModalPost} animationType="slide" transparent={true} onRequestClose={() => setSelectedUserModalId(null)}>
        <View style={styles.modalOverlayCenter}>
          <View style={styles.modalContentHomeStyle}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.homeCategory}>PLAYER PROFILE</Text>
                <Text style={styles.appTitle}>World <Text style={{color: '#EAB308'}}>Sports</Text></Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedUserModalId(null)} activeOpacity={0.8} style={styles.closeHomeModalBtn}>
                <Ionicons name="close" size={22} color="#FAFAFA" />
              </TouchableOpacity>
            </View>

            {targetProfileUser && (
              <ScrollView showsVerticalScrollIndicator={false} nestedScrollEnabled={true}>
                <View style={styles.headerProfile}>
                  <TouchableOpacity 
                    style={styles.avatarLarge}
                    onPress={() => {
                      if (targetProfileUser.avatar) setZoomedAvatarUri(targetProfileUser.avatar);
                    }}
                    activeOpacity={0.7}
                  >
                    {targetProfileUser.avatar ? (
                      <Image source={{ uri: targetProfileUser.avatar }} style={styles.avatarImage} />
                    ) : (
                      <Text style={styles.avatarLargeText}>{targetProfileUser.name ? targetProfileUser.name[0] : 'P'}</Text>
                    )}
                  </TouchableOpacity>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={styles.profileName}>{targetProfileUser.name}</Text>
                    {targetProfileUser.isVip && <Ionicons name="checkmark-circle" size={18} color="#EAB308" />}
                    {targetProfileUser.isPrivate && <Ionicons name="lock-closed" size={14} color="#EF4444" />}
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

                {/* שורת הסטטיסטיקה מציגה תמיד את המספרים האמיתיים */}
                <View style={styles.statsRow}>
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
                    <Text style={styles.statNumber}>{targetProfileUser.followers?.length || 0}</Text>
                    <Text style={styles.statLabel}>Followers</Text>
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
                    <Text style={styles.statNumber}>{targetProfileUser.following?.length || 0}</Text>
                    <Text style={styles.statLabel}>Following</Text>
                  </TouchableOpacity>

                  <View style={styles.statBox}>
                    <Text style={styles.statNumber}>{targetUserPosts.length}</Text>
                    <Text style={styles.statLabel}>Posts</Text>
                  </View>
                </View>

                {!isViewingMyOwnProfile && (
                  <View style={{ flexDirection: 'row', gap: 10, marginVertical: 12 }}>
                    <TouchableOpacity 
                      style={[
                        styles.profileFollowBtn, 
                        isApprovedFollower && styles.profileFollowingBtn,
                        hasRequestedFollow && { backgroundColor: '#27272A', borderWidth: 1, borderColor: '#52525B' },
                        { flex: 1 }
                      ]} 
                      onPress={handleToggleFollowTarget}
                      activeOpacity={0.85}
                    >
                      <Text style={[
                        styles.profileFollowBtnText, 
                        isApprovedFollower && styles.profileFollowingBtnText,
                        hasRequestedFollow && { color: '#FAFAFA' }
                      ]}>
                        {isApprovedFollower ? 'Following ✓' : hasRequestedFollow ? 'Requested ⏳' : isPrivateAccount ? 'Request Follow 🤝' : 'Follow Player 🤝'}
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

                {canViewFullProfile ? (
                  <>
                    <View style={styles.postsSectionHeader}>
                      <Ionicons name="grid-outline" size={18} color="#EAB308" />
                      <Text style={styles.sectionTitle}>Posts</Text>
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
                            <TouchableOpacity key={post.id} style={styles.postThumbnailBox} onPress={() => setSelectedPostModal(post)} activeOpacity={0.9}>
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
                  <View style={styles.privateAccountBox}>
                    <Ionicons name="lock-closed" size={40} color="#EAB308" style={{ marginBottom: 8 }} />
                    <Text style={styles.privateAccountTitle}>This Account is Private 🔒</Text>
                    <Text style={styles.privateAccountText}>Follow this player to see their posts, stories, and connections.</Text>
                  </View>
                )}

              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* מודל צ'אט */}
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
                  <Text style={styles.chatHeaderSubTitle}>Chatting with {chatTargetUser?.name || 'Player'}</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setChatModalVisible(false)} activeOpacity={0.8} style={styles.closeHomeModalBtn}>
                <Ionicons name="close" size={24} color="#FAFAFA" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 280 }} contentContainerStyle={{ padding: 6 }} showsVerticalScrollIndicator={false}>
              {chatMessages.map(item => {
                const isMe = item.senderId === currentUser?.uid;
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

      {/* מודל פרטי פוסט */}
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
                      {postOwner?.avatar ? (
                        <Image source={{ uri: postOwner.avatar }} style={styles.avatarImg} />
                      ) : (
                        <Text style={styles.avatarLetterTextSmall}>{postOwner?.name ? postOwner.name[0].toUpperCase() : 'P'}</Text>
                      )}
                    </TouchableOpacity>
                    
                    <View style={styles.postUserInfo}>
                      <TouchableOpacity onPress={() => { setSelectedPostModal(null); openUserProfileById(selectedPostModal.userId, selectedPostModal.authorName || selectedPostModal.userName); }} activeOpacity={0.85}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={styles.postUserName}>{postOwner?.name || selectedPostModal.authorName || selectedPostModal.userName}</Text>
                          {postOwner?.isVip && <Ionicons name="checkmark-circle" size={14} color="#EAB308" />}
                          
                          <View style={styles.postSportBadge}>
                            <Text style={styles.postSportBadgeText}>⚽ Football</Text>
                          </View>
                        </View>
                      </TouchableOpacity>
                      <Text style={styles.postUserMeta}>Israel, {postOwner?.city || 'Netanya'}</Text>
                    </View>

                    <Text style={styles.postTime}>{getTimeAgo(selectedPostModal.createdAt)}</Text>
                  </View>

                  <Text style={styles.postText}>{selectedPostModal.caption || selectedPostModal.text}</Text>
                  
                  {selectedPostModal.imageUrl ? (
                    <TouchableWithoutFeedback onPress={() => handleDoubleTap(selectedPostModal.id)}>
                      <View style={styles.postImageBox}>
                        {selectedPostModal.mediaType === 'video' ? (
                          <PostVideoPlayer key={`modal_${selectedPostModal.id}`} uri={selectedPostModal.imageUrl} isStoryOpen={false} />
                        ) : (
                          <Image source={{ uri: selectedPostModal.imageUrl }} style={styles.postImageContent} />
                        )}
                      </View>
                    </TouchableWithoutFeedback>
                  ) : null}

                  <View style={styles.postActionsRow}>
                    <TouchableOpacity style={styles.actionBtn} onPress={() => toggleLikePost(selectedPostModal.id)} activeOpacity={0.7}>
                      <Ionicons 
                        name={selectedPostModal.isLiked ? "heart" : "heart-outline"} 
                        size={20} 
                        color={selectedPostModal.isLiked ? "#EF4444" : "#A1A1AA"} 
                      />
                      <Text style={[styles.actionText, selectedPostModal.isLiked && { color: '#EF4444', fontWeight: 'bold' }]}>
                        {selectedPostModal.likes || selectedPostModal.likesList?.length || 0} Likes
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.actionBtn} onPress={() => { const current = selectedPostModal; setSelectedPostModal(null); setCommentsModalPost(current); }} activeOpacity={0.7}>
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

      {/* מודל תגובות */}
      <Modal visible={!!commentsModalPost} animationType="slide" transparent={true} onRequestClose={() => setCommentsModalPost(null)}>
        <View style={styles.modalOverlayCenter}>
          <View style={styles.commentsModalContent}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={styles.modalTitle}>Comments</Text>
                <Ionicons name="chatbubble-ellipses-outline" size={18} color="#EAB308" />
              </View>
              <TouchableOpacity onPress={() => setCommentsModalPost(null)} activeOpacity={0.8} style={styles.closeHomeModalBtn}>
                <Ionicons name="close" size={22} color="#FAFAFA" />
              </TouchableOpacity>
            </View>

            {commentsModalPost && (
              <View style={{ flex: 1, width: '100%' }}>
                <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 15 }}>
                  {(!commentsModalPost.comments || commentsModalPost.comments.length === 0) ? (
                    <Text style={{ color: '#71717A', textAlign: 'center', marginVertical: 30, fontSize: 13 }}>No comments yet. Be the first to comment!</Text>
                  ) : (
                    commentsModalPost.comments.map(c => {
                      const commentTimeAgo = getTimeAgo(c.createdAt);
                      const commentUserObj = allUsers.find(u => u.uid === c.userId || u.name === c.user);
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
                  <TouchableOpacity style={styles.commentSendBtn} onPress={() => handleAddCommentToPost(commentsModalPost.id)} activeOpacity={0.85}>
                    <Ionicons name="arrow-forward" size={16} color="#09090B" />
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* מודל תמונת פרופיל מוגדלת */}
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

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#09090B' },
  scrollContent: { padding: 20, paddingTop: 50, paddingBottom: 40 },
  
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
  hubActionBtnCancelText: { color: '#EF4444' },

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

  profileFollowBtn: { backgroundColor: '#EAB308', borderRadius: 12, height: 44, justifyContent: 'center', alignItems: 'center' },
  profileFollowBtnText: { color: '#09090B', fontWeight: '900', fontSize: 13 },
  profileFollowingBtn: { backgroundColor: '#18181B', borderWidth: 1, borderColor: '#EAB308' },
  profileFollowingBtnText: { color: '#EAB308' },

  chatOpenBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#EAB308', borderRadius: 12, height: 44, paddingHorizontal: 16 },
  chatOpenBtnText: { color: '#09090B', fontWeight: '900', fontSize: 13 },

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
  closeZoomedBtn: { position: 'absolute', top: 50, right: 20, zIndex: 30, backgroundColor: '#121215', width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#27272A' },
  zoomedAvatarImage: { width: width * 0.9, height: width * 0.9, resizeMode: 'contain', borderRadius: 20 }
});