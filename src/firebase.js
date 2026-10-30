import { initializeApp, getApps, getApp } from "firebase/app";
import { initializeAuth, getAuth, getReactNativePersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import AsyncStorage from "@react-native-async-storage/async-storage";

const firebaseConfig = {
  apiKey: "AIzaSyDfT2mnIejthrjZuoV8a5dwSZ1yH6Lq2wU",
  authDomain: "worldfootball-7f5be.firebaseapp.com",
  projectId: "worldfootball-7f5be",
  storageBucket: "worldfootball-7f5be.firebasestorage.app",
  messagingSenderId: "562029576530",
  appId: "1:562029576530:web:607467aec472b1ed323a8b",
  measurementId: "G-YPCX3YJCHK"
};

// אתחול פיירבייס בצורה בטוחה שמונעת כפילויות בריארקט נטיב
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

let authInstance;
try {
  authInstance = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage)
  });
} catch (e) {
  authInstance = getAuth(app);
}

export const auth = authInstance;
export const db = getFirestore(app);