import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { StyleSheet, Text, View, ScrollView, FlatList, Image, TouchableOpacity, TextInput, Modal, Alert, Dimensions, TouchableWithoutFeedback, PanResponder, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import * as ImagePicker from 'expo-image-picker';
import { doc, onSnapshot, collection, addDoc, updateDoc, deleteDoc, serverTimestamp, query, orderBy, limit, getDoc, setDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db } from '../../firebase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';

const { width, height } = Dimensions.get('window');

// ניהול גלובלי של כל נגני הווידאו הפעילים באפליקציה למניעת השמעה מקבילה
const activeVideoPlayers = new Set<any>();

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

// נגן וידאו חכם לפוסטים: מפסיק לחלוטין שמע וניגון ברגע שאינו פעיל במסך
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

// נגן סטורי: מתנגן רק כאשר מסך הבית והסטורי פעילים
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

useFocusEffect(
  useCallback(() => {
    setIsScreenFocused(true);

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
  const [currentUserId, setCurrentUserId] = useState('');
  const [allUsersList, setAllUsersList] = useState<any[]>([]);

  const [zoomedAvatarUri, setZoomedAvatarUri] = useState<string | null>(null);
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);

  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      setTick(t => t + 1);
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      const users = snapshot.docs.map(docSnap => ({
        uid: docSnap.id,
        ...(docSnap.data() as any)
      }));
      setAllUsersList(users);
    });
    return () => unsubUsers();
  }, []);

  useEffect(() => {
    const fetchLiveUserData = async () => {
      try {
        const savedEmail = await AsyncStorage.getItem('@saved_user_email');
        if (savedEmail) {
          const userId = savedEmail.toLowerCase().replace(/[^a-z0-9]/g, '_');
          setCurrentUserId(userId);
          const unsubscribe = onSnapshot(doc(db, 'users', userId), (docSnap) => {
            if (docSnap.exists()) {
              const data = docSnap.data();
              if (data.avatar !== undefined) setLiveAvatar(data.avatar);
              if (data.name) setLiveName(data.name);
              if (data.country && data.city) {
                setLiveMeta(`${data.country}, ${data.city} | ${data.age || 20} yrs old`);
              }
              if (data.sports) {
                setUserSports(data.sports);
              } else if (data.sport) {
                setUserSports([data.sport]);
              }
              if (data.following) {
                setFollowingList(data.following);
              }
            }
          });
          return () => unsubscribe();
        }
      } catch (e) {
        console.error('Error fetching live user data in Home', e);
      }
    };
    fetchLiveUserData();
  }, []);

  const [stories, setStories] = useState<Story[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [storyCommentInput, setStoryCommentInput] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'stories'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const now = new Date().getTime();
      const storiesList: Story[] = [];

      snapshot.docs.forEach(docSnap => {
        const data = docSnap.data();
        const createdAtDate = data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt || now);
        const diffHours = (now - createdAtDate.getTime()) / (1000 * 60 * 60);

        if (diffHours <= 24) {
          const authorDoc = allUsersList.find(u => u.uid === data.userUid || u.name === data.name);
          const resolvedAvatar = authorDoc?.avatar || data.avatarUrl || '';

          storiesList.push({
            id: docSnap.id,
            userUid: data.userUid,
            name: data.name,
            imageUrl: data.imageUrl,
            mediaType: data.mediaType || 'image',
            avatarUrl: resolvedAvatar,
            caption: data.caption,
            captionStyle: data.captionStyle,
            createdAt: data.createdAt,
            isMine: data.userUid === currentUserId || data.name === liveName,
            likesList: data.likesList || [],
            viewersList: data.viewersList || [],
            storyComments: data.storyComments || []
          });
        }
      });
      setStories(storiesList);
    });
    return () => unsubscribe();
  }, [currentUserId, liveName, allUsersList]);

  useEffect(() => {
    const q = query(
      collection(db, 'posts'), 
      orderBy('createdAt', 'desc'),
      limit(15)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const postsList: Post[] = snapshot.docs.map(docSnap => {
        const data = docSnap.data();
        const likesList = data.likesList || [];
        
        const authorDoc = allUsersList.find(u => u.uid === data.userId || u.name === (data.userName || data.authorName));
        const resolvedAvatar = authorDoc?.avatar || data.avatarUrl || '';

        return {
          id: docSnap.id,
          userId: data.userId,
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

      setCommentsModalPost(prevModalPost => {
        if (!prevModalPost) return null;
        const updatedCurrentPost = postsList.find(p => p.id === prevModalPost.id);
        return updatedCurrentPost || prevModalPost;
      });

      setSelectedPostModal(prevSelectedPost => {
        if (!prevSelectedPost) return null;
        const updatedSelectedPost = postsList.find(p => p.id === prevSelectedPost.id);
        return updatedSelectedPost || prevSelectedPost;
      });
    }, (error) => {
      console.error('Error listening to posts:', error);
    });
    return () => unsubscribe();
  }, [currentUserId, allUsersList]);

  const [activeGroupIndex, setActiveGroupIndex] = useState<number | null>(null);
  const [activeStoryInGroupIndex, setActiveStoryInGroupIndex] = useState<number>(0);
  
  const progressAnim = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<Animated.CompositeAnimation | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const progressValueRef = useRef(0);

  const rawGroupedStories: GroupedStory[] = [];
  const myStories = stories.filter(s => s.isMine || s.userUid === currentUserId || s.name === liveName);
  
  const otherStories = stories.filter(s => {
    if (s.isMine || s.userUid === currentUserId || s.name === liveName) return false;
    const isFollowed = s.userUid ? followingList.includes(s.userUid) : true;
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

  const [chatModalVisible, setChatModalVisible] = useState(false);
  const [chatTargetUser, setChatTargetUser] = useState<any | null>(null);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [messageInput, setMessageInput] = useState('');

  const [selectedPostModal, setSelectedPostModal] = useState<Post | null>(null);
  const [commentsModalPost, setCommentsModalPost] = useState<Post | null>(null);
  const [modalCommentInput, setModalCommentInput] = useState('');

  // עצירת כל נגני הווידאו באופן מוחלט בכל מעבר לפרופיל או מודל
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

  // בעת יציאה מעמוד הבית (למשל מעבר לטאב אחר) עוצרים גם פוסטים וגם סטוריז.
  useEffect(() => {
    if (!isScreenFocused) {
      stopAllVideos();
      setActiveGroupIndex(null);
    }
  }, [isScreenFocused]);

  const openUserProfileById = (userId?: string, playerName?: string) => {
    const cleanPlayerName = (playerName || '').trim().toLowerCase();
    const myCurrentName = (liveName || '').trim().toLowerCase();

    if (
      (userId && currentUserId && userId === currentUserId) ||
      (cleanPlayerName && myCurrentName && cleanPlayerName === myCurrentName)
    ) {
      return; 
    }

    stopAllVideos();

    setTargetActiveModalList(null);
    setSelectedUserModalId(null);
    setSelectedPostModal(null);
    setCommentsModalPost(null);

    setTimeout(() => {
      let found: any | undefined = undefined;
      if (userId) {
        found = allUsersList.find(u => u.uid === userId);
      }
      if (!found && playerName) {
        found = allUsersList.find(u => u.name?.toLowerCase() === cleanPlayerName);
      }

      if (found) {
        setActiveGroupIndex(null);
        setSelectedUserModalId(found.uid);
      } else if (userId) {
        setActiveGroupIndex(null);
        setSelectedUserModalId(userId);
      }
    }, 50);
  };

  useEffect(() => {
    if (!selectedUserModalId) {
      setTargetProfileUser(null);
      setTargetUserPosts([]);
      return;
    }

    const fetchTargetUser = async () => {
      try {
        const userSnap = await getDoc(doc(db, 'users', selectedUserModalId));
        if (userSnap.exists()) {
          setTargetProfileUser({ uid: userSnap.id, ...(userSnap.data() as any) });
        }
      } catch (e) {
        console.error('Error fetching target user:', e);
      }
    };
    fetchTargetUser();
  }, [selectedUserModalId]);

  useEffect(() => {
    if (!targetProfileUser) return;
    const filtered = posts.filter(p => 
      p.userId === targetProfileUser.uid || 
      p.authorName === targetProfileUser.name
    );
    setTargetUserPosts(filtered);
  }, [targetProfileUser, posts]);

  useEffect(() => {
    if (!currentUserId || !chatTargetUser || !chatModalVisible) return;
    const chatId = [currentUserId, chatTargetUser.uid].sort().join('_');
    const messagesRef = collection(db, 'chats', chatId, 'messages');
    const q = query(messagesRef, orderBy('createdAt', 'asc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs: any[] = snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...(docSnap.data() as any)
      }));
      setChatMessages(msgs);
    });
    return () => unsubscribe();
  }, [currentUserId, chatTargetUser, chatModalVisible]);

  const handleToggleFollowTarget = async () => {
    if (!targetProfileUser || !currentUserId) return;
    const isFollowing = targetProfileUser.followers?.includes(currentUserId);

    try {
      const myRef = doc(db, 'users', currentUserId);
      const targetRef = doc(db, 'users', targetProfileUser.uid);

      if (isFollowing) {
        await updateDoc(myRef, { following: arrayRemove(targetProfileUser.uid) });
        await updateDoc(targetRef, { followers: arrayRemove(currentUserId) });
        setFollowingList(prev => prev.filter(id => id !== targetProfileUser.uid));
        setTargetProfileUser({
          ...targetProfileUser,
          followers: targetProfileUser.followers?.filter((id: string) => id !== currentUserId)
        });
      } else {
        await updateDoc(myRef, { following: arrayUnion(targetProfileUser.uid) });
        await updateDoc(targetRef, { followers: arrayUnion(currentUserId) });
        setFollowingList(prev => [...prev, targetProfileUser.uid]);
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
    }
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

    try {
      const storyRef = doc(db, 'stories', storyId);
      const likesList = story.likesList || [];
      const hasLiked = likesList.includes(currentUserId);
      const updatedLikes = hasLiked
        ? likesList.filter(id => id !== currentUserId)
        : [...likesList, currentUserId];

      await updateDoc(storyRef, { likesList: updatedLikes });
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
        const currentComments = story.storyComments || [];
        const updatedStoryComments = [...currentComments, newComment];
        await updateDoc(storyRef, { storyComments: updatedStoryComments });
        
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

    try {
      const assignedSport = userSports.length > 0 ? userSports[0] : 'Football';
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
    return matchesSport;
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
  const isFollowingTarget = targetProfileUser?.followers?.includes(currentUserId || '');
  const isViewingMyOwnProfile = targetProfileUser?.uid === currentUserId;

  const isAnyModalOpen = activeGroupIndex !== null || !!selectedUserModalId || !!selectedPostModal || !!commentsModalPost;

  // refs מונעים callback ישן של FlatList מלהשתמש בערכי focus/modal לא מעודכנים.
  const screenFocusedRef = useRef(isScreenFocused);
  const modalOpenRef = useRef(isAnyModalOpen);
  useEffect(() => { screenFocusedRef.current = isScreenFocused; }, [isScreenFocused]);
  useEffect(() => { modalOpenRef.current = isAnyModalOpen; }, [isAnyModalOpen]);

  // הפעלת סרטון רק כאשר לפחות 60% מהפוסט גלויים והמסך הנוכחי בפוקוס.
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
    <View style={{ flex: 1, backgroundColor: '#09090B' }}>
      <FlatList 
        data={filteredPosts}
        keyExtractor={(item) => item.id}
        style={styles.container} 
        contentContainerStyle={styles.scrollContent} 
        showsVerticalScrollIndicator={false}
        viewabilityConfig={viewabilityConfig}
        onViewableItemsChanged={onViewableItemsChanged}
        ListHeaderComponent={
          <>
            <View style={styles.headerRow}>
              <View>
                <Text style={styles.homeCategory}>Home</Text>
                <Text style={styles.appTitle}>World <Text style={{color: '#EAB308'}}>Sports</Text></Text>
              </View>

              <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                <TouchableOpacity 
                  style={styles.notificationBellBtn} 
                  onPress={() => {
                    stopAllVideos();
                    router.push('/notifications');
                  }}
                  activeOpacity={0.8}
                >
                  <Ionicons name="notifications-outline" size={20} color="#EAB308" />
                </TouchableOpacity>

                <TouchableOpacity style={styles.createBtn} onPress={() => { stopAllVideos(); setCreatePostVisible(true); }} activeOpacity={0.85}>
                  <Ionicons name="add" size={16} color="#09090B" style={{ marginRight: 4 }} />
                  <Text style={styles.createBtnText}>Post</Text>
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.storiesContainer}>
              <TouchableOpacity style={styles.storyItem} onPress={handlePickStoryMedia} activeOpacity={0.85}>
                <View style={styles.myStoryRing}>
                  {liveAvatar ? (
                    <Image source={{ uri: liveAvatar }} style={styles.storyImg} />
                  ) : (
                    <View style={styles.avatarPlaceholder}>
                      <Text style={styles.avatarPlaceholderText}>{liveName ? liveName[0].toUpperCase() : 'P'}</Text>
                    </View>
                  )}
                  <View style={styles.plusBadge}>
                    <Ionicons name="add" size={12} color="#09090B" />
                  </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 6 }}>
                  <Text style={styles.storyName}>Add Story</Text>
                  {allUsersList.find(u => u.uid === currentUserId)?.isVip && (
                    <Ionicons name="checkmark-circle" size={12} color="#EAB308" />
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
                        group.isMine && styles.myStoryRingActive,
                        hasUnwatchedStories ? styles.unwatchedRing : styles.watchedRing
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
                        <View style={styles.avatarPlaceholder}>
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
                      activeOpacity={group.isMine ? 1 : 0.8}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 6 }}
                    >
                      <Text style={styles.storyName} numberOfLines={1}>{group.isMine ? 'Your Story' : group.name}</Text>
                      {groupUserObj?.isVip && (
                        <Ionicons name="checkmark-circle" size={12} color="#EAB308" />
                      )}
                    </TouchableOpacity>
                  </View>
                );
              })}
            </ScrollView>
          </>
        }
        ListEmptyComponent={
          <View style={styles.emptyFeedBox}>
            <Ionicons name="football-outline" size={48} color="#52525B" />
            <Text style={styles.emptyFeedText}>No posts found for your selected sports. Be the first to share!</Text>
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
            <View key={post.id} style={[styles.postCard, isPostPromoted && { borderColor: '#3B82F6', borderWidth: 1.5 }]}>
              
              <View style={styles.postHeader}>
                <TouchableOpacity style={styles.postAvatarBox} onPress={() => openUserProfileById(post.userId, post.authorName)} activeOpacity={0.85}>
                  {post.avatarUrl ? (
                    <Image source={{ uri: post.avatarUrl }} style={styles.avatarImg} />
                  ) : (
                    <View style={styles.avatarPlaceholder}>
                      <Text style={styles.avatarPlaceholderText}>{post.authorName ? post.authorName[0].toUpperCase() : 'P'}</Text>
                    </View>
                  )}
                </TouchableOpacity>
                
                <View style={styles.postUserInfo}>
                  <TouchableOpacity onPress={() => openUserProfileById(post.userId, post.authorName)} activeOpacity={0.85}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Text style={styles.postUserName}>{post.authorName}</Text>
                      {authorUserObj?.isVip && <Ionicons name="checkmark-circle" size={14} color="#EAB308" />}
                      {isPostPromoted && <Ionicons name="rocket" size={14} color="#3B82F6" style={{ marginLeft: 2 }} />}
                    </View>
                  </TouchableOpacity>
                  <Text style={styles.postUserMeta}>{post.authorMeta}</Text>
                </View>

                {post.sport && (
                  <View style={styles.sportBadge}>
                    <Text style={styles.sportBadgeText}>{post.sport}</Text>
                  </View>
                )}

                {(post.authorName === liveName || post.userId === currentUserId) && (
                  <TouchableOpacity onPress={() => handleDeletePost(post.id)} style={{ marginLeft: 8, marginRight: 4 }} activeOpacity={0.7}>
                    <Ionicons name="trash-outline" size={16} color="#EF4444" />
                  </TouchableOpacity>
                )}

                <Text style={styles.postTime}>{postTimeAgo}</Text>
              </View>

              <Text style={styles.postText}>{post.text}</Text>
              
              {post.imageUrl ? (
                <TouchableWithoutFeedback onPress={() => {
                  if (isVideo) setActiveVideoId(post.id);
                  handleDoubleTap(post.id);
                }}>
                  <View style={styles.postImageBox}>
                    {isVideo ? (
                      <PostVideoPlayer key={post.id} uri={post.imageUrl} isActive={isVideoActive} />
                    ) : (
                      <Image source={{ uri: post.imageUrl }} style={styles.postImageContent} />
                    )}
                  </View>
                </TouchableWithoutFeedback>
              ) : null}

              <View style={styles.postActionsRow}>
                <TouchableOpacity style={styles.actionBtn} onPress={() => toggleLike(post.id)} activeOpacity={0.7}>
                  <Ionicons 
                    name={post.isLiked ? "heart" : "heart-outline"} 
                    size={20} 
                    color={post.isLiked ? "#EF4444" : "#A1A1AA"} 
                  />
                  <Text style={[styles.actionText, post.isLiked && { color: '#EF4444', fontWeight: 'bold' }]}>
                    {post.likes} Likes
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.actionBtn} onPress={() => {
                  stopAllVideos();
                  setCommentsModalPost(post);
                }} activeOpacity={0.7}>
                  <Ionicons name="chatbubble-outline" size={18} color="#A1A1AA" />
                  <Text style={styles.actionText}>{post.comments.length} Comments</Text>
                </TouchableOpacity>
              </View>

            </View>
          );
        }}
      />

      {/* מודל תגובות */}
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
                  {commentsModalPost.comments.length === 0 ? (
                    <Text style={{ color: '#71717A', textAlign: 'center', marginVertical: 30, fontSize: 13 }}>No comments yet. Be the first to comment!</Text>
                  ) : (
                    commentsModalPost.comments.map(c => {
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
                  <TouchableOpacity style={styles.commentSendBtn} onPress={() => handleAddComment(commentsModalPost.id, true)} activeOpacity={0.85}>
                    <Ionicons name="send" size={14} color="#09090B" />
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* מודל יצירת סטורי */}
      <Modal visible={storyModalVisible} transparent={true} animationType="slide" onRequestClose={() => setStoryModalVisible(false)}>
        <View style={styles.storyModalOverlay}>
          <TouchableOpacity style={styles.closeStoryBtn} onPress={() => setStoryModalVisible(false)} activeOpacity={0.8}>
            <Ionicons name="close" size={24} color="#FAFAFA" />
          </TouchableOpacity>

          <View style={styles.storyEditorCard}>
            {selectedStoryUri && (
              <View style={styles.storyCanvasBox}>
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
              <View style={styles.controlGroup}>
                <TouchableOpacity style={styles.miniBtn} onPress={() => setStoryFontSize(prev => Math.max(12, prev - 2))} activeOpacity={0.7}>
                  <Text style={styles.miniBtnText}>A-</Text>
                </TouchableOpacity>
                <Text style={{ color: '#FAFAFA', fontSize: 12, marginHorizontal: 6, fontWeight: '700' }}>{storyFontSize}</Text>
                <TouchableOpacity style={styles.miniBtn} onPress={() => setStoryFontSize(prev => Math.min(40, prev + 2))} activeOpacity={0.7}>
                  <Text style={styles.miniBtnText}>A+</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.controlGroup}>
                <TouchableOpacity 
                  style={[styles.miniBtn, storyFontWeight === 'bold' && styles.activeMiniBtn]} 
                  onPress={() => setStoryFontWeight(prev => prev === 'bold' ? 'normal' : 'bold')}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.miniBtnText, { fontWeight: 'bold' }]}>B</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.miniBtn, storyFontStyle === 'italic' && styles.activeMiniBtn]} 
                  onPress={() => setStoryFontStyle(prev => prev === 'italic' ? 'normal' : 'italic')}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.miniBtnText, { fontStyle: 'italic' }]}>I</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.colorPaletteRow}>
              {['#ffffff', '#000000', '#EAB308', '#EF4444', '#22C55E', '#3B82F6', '#EC4899'].map(color => (
                <TouchableOpacity 
                  key={color} 
                  style={[styles.colorCircle, { backgroundColor: color }, storyTextColor === color && styles.selectedColorCircle]} 
                  onPress={() => setStoryTextColor(color)}
                  activeOpacity={0.8}
                />
              ))}
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bgOptionsRow}>
              <TouchableOpacity 
                style={[styles.bgOptionChip, storyBgColor === 'rgba(0,0,0,0.6)' && styles.activeBgChip]} 
                onPress={() => setStoryBgColor('rgba(0,0,0,0.6)')}
              >
                <Text style={styles.bgOptionText}>Dark BG</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.bgOptionChip, storyBgColor === 'rgba(255,255,255,0.8)' && styles.activeBgChip]} 
                onPress={() => setStoryBgColor('rgba(255,255,255,0.8)')}
              >
                <Text style={[styles.bgOptionText, { color: '#000' }]}>Light BG</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.bgOptionChip, storyBgColor === 'rgba(234,179,8,0.8)' && styles.activeBgChip]} 
                onPress={() => setStoryBgColor('rgba(234,179,8,0.8)')}
              >
                <Text style={[styles.bgOptionText, { color: '#000' }]}>Gold BG</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.bgOptionChip, storyBgColor === 'transparent' && styles.activeBgChip]} 
                onPress={() => setStoryBgColor('transparent')}
              >
                <Text style={styles.bgOptionText}>No BG</Text>
              </TouchableOpacity>
            </ScrollView>

            <TextInput 
              style={styles.storyTextInput} 
              placeholder="Type text on story..." 
              placeholderTextColor="#52525B"
              value={storyCaption}
              onChangeText={setStoryCaption}
            />

            <TouchableOpacity style={styles.publishStoryBtn} onPress={handlePublishStory} activeOpacity={0.85}>
              <Text style={styles.publishStoryBtnText}>Share to Story 🚀</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* מודל צפייה בסטורי */}
      <Modal visible={activeGroupIndex !== null} transparent={true} animationType="fade" onRequestClose={() => setActiveGroupIndex(null)}>
        <View style={styles.storyModalOverlay}>
          <TouchableOpacity style={styles.closeStoryBtn} onPress={() => { setActiveGroupIndex(null); setStoryCommentInput(''); }} activeOpacity={0.8}>
            <Ionicons name="close" size={24} color="#FAFAFA" />
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
                  <View style={styles.storyViewerCard}>
                    
                    <View style={styles.storyProgressBarsRow}>
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
                          <View key={st.id} style={styles.storyProgressBarContainer}>
                            <Animated.View style={[styles.storyProgressBarFill, { width: widthInterpolate }]} />
                          </View>
                        );
                      })}
                    </View>

                    <View style={styles.storyHeaderUserRow}>
                      <TouchableOpacity 
                        style={styles.storyHeaderUserBtn}
                        onPress={() => {
                          const sName = currentGroup.name;
                          const sUid = currentGroup.userUid;
                          setActiveGroupIndex(null);
                          setStoryCommentInput('');
                          openUserProfileById(sUid, sName);
                        }}
                        activeOpacity={0.8}
                      >
                        <View style={styles.storyHeaderAvatar}>
                          {currentGroup.avatarUrl ? (
                            <Image source={{ uri: currentGroup.avatarUrl }} style={styles.storyImg} />
                          ) : (
                            <Text style={{ color: '#EAB308', fontWeight: 'bold', fontSize: 11 }}>{currentGroup.name ? currentGroup.name[0] : 'P'}</Text>
                          )}
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Text style={styles.fullStoryName}>
                            {currentGroup.name} {isStoryMine ? '(me)' : ''}
                          </Text>
                          {headerUserObj?.isVip && <Ionicons name="checkmark-circle" size={13} color="#EAB308" />}
                        </View>
                      </TouchableOpacity>
                      <Text style={{ color: '#A1A1AA', fontSize: 11 }}>{storyTimeAgo}</Text>
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
                      <View style={styles.creatorInsightsBox}>
                        <Text style={styles.creatorInsightsTitle}>📊 Story Analytics</Text>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                          <Text style={{ color: '#EAB308', fontSize: 12 }}>👁️ Total Views: {storyViewersList.length}</Text>
                          <Text style={{ color: '#EAB308', fontSize: 12 }}>❤️ Total Likes: {storyLikesList.length}</Text>
                        </View>

                        <Text style={{ color: '#EAB308', fontSize: 12, fontWeight: 'bold', marginTop: 4, marginBottom: 2 }}>👥 Viewed by:</Text>
                        <ScrollView style={{ maxHeight: 70 }} nestedScrollEnabled={true}>
                          {storyViewersList.length === 0 ? (
                            <Text style={{ color: '#71717A', fontSize: 11, fontStyle: 'italic' }}>No views yet.</Text>
                          ) : (
                            storyViewersList.map(viewerUid => {
                              const viewerUser = allUsersList.find(u => u.uid === viewerUid);
                              if (!viewerUser) return null;
                              return (
                                <TouchableOpacity 
                                  key={viewerUid} 
                                  style={styles.viewerItemRow}
                                  onPress={() => {
                                    setActiveGroupIndex(null);
                                    openUserProfileById(viewerUser.uid, viewerUser.name);
                                  }}
                                  activeOpacity={0.8}
                                >
                                  {viewerUser.avatar ? (
                                    <Image source={{ uri: viewerUser.avatar }} style={styles.viewerAvatar} />
                                  ) : (
                                    <View style={[styles.viewerAvatar, { justifyContent: 'center', alignItems: 'center', backgroundColor: '#27272A' }]}>
                                      <Text style={{ color: '#EAB308', fontSize: 10, fontWeight: 'bold' }}>{viewerUser.name ? viewerUser.name[0] : 'U'}</Text>
                                    </View>
                                  )}
                                  <Text style={{ color: '#FAFAFA', fontSize: 11, fontWeight: '600', marginLeft: 6 }}>{viewerUser.name}</Text>
                                  {viewerUser.isVip && <Ionicons name="checkmark-circle" size={12} color="#EAB308" style={{ marginLeft: 4 }} />}
                                </TouchableOpacity>
                              );
                            })
                          )}
                        </ScrollView>
                        
                        <Text style={{ color: '#EAB308', fontSize: 12, fontWeight: 'bold', marginTop: 6, marginBottom: 4 }}>💬 Comments ({storyCommentsList.length}):</Text>
                        {storyCommentsList.length === 0 ? (
                          <Text style={{ color: '#71717A', fontSize: 11, fontStyle: 'italic' }}>No comments on this story yet.</Text>
                        ) : (
                          storyCommentsList.map(sc => (
                            <View key={sc.id} style={styles.storyCommentItem}>
                              <Text style={{ color: '#EAB308', fontWeight: 'bold', fontSize: 11 }}>{sc.user}:</Text>
                              <Text style={{ color: '#FAFAFA', fontSize: 11, marginLeft: 4 }}>{sc.text}</Text>
                            </View>
                          ))
                        )}
                      </View>
                    ) : (
                      <View style={{ alignItems: 'center', marginTop: 10, width: '100%', paddingHorizontal: 15 }}>
                        <TouchableOpacity style={styles.storyLikeRow} onPress={() => toggleStoryLike(currentStory.id)} activeOpacity={0.8}>
                          <Ionicons name={isStoryLiked ? "heart" : "heart-outline"} size={20} color={isStoryLiked ? "#EF4444" : "#FAFAFA"} />
                          <Text style={{ color: '#FAFAFA', fontSize: 13, fontWeight: 'bold' }}>{storyLikesList.length} Likes</Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    {!isStoryMine && (
                      <View style={styles.storyCommentInputRow}>
                        <TextInput 
                          style={styles.storyCommentInputField}
                          placeholder="Reply to story..."
                          placeholderTextColor="#52525B"
                          value={storyCommentInput}
                          onChangeText={setStoryCommentInput}
                        />
                        <TouchableOpacity style={styles.storyCommentSendBtn} onPress={() => handleAddStoryComment(currentStory.id)} activeOpacity={0.85}>
                           <Ionicons name="send" size={14} color="#09090B" />
                        </TouchableOpacity>
                      </View>
                    )}

                    {isStoryMine && (
                      <TouchableOpacity 
                        style={styles.deleteStoryIconBtn} 
                        onPress={() => handleDeleteStory(currentStory.id)}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="trash-outline" size={18} color="#EF4444" />
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

      {/* מודל פרופיל משתמש */}
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
                        stopAllVideos();
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
                      const isVid = post.mediaType === 'video';
                      return (
                        <TouchableOpacity 
                          key={post.id} 
                          style={styles.postThumbnailBox} 
                          onPress={() => {
                            stopAllVideos();
                            setSelectedPostModal(post);
                          }} 
                          activeOpacity={0.7}
                        >
                          {isVid ? (
                            <View style={[styles.postThumbnailImage, { backgroundColor: '#000', justifyContent: 'center', alignItems: 'center', position: 'relative' }]}>
                              <PostVideoPlayer key={`thumb_${post.id}`} uri={post.imageUrl || ''} isActive={false} />
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
            )}

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
                    <TouchableOpacity style={styles.postAvatarBox} onPress={() => { setSelectedPostModal(null); openUserProfileById(selectedPostModal.userId, selectedPostModal.authorName); }} activeOpacity={0.85}>
                      {selectedPostModal.avatarUrl ? (
                        <Image source={{ uri: selectedPostModal.avatarUrl }} style={styles.avatarImg} />
                      ) : (
                        <View style={styles.avatarPlaceholder}>
                          <Text style={styles.avatarPlaceholderText}>{selectedPostModal.authorName ? selectedPostModal.authorName[0].toUpperCase() : 'P'}</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                    
                    <View style={styles.postUserInfo}>
                      <TouchableOpacity onPress={() => { setSelectedPostModal(null); openUserProfileById(selectedPostModal.userId, selectedPostModal.authorName); }} activeOpacity={0.85}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Text style={styles.postUserName}>{selectedPostModal.authorName}</Text>
                          {allUsersList.find(u => u.uid === selectedPostModal.userId || u.name === selectedPostModal.authorName)?.isVip && <Ionicons name="checkmark-circle" size={14} color="#EAB308" />}
                        </View>
                      </TouchableOpacity>
                      <Text style={styles.postUserMeta}>{selectedPostModal.authorMeta}</Text>
                    </View>

                    {selectedPostModal.sport && (
                      <View style={styles.sportBadge}>
                        <Text style={styles.sportBadgeText}>{selectedPostModal.sport}</Text>
                      </View>
                    )}
                    <Text style={styles.postTime}>{getTimeAgo(selectedPostModal.createdAt)}</Text>
                  </View>

                  <Text style={styles.postText}>{selectedPostModal.text}</Text>
                  
                  {selectedPostModal.imageUrl ? (
                    <TouchableWithoutFeedback onPress={() => handleDoubleTap(selectedPostModal.id)}>
                      <View style={styles.postImageBox}>
                        {selectedPostModal.mediaType === 'video' ? (
                          <PostVideoPlayer key={`modal_${selectedPostModal.id}`} uri={selectedPostModal.imageUrl} isActive={true} />
                        ) : (
                          <Image source={{ uri: selectedPostModal.imageUrl }} style={styles.postImageContent} />
                        )}
                      </View>
                    </TouchableWithoutFeedback>
                  ) : null}

                  <View style={styles.postActionsRow}>
                    <TouchableOpacity style={styles.actionBtn} onPress={() => toggleLike(selectedPostModal.id)} activeOpacity={0.7}>
                      <Ionicons 
                        name={selectedPostModal.isLiked ? "heart" : "heart-outline"} 
                        size={20} 
                        color={selectedPostModal.isLiked ? "#EF4444" : "#A1A1AA"} 
                      />
                      <Text style={[styles.actionText, selectedPostModal.isLiked && { color: '#EF4444', fontWeight: 'bold' }]}>
                        {selectedPostModal.likes} Likes
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.actionBtn} onPress={() => { setSelectedPostModal(null); setCommentsModalPost(selectedPostModal); }} activeOpacity={0.7}>
                      <Ionicons name="chatbubble-outline" size={18} color="#A1A1AA" />
                      <Text style={styles.actionText}>{selectedPostModal.comments.length} Comments</Text>
                    </TouchableOpacity>
                  </View>

                </View>
              </ScrollView>
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

      {/* מודל רשימת עוקבים/נעקבים */}
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
              {(targetActiveModalList === 'followers' ? targetFollowersList : targetFollowingList).map((item: any) => (
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

      {/* מודל יצירת פוסט */}
      <Modal visible={createPostVisible} transparent={true} animationType="fade" onRequestClose={() => setCreatePostVisible(false)}>
        <View style={styles.modalOverlayCenter}>
          <View style={styles.modalContentCenter}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create New Post 📝</Text>
              <TouchableOpacity onPress={() => setCreatePostVisible(false)} activeOpacity={0.8}>
                <Ionicons name="close" size={24} color="#FAFAFA" />
              </TouchableOpacity>
            </View>

            <TextInput 
              style={styles.createPostInput} 
              placeholder="What's on your mind about football/sports?" 
              placeholderTextColor="#52525B" 
              multiline 
              value={newPostText} 
              onChangeText={newText => setNewPostText(newText)} 
            />

            <TouchableOpacity style={styles.pickImageBtn} onPress={pickPostMedia} activeOpacity={0.8}>
              <Ionicons name={newPostMediaType === 'video' ? 'videocam-outline' : 'image-outline'} size={18} color="#EAB308" />
              <Text style={styles.pickImageText}>
                {newPostImage ? (newPostMediaType === 'video' ? 'Video Attached ✓' : 'Image Attached ✓') : 'Attach Media from Gallery'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.publishBtn} onPress={handleCreatePost} activeOpacity={0.85}>
              <Text style={styles.publishBtnText}>Publish Post 🚀</Text>
            </TouchableOpacity>
          </View>
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
    alignItems: 'center' 
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
  selectedColorCircle: { borderWidth: 3, borderColor: '#FAFAFA' },

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
  
  storyHeaderUserRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', paddingHorizontal: 16, paddingVertical: 8 },
  storyHeaderUserBtn: { flexDirection: 'row', alignItems: 'center', gap: 10 },
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

  storyTapLeft: { position: 'absolute', top: 45, left: 0, width: '40%', height: '85%', zIndex: 10 },
  storyTapRight: { position: 'absolute', top: 45, right: 0, width: '40%', height: '85%', zIndex: 10 },

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

  listItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#09090B', padding: 12, borderRadius: 14, marginBottom: 8, borderWidth: 1, borderColor: '#27272A' },
  listAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#18181B', justifyContent: 'center', alignItems: 'center', marginRight: 12, borderWidth: 1, borderColor: '#EAB308', overflow: 'hidden' },
  listName: { color: '#FAFAFA', fontSize: 14, fontWeight: '700' },
  listCity: { color: '#A1A1AA', fontSize: 11, marginTop: 2 },

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

  zoomedAvatarOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center' },
  closeZoomedBtn: { position: 'absolute', top: 50, right: 20, zIndex: 30, backgroundColor: '#121215', width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#27272A' },
  zoomedAvatarImage: { width: width * 0.9, height: width * 0.9, resizeMode: 'contain', borderRadius: 20 }
});