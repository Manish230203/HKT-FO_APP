import React, { useState } from 'react';
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
import { useRouter } from 'expo-router';
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
  const { language } = useLanguage();
  const { colors, isDark, toggleTheme } = useTheme();
  const router = useRouter();

  const [emailUpdates, setEmailUpdates] = useState(true);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [showFullProfileModal, setShowFullProfileModal] = useState(false);

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
        Alert.alert('Permission Required', 'Gallery permission is required to select profile photo.');
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
          Alert.alert('Profile Registered', 'Profile photo updated and face embedding registered successfully!');
        } else {
          Alert.alert('Photo Saved', uploadRes?.message || 'Profile photo saved locally.');
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
        Alert.alert('Camera Permission Required', 'Camera permission is required to capture profile photo.');
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
          Alert.alert('Profile Registered', 'Profile photo updated and face embedding registered successfully!');
        } else {
          Alert.alert('Photo Saved', uploadRes?.message || 'Profile photo saved locally.');
        }
      }
    } catch (e) {
      console.error('Camera capture error', e);
    }
  };

  const handleSelectProfileImageOption = () => {
    Alert.alert(
      'Profile Photo',
      'Select an option to update your profile image:',
      [
        { text: 'Upload from Gallery', onPress: handleUploadImageFromLibrary },
        { text: 'Take Photo with Camera', onPress: handleOpenCamera },
        { text: 'Cancel', style: 'cancel' },
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
            <Text style={[styles.headerTitle, { color: colors.text }]}>Profile & Preferences</Text>
          </View>

          {/* 1. Header Profile Card */}
          <View style={[styles.profileHeaderCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <TouchableOpacity style={styles.avatarContainer} activeOpacity={0.85} onPress={handleSelectProfileImageOption}>
              <View style={[styles.avatarCircle, { backgroundColor: isDark ? '#1E293B' : '#E2E8F0', borderColor: colors.primary }]}>
                {profileImage ? (
                  <Image source={{ uri: profileImage }} style={styles.avatarImage} />
                ) : (
                  <User color={colors.textVariant} size={46} />
                )}
              </View>
              <View style={[styles.editBadge, { backgroundColor: colors.primary }]}>
                <Upload color="#FFFFFF" size={14} />
              </View>
            </TouchableOpacity>

            <Text style={[styles.userName, { color: colors.primary }]}>{user?.name || 'PAPPU KUMAR'}</Text>
            <Text style={[styles.userRole, { color: colors.textVariant }]}>{user?.role || 'S/G'}</Text>

            <View style={styles.pillsRow}>
              <View style={[styles.pillBadge, { backgroundColor: isDark ? '#1E293B' : '#E2E8F0' }]}>
                <Text style={[styles.pillText, { color: colors.textVariant }]}>ID: {user?.employee_id || 'EMP002'}</Text>
              </View>
              <View style={[styles.pillBadge, { backgroundColor: isDark ? '#1E3A8A' : '#DBEAFE' }]}>
                <Text style={[styles.pillText, { color: isDark ? '#60A5FA' : '#1D4ED8' }]}>PUNE</Text>
              </View>
            </View>

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={handleSelectProfileImageOption}
              style={styles.uploadProfileBtn}
            >
              <Upload color="#FFFFFF" size={16} style={{ marginRight: 8 }} />
              <Text style={styles.uploadProfileText}>
                {profileImage ? 'CHANGE PROFILE IMAGE' : 'UPLOAD PROFILE IMAGE'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* 4. System Preferences Card */}
          <View style={[styles.cardContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.cardTitleRow}>
              <View style={[styles.iconCircleBlue, { backgroundColor: isDark ? 'rgba(59, 130, 246, 0.15)' : 'rgba(41, 121, 255, 0.1)' }]}>
                <SettingsIcon color={colors.primary} size={18} />
              </View>
              <Text style={[styles.cardHeaderTitle, { color: colors.text }]}>System Preferences</Text>
            </View>

            {/* Theme Toggle Option */}
            <View style={styles.itemRow}>
              {isDark ? (
                <Moon color={colors.primary} size={20} />
              ) : (
                <Sun color="#F59E0B" size={20} />
              )}
              <View style={styles.itemTextCol}>
                <Text style={[styles.itemMainText, { color: colors.text }]}>
                  {isDark ? 'Dark Theme' : 'Light Theme'}
                </Text>
                <Text style={[styles.itemSubText, { color: colors.textVariant }]}>
                  {isDark ? 'DARK MODE ACTIVE' : 'LIGHT MODE ACTIVE'}
                </Text>
              </View>
              <Switch
                value={isDark}
                onValueChange={toggleTheme}
                trackColor={{ false: isDark ? '#334155' : '#CBD5E1', true: colors.primary }}
                thumbColor="#FFFFFF"
                ios_backgroundColor={isDark ? '#334155' : '#E2E8F0'}
              />
            </View>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            <TouchableOpacity
              onPress={() => router.push('/lang/lang-selection')}
              style={styles.itemRow}
            >
              <Languages color={colors.textVariant} size={20} />
              <View style={styles.itemTextCol}>
                <Text style={[styles.itemMainText, { color: colors.text }]}>Interface Language</Text>
                <Text style={[styles.itemSubText, { color: colors.textVariant }]}>{getLanguageText()}</Text>
              </View>
              <ChevronRight color={colors.textVariant} size={18} />
            </TouchableOpacity>
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
              <View style={[styles.iconCircleBlue, { backgroundColor: isDark ? 'rgba(59, 130, 246, 0.15)' : 'rgba(41, 121, 255, 0.1)' }]}>
                <Info color={colors.primary} size={18} />
              </View>
              <Text style={[styles.appInfoTitle, { color: colors.primary }]}>APP INFORMATION</Text>
            </View>

            <View style={styles.appInfoRow}>
              <Text style={[styles.appInfoLabel, { color: colors.textVariant }]}>CORE SYSTEM</Text>
              <Text style={[styles.appInfoVal, { color: colors.text }]}>v3.0.4</Text>
            </View>

            <View style={styles.appInfoRow}>
              <Text style={[styles.appInfoLabel, { color: colors.textVariant }]}>UPDATE CHANNEL</Text>
              <View style={[styles.stableBadge, { backgroundColor: isDark ? 'rgba(59, 130, 246, 0.15)' : 'rgba(41, 121, 255, 0.1)' }]}>
                <Text style={[styles.stableText, { color: colors.primary }]}>STABLE</Text>
              </View>
            </View>

            <View style={styles.appInfoRow}>
              <Text style={[styles.appInfoLabel, { color: colors.textVariant }]}>INTERFACE BUILD</Text>
              <Text style={[styles.appInfoVal, { color: colors.text }]}>v2.4.1</Text>
            </View>
          </View>

          <Text style={[styles.copyrightText, { color: colors.textVariant }]}>© 2026 HUMANKIND TECHNOLOGY</Text>
        </ScrollView>

        {/* FULL EXECUTIVE PROFILE MODAL */}
        <Modal visible={showFullProfileModal} animationType="slide" transparent={false}>
          <SafeAreaView style={[styles.modalContainer, { backgroundColor: colors.background }]}>
            <ScrollView contentContainerStyle={styles.modalContent}>
              <View style={[styles.executiveHeaderCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <TouchableOpacity
                  style={styles.modalBackBtn}
                  onPress={() => setShowFullProfileModal(false)}
                >
                  <ArrowLeft color={colors.primary} size={22} />
                </TouchableOpacity>

                <Text style={[styles.execLabel, { color: colors.primary }]}>EXECUTIVE PROFILE</Text>
                <Text style={[styles.execName, { color: colors.text }]}>{user?.name || 'PAPPU KUMAR'}</Text>
                <Text style={[styles.execRole, { color: colors.textVariant }]}>{user?.role || 'S/G'}</Text>

                <View style={styles.execBadgeRow}>
                  <View style={[styles.execBadge, { backgroundColor: isDark ? '#1E293B' : '#E2E8F0', borderColor: colors.border }]}>
                    <ShieldCheck color={colors.primary} size={14} style={{ marginRight: 6 }} />
                    <Text style={[styles.execBadgeText, { color: colors.text }]}>{user?.employee_id || 'EMP002'}</Text>
                  </View>
                  <View style={[styles.execBadge, { backgroundColor: 'rgba(16, 185, 129, 0.15)', borderColor: 'rgba(16, 185, 129, 0.3)' }]}>
                    <ShieldCheck color="#10B981" size={14} style={{ marginRight: 6 }} />
                    <Text style={[styles.execBadgeText, { color: '#10B981' }]}>ACTIVE ENGAGEMENT</Text>
                  </View>
                </View>

                <View style={[styles.execAvatarBox, { backgroundColor: isDark ? '#1E293B' : '#E2E8F0', borderColor: colors.primary }]}>
                  {profileImage ? (
                    <Image source={{ uri: profileImage }} style={styles.avatarImage} />
                  ) : (
                    <User color={colors.textVariant} size={40} />
                  )}
                </View>
              </View>

              <Text style={[styles.sectionHeaderTitle, { color: colors.text }]}>Career & Deployment</Text>

              <View style={[styles.detailsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.detailsRowHeader}>
                  <Text style={[styles.detailsFieldLabel, { color: colors.textVariant }]}>JOINING DATE</Text>
                  <Calendar color={colors.primary} size={20} />
                </View>
                <Text style={[styles.detailsMainVal, { color: colors.text }]}>
                  {user?.date_of_joining ? new Date(user.date_of_joining).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Aug 29, 2016'}
                </Text>

                <Text style={[styles.detailsFieldLabel, { marginTop: 14, color: colors.textVariant }]}>TENURE</Text>
                <Text style={[styles.detailsMainVal, { color: colors.text }]}>
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

              <View style={[styles.detailsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.detailsRowHeader}>
                  <Text style={[styles.detailsFieldLabel, { color: colors.textVariant }]}>DEPLOYMENT DATE</Text>
                  <MapPin color={colors.primary} size={20} />
                </View>
                <Text style={[styles.detailsMainVal, { color: colors.text }]}>
                  {user?.date_of_joining ? new Date(user.date_of_joining).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Aug 29, 2016'}
                </Text>

                <View style={styles.subDetailBox}>
                  <Text style={[styles.subDetailLabel, { color: colors.textVariant }]}>CLIENT</Text>
                  <Text style={[styles.subDetailVal, { color: colors.text }]}>{user?.client_name || 'Unique Delta Force Pvt. Ltd.'}</Text>
                </View>

                <View style={styles.subDetailBox}>
                  <Text style={[styles.subDetailLabel, { color: colors.textVariant }]}>BRANCH</Text>
                  <Text style={[styles.subDetailVal, { color: colors.text }]}>{user?.branch_name || 'Pune'}</Text>
                </View>

                <View style={styles.subDetailBox}>
                  <Text style={[styles.subDetailLabel, { color: colors.textVariant }]}>SITE</Text>
                  <Text style={[styles.subDetailVal, { color: colors.text }]}>
                    {user?.site_name || (user?.site_id === 192 ? 'UDF KASARWADI PUNE' : (user?.site_id ? `Site #${user.site_id}` : 'UDF KASARWADI PUNE'))}
                  </Text>
                </View>
              </View>
            </ScrollView>
          </SafeAreaView>
        </Modal>

        <CustomAlertModal
          visible={showSignOutConfirm}
          title="Sign Out"
          message="Terminating your account session will erase sync logs. Are you sure you want to sign out?"
          type="error"
          onClose={() => setShowSignOutConfirm(false)}
          onConfirm={handleSignOut}
          confirmText="SIGN OUT"
        />
      </SafeAreaView>
    </SwipeableBackWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A1128',
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
    color: '#FFFFFF',
  },

  /* Profile Header Card */
  profileHeaderCard: {
    backgroundColor: '#131C33',
    borderRadius: 24,
    padding: 20,
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 12,
  },
  avatarCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#1E293B',
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
    borderColor: '#131C33',
  },
  userName: {
    fontSize: 22,
    fontWeight: '800',
    color: '#3B82F6',
    textAlign: 'center',
  },
  userRole: {
    fontSize: 13,
    color: '#94A3B8',
    fontWeight: '600',
    marginTop: 2,
  },
  pillsRow: {
    flexDirection: 'row',
    gap: 8,
    marginVertical: 14,
  },
  pillBadge: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
  },
  pillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
  },
  uploadProfileBtn: {
    backgroundColor: '#4F46E5',
    width: '100%',
    paddingVertical: 14,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
    marginBottom: 4,
  },
  uploadProfileText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.8,
  },

  cardContainer: {
    backgroundColor: '#131C33',
    borderRadius: 24,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
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
    color: '#FFFFFF',
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
    color: '#FFFFFF',
  },
  itemSubText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    marginTop: 2,
    letterSpacing: 0.5,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginVertical: 6,
  },

  departureCard: {
    backgroundColor: '#FFF1F2',
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
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
    color: '#9F1239',
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
    color: '#94A3B8',
  },
  appInfoVal: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
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
    backgroundColor: '#0A1128',
  },
  modalContent: {
    padding: 20,
  },
  executiveHeaderCard: {
    backgroundColor: '#131C33',
    borderRadius: 24,
    padding: 20,
    marginBottom: 24,
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
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
    color: '#FFFFFF',
    marginTop: 4,
  },
  execRole: {
    fontSize: 13,
    color: '#94A3B8',
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
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  execBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  execAvatarBox: {
    position: 'absolute',
    top: 20,
    right: 20,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#3B82F6',
    overflow: 'hidden',
  },
  sectionHeaderTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 14,
  },
  detailsCard: {
    backgroundColor: '#131C33',
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  detailsRowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailsFieldLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 0.8,
  },
  detailsMainVal: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 4,
  },
  subDetailBox: {
    backgroundColor: '#1E293B',
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
    color: '#94A3B8',
  },
  subDetailVal: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
