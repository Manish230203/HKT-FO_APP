import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system/legacy';

// Safe Storage Helper to eliminate SecureStore 2048-byte overflow warning
const setStorageItem = async (key: string, value: string) => {
  try {
    if (Platform.OS === 'web') {
      localStorage.setItem(key, value);
      return;
    }

    if (value.length > 1800) {
      // Use FileSystem for large payloads (> 1.8KB)
      const fileUri = `${FileSystem.documentDirectory}${key}.json`;
      await FileSystem.writeAsStringAsync(fileUri, value);
    } else {
      // Use SecureStore for small credentials/tokens
      await SecureStore.setItemAsync(key, value);
    }
  } catch (e) {
    console.error(`Error saving storage item for key ${key}:`, e);
  }
};

const getStorageItem = async (key: string): Promise<string | null> => {
  try {
    if (Platform.OS === 'web') {
      return localStorage.getItem(key);
    }

    const fileUri = `${FileSystem.documentDirectory}${key}.json`;
    const fileInfo = await FileSystem.getInfoAsync(fileUri);
    if (fileInfo.exists) {
      return await FileSystem.readAsStringAsync(fileUri);
    }

    return await SecureStore.getItemAsync(key);
  } catch (e) {
    return null;
  }
};

const deleteStorageItem = async (key: string) => {
  try {
    if (Platform.OS === 'web') {
      localStorage.removeItem(key);
      return;
    }

    const fileUri = `${FileSystem.documentDirectory}${key}.json`;
    const fileInfo = await FileSystem.getInfoAsync(fileUri);
    if (fileInfo.exists) {
      await FileSystem.deleteAsync(fileUri, { idempotent: true });
    }
    await SecureStore.deleteItemAsync(key);
  } catch (e) {
    // Ignore cleanup errors
  }
};

export const saveUserSession = async (userData: any, token: string) => {
  try {
    const payload = JSON.stringify({ user: userData, token });
    await setStorageItem('fo_user_session', payload);
  } catch (e) {
    console.error("Save user session failed", e);
  }
};

export const getUserSession = async () => {
  try {
    const payload = await getStorageItem('fo_user_session');
    return payload ? JSON.parse(payload) : null;
  } catch (e) {
    console.error("Get user session failed", e);
    return null;
  }
};

export const clearUserSession = async () => {
  try {
    await deleteStorageItem('fo_user_session');
  } catch (e) {
    console.error("Clear user session failed", e);
  }
};

export const saveLanguageSetting = async (lang: string) => {
  try {
    await setStorageItem('user_language', lang);
  } catch (e) {
    console.error("Save language setting failed", e);
  }
};

export const getLanguageSetting = async () => {
  try {
    return await getStorageItem('user_language');
  } catch (e) {
    console.error("Get language setting failed", e);
    return null;
  }
};

export const saveProfileImage = async (imageUri: string, empId?: string) => {
  try {
    const key = empId ? `user_profile_image_${empId}` : 'user_profile_image';
    await setStorageItem(key, imageUri);
  } catch (e) {
    console.error("Save profile image failed", e);
  }
};

export const getProfileImage = async (empId?: string) => {
  try {
    const key = empId ? `user_profile_image_${empId}` : 'user_profile_image';
    return await getStorageItem(key);
  } catch (e) {
    console.error("Get profile image failed", e);
    return null;
  }
};

export const savePunchRecord = async (record: any, empId?: string) => {
  try {
    const targetEmpId = empId || record.employee_id || record.employeeId;
    const recordWithEmpId = { ...record, employee_id: targetEmpId };
    const existing = await getRawPunchRecords();
    const updated = [recordWithEmpId, ...existing];
    const payload = JSON.stringify(updated);
    await setStorageItem('fo_punch_records', payload);
  } catch (e) {
    console.error("Save punch record failed", e);
  }
};

export const updatePunchRecordsList = async (updatedRecords: any[]) => {
  try {
    const payload = JSON.stringify(updatedRecords);
    await setStorageItem('fo_punch_records', payload);
  } catch (e) {
    console.error("Update punch records failed", e);
  }
};

const getRawPunchRecords = async (): Promise<any[]> => {
  try {
    const payload = await getStorageItem('fo_punch_records');
    return payload ? JSON.parse(payload) : [];
  } catch (e) {
    console.error("Get raw punch records failed", e);
    return [];
  }
};

export const getPunchRecords = async (empId?: string): Promise<any[]> => {
  try {
    const all = await getRawPunchRecords();
    if (!empId) return all;
    const empStr = String(empId).toLowerCase().trim();
    const filtered = all.filter(
      (r) =>
        String(r.employee_id || '').toLowerCase() === empStr ||
        String(r.employeeId || '').toLowerCase() === empStr ||
        (r.officerName && r.officerName.toLowerCase().includes(empStr))
    );
    return filtered.length > 0 ? filtered : all;
  } catch (e) {
    console.error("Get punch records failed", e);
    return [];
  }
};

export const saveActiveCheckIns = async (checkIns: Record<string, { checkInTime: string; date: string; siteId?: string | number; siteName?: string; clientId?: string | number }>) => {
  try {
    const payload = JSON.stringify(checkIns);
    await setStorageItem('fo_active_checkins', payload);
  } catch (e) {
    console.error("Save active checkins failed", e);
  }
};

export const getActiveCheckIns = async (): Promise<Record<string, { checkInTime: string; date: string; siteId?: string | number; siteName?: string; clientId?: string | number }>> => {
  try {
    const payload = await getStorageItem('fo_active_checkins');
    return payload ? JSON.parse(payload) : {};
  } catch (e) {
    console.error("Get active checkins failed", e);
    return {};
  }
};

export const clearActiveCheckIn = async (plannedId: string | number) => {
  try {
    const active = await getActiveCheckIns();
    delete active[String(plannedId)];
    await saveActiveCheckIns(active);
  } catch (e) {
    console.error("Clear active checkin failed", e);
  }
};
