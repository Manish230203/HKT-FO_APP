import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView } from 'react-native';
import { useRouter } from 'expo-router';
import { Shield, Check, Globe } from 'lucide-react-native';
import { useLanguage } from '../../context/LanguageContext';
import { LanguageCode } from '../../constants/translations';
import { THEME } from '../../constants/theme';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';

export default function LanguageSelectionScreen() {
  const { language, setLanguage, t } = useLanguage();
  const [selectedLang, setSelectedLang] = useState<LanguageCode>(language);
  const router = useRouter();

  const handleContinue = async () => {
    await setLanguage(selectedLang);
    router.replace('/login');
  };

  const languages: { code: LanguageCode; name: string; nativeName: string }[] = [
    { code: 'en', name: 'English', nativeName: 'English' },
    { code: 'hi', name: 'Hindi', nativeName: 'हिंदी' },
    { code: 'mr', name: 'Marathi', nativeName: 'मराठी' },
  ];

  return (
    <SafeAreaView style={styles.container}>
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
              <Card
                key={lang.code}
                onPress={() => setSelectedLang(lang.code)}
                style={[
                  styles.langCard,
                  isSelected && styles.selectedCard,
                ]}
              >
                <View style={styles.langTextContainer}>
                  <Text style={styles.langNative}>{lang.nativeName}</Text>
                  <Text style={styles.langEnglish}>{lang.name}</Text>
                </View>
                {isSelected && (
                  <View style={styles.checkCircle}>
                    <Check color="#FFFFFF" size={16} />
                  </View>
                )}
              </Card>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.background,
  },
  content: {
    flex: 1,
    padding: 24,
    justifyContent: 'space-between',
  },
  header: {
    alignItems: 'center',
    marginTop: 40,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: THEME.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: THEME.typography.xl,
    fontWeight: '700',
    color: THEME.text,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: THEME.typography.sm,
    color: THEME.textVariant,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  langList: {
    marginVertical: 20,
  },
  langCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 18,
    paddingHorizontal: 20,
    marginVertical: 8,
  },
  selectedCard: {
    borderColor: THEME.primary,
    borderWidth: 2,
    backgroundColor: '#1E293B',
  },
  langTextContainer: {
    flexDirection: 'column',
  },
  langNative: {
    fontSize: THEME.typography.lg,
    fontWeight: '700',
    color: THEME.text,
  },
  langEnglish: {
    fontSize: THEME.typography.xs,
    color: THEME.textVariant,
    marginTop: 2,
  },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: THEME.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueBtn: {
    marginBottom: 20,
  },
});
