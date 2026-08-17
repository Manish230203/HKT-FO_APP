import React, { createContext, useContext, useState, useEffect } from 'react';
import { translations, LanguageCode } from '../constants/translations';
import { getLanguageSetting, saveLanguageSetting } from '../services/db';

interface LanguageContextProps {
  language: LanguageCode;
  setLanguage: (lang: LanguageCode) => Promise<void>;
  t: (key: string, variables?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextProps | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<LanguageCode>('en');

  useEffect(() => {
    loadLanguage();
  }, []);

  const loadLanguage = async () => {
    try {
      const savedLang = await getLanguageSetting();
      if (savedLang && (savedLang === 'en' || savedLang === 'hi' || savedLang === 'mr')) {
        setLanguageState(savedLang as LanguageCode);
      }
    } catch (err) {
      console.log('Failed to load language setting:', err);
    }
  };

  const setLanguage = async (lang: LanguageCode) => {
    setLanguageState(lang);
    await saveLanguageSetting(lang);
  };

  const t = (key: string, variables?: Record<string, string | number>) => {
    const langObj = translations[language] || translations.en;
    let text = (langObj as any)[key] || (translations.en as any)[key] || key;

    if (variables) {
      Object.entries(variables).forEach(([name, value]) => {
        text = text.replace(`{${name}}`, value.toString());
      });
    }
    return text;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
