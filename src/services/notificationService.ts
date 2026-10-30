import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase'; // התאם לפי הנתיב לאובייקט ה-db אצלך

// הגדרת האופן שבו ההתראה מוצגת כשהאפליקציה פתוחה
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  } as Notifications.NotificationBehavior),
});

// פונקציה לרישום והשגת Push Token למכשיר ושמירתו במסד הנתונים
export const registerForPushNotificationsAsync = async (userId: string): Promise<string | undefined> => {
  let token: string | undefined;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#eab308',
    });
  }

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    
    if (finalStatus !== 'granted') {
      console.log('Failed to get push token for push notification!');
      return;
    }

    try {
      token = (await Notifications.getExpoPushTokenAsync()).data;
      console.log('Expo Push Token:', token);

      if (userId && token) {
        const userRef = doc(db, 'users', userId);
        await updateDoc(userRef, { pushToken: token });
      }
    } catch (e) {
      console.error('Error getting push token:', e);
    }
  } else {
    console.log('Must use physical device for Push Notifications');
  }

  return token;
};

// פונקציה לשליחת התראה מקומית מיידית עם סינון התראות עצמיות ותמיכה בנתוני ניווט
export const triggerLocalNotification = async (
  title: string, 
  body: string, 
  data?: any, 
  actorId?: string, 
  targetUserId?: string
) => {
  try {
    // סינון: אם המבצע (actorId) הוא גם בעל הפוסט/יעד (targetUserId), אל תשלח התראה!
    if (actorId && targetUserId && actorId === targetUserId) {
      console.log('Skipping notification: User interacted with their own content.');
      return;
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('Notification permission not granted. Skipping local notification.');
      return;
    }

    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: data || {}, // כאן נשמרים נתוני הניווט (למשל postId)
        sound: 'default',
      },
      trigger: null,
    });
  } catch (error) {
    console.log('Error triggering local notification:', error);
  }
};