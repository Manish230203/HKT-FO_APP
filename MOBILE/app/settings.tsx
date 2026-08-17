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
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { CustomAlertModal } from '../components/ui/CustomAlertModal';
import { SwipeableBackWrapper } from '../components/SwipeableBackWrapper';

export default function SettingsScreen() {
  const { user, logout, profileImage, updateProfileImage } = useAuth();
  const { language } = useLanguage();
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
        await updateProfileImage(capturedUri);
        Alert.alert('Photo Captured', 'Profile photo has been updated and saved!');
      }
    } catch (e) {
      console.error('Camera capture error', e);
    }
  };

  const handleSignOut = async () => {
    setShowSignOutConfirm(false);
    await logout();
    router.replace('/login');
  };

  return (
    <SwipeableBackWrapper>
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          {/* Header Navigation Bar */}
          <View style={styles.headerBar}>
            <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
              <ArrowLeft color="#FFFFFF" size={22} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Profile & Preferences</Text>
          </View>

          {/* 1. Header Profile Card */}
          <View style={styles.profileHeaderCard}>
            <View style={styles.avatarContainer}>
              <View style={styles.avatarCircle}>
                {profileImage ? (
                  <Image source={{ uri: profileImage }} style={styles.avatarImage} />
                ) : (
                  <User color="#FFFFFF" size={46} />
                )}
              </View>
              <TouchableOpacity style={styles.editBadge} onPress={handleOpenCamera}>
                <Camera color="#FFFFFF" size={14} />
              </TouchableOpacity>
            </View>

            <Text style={styles.userName}>{user?.name || 'PAPPU KUMAR'}</Text>
            <Text style={styles.userRole}>{user?.role || 'S/G'}</Text>

            <View style={styles.pillsRow}>
              <View style={styles.pillBadge}>
                <Text style={styles.pillText}>ID: {user?.employee_id || 'EMP002'}</Text>
              </View>
              <View style={[styles.pillBadge, { backgroundColor: '#1E3A8A' }]}>
                <Text style={[styles.pillText, { color: '#60A5FA' }]}>PUNE</Text>
              </View>
            </View>

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setShowFullProfileModal(true)}
              style={styles.viewFullProfileBtn}
            >
              <Text style={styles.viewFullProfileText}>VIEW FULL PROFILE</Text>
            </TouchableOpacity>
          </View>

          {/* 2. Security & Privacy Card */}
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
          </View>

          {/* 3. Notifications & Email Updates Card */}
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

          {/* 4. System Preferences Card */}
          <View style={styles.cardContainer}>
            <View style={styles.cardTitleRow}>
              <View style={styles.iconCircleBlue}>
                <SettingsIcon color="#3B82F6" size={18} />
              </View>
              <Text style={styles.cardHeaderTitle}>System Preferences</Text>
            </View>

            <TouchableOpacity
              onPress={() => router.push('/lang/lang-selection')}
              style={styles.itemRow}
            >
              <Languages color="#94A3B8" size={20} />
              <View style={styles.itemTextCol}>
                <Text style={styles.itemMainText}>Interface Language</Text>
                <Text style={styles.itemSubText}>{getLanguageText()}</Text>
              </View>
              <ChevronRight color="#64748B" size={18} />
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
          <View style={styles.cardContainer}>
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
                <Text style={styles.execRole}>{user?.role || 'S/G'}</Text>

                <View style={styles.execBadgeRow}>
                  <View style={styles.execBadge}>
                    <ShieldCheck color="#3B82F6" size={14} style={{ marginRight: 6 }} />
                    <Text style={styles.execBadgeText}>{user?.employee_id || 'EMP002'}</Text>
                  </View>
                  <View style={[styles.execBadge, { backgroundColor: 'rgba(16, 185, 129, 0.15)', borderColor: 'rgba(16, 185, 129, 0.3)' }]}>
                    <ShieldCheck color="#10B981" size={14} style={{ marginRight: 6 }} />
                    <Text style={[styles.execBadgeText, { color: '#10B981' }]}>ACTIVE ENGAGEMENT</Text>
                  </View>
                </View>

                <View style={styles.execAvatarBox}>
                  {profileImage ? (
                    <Image source={{ uri: profileImage }} style={styles.avatarImage} />
                  ) : (
                    <User color="#FFFFFF" size={40} />
                  )}
                </View>
              </View>

              <Text style={styles.sectionHeaderTitle}>Career & Deployment</Text>

              <View style={styles.detailsCard}>
                <View style={styles.detailsRowHeader}>
                  <Text style={styles.detailsFieldLabel}>JOINING DATE</Text>
                  <Calendar color="#3B82F6" size={20} />
                </View>
                <Text style={styles.detailsMainVal}>Mar 12, 2012</Text>

                <Text style={[styles.detailsFieldLabel, { marginTop: 14 }]}>TENURE</Text>
                <Text style={styles.detailsMainVal}>14 Years, 5 Months</Text>
              </View>

              <View style={styles.detailsCard}>
                <View style={styles.detailsRowHeader}>
                  <Text style={styles.detailsFieldLabel}>DEPLOYMENT DATE</Text>
                  <MapPin color="#3B82F6" size={20} />
                </View>
                <Text style={styles.detailsMainVal}>Mar 12, 2012</Text>

                <View style={styles.subDetailBox}>
                  <Text style={styles.subDetailLabel}>CLIENT</Text>
                  <Text style={styles.subDetailVal}>Tata Power</Text>
                </View>

                <View style={styles.subDetailBox}>
                  <Text style={styles.subDetailLabel}>BRANCH</Text>
                  <Text style={styles.subDetailVal}>Pune</Text>
                </View>

                <View style={styles.subDetailBox}>
                  <Text style={styles.subDetailLabel}>SITE</Text>
                  <Text style={styles.subDetailVal}>Humankind Technology</Text>
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
