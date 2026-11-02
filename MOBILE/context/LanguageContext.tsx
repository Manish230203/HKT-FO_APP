import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { translations, LanguageCode } from '../constants/translations';
import { getLanguageSetting, saveLanguageSetting } from '../services/db';

interface LanguageContextProps {
  language: LanguageCode;
  setLanguage: (lang: LanguageCode) => Promise<void>;
  t: (key: string, variables?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextProps | undefined>(undefined);

// Reverse map for English translation strings to translation keys
const enTextToKey: Record<string, string> = {};
if (translations && translations.en) {
  Object.entries(translations.en).forEach(([k, v]) => {
    if (typeof v === 'string') {
      enTextToKey[v.trim().toLowerCase()] = k;
    }
  });
}

// Common backend server error message aliases
const serverMessageAliases: Record<string, string> = {
  'this account has already been registered on a device. please contact your administrator.': 'device_already_registered',
  'this account has already been registered on a device': 'device_already_registered',
  'account already registered on a device': 'device_already_registered',
  'account already registered': 'device_already_registered',
  'employee is inactive / deactivated. please contact administrator.': 'employee_deactivated',
  'employee account has been deactivated. please contact administrator.': 'employee_deactivated',
  'employee is inactive': 'employee_deactivated',
  'employee is deactivated': 'employee_deactivated',
  'user account is deactivated': 'employee_deactivated',
  'account deactivated': 'employee_deactivated',
  'access restricted: security guards and non-officer staff cannot log in. this app is for officers only.': 'access_restricted_fo',
  'access restricted': 'access_restricted_fo',
  'no account found for this mobile number. please check your mobile number or contact your administrator.': 'no_account_found',
  'no account found for this mobile number': 'no_account_found',
  'user not found for this mobile number. please check your registered mobile number.': 'invalid_credentials',
  'user not found for this mobile number': 'invalid_credentials',
  'invalid credentials': 'invalid_credentials',
  'user not found': 'invalid_credentials',
  'unable to connect to server. please check your internet connection and try again.': 'network_error',
  'network error': 'network_error',
  'failed to connect': 'network_error',
  'failed to fetch': 'network_error',
  'network request failed': 'network_error',
  'please enter a valid 10-digit indian mobile number (starting with 6, 7, 8, or 9).': 'invalid_mobile',
};

function resolveTranslationKey(rawKey: string): string {
  if (!rawKey || typeof rawKey !== 'string') return '';
  const trimmed = rawKey.trim();
  const lower = trimmed.toLowerCase();

  // 1. Direct key match in translations.en
  if ((translations.en as any)[trimmed]) {
    return trimmed;
  }

  // 2. Exact match in serverMessageAliases
  if (serverMessageAliases[lower]) {
    return serverMessageAliases[lower];
  }

  // 3. Exact match with any English translation value
  if (enTextToKey[lower]) {
    return enTextToKey[lower];
  }

  // 4. Fuzzy / substring matching for backend warning variations
  if (lower.includes('deactivated') || (lower.includes('inactive') && lower.includes('contact'))) {
    return 'employee_deactivated';
  }
  if (lower.includes('restricted') && (lower.includes('officer') || lower.includes('guard'))) {
    return 'access_restricted_fo';
  }
  if (lower.includes('no account') || (lower.includes('user not found') && lower.includes('mobile'))) {
    return 'no_account_found';
  }
  if (lower.includes('network') || lower.includes('connection') || lower.includes('timeout') || lower.includes('failed to fetch')) {
    return 'network_error';
  }

  return trimmed;
}

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

  const t = (key: string, variables?: Record<string, string | number>): string => {
    if (!key) return '';
    const resolvedKey = resolveTranslationKey(key);
    const langObj = translations[language] || translations.en;
    let text =
      (langObj as any)[resolvedKey] ||
      (translations.en as any)[resolvedKey] ||
      (langObj as any)[key] ||
      (translations.en as any)[key] ||
      key;

    if (variables) {
      Object.entries(variables).forEach(([name, value]) => {
        text = text.replace(new RegExp(`\\{${name}\\}`, 'g'), value.toString());
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
