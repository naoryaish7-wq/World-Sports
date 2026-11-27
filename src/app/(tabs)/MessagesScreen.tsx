import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Modal,
  TextInput,
  Alert,
  Image,
  ImageBackground,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { VideoView, useVideoPlayer } from 'expo-video';
import { setAudioModeAsync } from 'expo-audio';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Purchases from 'react-native-purchases';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  arrayUnion,
  arrayRemove,
  query,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase';

type MessageReactions = { [emoji: string]: string[] };

type ChatMessage = {
  id: string;
  senderId?: string;
  senderName?: string;
  text: string;
  imageUrl?: string;
  videoUrl?: string;
  mediaType?: 'image' | 'video';
  edited?: boolean;
  reactions?: MessageReactions;
  createdAt?: any;
};

type PendingMediaDraft = {
  uri: string;
  type: 'image' | 'video';
};

type LightboxMedia = {
  uri: string;
  type: 'image' | 'video';
  caption?: string;
  senderName?: string;
};

type UserProfile = {
  uid: string;
  name?: string;
  userName?: string;
  displayName?: string;
  city?: string;
  country?: string;
  age?: number;
  avatar?: string;
  sports?: string[];
  sport?: string;
  followers?: string[];
  following?: string[];
  pendingRequests?: string[];
  isVip?: boolean;
  isPrivate?: boolean;
  blockedUsers?: string[];
  notifications_chat?: boolean;
  notifications_likes?: boolean;
  notifications_follows?: boolean;
  notifications_matchActivity?: boolean;
  notifications_adminActions?: boolean;
  notifications_storiesPosts?: boolean;
};

type UserPostSummary = {
  id: string;
  userId?: string;
  userName?: string;
  authorName?: string;
  imageUrl?: string;
  caption?: string;
  text?: string;
  mediaType?: 'image' | 'video';
};

type PinnedMessageInfo = {
  id: string;
  text: string;
  senderName: string;
  senderId?: string;
};

type PersonalConversationItem = {
  chatId: string;
  otherUser: UserProfile;
  lastMessageText: string;
  lastUpdated?: any;
  pinnedMessage?: PinnedMessageInfo | null;
};

type CityGroupChat = {
  id: string;
  name: string;
  description?: string;
  avatar?: string;
  wallpaperUrl?: string;
  city: string;
  country?: string;
  sports?: string[];
  accessMode: 'public' | 'private';
  creatorId: string;
  admins: string[];
  members: string[];
  pendingRequests: string[];
  bannedUsers: string[];
  boostCount: number;
  boostContributors?: { [uid: string]: number };
  pinnedMessage?: PinnedMessageInfo | null;
  lastMessageText?: string;
  lastUpdated?: any;
  createdAt?: any;
};

type PaymentResult = {
  success: boolean;
  transactionId?: string;
  cancelled?: boolean;
  errorMessage?: string;
};

const MAX_PINNED_GROUPS = 3;

const SPORT_OPTIONS = [
  'Football',
  'Basketball',
  'Tennis',
  'Padel',
  'Volleyball',
  'Running',
  'Gym',
  'Swimming',
];

const SENDER_NAME_PALETTE = [
  '#38BDF8',
  '#4ADE80',
  '#F472B6',
  '#FB923C',
  '#A78BFA',
  '#2DD4BF',
  '#FACC15',
  '#F87171',
];

const QUICK_EMOJIS = [
  '👍', '❤️', '😂', '🔥', '😮', '👏',
  '😍', '🥳', '😭', '😡', '🙏', '💯',
  '⚽', '🏆', '🤝', '🫡', '🤔', '😅',
  '🎉', '💪', '👀', '✨', '❤️‍🔥', '💔',
];

const BOOST_PACKAGES = [
  {
    id: 'b1',
    boosts: 1,
    priceLabel: '$1',
    priceNum: 1,
    label: '1 Boost',
    badge: 'Starter',
    accentColor: '#22C55E',
    perk: 'Push your group toward Stage 2 (BG & 25 members)',
  },
  {
    id: 'b3',
    boosts: 3,
    priceLabel: '$2',
    priceNum: 2,
    label: '3 Boosts',
    badge: 'Save $1',
    accentColor: '#4ADE80',
    perk: 'Fast boost toward Stage 2 Silver Pulse',
  },
  {
    id: 'b5',
    boosts: 5,
    priceLabel: '$3',
    priceNum: 3,
    label: '5 Boosts',
    badge: 'Save $2',
    accentColor: '#38BDF8',
    perk: 'Halfway boost toward Stage 2 (up to 25 members)',
  },
  {
    id: 'b10',
    boosts: 10,
    priceLabel: '$5',
    priceNum: 5,
    label: '10 Boosts',
    badge: 'Save $5',
    accentColor: '#A78BFA',
    perk: 'Unlocks Stage 2 immediately (Chat BG + 25 members)',
  },
  {
    id: 'b15',
    boosts: 15,
    priceLabel: '$10',
    priceNum: 10,
    label: '15 Boosts',
    badge: 'Popular • Save $5',
    accentColor: '#EAB308',
    perk: 'Unlocks Stage 2 & pushes deep into Stage 3 (50 members)',
  },
  {
    id: 'b50',
    boosts: 50,
    priceLabel: '$35',
    priceNum: 35,
    label: '50 Boosts',
    badge: 'Pro Pack • Save $15',
    accentColor: '#EC4899',
    perk: 'Unlocks Stage 4 Platinum Riot (up to 100 members)',
  },
  {
    id: 'b100',
    boosts: 100,
    priceLabel: '$75',
    priceNum: 75,
    label: '100 Boosts',
    badge: 'Whale Pack • Save $25',
    accentColor: '#F97316',
    perk: 'Unlocks Stage 5 Diamond Overdrive (up to 200 members)',
  },
];

const BOOST_STAGES = [
  {
    stage: 1,
    minBoosts: 0,
    nextThreshold: 10,
    maxMembers: 10,
    allowBackground: false,
    title: 'Stage 1 • City Starter',
    shortBadge: 'T1 • 10 Max',
    color: '#A1A1AA',
    exposureSummary: 'Up to 10 members • Standard city listing.',
  },
  {
    stage: 2,
    minBoosts: 10,
    nextThreshold: 25,
    maxMembers: 25,
    allowBackground: true,
    title: 'Stage 2 • Silver Pulse',
    shortBadge: 'T2 • 25 Max',
    color: '#22C55E',
    exposureSummary: 'Up to 25 members • Unlocks Chat Background.',
  },
  {
    stage: 3,
    minBoosts: 25,
    nextThreshold: 50,
    maxMembers: 50,
    allowBackground: true,
    title: 'Stage 3 • Gold Spotlight',
    shortBadge: 'T3 • 50 Max',
    color: '#EAB308',
    exposureSummary: 'Up to 50 members • Gold spotlight + Background.',
  },
  {
    stage: 4,
    minBoosts: 50,
    nextThreshold: 90,
    maxMembers: 100,
    allowBackground: true,
    title: 'Stage 4 • Platinum Riot',
    shortBadge: 'T4 • 100 Max',
    color: '#C084FC',
    exposureSummary: 'Up to 100 members • High city visibility + full perks.',
  },
  {
    stage: 5,
    minBoosts: 90,
    nextThreshold: 150,
    maxMembers: 200,
    allowBackground: true,
    title: 'Stage 5 • Diamond Overdrive',
    shortBadge: 'T5 • 200 Max',
    color: '#38BDF8',
    exposureSummary: 'Up to 200 members • Elite city promotion + full perks.',
  },
  {
    stage: 6,
    minBoosts: 150,
    nextThreshold: null,
    maxMembers: null as number | null,
    allowBackground: true,
    title: 'Stage 6 • Mythic Crown',
    shortBadge: 'T6 • Unlimited',
    color: '#F97316',
    exposureSummary: 'Unlimited members • Top reach & full group perks.',
  },
];

const REVENUECAT_PRODUCT_IDS: Record<string, string> = {
  b1: 'group_boost_1',
  b3: 'group_boost_3',
  b5: 'group_boost_5',
  b10: 'group_boost_10',
  b15: 'group_boost_15',
  b50: 'group_boost_50',
  b100: 'group_boost_100',
};

const getBoostStageInfo = (boostCount: number) => {
  const safeCount = Math.max(0, boostCount || 0);
  let current = BOOST_STAGES[0];
  for (const st of BOOST_STAGES) {
    if (safeCount >= st.minBoosts) {
      current = st;
    }
  }

  const nextStage = BOOST_STAGES.find(s => s.stage === current.stage + 1) || null;
  let progressPercent = 100;
  let boostsToNext = 0;

  if (nextStage) {
    const span = nextStage.minBoosts - current.minBoosts;
    const intoSpan = safeCount - current.minBoosts;
    progressPercent = Math.max(0, Math.min(100, Math.round((intoSpan / span) * 100)));
    boostsToNext = Math.max(0, nextStage.minBoosts - safeCount);
  }

  return {
    current,
    nextStage,
    progressPercent,
    boostsToNext,
    maxMembers: current.maxMembers,
    maxMembersLabel: current.maxMembers === null ? 'Unlimited' : String(current.maxMembers),
    allowBackground: current.allowBackground,
  };
};

const getSenderNameColor = (seed?: string): string => {
  const value = (seed || 'player').trim();
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return SENDER_NAME_PALETTE[hash % SENDER_NAME_PALETTE.length];
};

