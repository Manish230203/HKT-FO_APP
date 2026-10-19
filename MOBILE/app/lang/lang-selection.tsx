import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Check, Globe, ArrowLeft } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { LanguageCode } from '../../constants/translations';
import { useTheme } from '../../context/ThemeContext';
import { Button } from '../../components/ui/Button';
import { getConsentSetting } from '../../services/db';

export default function LanguageSelectionScreen() {
  const { language, setLanguage, t } = useLanguage();
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const [selectedLang, setSelectedLang] = useState<LanguageCode>(language);
  const router = useRouter();

  const handleSelectLang = async (langCode: LanguageCode) => {
    setSelectedLang(langCode);
    await setLanguage(langCode);
  };

  const handleContinue = async () => {
    await setLanguage(selectedLang);
    const consentAccepted = await getConsentSetting();
    if (!consentAccepted) {
      router.replace('/consent');
    } else if (user) {
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/(tabs)/dashboard');
      }
    } else {
      router.replace('/login');
    }
  };

  const languages: { code: LanguageCode; name: string; nativeName: string }[] = [
    { code: 'en', name: 'English', nativeName: 'English' },
    { code: 'hi', name: 'Hindi', nativeName: 'हिंदी' },
    { code: 'mr', name: 'Marathi', nativeName: 'मराठी' },
  ];

  const styles = React.useMemo(() => getStyles(colors, isDark), [colors, isDark]);

  return (
    <SafeAreaView style={styles.container}>
      {router.canGoBack() && (
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            activeOpacity={0.7}
          >
            <ArrowLeft color={colors.text} size={22} />
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.content}>
        <View style={styles.header}>
          <View style={styles.iconCircle}>
            <Globe color="#FFFFFF" size={32} />
          </View>
          <Text style={styles.title}>{t('select_language')}</Text>
          <Text style={styles.subtitle}>{t('choose_language_desc')}</Text>
        </View>

        <View style={styles.langList}>
          {languages.map((lang) => {
            const isSelected = selectedLang === lang.code;
            return (
              <TouchableOpacity
                key={lang.code}
                activeOpacity={0.8}
                onPress={() => handleSelectLang(lang.code)}
                style={[
                  styles.langCard,
                  isSelected ? styles.langCardSelected : styles.langCardUnselected,
                ]}
              >
                <View style={styles.langTextContainer}>
                  <Text style={isSelected ? styles.langNativeSelected : styles.langNative}>
                    {lang.nativeName}
                  </Text>
                  <Text style={isSelected ? styles.langEnglishSelected : styles.langEnglish}>
                    {lang.name}
                  </Text>
                </View>
                {isSelected && (
                  <View style={styles.checkCircle}>
                    <Check color="#FFFFFF" size={16} strokeWidth={2.5} />
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        <Button
          title={t('continue')}
          onPress={handleContinue}
          style={styles.continueBtn}
        />
      </View>
    </SafeAreaView>
  );
}

const getStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    topBar: {
      paddingHorizontal: 20,
      paddingTop: 10,
    },
    backButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    content: {
      flex: 1,
      paddingHorizontal: 24,
      paddingBottom: 24,
      justifyContent: 'space-between',
    },
    header: {
      alignItems: 'center',
      marginTop: 24,
    },
    iconCircle: {
      width: 68,
      height: 68,
      borderRadius: 34,
      backgroundColor: '#2563EB',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 20,
      shadowColor: '#2563EB',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 8,
      elevation: 4,
    },
    title: {
      fontSize: 24,
      fontWeight: '800',
      color: colors.text,
      textAlign: 'center',
      letterSpacing: -0.3,
    },
    subtitle: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: 'center',
      marginTop: 8,
      lineHeight: 20,
      maxWidth: 290,
      fontWeight: '500',
    },
    langList: {
      marginVertical: 20,
      gap: 14,
    },
    langCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 18,
      paddingHorizontal: 20,
      borderRadius: 16,
    },
    langCardUnselected: {
      backgroundColor: colors.card,
      borderColor: colors.border,
      borderWidth: 1.5,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.2 : 0.04,
      shadowRadius: 6,
      elevation: 2,
    },
    langCardSelected: {
      backgroundColor: isDark ? '#1E293B' : '#EFF6FF',
      borderColor: '#2563EB',
      borderWidth: 2,
      shadowColor: '#2563EB',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: isDark ? 0.35 : 0.12,
      shadowRadius: 8,
      elevation: 3,
    },
    langTextContainer: {
      flexDirection: 'column',
    },
    langNative: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
    },
    langNativeSelected: {
      fontSize: 18,
      fontWeight: '700',
      color: isDark ? '#FFFFFF' : '#1D4ED8',
    },
    langEnglish: {
      fontSize: 13,
      color: colors.textSecondary,
      marginTop: 3,
      fontWeight: '500',
    },
    langEnglishSelected: {
      fontSize: 13,
      color: isDark ? '#93C5FD' : '#2563EB',
      marginTop: 3,
      fontWeight: '600',
    },
    checkCircle: {
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: '#2563EB',
      alignItems: 'center',
      justifyContent: 'center',
    },
    continueBtn: {
      marginBottom: 16,
      backgroundColor: '#2563EB',
      borderRadius: 16,
      height: 52,
    },
  });
