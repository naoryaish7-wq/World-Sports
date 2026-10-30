import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  deleteUser,
  User as FirebaseUser
} from 'firebase/auth';
import { auth, db } from '../../src/firebase';
import { doc, setDoc, getDoc, deleteDoc } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

type AuthContextType = {
  user: any | null;
  firebaseUser: FirebaseUser | null;
  login: (email: string, pass: string, rememberMe?: boolean) => Promise<any>;
  register: (email: string, pass: string, name: string, rememberMe?: boolean) => Promise<any>;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  loading: boolean;
};

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [user, setUser] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);
      if (fbUser) {
        try {
          const userId = fbUser.email ? fbUser.email.toLowerCase().replace(/[^a-z0-9]/g, '_') : fbUser.uid;
          const userRef = doc(db, 'users', userId);
          const userSnap = await getDoc(userRef);

          if (userSnap.exists()) {
            setUser({ uid: userId, ...userSnap.data() });
          } else {
            setUser({ uid: userId, email: fbUser.email, name: fbUser.displayName || 'Player' });
          }
        } catch (e) {
          console.error("Error loading user doc:", e);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const login = async (email: string, pass: string, rememberMe: boolean = true) => {
    const userCred = await signInWithEmailAndPassword(auth, email, pass);
    
    if (rememberMe) {
      await AsyncStorage.setItem('@saved_user_email', email);
    } else {
      await AsyncStorage.removeItem('@saved_user_email');
    }
    return userCred.user;
  };

  const register = async (email: string, pass: string, name: string, rememberMe: boolean = true) => {
    const userCred = await createUserWithEmailAndPassword(auth, email, pass);
    const userId = email.toLowerCase().replace(/[^a-z0-9]/g, '_');
    
    const userData = {
      uid: userId,
      email,
      name,
      createdAt: new Date(),
      isVip: false,
      followers: [],
      following: [],
      sports: ['Football']
    };

    await setDoc(doc(db, 'users', userId), userData, { merge: true });
    setUser(userData);

    if (rememberMe) {
      await AsyncStorage.setItem('@saved_user_email', email);
    } else {
      await AsyncStorage.removeItem('@saved_user_email');
    }
    return userCred.user;
  };

  const logout = async () => {
    await signOut(auth);
    setUser(null);
    await AsyncStorage.removeItem('@saved_user_email');
  };

  const deleteAccount = async () => {
    if (!firebaseUser) return;
    if (user?.uid) {
      try {
        await deleteDoc(doc(db, 'users', user.uid));
      } catch (e) {
        console.log("Firestore delete error (ignoring):", e);
      }
    }
    await deleteUser(firebaseUser);
    setUser(null);
    setFirebaseUser(null);
    await AsyncStorage.removeItem('@saved_user_email');
  };

  return (
    <AuthContext.Provider value={{ user, firebaseUser, login, register, logout, deleteAccount, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);