const normalizeCity = (rawCity?: string): string => {
  const cleaned = (rawCity || '')
    .replace(/[-–]?(yafo|יפו)$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return 'Netanya';
  const lower = cleaned.toLowerCase();
  if (cleaned.includes('נתניה') || lower.includes('netanya')) return 'Netanya';
  if (cleaned.includes('תל אביב') || lower.includes('tel aviv') || lower.includes('tel-aviv')) return 'Tel Aviv';
  if (cleaned.includes('חיפה') || lower.includes('haifa')) return 'Haifa';
  if (cleaned.includes('ראשון לציון') || lower.includes('rishon')) return 'Rishon LeZion';
  if (cleaned.includes('ירושלים') || lower.includes('jerusalem')) return 'Jerusalem';
  if (cleaned.includes('באר שבע') || lower.includes('beer sheva') || lower.includes('beersheva')) return 'Beer Sheva';
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
};

const normalizeCountry = (rawCountry?: string): string => {
  const value = (rawCountry || '').trim();
  if (!value) return 'Israel';
  const lower = value.toLowerCase();
  if (value.includes('ישראל') || lower === 'il' || lower === 'israel') return 'Israel';
  if (lower === 'us' || lower === 'usa' || lower.includes('united states')) return 'United States';
  if (lower === 'uk' || lower.includes('united kingdom')) return 'United Kingdom';
  return value.charAt(0).toUpperCase() + value.slice(1);
};

const getDisplayName = (user?: Partial<UserProfile> | null): string => {
  if (!user) return 'Player';
  return (user.name || user.userName || user.displayName || 'Player').trim();
};

const formatTimeShort = (timestamp: any): string => {
  if (!timestamp) return '';
  try {
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    if (isNaN(date.getTime())) return '';
    const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
    if (diffSec < 60) return 'Now';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h`;
    return date.toLocaleDateString([], { day: '2-digit', month: '2-digit' });
  } catch {
    return '';
  }
};

const extractImageUrlFromText = (text?: string): string | null => {
  if (!text) return null;
  const match = text.match(/https?:\/\/\S+\.(?:png|jpe?g|webp|gif)(?:\?\S*)?/i);
  return match ? match[0] : null;
};

const isVideoFileExtension = (url?: string): boolean => {
  if (!url) return false;
  return /\.(?:mp4|mov|m4v|webm|3gp)(?:\?\S*)?$/i.test(url);
};

const resolveMessageMedia = (msg: ChatMessage): {
  imageUri: string | null;
  videoUri: string | null;
} => {
  if (msg.mediaType === 'image' && msg.imageUrl) {
    return { imageUri: msg.imageUrl, videoUri: null };
  }
  if (msg.mediaType === 'video' && msg.videoUrl) {
    return { imageUri: null, videoUri: msg.videoUrl };
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
  const textImg = extractImageUrlFromText(msg.text);
  if (textImg) {
    return { imageUri: textImg, videoUri: null };
  }
  return { imageUri: null, videoUri: null };
};

const processBoostPayment = async (
  pkg: (typeof BOOST_PACKAGES)[number],
  group: CityGroupChat,
  userId: string
): Promise<PaymentResult> => {
  try {
    if (!userId || !group?.id || pkg.priceNum <= 0) {
      return { success: false, errorMessage: 'Invalid payment details.' };
    }

    const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
    if (Platform.OS === 'web' || isExpoGo) {
      return {
        success: true,
        transactionId: `mock_boost_${pkg.id}_${Date.now()}`,
      };
    }

    const productIdentifier = REVENUECAT_PRODUCT_IDS[pkg.id] || pkg.id;
    const offerings = await Purchases.getOfferings();
    const packageToPurchase =
      offerings.current?.availablePackages.find(
        p => p.product.identifier === productIdentifier
      ) || offerings.current?.availablePackages[0];

    if (!packageToPurchase) {
      return {
        success: false,
        errorMessage: 'No active boost package found in store offerings.',
      };
    }

    const { customerInfo } = await Purchases.purchasePackage(packageToPurchase);
    if (!customerInfo) {
      return { success: false, errorMessage: 'Could not verify purchase.' };
    }

    return {
      success: true,
      transactionId:
        customerInfo.latestExpirationDate || `rc_boost_${pkg.id}_${Date.now()}`,
    };
  } catch (err: any) {
    if (err?.userCancelled) {
      return { success: false, cancelled: true };
    }
    return {
      success: false,
      errorMessage: err?.message || 'Payment failed.',
    };
  }
};

function ChatVideoPreview({
  uri,
  style,
  onLongPress,
  onPress,
}: {
  uri: string;
  style: any;
  onLongPress?: () => void;
  onPress?: () => void;
}) {
  const previewPlayer = useVideoPlayer(uri, p => {
    p.loop = false;
    p.muted = true;
    p.volume = 0;
  });

  useEffect(() => {
    try {
      previewPlayer.pause();
    } catch {}
  }, [previewPlayer, uri]);

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={260}
      style={[style, styles.videoPreviewCard]}
    >
      <VideoView
        player={previewPlayer}
        style={StyleSheet.absoluteFill}
        nativeControls={false}
        contentFit="cover"
      />
      <View style={styles.videoPlayCircle}>
        <Ionicons name="play" size={20} color="#09090B" />
      </View>
    </TouchableOpacity>
  );
}

function FullscreenMediaPlayer({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, p => {
    p.loop = false;
    p.muted = false;
    p.volume = 1.0;
  });

  useEffect(() => {
    try {
      player.play();
    } catch {}
    return () => {
      try {
        player.pause();
      } catch {}
    };
  }, [player]);

  return (
    <VideoView
      player={player}
      style={styles.lightboxVideo}
      nativeControls
      contentFit="contain"
    />
  );
}

export default function MessagesScreen() {
  const [activeTab, setActiveTab] = useState<'personal' | 'groups' | 'leaderboard'>('personal');
  const [currentUserId, setCurrentUserId] = useState('');
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [allPosts, setAllPosts] = useState<UserPostSummary[]>([]);
  const [blockedUsers, setBlockedUsers] = useState<string[]>([]);
  const [userCity, setUserCity] = useState('Netanya');
  const [userCountry, setUserCountry] = useState('Israel');

  const [localPersonalWallpapers, setLocalPersonalWallpapers] = useState<{ [chatId: string]: string }>({});

  const [leaderboardScope, setLeaderboardScope] = useState<'all' | 'country' | 'city'>('country');
  const [leaderboardSortBy, setLeaderboardSortBy] = useState<'reach' | 'boost' | 'members'>('reach');

  const [personalSearch, setPersonalSearch] = useState('');
  const [groupSearch, setGroupSearch] = useState('');
  const [groupSearchSports, setGroupSearchSports] = useState<string[]>(['All Sports']);
  const [groupFilterPanelOpen, setGroupFilterPanelOpen] = useState(false);

  const [personalConversations, setPersonalConversations] = useState<PersonalConversationItem[]>([]);
  const [cityGroups, setCityGroups] = useState<CityGroupChat[]>([]);
  const [pinnedGroupIds, setPinnedGroupIds] = useState<string[]>([]);

  const [newChatModalVisible, setNewChatModalVisible] = useState(false);
  const [newChatSearch, setNewChatSearch] = useState('');

  const [activePersonalUser, setActivePersonalUser] = useState<UserProfile | null>(null);
  const [personalMessages, setPersonalMessages] = useState<ChatMessage[]>([]);
  const [personalMessageInput, setPersonalMessageInput] = useState('');
  const [pendingPersonalMedia, setPendingPersonalMedia] = useState<PendingMediaDraft | null>(null);
  const [sendingPersonalMedia, setSendingPersonalMedia] = useState(false);
  const [personalSettingsVisible, setPersonalSettingsVisible] = useState(false);
  const [personalSettingsSection, setPersonalSettingsSection] = useState<'wall' | 'media'>('wall');
  const personalScrollRef = useRef<any>(null);
  const personalMessageOffsetsRef = useRef<{ [msgId: string]: number }>({});
  const [highlightedPersonalMsgId, setHighlightedPersonalMsgId] = useState<string | null>(null);

  const [createGroupModalVisible, setCreateGroupModalVisible] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');
  const [newGroupSports, setNewGroupSports] = useState<string[]>(['All Sports']);
  const [newGroupAccess, setNewGroupAccess] = useState<'public' | 'private'>('public');
  const [creatingGroup, setCreatingGroup] = useState(false);

  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [groupMessages, setGroupMessages] = useState<ChatMessage[]>([]);
  const [groupMessageInput, setGroupMessageInput] = useState('');
  const [pendingGroupMedia, setPendingGroupMedia] = useState<PendingMediaDraft | null>(null);
  const [sendingGroupMedia, setSendingGroupMedia] = useState(false);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const messageOffsetsRef = useRef<{ [msgId: string]: number }>({});

  const [groupSettingsModalVisible, setGroupSettingsModalVisible] = useState(false);
  const [groupSettingsSection, setGroupSettingsSection] = useState<'overview' | 'boost' | 'media' | 'members'>('overview');
  const [editGroupNameInput, setEditGroupNameInput] = useState('');
  const [editGroupDescInput, setEditGroupDescInput] = useState('');
  const [savingGroupInfo, setSavingGroupInfo] = useState(false);
  const [purchasingBoost, setPurchasingBoost] = useState(false);
  const [leavingOrClosingGroup, setLeavingOrClosingGroup] = useState(false);

  const [profileModalUser, setProfileModalUser] = useState<UserProfile | null>(null);
  const [targetActiveModalList, setTargetActiveModalList] = useState<'followers' | 'following' | null>(null);
  const [lightboxMedia, setLightboxMedia] = useState<LightboxMedia | null>(null);

  const [messageActionSheet, setMessageActionSheet] = useState<{
    scope: 'personal' | 'group';
    chatId?: string;
    group?: CityGroupChat;
    message: ChatMessage;
  } | null>(null);

  const [editingMessageTarget, setEditingMessageTarget] = useState<{
    scope: 'personal' | 'group';
    chatId?: string;
    groupId?: string;
    messageId: string;
    text: string;
  } | null>(null);
  const [editMessageDraft, setEditMessageDraft] = useState('');

  const groupScrollRef = useRef<any>(null);

  const activeGroup = cityGroups.find(g => g.id === activeGroupId) || null;
  const settingsGroup = activeGroup;
  const activeGroupWallpaper = activeGroup?.wallpaperUrl;
  const activeGroupStageInfo = getBoostStageInfo(activeGroup?.boostCount || 0);
  const isSportFilterActive = !groupSearchSports.includes('All Sports');

  const personalChatId =
    currentUserId && activePersonalUser
      ? [currentUserId, activePersonalUser.uid].sort().join('_')
      : undefined;

  const activePersonalConv =
    personalConversations.find(c => c.chatId === personalChatId) || null;

  const closeAllChatRooms = useCallback(() => {
    setActivePersonalUser(null);
    setActiveGroupId(null);
    setGroupSettingsModalVisible(false);
    setPersonalSettingsVisible(false);
    setPendingPersonalMedia(null);
    setPendingGroupMedia(null);
    setMessageActionSheet(null);
  }, []);

  useEffect(() => {
    setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: false,
      interruptionMode: 'mixWithOthers',
    }).catch(() => {});
  }, []);

  const toggleSportInMultiSelect = (
    currentSelection: string[],
    sport: string,
    setter: React.Dispatch<React.SetStateAction<string[]>>
  ) => {
    if (sport === 'All Sports') {
      setter(['All Sports']);
      return;
    }
    const withoutAll = currentSelection.filter(s => s !== 'All Sports');
    if (withoutAll.includes(sport)) {
      const next = withoutAll.filter(s => s !== sport);
      setter(next.length > 0 ? next : ['All Sports']);
    } else {
      setter([...withoutAll, sport]);
    }
  };

  const persistPinnedGroups = useCallback(
    async (nextPins: string[]) => {
      const capped = nextPins.slice(0, MAX_PINNED_GROUPS);
      setPinnedGroupIds(capped);
      if (currentUserId) {
        try {
          await AsyncStorage.setItem(`@pinned_city_groups_${currentUserId}`, JSON.stringify(capped));
        } catch (e) {
          console.error('Error saving pinned groups:', e);
        }
      }
    },
    [currentUserId]
  );

  const persistLocalPersonalWallpaper = useCallback(
    async (chatId: string, uri: string) => {
      setLocalPersonalWallpapers(prev => {
        const next = { ...prev };
        if (uri) {
          next[chatId] = uri;
        } else {
          delete next[chatId];
        }
        if (currentUserId) {
          AsyncStorage.setItem(
            `@personal_chat_wallpapers_${currentUserId}`,
            JSON.stringify(next)
          ).catch(() => {});
        }
        return next;
      });
    },
    [currentUserId]
  );

  const isBlockedBidirectional = useCallback(
    (otherUid?: string): boolean => {
      if (!otherUid || otherUid === currentUserId) return false;
      const iBlocked = blockedUsers.includes(otherUid);
      const otherObj = allUsers.find(u => u.uid === otherUid);
      const theyBlocked =
        Array.isArray(otherObj?.blockedUsers) && currentUserId
          ? otherObj.blockedUsers.includes(currentUserId)
          : false;
      return iBlocked || theyBlocked;
    },
    [allUsers, blockedUsers, currentUserId]
  );

  const sendSyncedNotification = useCallback(
    async (
      recipientUid: string,
      payload: {
        type: string;
        message: string;
        status?: string;
        groupId?: string;
      },
      prefKey?: 'chat' | 'likes' | 'follows' | 'matchActivity' | 'adminActions' | 'storiesPosts'
    ) => {
      if (!currentUserId || !recipientUid || recipientUid === currentUserId) return;
      if (isBlockedBidirectional(recipientUid)) return;

      const recipientObj = allUsers.find(u => u.uid === recipientUid);
      if (prefKey && recipientObj && recipientObj[`notifications_${prefKey}`] === false) {
        return;
      }

      try {
        await addDoc(collection(db, 'users', recipientUid, 'notifications'), {
          senderUid: currentUserId,
          senderName: getDisplayName(currentUser),
          type: payload.type,
          message: payload.message,
          status: payload.status || 'unread',
          ...(payload.groupId ? { groupId: payload.groupId } : {}),
          createdAt: serverTimestamp(),
        });
      } catch (e) {
        console.error('Error sending synced notification:', e);
      }
    },
    [currentUserId, currentUser, allUsers, isBlockedBidirectional]
  );

  useEffect(() => {
    let unsubUser: (() => void) | undefined;
    let liveDetectedCity = false;

    (async () => {
      try {
        const savedEmail = await AsyncStorage.getItem('@saved_user_email');
        const uid = savedEmail ? savedEmail.toLowerCase().replace(/[^a-z0-9]/g, '_') : '';

        if (uid) {
          setCurrentUserId(uid);

          const savedPinsRaw = await AsyncStorage.getItem(`@pinned_city_groups_${uid}`);
          if (savedPinsRaw) {
            const parsedPins = JSON.parse(savedPinsRaw);
            if (Array.isArray(parsedPins)) {
              setPinnedGroupIds(parsedPins.slice(0, MAX_PINNED_GROUPS));
            }
          }

          const savedWallsRaw = await AsyncStorage.getItem(`@personal_chat_wallpapers_${uid}`);
          if (savedWallsRaw) {
            const parsedWalls = JSON.parse(savedWallsRaw);
            if (parsedWalls && typeof parsedWalls === 'object') {
              setLocalPersonalWallpapers(parsedWalls);
            }
          }

          unsubUser = onSnapshot(doc(db, 'users', uid), snap => {
            if (snap.exists()) {
              const data = { uid: snap.id, ...(snap.data() as Omit<UserProfile, 'uid'>) };
              setCurrentUser(data);
              setBlockedUsers(Array.isArray(data.blockedUsers) ? data.blockedUsers : []);
              if (data.country) {
                const normCountry = normalizeCountry(data.country);
                setUserCountry(normCountry);
              }
              if (!liveDetectedCity && data.city) {
                setUserCity(normalizeCity(data.city));
              }
            }
          });
        }

        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          const geo = await Location.reverseGeocodeAsync({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          });
          if (geo.length > 0) {
            const rawDetected = geo[0].city || geo[0].subregion || '';
            if (rawDetected) {
              liveDetectedCity = true;
              setUserCity(normalizeCity(rawDetected));
            }
            if (geo[0].country) {
              const normGeoCountry = normalizeCountry(geo[0].country);
              setUserCountry(normGeoCountry);
            }
          }
        }
      } catch (e) {
        console.error('Error initializing MessagesScreen:', e);
      }
    })();

    return () => {
      if (unsubUser) unsubUser();
    };
  }, []);

  useEffect(() => {
    const unsubUsers = onSnapshot(collection(db, 'users'), snap => {
      const list: UserProfile[] = snap.docs.map(d => ({
        uid: d.id,
        ...(d.data() as Omit<UserProfile, 'uid'>),
      }));
      setAllUsers(list);
    });
    return () => unsubUsers();
  }, []);

  useEffect(() => {
    const unsubPosts = onSnapshot(collection(db, 'posts'), snap => {
      const list: UserPostSummary[] = snap.docs.map(d => ({
        id: d.id,
        ...(d.data() as any),
      }));
      setAllPosts(list);
    });
    return () => unsubPosts();
  }, []);

  useEffect(() => {
    if (!currentUserId) {
      setPersonalConversations([]);
      return;
    }

    const qChats = query(collection(db, 'chats'), orderBy('lastUpdated', 'desc'));

    const unsubChats = onSnapshot(qChats, snap => {
      const items: PersonalConversationItem[] = [];

      snap.docs.forEach(docSnap => {
        const data = docSnap.data();
        const participants: string[] = Array.isArray(data.participants) ? data.participants : [];
        if (!participants.includes(currentUserId)) return;

        const otherUid = participants.find(p => p !== currentUserId);
        if (!otherUid) return;
        if (isBlockedBidirectional(otherUid)) return;

        const otherUser = allUsers.find(u => u.uid === otherUid) || {
          uid: otherUid,
          name: otherUid,
          city: userCity,
        };

        items.push({
          chatId: docSnap.id,
          otherUser,
          lastMessageText: data.lastMessageText || 'Start chatting...',
          lastUpdated: data.lastUpdated,
          pinnedMessage: data.pinnedMessage || null,
        });
      });

      setPersonalConversations(items);
    });

    return () => unsubChats();
  }, [currentUserId, allUsers, userCity, isBlockedBidirectional]);

  useEffect(() => {
    const qGroups = query(collection(db, 'cityGroups'), orderBy('lastUpdated', 'desc'));
    const unsubGroups = onSnapshot(qGroups, snap => {
      const list: CityGroupChat[] = snap.docs.map(d => {
        const raw = d.data() as any;
        return {
          id: d.id,
          name: raw.name || 'City Group',
          description: raw.description || '',
          avatar: raw.avatar || '',
          wallpaperUrl: raw.wallpaperUrl || '',
          city: normalizeCity(raw.city),
          country: normalizeCountry(raw.country),
          sports: Array.isArray(raw.sports) && raw.sports.length > 0 ? raw.sports : ['All Sports'],
          accessMode: raw.accessMode === 'private' ? 'private' : 'public',
          creatorId: raw.creatorId || '',
          admins: Array.isArray(raw.admins) ? raw.admins : raw.creatorId ? [raw.creatorId] : [],
          members: Array.isArray(raw.members) ? raw.members : [],
          pendingRequests: Array.isArray(raw.pendingRequests) ? raw.pendingRequests : [],
          bannedUsers: Array.isArray(raw.bannedUsers) ? raw.bannedUsers : [],
          boostCount: typeof raw.boostCount === 'number' ? raw.boostCount : 0,
          boostContributors:
            raw.boostContributors && typeof raw.boostContributors === 'object' ? raw.boostContributors : {},
          pinnedMessage: raw.pinnedMessage || null,
          lastMessageText: raw.lastMessageText || '',
          lastUpdated: raw.lastUpdated,
          createdAt: raw.createdAt,
        };
      });
      setCityGroups(list);
    });

    return () => unsubGroups();
  }, []);

  useEffect(() => {
    if (!currentUserId || !activePersonalUser) {
      setPersonalMessages([]);
      return;
    }

    const chatId = [currentUserId, activePersonalUser.uid].sort().join('_');
    const qMsgs = query(
      collection(db, 'chats', chatId, 'messages'),
      orderBy('createdAt', 'asc')
    );

    const unsubMsgs = onSnapshot(qMsgs, snap => {
      const msgs: ChatMessage[] = snap.docs.map(d => ({
        id: d.id,
        ...(d.data() as any),
      }));
      setPersonalMessages(msgs);
      setTimeout(() => {
        (personalScrollRef.current as any)?.scrollToEnd({ animated: true });
      }, 80);
    });

    return () => unsubMsgs();
  }, [currentUserId, activePersonalUser]);

  useEffect(() => {
    if (!activeGroupId) {
      setGroupMessages([]);
      return;
    }

    const qGroupMsgs = query(
      collection(db, 'cityGroups', activeGroupId, 'messages'),
      orderBy('createdAt', 'asc')
    );

    const unsubGroupMsgs = onSnapshot(qGroupMsgs, snap => {
      const msgs: ChatMessage[] = snap.docs
        .map(d => ({
          id: d.id,
          ...(d.data() as any),
        }))
        .filter(m => !isBlockedBidirectional(m.senderId));
      setGroupMessages(msgs);
      setTimeout(() => {
        (groupScrollRef.current as any)?.scrollToEnd({ animated: true });
      }, 80);
    });

    return () => unsubGroupMsgs();
  }, [activeGroupId, isBlockedBidirectional]);

  const isCurrentUserGroupCreator = useCallback(
    (group: CityGroupChat | null): boolean => {
      if (!group || !currentUserId) return false;
      return group.creatorId === currentUserId;
    },
    [currentUserId]
  );

  const isCurrentUserGroupAdmin = useCallback(
    (group: CityGroupChat | null): boolean => {
      if (!group || !currentUserId) return false;
      return group.admins.includes(currentUserId) || group.creatorId === currentUserId;
    },
    [currentUserId]
  );

  const isCurrentUserGroupMember = useCallback(
    (group: CityGroupChat | null): boolean => {
      if (!group || !currentUserId) return false;
      if (group.bannedUsers?.includes(currentUserId)) return false;
      return group.members.includes(currentUserId) || group.admins.includes(currentUserId);
    },
    [currentUserId]
  );

  const handleOpenUserProfile = useCallback(
    (targetUid?: string, fallbackName?: string) => {
      if (!targetUid) return;
      const found = allUsers.find(u => u.uid === targetUid) || {
        uid: targetUid,
        name: fallbackName || targetUid,
        city: userCity,
        country: userCountry,
        sports: ['Football'],
        followers: [],
        following: [],
        pendingRequests: [],
      };
      setTargetActiveModalList(null);
      setMessageActionSheet(null);
      setLightboxMedia(null);

      if (activePersonalUser || activeGroupId) {
        closeAllChatRooms();
        setTimeout(() => {
          setProfileModalUser(found);
        }, 140);
      } else {
        setProfileModalUser(found);
      }
    },
    [allUsers, userCity, userCountry, activePersonalUser, activeGroupId, closeAllChatRooms]
  );

  const handleOpenMediaLightbox = useCallback(
    (media: LightboxMedia) => {
      setMessageActionSheet(null);

      if (activePersonalUser || activeGroupId) {
        closeAllChatRooms();
        setTimeout(() => {
          setLightboxMedia(media);
        }, 140);
      } else {
        setLightboxMedia(media);
      }
    },
    [activePersonalUser, activeGroupId, closeAllChatRooms]
  );

  const handleCloseProfileModal = useCallback(() => {
    setTargetActiveModalList(null);
    setProfileModalUser(null);
  }, []);

  const handleToggleFollowInProfileModal = async (targetUser: UserProfile) => {
    if (!currentUserId || !targetUser?.uid || targetUser.uid === currentUserId) return;
    if (isBlockedBidirectional(targetUser.uid)) {
      Alert.alert('Unavailable', 'You cannot follow this user while a block is active.');
      return;
    }

    const isApproved = Array.isArray(targetUser.followers) && targetUser.followers.includes(currentUserId);
    const hasRequested =
      Array.isArray(targetUser.pendingRequests) && targetUser.pendingRequests.includes(currentUserId);
    const isPrivate = targetUser.isPrivate === true;

    try {
      const myRef = doc(db, 'users', currentUserId);
      const targetRef = doc(db, 'users', targetUser.uid);

      if (isApproved) {
        await updateDoc(targetRef, { followers: arrayRemove(currentUserId) });
        await updateDoc(myRef, { following: arrayRemove(targetUser.uid) });
        setProfileModalUser(prev =>
          prev && prev.uid === targetUser.uid
            ? { ...prev, followers: (prev.followers || []).filter(id => id !== currentUserId) }
            : prev
        );
      } else if (hasRequested) {
        await updateDoc(targetRef, { pendingRequests: arrayRemove(currentUserId) });
        setProfileModalUser(prev =>
          prev && prev.uid === targetUser.uid
            ? {
                ...prev,
                pendingRequests: (prev.pendingRequests || []).filter(id => id !== currentUserId),
              }
            : prev
        );
      } else if (isPrivate) {
        await updateDoc(targetRef, { pendingRequests: arrayUnion(currentUserId) });
        await sendSyncedNotification(
          targetUser.uid,
          {
            type: 'follow_request',
            message: `${getDisplayName(currentUser)} requested to follow you.`,
            status: 'pending',
          },
          'follows'
        );
        setProfileModalUser(prev =>
          prev && prev.uid === targetUser.uid
            ? { ...prev, pendingRequests: [...(prev.pendingRequests || []), currentUserId] }
            : prev
        );
      } else {
        await updateDoc(targetRef, { followers: arrayUnion(currentUserId) });
        await updateDoc(myRef, { following: arrayUnion(targetUser.uid) });
        await sendSyncedNotification(
          targetUser.uid,
          {
            type: 'follow',
            message: `${getDisplayName(currentUser)} started following you.`,
            status: 'unread',
          },
          'follows'
        );
        setProfileModalUser(prev =>
          prev && prev.uid === targetUser.uid
            ? { ...prev, followers: [...(prev.followers || []), currentUserId] }
            : prev
        );
      }
    } catch (e) {
      console.error('Error toggling follow from profile modal:', e);
    }
  };

  const handleToggleBlockInProfileModal = async (targetUser: UserProfile) => {
    if (!currentUserId || !targetUser?.uid || targetUser.uid === currentUserId) return;
    const alreadyBlocked = blockedUsers.includes(targetUser.uid);

    if (alreadyBlocked) {
      try {
        await updateDoc(doc(db, 'users', currentUserId), {
          blockedUsers: arrayRemove(targetUser.uid),
        });
        Alert.alert('User Unblocked', `${getDisplayName(targetUser)} has been unblocked.`);
      } catch (e) {
        console.error('Error unblocking user:', e);
      }
      return;
    }

    Alert.alert(
      'Block User',
      `Block ${getDisplayName(targetUser)}? You will not see each other's content or messages.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: async () => {
            try {
              await updateDoc(doc(db, 'users', currentUserId), {
                blockedUsers: arrayUnion(targetUser.uid),
                following: arrayRemove(targetUser.uid),
                followers: arrayRemove(targetUser.uid),
                pendingRequests: arrayRemove(targetUser.uid),
              });
              await updateDoc(doc(db, 'users', targetUser.uid), {
                following: arrayRemove(currentUserId),
                followers: arrayRemove(currentUserId),
                pendingRequests: arrayRemove(currentUserId),
              });
              setTargetActiveModalList(null);
              setProfileModalUser(null);
              if (activePersonalUser?.uid === targetUser.uid) {
                setActivePersonalUser(null);
                setPersonalSettingsVisible(false);
              }
              Alert.alert('User Blocked', `${getDisplayName(targetUser)} has been blocked.`);
            } catch (e) {
              console.error('Error blocking user:', e);
            }
          },
        },
      ]
    );
  };

  const handlePickPersonalWallpaper = async (chatId: string) => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission Needed', 'Please allow photo library access.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [9, 16],
        quality: 0.7,
      });

      if (!result.canceled && result.assets && result.assets[0]?.uri) {
        await persistLocalPersonalWallpaper(chatId, result.assets[0].uri);
      }
    } catch (e) {
      console.error('Error updating personal chat wallpaper:', e);
    }
  };

  const handleClearPersonalWallpaper = async (chatId: string) => {
    try {
      await persistLocalPersonalWallpaper(chatId, '');
    } catch (e) {
      console.error('Error clearing personal wallpaper:', e);
    }
  };

  const handlePinMessage = async (
    payload: {
      scope: 'personal' | 'group';
      chatId?: string;
      groupId?: string;
      message: ChatMessage;
    }
  ) => {
    const pinnedObj: PinnedMessageInfo = {
      id: payload.message.id,
      text:
        payload.message.text ||
        (payload.message.mediaType === 'video' ? '🎬 Video' : '🖼️ Photo'),
      senderName: payload.message.senderName || 'Player',
      senderId: payload.message.senderId,
    };

    try {
      if (payload.scope === 'personal' && payload.chatId) {
        await setDoc(doc(db, 'chats', payload.chatId), { pinnedMessage: pinnedObj }, { merge: true });
      } else if (payload.scope === 'group' && payload.groupId) {
        await updateDoc(doc(db, 'cityGroups', payload.groupId), { pinnedMessage: pinnedObj });
      }
    } catch (e) {
      console.error('Error pinning message:', e);
    }
  };

  const handleUnpinPersonalMessage = async (chatId: string) => {
    try {
      await setDoc(doc(db, 'chats', chatId), { pinnedMessage: null }, { merge: true });
    } catch (e) {
      console.error('Error unpinning personal message:', e);
    }
  };

  const handleJumpToPersonalPinnedMessage = (msgId: string) => {
    const yOffset = personalMessageOffsetsRef.current[msgId];
    if (typeof yOffset === 'number' && personalScrollRef.current) {
      personalScrollRef.current.scrollTo({ y: Math.max(0, yOffset - 16), animated: true });
      setHighlightedPersonalMsgId(msgId);
      setTimeout(() => {
        setHighlightedPersonalMsgId(prev => (prev === msgId ? null : prev));
      }, 1600);
    }
  };

  const handleOpenGroupSettings = (
    group: CityGroupChat,
    initialSection: 'overview' | 'boost' | 'media' | 'members' = 'overview'
  ) => {
    if (!isCurrentUserGroupMember(group)) {
      Alert.alert('Join Required', 'Join the group first to open group settings.');
      return;
    }
    setEditGroupNameInput(group.name || '');
    setEditGroupDescInput(group.description || '');
    setGroupSettingsSection(initialSection);
    setGroupSettingsModalVisible(true);
  };

  const handleCloseGroupSettings = () => {
    setGroupSettingsModalVisible(false);
  };

  const handleLeaveGroup = async (group: CityGroupChat) => {
    if (!currentUserId || !isCurrentUserGroupMember(group) || leavingOrClosingGroup) return;

    const allParticipants = Array.from(new Set([...group.admins, ...group.members]));
    const remainingOthers = allParticipants.filter(uid => uid !== currentUserId);
    const isCreator = group.creatorId === currentUserId;
    const isOnlyAdmin =
      group.admins.includes(currentUserId) &&
      group.admins.filter(uid => uid !== currentUserId).length === 0;

    if (isCreator && isOnlyAdmin && remainingOthers.length === 0) {
      Alert.alert(
        'Last Member in Group',
        'You are the creator and the last member. Do you want to close and delete this group instead?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Close Group',
            style: 'destructive',
            onPress: () => handleCloseGroup(group),
          },
        ]
      );
      return;
    }

    Alert.alert(
      'Leave Group',
      `Leave "${group.name}"?${
        isCreator && isOnlyAdmin && remainingOthers.length > 0
          ? ' Admin rights will pass to another group member.'
          : ''
      }`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            setLeavingOrClosingGroup(true);
            try {
              const nextMembers = group.members.filter(uid => uid !== currentUserId);
              let nextAdmins = group.admins.filter(uid => uid !== currentUserId);
              if (nextAdmins.length === 0 && remainingOthers.length > 0) {
                nextAdmins = [remainingOthers[0]];
              }

              await updateDoc(doc(db, 'cityGroups', group.id), {
                members: nextMembers,
                admins: nextAdmins,
                pendingRequests: arrayRemove(currentUserId),
              });

              if (pinnedGroupIds.includes(group.id)) {
                await persistPinnedGroups(pinnedGroupIds.filter(id => id !== group.id));
              }

              closeAllChatRooms();
              Alert.alert('Left Group', `You have left "${group.name}".`);
            } catch (e) {
              console.error('Error leaving group:', e);
              Alert.alert('Error', 'Could not leave the group.');
            } finally {
              setLeavingOrClosingGroup(false);
            }
          },
        },
      ]
    );
  };

  const handleCloseGroup = async (group: CityGroupChat) => {
    if (!currentUserId || !isCurrentUserGroupCreator(group) || leavingOrClosingGroup) {
      if (!isCurrentUserGroupCreator(group)) {
        Alert.alert('Creator Only', 'Only the group creator can close this group.');
      }
      return;
    }

    Alert.alert(
      'Close Group Permanently',
      `Close "${group.name}" for all members? This will permanently remove the group and its chat.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Close Group',
          style: 'destructive',
          onPress: async () => {
            setLeavingOrClosingGroup(true);
            try {
              const memberTargets = Array.from(
                new Set([...group.members, ...group.admins])
              ).filter(uid => uid && uid !== currentUserId && !isBlockedBidirectional(uid));

              await Promise.all(
                memberTargets.map(uid =>
                  sendSyncedNotification(
                    uid,
                    {
                      type: 'group_closed',
                      message: `The group "${group.name}" was closed by its creator.`,
                      status: 'unread',
                    },
                    'adminActions'
                  )
                )
              );

              if (pinnedGroupIds.includes(group.id)) {
                await persistPinnedGroups(pinnedGroupIds.filter(id => id !== group.id));
              }

              closeAllChatRooms();

              await deleteDoc(doc(db, 'cityGroups', group.id));
              Alert.alert('Group Closed', `"${group.name}" has been closed.`);
            } catch (e) {
              console.error('Error closing group:', e);
              Alert.alert('Error', 'Could not close the group.');
            } finally {
              setLeavingOrClosingGroup(false);
            }
          },
        },
      ]
    );
  };

  const handleLongPressPinGroup = async (group: CityGroupChat) => {
    if (group.bannedUsers?.includes(currentUserId)) return;
    const isAlreadyPinned = pinnedGroupIds.includes(group.id);
    let nextPins: string[];

    if (isAlreadyPinned) {
      nextPins = pinnedGroupIds.filter(id => id !== group.id);
    } else {
      if (pinnedGroupIds.length >= MAX_PINNED_GROUPS) {
        Alert.alert(
          'Pin Limit Reached',
          `You can pin up to ${MAX_PINNED_GROUPS} groups. Long-press a pinned group to unpin it.`
        );
        return;
      }
      nextPins = [group.id, ...pinnedGroupIds];
    }

    await persistPinnedGroups(nextPins);
  };

  const handleSaveGroupDetails = async (group: CityGroupChat) => {
    if (!isCurrentUserGroupAdmin(group)) {
      Alert.alert('Admins Only', 'Only group admins can edit the group name or description.');
      return;
    }
    if (!editGroupNameInput.trim()) {
      Alert.alert('Missing Name', 'Group name cannot be empty.');
      return;
    }

    setSavingGroupInfo(true);
    try {
      await updateDoc(doc(db, 'cityGroups', group.id), {
        name: editGroupNameInput.trim(),
        description: editGroupDescInput.trim(),
      });
      Alert.alert('Saved', 'Group name and description updated.');
    } catch (e) {
      console.error('Error saving group details:', e);
      Alert.alert('Error', 'Could not update group details.');
    } finally {
      setSavingGroupInfo(false);
    }
  };

  const handlePickGroupAvatar = async (group: CityGroupChat) => {
    if (!isCurrentUserGroupAdmin(group)) {
      Alert.alert('Admins Only', 'Only group admins can change the group profile photo.');
      return;
    }

    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission Needed', 'Please allow photo library access.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });

      if (!result.canceled && result.assets && result.assets[0]?.uri) {
        await updateDoc(doc(db, 'cityGroups', group.id), {
          avatar: result.assets[0].uri,
        });
      }
    } catch (e) {
      console.error('Error updating group avatar:', e);
      Alert.alert('Error', 'Could not update group photo.');
    }
  };

  const handlePickGroupWallpaper = async (group: CityGroupChat) => {
    if (!isCurrentUserGroupAdmin(group)) {
      Alert.alert('Admins Only', 'Only group admins can change the chat background.');
      return;
    }

    const stageInfo = getBoostStageInfo(group.boostCount || 0);
    if (!stageInfo.allowBackground) {
      Alert.alert(
        'Boost Stage 2 Required',
        'Chat background images unlock at Boost Stage 2 (10+ boosts, up to 25 members). Open the Boost tab to upgrade!'
      );
      return;
    }

    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission Needed', 'Please allow photo library access to set a background image.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [9, 16],
        quality: 0.7,
      });

      if (!result.canceled && result.assets && result.assets[0]?.uri) {
        await updateDoc(doc(db, 'cityGroups', group.id), {
          wallpaperUrl: result.assets[0].uri,
        });
      }
    } catch (e) {
      console.error('Error picking group wallpaper:', e);
      Alert.alert('Error', 'Could not update group background image.');
    }
  };

  const handleClearGroupWallpaper = async (group: CityGroupChat) => {
    if (!isCurrentUserGroupAdmin(group)) {
      Alert.alert('Admins Only', 'Only group admins can remove the chat background.');
      return;
    }
    try {
      await updateDoc(doc(db, 'cityGroups', group.id), {
        wallpaperUrl: '',
      });
    } catch (e) {
      console.error('Error clearing group wallpaper:', e);
    }
  };

  const handleBuyGroupBoost = async (group: CityGroupChat, pkg: (typeof BOOST_PACKAGES)[number]) => {
    if (!currentUserId) {
      Alert.alert('Error', 'User session not found.');
      return;
    }

    Alert.alert(
      `Confirm Payment • ${pkg.priceLabel}`,
      `Charge ${pkg.priceLabel} for ${pkg.label} on "${group.name}"?\n(${pkg.perk})`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: `Pay ${pkg.priceLabel}`,
          onPress: async () => {
            setPurchasingBoost(true);
            try {
              const payment = await processBoostPayment(pkg, group, currentUserId);

              if (!payment.success) {
                if (!payment.cancelled) {
                  Alert.alert(
                    'Payment Not Completed',
                    payment.errorMessage || 'Could not complete the payment.'
                  );
                }
                return;
              }

              const currentBoosts = group.boostCount || 0;
              const nextBoosts = currentBoosts + pkg.boosts;
              const prevUserBoosts =
                (group.boostContributors && group.boostContributors[currentUserId]) || 0;
              const nextStageInfo = getBoostStageInfo(nextBoosts);

              await addDoc(collection(db, 'boostTransactions'), {
                groupId: group.id,
                groupName: group.name,
                buyerId: currentUserId,
                packageId: pkg.id,
                productId: REVENUECAT_PRODUCT_IDS[pkg.id] || pkg.id,
                boostsAdded: pkg.boosts,
                amountUsd: pkg.priceNum,
                transactionId: payment.transactionId || `tx_${Date.now()}`,
                status: 'paid',
                createdAt: serverTimestamp(),
              });

              await updateDoc(doc(db, 'cityGroups', group.id), {
                boostCount: nextBoosts,
                [`boostContributors.${currentUserId}`]: prevUserBoosts + pkg.boosts,
              });

              Alert.alert(
                'Payment Approved!',
                `Charged ${pkg.priceLabel} • +${pkg.boosts} boosts added (${nextBoosts} total).\nCurrent Tier: ${nextStageInfo.current.title} (${
                  nextStageInfo.maxMembers === null
                    ? 'Unlimited members'
                    : `Max ${nextStageInfo.maxMembers} members`
                })`
              );
            } catch (e) {
              console.error('Error boosting group:', e);
              Alert.alert('Error', 'Could not complete boost purchase.');
            } finally {
              setPurchasingBoost(false);
            }
          },
        },
      ]
    );
  };

  const handleUnpinGroupMessage = async (group: CityGroupChat) => {
    if (!isCurrentUserGroupAdmin(group)) {
      return;
    }
    try {
      await updateDoc(doc(db, 'cityGroups', group.id), {
        pinnedMessage: null,
      });
    } catch (e) {
      console.error('Error unpinning message:', e);
    }
  };

  const handleJumpToPinnedMessage = (msgId: string) => {
    const yOffset = messageOffsetsRef.current[msgId];
    if (typeof yOffset === 'number' && groupScrollRef.current) {
      groupScrollRef.current.scrollTo({ y: Math.max(0, yOffset - 16), animated: true });
      setHighlightedMessageId(msgId);
      setTimeout(() => {
        setHighlightedMessageId(prev => (prev === msgId ? null : prev));
      }, 1600);
    }
  };

  const handleKickUserFromGroup = async (group: CityGroupChat, targetUid?: string) => {
    if (!targetUid) return;
    if (!isCurrentUserGroupAdmin(group)) {
      Alert.alert('Admins Only', 'Only group admins can kick members from the group.');
      return;
    }
    if (targetUid === group.creatorId) {
      Alert.alert('Protected Creator', 'The group creator cannot be kicked.');
      return;
    }

    const targetUser = allUsers.find(u => u.uid === targetUid);
    const targetName = getDisplayName(targetUser) || targetUid;

    Alert.alert(
      'Kick From Group',
      `Remove ${targetName} from "${group.name}"? They can rejoin if the group is public.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Kick',
          style: 'destructive',
          onPress: async () => {
            try {
              await updateDoc(doc(db, 'cityGroups', group.id), {
                members: arrayRemove(targetUid),
                admins: arrayRemove(targetUid),
                pendingRequests: arrayRemove(targetUid),
              });
              await sendSyncedNotification(
                targetUid,
                {
                  type: 'admin_kick',
                  message: `You were removed from the group "${group.name}".`,
                  groupId: group.id,
                  status: 'unread',
                },
                'adminActions'
              );
              Alert.alert('Kicked', `${targetName} has been removed from "${group.name}".`);
            } catch (e) {
              console.error('Error kicking user from group:', e);
              Alert.alert('Error', 'Could not kick user.');
            }
          },
        },
      ]
    );
  };

  const handleBanUserFromGroup = async (group: CityGroupChat, targetUid?: string) => {
    if (!targetUid) return;
    if (!isCurrentUserGroupAdmin(group)) {
      Alert.alert('Admins Only', 'Only group admins can ban users from the group.');
      return;
    }
    if (targetUid === group.creatorId) {
      Alert.alert('Protected Creator', 'The group creator cannot be banned.');
      return;
    }

    const targetUser = allUsers.find(u => u.uid === targetUid);
    const targetName = getDisplayName(targetUser) || targetUid;

    Alert.alert(
      'Ban & Block From Group',
      `Ban ${targetName} from "${group.name}"? They will be removed and will no longer see this group.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Ban User',
          style: 'destructive',
          onPress: async () => {
            try {
              await updateDoc(doc(db, 'cityGroups', group.id), {
                bannedUsers: arrayUnion(targetUid),
                members: arrayRemove(targetUid),
                admins: arrayRemove(targetUid),
                pendingRequests: arrayRemove(targetUid),
              });
              await sendSyncedNotification(
                targetUid,
                {
                  type: 'admin_ban',
                  message: `You were banned from the group "${group.name}".`,
                  groupId: group.id,
                  status: 'unread',
                },
                'adminActions'
              );
              Alert.alert('Banned', `${targetName} is now banned from seeing "${group.name}".`);
            } catch (e) {
              console.error('Error banning user from group:', e);
              Alert.alert('Error', 'Could not ban user.');
            }
          },
        },
      ]
    );
  };

  const handleUnbanUserFromGroup = async (group: CityGroupChat, targetUid: string) => {
    if (!isCurrentUserGroupAdmin(group)) return;
    try {
      await updateDoc(doc(db, 'cityGroups', group.id), {
        bannedUsers: arrayRemove(targetUid),
      });
    } catch (e) {
      console.error('Error unbanning user:', e);
    }
  };

  const handleToggleEmojiReaction = async (
    payload: {
      scope: 'personal' | 'group';
      chatId?: string;
      groupId?: string;
      message: ChatMessage;
    },
    emoji: string
  ) => {
    if (!currentUserId) return;
    const msgRef =
      payload.scope === 'personal' && payload.chatId
        ? doc(db, 'chats', payload.chatId, 'messages', payload.message.id)
        : payload.groupId
        ? doc(db, 'cityGroups', payload.groupId, 'messages', payload.message.id)
        : null;

    if (!msgRef) return;

    const currentList =
      (payload.message.reactions && Array.isArray(payload.message.reactions[emoji])
        ? payload.message.reactions[emoji]
        : []) || [];
    const hasReacted = currentList.includes(currentUserId);
    const updatedList = hasReacted
      ? currentList.filter(u => u !== currentUserId)
      : [...currentList, currentUserId];

    try {
      await updateDoc(msgRef, {
        [`reactions.${emoji}`]: updatedList,
      });
    } catch (e) {
      console.error('Error updating reaction:', e);
    }
  };

  const handleDeleteMessage = async (payload: {
    scope: 'personal' | 'group';
    chatId?: string;
    groupId?: string;
    message: ChatMessage;
    groupObj?: CityGroupChat;
  }) => {
    const isSender = !!currentUserId && payload.message.senderId === currentUserId;
    const isGroupAdmin =
      payload.scope === 'group' && isCurrentUserGroupAdmin(payload.groupObj || null);

    if (!isSender && !isGroupAdmin) {
      Alert.alert('Not Allowed', 'You can only delete your own messages unless you are a group admin.');
      return;
    }

    const msgRef =
      payload.scope === 'personal' && payload.chatId
        ? doc(db, 'chats', payload.chatId, 'messages', payload.message.id)
        : payload.groupId
        ? doc(db, 'cityGroups', payload.groupId, 'messages', payload.message.id)
        : null;

    if (!msgRef) return;

    Alert.alert('Delete Message', 'Delete this message permanently?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteDoc(msgRef);
            if (
              payload.scope === 'group' &&
              payload.groupId &&
              payload.groupObj?.pinnedMessage?.id === payload.message.id
            ) {
              await updateDoc(doc(db, 'cityGroups', payload.groupId), {
                pinnedMessage: null,
              });
            } else if (
              payload.scope === 'personal' &&
              payload.chatId &&
              activePersonalConv?.pinnedMessage?.id === payload.message.id
            ) {
              await setDoc(doc(db, 'chats', payload.chatId), { pinnedMessage: null }, { merge: true });
            }
          } catch (e) {
            console.error('Error deleting message:', e);
            Alert.alert('Error', 'Could not delete message.');
          }
        },
      },
    ]);
  };

  const handleStartEditMessage = (payload: {
    scope: 'personal' | 'group';
    chatId?: string;
    groupId?: string;
    message: ChatMessage;
  }) => {
    if (!currentUserId || payload.message.senderId !== currentUserId) {
      Alert.alert('Sender Only', 'Only the message sender can edit this message.');
      return;
    }
    setEditingMessageTarget({
      scope: payload.scope,
      chatId: payload.chatId,
      groupId: payload.groupId,
      messageId: payload.message.id,
      text: payload.message.text || '',
    });
    setEditMessageDraft(payload.message.text || '');
  };

  const handleSaveEditedMessage = async () => {
    if (!editingMessageTarget) return;
    const trimmed = editMessageDraft.trim();
    if (!trimmed) {
      Alert.alert('Empty Message', 'Message text cannot be empty.');
      return;
    }

    const msgRef =
      editingMessageTarget.scope === 'personal' && editingMessageTarget.chatId
        ? doc(db, 'chats', editingMessageTarget.chatId, 'messages', editingMessageTarget.messageId)
        : editingMessageTarget.groupId
        ? doc(db, 'cityGroups', editingMessageTarget.groupId, 'messages', editingMessageTarget.messageId)
        : null;

    if (!msgRef) return;

    try {
      await updateDoc(msgRef, {
        text: trimmed,
        edited: true,
      });
      setEditingMessageTarget(null);
      setEditMessageDraft('');
    } catch (e) {
      console.error('Error saving edited message:', e);
      Alert.alert('Error', 'Could not edit message.');
    }
  };

  const handleReportMessage = async (msg: ChatMessage, groupId?: string) => {
    if (!currentUserId) return;
    try {
      await addDoc(collection(db, 'messageReports'), {
        reporterId: currentUserId,
        reporterName: getDisplayName(currentUser),
        reportedSenderId: msg.senderId || '',
        reportedSenderName: msg.senderName || 'Player',
        messageId: msg.id,
        messageText: msg.text || '',
        ...(groupId ? { groupId } : {}),
        createdAt: serverTimestamp(),
      });
      Alert.alert('Report Sent', 'Thank you. This message has been reported for review.');
    } catch (e) {
      console.error('Error reporting message:', e);
      Alert.alert('Error', 'Could not submit report.');
    }
  };

  const handleOpenPersonalChat = (user: UserProfile) => {
    if (user.uid === currentUserId) return;
    if (isBlockedBidirectional(user.uid)) {
      Alert.alert('Unavailable', 'You cannot chat with this user.');
      return;
    }
    setNewChatModalVisible(false);
    setNewChatSearch('');
    setPendingPersonalMedia(null);
    setPersonalSettingsVisible(false);
    setActiveGroupId(null);
    setActivePersonalUser(user);
  };

  const handlePickPersonalMediaDraft = async (mode: 'image' | 'video') => {
    if (!currentUserId || !activePersonalUser) return;
    if (isBlockedBidirectional(activePersonalUser.uid)) {
      Alert.alert('Blocked', 'Messaging is unavailable between you and this user.');
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

      setPendingPersonalMedia({
        uri: result.assets[0].uri,
        type: mode,
      });
    } catch (e) {
      console.error('Error selecting personal media:', e);
      Alert.alert('Error', 'Could not select media.');
    }
  };

  const handleSendPersonalMessage = async () => {
    if (!currentUserId || !activePersonalUser) return;
    if (isBlockedBidirectional(activePersonalUser.uid)) {
      Alert.alert('Blocked', 'Messaging is unavailable between you and this user.');
      return;
    }

    const text = personalMessageInput.trim();
    const media = pendingPersonalMedia;

    if (!text && !media) return;

    const detectedImage = !media ? extractImageUrlFromText(text) : null;
    setPersonalMessageInput('');
    setPendingPersonalMedia(null);
    if (media) setSendingPersonalMedia(true);

    const chatId = [currentUserId, activePersonalUser.uid].sort().join('_');
    const previewText =
      text || (media?.type === 'video' ? 'Sent a video' : media?.type === 'image' ? 'Sent a photo' : '');

    try {
      await setDoc(
        doc(db, 'chats', chatId),
        {
          participants: [currentUserId, activePersonalUser.uid],
          lastMessageText: previewText,
          lastUpdated: serverTimestamp(),
        },
        { merge: true }
      );

      await addDoc(collection(db, 'chats', chatId, 'messages'), {
        senderId: currentUserId,
        senderName: getDisplayName(currentUser),
        text,
        ...(media
          ? {
              mediaType: media.type,
              ...(media.type === 'video' ? { videoUrl: media.uri } : { imageUrl: media.uri }),
            }
          : detectedImage
          ? { imageUrl: detectedImage, mediaType: 'image' as const }
          : {}),
        createdAt: serverTimestamp(),
      });

      await sendSyncedNotification(
        activePersonalUser.uid,
        {
          type: 'message',
          message: `${getDisplayName(currentUser)} sent you a message: "${previewText.slice(0, 30)}" 💬`,
          status: 'unread',
        },
        'chat'
      );
    } catch (e) {
      console.error('Error sending personal message:', e);
      Alert.alert('Error', 'Could not send message.');
    } finally {
      setSendingPersonalMedia(false);
    }
  };

  const handleCreateCityGroup = async () => {
    if (!newGroupName.trim()) {
      Alert.alert('Missing Name', 'Please enter a group chat name.');
      return;
    }
    if (!currentUserId) {
      Alert.alert('Error', 'User session not found.');
      return;
    }

    setCreatingGroup(true);
    try {
      const normalizedCity = normalizeCity(userCity);
      const normalizedCountry = normalizeCountry(userCountry);
      const docRef = await addDoc(collection(db, 'cityGroups'), {
        name: newGroupName.trim(),
        description: newGroupDesc.trim(),
        avatar: '',
        wallpaperUrl: '',
        city: normalizedCity,
        country: normalizedCountry,
        sports: newGroupSports.length > 0 ? newGroupSports : ['All Sports'],
        accessMode: newGroupAccess,
        creatorId: currentUserId,
        admins: [currentUserId],
        members: [currentUserId],
        pendingRequests: [],
        bannedUsers: [],
        boostCount: 0,
        boostContributors: {},
        pinnedMessage: null,
        lastMessageText: 'Group created',
        lastUpdated: serverTimestamp(),
        createdAt: serverTimestamp(),
      });

      setNewGroupName('');
      setNewGroupDesc('');
      setNewGroupSports(['All Sports']);
      setNewGroupAccess('public');
      setCreateGroupModalVisible(false);
      setActiveGroupId(docRef.id);
    } catch (e) {
      console.error('Error creating city group:', e);
      Alert.alert('Error', 'Could not create group chat.');
    } finally {
      setCreatingGroup(false);
    }
  };

  const handleJoinOrRequestGroup = async (group: CityGroupChat) => {
    if (!currentUserId) return;
    if (group.bannedUsers?.includes(currentUserId)) {
      Alert.alert('Banned', 'You are banned from this group.');
      return;
    }

    const isMember = isCurrentUserGroupMember(group);
    if (isMember) {
      setActiveGroupId(group.id);
      return;
    }

    const stageInfo = getBoostStageInfo(group.boostCount || 0);
    const currentMemberCount = Array.from(new Set([...group.admins, ...group.members])).length;
    if (stageInfo.maxMembers !== null && currentMemberCount >= stageInfo.maxMembers) {
      Alert.alert(
        'Group Capacity Reached',
        `This group is currently at ${stageInfo.current.title} (${stageInfo.maxMembers} members max). Boosting increases the member limit.`
      );
      return;
    }

    if (group.accessMode === 'public') {
      try {
        await updateDoc(doc(db, 'cityGroups', group.id), {
          members: arrayUnion(currentUserId),
        });
      } catch (e) {
        console.error('Error joining public group:', e);
        Alert.alert('Error', 'Could not join group.');
      }
      return;
    }

    const alreadyRequested = group.pendingRequests.includes(currentUserId);
    try {
      if (alreadyRequested) {
        await updateDoc(doc(db, 'cityGroups', group.id), {
          pendingRequests: arrayRemove(currentUserId),
        });
        Alert.alert('Request Cancelled', 'Join request cancelled.');
      } else {
        await updateDoc(doc(db, 'cityGroups', group.id), {
          pendingRequests: arrayUnion(currentUserId),
        });

        const adminTargets = Array.from(
          new Set(group.admins.length > 0 ? group.admins : [group.creatorId])
        ).filter(uid => uid && uid !== currentUserId && !isBlockedBidirectional(uid));

        await Promise.all(
          adminTargets.map(adminUid =>
            sendSyncedNotification(
              adminUid,
              {
                type: 'group_join_request',
                message: `${getDisplayName(currentUser)} requested to join "${group.name}". 🔒`,
                groupId: group.id,
                status: 'unread',
              },
              'follows'
            )
          )
        );

        Alert.alert('Request Sent', 'Your request was sent to the group admins.');
      }
    } catch (e) {
      console.error('Error toggling group request:', e);
      Alert.alert('Error', 'Could not update join request.');
    }
  };

  const handleApproveGroupRequest = async (group: CityGroupChat, reqUid: string) => {
    const stageInfo = getBoostStageInfo(group.boostCount || 0);
    const currentMemberCount = Array.from(new Set([...group.admins, ...group.members])).length;
    if (stageInfo.maxMembers !== null && currentMemberCount >= stageInfo.maxMembers) {
      Alert.alert(
        'Member Limit Reached',
        `Cannot approve more members at ${stageInfo.current.title} (Max ${stageInfo.maxMembers}). Boost the group to raise the limit.`
      );
      return;
    }

    try {
      await updateDoc(doc(db, 'cityGroups', group.id), {
        pendingRequests: arrayRemove(reqUid),
        members: arrayUnion(reqUid),
      });
      await sendSyncedNotification(
        reqUid,
        {
          type: 'group_request_approved',
          message: `You were approved to join "${group.name}"! 🎉`,
          groupId: group.id,
          status: 'unread',
        },
        'matchActivity'
      );
    } catch (e) {
      console.error('Error approving group request:', e);
    }
  };

  const handleRejectGroupRequest = async (group: CityGroupChat, reqUid: string) => {
    try {
      await updateDoc(doc(db, 'cityGroups', group.id), {
        pendingRequests: arrayRemove(reqUid),
      });
    } catch (e) {
      console.error('Error rejecting group request:', e);
    }
  };

  const handleToggleGroupAdmin = async (group: CityGroupChat, targetUid: string) => {
    if (targetUid === group.creatorId) {
      Alert.alert('Group Owner', 'The group creator always keeps admin privileges.');
      return;
    }

    const isTargetAdmin = group.admins.includes(targetUid);
    try {
      await updateDoc(doc(db, 'cityGroups', group.id), {
        admins: isTargetAdmin ? arrayRemove(targetUid) : arrayUnion(targetUid),
        members: arrayUnion(targetUid),
      });
    } catch (e) {
      console.error('Error updating group admin:', e);
    }
  };

  const handlePickGroupMediaDraft = async (mode: 'image' | 'video') => {
    if (!currentUserId || !activeGroup || !isCurrentUserGroupMember(activeGroup)) return;

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

      setPendingGroupMedia({
        uri: result.assets[0].uri,
        type: mode,
      });
    } catch (e) {
      console.error('Error selecting group media:', e);
      Alert.alert('Error', 'Could not select media.');
    }
  };

  const handleSendGroupMessage = async () => {
    if (!currentUserId || !activeGroup) return;
    if (!isCurrentUserGroupMember(activeGroup)) {
      Alert.alert('Members Only', 'Join the group first to send messages.');
      return;
    }

    const text = groupMessageInput.trim();
    const media = pendingGroupMedia;
    if (!text && !media) return;

    const detectedImage = !media ? extractImageUrlFromText(text) : null;
    setGroupMessageInput('');
    setPendingGroupMedia(null);
    if (media) setSendingGroupMedia(true);

    const previewText =
      text || (media?.type === 'video' ? 'Sent a video' : media?.type === 'image' ? 'Sent a photo' : '');

    try {
      await addDoc(collection(db, 'cityGroups', activeGroup.id, 'messages'), {
        senderId: currentUserId,
        senderName: getDisplayName(currentUser),
        text,
        ...(media
          ? {
              mediaType: media.type,
              ...(media.type === 'video' ? { videoUrl: media.uri } : { imageUrl: media.uri }),
            }
          : detectedImage
          ? { imageUrl: detectedImage, mediaType: 'image' as const }
          : {}),
        createdAt: serverTimestamp(),
      });

      await updateDoc(doc(db, 'cityGroups', activeGroup.id), {
        lastMessageText: `${getDisplayName(currentUser)}: ${previewText}`,
        lastUpdated: serverTimestamp(),
      });
    } catch (e) {
      console.error('Error sending group message:', e);
      Alert.alert('Error', 'Could not send group message.');
    } finally {
      setSendingGroupMedia(false);
    }
  };

  const filteredPersonalChats = personalConversations.filter(item => {
    if (!personalSearch.trim()) return true;
    const q = personalSearch.trim().toLowerCase();
    const nameMatch = getDisplayName(item.otherUser).toLowerCase().includes(q);
    const msgMatch = item.lastMessageText.toLowerCase().includes(q);
    return nameMatch || msgMatch;
  });

  const filteredCityGroups = cityGroups
    .filter(group => {
      if (currentUserId && group.bannedUsers?.includes(currentUserId)) return false;
      const sameCity = normalizeCity(group.city).toLowerCase() === normalizeCity(userCity).toLowerCase();
      if (!sameCity) return false;

      const groupSports =
        Array.isArray(group.sports) && group.sports.length > 0 ? group.sports : ['All Sports'];
      const matchesSportFilter =
        groupSearchSports.includes('All Sports') ||
        groupSports.includes('All Sports') ||
        groupSports.some(s => groupSearchSports.includes(s));

      if (!matchesSportFilter) return false;

      if (!groupSearch.trim()) return true;
      const q = groupSearch.trim().toLowerCase();
      return (
        group.name.toLowerCase().includes(q) ||
        (group.description || '').toLowerCase().includes(q) ||
        groupSports.some(s => s.toLowerCase().includes(q))
      );
    })
    .sort((a, b) => {
      const aPinIdx = pinnedGroupIds.indexOf(a.id);
      const bPinIdx = pinnedGroupIds.indexOf(b.id);
      if (aPinIdx !== -1 && bPinIdx !== -1) return aPinIdx - bPinIdx;
      if (aPinIdx !== -1) return -1;
      if (bPinIdx !== -1) return 1;
      return (b.boostCount || 0) - (a.boostCount || 0);
    });

  const rankedCountryGroups = useMemo(() => {
    const visibleGroups = cityGroups.filter(
      g => !(currentUserId && g.bannedUsers?.includes(currentUserId))
    );
    const targetCountry = normalizeCountry(userCountry);
    const targetCity = normalizeCity(userCity);

    const scopedGroups =
      leaderboardScope === 'city'
        ? visibleGroups.filter(g => normalizeCity(g.city).toLowerCase() === targetCity.toLowerCase())
        : leaderboardScope === 'country'
        ? visibleGroups.filter(
            g => normalizeCountry(g.country).toLowerCase() === targetCountry.toLowerCase()
          )
        : visibleGroups;

    return scopedGroups
      .map(g => {
        const stageInfo = getBoostStageInfo(g.boostCount || 0);
        const membersCount = Array.from(new Set([...g.admins, ...g.members])).length;
        const reachScore =
          (g.boostCount || 0) * 120 + membersCount * 25 + (g.accessMode === 'public' ? 60 : 20);
        return {
          group: g,
          stageInfo,
          membersCount,
          reachScore,
        };
      })
      .sort((a, b) => {
        if (leaderboardSortBy === 'boost') {
          return (b.group.boostCount || 0) - (a.group.boostCount || 0) || b.reachScore - a.reachScore;
        }
        if (leaderboardSortBy === 'members') {
          return b.membersCount - a.membersCount || b.reachScore - a.reachScore;
        }
        return b.reachScore - a.reachScore;
      });
  }, [cityGroups, currentUserId, userCountry, userCity, leaderboardScope, leaderboardSortBy]);

  const selectableUsersForNewChat = allUsers.filter(u => {
    if (!u.uid || u.uid === currentUserId) return false;
    if (isBlockedBidirectional(u.uid)) return false;
    if (!newChatSearch.trim()) return true;
    const q = newChatSearch.trim().toLowerCase();
    const display = getDisplayName(u).toLowerCase();
    const city = (u.city || '').toLowerCase();
    return display.includes(q) || city.includes(q);
  });

  const groupMediaItems = groupMessages
    .map(msg => {
      const { imageUri, videoUri } = resolveMessageMedia(msg);
      const uri = imageUri || videoUri;
      if (!uri) return null;
      return {
        id: msg.id,
        uri,
        type: (videoUri ? 'video' : 'image') as 'image' | 'video',
        caption: msg.text || '',
        senderName: msg.senderName || 'Player',
        createdAt: msg.createdAt,
      };
    })
    .filter(
      (
        m
      ): m is {
        id: string;
        uri: string;
        type: 'image' | 'video';
        caption: string;
        senderName: string;
        createdAt: any;
      } => !!m
    );

  const personalMediaItems = personalMessages
    .map(msg => {
      const { imageUri, videoUri } = resolveMessageMedia(msg);
      const uri = imageUri || videoUri;
      if (!uri) return null;
      return {
        id: msg.id,
        uri,
        type: (videoUri ? 'video' : 'image') as 'image' | 'video',
        caption: msg.text || '',
        senderName: msg.senderName || 'Player',
        createdAt: msg.createdAt,
      };
    })
    .filter(
      (
        m
      ): m is {
        id: string;
        uri: string;
        type: 'image' | 'video';
        caption: string;
        senderName: string;
        createdAt: any;
      } => !!m
    );

  const isMemberInActiveGroup = isCurrentUserGroupMember(activeGroup);
  const activePersonalWallpaper = personalChatId ? localPersonalWallpapers[personalChatId] || '' : '';

  const liveProfileUser = profileModalUser
    ? allUsers.find(u => u.uid === profileModalUser.uid) || profileModalUser
    : null;

  const liveProfilePosts = liveProfileUser
    ? allPosts.filter(
        p =>
          p.userId === liveProfileUser.uid ||
          p.userName === liveProfileUser.name ||
          p.authorName === liveProfileUser.name
      )
    : [];

  const targetFollowersList = liveProfileUser
    ? allUsers.filter(
        u =>
          Array.isArray(liveProfileUser.followers) &&
          liveProfileUser.followers.includes(u.uid) &&
          !isBlockedBidirectional(u.uid)
      )
    : [];

  const targetFollowingList = liveProfileUser
    ? allUsers.filter(
        u =>
          Array.isArray(liveProfileUser.following) &&
          liveProfileUser.following.includes(u.uid) &&
          !isBlockedBidirectional(u.uid)
      )
    : [];

  const myFollowersList = currentUser
    ? allUsers.filter(
        u =>
          Array.isArray(currentUser.followers) &&
          currentUser.followers.includes(u.uid) &&
          !isBlockedBidirectional(u.uid)
      )
    : [];

  const myFollowingList = currentUser
    ? allUsers.filter(
        u =>
          Array.isArray(currentUser.following) &&
          currentUser.following.includes(u.uid) &&
          !isBlockedBidirectional(u.uid)
      )
    : [];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>MESSAGES • {normalizeCity(userCity).toUpperCase()}</Text>
          <Text style={styles.headerTitle}>
            Chats <Text style={styles.accent}>Hub</Text>
          </Text>
        </View>
      </View>

      <View style={styles.subTabsRow}>
        <TouchableOpacity
          style={[styles.subTabBtn, activeTab === 'personal' && styles.subTabBtnActive]}
          onPress={() => setActiveTab('personal')}
          activeOpacity={0.85}
        >
          <Ionicons
            name="chatbubble-ellipses"
            size={15}
            color={activeTab === 'personal' ? '#09090B' : '#A1A1AA'}
          />
          <Text style={[styles.subTabText, activeTab === 'personal' && styles.subTabTextActive]}>
            Personal
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.subTabBtn, activeTab === 'groups' && styles.subTabBtnActive]}
          onPress={() => setActiveTab('groups')}
          activeOpacity={0.85}
        >
          <Ionicons
            name="people"
            size={15}
            color={activeTab === 'groups' ? '#09090B' : '#A1A1AA'}
          />
          <Text style={[styles.subTabText, activeTab === 'groups' && styles.subTabTextActive]}>
            Groups ({filteredCityGroups.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.subTabBtn, activeTab === 'leaderboard' && styles.subTabBtnActive]}
          onPress={() => setActiveTab('leaderboard')}
          activeOpacity={0.85}
        >
          <Ionicons
            name="trophy"
            size={15}
            color={activeTab === 'leaderboard' ? '#09090B' : '#A1A1AA'}
          />
          <Text style={[styles.subTabText, activeTab === 'leaderboard' && styles.subTabTextActive]}>
            Country Board
          </Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'personal' ? (
        <View style={styles.tabBody}>
          <View style={styles.searchActionRow}>
            <View style={styles.searchBox}>
              <Ionicons name="search" size={16} color="#71717A" />
              <TextInput
                style={styles.searchInput}
                placeholder="Search"
                placeholderTextColor="#71717A"
                value={personalSearch}
                onChangeText={setPersonalSearch}
              />
              {personalSearch.length > 0 && (
                <TouchableOpacity onPress={() => setPersonalSearch('')}>
                  <Ionicons name="close-circle" size={16} color="#71717A" />
                </TouchableOpacity>
              )}
            </View>

            <TouchableOpacity
              style={styles.iconActionBtn}
              onPress={() => {
                setNewChatSearch('');
                setNewChatModalVisible(true);
              }}
              activeOpacity={0.85}
            >
              <Ionicons name="create-outline" size={20} color="#09090B" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
            {filteredPersonalChats.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="chatbubbles-outline" size={38} color="#52525B" />
                <Text style={styles.emptyTitle}>No personal chats yet</Text>
                <Text style={styles.emptySub}>
                  Tap the compose icon to search a player and start a direct chat.
                </Text>
                <TouchableOpacity
                  style={styles.emptyPrimaryBtn}
                  onPress={() => {
                    setNewChatSearch('');
                    setNewChatModalVisible(true);
                  }}
                >
                  <Text style={styles.emptyPrimaryBtnText}>New Chat</Text>
                </TouchableOpacity>
              </View>
            ) : (
              filteredPersonalChats.map(conv => {
                const name = getDisplayName(conv.otherUser);
                return (
                  <TouchableOpacity
                    key={conv.chatId}
                    style={styles.listCard}
                    onPress={() => handleOpenPersonalChat(conv.otherUser)}
                    activeOpacity={0.85}
                  >
                    <TouchableOpacity
                      style={styles.avatarCircle}
                      onPress={() => handleOpenUserProfile(conv.otherUser.uid, name)}
                      activeOpacity={0.8}
                    >
                      {conv.otherUser.avatar ? (
                        <Image source={{ uri: conv.otherUser.avatar }} style={styles.avatarImg} />
                      ) : (
                        <Text style={styles.avatarLetter}>{name[0]?.toUpperCase() || 'P'}</Text>
                      )}
                    </TouchableOpacity>

                    <View style={{ flex: 1 }}>
                      <View style={styles.cardTopLine}>
                        <TouchableOpacity
                          onPress={() => handleOpenUserProfile(conv.otherUser.uid, name)}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                        >
                          <Text style={styles.cardTitle}>{name}</Text>
                          {conv.otherUser.isVip && (
                            <Ionicons name="checkmark-circle" size={14} color="#EAB308" />
                          )}
                        </TouchableOpacity>
                        <Text style={styles.timeLabel}>{formatTimeShort(conv.lastUpdated)}</Text>
                      </View>
                      <Text style={styles.cardSubtitle} numberOfLines={1}>
                        {conv.lastMessageText}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>
        </View>
      ) : activeTab === 'groups' ? (
        <View style={styles.tabBody}>
          <View style={styles.searchActionRow}>
            <View style={styles.searchBox}>
              <Ionicons name="search" size={16} color="#71717A" />
              <TextInput
                style={styles.searchInput}
                placeholder="Search groups..."
                placeholderTextColor="#71717A"
                value={groupSearch}
                onChangeText={setGroupSearch}
              />
              {groupSearch.length > 0 && (
                <TouchableOpacity onPress={() => setGroupSearch('')}>
                  <Ionicons name="close-circle" size={16} color="#71717A" />
                </TouchableOpacity>
              )}
            </View>

            <TouchableOpacity
              style={[
                styles.filterBtn,
                (groupFilterPanelOpen || isSportFilterActive) && styles.filterBtnActive,
              ]}
              onPress={() => setGroupFilterPanelOpen(prev => !prev)}
              activeOpacity={0.85}
            >
              <Ionicons
                name="options-outline"
                size={19}
                color={groupFilterPanelOpen || isSportFilterActive ? '#09090B' : '#EAB308'}
              />
              {isSportFilterActive && <View style={styles.filterActiveDot} />}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.iconActionBtn}
              onPress={() => setCreateGroupModalVisible(true)}
              activeOpacity={0.85}
            >
              <Ionicons name="add" size={22} color="#09090B" />
            </TouchableOpacity>
          </View>

          {groupFilterPanelOpen && (
            <View style={styles.filterDrawerCard}>
              <View style={styles.filterDrawerHeader}>
                <Text style={styles.filterDrawerTitle}>
                  Filter by Sport ({isSportFilterActive ? groupSearchSports.join(', ') : 'All Sports'})
                </Text>
                {isSportFilterActive && (
                  <TouchableOpacity onPress={() => setGroupSearchSports(['All Sports'])}>
                    <Text style={styles.filterResetText}>Reset</Text>
                  </TouchableOpacity>
                )}
              </View>
              <View style={styles.multiSportWrap}>
                {['All Sports', ...SPORT_OPTIONS].map(sp => {
                  const active = groupSearchSports.includes(sp);
                  return (
                    <TouchableOpacity
                      key={sp}
                      style={[styles.sportFilterChip, active && styles.sportFilterChipActive]}
                      onPress={() => toggleSportInMultiSelect(groupSearchSports, sp, setGroupSearchSports)}
                    >
                      <Text style={[styles.sportFilterChipText, active && styles.sportFilterChipTextActive]}>
                        {sp}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          <Text style={styles.pinHelperText}>
            Long-press a group to pin ({pinnedGroupIds.length}/{MAX_PINNED_GROUPS}) • Tier 1 = 10 max, Tier 2 = BG + 25 max
          </Text>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
            {filteredCityGroups.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="people-outline" size={38} color="#52525B" />
                <Text style={styles.emptyTitle}>No groups available yet</Text>
                <Text style={styles.emptySub}>
                  Create a public or private group chat for your sport.
                </Text>
                <TouchableOpacity
                  style={styles.emptyPrimaryBtn}
                  onPress={() => setCreateGroupModalVisible(true)}
                >
                  <Text style={styles.emptyPrimaryBtnText}>Create Group</Text>
                </TouchableOpacity>
              </View>
            ) : (
              filteredCityGroups.map(group => {
                const isMember = isCurrentUserGroupMember(group);
                const isAdmin = isCurrentUserGroupAdmin(group);
                const isPending = group.pendingRequests.includes(currentUserId);
                const isPrivate = group.accessMode === 'private';
                const isPinned = pinnedGroupIds.includes(group.id);
                const stageInfo = getBoostStageInfo(group.boostCount || 0);
                const memberTotal = Array.from(new Set([...group.admins, ...group.members])).length;
                const sportsLabel =
                  Array.isArray(group.sports) && group.sports.length > 0
                    ? group.sports.join(' • ')
                    : 'All Sports';

                return (
                  <TouchableOpacity
                    key={group.id}
                    style={[
                      styles.listCard,
                      isPinned && styles.pinnedListCard,
                      !isPinned && stageInfo.current.stage >= 3 && { borderColor: `${stageInfo.current.color}88` },
                    ]}
                    onPress={() => {
                      setPendingGroupMedia(null);
                      setActivePersonalUser(null);
                      setActiveGroupId(group.id);
                    }}
                    onLongPress={() => handleLongPressPinGroup(group)}
                    delayLongPress={320}
                    activeOpacity={0.85}
                  >
                    <View
                      style={[
                        styles.groupBadgeIcon,
                        {
                          backgroundColor: isPrivate ? '#EAB30822' : '#22C55E22',
                          borderColor: isPrivate ? '#EAB308' : '#22C55E',
                          overflow: 'hidden',
                        },
                      ]}
                    >
                      {group.avatar ? (
                        <Image source={{ uri: group.avatar }} style={styles.avatarImg} />
                      ) : (
                        <Ionicons
                          name={isPrivate ? 'lock-closed' : 'people'}
                          size={18}
                          color={isPrivate ? '#EAB308' : '#22C55E'}
                        />
                      )}
                    </View>

                    <View style={{ flex: 1 }}>
                      <View style={styles.cardTopLine}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1 }}>
                          {isPinned && <Ionicons name="pin" size={13} color="#EAB308" />}
                          <Text style={styles.cardTitle} numberOfLines={1}>
                            {group.name}
                          </Text>
                          <View style={[styles.boostBadgeSmall, { borderColor: stageInfo.current.color }]}>
                            <Ionicons name="rocket" size={10} color={stageInfo.current.color} />
                            <Text style={[styles.boostBadgeSmallText, { color: stageInfo.current.color }]}>
                              {group.boostCount || 0} • {stageInfo.current.shortBadge}
                            </Text>
                          </View>
                        </View>
                        <Text style={styles.timeLabel}>{formatTimeShort(group.lastUpdated)}</Text>
                      </View>

                      <Text style={styles.groupSportsSubtitle} numberOfLines={1}>
                        🏅 {sportsLabel}
                      </Text>

                      <Text style={styles.cardSubtitle} numberOfLines={1}>
                        {group.lastMessageText || group.description || 'Group chat'}
                      </Text>

                      <View style={styles.groupMetaRow}>
                        <Text style={styles.metaChipText}>
                          {isPrivate ? 'Private' : 'Public'} • {memberTotal}/{stageInfo.maxMembersLabel} members
                        </Text>
                        {isAdmin && group.pendingRequests.length > 0 && (
                          <View style={styles.pendingPill}>
                            <Text style={styles.pendingPillText}>
                              {group.pendingRequests.length} requests
                            </Text>
                          </View>
                        )}
                        {!isMember && (
                          <Text style={[styles.metaChipText, { color: isPrivate ? '#EAB308' : '#22C55E' }]}>
                            {isPrivate
                              ? isPending
                                ? '• Requested'
                                : '• Tap to view & request'
                              : '• Tap to view & join'}
                          </Text>
                        )}
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>
        </View>
      ) : (
        <View style={styles.tabBody}>
          <View style={styles.compactScopeRow}>
            {(
              [
                { key: 'all', label: 'All' },
                { key: 'country', label: 'Country' },
                { key: 'city', label: 'City' },
              ] as const
            ).map(scopeItem => (
              <TouchableOpacity
                key={scopeItem.key}
                style={[styles.compactScopeBtn, leaderboardScope === scopeItem.key && styles.compactScopeBtnActive]}
                onPress={() => setLeaderboardScope(scopeItem.key)}
                activeOpacity={0.85}
              >
                <Text
                  style={[
                    styles.compactScopeText,
                    leaderboardScope === scopeItem.key && styles.compactScopeTextActive,
                  ]}
                >
                  {scopeItem.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {leaderboardScope === 'country' && (
            <Text style={styles.countrySubheader}>
              {normalizeCountry(userCountry)}
            </Text>
          )}

          {leaderboardScope === 'city' && (
            <Text style={styles.countrySubheader}>
              {normalizeCity(userCity)}
            </Text>
          )}

          <View style={styles.leaderboardSortRow}>
            {(
              [
                { key: 'reach', label: 'Top Reach' },
                { key: 'boost', label: 'Highest Boost' },
                { key: 'members', label: 'Most People' },
              ] as const
            ).map(item => (
              <TouchableOpacity
                key={item.key}
                style={[styles.sortPillBtn, leaderboardSortBy === item.key && styles.sortPillBtnActive]}
                onPress={() => setLeaderboardSortBy(item.key)}
              >
                <Text
                  style={[
                    styles.sortPillText,
                    leaderboardSortBy === item.key && styles.sortPillTextActive,
                  ]}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.leaderboardHeaderBar}>
            <Text style={[styles.lbColText, { width: 32 }]}>#</Text>
            <Text style={[styles.lbColText, { flex: 1 }]}>Group</Text>
            <Text style={[styles.lbColText, { width: 56, textAlign: 'center' }]}>Reach</Text>
            <Text style={[styles.lbColText, { width: 64, textAlign: 'center' }]}>People</Text>
            <Text style={[styles.lbColText, { width: 62, textAlign: 'right' }]}>Boost</Text>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
            {rankedCountryGroups.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="trophy-outline" size={36} color="#52525B" />
                <Text style={styles.emptyTitle}>No groups found</Text>
                <Text style={styles.emptySub}>
                  Create a group to appear on the board.
                </Text>
              </View>
            ) : (
              rankedCountryGroups.map((row, index) => {
                const rankColor =
                  index === 0 ? '#EAB308' : index === 1 ? '#CBD5E1' : index === 2 ? '#FB923C' : '#A1A1AA';
                const rowLocationSubtitle =
                  leaderboardScope === 'country'
                    ? normalizeCountry(row.group.country)
                    : leaderboardScope === 'city'
                    ? normalizeCity(row.group.city)
                    : `${normalizeCity(row.group.city)} • ${normalizeCountry(row.group.country)}`;

                return (
                  <TouchableOpacity
                    key={row.group.id}
                    style={[styles.leaderboardRowCard, index === 0 && { borderColor: '#EAB308' }]}
                    onPress={() => {
                      setPendingGroupMedia(null);
                      setActivePersonalUser(null);
                      setActiveGroupId(row.group.id);
                    }}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.lbRankNum, { width: 32, color: rankColor }]}>#{index + 1}</Text>

                    <View style={styles.lbGroupLogoBox}>
                      {row.group.avatar ? (
                        <Image source={{ uri: row.group.avatar }} style={styles.avatarImg} />
                      ) : (
                        <Text style={styles.lbGroupLogoLetter}>
                          {row.group.name?.[0]?.toUpperCase() || 'G'}
                        </Text>
                      )}
                    </View>

                    <View style={{ flex: 1, paddingRight: 6 }}>
                      <Text style={styles.cardTitle} numberOfLines={1}>
                        {row.group.name}
                      </Text>
                      <Text style={styles.cardSubtitle} numberOfLines={1}>
                        {rowLocationSubtitle}
                      </Text>
                    </View>

                    <Text style={[styles.lbMetricValue, { width: 56, textAlign: 'center', color: '#38BDF8' }]}>
                      {row.reachScore}
                    </Text>
                    <Text style={[styles.lbMetricValue, { width: 64, textAlign: 'center' }]}>
                      {row.stageInfo.maxMembers === null
                        ? `${row.membersCount}/∞`
                        : `${row.membersCount}/${row.stageInfo.maxMembers}`}
                    </Text>
                    <View style={{ width: 62, alignItems: 'flex-end' }}>
                      <Text style={[styles.lbMetricValue, { color: row.stageInfo.current.color }]}>
                        🚀 {row.group.boostCount || 0}
                      </Text>
                      <Text style={styles.lbStageSub}>Stg {row.stageInfo.current.stage}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>
        </View>
      )}

      {/* Start New Personal Chat Modal */}
      <Modal
        visible={newChatModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setNewChatModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Personal Chat</Text>
              <TouchableOpacity
                onPress={() => {
                  setNewChatModalVisible(false);
                  setNewChatSearch('');
                }}
              >
                <Ionicons name="close" size={24} color="#FAFAFA" />
              </TouchableOpacity>
            </View>

            <View style={[styles.searchBox, { marginBottom: 12 }]}>
              <Ionicons name="search" size={16} color="#71717A" />
              <TextInput
                style={styles.searchInput}
                placeholder="Search user by name..."
                placeholderTextColor="#71717A"
                value={newChatSearch}
                onChangeText={setNewChatSearch}
                returnKeyType="search"
                clearButtonMode="while-editing"
              />
              {newChatSearch.length > 0 && (
                <TouchableOpacity onPress={() => setNewChatSearch('')}>
                  <Ionicons name="close-circle" size={16} color="#71717A" />
                </TouchableOpacity>
              )}
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {selectableUsersForNewChat.length === 0 ? (
                <Text style={styles.mutedNote}>No matching users found.</Text>
              ) : (
                selectableUsersForNewChat.map(u => {
                  const name = getDisplayName(u);
                  return (
                    <TouchableOpacity
                      key={u.uid}
                      style={styles.userPickRow}
                      onPress={() => handleOpenPersonalChat(u)}
                    >
                      <TouchableOpacity
                        style={styles.smallAvatar}
                        onPress={() => handleOpenUserProfile(u.uid, name)}
                      >
                        {u.avatar ? (
                          <Image source={{ uri: u.avatar }} style={styles.avatarImg} />
                        ) : (
                          <Text style={styles.avatarLetter}>{name[0]?.toUpperCase() || 'P'}</Text>
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={{ flex: 1 }}
                        onPress={() => handleOpenUserProfile(u.uid, name)}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Text style={styles.cardTitle}>{name}</Text>
                          {u.isVip && <Ionicons name="checkmark-circle" size={13} color="#EAB308" />}
                        </View>
                      </TouchableOpacity>
                      <Ionicons name="chevron-forward" size={18} color="#71717A" />
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Personal Chat Room Modal */}
      <Modal
        visible={!!activePersonalUser}
        transparent
        animationType="slide"
        onRequestClose={closeAllChatRooms}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.roomSheet}>
            {personalSettingsVisible && activePersonalUser ? (
              <>
                <View style={styles.roomHeader}>
                  <TouchableOpacity
                    style={styles.backIconBtn}
                    onPress={() => setPersonalSettingsVisible(false)}
                  >
                    <Ionicons name="arrow-back" size={20} color="#FAFAFA" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{ flex: 1 }}
                    onPress={() =>
                      handleOpenUserProfile(
                        activePersonalUser.uid,
                        getDisplayName(activePersonalUser)
                      )
                    }
                  >
                    <Text style={styles.eyebrow}>MY CHAT OPTIONS</Text>
                    <Text style={styles.roomTitle}>{getDisplayName(activePersonalUser)}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.closeFullScreenBtn}
                    onPress={() => setPersonalSettingsVisible(false)}
                  >
                    <Ionicons name="close" size={20} color="#FAFAFA" />
                  </TouchableOpacity>
                </View>

                <View style={[styles.settingsPillsRow, { marginTop: 12 }]}>
                  <TouchableOpacity
                    style={[
                      styles.settingsPillBtn,
                      personalSettingsSection === 'wall' && styles.settingsPillActive,
                    ]}
                    onPress={() => setPersonalSettingsSection('wall')}
                  >
                    <Text
                      style={[
                        styles.settingsPillText,
                        personalSettingsSection === 'wall' && styles.settingsPillTextActive,
                      ]}
                    >
                      My Background & User
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.settingsPillBtn,
                      personalSettingsSection === 'media' && styles.settingsPillActive,
                    ]}
                    onPress={() => setPersonalSettingsSection('media')}
                  >
                    <Text
                      style={[
                        styles.settingsPillText,
                        personalSettingsSection === 'media' && styles.settingsPillTextActive,
                      ]}
                    >
                      Media ({personalMediaItems.length})
                    </Text>
                  </TouchableOpacity>
                </View>

                <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
                  {personalSettingsSection === 'wall' ? (
                    <>
                      <Text style={styles.sectionHeading}>My Chat Background (Visible Only To You)</Text>
                      <View style={styles.wallpaperActionsRow}>
                        <TouchableOpacity
                          style={styles.wallpaperPrimaryBtn}
                          onPress={() => personalChatId && handlePickPersonalWallpaper(personalChatId)}
                        >
                          <Ionicons name="image-outline" size={16} color="#09090B" />
                          <Text style={styles.wallpaperPrimaryBtnText}>
                            {activePersonalWallpaper ? 'Change My Background' : 'Set My Background'}
                          </Text>
                        </TouchableOpacity>
                        {!!activePersonalWallpaper && personalChatId && (
                          <TouchableOpacity
                            style={styles.wallpaperClearBtn}
                            onPress={() => handleClearPersonalWallpaper(personalChatId)}
                          >
                            <Text style={styles.wallpaperClearBtnText}>Remove</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                      {!!activePersonalWallpaper && (
                        <Image
                          source={{ uri: activePersonalWallpaper }}
                          style={styles.wallpaperPreview}
                          resizeMode="cover"
                        />
                      )}

                      <View style={styles.membershipActionsBox}>
                        <Text style={styles.sectionHeading}>Player Actions</Text>
                        <TouchableOpacity
                          style={styles.primarySubmitBtn}
                          onPress={() =>
                            handleOpenUserProfile(
                              activePersonalUser.uid,
                              getDisplayName(activePersonalUser)
                            )
                          }
                        >
                          <Text style={styles.primarySubmitBtnText}>Open Player Profile</Text>
                        </TouchableOpacity>
                      </View>
                    </>
                  ) : (
                    <>
                      <Text style={styles.sectionHeading}>
                        Media History ({personalMediaItems.length}) • Tap to open
                      </Text>
                      {personalMediaItems.length === 0 ? (
                        <Text style={styles.mutedNote}>No photos or videos shared in this chat yet.</Text>
                      ) : (
                        <View style={styles.mediaGrid}>
                          {personalMediaItems.map(media => (
                            <TouchableOpacity
                              key={media.id}
                              style={styles.mediaTile}
                              activeOpacity={0.85}
                              onPress={() =>
                                handleOpenMediaLightbox({
                                  uri: media.uri,
                                  type: media.type,
                                  caption: media.caption,
                                  senderName: media.senderName,
                                })
                              }
                            >
                              {media.type === 'video' ? (
                                <ChatVideoPreview
                                  uri={media.uri}
                                  style={styles.mediaTileImg}
                                  onPress={() =>
                                    handleOpenMediaLightbox({
                                      uri: media.uri,
                                      type: media.type,
                                      caption: media.caption,
                                      senderName: media.senderName,
                                    })
                                  }
                                />
                              ) : (
                                <Image
                                  source={{ uri: media.uri }}
                                  style={styles.mediaTileImg}
                                  resizeMode="cover"
                                />
                              )}
                              <Text style={styles.mediaTileCaption} numberOfLines={1}>
                                {media.type === 'video' ? '🎬 ' : '🖼️ '}
                                {media.senderName}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}
                    </>
                  )}
                </ScrollView>
              </>
            ) : (
              <>
                <View style={styles.roomHeader}>
                  <TouchableOpacity
                    style={styles.backIconBtn}
                    onPress={closeAllChatRooms}
                  >
                    <Ionicons name="arrow-back" size={20} color="#FAFAFA" />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}
                    onPress={() =>
                      handleOpenUserProfile(
                        activePersonalUser?.uid,
                        getDisplayName(activePersonalUser)
                      )
                    }
                    activeOpacity={0.8}
                  >
                    <View style={styles.smallAvatar}>
                      {activePersonalUser?.avatar ? (
                        <Image source={{ uri: activePersonalUser.avatar }} style={styles.avatarImg} />
                      ) : (
                        <Text style={styles.avatarLetter}>
                          {getDisplayName(activePersonalUser)[0]?.toUpperCase() || 'P'}
                        </Text>
                      )}
                    </View>

                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Text style={styles.roomTitle}>{getDisplayName(activePersonalUser)}</Text>
                        {activePersonalUser?.isVip && (
                          <Ionicons name="checkmark-circle" size={14} color="#EAB308" />
                        )}
                      </View>
                      <Text style={styles.roomSubtitle}>Tap name for profile</Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.backIconBtn}
                    onPress={() => {
                      setPersonalSettingsSection('wall');
                      setPersonalSettingsVisible(true);
                    }}
                  >
                    <Ionicons name="options-outline" size={18} color="#EAB308" />
                  </TouchableOpacity>
                </View>

                {activePersonalConv?.pinnedMessage && (
                  <TouchableOpacity
                    style={styles.pinnedBanner}
                    onPress={() => handleJumpToPersonalPinnedMessage(activePersonalConv.pinnedMessage!.id)}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="pin" size={14} color="#EAB308" />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.pinnedBannerTitle} numberOfLines={1}>
                        Pinned by {activePersonalConv.pinnedMessage.senderName}
                      </Text>
                      <Text style={styles.pinnedBannerText} numberOfLines={1}>
                        {activePersonalConv.pinnedMessage.text}
                      </Text>
                    </View>
                    {personalChatId && (
                      <TouchableOpacity
                        onPress={() => handleUnpinPersonalMessage(personalChatId)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name="close" size={16} color="#A1A1AA" />
                      </TouchableOpacity>
                    )}
                  </TouchableOpacity>
                )}

                <View style={{ flex: 1, overflow: 'hidden', borderRadius: 14, marginTop: 8 }}>
                  {activePersonalWallpaper ? (
                    <ImageBackground
                      source={{ uri: activePersonalWallpaper }}
                      style={{ flex: 1 }}
                      imageStyle={{ opacity: 0.25 }}
                    >
                      <ScrollView
                        ref={(el: any) => {
                          personalScrollRef.current = el;
                        }}
                        style={styles.messagesScroll}
                        contentContainerStyle={{ paddingVertical: 12 }}
                        showsVerticalScrollIndicator={false}
                      >
                        {personalMessages.length === 0 ? (
                          <Text style={styles.emptyChatHint}>Send a message to start the conversation.</Text>
                        ) : (
                          personalMessages.map(msg => {
                            const isMe = msg.senderId === currentUserId;
                            const { imageUri, videoUri } = resolveMessageMedia(msg);
                            const isHighlighted = highlightedPersonalMsgId === msg.id;
                            const senderDisplay = isMe
                              ? getDisplayName(currentUser)
                              : msg.senderName || getDisplayName(activePersonalUser);
                            const senderUidForProfile = isMe
                              ? currentUserId
                              : msg.senderId || activePersonalUser?.uid;
                            const nameColor = getSenderNameColor(senderUidForProfile || senderDisplay);
                            const reactionEntries = Object.entries(msg.reactions || {}).filter(
                              ([, uids]) => Array.isArray(uids) && uids.length > 0
                            );
                            const openSheet = () =>
                              setMessageActionSheet({
                                scope: 'personal',
                                chatId: personalChatId,
                                message: msg,
                              });

                            return (
                              <TouchableOpacity
                                key={msg.id}
                                onLayout={e => {
                                  personalMessageOffsetsRef.current[msg.id] = e.nativeEvent.layout.y;
                                }}
                                activeOpacity={0.95}
                                onLongPress={openSheet}
                                delayLongPress={260}
                                style={[styles.bubbleRow, isMe ? styles.bubbleRight : styles.bubbleLeft]}
                              >
                                <View
                                  style={[
                                    styles.bubble,
                                    isMe ? styles.bubbleMe : styles.bubbleOther,
                                    isHighlighted && styles.highlightedBubble,
                                  ]}
                                >
                                  <TouchableOpacity
                                    onPress={() => handleOpenUserProfile(senderUidForProfile, senderDisplay)}
                                    activeOpacity={0.75}
                                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 3 }}
                                  >
                                    <Text
                                      style={[
                                        styles.senderTag,
                                        { color: isMe ? '#09090B' : nameColor },
                                      ]}
                                    >
                                      {senderDisplay}
                                    </Text>
                                  </TouchableOpacity>
                                  {videoUri && (
                                    <ChatVideoPreview
                                      uri={videoUri}
                                      style={styles.chatInlineVideo}
                                      onLongPress={openSheet}
                                      onPress={() =>
                                        handleOpenMediaLightbox({
                                          uri: videoUri,
                                          type: 'video',
                                          caption: msg.text,
                                          senderName: senderDisplay,
                                        })
                                      }
                                    />
                                  )}
                                  {imageUri && (
                                    <TouchableOpacity
                                      activeOpacity={0.88}
                                      onLongPress={openSheet}
                                      delayLongPress={260}
                                      onPress={() =>
                                        handleOpenMediaLightbox({
                                          uri: imageUri,
                                          type: 'image',
                                          caption: msg.text,
                                          senderName: senderDisplay,
                                        })
                                      }
                                    >
                                      <Image
                                        source={{ uri: imageUri }}
                                        style={styles.chatInlineMedia}
                                        resizeMode="cover"
                                      />
                                    </TouchableOpacity>
                                  )}
                                  {!!msg.text && (
                                    <Text style={[styles.bubbleText, isMe && { color: '#09090B' }]}>
                                      {msg.text}
                                      {msg.edited ? ' (edited)' : ''}
                                    </Text>
                                  )}
                                  <Text style={[styles.bubbleTime, isMe && { color: '#27272A' }]}>
                                    {formatTimeShort(msg.createdAt)}
                                  </Text>

                                  {reactionEntries.length > 0 && (
                                    <View style={styles.reactionsRow}>
                                      {reactionEntries.map(([emoji, uids]) => {
                                        const mine = uids.includes(currentUserId);
                                        return (
                                          <TouchableOpacity
                                            key={emoji}
                                            style={[styles.reactionChip, mine && styles.reactionChipMine]}
                                            onPress={() =>
                                              handleToggleEmojiReaction(
                                                { scope: 'personal', chatId: personalChatId, message: msg },
                                                emoji
                                              )
                                            }
                                          >
                                            <Text style={styles.reactionChipText}>
                                              {emoji} {uids.length}
                                            </Text>
                                          </TouchableOpacity>
                                        );
                                      })}
                                    </View>
                                  )}
                                </View>
                              </TouchableOpacity>
                            );
                          })
                        )}
                      </ScrollView>
                    </ImageBackground>
                  ) : (
                    <ScrollView
                      ref={(el: any) => {
                        personalScrollRef.current = el;
                      }}
                      style={styles.messagesScroll}
                      contentContainerStyle={{ paddingVertical: 12 }}
                      showsVerticalScrollIndicator={false}
                    >
                      {personalMessages.length === 0 ? (
                        <Text style={styles.emptyChatHint}>Send a message to start the conversation.</Text>
                      ) : (
                        personalMessages.map(msg => {
                          const isMe = msg.senderId === currentUserId;
                          const { imageUri, videoUri } = resolveMessageMedia(msg);
                          const isHighlighted = highlightedPersonalMsgId === msg.id;
                          const senderDisplay = isMe
                            ? getDisplayName(currentUser)
                            : msg.senderName || getDisplayName(activePersonalUser);
                          const senderUidForProfile = isMe
                            ? currentUserId
                            : msg.senderId || activePersonalUser?.uid;
                          const nameColor = getSenderNameColor(senderUidForProfile || senderDisplay);
                          const reactionEntries = Object.entries(msg.reactions || {}).filter(
                            ([, uids]) => Array.isArray(uids) && uids.length > 0
                          );
                          const openSheet = () =>
                            setMessageActionSheet({
                              scope: 'personal',
                              chatId: personalChatId,
                              message: msg,
                            });

                          return (
                            <TouchableOpacity
                              key={msg.id}
                              onLayout={e => {
                                personalMessageOffsetsRef.current[msg.id] = e.nativeEvent.layout.y;
                              }}
                              activeOpacity={0.95}
                              onLongPress={openSheet}
                              delayLongPress={260}
                              style={[styles.bubbleRow, isMe ? styles.bubbleRight : styles.bubbleLeft]}
                            >
                              <View
                                style={[
                                  styles.bubble,
                                  isMe ? styles.bubbleMe : styles.bubbleOther,
                                  isHighlighted && styles.highlightedBubble,
                                ]}
                              >
                                <TouchableOpacity
                                  onPress={() => handleOpenUserProfile(senderUidForProfile, senderDisplay)}
                                  activeOpacity={0.75}
                                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 3 }}
                                >
                                  <Text
                                    style={[
                                      styles.senderTag,
                                      { color: isMe ? '#09090B' : nameColor },
                                    ]}
                                  >
                                    {senderDisplay}
                                  </Text>
                                </TouchableOpacity>
                                {videoUri && (
                                  <ChatVideoPreview
                                    uri={videoUri}
                                    style={styles.chatInlineVideo}
                                    onLongPress={openSheet}
                                    onPress={() =>
                                      handleOpenMediaLightbox({
                                        uri: videoUri,
                                        type: 'video',
                                        caption: msg.text,
                                        senderName: senderDisplay,
                                      })
                                    }
                                  />
                                )}
                                {imageUri && (
                                  <TouchableOpacity
                                    activeOpacity={0.88}
                                    onLongPress={openSheet}
                                    delayLongPress={260}
                                    onPress={() =>
                                      handleOpenMediaLightbox({
                                        uri: imageUri,
                                        type: 'image',
                                        caption: msg.text,
                                        senderName: senderDisplay,
                                      })
                                    }
                                  >
                                    <Image
                                      source={{ uri: imageUri }}
                                      style={styles.chatInlineMedia}
                                      resizeMode="cover"
                                    />
                                  </TouchableOpacity>
                                )}
                                {!!msg.text && (
                                  <Text style={[styles.bubbleText, isMe && { color: '#09090B' }]}>
                                    {msg.text}
                                    {msg.edited ? ' (edited)' : ''}
                                  </Text>
                                )}
                                <Text style={[styles.bubbleTime, isMe && { color: '#27272A' }]}>
                                  {formatTimeShort(msg.createdAt)}
                                </Text>

                                {reactionEntries.length > 0 && (
                                  <View style={styles.reactionsRow}>
                                    {reactionEntries.map(([emoji, uids]) => {
                                      const mine = uids.includes(currentUserId);
                                      return (
                                        <TouchableOpacity
                                          key={emoji}
                                          style={[styles.reactionChip, mine && styles.reactionChipMine]}
                                          onPress={() =>
                                            handleToggleEmojiReaction(
                                              { scope: 'personal', chatId: personalChatId, message: msg },
                                              emoji
                                            )
                                          }
                                        >
                                          <Text style={styles.reactionChipText}>
                                            {emoji} {uids.length}
                                          </Text>
                                        </TouchableOpacity>
                                      );
                                    })}
                                  </View>
                                )}
                              </View>
                            </TouchableOpacity>
                          );
                        })
                      )}
                    </ScrollView>
                  )}
                </View>

                {pendingPersonalMedia && (
                  <View style={styles.pendingMediaPreviewBox}>
                    {pendingPersonalMedia.type === 'video' ? (
                      <ChatVideoPreview
                        uri={pendingPersonalMedia.uri}
                        style={styles.pendingMediaThumb}
                      />
                    ) : (
                      <Image
                        source={{ uri: pendingPersonalMedia.uri }}
                        style={styles.pendingMediaThumb}
                        resizeMode="cover"
                      />
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.pendingMediaTitle}>
                        {pendingPersonalMedia.type === 'video' ? 'Video attached' : 'Photo attached'}
                      </Text>
                      <Text style={styles.pendingMediaSub}>
                        Type a message below and press send
                      </Text>
                    </View>
                    <TouchableOpacity onPress={() => setPendingPersonalMedia(null)}>
                      <Ionicons name="close-circle" size={22} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                )}

                <View style={styles.composerRow}>
                  <TouchableOpacity
                    style={[styles.mediaAttachBtn, sendingPersonalMedia && { opacity: 0.5 }]}
                    onPress={() => handlePickPersonalMediaDraft('image')}
                    disabled={sendingPersonalMedia}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="image-outline" size={19} color="#EAB308" />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.mediaAttachBtn, sendingPersonalMedia && { opacity: 0.5 }]}
                    onPress={() => handlePickPersonalMediaDraft('video')}
                    disabled={sendingPersonalMedia}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="videocam-outline" size={19} color="#38BDF8" />
                  </TouchableOpacity>

                  <TextInput
                    style={styles.composerInput}
                    placeholder={pendingPersonalMedia ? 'Add text with media...' : 'Write a message...'}
                    placeholderTextColor="#71717A"
                    value={personalMessageInput}
                    onChangeText={setPersonalMessageInput}
                  />
                  <TouchableOpacity
                    style={styles.sendBtn}
                    onPress={handleSendPersonalMessage}
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

      {/* Create Group Modal */}
      <Modal
        visible={createGroupModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setCreateGroupModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create Group</Text>
              <TouchableOpacity onPress={() => setCreateGroupModalVisible(false)}>
                <Ionicons name="close" size={24} color="#FAFAFA" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={styles.fieldLabel}>Group Name *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Football & Match Discussions"
                placeholderTextColor="#71717A"
                value={newGroupName}
                onChangeText={setNewGroupName}
              />

              <Text style={styles.fieldLabel}>Description</Text>
              <TextInput
                style={styles.input}
                placeholder="What is this group about?"
                placeholderTextColor="#71717A"
                value={newGroupDesc}
                onChangeText={setNewGroupDesc}
              />

              <Text style={styles.fieldLabel}>Sports (One, Multiple, or All)</Text>
              <View style={styles.multiSportWrap}>
                {['All Sports', ...SPORT_OPTIONS].map(sp => {
                  const selected = newGroupSports.includes(sp);
                  return (
                    <TouchableOpacity
                      key={sp}
                      style={[styles.sportFilterChip, selected && styles.sportFilterChipActive]}
                      onPress={() => toggleSportInMultiSelect(newGroupSports, sp, setNewGroupSports)}
                    >
                      <Text style={[styles.sportFilterChipText, selected && styles.sportFilterChipTextActive]}>
                        {sp}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.fieldLabel}>Group Privacy</Text>
              <View style={styles.privacyRow}>
                <TouchableOpacity
                  style={[styles.privacyCard, newGroupAccess === 'public' && styles.privacyCardPublic]}
                  onPress={() => setNewGroupAccess('public')}
                >
                  <Ionicons
                    name="globe-outline"
                    size={18}
                    color={newGroupAccess === 'public' ? '#22C55E' : '#A1A1AA'}
                  />
                  <Text
                    style={[styles.privacyTitle, newGroupAccess === 'public' && { color: '#22C55E' }]}
                  >
                    Public
                  </Text>
                  <Text style={styles.privacySub}>Anyone can join</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.privacyCard,
                    newGroupAccess === 'private' && styles.privacyCardPrivate,
                  ]}
                  onPress={() => setNewGroupAccess('private')}
                >
                  <Ionicons
                    name="lock-closed-outline"
                    size={18}
                    color={newGroupAccess === 'private' ? '#EAB308' : '#A1A1AA'}
                  />
                  <Text
                    style={[styles.privacyTitle, newGroupAccess === 'private' && { color: '#EAB308' }]}
                  >
                    Private
                  </Text>
                  <Text style={styles.privacySub}>Admins approve requests</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={[styles.primarySubmitBtn, creatingGroup && { opacity: 0.6 }]}
                onPress={handleCreateCityGroup}
                disabled={creatingGroup}
              >
                <Text style={styles.primarySubmitBtnText}>
                  {creatingGroup ? 'Creating...' : 'Create Group Chat'}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Group Chat Room Modal */}
      <Modal
        visible={!!activeGroup}
        transparent
        animationType="slide"
        onRequestClose={closeAllChatRooms}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.roomSheet}>
            {activeGroup && groupSettingsModalVisible && settingsGroup ? (
              <>
                <View style={styles.fullScreenSettingsHeader}>
                  <TouchableOpacity
                    style={styles.backIconBtn}
                    onPress={handleCloseGroupSettings}
                  >
                    <Ionicons name="arrow-back" size={20} color="#FAFAFA" />
                  </TouchableOpacity>

                  <View style={{ flex: 1 }}>
                    <Text style={styles.eyebrow}>GROUP MANAGEMENT</Text>
                    <Text style={styles.fullScreenSettingsTitle} numberOfLines={1}>
                      {settingsGroup.name}
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={styles.closeFullScreenBtn}
                    onPress={handleCloseGroupSettings}
                  >
                    <Ionicons name="close" size={22} color="#FAFAFA" />
                  </TouchableOpacity>
                </View>

                <View style={styles.settingsPillsRow}>
                  <TouchableOpacity
                    style={[styles.settingsPillBtn, groupSettingsSection === 'overview' && styles.settingsPillActive]}
                    onPress={() => setGroupSettingsSection('overview')}
                  >
                    <Text style={[styles.settingsPillText, groupSettingsSection === 'overview' && styles.settingsPillTextActive]}>
                      Info & Wall
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.settingsPillBtn, groupSettingsSection === 'boost' && styles.settingsPillActive]}
                    onPress={() => setGroupSettingsSection('boost')}
                  >
                    <Text style={[styles.settingsPillText, groupSettingsSection === 'boost' && styles.settingsPillTextActive]}>
                      Boost ({settingsGroup.boostCount || 0})
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.settingsPillBtn, groupSettingsSection === 'media' && styles.settingsPillActive]}
                    onPress={() => setGroupSettingsSection('media')}
                  >
                    <Text style={[styles.settingsPillText, groupSettingsSection === 'media' && styles.settingsPillTextActive]}>
                      Media ({groupMediaItems.length})
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.settingsPillBtn, groupSettingsSection === 'members' && styles.settingsPillActive]}
                    onPress={() => setGroupSettingsSection('members')}
                  >
                    <Text style={[styles.settingsPillText, groupSettingsSection === 'members' && styles.settingsPillTextActive]}>
                      People ({Array.from(new Set([...settingsGroup.admins, ...settingsGroup.members])).length})
                    </Text>
                  </TouchableOpacity>
                </View>

                <ScrollView
                  style={{ flex: 1 }}
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={{ paddingBottom: 40 }}
                >
                  {groupSettingsSection === 'overview' && (
                    <>
                      <View style={styles.groupProfileEditRow}>
                        <TouchableOpacity
                          style={styles.groupEditAvatarBox}
                          onPress={() => handlePickGroupAvatar(settingsGroup)}
                        >
                          {settingsGroup.avatar ? (
                            <Image source={{ uri: settingsGroup.avatar }} style={styles.avatarImg} />
                          ) : (
                            <Ionicons name="camera" size={22} color="#EAB308" />
                          )}
                        </TouchableOpacity>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.cardTitle}>{settingsGroup.name}</Text>
                          <Text style={styles.cardSubtitle}>
                            {isCurrentUserGroupAdmin(settingsGroup)
                              ? 'Tap avatar to change group photo • Admins can edit details'
                              : 'Only admins can change group photo, name, description & wallpaper'}
                          </Text>
                        </View>
                      </View>

                      <Text style={styles.fieldLabel}>Group Name</Text>
                      <TextInput
                        style={[styles.input, !isCurrentUserGroupAdmin(settingsGroup) && { opacity: 0.6 }]}
                        value={editGroupNameInput}
                        onChangeText={setEditGroupNameInput}
                        editable={isCurrentUserGroupAdmin(settingsGroup)}
                        placeholder="Group name"
                        placeholderTextColor="#71717A"
                      />

                      <Text style={styles.fieldLabel}>Group Description</Text>
                      <TextInput
                        style={[styles.input, !isCurrentUserGroupAdmin(settingsGroup) && { opacity: 0.6 }]}
                        value={editGroupDescInput}
                        onChangeText={setEditGroupDescInput}
                        editable={isCurrentUserGroupAdmin(settingsGroup)}
                        placeholder="Group description"
                        placeholderTextColor="#71717A"
                      />

                      {isCurrentUserGroupAdmin(settingsGroup) && (
                        <TouchableOpacity
                          style={[styles.primarySubmitBtn, { marginBottom: 18 }, savingGroupInfo && { opacity: 0.6 }]}
                          onPress={() => handleSaveGroupDetails(settingsGroup)}
                          disabled={savingGroupInfo}
                        >
                          <Text style={styles.primarySubmitBtnText}>
                            {savingGroupInfo ? 'Saving...' : 'Save Group Details'}
                          </Text>
                        </TouchableOpacity>
                      )}

                      <Text style={styles.sectionHeading}>
                        Chat Background Image {getBoostStageInfo(settingsGroup.boostCount || 0).allowBackground ? '(Unlocked)' : '(Unlocks at Stage 2)'}
                      </Text>
                      <View style={styles.wallpaperActionsRow}>
                        <TouchableOpacity
                          style={[
                            styles.wallpaperPrimaryBtn,
                            (!isCurrentUserGroupAdmin(settingsGroup) ||
                              !getBoostStageInfo(settingsGroup.boostCount || 0).allowBackground) && { opacity: 0.5 },
                          ]}
                          onPress={() => handlePickGroupWallpaper(settingsGroup)}
                        >
                          <Ionicons name="image-outline" size={16} color="#09090B" />
                          <Text style={styles.wallpaperPrimaryBtnText}>
                            {settingsGroup.wallpaperUrl ? 'Change Background' : 'Set Background Image'}
                          </Text>
                        </TouchableOpacity>

                        {settingsGroup.wallpaperUrl && isCurrentUserGroupAdmin(settingsGroup) && (
                          <TouchableOpacity
                            style={styles.wallpaperClearBtn}
                            onPress={() => handleClearGroupWallpaper(settingsGroup)}
                          >
                            <Text style={styles.wallpaperClearBtnText}>Remove</Text>
                          </TouchableOpacity>
                        )}
                      </View>

                      {settingsGroup.wallpaperUrl && (
                        <Image
                          source={{ uri: settingsGroup.wallpaperUrl }}
                          style={styles.wallpaperPreview}
                          resizeMode="cover"
                        />
                      )}

                      {isCurrentUserGroupAdmin(settingsGroup) && (
                        <>
                          <Text style={[styles.sectionHeading, { marginTop: 20 }]}>
                            Pending Join Requests ({settingsGroup.pendingRequests.length})
                          </Text>

                          {settingsGroup.pendingRequests.length === 0 ? (
                            <Text style={styles.mutedNote}>No pending requests right now.</Text>
                          ) : (
                            settingsGroup.pendingRequests.map(reqUid => {
                              const reqUser = allUsers.find(u => u.uid === reqUid);
                              const reqName = getDisplayName(reqUser) || reqUid;
                              return (
                                <View key={reqUid} style={styles.manageRow}>
                                  <TouchableOpacity onPress={() => handleOpenUserProfile(reqUid, reqName)}>
                                    <Text style={styles.cardTitle}>{reqName}</Text>
                                  </TouchableOpacity>
                                  <View style={{ flexDirection: 'row', gap: 8 }}>
                                    <TouchableOpacity
                                      style={styles.approveBtn}
                                      onPress={() => handleApproveGroupRequest(settingsGroup, reqUid)}
                                    >
                                      <Text style={styles.approveBtnText}>Approve</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                      style={styles.rejectBtn}
                                      onPress={() => handleRejectGroupRequest(settingsGroup, reqUid)}
                                    >
                                      <Text style={styles.rejectBtnText}>Decline</Text>
                                    </TouchableOpacity>
                                  </View>
                                </View>
                              );
                            })
                          )}
                        </>
                      )}

                      <View style={styles.membershipActionsBox}>
                        <Text style={styles.sectionHeading}>Group Membership</Text>

                        {isCurrentUserGroupMember(settingsGroup) && (
                          <TouchableOpacity
                            style={[
                              styles.leaveGroupBtn,
                              leavingOrClosingGroup && { opacity: 0.6 },
                            ]}
                            onPress={() => handleLeaveGroup(settingsGroup)}
                            disabled={leavingOrClosingGroup}
                            activeOpacity={0.85}
                          >
                            <Ionicons name="exit-outline" size={18} color="#F97316" />
                            <Text style={styles.leaveGroupBtnText}>Leave Group</Text>
                          </TouchableOpacity>
                        )}

                        {isCurrentUserGroupCreator(settingsGroup) && (
                          <TouchableOpacity
                            style={[
                              styles.closeGroupBtn,
                              leavingOrClosingGroup && { opacity: 0.6 },
                            ]}
                            onPress={() => handleCloseGroup(settingsGroup)}
                            disabled={leavingOrClosingGroup}
                            activeOpacity={0.85}
                          >
                            <Ionicons name="trash-outline" size={18} color="#EF4444" />
                            <Text style={styles.closeGroupBtnText}>Close Group</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </>
                  )}

                  {groupSettingsSection === 'boost' && (() => {
                    const currentCount = settingsGroup.boostCount || 0;
                    const stageInfo = getBoostStageInfo(currentCount);

                    return (
                      <>
                        <View style={[styles.boostStatusCard, { borderColor: stageInfo.current.color }]}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Text style={[styles.cardTitle, { color: stageInfo.current.color }]}>
                              {stageInfo.current.title}
                            </Text>
                            <Text style={[styles.boostCountValue, { color: stageInfo.current.color }]}>
                              {currentCount} Boosts
                            </Text>
                          </View>

                          <Text style={[styles.cardSubtitle, { marginTop: 4 }]}>
                            {stageInfo.current.exposureSummary}
                          </Text>

                          <View style={styles.progressBarTrack}>
                            <View
                              style={[
                                styles.progressBarFill,
                                {
                                  width: `${stageInfo.progressPercent}%`,
                                  backgroundColor: stageInfo.current.color,
                                },
                              ]}
                            />
                          </View>

                          <Text style={styles.mutedNote}>
                            {stageInfo.nextStage
                              ? `${stageInfo.boostsToNext} more boost${stageInfo.boostsToNext === 1 ? '' : 's'} to reach ${stageInfo.nextStage.title} (${
                                  stageInfo.nextStage.maxMembers === null
                                    ? 'Unlimited members'
                                    : `Max ${stageInfo.nextStage.maxMembers} members`
                                })`
                              : 'Maximum boost stage reached — unlimited members & full promotion active!'}
                          </Text>
                        </View>

                        <Text style={styles.sectionHeading}>Boost Stages, Member Limits & Perks</Text>
                        {BOOST_STAGES.map(st => {
                          const unlocked = currentCount >= st.minBoosts;
                          return (
                            <View
                              key={st.stage}
                              style={[
                                styles.stageInfoRow,
                                { borderColor: unlocked ? st.color : '#27272A' },
                              ]}
                            >
                              <Ionicons
                                name={unlocked ? 'checkmark-circle' : 'lock-closed-outline'}
                                size={16}
                                color={unlocked ? st.color : '#71717A'}
                              />
                              <View style={{ flex: 1 }}>
                                <Text style={[styles.cardTitle, { fontSize: 12, color: st.color }]}>
                                  {st.title} ({st.minBoosts}+ boosts • {st.maxMembers === null ? 'Unlimited people' : `Max ${st.maxMembers} people`})
                                </Text>
                                <Text style={styles.cardSubtitle}>{st.exposureSummary}</Text>
                              </View>
                            </View>
                          );
                        })}

                        <Text style={[styles.sectionHeading, { marginTop: 14 }]}>
                          Value Boost Packs (Any Member Can Boost)
                        </Text>

                        {BOOST_PACKAGES.map(pkg => (
                          <TouchableOpacity
                            key={pkg.id}
                            style={[styles.boostOptionCard, { borderColor: pkg.accentColor }]}
                            onPress={() => handleBuyGroupBoost(settingsGroup, pkg)}
                            disabled={purchasingBoost}
                            activeOpacity={0.85}
                          >
                            <View style={{ flex: 1 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <Text style={[styles.cardTitle, { color: pkg.accentColor }]}>
                                  {pkg.label} — {pkg.priceLabel}
                                </Text>
                                <Text style={[styles.packTagPill, { color: pkg.accentColor, borderColor: pkg.accentColor }]}>
                                  {pkg.badge}
                                </Text>
                              </View>
                              <Text style={styles.cardSubtitle}>{pkg.perk}</Text>
                            </View>
                            <View style={[styles.boostBuyPill, { backgroundColor: pkg.accentColor }]}>
                              <Ionicons name="rocket" size={14} color="#09090B" />
                              <Text style={styles.boostBuyPillText}>{pkg.priceLabel}</Text>
                            </View>
                          </TouchableOpacity>
                        ))}
                      </>
                    );
                  })()}

                  {groupSettingsSection === 'media' && (
                    <>
                      <Text style={styles.sectionHeading}>
                        Media History ({groupMediaItems.length}) • Tap to open
                      </Text>
                      {groupMediaItems.length === 0 ? (
                        <Text style={styles.mutedNote}>No photos or videos shared in this group yet.</Text>
                      ) : (
                        <View style={styles.mediaGrid}>
                          {groupMediaItems.map(media => (
                            <TouchableOpacity
                              key={media.id}
                              style={styles.mediaTile}
                              activeOpacity={0.85}
                              onPress={() =>
                                handleOpenMediaLightbox({
                                  uri: media.uri,
                                  type: media.type,
                                  caption: media.caption,
                                  senderName: media.senderName,
                                })
                              }
                            >
                              {media.type === 'video' ? (
                                <ChatVideoPreview
                                  uri={media.uri}
                                  style={styles.mediaTileImg}
                                  onPress={() =>
                                    handleOpenMediaLightbox({
                                      uri: media.uri,
                                      type: media.type,
                                      caption: media.caption,
                                      senderName: media.senderName,
                                    })
                                  }
                                />
                              ) : (
                                <Image source={{ uri: media.uri }} style={styles.mediaTileImg} resizeMode="cover" />
                              )}
                              <Text style={styles.mediaTileCaption} numberOfLines={1}>
                                {media.type === 'video' ? '🎬 ' : '🖼️ '}
                                {media.senderName}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}
                    </>
                  )}

                  {groupSettingsSection === 'members' && (
                    <>
                      <Text style={styles.sectionHeading}>
                        Members & Admins ({Array.from(new Set([...settingsGroup.admins, ...settingsGroup.members])).length}/{getBoostStageInfo(settingsGroup.boostCount || 0).maxMembersLabel}) • Tap name for profile
                      </Text>

                      {Array.from(new Set([...settingsGroup.admins, ...settingsGroup.members])).map(mUid => {
                        const mUser = allUsers.find(u => u.uid === mUid);
                        const mName = getDisplayName(mUser) || mUid;
                        const isAdmin = settingsGroup.admins.includes(mUid) || settingsGroup.creatorId === mUid;
                        const isOwner = settingsGroup.creatorId === mUid;
                        const canManageOther = isCurrentUserGroupAdmin(settingsGroup) && !isOwner;

                        return (
                          <View key={mUid} style={styles.manageRow}>
                            <TouchableOpacity
                              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}
                              onPress={() => handleOpenUserProfile(mUid, mName)}
                            >
                              <View style={styles.smallAvatar}>
                                {mUser?.avatar ? (
                                  <Image source={{ uri: mUser.avatar }} style={styles.avatarImg} />
                                ) : (
                                  <Text style={styles.avatarLetter}>{mName[0]?.toUpperCase() || 'P'}</Text>
                                )}
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text style={[styles.cardTitle, { color: getSenderNameColor(mUid) }]} numberOfLines={1}>
                                  {mName}
                                </Text>
                                <Text style={styles.cardSubtitle}>
                                  {isOwner ? 'Group Creator (Protected)' : isAdmin ? 'Admin' : 'Member'}
                                </Text>
                              </View>
                            </TouchableOpacity>

                            {canManageOther && (
                              <View style={{ flexDirection: 'row', gap: 5 }}>
                                <TouchableOpacity
                                  style={[styles.roleToggleBtn, isAdmin && styles.roleToggleBtnActive]}
                                  onPress={() => handleToggleGroupAdmin(settingsGroup, mUid)}
                                >
                                  <Text
                                    style={[
                                      styles.roleToggleText,
                                      isAdmin && { color: '#EF4444' },
                                    ]}
                                  >
                                    {isAdmin ? 'Demote' : 'Admin'}
                                  </Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                  style={styles.kickBtn}
                                  onPress={() => handleKickUserFromGroup(settingsGroup, mUid)}
                                >
                                  <Text style={styles.kickBtnText}>Kick</Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                  style={styles.rejectBtn}
                                  onPress={() => handleBanUserFromGroup(settingsGroup, mUid)}
                                >
                                  <Text style={styles.rejectBtnText}>Ban</Text>
                                </TouchableOpacity>
                              </View>
                            )}
                          </View>
                        );
                      })}

                      {isCurrentUserGroupAdmin(settingsGroup) && (settingsGroup.bannedUsers?.length || 0) > 0 && (
                        <>
                          <Text style={[styles.sectionHeading, { marginTop: 18 }]}>
                            Banned Users ({settingsGroup.bannedUsers.length})
                          </Text>
                          {settingsGroup.bannedUsers.map(bUid => {
                            const bUser = allUsers.find(u => u.uid === bUid);
                            const bName = getDisplayName(bUser) || bUid;
                            return (
                              <View key={bUid} style={styles.manageRow}>
                                <TouchableOpacity onPress={() => handleOpenUserProfile(bUid, bName)}>
                                  <Text style={styles.cardTitle}>{bName}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                  style={styles.approveBtn}
                                  onPress={() => handleUnbanUserFromGroup(settingsGroup, bUid)}
                                >
                                  <Text style={styles.approveBtnText}>Unban</Text>
                                </TouchableOpacity>
                              </View>
                            );
                          })}
                        </>
                      )}
                    </>
                  )}
                </ScrollView>
              </>
            ) : activeGroup ? (
              <>
                <View style={styles.roomHeader}>
                  <TouchableOpacity
                    style={styles.backIconBtn}
                    onPress={closeAllChatRooms}
                  >
                    <Ionicons name="arrow-back" size={20} color="#FAFAFA" />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}
                    onPress={() => {
                      if (isMemberInActiveGroup) {
                        handleOpenGroupSettings(activeGroup, 'overview');
                      }
                    }}
                    activeOpacity={isMemberInActiveGroup ? 0.8 : 1}
                  >
                    <View style={styles.groupHeaderAvatar}>
                      {activeGroup.avatar ? (
                        <Image source={{ uri: activeGroup.avatar }} style={styles.avatarImg} />
                      ) : (
                        <Text style={styles.avatarLetter}>
                          {activeGroup.name?.[0]?.toUpperCase() || 'G'}
                        </Text>
                      )}
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text style={styles.roomTitle} numberOfLines={1}>
                        {activeGroup.name}
                      </Text>
                      <Text style={styles.roomSubtitle}>
                        {Array.from(new Set([...activeGroup.admins, ...activeGroup.members])).length}/{activeGroupStageInfo.maxMembersLabel} members • {activeGroup.boostCount || 0} boosts
                        {isMemberInActiveGroup ? ' • Tap row for settings' : ' • Live preview'}
                      </Text>
                    </View>

                    {isMemberInActiveGroup && (
                      <Ionicons name="chevron-forward" size={18} color="#EAB308" />
                    )}
                  </TouchableOpacity>
                </View>

                {activeGroup.pinnedMessage && (
                  <TouchableOpacity
                    style={styles.pinnedBanner}
                    onPress={() => handleJumpToPinnedMessage(activeGroup.pinnedMessage!.id)}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="pin" size={14} color="#EAB308" />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.pinnedBannerTitle} numberOfLines={1}>
                        Pinned by {activeGroup.pinnedMessage.senderName}
                      </Text>
                      <Text style={styles.pinnedBannerText} numberOfLines={1}>
                        {activeGroup.pinnedMessage.text}
                      </Text>
                    </View>
                    {isCurrentUserGroupAdmin(activeGroup) && (
                      <TouchableOpacity
                        onPress={() => handleUnpinGroupMessage(activeGroup)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name="close" size={16} color="#A1A1AA" />
                      </TouchableOpacity>
                    )}
                  </TouchableOpacity>
                )}

                <View style={{ flex: 1, overflow: 'hidden', borderRadius: 14, marginTop: 8 }}>
                  {activeGroupWallpaper && activeGroupStageInfo.allowBackground ? (
                    <ImageBackground
                      source={{ uri: activeGroupWallpaper }}
                      style={{ flex: 1 }}
                      imageStyle={{ opacity: 0.25 }}
                    >
                      <ScrollView
                        ref={(el: any) => {
                          groupScrollRef.current = el;
                        }}
                        style={styles.messagesScroll}
                        contentContainerStyle={{ paddingVertical: 12 }}
                        showsVerticalScrollIndicator={false}
                      >
                        {groupMessages.length === 0 ? (
                          <Text style={styles.emptyChatHint}>No messages in this group yet.</Text>
                        ) : (
                          groupMessages.map(msg => {
                            const isMe = msg.senderId === currentUserId;
                            const senderObj = allUsers.find(u => u.uid === msg.senderId);
                            const senderName = isMe
                              ? getDisplayName(currentUser)
                              : msg.senderName || getDisplayName(senderObj);
                            const nameColor = getSenderNameColor(msg.senderId || senderName);
                            const senderIsAdmin =
                              !!msg.senderId &&
                              (activeGroup.admins.includes(msg.senderId) ||
                                activeGroup.creatorId === msg.senderId);
                            const { imageUri, videoUri } = resolveMessageMedia(msg);
                            const isHighlighted = highlightedMessageId === msg.id;
                            const reactionEntries = Object.entries(msg.reactions || {}).filter(
                              ([, uids]) => Array.isArray(uids) && uids.length > 0
                            );
                            const openGroupSheet = () =>
                              setMessageActionSheet({
                                scope: 'group',
                                group: activeGroup,
                                message: msg,
                              });

                            return (
                              <TouchableOpacity
                                key={msg.id}
                                onLayout={e => {
                                  messageOffsetsRef.current[msg.id] = e.nativeEvent.layout.y;
                                }}
                                activeOpacity={0.95}
                                onLongPress={openGroupSheet}
                                delayLongPress={260}
                                style={[styles.bubbleRow, isMe ? styles.bubbleRight : styles.bubbleLeft]}
                              >
                                <View
                                  style={[
                                    styles.bubble,
                                    isMe ? styles.bubbleMe : styles.bubbleOther,
                                    isHighlighted && styles.highlightedBubble,
                                  ]}
                                >
                                  <TouchableOpacity
                                    onPress={() => handleOpenUserProfile(msg.senderId, senderName)}
                                    activeOpacity={0.75}
                                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 3 }}
                                  >
                                    <Text
                                      style={[
                                        styles.senderTag,
                                        { color: isMe ? '#09090B' : nameColor },
                                      ]}
                                    >
                                      {senderName}
                                    </Text>
                                    {senderIsAdmin && <Text style={styles.adminTag}>ADMIN</Text>}
                                  </TouchableOpacity>
                                  {videoUri && (
                                    <ChatVideoPreview
                                      uri={videoUri}
                                      style={styles.chatInlineVideo}
                                      onLongPress={openGroupSheet}
                                      onPress={() =>
                                        handleOpenMediaLightbox({
                                          uri: videoUri,
                                          type: 'video',
                                          caption: msg.text,
                                          senderName,
                                        })
                                      }
                                    />
                                  )}
                                  {imageUri && (
                                    <TouchableOpacity
                                      activeOpacity={0.88}
                                      onLongPress={openGroupSheet}
                                      delayLongPress={260}
                                      onPress={() =>
                                        handleOpenMediaLightbox({
                                          uri: imageUri,
                                          type: 'image',
                                          caption: msg.text,
                                          senderName,
                                        })
                                      }
                                    >
                                      <Image
                                        source={{ uri: imageUri }}
                                        style={styles.chatInlineMedia}
                                        resizeMode="cover"
                                      />
                                    </TouchableOpacity>
                                  )}
                                  {!!msg.text && (
                                    <Text style={[styles.bubbleText, isMe && { color: '#09090B' }]}>
                                      {msg.text}
                                      {msg.edited ? ' (edited)' : ''}
                                    </Text>
                                  )}
                                  <View style={styles.bubbleFooterRow}>
                                    <Text style={[styles.bubbleTime, isMe && { color: '#27272A' }]}>
                                      {formatTimeShort(msg.createdAt)}
                                    </Text>
                                  </View>

                                  {reactionEntries.length > 0 && (
                                    <View style={styles.reactionsRow}>
                                      {reactionEntries.map(([emoji, uids]) => {
                                        const mine = uids.includes(currentUserId);
                                        return (
                                          <TouchableOpacity
                                            key={emoji}
                                            style={[styles.reactionChip, mine && styles.reactionChipMine]}
                                            onPress={() =>
                                              handleToggleEmojiReaction(
                                                { scope: 'group', groupId: activeGroup.id, message: msg },
                                                emoji
                                              )
                                            }
                                          >
                                            <Text style={styles.reactionChipText}>
                                              {emoji} {uids.length}
                                            </Text>
                                          </TouchableOpacity>
                                        );
                                      })}
                                    </View>
                                  )}
                                </View>
                              </TouchableOpacity>
                            );
                          })
                        )}
                      </ScrollView>
                    </ImageBackground>
                  ) : (
                    <ScrollView
                      ref={(el: any) => {
                        groupScrollRef.current = el;
                      }}
                      style={styles.messagesScroll}
                      contentContainerStyle={{ paddingVertical: 12 }}
                      showsVerticalScrollIndicator={false}
                    >
                      {groupMessages.length === 0 ? (
                        <Text style={styles.emptyChatHint}>No messages in this group yet.</Text>
                      ) : (
                        groupMessages.map(msg => {
                          const isMe = msg.senderId === currentUserId;
                          const senderObj = allUsers.find(u => u.uid === msg.senderId);
                          const senderName = isMe
                            ? getDisplayName(currentUser)
                            : msg.senderName || getDisplayName(senderObj);
                          const nameColor = getSenderNameColor(msg.senderId || senderName);
                          const senderIsAdmin =
                            !!msg.senderId &&
                            (activeGroup.admins.includes(msg.senderId) ||
                              activeGroup.creatorId === msg.senderId);
                          const { imageUri, videoUri } = resolveMessageMedia(msg);
                          const isHighlighted = highlightedMessageId === msg.id;
                          const reactionEntries = Object.entries(msg.reactions || {}).filter(
                            ([, uids]) => Array.isArray(uids) && uids.length > 0
                          );
                          const openGroupSheet = () =>
                            setMessageActionSheet({
                              scope: 'group',
                              group: activeGroup,
                              message: msg,
                            });

                          return (
                            <TouchableOpacity
                              key={msg.id}
                              onLayout={e => {
                                messageOffsetsRef.current[msg.id] = e.nativeEvent.layout.y;
                              }}
                              activeOpacity={0.95}
                              onLongPress={openGroupSheet}
                              delayLongPress={260}
                              style={[styles.bubbleRow, isMe ? styles.bubbleRight : styles.bubbleLeft]}
                            >
                              <View
                                style={[
                                  styles.bubble,
                                  isMe ? styles.bubbleMe : styles.bubbleOther,
                                  isHighlighted && styles.highlightedBubble,
                                ]}
                              >
                                <TouchableOpacity
                                  onPress={() => handleOpenUserProfile(msg.senderId, senderName)}
                                  activeOpacity={0.75}
                                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 3 }}
                                >
                                  <Text
                                    style={[
                                      styles.senderTag,
                                      { color: isMe ? '#09090B' : nameColor },
                                    ]}
                                  >
                                    {senderName}
                                  </Text>
                                  {senderIsAdmin && <Text style={styles.adminTag}>ADMIN</Text>}
                                </TouchableOpacity>
                                {videoUri && (
                                  <ChatVideoPreview
                                    uri={videoUri}
                                    style={styles.chatInlineVideo}
                                    onLongPress={openGroupSheet}
                                    onPress={() =>
                                      handleOpenMediaLightbox({
                                        uri: videoUri,
                                        type: 'video',
                                        caption: msg.text,
                                        senderName,
                                      })
                                    }
                                  />
                                )}
                                {imageUri && (
                                  <TouchableOpacity
                                    activeOpacity={0.88}
                                    onLongPress={openGroupSheet}
                                    delayLongPress={260}
                                    onPress={() =>
                                      handleOpenMediaLightbox({
                                        uri: imageUri,
                                        type: 'image',
                                        caption: msg.text,
                                        senderName,
                                      })
                                    }
                                  >
                                    <Image
                                      source={{ uri: imageUri }}
                                      style={styles.chatInlineMedia}
                                      resizeMode="cover"
                                    />
                                  </TouchableOpacity>
                                )}
                                {!!msg.text && (
                                  <Text style={[styles.bubbleText, isMe && { color: '#09090B' }]}>
                                    {msg.text}
                                    {msg.edited ? ' (edited)' : ''}
                                  </Text>
                                )}
                                <View style={styles.bubbleFooterRow}>
                                  <Text style={[styles.bubbleTime, isMe && { color: '#27272A' }]}>
                                    {formatTimeShort(msg.createdAt)}
                                  </Text>
                                </View>

                                {reactionEntries.length > 0 && (
                                  <View style={styles.reactionsRow}>
                                    {reactionEntries.map(([emoji, uids]) => {
                                      const mine = uids.includes(currentUserId);
                                      return (
                                        <TouchableOpacity
                                          key={emoji}
                                          style={[styles.reactionChip, mine && styles.reactionChipMine]}
                                          onPress={() =>
                                            handleToggleEmojiReaction(
                                              { scope: 'group', groupId: activeGroup.id, message: msg },
                                              emoji
                                            )
                                          }
                                        >
                                          <Text style={styles.reactionChipText}>
                                            {emoji} {uids.length}
                                          </Text>
                                        </TouchableOpacity>
                                      );
                                    })}
                                  </View>
                                )}
                              </View>
                            </TouchableOpacity>
                          );
                        })
                      )}
                    </ScrollView>
                  )}
                </View>

                {isMemberInActiveGroup ? (
                  <>
                    {pendingGroupMedia && (
                      <View style={styles.pendingMediaPreviewBox}>
                        {pendingGroupMedia.type === 'video' ? (
                          <ChatVideoPreview
                            uri={pendingGroupMedia.uri}
                            style={styles.pendingMediaThumb}
                          />
                        ) : (
                          <Image
                            source={{ uri: pendingGroupMedia.uri }}
                            style={styles.pendingMediaThumb}
                            resizeMode="cover"
                          />
                        )}
                        <View style={{ flex: 1 }}>
                          <Text style={styles.pendingMediaTitle}>
                            {pendingGroupMedia.type === 'video' ? 'Video attached' : 'Photo attached'}
                          </Text>
                          <Text style={styles.pendingMediaSub}>
                            Type a message below and press send
                          </Text>
                        </View>
                        <TouchableOpacity onPress={() => setPendingGroupMedia(null)}>
                          <Ionicons name="close-circle" size={22} color="#EF4444" />
                        </TouchableOpacity>
                      </View>
                    )}

                    <View style={styles.composerRow}>
                      <TouchableOpacity
                        style={[styles.mediaAttachBtn, sendingGroupMedia && { opacity: 0.5 }]}
                        onPress={() => handlePickGroupMediaDraft('image')}
                        disabled={sendingGroupMedia}
                        activeOpacity={0.85}
                      >
                        <Ionicons name="image-outline" size={19} color="#EAB308" />
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.mediaAttachBtn, sendingGroupMedia && { opacity: 0.5 }]}
                        onPress={() => handlePickGroupMediaDraft('video')}
                        disabled={sendingGroupMedia}
                        activeOpacity={0.85}
                      >
                        <Ionicons name="videocam-outline" size={19} color="#38BDF8" />
                      </TouchableOpacity>

                      <TextInput
                        style={styles.composerInput}
                        placeholder={
                          pendingGroupMedia ? 'Add text with media...' : 'Write a message...'
                        }
                        placeholderTextColor="#71717A"
                        value={groupMessageInput}
                        onChangeText={setGroupMessageInput}
                      />
                      <TouchableOpacity
                        style={styles.sendBtn}
                        onPress={handleSendGroupMessage}
                        activeOpacity={0.85}
                      >
                        <Ionicons name="send" size={16} color="#09090B" />
                      </TouchableOpacity>
                    </View>
                  </>
                ) : (
                  <View style={styles.joinFooterBox}>
                    <Text style={styles.joinFooterHint}>
                      Watching live messages • Join to send messages & open settings
                    </Text>
                    <TouchableOpacity
                      style={styles.joinGroupPrimaryBtn}
                      onPress={() => handleJoinOrRequestGroup(activeGroup)}
                      activeOpacity={0.85}
                    >
                      <Ionicons
                        name={activeGroup.accessMode === 'private' ? 'lock-closed' : 'enter'}
                        size={17}
                        color="#09090B"
                      />
                      <Text style={styles.joinGroupPrimaryBtnText}>
                        {activeGroup.accessMode === 'private'
                          ? activeGroup.pendingRequests.includes(currentUserId)
                            ? 'Cancel Join Request'
                            : 'Request to Join'
                          : 'Join Group'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </>
            ) : null}
          </View>
        </View>
      </Modal>

      {/* Long-Press Message Action Sheet */}
      <Modal
        visible={!!messageActionSheet}
        transparent
        presentationStyle="overFullScreen"
        animationType="fade"
        onRequestClose={() => setMessageActionSheet(null)}
      >
        <TouchableOpacity
          style={styles.actionSheetBackdrop}
          activeOpacity={1}
          onPress={() => setMessageActionSheet(null)}
        >
          {messageActionSheet && (
            <TouchableOpacity
              activeOpacity={1}
              style={styles.actionSheetBox}
              onPress={() => {}}
            >
              <Text style={styles.actionSheetLabel}>React with Emoji</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.emojiPickerScroll}
                contentContainerStyle={styles.emojiPickerRow}
              >
                {QUICK_EMOJIS.map(emoji => {
                  const list =
                    (messageActionSheet.message.reactions &&
                      messageActionSheet.message.reactions[emoji]) ||
                    [];
                  const selected = list.includes(currentUserId);
                  return (
                    <TouchableOpacity
                      key={emoji}
                      style={[styles.emojiChoiceBtn, selected && styles.emojiChoiceBtnSelected]}
                      onPress={async () => {
                        const target = messageActionSheet;
                        setMessageActionSheet(null);
                        await handleToggleEmojiReaction(
                          {
                            scope: target.scope,
                            chatId: target.chatId,
                            groupId: target.group?.id,
                            message: target.message,
                          },
                          emoji
                        );
                      }}
                    >
                      <Text style={styles.emojiChoiceText}>{emoji}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <TouchableOpacity
                style={styles.actionRowBtn}
                onPress={async () => {
                  const target = messageActionSheet;
                  setMessageActionSheet(null);
                  await handlePinMessage({
                    scope: target.scope,
                    chatId: target.chatId,
                    groupId: target.group?.id,
                    message: target.message,
                  });
                }}
              >
                <Ionicons name="pin-outline" size={18} color="#EAB308" />
                <Text style={styles.actionRowBtnText}>Pin Message</Text>
              </TouchableOpacity>

              {messageActionSheet.message.senderId && (
                <TouchableOpacity
                  style={styles.actionRowBtn}
                  onPress={() => {
                    const target = messageActionSheet;
                    setMessageActionSheet(null);
                    handleOpenUserProfile(
                      target.message.senderId,
                      target.message.senderName
                    );
                  }}
                >
                  <Ionicons name="person-outline" size={18} color="#38BDF8" />
                  <Text style={styles.actionRowBtnText}>View Sender Profile</Text>
                </TouchableOpacity>
              )}

              {messageActionSheet.message.senderId === currentUserId && (
                <TouchableOpacity
                  style={styles.actionRowBtn}
                  onPress={() => {
                    const target = messageActionSheet;
                    setMessageActionSheet(null);
                    handleStartEditMessage({
                      scope: target.scope,
                      chatId: target.chatId,
                      groupId: target.group?.id,
                      message: target.message,
                    });
                  }}
                >
                  <Ionicons name="create-outline" size={18} color="#EAB308" />
                  <Text style={styles.actionRowBtnText}>Edit Message</Text>
                </TouchableOpacity>
              )}

              {(messageActionSheet.message.senderId === currentUserId ||
                (messageActionSheet.scope === 'group' &&
                  isCurrentUserGroupAdmin(messageActionSheet.group || null))) && (
                <TouchableOpacity
                  style={styles.actionRowBtn}
                  onPress={() => {
                    const target = messageActionSheet;
                    setMessageActionSheet(null);
                    handleDeleteMessage({
                      scope: target.scope,
                      chatId: target.chatId,
                      groupId: target.group?.id,
                      message: target.message,
                      groupObj: target.group,
                    });
                  }}
                >
                  <Ionicons name="trash-outline" size={18} color="#EF4444" />
                  <Text style={[styles.actionRowBtnText, { color: '#EF4444' }]}>Delete Message</Text>
                </TouchableOpacity>
              )}

              {messageActionSheet.scope === 'group' &&
                messageActionSheet.group &&
                isCurrentUserGroupAdmin(messageActionSheet.group) &&
                messageActionSheet.message.senderId &&
                messageActionSheet.message.senderId !== currentUserId &&
                messageActionSheet.message.senderId !== messageActionSheet.group.creatorId && (
                  <>
                    <TouchableOpacity
                      style={styles.actionRowBtn}
                      onPress={() => {
                        const target = messageActionSheet;
                        setMessageActionSheet(null);
                        if (target.group) {
                          handleKickUserFromGroup(target.group, target.message.senderId);
                        }
                      }}
                    >
                      <Ionicons name="walk-outline" size={18} color="#F97316" />
                      <Text style={[styles.actionRowBtnText, { color: '#F97316' }]}>
                        Kick User From Group
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.actionRowBtn}
                      onPress={() => {
                        const target = messageActionSheet;
                        setMessageActionSheet(null);
                        if (target.group) {
                          handleBanUserFromGroup(target.group, target.message.senderId);
                        }
                      }}
                    >
                      <Ionicons name="ban-outline" size={18} color="#EF4444" />
                      <Text style={[styles.actionRowBtnText, { color: '#EF4444' }]}>
                        Ban User From Group
                      </Text>
                    </TouchableOpacity>
                  </>
                )}

              {messageActionSheet.message.senderId !== currentUserId && (
                <TouchableOpacity
                  style={styles.actionRowBtn}
                  onPress={() => {
                    const target = messageActionSheet;
                    setMessageActionSheet(null);
                    handleReportMessage(target.message, target.group?.id);
                  }}
                >
                  <Ionicons name="flag-outline" size={18} color="#F97316" />
                  <Text style={[styles.actionRowBtnText, { color: '#F97316' }]}>Report Message</Text>
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          )}
        </TouchableOpacity>
      </Modal>

      {/* Edit Sent Message Modal */}
      <Modal
        visible={!!editingMessageTarget}
        transparent
        presentationStyle="overFullScreen"
        animationType="fade"
        onRequestClose={() => setEditingMessageTarget(null)}
      >
        <View style={styles.actionSheetBackdrop}>
          <View style={styles.actionSheetBox}>
            <Text style={styles.modalTitle}>Edit Message</Text>
            <TextInput
              style={[styles.input, { marginTop: 12 }]}
              value={editMessageDraft}
              onChangeText={setEditMessageDraft}
              placeholder="Update your message..."
              placeholderTextColor="#71717A"
              multiline
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                style={[styles.wallpaperClearBtn, { flex: 1, alignItems: 'center' }]}
                onPress={() => {
                  setEditingMessageTarget(null);
                  setEditMessageDraft('');
                }}
              >
                <Text style={styles.wallpaperClearBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primarySubmitBtn, { flex: 1 }]}
                onPress={handleSaveEditedMessage}
              >
                <Text style={styles.primarySubmitBtnText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Target User Followers / Following List Modal */}
      <Modal
        visible={!!targetActiveModalList && !!liveProfileUser}
        transparent
        animationType="slide"
        onRequestClose={() => setTargetActiveModalList(null)}
      >
        <View style={styles.floatingOverlayCenter}>
          <View style={styles.modalContentCenter}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {targetActiveModalList === 'followers' ? 'Followers 👥' : 'Following 🤝'}
              </Text>
              <TouchableOpacity
                onPress={() => setTargetActiveModalList(null)}
                activeOpacity={0.8}
                style={styles.closeFullScreenBtn}
              >
                <Ionicons name="close" size={22} color="#FAFAFA" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
              {(targetActiveModalList === 'followers' ? targetFollowersList : targetFollowingList)
                .length === 0 ? (
                <Text style={styles.mutedNote}>No users in this list yet.</Text>
              ) : (
                (targetActiveModalList === 'followers' ? targetFollowersList : targetFollowingList).map(
                  item => {
                    const itemName = getDisplayName(item);
                    return (
                      <TouchableOpacity
                        key={item.uid}
                        style={styles.listItem}
                        onPress={() => {
                          setTargetActiveModalList(null);
                          handleOpenUserProfile(item.uid, itemName);
                        }}
                        activeOpacity={0.85}
                      >
                        <View style={styles.smallAvatar}>
                          {item.avatar ? (
                            <Image source={{ uri: item.avatar }} style={styles.avatarImg} />
                          ) : (
                            <Text style={styles.avatarLetter}>
                              {itemName[0]?.toUpperCase() || 'P'}
                            </Text>
                          )}
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <Text style={styles.cardTitle}>{itemName}</Text>
                            {item.isVip && (
                              <Ionicons name="checkmark-circle" size={14} color="#EAB308" />
                            )}
                          </View>
                          <Text style={styles.cardSubtitle}>
                            📍 {normalizeCity(item.city)}, {normalizeCountry(item.country)}
                            {item.age ? ` | Age: ${item.age}` : ''}
                          </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={18} color="#71717A" />
                      </TouchableOpacity>
                    );
                  }
                )
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Player Profile Modal */}
      <Modal
        visible={!!liveProfileUser && !targetActiveModalList}
        transparent
        animationType="fade"
        onRequestClose={handleCloseProfileModal}
      >
        <View style={styles.floatingOverlayCenter}>
          {!!liveProfileUser && (
            <View style={styles.profileModalSheet}>
              <View style={styles.modalHeader}>
                <View>
                  <Text style={styles.eyebrow}>PLAYER PROFILE</Text>
                  <Text style={styles.headerTitle}>
                    World <Text style={styles.accent}>Sports</Text>
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.closeFullScreenBtn}
                  onPress={handleCloseProfileModal}
                >
                  <Ionicons name="close" size={22} color="#FAFAFA" />
                </TouchableOpacity>
              </View>

              {(() => {
                const pName = getDisplayName(liveProfileUser);
                const sportsArr =
                  Array.isArray(liveProfileUser.sports) && liveProfileUser.sports.length > 0
                    ? liveProfileUser.sports
                    : [liveProfileUser.sport || 'Football'];
                const isMe = !!currentUserId && liveProfileUser.uid === currentUserId;
                const isBlockedByMe = blockedUsers.includes(liveProfileUser.uid);
                const isBlockingMe =
                  Array.isArray(liveProfileUser.blockedUsers) && currentUserId
                    ? liveProfileUser.blockedUsers.includes(currentUserId)
                    : false;
                const anyBlock = !isMe && (isBlockedByMe || isBlockingMe);
                const isFollowing =
                  Array.isArray(liveProfileUser.followers) &&
                  liveProfileUser.followers.includes(currentUserId);
                const hasRequested =
                  Array.isArray(liveProfileUser.pendingRequests) &&
                  liveProfileUser.pendingRequests.includes(currentUserId);
                const isPrivate = liveProfileUser.isPrivate === true;
                const canSeePosts = !anyBlock && (isMe || !isPrivate || isFollowing);

                return (
                  <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
                    <View style={styles.profileCenterHeader}>
                      <TouchableOpacity
                        style={styles.profileAvatarLg}
                        activeOpacity={0.85}
                        onPress={() => {
                          if (liveProfileUser.avatar && !anyBlock) {
                            handleOpenMediaLightbox({
                              uri: liveProfileUser.avatar,
                              type: 'image',
                              senderName: pName,
                            });
                          }
                        }}
                      >
                        {liveProfileUser.avatar && !anyBlock ? (
                          <Image source={{ uri: liveProfileUser.avatar }} style={styles.avatarImg} />
                        ) : (
                          <Text style={styles.profileAvatarLgText}>
                            {pName[0]?.toUpperCase() || 'P'}
                          </Text>
                        )}
                      </TouchableOpacity>

                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={styles.profileModalName}>{pName}</Text>
                        {liveProfileUser.isVip && (
                          <Ionicons name="checkmark-circle" size={18} color="#EAB308" />
                        )}
                        {liveProfileUser.isPrivate && (
                          <Ionicons name="lock-closed" size={14} color="#EF4444" />
                        )}
                      </View>

                      {!anyBlock && (
                        <>
                          <View style={styles.profileSportsRow}>
                            {sportsArr.map((sp, idx) => (
                              <View key={idx} style={styles.profileSportPill}>
                                <Text style={styles.profileSportPillText}>{sp}</Text>
                              </View>
                            ))}
                          </View>
                          <Text style={styles.profileMetaLine}>
                            📍 {normalizeCity(liveProfileUser.city)}, {liveProfileUser.country || 'Israel'}
                            {liveProfileUser.age ? ` • Age: ${liveProfileUser.age}` : ''}
                          </Text>
                        </>
                      )}
                    </View>

                    {!anyBlock && (
                      <View style={styles.profileStatsBar}>
                        <TouchableOpacity
                          style={styles.profileStatItem}
                          activeOpacity={canSeePosts ? 0.8 : 1}
                          onPress={() => {
                            if (!canSeePosts) return;
                            setTargetActiveModalList('followers');
                          }}
                        >
                          <Text style={styles.profileStatNum}>
                            {isMe ? myFollowersList.length : targetFollowersList.length}
                          </Text>
                          <Text style={styles.profileStatLabel}>Followers</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.profileStatItem}
                          activeOpacity={canSeePosts ? 0.8 : 1}
                          onPress={() => {
                            if (!canSeePosts) return;
                            setTargetActiveModalList('following');
                          }}
                        >
                          <Text style={styles.profileStatNum}>
                            {isMe ? myFollowingList.length : targetFollowingList.length}
                          </Text>
                          <Text style={styles.profileStatLabel}>Following</Text>
                        </TouchableOpacity>

                        <View style={styles.profileStatItem}>
                          <Text style={styles.profileStatNum}>{liveProfilePosts.length}</Text>
                          <Text style={styles.profileStatLabel}>Posts</Text>
                        </View>
                      </View>
                    )}

                    {!isMe && (
                      <View style={{ gap: 8, marginBottom: 14 }}>
                        {!anyBlock && (
                          <View style={{ flexDirection: 'row', gap: 8 }}>
                            <TouchableOpacity
                              style={[
                                styles.profilePrimaryBtn,
                                { flex: 1 },
                                isFollowing && styles.profileFollowingBtnAlt,
                                hasRequested && {
                                  backgroundColor: '#27272A',
                                  borderWidth: 1,
                                  borderColor: '#52525B',
                                },
                              ]}
                              onPress={() => handleToggleFollowInProfileModal(liveProfileUser)}
                            >
                              <Text
                                style={[
                                  styles.profilePrimaryBtnText,
                                  isFollowing && { color: '#EAB308' },
                                  hasRequested && { color: '#FAFAFA' },
                                ]}
                              >
                                {isFollowing
                                  ? 'Following ✓'
                                  : hasRequested
                                  ? 'Requested ⏳'
                                  : isPrivate
                                  ? 'Request Follow'
                                  : 'Follow Player'}
                              </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={styles.profilePrimaryBtn}
                              onPress={() => {
                                setProfileModalUser(null);
                                handleOpenPersonalChat(liveProfileUser);
                              }}
                            >
                              <Ionicons name="chatbubbles-outline" size={16} color="#09090B" />
                              <Text style={styles.profilePrimaryBtnText}>Message</Text>
                            </TouchableOpacity>
                          </View>
                        )}

                        {!isBlockingMe && (
                          <TouchableOpacity
                            style={styles.profileBlockBtn}
                            onPress={() => handleToggleBlockInProfileModal(liveProfileUser)}
                          >
                            <Ionicons name="ban-outline" size={13} color="#EF4444" />
                            <Text style={styles.profileBlockBtnText}>
                              {isBlockedByMe ? 'Unblock User' : 'Block User'}
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    )}

                    {anyBlock ? (
                      <View style={styles.emptyCard}>
                        <Ionicons name="ban" size={32} color="#EF4444" />
                        <Text style={styles.emptyTitle}>Profile Unavailable</Text>
                        <Text style={styles.emptySub}>
                          You cannot view this profile or interact with this user while a block is active.
                        </Text>
                      </View>
                    ) : !canSeePosts ? (
                      <View style={styles.emptyCard}>
                        <Ionicons name="lock-closed" size={32} color="#EAB308" />
                        <Text style={styles.emptyTitle}>This Account is Private 🔒</Text>
                        <Text style={styles.emptySub}>
                          Follow this player to see their posts, stories, and connections.
                        </Text>
                      </View>
                    ) : (
                      <>
                        <Text style={styles.sectionHeading}>Posts ({liveProfilePosts.length})</Text>
                        {liveProfilePosts.length === 0 ? (
                          <Text style={styles.mutedNote}>No posts shared yet.</Text>
                        ) : (
                          <View style={styles.mediaGrid}>
                            {liveProfilePosts.map(p =>
                              p.imageUrl ? (
                                <TouchableOpacity
                                  key={p.id}
                                  style={styles.mediaTile}
                                  onPress={() =>
                                    handleOpenMediaLightbox({
                                      uri: p.imageUrl!,
                                      type: p.mediaType === 'video' ? 'video' : 'image',
                                      caption: p.caption || p.text || '',
                                      senderName: pName,
                                    })
                                  }
                                >
                                  <Image
                                    source={{ uri: p.imageUrl }}
                                    style={styles.mediaTileImg}
                                    resizeMode="cover"
                                  />
                                </TouchableOpacity>
                              ) : null
                            )}
                          </View>
                        )}
                      </>
                    )}
                  </ScrollView>
                );
              })()}
            </View>
          )}
        </View>
      </Modal>

      {/* Media Lightbox Modal */}
      <Modal
        visible={!!lightboxMedia}
        transparent
        animationType="fade"
        onRequestClose={() => setLightboxMedia(null)}
      >
        <View style={styles.floatingLightbox}>
          {!!lightboxMedia && (
            <>
              <View style={styles.lightboxTopBar}>
                <TouchableOpacity
                  style={styles.closeFullScreenBtn}
                  onPress={() => setLightboxMedia(null)}
                >
                  <Ionicons name="close" size={24} color="#FAFAFA" />
                </TouchableOpacity>
              </View>

              <View style={styles.lightboxBody}>
                {lightboxMedia.type === 'video' ? (
                  <FullscreenMediaPlayer key={lightboxMedia.uri} uri={lightboxMedia.uri} />
                ) : (
                  <Image
                    source={{ uri: lightboxMedia.uri }}
                    style={styles.lightboxImage}
                    resizeMode="contain"
                  />
                )}
              </View>

              <View style={styles.lightboxBottomCaptionCard}>
                {!!lightboxMedia.senderName && (
                  <Text style={styles.lightboxSender}>{lightboxMedia.senderName}</Text>
                )}
                <Text style={styles.lightboxBottomCaptionText}>
                  {lightboxMedia.caption?.trim()
                    ? lightboxMedia.caption
                    : 'No additional text attached'}
                </Text>
              </View>
            </>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#09090B', paddingTop: 50 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  eyebrow: { color: '#EAB308', fontSize: 11, fontWeight: '800', letterSpacing: 0.6 },
  headerTitle: { color: '#FAFAFA', fontSize: 24, fontWeight: '900', fontStyle: 'italic' },
  accent: { color: '#EAB308' },

  subTabsRow: {
    flexDirection: 'row',
    marginHorizontal: 20,
    backgroundColor: '#121215',
    borderRadius: 14,
    padding: 4,
    borderWidth: 1,
    borderColor: '#27272A',
    marginBottom: 12,
  },
  subTabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 10,
    borderRadius: 11,
  },
  subTabBtnActive: { backgroundColor: '#EAB308' },
  subTabText: { color: '#A1A1AA', fontSize: 12, fontWeight: '800' },
  subTabTextActive: { color: '#09090B', fontWeight: '900' },

  tabBody: { flex: 1, paddingHorizontal: 20 },
  searchActionRow: { flexDirection: 'row', gap: 8, marginBottom: 8, alignItems: 'center' },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#121215',
    borderWidth: 1,
    borderColor: '#27272A',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
  },
  searchInput: { flex: 1, color: '#FAFAFA', fontSize: 13 },
  filterBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#121215',
    borderWidth: 1,
    borderColor: '#27272A',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  filterBtnActive: {
    backgroundColor: '#EAB308',
    borderColor: '#EAB308',
  },
  filterActiveDot: {
    position: 'absolute',
    top: 7,
    right: 7,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#EF4444',
  },
  filterDrawerCard: {
    backgroundColor: '#121215',
    borderWidth: 1,
    borderColor: '#27272A',
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
  },
  filterDrawerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  filterDrawerTitle: {
    color: '#EAB308',
    fontSize: 12,
    fontWeight: '800',
    flex: 1,
    marginRight: 8,
  },
  filterResetText: {
    color: '#FAFAFA',
    fontSize: 11,
    fontWeight: '800',
    textDecorationLine: 'underline',
  },
  iconActionBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#EAB308',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pinHelperText: { color: '#A1A1AA', fontSize: 11, fontWeight: '700', marginBottom: 10 },

  multiSportWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  sportFilterChip: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#09090B',
    borderWidth: 1,
    borderColor: '#27272A',
  },
  sportFilterChipActive: {
    backgroundColor: '#EAB308',
    borderColor: '#EAB308',
  },
  sportFilterChipText: {
    color: '#A1A1AA',
    fontSize: 11,
    fontWeight: '800',
  },
  sportFilterChipTextActive: {
    color: '#09090B',
    fontWeight: '900',
  },

  compactScopeRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
  },
  compactScopeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#121215',
    borderWidth: 1,
    borderColor: '#27272A',
  },
  compactScopeBtnActive: {
    backgroundColor: '#EAB308',
    borderColor: '#EAB308',
  },
  compactScopeText: {
    color: '#A1A1AA',
    fontSize: 11,
    fontWeight: '800',
  },
  compactScopeTextActive: {
    color: '#09090B',
    fontWeight: '900',
  },
  countrySubheader: {
    color: '#EAB308',
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 8,
  },

  leaderboardSortRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 10,
  },
  sortPillBtn: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#121215',
    borderWidth: 1,
    borderColor: '#27272A',
    alignItems: 'center',
  },
  sortPillBtnActive: {
    backgroundColor: '#27272A',
    borderColor: '#EAB308',
  },
  sortPillText: {
    color: '#A1A1AA',
    fontSize: 11,
    fontWeight: '800',
  },
  sortPillTextActive: {
    color: '#EAB308',
  },
  leaderboardHeaderBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#27272A',
    marginBottom: 8,
  },
  lbColText: {
    color: '#71717A',
    fontSize: 10,
    fontWeight: '800',
  },
  leaderboardRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#121215',
    borderWidth: 1,
    borderColor: '#27272A',
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
  },
  lbGroupLogoBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#18181B',
    borderWidth: 1,
    borderColor: '#EAB308',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  lbGroupLogoLetter: {
    color: '#EAB308',
    fontSize: 13,
    fontWeight: '900',
  },
  lbRankNum: {
    fontSize: 13,
    fontWeight: '900',
  },
  lbMetricValue: {
    color: '#FAFAFA',
    fontSize: 12,
    fontWeight: '900',
  },
  lbStageSub: {
    color: '#71717A',
    fontSize: 9,
    fontWeight: '700',
  },

  listCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#121215',
    borderWidth: 1,
    borderColor: '#27272A',
    borderRadius: 16,
    padding: 13,
    marginBottom: 10,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#09090B',
    borderWidth: 1,
    borderColor: '#27272A',
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
  },
  pinnedListCard: {
    borderColor: '#EAB308',
    backgroundColor: '#17150B',
  },
  avatarCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#18181B',
    borderWidth: 1,
    borderColor: '#EAB308',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  smallAvatar: {
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
  groupHeaderAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#18181B',
    borderWidth: 1.5,
    borderColor: '#EAB308',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarLetter: { color: '#EAB308', fontSize: 16, fontWeight: '900' },
  cardTopLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  cardTitle: { color: '#FAFAFA', fontSize: 14, fontWeight: '800' },
  groupSportsSubtitle: { color: '#EAB308', fontSize: 11, fontWeight: '700', marginTop: 2 },
  cardSubtitle: { color: '#A1A1AA', fontSize: 12, marginTop: 3 },
  timeLabel: { color: '#71717A', fontSize: 11, fontWeight: '600' },

  boostBadgeSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#18181B',
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 7,
  },
  boostBadgeSmallText: { fontSize: 10, fontWeight: '900' },

  groupBadgeIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  groupMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  metaChipText: { color: '#71717A', fontSize: 11, fontWeight: '700' },
  pendingPill: {
    backgroundColor: '#332E0F',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  pendingPillText: { color: '#EAB308', fontSize: 10, fontWeight: '800' },

  emptyCard: {
    backgroundColor: '#121215',
    borderWidth: 1,
    borderColor: '#27272A',
    borderRadius: 18,
    padding: 28,
    alignItems: 'center',
    marginTop: 12,
  },
  emptyTitle: { color: '#FAFAFA', fontSize: 15, fontWeight: '800', marginTop: 10 },
  emptySub: { color: '#A1A1AA', fontSize: 12, textAlign: 'center', marginTop: 4, lineHeight: 18 },
  emptyPrimaryBtn: {
    marginTop: 14,
    backgroundColor: '#EAB308',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
  },
  emptyPrimaryBtnText: { color: '#09090B', fontWeight: '900', fontSize: 12 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(9,9,11,0.88)', justifyContent: 'flex-end' },
  floatingOverlayCenter: {
    flex: 1,
    backgroundColor: 'rgba(9,9,11,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 18,
    zIndex: 999,
    elevation: 20,
  },
  modalContentCenter: {
    backgroundColor: '#121215',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#27272A',
    width: '100%',
    maxWidth: 400,
    maxHeight: '85%',
  },
  profileModalSheet: {
    backgroundColor: '#09090B',
    borderRadius: 26,
    padding: 18,
    width: '100%',
    maxWidth: 420,
    height: '86%',
    borderWidth: 1,
    borderColor: '#27272A',
  },
  profileCenterHeader: { alignItems: 'center', marginBottom: 14 },
  profileAvatarLg: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#18181B',
    borderWidth: 2,
    borderColor: '#EAB308',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    marginBottom: 10,
  },
  profileAvatarLgText: { color: '#EAB308', fontSize: 30, fontWeight: '900' },
  profileModalName: { color: '#FAFAFA', fontSize: 19, fontWeight: '900' },
  profileSportsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
    marginVertical: 8,
  },
  profileSportPill: {
    backgroundColor: '#18181B',
    borderWidth: 1,
    borderColor: '#EAB308',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
  },
  profileSportPillText: { color: '#EAB308', fontSize: 11, fontWeight: '700' },
  profileMetaLine: { color: '#A1A1AA', fontSize: 12 },
  profileStatsBar: {
    flexDirection: 'row',
    backgroundColor: '#121215',
    borderWidth: 1,
    borderColor: '#27272A',
    borderRadius: 14,
    paddingVertical: 12,
    marginBottom: 14,
  },
  profileStatItem: { flex: 1, alignItems: 'center' },
  profileStatNum: { color: '#EAB308', fontSize: 17, fontWeight: '900' },
  profileStatLabel: { color: '#A1A1AA', fontSize: 11, marginTop: 2 },
  profilePrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#EAB308',
    height: 42,
    borderRadius: 12,
    paddingHorizontal: 14,
  },
  profilePrimaryBtnText: { color: '#09090B', fontWeight: '900', fontSize: 13 },
  profileFollowingBtnAlt: {
    backgroundColor: '#18181B',
    borderWidth: 1,
    borderColor: '#EAB308',
  },
  profileBlockBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    gap: 4,
    backgroundColor: '#18181B',
    borderWidth: 1,
    borderColor: '#EF4444',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  profileBlockBtnText: { color: '#EF4444', fontSize: 11, fontWeight: '700' },

  modalSheet: {
    backgroundColor: '#121215',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '88%',
    borderWidth: 1,
    borderColor: '#27272A',
  },
  fullScreenSettingsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 14,
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#27272A',
  },
  fullScreenSettingsTitle: {
    color: '#FAFAFA',
    fontSize: 19,
    fontWeight: '900',
  },
  closeFullScreenBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#121215',
    borderWidth: 1,
    borderColor: '#27272A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  roomSheet: {
    backgroundColor: '#09090B',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 16,
    height: '92%',
    borderWidth: 1,
    borderColor: '#27272A',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  modalTitle: { color: '#FAFAFA', fontSize: 18, fontWeight: '900' },

  userPickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#09090B',
    borderWidth: 1,
    borderColor: '#27272A',
    borderRadius: 14,
    padding: 11,
    marginBottom: 8,
  },

  roomHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#27272A',
  },
  backIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#121215',
    borderWidth: 1,
    borderColor: '#27272A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  roomTitle: { color: '#FAFAFA', fontSize: 15, fontWeight: '900' },
  roomSubtitle: { color: '#A1A1AA', fontSize: 11, marginTop: 1 },

  pinnedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#181509',
    borderWidth: 1,
    borderColor: '#EAB30866',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 8,
  },
  pinnedBannerTitle: { color: '#EAB308', fontSize: 11, fontWeight: '900' },
  pinnedBannerText: { color: '#FAFAFA', fontSize: 12, marginTop: 1 },

  messagesScroll: { flex: 1 },
  emptyChatHint: { color: '#71717A', textAlign: 'center', marginTop: 40, fontSize: 13 },
  bubbleRow: { marginBottom: 10, flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  bubbleLeft: { justifyContent: 'flex-start' },
  bubbleRight: { justifyContent: 'flex-end' },
  bubble: {
    maxWidth: '78%',
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 15,
    borderWidth: 1,
  },
  bubbleOther: { backgroundColor: '#121215', borderColor: '#27272A' },
  bubbleMe: { backgroundColor: '#EAB308', borderColor: '#EAB308' },
  highlightedBubble: {
    borderColor: '#38BDF8',
    borderWidth: 2,
  },
  senderTag: { color: '#EAB308', fontSize: 11, fontWeight: '800', textDecorationLine: 'underline' },
  adminTag: {
    color: '#09090B',
    backgroundColor: '#EAB308',
    fontSize: 9,
    fontWeight: '900',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    overflow: 'hidden',
  },
  chatInlineMedia: { width: 210, height: 145, borderRadius: 10, marginBottom: 4 },
  chatInlineVideo: { width: 220, height: 135, borderRadius: 10, marginBottom: 4 },
  videoPreviewCard: {
    backgroundColor: '#18181B',
    borderWidth: 1,
    borderColor: '#38BDF8',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  videoPlayCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(234, 179, 8, 0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bubbleText: { color: '#FAFAFA', fontSize: 13, lineHeight: 18 },
  bubbleFooterRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 5,
    marginTop: 4,
  },
  bubbleTime: { color: '#A1A1AA', fontSize: 9 },

  reactionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 6,
  },
  reactionChip: {
    backgroundColor: '#18181B',
    borderWidth: 1,
    borderColor: '#27272A',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  reactionChipMine: {
    borderColor: '#38BDF8',
    backgroundColor: '#0F2430',
  },
  reactionChipText: {
    color: '#FAFAFA',
    fontSize: 10,
    fontWeight: '800',
  },

  pendingMediaPreviewBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#121215',
    borderWidth: 1,
    borderColor: '#EAB30866',
    borderRadius: 12,
    padding: 8,
    marginBottom: 6,
  },
  pendingMediaThumb: {
    width: 54,
    height: 54,
    borderRadius: 8,
    backgroundColor: '#09090B',
  },
  pendingMediaTitle: {
    color: '#FAFAFA',
    fontSize: 12,
    fontWeight: '800',
  },
  pendingMediaSub: {
    color: '#A1A1AA',
    fontSize: 11,
    marginTop: 1,
  },

  joinFooterBox: {
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#27272A',
    gap: 8,
  },
  joinFooterHint: {
    color: '#A1A1AA',
    fontSize: 11,
    textAlign: 'center',
    fontWeight: '700',
  },
  joinGroupPrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#EAB308',
    height: 46,
    borderRadius: 14,
  },
  joinGroupPrimaryBtnText: {
    color: '#09090B',
    fontSize: 14,
    fontWeight: '900',
  },

  composerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#27272A',
  },
  mediaAttachBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#121215',
    borderWidth: 1,
    borderColor: '#27272A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  composerInput: {
    flex: 1,
    backgroundColor: '#121215',
    borderWidth: 1,
    borderColor: '#27272A',
    borderRadius: 18,
    height: 42,
    paddingHorizontal: 13,
    color: '#FAFAFA',
    fontSize: 13,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#EAB308',
    justifyContent: 'center',
    alignItems: 'center',
  },

  fieldLabel: { color: '#A1A1AA', fontSize: 12, fontWeight: '700', marginBottom: 6 },
  input: {
    backgroundColor: '#121215',
    borderWidth: 1,
    borderColor: '#27272A',
    borderRadius: 12,
    height: 44,
    paddingHorizontal: 12,
    color: '#FAFAFA',
    fontSize: 13,
    marginBottom: 14,
  },
  privacyRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  privacyCard: {
    flex: 1,
    backgroundColor: '#09090B',
    borderWidth: 1,
    borderColor: '#27272A',
    borderRadius: 14,
    padding: 12,
    alignItems: 'center',
  },
  privacyCardPublic: { borderColor: '#22C55E', backgroundColor: '#14382522' },
  privacyCardPrivate: { borderColor: '#EAB308', backgroundColor: '#332E0F22' },
  privacyTitle: { color: '#FAFAFA', fontSize: 13, fontWeight: '800', marginTop: 6 },
  privacySub: { color: '#71717A', fontSize: 10, textAlign: 'center', marginTop: 2 },

  primarySubmitBtn: {
    backgroundColor: '#EAB308',
    height: 46,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primarySubmitBtnText: { color: '#09090B', fontSize: 14, fontWeight: '900' },

  settingsPillsRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 16,
  },
  settingsPillBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: '#121215',
    borderWidth: 1,
    borderColor: '#27272A',
    alignItems: 'center',
  },
  settingsPillActive: {
    backgroundColor: '#EAB308',
    borderColor: '#EAB308',
  },
  settingsPillText: {
    color: '#A1A1AA',
    fontSize: 11,
    fontWeight: '800',
  },
  settingsPillTextActive: {
    color: '#09090B',
    fontWeight: '900',
  },

  groupProfileEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#121215',
    borderWidth: 1,
    borderColor: '#27272A',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
  },
  groupEditAvatarBox: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#18181B',
    borderWidth: 1.5,
    borderColor: '#EAB308',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },

  boostStatusCard: {
    backgroundColor: '#121215',
    borderWidth: 1,
    borderColor: '#27272A',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
  },
  boostCountValue: { fontSize: 16, fontWeight: '900' },
  progressBarTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#18181B',
    overflow: 'hidden',
    marginTop: 10,
    marginBottom: 6,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  stageInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#121215',
    borderWidth: 1,
    borderColor: '#27272A',
    borderRadius: 12,
    padding: 10,
    marginBottom: 7,
  },
  packTagPill: {
    backgroundColor: '#18181B',
    borderWidth: 1,
    color: '#EAB308',
    fontSize: 10,
    fontWeight: '800',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
  boostOptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#121215',
    borderWidth: 1,
    borderColor: '#27272A',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
  },
  boostBuyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EAB308',
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 10,
  },
  boostBuyPillText: { color: '#09090B', fontSize: 12, fontWeight: '900' },

  wallpaperActionsRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    marginBottom: 10,
  },
  wallpaperPrimaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#EAB308',
    paddingVertical: 11,
    borderRadius: 10,
  },
  wallpaperPrimaryBtnText: {
    color: '#09090B',
    fontSize: 12,
    fontWeight: '900',
  },
  wallpaperClearBtn: {
    backgroundColor: '#1F1214',
    borderWidth: 1,
    borderColor: '#EF4444',
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 10,
  },
  wallpaperClearBtnText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '800',
  },
  wallpaperPreview: {
    width: '100%',
    height: 150,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#27272A',
  },

  mediaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  mediaTile: {
    width: '31%',
    backgroundColor: '#121215',
    borderWidth: 1,
    borderColor: '#27272A',
    borderRadius: 10,
    overflow: 'hidden',
  },
  mediaTileImg: {
    width: '100%',
    height: 92,
  },
  mediaTileCaption: {
    color: '#A1A1AA',
    fontSize: 10,
    padding: 5,
  },

  sectionHeading: { color: '#EAB308', fontSize: 13, fontWeight: '800', marginBottom: 8 },
  mutedNote: { color: '#71717A', fontSize: 12, marginTop: 4 },
  manageRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#121215',
    borderWidth: 1,
    borderColor: '#27272A',
    borderRadius: 12,
    padding: 11,
    marginBottom: 8,
    gap: 8,
  },
  approveBtn: {
    backgroundColor: '#22C55E',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  approveBtnText: { color: '#09090B', fontSize: 11, fontWeight: '900' },
  kickBtn: {
    backgroundColor: '#1F160C',
    borderWidth: 1,
    borderColor: '#F97316',
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 8,
  },
  kickBtnText: { color: '#F97316', fontSize: 11, fontWeight: '800' },
  rejectBtn: {
    backgroundColor: '#1F1214',
    borderWidth: 1,
    borderColor: '#EF4444',
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 8,
  },
  rejectBtnText: { color: '#EF4444', fontSize: 11, fontWeight: '800' },
  roleToggleBtn: {
    backgroundColor: '#18181B',
    borderWidth: 1,
    borderColor: '#EAB308',
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 8,
  },
  roleToggleBtnActive: { borderColor: '#EF4444' },
  roleToggleText: { color: '#EAB308', fontSize: 11, fontWeight: '800' },

  membershipActionsBox: {
    marginTop: 22,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#27272A',
    gap: 10,
  },
  leaveGroupBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#1C140C',
    borderWidth: 1,
    borderColor: '#F97316',
    height: 46,
    borderRadius: 12,
  },
  leaveGroupBtnText: {
    color: '#F97316',
    fontSize: 13,
    fontWeight: '900',
  },
  closeGroupBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#1F1214',
    borderWidth: 1,
    borderColor: '#EF4444',
    height: 46,
    borderRadius: 12,
  },
  closeGroupBtnText: {
    color: '#EF4444',
    fontSize: 13,
    fontWeight: '900',
  },

  actionSheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  actionSheetBox: {
    backgroundColor: '#121215',
    borderWidth: 1,
    borderColor: '#27272A',
    borderRadius: 18,
    padding: 16,
  },
  actionSheetLabel: {
    color: '#A1A1AA',
    fontSize: 11,
    fontWeight: '800',
    marginBottom: 8,
  },
  emojiPickerScroll: {
    marginBottom: 14,
    backgroundColor: '#09090B',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#27272A',
  },
  emojiPickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  emojiChoiceBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emojiChoiceBtnSelected: {
    backgroundColor: '#27272A',
  },
  emojiChoiceText: {
    fontSize: 20,
  },
  actionRowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#27272A',
  },
  actionRowBtnText: {
    color: '#FAFAFA',
    fontSize: 14,
    fontWeight: '700',
  },

  floatingLightbox: {
    flex: 1,
    backgroundColor: '#09090B',
    paddingTop: 52,
    paddingHorizontal: 16,
    paddingBottom: 28,
    zIndex: 999,
    elevation: 20,
  },
  lightboxTopBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginBottom: 10,
  },
  lightboxSender: {
    color: '#EAB308',
    fontSize: 13,
    fontWeight: '900',
  },
  lightboxBody: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  lightboxImage: {
    width: '100%',
    height: '85%',
    borderRadius: 12,
  },
  lightboxVideo: {
    width: '100%',
    height: 380,
    borderRadius: 12,
    backgroundColor: '#000',
  },
  lightboxBottomCaptionCard: {
    backgroundColor: '#121215',
    borderWidth: 1,
    borderColor: '#27272A',
    borderRadius: 14,
    padding: 12,
    marginTop: 10,
  },
  lightboxBottomCaptionText: {
    color: '#FAFAFA',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 2,
  },
});