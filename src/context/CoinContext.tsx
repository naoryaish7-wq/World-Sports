import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

type CoinContextType = {
  coins: number;
  xp: number;
  level: number;
  addCoins: (amount: number) => void;
  spendCoins: (amount: number) => boolean;
  addXp: (amount: number) => void;
};

const CoinContext = createContext<CoinContextType>({
  coins: 1450,
  xp: 7850,
  level: 42,
  addCoins: () => {},
  spendCoins: () => false,
  addXp: () => {},
});

export const CoinProvider = ({ children }: { children: React.ReactNode }) => {
  const [coins, setCoins] = useState<number>(1450);
  const [xp, setXp] = useState<number>(7850);
  const [level, setLevel] = useState<number>(42);

  // טעינת נתונים שמורים בפתיחת האפליקציה
  useEffect(() => {
    const loadStoredData = async () => {
      try {
        const savedCoins = await AsyncStorage.getItem('@world_sport_coins');
        const savedXp = await AsyncStorage.getItem('@world_sport_xp');
        const savedLevel = await AsyncStorage.getItem('@world_sport_level');

        if (savedCoins !== null) setCoins(parseInt(savedCoins, 10));
        if (savedXp !== null) setXp(parseInt(savedXp, 10));
        if (savedLevel !== null) setLevel(parseInt(savedLevel, 10));
      } catch (error) {
        console.log('Failed to load data from storage', error);
      }
    };
    loadStoredData();
  }, []);

  const saveCoins = async (newCoins: number) => {
    setCoins(newCoins);
    await AsyncStorage.setItem('@world_sport_coins', newCoins.toString());
  };

  const addCoins = (amount: number) => {
    saveCoins(coins + amount);
  };

  const spendCoins = (amount: number) => {
    if (coins >= amount) {
      saveCoins(coins - amount);
      return true;
    }
    return false;
  };

  const addXp = async (amount: number) => {
    let newXp = xp + amount;
    let newLevel = level;
    let xpNeededForNextLevel = newLevel * 250; // חישוב סף לעליית רמה

    if (newXp >= xpNeededForNextLevel) {
      newXp -= xpNeededForNextLevel;
      newLevel += 1;
      // בונוס מטבעות בעליית רמה!
      const levelBonus = newLevel * 100;
      saveCoins(coins + levelBonus);
    }

    setXp(newXp);
    setLevel(newLevel);
    await AsyncStorage.setItem('@world_sport_xp', newXp.toString());
    await AsyncStorage.setItem('@world_sport_level', newLevel.toString());
  };

  return (
    <CoinContext.Provider value={{ coins, xp, level, addCoins, spendCoins, addXp }}>
      {children}
    </CoinContext.Provider>
  );
};

export const useCoins = () => useContext(CoinContext);