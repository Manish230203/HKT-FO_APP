import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export const saveUserSession = async (userData: any, token: string) => {
  try {
    const payload = JSON.stringify({ user: userData, token });
    if (Platform.OS === 'web') {
      localStorage.setItem('fo_user_session', payload);
    } else {
      await SecureStore.setItemAsync('fo_user_session', payload);
    }
  } catch (e) {
    console.error("Save user session failed", e);
  }
};

export const getUserSession = async () => {
  try {
    let payload: string | null = null;
    if (Platform.OS === 'web') {
      payload = localStorage.getItem('fo_user_session');
    } else {
      payload = await SecureStore.getItemAsync('fo_user_session');
    }
    return payload ? JSON.parse(payload) : null;
  } catch (e) {
    console.error("Get user session failed", e);
    return null;
  }
};

export const clearUserSession = async () => {
  try {
    if (Platform.OS === 'web') {
      localStorage.removeItem('fo_user_session');
    } else {
      await SecureStore.deleteItemAsync('fo_user_session');
    }
  } catch (e) {
    console.error("Clear user session failed", e);
  }
};

export const saveLanguageSetting = async (lang: string) => {
  try {
    if (Platform.OS === 'web') {
      localStorage.setItem('user_language', lang);
    } else {
      await SecureStore.setItemAsync('user_language', lang);
    }
  } catch (e) {
    console.error("Save language setting failed", e);
  }
};

export const getLanguageSetting = async () => {
  try {
    if (Platform.OS === 'web') {
      return localStorage.getItem('user_language');
    } else {
      return await SecureStore.getItemAsync('user_language');
    }
  } catch (e) {
    console.error("Get language setting failed", e);
    return null;
  }
};

export const saveProfileImage = async (imageUri: string, empId?: string) => {
  try {
    const key = empId ? `user_profile_image_${empId}` : 'user_profile_image';
    if (Platform.OS === 'web') {
      localStorage.setItem(key, imageUri);
    } else {
      await SecureStore.setItemAsync(key, imageUri);
    }
  } catch (e) {
    console.error("Save profile image failed", e);
  }
};

export const getProfileImage = async (empId?: string) => {
  try {
    const key = empId ? `user_profile_image_${empId}` : 'user_profile_image';
    let img: string | null = null;
    if (Platform.OS === 'web') {
      img = localStorage.getItem(key);
    } else {
      img = await SecureStore.getItemAsync(key);
    }
    return img;
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
    if (Platform.OS === 'web') {
      localStorage.setItem('fo_punch_records', payload);
    } else {
      await SecureStore.setItemAsync('fo_punch_records', payload);
    }
  } catch (e) {
    console.error("Save punch record failed", e);
  }
};

export const updatePunchRecordsList = async (updatedRecords: any[]) => {
  try {
    const payload = JSON.stringify(updatedRecords);
    if (Platform.OS === 'web') {
      localStorage.setItem('fo_punch_records', payload);
    } else {
      await SecureStore.setItemAsync('fo_punch_records', payload);
    }
  } catch (e) {
    console.error("Update punch records failed", e);
  }
};

const getRawPunchRecords = async (): Promise<any[]> => {
  try {
    let payload: string | null = null;
    if (Platform.OS === 'web') {
      payload = localStorage.getItem('fo_punch_records');
    } else {
      payload = await SecureStore.getItemAsync('fo_punch_records');
    }
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
