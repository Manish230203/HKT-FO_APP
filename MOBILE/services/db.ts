import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system/legacy';

// Safe Storage Helper to eliminate SecureStore 2048-byte overflow warning
export const setStorageItem = async (key: string, value: string) => {
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

export const getStorageItem = async (key: string): Promise<string | null> => {
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

export const deleteStorageItem = async (key: string) => {
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
    const existing = await getUserSession();
    if (existing && existing.user && String(existing.user.id || existing.user.employee_id) !== String(userData.id || userData.employee_id)) {
      // Switched to a different employee account: clear previous employee's local punches and check-ins
      await deleteStorageItem('fo_punch_records');
      await deleteStorageItem('fo_active_checkins');
    }
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
    await deleteStorageItem('fo_punch_records');
    await deleteStorageItem('fo_active_checkins');
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

export const saveThemeSetting = async (theme: 'dark' | 'light') => {
  try {
    await setStorageItem('user_theme_preference', theme);
  } catch (e) {
    console.error("Save theme setting failed", e);
  }
};

export const getThemeSetting = async (): Promise<'dark' | 'light' | null> => {
  try {
    const val = await getStorageItem('user_theme_preference');
    if (val === 'light' || val === 'dark') return val;
    return null;
  } catch (e) {
    console.error("Get theme setting failed", e);
    return null;
  }
};

export const saveConsentSetting = async (accepted: boolean) => {
  try {
    await setStorageItem('user_consent_accepted', accepted ? 'true' : 'false');
  } catch (e) {
    console.error("Save consent setting failed", e);
  }
};

export const getConsentSetting = async (): Promise<boolean> => {
  try {
    const res = await getStorageItem('user_consent_accepted');
    return res === 'true';
  } catch (e) {
    console.error("Get consent setting failed", e);
    return false;
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

export const getRawPunchRecords = async (): Promise<any[]> => {
  try {
    const payload = await getStorageItem('fo_punch_records');
    return payload ? JSON.parse(payload) : [];
  } catch (e) {
    console.error("Get raw punch records failed", e);
    return [];
  }
};

export const reconcilePunchRecordsWithServer = async (isServerActive: boolean, todayDateStr?: string) => {
  try {
    const all = await getRawPunchRecords();
    let modified = false;
    const updated = all.map((r) => {
      if (!isServerActive) {
        if (r.status === 'PUNCHED-IN' || r.punchOutTime === '--:--') {
          modified = true;
          return {
            ...r,
            status: 'COMPLETED',
            punchOutTime: r.punchInTime || 'Completed',
          };
        }
      } else if (todayDateStr && r.date && r.date !== todayDateStr) {
        if (r.status === 'PUNCHED-IN' || r.punchOutTime === '--:--') {
          modified = true;
          return {
            ...r,
            status: 'COMPLETED',
            punchOutTime: r.punchInTime || 'Completed',
          };
        }
      }
      return r;
    });

    if (modified) {
      await updatePunchRecordsList(updated);
    }
  } catch (e) {
    console.error("Reconcile punch records failed", e);
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
    return filtered;
  } catch (e) {
    console.error("Get punch records failed", e);
    return [];
  }
};

export interface ActiveCheckInInfo {
  checkInTime: string;
  checkOutTime?: string | null;
  date: string;
  siteId?: string | number | null;
  customVisitId?: string | number | null;
  siteName?: string;
  clientId?: string | number | null;
  reportSubmitted?: boolean;
  reportId?: string;
  reportType?: string;
}

export const saveActiveCheckIns = async (checkIns: Record<string, ActiveCheckInInfo>) => {
  try {
    const payload = JSON.stringify(checkIns);
    await setStorageItem('fo_active_checkins', payload);
  } catch (e) {
    console.error("Save active checkins failed", e);
  }
};

export const getActiveCheckIns = async (): Promise<Record<string, ActiveCheckInInfo>> => {
  try {
    const payload = await getStorageItem('fo_active_checkins');
    return payload ? JSON.parse(payload) : {};
  } catch (e) {
    console.error("Get active checkins failed", e);
    return {};
  }
};

export const markReportSubmittedForCheckIn = async (
  plannedId?: string | number,
  siteId?: string | number,
  reportId?: string,
  reportType?: string,
  customVisitId?: string | number
) => {
  try {
    const active = await getActiveCheckIns();
    const pKey = plannedId ? String(plannedId) : null;
    const sKey = siteId ? String(siteId) : null;
    const cKey = customVisitId ? String(customVisitId) : null;

    if (pKey) {
      active[pKey] = {
        ...(active[pKey] || { siteId: siteId ? String(siteId) : '', customVisitId: customVisitId ? String(customVisitId) : undefined }),
        reportSubmitted: true,
        reportId: reportId || active[pKey]?.reportId,
        reportType: reportType || active[pKey]?.reportType,
      };
    }
    if (sKey) {
      active[sKey] = {
        ...(active[sKey] || { siteId: sKey }),
        reportSubmitted: true,
        reportId: reportId || active[sKey]?.reportId,
        reportType: reportType || active[sKey]?.reportType,
      };
    }
    if (cKey) {
      active[cKey] = {
        ...(active[cKey] || { customVisitId: cKey }),
        reportSubmitted: true,
        reportId: reportId || active[cKey]?.reportId,
        reportType: reportType || active[cKey]?.reportType,
      };
    }
    Object.keys(active).forEach((k) => {
      const matchSite = siteId && String(active[k]?.siteId) === String(siteId);
      const matchCustom = customVisitId && String(active[k]?.customVisitId) === String(customVisitId);
      const matchKey = (pKey && k === pKey) || (sKey && k === sKey) || (cKey && k === cKey);
      if (matchSite || matchCustom || matchKey) {
        active[k].reportSubmitted = true;
        if (reportId) active[k].reportId = reportId;
        if (reportType) active[k].reportType = reportType;
        if (customVisitId) active[k].customVisitId = customVisitId;
      }
    });
    await saveActiveCheckIns(active);
  } catch (e) {
    console.error("Mark report submitted failed", e);
  }
};

export const clearActiveCheckIn = async (plannedId: string | number) => {
  try {
    const active = await getActiveCheckIns();
    const targetStr = String(plannedId);
    delete active[targetStr];
    // Also remove any entries matching by siteId or customVisitId
    Object.keys(active).forEach(k => {
      if (
        String(active[k]?.siteId) === targetStr ||
        String(active[k]?.customVisitId) === targetStr ||
        k === targetStr
      ) {
        delete active[k];
      }
    });
    await saveActiveCheckIns(active);
  } catch (e) {
    console.error("Clear active checkin failed", e);
  }
};

export const clearAllActiveCheckIns = async () => {
  try {
    await saveActiveCheckIns({});
  } catch (e) {
    console.error("Clear all active checkins failed", e);
  }
};

