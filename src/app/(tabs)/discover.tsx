import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TextInput, ScrollView, Image, TouchableOpacity, Modal, Dimensions, KeyboardAvoidingView, Platform, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { collection, onSnapshot, doc, updateDoc, arrayUnion, arrayRemove, getDoc, setDoc, addDoc, query, orderBy } from 'firebase/firestore';
import { db } from '../../firebase';
import AsyncStorage from '@react-native-async-storage/async-storage';

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

export default function DiscoverScreen() {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [allPosts, setAllPosts] = useState<PostItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
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

  useEffect(() => {
    const loadCurrentUser = async () => {
      try {
        const savedEmail = await AsyncStorage.getItem('@saved_user_email');
        if (savedEmail) {
          const userId = savedEmail.toLowerCase().replace(/[^a-z0-9]/g, '_');
          const userRef = doc(db, 'users', userId);
          const unsubscribe = onSnapshot(userRef, (docSnap) => {
            if (docSnap.exists()) {
              setCurrentUser({ uid: docSnap.id, ...(docSnap.data() as Omit<UserProfile, 'uid'>) });
            } else {
              setCurrentUser({ uid: userId, name: savedEmail.split('@')[0], email: savedEmail, city: 'Netanya' });
            }
          });
          return () => unsubscribe();
        }
      } catch (e) {
        console.error('Error loading current user in Discover:', e);
      }
    };
    loadCurrentUser();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'users'), (snapshot) => {
      const usersList: UserProfile[] = snapshot.docs.map(docSnap => ({
        uid: docSnap.id,
        ...(docSnap.data() as Omit<UserProfile, 'uid'>)
      }));
      setAllUsers(usersList);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'posts'), (snapshot) => {
      const postsList: PostItem[] = snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<PostItem, 'id'>)
      }));
      setAllPosts(postsList);
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
        console.error('Error fetching target user in Discover:', e);
      }
    };

    fetchTargetUser();
  }, [selectedUserModalId]);

  useEffect(() => {
    if (!targetProfileUser) return;
    const filtered = allPosts.filter(p => 
      p.userId === targetProfileUser.uid || 
      p.userName === targetProfileUser.name ||
      p.authorName === targetProfileUser.name
    );
    setTargetUserPosts(filtered);
  }, [targetProfileUser, allPosts]);

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

  const openUserProfileById = (userId?: string, playerName?: string) => {
    const cleanPlayerName = (playerName || '').trim().toLowerCase();
    const myCurrentName = (currentUser?.name || '').trim().toLowerCase();

    if (
      (userId && currentUser && userId === currentUser.uid) ||
      (cleanPlayerName && myCurrentName && cleanPlayerName === myCurrentName)
    ) {
      return; 
    }

    setSelectedPostModal(null);
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

  const filteredUsers = allUsers.filter(u => 
    u.uid !== currentUser?.uid && (
      u.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.city?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (u.sports && u.sports.some(s => s.toLowerCase().includes(searchQuery.toLowerCase())))
    )
  );

  const vipAthletes = allUsers.filter(u => u.isVip && u.uid !== currentUser?.uid);
  const targetSportsList = targetProfileUser?.sports || (targetProfileUser?.sport ? [targetProfileUser.sport] : ['Football']);
  const isFollowingTarget = targetProfileUser?.followers?.includes(currentUser?.uid || '');

  const targetFollowersList = allUsers.filter(u => targetProfileUser?.followers?.includes(u.uid));
  const targetFollowingList = allUsers.filter(u => targetProfileUser?.following?.includes(u.uid));
  const postOwner = allUsers.find(u => 
    u.uid === selectedPostModal?.userId || 
    u.name === selectedPostModal?.userName || 
    u.name === selectedPostModal?.authorName
  ) || targetProfileUser;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* Header */}
        <View style={styles.headerRow}>
          <Text style={styles.discoverCategory}>DISCOVER</Text>
          <Text style={styles.appTitle}>Find <Text style={{color: '#EAB308'}}>Players</Text></Text>
        </View>

        {/* Search Bar */}
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

        {/* Featured VIP Athletes */}
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
                    <Text style={styles.vipFeatureName} numberOfLines={1}>{vipUser.name}</Text>
                    <Ionicons name="checkmark-circle" size={13} color="#EAB308" />
                  </View>
                  <Text style={styles.vipFeatureCity} numberOfLines={1}>📍 {vipUser.city || 'Netanya'}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        <Text style={styles.sectionHeading}>Community Players 🏅</Text>

        {/* Users List */}
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
                </View>
                <Text style={styles.userMeta}>📍 {user.city || 'Netanya'} | 🎂 {user.age || 20} yrs</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#71717A" />
            </TouchableOpacity>
          ))
        )}

      </ScrollView>

      {/* Player Profile Modal */}
      <Modal visible={!!selectedUserModalId && !targetActiveModalList && !selectedPostModal} animationType="slide" transparent={true} onRequestClose={() => setSelectedUserModalId(null)}>
        <View style={styles.modalOverlayCenter}>
          <View style={styles.modalContentHomeStyle}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.discoverCategory}>PLAYER PROFILE</Text>
                <Text style={styles.appTitle}>World <Text style={{color: '#EAB308'}}>Sports</Text></Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedUserModalId(null)} activeOpacity={0.8} style={styles.closeHomeModalBtn}>
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
                  <View style={styles.avatarLarge}>
                    {targetProfileUser.avatar ? (
                      <Image source={{ uri: targetProfileUser.avatar }} style={styles.avatarImage} />
                    ) : (
                      <Text style={styles.avatarLargeText}>{targetProfileUser.name ? targetProfileUser.name[0] : 'P'}</Text>
                    )}
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    <Text style={styles.profileName}>{targetProfileUser.name}</Text>
                    {targetProfileUser.isVip && <Ionicons name="checkmark-circle" size={18} color="#EAB308" />}
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
                  <View style={styles.statBox}>
                    <Text style={styles.statNumber}>{targetUserPosts.length}</Text>
                    <Text style={styles.statLabel}>Posts</Text>
                  </View>
                  <View style={styles.statDivider} />
                  <TouchableOpacity style={styles.statBox} onPress={() => setTargetActiveModalList('followers')}>
                    <Text style={styles.statNumber}>{targetProfileUser.followers?.length || 0}</Text>
                    <Text style={styles.statLabel}>Followers</Text>
                  </TouchableOpacity>
                  <View style={styles.statDivider} />
                  <TouchableOpacity style={styles.statBox} onPress={() => setTargetActiveModalList('following')}>
                    <Text style={styles.statNumber}>{targetProfileUser.following?.length || 0}</Text>
                    <Text style={styles.statLabel}>Following</Text>
                  </TouchableOpacity>
                </View>

                {targetProfileUser.uid !== currentUser?.uid && (
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
                      <Ionicons name="chatbubbles-outline" size={18} color="#09090B" />
                      <Text style={styles.chatOpenBtnText}>Message 💬</Text>
                    </TouchableOpacity>
                  </View>
                )}

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

      {/* Followers / Following List Modal */}
      <Modal visible={!!targetActiveModalList} animationType="slide" transparent={true}>
        <View style={styles.modalOverlayCenter}>
          <View style={styles.modalContentCenter}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {targetActiveModalList === 'followers' ? 'Followers 👥' : 'Following 🤝'}
              </Text>
              <TouchableOpacity onPress={() => setTargetActiveModalList(null)}>
                <Ionicons name="close" size={24} color="#FAFAFA" />
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

      {/* Chat Modal */}
      <Modal visible={chatModalVisible} animationType="slide" transparent={true} onRequestClose={() => setChatModalVisible(false)}>
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
          style={styles.modalOverlayCenter}
        >
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
                    {chatTargetUser?.isVip && <Ionicons name="checkmark-circle" size={12} color="#EAB308" />}
                  </View>
                </View>
              </View>
              <TouchableOpacity onPress={() => setChatModalVisible(false)} activeOpacity={0.8}>
                <Ionicons name="close" size={24} color="#FAFAFA" />
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
                      <Text style={[styles.chatBubbleText, isMe && { color: '#09090B' }]}>{item.text}</Text>
                      <Text style={[styles.chatBubbleTime, isMe && { color: '#3F3F46' }]}>{getTimeAgo(item.createdAt)}</Text>
                    </View>
                  </View>
                );
              }}
              ListEmptyComponent={
                <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 40 }}>
                  <Ionicons name="chatbubble-outline" size={40} color="#52525B" />
                  <Text style={{ color: '#71717A', marginTop: 10, fontSize: 13 }}>No messages yet. Say hello! 👋</Text>
                </View>
              }
            />

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
        </KeyboardAvoidingView>
      </Modal>

      {/* Post Details Modal */}
      <Modal visible={!!selectedPostModal} animationType="slide" transparent={true} onRequestClose={() => setSelectedPostModal(null)}>
        <View style={styles.modalOverlayCenter}>
          <View style={styles.modalContentCenter}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Post Details 📸</Text>
              <TouchableOpacity onPress={() => setSelectedPostModal(null)} activeOpacity={0.8}>
                <Ionicons name="close" size={24} color="#FAFAFA" />
              </TouchableOpacity>
            </View>

            {selectedPostModal && (() => {
              const postTimeAgo = getTimeAgo(selectedPostModal.createdAt);
              return (
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }} nestedScrollEnabled={true}>
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
                        {postOwner?.isVip && <Ionicons name="checkmark-circle" size={14} color="#EAB308" />}
                      </View>
                      <Text style={styles.postUserMetaModal}>{postOwner?.city || 'Netanya'}, {postOwner?.country || 'Israel'}</Text>
                    </View>
                    <Text style={{ color: '#71717A', fontSize: 11 }}>{postTimeAgo}</Text>
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
                    <TouchableOpacity style={styles.actionBtn} onPress={toggleLikePost} activeOpacity={0.7}>
                      <Ionicons 
                        name={currentUser && selectedPostModal.likesList?.includes(currentUser.uid) ? "heart" : "heart-outline"} 
                        size={20} 
                        color={currentUser && selectedPostModal.likesList?.includes(currentUser.uid) ? "#EF4444" : "#71717A"} 
                      />
                      <Text style={[styles.actionText, currentUser && selectedPostModal.likesList?.includes(currentUser.uid) && { color: '#EF4444', fontWeight: 'bold' }]}>
                        {selectedPostModal.likesList?.length || 0} Likes
                      </Text>
                    </TouchableOpacity>
                    <View style={styles.actionBtn}>
                      <Ionicons name="chatbubble-outline" size={18} color="#71717A" />
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
                          onPress={() => {
                            setSelectedPostModal(null);
                            openUserProfileById(c.userId, c.user);
                          }}
                        >
                          {c.avatarUrl ? (
                            <Image source={{ uri: c.avatarUrl }} style={styles.commentAvatarModal} />
                          ) : (
                            <View style={styles.commentAvatarLetterModal}>
                              <Text style={{ color: '#EAB308', fontSize: 10, fontWeight: 'bold' }}>{c.user ? c.user[0] : 'P'}</Text>
                            </View>
                          )}
                          <View style={{ flex: 1, marginLeft: 8, backgroundColor: '#18181B', padding: 8, borderRadius: 10 }}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                <Text style={styles.commentUserModal}>{c.user}</Text>
                                {commentUserObj?.isVip && <Ionicons name="checkmark-circle" size={12} color="#EAB308" />}
                              </View>
                              <Text style={{ color: '#71717A', fontSize: 10 }}>{commentTimeAgo}</Text>
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
                        placeholderTextColor="#52525B"
                        value={commentInput}
                        onChangeText={setCommentInput}
                      />
                      <TouchableOpacity style={styles.commentSendBtnModal} onPress={handleAddCommentToPost} activeOpacity={0.85}>
                        <Ionicons name="send" size={14} color="#09090B" />
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
  container: { flex: 1, backgroundColor: '#09090B' },
  scrollContent: { padding: 20, paddingTop: 50, paddingBottom: 40 },
  headerRow: { marginBottom: 16 },
  discoverCategory: { color: '#EAB308', fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  appTitle: { color: '#FAFAFA', fontSize: 24, fontWeight: '900', fontStyle: 'italic', letterSpacing: 1 },

  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#121215', borderWidth: 1, borderColor: '#27272A', borderRadius: 14, paddingHorizontal: 12, height: 44, marginBottom: 18 },
  searchInput: { flex: 1, color: '#FAFAFA', fontSize: 13 },

  vipFeaturedContainer: { marginBottom: 20, backgroundColor: '#121215', borderWidth: 1, borderColor: '#EAB308', borderRadius: 20, padding: 14 },
  vipFeaturedHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  vipFeaturedTitle: { color: '#EAB308', fontSize: 13, fontWeight: '700' },
  vipFeatureCard: { width: 90, alignItems: 'center', backgroundColor: '#09090B', borderRadius: 14, padding: 10, borderWidth: 1, borderColor: '#27272A' },
  vipFeatureAvatarBox: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#18181B', borderWidth: 2, borderColor: '#EAB308', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  vipFeatureName: { color: '#FAFAFA', fontSize: 12, fontWeight: '700' },
  vipFeatureCity: { color: '#A1A1AA', fontSize: 10, marginTop: 2 },

  sectionHeading: { color: '#FAFAFA', fontSize: 15, fontWeight: '700', marginBottom: 12 },

  userCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#121215', borderWidth: 1, borderColor: '#27272A', borderRadius: 16, padding: 12, marginBottom: 10 },
  userAvatarBox: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#18181B', borderWidth: 1, borderColor: '#EAB308', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  avatarImg: { width: '100%', height: '100%' },
  avatarLetter: { color: '#EAB308', fontSize: 18, fontWeight: 'bold' },
  avatarLetterTextSmall: { color: '#EAB308', fontSize: 14, fontWeight: 'bold' },
  userName: { color: '#FAFAFA', fontSize: 14, fontWeight: '700' },
  userMeta: { color: '#A1A1AA', fontSize: 11, marginTop: 2 },

  emptyBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40, backgroundColor: '#121215', borderRadius: 16, borderWidth: 1, borderColor: '#27272A' },
  emptyText: { color: '#71717A', fontSize: 13, marginTop: 8 },

  modalOverlayCenter: { flex: 1, backgroundColor: 'rgba(9,9,11,0.85)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 },
  modalContentHomeStyle: { backgroundColor: '#09090B', borderRadius: 28, padding: 20, borderWidth: 1, borderColor: '#27272A', width: '100%', maxWidth: 420, height: '88%', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.5, shadowRadius: 16, elevation: 12 },
  closeHomeModalBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#121215', borderWidth: 1, borderColor: '#27272A', justifyContent: 'center', alignItems: 'center' },
  modalContentCenter: { backgroundColor: '#121215', borderRadius: 28, padding: 20, borderWidth: 1, borderColor: '#27272A', width: '100%', maxWidth: 400, maxHeight: '85%', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 16, elevation: 10 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { color: '#FAFAFA', fontSize: 18, fontWeight: '800' },

  headerProfile: { alignItems: 'center', marginBottom: 16, paddingHorizontal: 20 },
  avatarLarge: { width: 84, height: 84, borderRadius: 42, backgroundColor: '#18181B', borderWidth: 2, borderColor: '#EAB308', justifyContent: 'center', alignItems: 'center', marginBottom: 10, overflow: 'hidden' },
  avatarImage: { width: '100%', height: '100%' },
  avatarLargeText: { color: '#EAB308', fontSize: 32, fontWeight: 'bold' },
  profileName: { color: '#FAFAFA', fontSize: 20, fontWeight: '900' },
  
  sportsTagsRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, marginVertical: 8 },
  sportTagBadge: { backgroundColor: '#18181B', borderWidth: 1, borderColor: '#EAB308', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  sportTagText: { color: '#EAB308', fontSize: 11, fontWeight: '700' },

  profileCity: { color: '#A1A1AA', fontSize: 13, marginTop: 4 },

  statsRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', backgroundColor: '#18181B', borderRadius: 16, borderWidth: 1, borderColor: '#27272A', paddingVertical: 14, paddingHorizontal: 10, marginBottom: 16 },
  statBox: { alignItems: 'center', flex: 1 },
  statDivider: { width: 1, height: '60%', backgroundColor: '#27272A' },
  statNumber: { color: '#EAB308', fontSize: 18, fontWeight: '900' },
  statLabel: { color: '#A1A1AA', fontSize: 12, marginTop: 2, fontWeight: '600' },

  postsSectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 6, borderTopWidth: 1, borderTopColor: '#27272A', paddingTop: 14 },
  sectionTitle: { color: '#FAFAFA', fontSize: 15, fontWeight: '700' },
  
  postsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 2 },
  postThumbnailBox: { width: imageSize, height: imageSize, backgroundColor: '#121215', borderRadius: 8, overflow: 'hidden' },
  postThumbnailImage: { width: '100%', height: '100%' },

  emptyPostsBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 30, backgroundColor: '#18181B', borderRadius: 14, borderWidth: 1, borderColor: '#27272A' },
  emptyPostsText: { color: '#71717A', fontSize: 12, marginTop: 6 },

  profileFollowBtn: { backgroundColor: '#EAB308', borderRadius: 12, height: 44, justifyContent: 'center', alignItems: 'center' },
  profileFollowBtnText: { color: '#09090B', fontWeight: '900', fontSize: 13 },
  profileFollowingBtn: { backgroundColor: '#18181B', borderWidth: 1, borderColor: '#EAB308' },
  profileFollowingBtnText: { color: '#EAB308' },

  chatOpenBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#EAB308', borderRadius: 12, height: 44, paddingHorizontal: 16 },
  chatOpenBtnText: { color: '#09090B', fontWeight: '900', fontSize: 13 },

  listItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#09090B', padding: 12, borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: '#27272A' },
  listAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#18181B', justifyContent: 'center', alignItems: 'center', marginRight: 12, borderWidth: 1, borderColor: '#EAB308', overflow: 'hidden' },
  listName: { color: '#FAFAFA', fontSize: 14, fontWeight: 'bold' },
  listCity: { color: '#A1A1AA', fontSize: 11, marginTop: 2 },

  chatHeaderAvatarBox: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#18181B', borderWidth: 1, borderColor: '#EAB308', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  chatHeaderTitle: { color: '#FAFAFA', fontSize: 15, fontWeight: '700' },
  chatHeaderSubTitle: { color: '#EAB308', fontSize: 11, fontWeight: '600' },

  chatBubbleRow: { marginBottom: 10, flexDirection: 'row' },
  chatBubbleRowLeft: { justifyContent: 'flex-start' },
  chatBubbleRowRight: { justifyContent: 'flex-end' },
  chatBubble: { maxWidth: '75%', padding: 12, borderRadius: 16, borderWidth: 1 },
  chatBubbleOther: { backgroundColor: '#18181B', borderColor: '#27272A' },
  chatBubbleMe: { backgroundColor: '#EAB308', borderColor: '#EAB308' },
  chatBubbleText: { color: '#FAFAFA', fontSize: 13, fontWeight: '500' },
  chatBubbleTime: { color: '#A1A1AA', fontSize: 9, marginTop: 4, alignSelf: 'flex-end' },

  chatInputRow: { flexDirection: 'row', paddingTop: 12, borderTopWidth: 1, borderTopColor: '#27272A', gap: 8, alignItems: 'center' },
  chatInputField: { flex: 1, backgroundColor: '#09090B', borderWidth: 1, borderColor: '#27272A', borderRadius: 20, height: 42, color: '#FAFAFA', paddingHorizontal: 14, fontSize: 13 },
  chatSendBtn: { backgroundColor: '#EAB308', width: 42, height: 42, borderRadius: 21, justifyContent: 'center', alignItems: 'center' },

  postHeaderRowModal: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  postAvatarBoxModal: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#18181B', borderWidth: 1, borderColor: '#EAB308', overflow: 'hidden', justifyContent: 'center', alignItems: 'center' },
  postUserNameModal: { color: '#FAFAFA', fontSize: 14, fontWeight: '700' },
  postUserMetaModal: { color: '#A1A1AA', fontSize: 11 },
  postTextModal: { color: '#E4E4E7', fontSize: 14, marginBottom: 12, lineHeight: 20 },
  postImageBoxModal: { height: 260, backgroundColor: '#09090B', borderRadius: 14, overflow: 'hidden', marginBottom: 12, borderWidth: 1, borderColor: '#27272A' },
  postImageContentModal: { width: '100%', height: '100%' },

  postActionsRowModal: { flexDirection: 'row', gap: 20, marginBottom: 12, borderTopWidth: 1, borderTopColor: '#27272A', paddingTop: 12 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionText: { color: '#A1A1AA', fontSize: 13, fontWeight: '600' },

  commentsSectionModal: { borderTopWidth: 1, borderTopColor: '#27272A', paddingTop: 10 },
  commentRowModal: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  commentAvatarModal: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, borderColor: '#EAB308', overflow: 'hidden' },
  commentAvatarLetterModal: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, borderColor: '#EAB308', backgroundColor: '#18181B', justifyContent: 'center', alignItems: 'center' },
  commentUserModal: { color: '#EAB308', fontSize: 12, fontWeight: '700' },
  commentTextModal: { color: '#D4D4D8', fontSize: 12 },
  commentInputRowModal: { flexDirection: 'row', gap: 8, marginTop: 10, alignItems: 'center' },
  commentInputModal: { flex: 1, backgroundColor: '#09090B', borderWidth: 1, borderColor: '#27272A', borderRadius: 12, height: 38, color: '#FAFAFA', paddingHorizontal: 12, fontSize: 12 },
  commentSendBtnModal: { backgroundColor: '#EAB308', width: 34, height: 38, borderRadius: 12, justifyContent: 'center', alignItems: 'center' }
});