import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  Calendar,
  MapPin,
  ShieldCheck,
  User,
  LogOut,
} from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { CustomAlertModal } from '../../components/ui/CustomAlertModal';
import { SwipeableBackWrapper } from '../../components/SwipeableBackWrapper';

export default function ProfileScreen() {
  const { user, logout, profileImage } = useAuth();
  const router = useRouter();
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);

  const handleSignOut = async () => {
    setShowSignOutConfirm(false);
    await logout();
    router.replace('/lang/lang-selection');
  };

  return (
    <SwipeableBackWrapper>
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          {/* 1. EXECUTIVE PROFILE HEADER CARD */}
          <View style={styles.executiveHeaderCard}>
            <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
              <ArrowLeft color="#3B82F6" size={22} />
            </TouchableOpacity>

            <View style={styles.avatarBox}>
              {profileImage ? (
                <Image source={{ uri: profileImage }} style={styles.avatarImage} />
              ) : (
                <User color="#FFFFFF" size={38} />
              )}
            </View>

            <Text style={styles.execLabel}>EXECUTIVE PROFILE</Text>
            <Text style={styles.execName}>{user?.name || 'PAPPU KUMAR'}</Text>
            <Text style={styles.execRole}>{(user?.role || 'FIELD OFFICER').toUpperCase()}</Text>

            <View style={styles.pillsRow}>
              <View style={styles.empBadge}>
                <ShieldCheck color="#3B82F6" size={14} style={{ marginRight: 4 }} />
                <Text style={styles.empBadgeText}>{user?.employee_id || 'S48453'}</Text>
              </View>

              <View style={styles.activeBadge}>
                <ShieldCheck color="#10B981" size={14} style={{ marginRight: 4 }} />
                <Text style={styles.activeBadgeText}>ACTIVE ENGAGEMENT</Text>
              </View>
            </View>
          </View>

          {/* 2. CAREER & DEPLOYMENT SECTION */}
          <Text style={styles.sectionHeaderTitle}>Career & Deployment</Text>

          {/* Joining Date & Tenure Card */}
          <View style={styles.detailsCard}>
            <View style={styles.cardRowHeader}>
              <Text style={styles.fieldLabel}>JOINING DATE</Text>
              <Calendar color="#3B82F6" size={20} />
            </View>
            <Text style={styles.mainValText}>Mar 12, 2012</Text>

            <Text style={[styles.fieldLabel, { marginTop: 16 }]}>TENURE</Text>
            <Text style={styles.mainValText}>14 Years, 5 Months</Text>
          </View>

          {/* Deployment Date & Site Card */}
          <View style={styles.detailsCard}>
            <View style={styles.cardRowHeader}>
              <Text style={styles.fieldLabel}>DEPLOYMENT DATE</Text>
              <MapPin color="#3B82F6" size={20} />
            </View>
            <Text style={styles.mainValText}>Mar 12, 2012</Text>

            <View style={styles.subDetailPill}>
              <Text style={styles.pillLabel}>CLIENT</Text>
              <Text style={styles.pillValue}>Tata Power</Text>
            </View>

            <View style={styles.subDetailPill}>
              <Text style={styles.pillLabel}>BRANCH</Text>
              <Text style={styles.pillValue}>Pune</Text>
            </View>

            <View style={styles.subDetailPill}>
              <Text style={styles.pillLabel}>SITE</Text>
              <Text style={styles.pillValue}>Humankind Technology</Text>
            </View>
          </View>

          {/* Sign Out Action Button */}
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => setShowSignOutConfirm(true)}
            style={styles.signOutBtn}
          >
            <LogOut color="#FFFFFF" size={18} style={{ marginRight: 8 }} />
            <Text style={styles.signOutBtnText}>SIGN OUT SESSION</Text>
          </TouchableOpacity>

          <Text style={styles.copyrightText}>© 2026 HUMANKIND TECHNOLOGY</Text>
        </ScrollView>

        <CustomAlertModal
          visible={showSignOutConfirm}
          title="Sign Out"
          message="Are you sure you want to sign out of your account session?"
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
    paddingBottom: 40,
  },

  /* EXECUTIVE PROFILE HEADER CARD */
  executiveHeaderCard: {
    backgroundColor: '#131C33',
    borderRadius: 24,
    padding: 20,
    marginBottom: 24,
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  backBtn: {
    alignSelf: 'flex-start',
    padding: 4,
    marginBottom: 12,
  },
  avatarBox: {
    position: 'absolute',
    top: 20,
    right: 20,
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#3B82F6',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 34,
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
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
    marginTop: 2,
    letterSpacing: 0.5,
  },
  pillsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
    flexWrap: 'wrap',
  },
  empBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(30, 41, 59, 0.8)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  empBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  activeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#10B981',
  },

  /* SECTION TITLE */
  sectionHeaderTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 16,
  },

  /* DETAILS CARDS */
  detailsCard: {
    backgroundColor: '#131C33',
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  cardRowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 0.8,
  },
  mainValText: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 4,
  },
  subDetailPill: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pillLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  pillValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  /* SIGN OUT BUTTON */
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E11D48',
    paddingVertical: 14,
    borderRadius: 16,
    marginTop: 12,
    marginBottom: 8,
  },
  signOutBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  copyrightText: {
    textAlign: 'center',
    color: '#64748B',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginTop: 16,
  },
});
