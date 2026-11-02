import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Modal,
  Image,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  Shield,
  Lock,
  ShieldCheck,
  Bell,
  Mail,
  Settings as SettingsIcon,
  Languages,
  AlertTriangle,
  Info,
  ChevronRight,
  ArrowLeft,
  User,
  Calendar,
  MapPin,
  Camera,
  Upload,
  Moon,
  Sun,
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useTheme } from '../context/ThemeContext';
import { CustomAlertModal } from '../components/ui/CustomAlertModal';
import { SwipeableBackWrapper } from '../components/SwipeableBackWrapper';

export default function SettingsScreen() {
  const { user, logout, profileImage, updateProfileImage } = useAuth();
  const { language, t } = useLanguage();
  const { theme, isDark, toggleTheme, colors } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);
  const router = useRouter();
  const params = useLocalSearchParams<{ autoUpload?: string }>();

  const [emailUpdates, setEmailUpdates] = useState(true);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [showFullProfileModal, setShowFullProfileModal] = useState(false);

  React.useEffect(() => {
    if (params?.autoUpload === 'true') {
      const timer = setTimeout(() => {
        handleSelectProfileImageOption();
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [params?.autoUpload]);

  const getLanguageText = () => {
    switch (language) {
      case 'hi': return 'HINDI / ACTIVE';
      case 'mr': return 'MARATHI / ACTIVE';
      default: return 'ENGLISH / ACTIVE';
    }
  };

  const handleUploadImageFromLibrary = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert(t('perm_required_title'), t('gallery_perm_checkpoint_msg'));
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const selectedUri = result.assets[0].uri;
        const uploadRes = await updateProfileImage(selectedUri);
        if (uploadRes && uploadRes.success) {
          Alert.alert(
            t('success'),
            uploadRes?.message || t('profile_photo_title'),
            [
              {
                text: t('activate_duty_now'),
                onPress: () => router.replace('/mark-attendance'),
              },
              { text: 'OK', style: 'cancel' }
            ]
          );
        } else {
          Alert.alert(t('notice'), uploadRes?.message || t('profile_photo_title'));
        }
      }
    } catch (e) {
      console.error('Image library error', e);
    }
  };

  const handleOpenCamera = async () => {
    try {
      const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert(t('camera_perm_required'), t('camera_perm_msg'));
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
        cameraType: ImagePicker.CameraType.front,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const capturedUri = result.assets[0].uri;
        const uploadRes = await updateProfileImage(capturedUri);
        if (uploadRes && uploadRes.success) {
          Alert.alert(
            t('success'),
            uploadRes?.message || t('profile_photo_title'),
            [
              {
                text: t('activate_duty_now'),
                onPress: () => router.replace('/mark-attendance'),
              },
              { text: 'OK', style: 'cancel' }
            ]
          );
        } else {
          Alert.alert(t('notice'), uploadRes?.message || t('profile_photo_title'));
        }
      }
    } catch (e) {
      console.error('Camera capture error', e);
    }
  };

  const handleSelectProfileImageOption = () => {
    Alert.alert(
      t('profile_photo_title'),
      t('select_photo_option'),
      [
        { text: t('upload_from_gallery'), onPress: handleUploadImageFromLibrary },
        { text: t('take_photo_camera'), onPress: handleOpenCamera },
        { text: t('cancel'), style: 'cancel' },
      ],
      { cancelable: true }
    );
  };

  const handleSignOut = async () => {
    setShowSignOutConfirm(false);
    await logout();
    router.replace('/lang/lang-selection');
  };

  return (
    <SwipeableBackWrapper>
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <ScrollView contentContainerStyle={styles.content}>
          {/* Header Navigation Bar */}
          <View style={styles.headerBar}>
            <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
              <ArrowLeft color={colors.text} size={22} />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: colors.text }]}>{t('profile_preferences')}</Text>
          </View>

          {/* Warning Banner when profile photo is required */}
          {(!profileImage || params?.autoUpload === 'true') && (
            <View style={[styles.warningBanner, { backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEF2F2', borderColor: '#EF4444' }]}>
              <AlertTriangle color="#EF4444" size={22} style={{ marginRight: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.warningBannerTitle, { color: '#EF4444' }]}>
                  {t('profile_photo_required_title') || 'Profile Photo Required'}
                </Text>
                <Text style={[styles.warningBannerDesc, { color: isDark ? '#FCA5A5' : '#B91C1C' }]}>
                  {t('profile_photo_required_desc') || 'Please upload your profile photo to activate your duty session and enable face verification.'}
                </Text>
              </View>
            </View>
          )}

          {/* 1. Header Profile Card */}
          <View style={[styles.profileHeaderCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <TouchableOpacity style={styles.avatarContainer} activeOpacity={0.85} onPress={handleSelectProfileImageOption}>
              <View style={styles.avatarCircle}>
                {profileImage ? (
                  <Image source={{ uri: profileImage }} style={styles.avatarImage} />
                ) : (
                  <User color="#FFFFFF" size={46} />
                )}
              </View>
              <View style={styles.editBadge}>
                <Upload color="#FFFFFF" size={14} />
              </View>
            </TouchableOpacity>

            <Text style={styles.userName}>{user?.name || 'PAPPU KUMAR'}</Text>

            <View style={styles.pillsRow}>
              <View style={[styles.pillBadge, { backgroundColor: '#1E3A8A' }]}>
                <Text style={[styles.pillText, { color: '#60A5FA' }]}>PUNE</Text>
              </View>
            </View>

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={handleSelectProfileImageOption}
              style={styles.uploadProfileBtn}
            >
              <Upload color="#60A5FA" size={16} style={{ marginRight: 8 }} />
              <Text style={styles.uploadProfileText}>
                {profileImage ? t('change_profile_image') : t('upload_profile_image')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setShowFullProfileModal(true)}
              style={styles.viewFullProfileBtn}
            >
              <Text style={styles.viewFullProfileText}>{t('view_full_profile')}</Text>
            </TouchableOpacity>
          </View>

          {/* 2. Security & Privacy Card */}
          {/*
          <View style={styles.cardContainer}>
            <View style={styles.cardTitleRow}>
              <View style={styles.iconCircleBlue}>
                <Shield color="#3B82F6" size={18} />
              </View>
              <Text style={styles.cardHeaderTitle}>Security & Privacy</Text>
            </View>

            <TouchableOpacity style={styles.itemRow}>
              <Lock color="#94A3B8" size={20} />
              <View style={styles.itemTextCol}>
                <Text style={styles.itemMainText}>Security Credentials</Text>
                <Text style={styles.itemSubText}>UPDATE YOUR ENCRYPTION KEYS</Text>
              </View>
              <ChevronRight color="#64748B" size={18} />
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity
              style={styles.itemRow}
              onPress={() => router.push('/attendance')}
            >
              <ShieldCheck color="#94A3B8" size={20} />
              <View style={styles.itemTextCol}>
                <Text style={styles.itemMainText}>Biometrics</Text>
                <Text style={[styles.itemSubText, { color: '#3B82F6' }]}>ACTIVE / ENABLED</Text>
              </View>
              <ChevronRight color="#64748B" size={18} />
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity
              style={styles.itemRow}
              onPress={() => router.push('/consent')}
            >
              <Shield color="#94A3B8" size={20} />
              <View style={styles.itemTextCol}>
                <Text style={styles.itemMainText}>Privacy & Cookie Policy</Text>
                <Text style={styles.itemSubText}>REVIEW CONSENT & DATA TERMS</Text>
              </View>
              <ChevronRight color="#64748B" size={18} />
            </TouchableOpacity>
          </View>
          */}

          {/* 3. Notifications & Email Updates Card */}
          {/*
          <View style={styles.cardContainer}>
            <View style={styles.cardTitleRow}>
              <View style={[styles.iconCircleBlue, { backgroundColor: 'rgba(245, 158, 11, 0.15)' }]}>
                <Bell color="#F59E0B" size={18} />
              </View>
              <Text style={styles.cardHeaderTitle}>Notifications</Text>
            </View>

            <View style={styles.itemRow}>
              <Mail color="#94A3B8" size={20} />
              <Text style={[styles.itemMainText, { flex: 1, marginLeft: 12 }]}>Email Updates</Text>
              <Switch
                value={emailUpdates}
                onValueChange={setEmailUpdates}
                trackColor={{ false: '#334155', true: '#3B82F6' }}
                thumbColor="#FFFFFF"
              />
            </View>
          </View>
          */}

          {/* 4. System Preferences Card */}
          <View style={[styles.cardContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.cardTitleRow}>
              <View style={styles.iconCircleBlue}>
                <SettingsIcon color="#3B82F6" size={18} />
              </View>
              <Text style={[styles.cardHeaderTitle, { color: colors.text }]}>{t('system_preferences')}</Text>
            </View>

            <TouchableOpacity
              onPress={() => router.push('/lang/lang-selection')}
              style={styles.itemRow}
            >
              <Languages color="#94A3B8" size={20} />
              <View style={styles.itemTextCol}>
                <Text style={[styles.itemMainText, { color: colors.text }]}>{t('interface_language')}</Text>
                <Text style={styles.itemSubText}>{getLanguageText()}</Text>
              </View>
              <ChevronRight color="#64748B" size={18} />
            </TouchableOpacity>

            <View style={styles.divider} />

            <View style={styles.itemRow}>
              {isDark ? (
                <Moon color="#3B82F6" size={20} />
              ) : (
                <Sun color="#F59E0B" size={20} />
              )}
              <View style={styles.itemTextCol}>
                <Text style={[styles.itemMainText, { color: colors.text }]}>{t('theme_mode')}</Text>
                <Text style={[styles.itemSubText, { color: isDark ? '#3B82F6' : '#F59E0B' }]}>
                  {isDark ? t('dark_mode_active') : t('light_mode_active')}
                </Text>
              </View>
              <Switch
                value={isDark}
                onValueChange={toggleTheme}
                trackColor={{ false: isDark ? '#334155' : '#CBD5E1', true: colors.primary }}
                thumbColor="#FFFFFF"
                ios_backgroundColor={isDark ? '#334155' : '#CBD5E1'}
              />
            </View>
          </View>

          {/* 5. Departure Protocol Card (Sign Out) */}
          <View style={styles.departureCard}>
            <View style={styles.departureTitleRow}>
              <AlertTriangle color="#EF4444" size={22} />
              <Text style={styles.departureTitle}>Departure Protocol</Text>
            </View>
            <Text style={styles.departureSubText}>
              Terminating your account will erase logs and sync data. This action is irreversible.
            </Text>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setShowSignOutConfirm(true)}
              style={styles.signOutBtn}
            >
              <Text style={styles.signOutBtnText}>SIGN OUT</Text>
            </TouchableOpacity>
          </View>

          {/* 6. App Information Card */}
          <View style={[styles.cardContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.cardTitleRow}>
              <View style={styles.iconCircleBlue}>
                <Info color="#3B82F6" size={18} />
              </View>
              <Text style={styles.appInfoTitle}>APP INFORMATION</Text>
            </View>

            <View style={styles.appInfoRow}>
              <Text style={styles.appInfoLabel}>CORE SYSTEM</Text>
              <Text style={styles.appInfoVal}>v3.0.4</Text>
            </View>

            <View style={styles.appInfoRow}>
              <Text style={styles.appInfoLabel}>UPDATE CHANNEL</Text>
              <View style={styles.stableBadge}>
                <Text style={styles.stableText}>STABLE</Text>
              </View>
            </View>

            <View style={styles.appInfoRow}>
              <Text style={styles.appInfoLabel}>INTERFACE BUILD</Text>
              <Text style={styles.appInfoVal}>v2.4.1</Text>
            </View>
          </View>

          <Text style={styles.copyrightText}>© 2026 HUMANKIND TECHNOLOGY</Text>
        </ScrollView>

        {/* FULL EXECUTIVE PROFILE MODAL */}
        <Modal visible={showFullProfileModal} animationType="slide" transparent={false}>
          <SafeAreaView style={styles.modalContainer}>
            <ScrollView contentContainerStyle={styles.modalContent}>
              <View style={styles.executiveHeaderCard}>
                <TouchableOpacity
                  style={styles.modalBackBtn}
                  onPress={() => setShowFullProfileModal(false)}
                >
                  <ArrowLeft color="#3B82F6" size={22} />
                </TouchableOpacity>

                <Text style={styles.execLabel}>EXECUTIVE PROFILE</Text>
                <Text style={styles.execName}>{user?.name || 'PAPPU KUMAR'}</Text>

                <View style={styles.execBadgeRow}>
                  <View style={[styles.execBadge, { backgroundColor: 'rgba(16, 185, 129, 0.15)', borderColor: 'rgba(16, 185, 129, 0.3)' }]}>
                    <ShieldCheck color="#10B981" size={14} style={{ marginRight: 6 }} />
                    <Text style={[styles.execBadgeText, { color: '#10B981' }]}>ACTIVE ENGAGEMENT</Text>
                  </View>
                </View>

                <View style={styles.execAvatarBox}>
                  {profileImage && profileImage.trim().length > 0 ? (
                    <Image source={{ uri: profileImage }} style={styles.avatarImage} />
                  ) : (
                    <User color={colors.primary} size={36} />
                  )}
                </View>
              </View>

              <Text style={styles.sectionHeaderTitle}>Career & Deployment</Text>

              <View style={styles.detailsCard}>
                <View style={styles.detailsRowHeader}>
                  <Text style={styles.detailsFieldLabel}>JOINING DATE</Text>
                  <Calendar color="#3B82F6" size={20} />
                </View>
                <Text style={styles.detailsMainVal}>
                  {user?.date_of_joining ? new Date(user.date_of_joining).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Aug 29, 2016'}
                </Text>

                <Text style={[styles.detailsFieldLabel, { marginTop: 14 }]}>TENURE</Text>
                <Text style={styles.detailsMainVal}>
                  {(() => {
                    if (!user?.date_of_joining) return '9 Years, 6 Months';
                    const start = new Date(user.date_of_joining);
                    const now = new Date();
                    let years = now.getFullYear() - start.getFullYear();
                    let months = now.getMonth() - start.getMonth();
                    if (months < 0) { years--; months += 12; }
                    return `${years} Years, ${months} Months`;
                  })()}
                </Text>
              </View>

              <View style={styles.detailsCard}>
                <View style={styles.detailsRowHeader}>
                  <Text style={styles.detailsFieldLabel}>DEPLOYMENT DATE</Text>
                  <MapPin color="#3B82F6" size={20} />
                </View>
                <Text style={styles.detailsMainVal}>
                  {user?.date_of_joining ? new Date(user.date_of_joining).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Aug 29, 2016'}
                </Text>

                <View style={styles.subDetailBox}>
                  <Text style={styles.subDetailLabel}>CLIENT</Text>
                  <Text style={styles.subDetailVal}>{user?.client_name || 'Unique Delta Force Pvt. Ltd.'}</Text>
                </View>

                <View style={styles.subDetailBox}>
                  <Text style={styles.subDetailLabel}>BRANCH</Text>
                  <Text style={styles.subDetailVal}>{user?.branch_name || 'Pune'}</Text>
                </View>

                <View style={styles.subDetailBox}>
                  <Text style={styles.subDetailLabel}>SITE</Text>
                  <Text style={styles.subDetailVal}>
                    {user?.site_name || (user?.site_id === 192 ? 'UDF KASARWADI PUNE' : (user?.site_id ? `Site #${user.site_id}` : 'UDF KASARWADI PUNE'))}
                  </Text>
                </View>
              </View>
            </ScrollView>
          </SafeAreaView>
        </Modal>

        <CustomAlertModal
          visible={showSignOutConfirm}
          title={t('logout')}
          message={t('confirm_logout')}
          type="error"
          onClose={() => setShowSignOutConfirm(false)}
          onConfirm={handleSignOut}
          confirmText={t('logout').toUpperCase()}
        />
      </SafeAreaView>
    </SwipeableBackWrapper>
  );
}

const getStyles = (colors: any, isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 16,
    paddingBottom: 36,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  backBtn: {
    padding: 6,
    marginRight: 10,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
  },

  /* Profile Header Card */
  profileHeaderCard: {
    backgroundColor: colors.card,
    borderRadius: 24,
    padding: 20,
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 12,
  },
  avatarCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: isDark ? '#1E293B' : colors.surfaceSecondary,
    borderWidth: 3,
    borderColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 45,
  },
  editBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    backgroundColor: '#3B82F6',
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.card,
  },
  userName: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.primary,
    textAlign: 'center',
  },
  userRole: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '600',
    marginTop: 2,
  },
  pillsRow: {
    flexDirection: 'row',
    gap: 8,
    marginVertical: 14,
  },
  pillBadge: {
    backgroundColor: isDark ? '#1E293B' : colors.surfaceSecondary,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
  },
  pillText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  uploadProfileBtn: {
    backgroundColor: isDark ? '#1E293B' : colors.surfaceSecondary,
    borderColor: '#3B82F6',
    borderWidth: 1.5,
    width: '100%',
    paddingVertical: 12,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    marginBottom: 8,
  },
  uploadProfileText: {
    color: isDark ? '#60A5FA' : '#2563EB',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  viewFullProfileBtn: {
    backgroundColor: '#4F46E5',
    width: '100%',
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 6,
  },
  viewFullProfileText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.8,
  },

  cardContainer: {
    backgroundColor: colors.card,
    borderRadius: 24,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  iconCircleBlue: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  cardHeaderTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  itemTextCol: {
    flex: 1,
    marginLeft: 12,
  },
  itemMainText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  itemSubText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textSecondary,
    marginTop: 2,
    letterSpacing: 0.5,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 6,
  },

  departureCard: {
    backgroundColor: isDark ? 'rgba(225, 29, 72, 0.12)' : '#FFF1F2',
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(225, 29, 72, 0.25)' : 'rgba(225, 29, 72, 0.1)',
  },
  departureTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  departureTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#E11D48',
  },
  departureSubText: {
    fontSize: 12,
    color: isDark ? '#FCA5A5' : '#9F1239',
    lineHeight: 18,
    marginBottom: 16,
  },
  signOutBtn: {
    backgroundColor: '#E11D48',
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
  },
  signOutBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.8,
  },

  appInfoTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#3B82F6',
    letterSpacing: 0.8,
  },
  appInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  appInfoLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  appInfoVal: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  stableBadge: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  stableText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#3B82F6',
  },
  copyrightText: {
    textAlign: 'center',
    color: '#64748B',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginTop: 12,
  },

  /* EXECUTIVE PROFILE MODAL */
  modalContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  modalContent: {
    padding: 20,
  },
  executiveHeaderCard: {
    backgroundColor: colors.card,
    borderRadius: 24,
    padding: 20,
    marginBottom: 24,
    position: 'relative',
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalBackBtn: {
    alignSelf: 'flex-start',
    marginBottom: 12,
  },
  execLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#3B82F6',
    letterSpacing: 0.8,
  },
  execName: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
    marginTop: 4,
  },
  execRole: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  execBadgeRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
  execBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isDark ? '#1E293B' : colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  execBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.text,
  },
  execAvatarBox: {
    position: 'absolute',
    top: 20,
    right: 20,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: isDark ? '#1E293B' : colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#3B82F6',
    overflow: 'hidden',
  },
  sectionHeaderTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 14,
  },
  detailsCard: {
    backgroundColor: colors.card,
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  detailsRowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailsFieldLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textSecondary,
    letterSpacing: 0.8,
  },
  detailsMainVal: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
    marginTop: 4,
  },
  subDetailBox: {
    backgroundColor: isDark ? '#1E293B' : colors.surfaceSecondary,
    borderRadius: 14,
    padding: 12,
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  subDetailLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.textSecondary,
  },
  subDetailVal: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
  },
  warningBannerTitle: {
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 2,
  },
  warningBannerDesc: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
  },
});
