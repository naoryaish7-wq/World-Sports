import React, { useState, useRef, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Modal, FlatList, Alert, TextInput, Image, Dimensions, TouchableWithoutFeedback, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { doc, collection, onSnapshot, updateDoc, setDoc, getDoc, arrayUnion, arrayRemove, query, where, getDocs, addDoc, orderBy } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import Purchases from 'react-native-purchases'; // ייבוא ספריית התשלומים

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
  isVip?: boolean;
  isPromoted?: boolean;
  promotedUntil?: any;
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
  authorMeta?: string;
  likesList?: string[];
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

const { width } = Dimensions.get('window');
const imageSize = width / 3 - 2;

export default function ProfileScreen() {
  const { firebaseUser, logout, deleteAccount } = useAuth();
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [userPosts, setUserPosts] = useState<PostItem[]>([]);
  
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
  const [commentInput, setCommentInput] = useState('');

  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [editName, setEditName] = useState('');
  const [editAvatar, setEditAvatar] = useState('');

  const lastTapRef = useRef<{ [postId: string]: number }>({});

  const handleDoubleTap = (postId: string) => {
    const now = Date.now();
    const DOUBLE_TAP_DELAY = 300;
    const lastTap = lastTapRef.current[postId] || 0;

    if (now - lastTap < DOUBLE_TAP_DELAY) {
      toggleLikePost();
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
            isVip: false,
            isPromoted: false,
          }, { merge: true });
        }

        const unsubscribeUser = onSnapshot(userRef, (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data() as UserProfile;
            setCurrentUser({
              ...data,
              uid: docSnap.id,
            });
            setEditName(data.name || '');
            setEditAvatar(data.avatar || '');
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

    const fetchUserPosts = async () => {
      try {
        const postsRef = collection(db, 'posts');
        const unsubscribe = onSnapshot(postsRef, (snapshot) => {
          const allPosts: PostItem[] = snapshot.docs.map(docSnap => ({
            id: docSnap.id,
            ...(docSnap.data() as Omit<PostItem, 'id'>)
          }));

          const filtered = allPosts.filter(p => 
            p.userId === currentUser.uid || 
            p.userEmail === currentUser.email || 
            p.userName === currentUser.name ||
            p.authorName === currentUser.name
          );

          setUserPosts(filtered);
        });

        return () => unsubscribe();
      } catch (e) {
        console.error('Error fetching user posts:', e);
      }
    };

    fetchUserPosts();
  }, [currentUser]);

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

  // פונקציית רכישה מעודכנת דרך RevenueCat
  const handlePurchaseProduct = async (productIdentifier: string, upgradeType: 'vip' | 'boost') => {
    if (!currentUser) return;

    try {
      // פתיחת חלון הרכישה של RevenueCat מול החנות
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
        Alert.alert('שגיאה ברכישה', error.message || 'Could not complete the transaction.');
      }
    }
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
      setActiveModalList(null);
      setTargetActiveModalList(null);
      setSelectedUserModalId(null);
      return;
    }

    setSelectedPostModal(null);
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
    }, 60);
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

  const postOwner = allUsers.find(u => 
    u.uid === selectedPostModal?.userId || 
    u.name === selectedPostModal?.userName || 
    u.name === selectedPostModal?.authorName
  ) || currentUser;

  const userSportsList = currentUser?.sports || (currentUser?.sport ? [currentUser.sport] : ['Football']);
  const targetSportsList = targetProfileUser?.sports || (targetProfileUser?.sport ? [targetProfileUser.sport] : ['Football']);
  const isFollowingTarget = targetProfileUser?.followers?.includes(currentUser?.uid || '');
  const isViewingMyOwnProfile = targetProfileUser?.uid === currentUser?.uid;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* Top Action Buttons Row */}
        <View style={styles.topActionsRow}>
          <TouchableOpacity style={styles.editProfileBtn} onPress={() => setIsEditModalVisible(true)} activeOpacity={0.8}>
            <Ionicons name="pencil" size={14} color="#000" style={{ marginRight: 4 }} />
            <Text style={styles.editProfileBtnText}>Edit Profile</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingsBtn} onPress={() => setSettingsModalVisible(true)} activeOpacity={0.8}>
            <Ionicons name="settings-outline" size={16} color="#eab308" style={{ marginRight: 4 }} />
            <Text style={styles.settingsText}>Settings</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.headerProfile}>
          <View style={styles.avatarLarge}>
            {currentUser?.avatar ? (
              <Image source={{ uri: currentUser.avatar }} style={styles.avatarImage} />
            ) : (
              <Text style={styles.avatarLargeText}>{currentUser?.name ? currentUser.name[0] : 'P'}</Text>
            )}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={styles.profileName}>{currentUser?.name || 'Loading...'}</Text>
            {currentUser?.isVip && <Ionicons name="checkmark-circle" size={18} color="#eab308" />}
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

        {/* Unified Subscriptions & Upgrades Center Banner */}
        <TouchableOpacity 
          style={styles.unifiedUpgradeCard} 
          onPress={() => setVipModalVisible(true)}
          activeOpacity={0.9}
        >
          <View style={styles.vipBannerLeft}>
            <View style={styles.vipIconCircle}>
              <Ionicons name="star" size={16} color="#eab308" />
            </View>
            <View>
              <Text style={styles.vipBannerTitle}>Subscription & Upgrades Hub 🌟</Text>
              <Text style={styles.vipBannerSubtitle}>Manage VIP & Spotlight Boost</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#eab308" />
        </TouchableOpacity>

        {/* Stats Row with Posts Counter */}
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>{userPosts.length}</Text>
            <Text style={styles.statLabel}>Posts</Text>
          </View>

          <View style={styles.statDivider} />

          <TouchableOpacity style={styles.statBox} onPress={() => setActiveModalList('followers')} activeOpacity={0.8}>
            <Text style={styles.statNumber}>{currentUser?.followers?.length || 0}</Text>
            <Text style={styles.statLabel}>Followers</Text>
          </TouchableOpacity>

          <View style={styles.statDivider} />

          <TouchableOpacity style={styles.statBox} onPress={() => setActiveModalList('following')} activeOpacity={0.8}>
            <Text style={styles.statNumber}>{currentUser?.following?.length || 0}</Text>
            <Text style={styles.statLabel}>Following</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.postsSectionHeader}>
          <Ionicons name="grid-outline" size={18} color="#eab308" />
          <Text style={styles.sectionTitle}>My Posts</Text>
        </View>

        {userPosts.length === 0 ? (
          <View style={styles.emptyPostsBox}>
            <Ionicons name="images-outline" size={32} color="#555" />
            <Text style={styles.emptyPostsText}>No posts shared yet.</Text>
          </View>
        ) : (
          <View style={styles.postsGrid}>
            {userPosts.map(post => (
              <TouchableOpacity key={post.id} style={styles.postThumbnailBox} onPress={() => setSelectedPostModal(post)} activeOpacity={0.9}>
                <Image source={{ uri: post.imageUrl }} style={styles.postThumbnailImage} />
              </TouchableOpacity>
            ))}
          </View>
        )}

      </ScrollView>

      {/* Settings Modal */}
      <Modal visible={settingsModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Account Settings ⚙️</Text>
              <TouchableOpacity onPress={() => setSettingsModalVisible(false)} activeOpacity={0.8}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <View style={{ gap: 15, marginTop: 10 }}>
              <TouchableOpacity 
                style={styles.settingsOptionBtn} 
                onPress={() => { setSettingsModalVisible(false); handleLogoutPress(); }}
                activeOpacity={0.8}
              >
                <Ionicons name="log-out-outline" size={20} color="#eab308" />
                <Text style={styles.settingsOptionText}>Log Out</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.settingsDeleteBtn} 
                onPress={() => { setSettingsModalVisible(false); handleDeleteAccountPress(); }}
                activeOpacity={0.8}
              >
                <Ionicons name="trash-outline" size={20} color="#ef4444" />
                <Text style={styles.settingsDeleteText}>Delete Account Permanently</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Unified Upgrades & Subscriptions Hub Modal */}
      <Modal visible={vipModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContentMedium}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Subscriptions & Upgrades Hub 🚀</Text>
              <TouchableOpacity onPress={() => setVipModalVisible(false)} activeOpacity={0.8}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Gold VIP Section */}
              <View style={styles.hubSectionCard}>
                <View style={styles.hubSectionHeaderRow}>
                  <Ionicons name="star" size={22} color="#eab308" />
                  <Text style={styles.hubSectionTitle}>Gold VIP Membership</Text>
                </View>
                <Text style={styles.hubSectionDesc}>Get verified gold badge, high visibility, priority in feeds & unlimited direct access ($9.99/mo).</Text>
                
                <TouchableOpacity 
                  style={[styles.hubActionBtn, currentUser?.isVip && styles.hubActionBtnCancel]} 
                  onPress={() => handlePurchaseProduct('maccabi_netanya_vip_monthly', 'vip')}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.hubActionBtnText, currentUser?.isVip && styles.hubActionBtnCancelText]}>
                    {currentUser?.isVip ? 'Cancel VIP Subscription ❌' : 'Subscribe to VIP 🌟'}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Spotlight / Boost Section */}
              <View style={styles.hubSectionCard}>
                <View style={styles.hubSectionHeaderRow}>
                  <Ionicons name="rocket" size={22} color="#3b82f6" />
                  <Text style={styles.hubSectionTitle}>Spotlight Profile Boost</Text>
                </View>
                <Text style={styles.hubSectionDesc}>Pin your profile to the very top of the Discover feed for 24 hours to gain maximum player reach ($2.99).</Text>
                
                <TouchableOpacity 
                  style={[styles.hubActionBtnBlue, currentUser?.isPromoted && styles.hubActionBtnCancel]} 
                  onPress={() => handlePurchaseProduct('maccabi_netanya_spotlight_boost', 'boost')}
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

      {/* Edit Profile Modal (Username & Avatar Only) */}
      <Modal visible={isEditModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContentMedium}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Profile ✏️</Text>
              <TouchableOpacity onPress={() => setIsEditModalVisible(false)} activeOpacity={0.8}>
                <Ionicons name="close" size={24} color="#fff" />
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
              <TextInput style={styles.input} value={editName} onChangeText={setEditName} placeholder="Username" placeholderTextColor="#666" />

              <TouchableOpacity style={styles.saveBtn} onPress={handleSaveProfile} activeOpacity={0.85}>
                <Text style={styles.saveBtnText}>Save Changes 🚀</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Followers/Following Modal */}
      <Modal visible={!!activeModalList} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {activeModalList === 'followers' ? 'Followers 👥' : 'Following 🤝'}
              </Text>
              <TouchableOpacity onPress={() => setActiveModalList(null)} activeOpacity={0.8}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <FlatList
              data={activeModalList === 'followers' ? followersList : followingList}
              keyExtractor={(item) => item.uid}
              renderItem={({ item }) => (
                <TouchableOpacity 
                  style={styles.listItem} 
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
                <Text style={styles.emptyText}>No users to show here.</Text>
              }
            />
          </View>
        </View>
      </Modal>

      {/* Target User Followers/Following Modal */}
      <Modal visible={!!targetActiveModalList} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {targetActiveModalList === 'followers' ? 'Followers 👥' : 'Following 🤝'}
              </Text>
              <TouchableOpacity onPress={() => setTargetActiveModalList(null)} activeOpacity={0.8}>
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
                <Text style={styles.emptyText}>No users to show here.</Text>
              }
            />
          </View>
        </View>
      </Modal>

      {/* Player Profile Modal */}
      <Modal visible={!!selectedUserModalId && !targetActiveModalList && !selectedPostModal} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContentLarge}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Player Profile 🏅</Text>
              <TouchableOpacity onPress={() => setSelectedUserModalId(null)} activeOpacity={0.8}>
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

                {/* Target User Stats with Posts */}
                <View style={styles.statsRow}>
                  <View style={styles.statBox}>
                    <Text style={styles.statNumber}>{targetUserPosts.length}</Text>
                    <Text style={styles.statLabel}>Posts</Text>
                  </View>

                  <View style={styles.statDivider} />

                  <TouchableOpacity 
                    style={styles.statBox} 
                    onPress={() => {
                      if (isViewingMyOwnProfile) {
                        setSelectedUserModalId(null);
                        setActiveModalList('followers');
                      } else {
                        setTargetActiveModalList('followers');
                      }
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.statNumber}>{targetProfileUser.followers?.length || 0}</Text>
                    <Text style={styles.statLabel}>Followers</Text>
                  </TouchableOpacity>

                  <View style={styles.statDivider} />

                  <TouchableOpacity 
                    style={styles.statBox} 
                    onPress={() => {
                      if (isViewingMyOwnProfile) {
                        setSelectedUserModalId(null);
                        setActiveModalList('following');
                      } else {
                        setTargetActiveModalList('following');
                      }
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.statNumber}>{targetProfileUser.following?.length || 0}</Text>
                    <Text style={styles.statLabel}>Following</Text>
                  </TouchableOpacity>
                </View>

                {!isViewingMyOwnProfile && (
                  <View style={{ flexDirection: 'row', gap: 10, marginVertical: 12 }}>
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
                      <TouchableOpacity key={post.id} style={styles.postThumbnailBox} onPress={() => setSelectedPostModal(post)} activeOpacity={0.9}>
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

      {/* Chat Modal */}
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
                  <Text style={styles.chatHeaderTitle}>Chat</Text>
                  <Text style={styles.chatHeaderSubTitle}>Chatting with {chatTargetUser?.name || 'Player'}</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setChatModalVisible(false)} activeOpacity={0.8}>
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
                    <View style={[styles.chatBubble, isMe ? styles.chatBubbleMe : styles.chatBubbleOther]}>
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
              <TouchableOpacity style={styles.chatSendBtn} onPress={handleSendMessage} activeOpacity={0.85}>
                <Ionicons name="send" size={16} color="#000" />
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Post Details Modal */}
      <Modal visible={!!selectedPostModal} animationType="slide" transparent={true}>
        <View style={styles.postModalOverlay}>
          <View style={styles.postModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Post Details 📸</Text>
              <TouchableOpacity onPress={() => setSelectedPostModal(null)} activeOpacity={0.8}>
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
                    delayPressIn={0}
                    onPress={() => {
                      const ownerId = selectedPostModal.userId;
                      const ownerName = postOwner?.name || selectedPostModal.userName;
                      setSelectedPostModal(null);
                      setTimeout(() => {
                        openUserProfileById(ownerId, ownerName);
                      }, 50);
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
                    <TouchableWithoutFeedback onPress={() => handleDoubleTap(selectedPostModal.id)}>
                      <View style={styles.postImageBoxModal}>
                        <Image source={{ uri: selectedPostModal.imageUrl }} style={styles.postImageContentModal} />
                      </View>
                    </TouchableWithoutFeedback>
                  ) : null}

                  <View style={styles.postActionsRowModal}>
                    <TouchableOpacity style={styles.actionBtn} onPress={toggleLikePost} activeOpacity={0.7}>
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
                      const commentUserObj = allUsers.find(u => u.uid === c.userId || u.name === c.user);
                      return (
                        <TouchableOpacity 
                          key={c.id} 
                          style={styles.commentRowModal}
                          activeOpacity={0.6}
                          delayPressIn={0}
                          onPress={() => {
                            const cUserId = c.userId;
                            const cUserName = c.user;
                            setSelectedPostModal(null);
                            setTimeout(() => {
                              openUserProfileById(cUserId, cUserName);
                            }, 50);
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
                      <TouchableOpacity style={styles.commentSendBtnModal} onPress={handleAddCommentToPost} activeOpacity={0.85}>
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

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#030703' },
  scrollContent: { paddingBottom: 40, paddingTop: 50 },
  topActionsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15, paddingHorizontal: 20 },
  editProfileBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#eab308', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12 },
  editProfileBtnText: { color: '#000', fontWeight: '900', fontSize: 12 },
  
  settingsBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0d110f', borderWidth: 1, borderColor: '#eab308', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12 },
  settingsText: { color: '#eab308', fontWeight: 'bold', fontSize: 12 },

  settingsOptionBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#16221a', borderWidth: 1, borderColor: '#eab308', padding: 14, borderRadius: 12 },
  settingsOptionText: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  settingsDeleteBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#1d0c0e', borderWidth: 1, borderColor: '#ef4444', padding: 14, borderRadius: 12 },
  settingsDeleteText: { color: '#ef4444', fontSize: 15, fontWeight: 'bold' },

  headerProfile: { alignItems: 'center', marginBottom: 15, paddingHorizontal: 20 },
  avatarLarge: { width: 92, height: 92, borderRadius: 46, backgroundColor: '#16221a', borderWidth: 3, borderColor: '#eab308', justifyContent: 'center', alignItems: 'center', marginBottom: 12, overflow: 'hidden', shadowColor: '#eab308', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 },
  avatarImage: { width: '100%', height: '100%' },
  avatarLargeText: { color: '#eab308', fontSize: 36, fontWeight: 'bold' },
  profileName: { color: '#fff', fontSize: 22, fontWeight: '900', letterSpacing: 0.5 },
  
  sportsTagsRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, marginVertical: 8 },
  sportTagBadge: { backgroundColor: '#0d110f', borderWidth: 1, borderColor: '#1f2e24', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  sportTagText: { color: '#eab308', fontSize: 11, fontWeight: 'bold' },

  profileCity: { color: '#888', fontSize: 13, marginTop: 4 },

  unifiedUpgradeCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#0d110f', borderWidth: 1, borderColor: '#eab308', marginHorizontal: 20, marginBottom: 16, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14, shadowColor: '#eab308', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4, elevation: 3 },
  vipBannerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  vipIconCircle: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#16221a', borderWidth: 1, borderColor: '#eab308', justifyContent: 'center', alignItems: 'center' },
  vipBannerTitle: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  vipBannerSubtitle: { color: '#888', fontSize: 11, marginTop: 1 },

  hubSectionCard: { backgroundColor: '#030703', borderWidth: 1, borderColor: '#1f2e24', borderRadius: 14, padding: 16, marginBottom: 16 },
  hubSectionHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  hubSectionTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  hubSectionDesc: { color: '#aaa', fontSize: 12, lineHeight: 18, marginBottom: 14 },
  hubActionBtn: { backgroundColor: '#eab308', borderRadius: 10, height: 42, justifyContent: 'center', alignItems: 'center' },
  hubActionBtnBlue: { backgroundColor: '#3b82f6', borderRadius: 10, height: 42, justifyContent: 'center', alignItems: 'center' },
  hubActionBtnCancel: { backgroundColor: '#2a1215', borderWidth: 1, borderColor: '#ef4444' },
  hubActionBtnText: { color: '#000', fontWeight: '900', fontSize: 13 },
  hubActionBtnCancelText: { color: '#ef4444' },

  billingNotice: { color: '#777', fontSize: 11, textAlign: 'center', marginBottom: 20, lineHeight: 16, paddingHorizontal: 10 },

  statsRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', backgroundColor: '#0d110f', borderRadius: 20, borderWidth: 1, borderColor: '#1f2e24', paddingVertical: 16, paddingHorizontal: 20, marginBottom: 20, marginHorizontal: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 6, elevation: 4 },
  statBox: { alignItems: 'center', flex: 1 },
  statDivider: { width: 1, height: '60%', backgroundColor: '#1f2e24' },
  statNumber: { color: '#eab308', fontSize: 20, fontWeight: '900' },
  statLabel: { color: '#888', fontSize: 12, marginTop: 2, fontWeight: '600' },

  postsSectionHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginBottom: 12, gap: 8, borderTopWidth: 1, borderTopColor: '#1f2e24', paddingTop: 18 },
  sectionTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  
  postsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 2 },
  postThumbnailBox: { width: imageSize, height: imageSize, backgroundColor: '#0d110f' },
  postThumbnailImage: { width: '100%', height: '100%' },

  emptyPostsBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40, backgroundColor: '#0d110f', marginHorizontal: 20, borderRadius: 16, borderWidth: 1, borderColor: '#1f2e24' },
  emptyPostsText: { color: '#666', fontSize: 13, marginTop: 8 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#0d110f', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, height: '40%', borderWidth: 1, borderColor: '#1f2e24' },
  modalContentMedium: { backgroundColor: '#0d110f', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, height: '50%', borderWidth: 1, borderColor: '#1f2e24' },
  modalContentLarge: { backgroundColor: '#0d110f', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, height: '85%', borderWidth: 1, borderColor: '#1f2e24' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },

  editAvatarContainer: { alignItems: 'center', marginBottom: 20 },
  avatarEditPreview: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#16221a', borderWidth: 2, borderColor: '#eab308', justifyContent: 'center', alignItems: 'center', marginBottom: 12, overflow: 'hidden' },
  imagePickBtn: { backgroundColor: '#16221a', borderWidth: 1, borderColor: '#eab308', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  imagePickText: { color: '#eab308', fontSize: 12, fontWeight: 'bold' },
  imageRemoveBtn: { backgroundColor: '#2a1215', borderWidth: 1, borderColor: '#ef4444', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  imageRemoveText: { color: '#ef4444', fontSize: 12, fontWeight: 'bold' },

  label: { color: '#ccc', fontSize: 12, fontWeight: 'bold', marginBottom: 6 },
  input: { backgroundColor: '#030703', borderWidth: 1, borderColor: '#1f2e24', borderRadius: 12, paddingHorizontal: 14, height: 46, color: '#fff', marginBottom: 14, fontSize: 13 },
  saveBtn: { backgroundColor: '#eab308', borderRadius: 12, height: 48, justifyContent: 'center', alignItems: 'center', marginTop: 10, marginBottom: 20 },
  saveBtnText: { color: '#000', fontWeight: '900', fontSize: 15 },
  
  listItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#030703', padding: 12, borderRadius: 14, marginBottom: 8, borderWidth: 1, borderColor: '#1f2e24' },
  listAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#16221a', justifyContent: 'center', alignItems: 'center', marginRight: 12, borderWidth: 1, borderColor: '#eab308', overflow: 'hidden' },
  listName: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  listCity: { color: '#888', fontSize: 11, marginTop: 2 },
  emptyText: { color: '#666', textAlign: 'center', marginTop: 30, fontSize: 13 },

  profileFollowBtn: { backgroundColor: '#eab308', borderRadius: 12, height: 44, justifyContent: 'center', alignItems: 'center' },
  profileFollowBtnText: { color: '#000', fontWeight: '900', fontSize: 13 },
  profileFollowingBtn: { backgroundColor: '#16221a', borderWidth: 1, borderColor: '#eab308' },
  profileFollowingBtnText: { color: '#eab308' },

  chatOpenBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#eab308', borderRadius: 12, height: 44, paddingHorizontal: 16 },
  chatOpenBtnText: { color: '#000', fontWeight: '900', fontSize: 13 },

  chatModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  chatModalContainer: { backgroundColor: '#0d110f', borderTopLeftRadius: 28, borderTopRightRadius: 28, height: '85%', borderWidth: 1, borderColor: '#1f2e24', display: 'flex', flexDirection: 'column' },
  chatHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#1f2e24' },
  chatHeaderAvatarBox: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#16221a', borderWidth: 1, borderColor: '#eab308', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  chatHeaderTitle: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  chatHeaderSubTitle: { color: '#eab308', fontSize: 11, fontWeight: '600' },

  chatBubbleRow: { marginBottom: 10, flexDirection: 'row' },
  chatBubbleRowLeft: { justifyContent: 'flex-start' },
  chatBubbleRowRight: { justifyContent: 'flex-end' },
  chatBubble: { maxWidth: '75%', padding: 10, borderRadius: 14, borderWidth: 1 },
  chatBubbleOther: { backgroundColor: '#16221a', borderColor: '#1f2e24' },
  chatBubbleMe: { backgroundColor: '#eab308', borderColor: '#eab308' },
  chatBubbleText: { color: '#000', fontSize: 13, fontWeight: '500' },
  chatBubbleTime: { color: '#444', fontSize: 9, marginTop: 4, alignSelf: 'flex-end' },

  chatInputRow: { flexDirection: 'row', padding: 12, borderTopWidth: 1, borderTopColor: '#1f2e24', backgroundColor: '#0d110f', gap: 8, alignItems: 'center' },
  chatInputField: { flex: 1, backgroundColor: '#030703', borderWidth: 1, borderColor: '#1f2e24', borderRadius: 20, height: 42, color: '#fff', paddingHorizontal: 14, fontSize: 13 },
  chatSendBtn: { backgroundColor: '#eab308', width: 42, height: 42, borderRadius: 21, justifyContent: 'center', alignItems: 'center' },

  postModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  postModalContent: { backgroundColor: '#0d110f', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, height: '80%', borderWidth: 1, borderColor: '#1f2e24' },
  
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
  commentSendBtnModal: { backgroundColor: '#eab308', width: 32, height: 36, borderRadius: 8, justifyContent: 'center', alignItems: 'center' }
});