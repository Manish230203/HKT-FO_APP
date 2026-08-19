import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import { useAuth } from './AuthContext';
import { Config } from '../constants/Config';
import { getPunchRecords, savePunchRecord, updatePunchRecordsList } from '../services/db';

export interface AttendanceRecord {
  date: string;
  check_in: string | null;
  check_out: string | null;
  status: string;
  site_name?: string;
  duty_type?: string;
  is_shift_active?: boolean;
}

export interface AttendanceStats {
  totalDays: string;
  presentDays: string;
  absentDays: string;
}

export interface ProfileData {
  name: string;
  emp_code: string;
  email: string;
  mobile: string;
  date_of_joining: string;
  active: number;
  designation: string;
  site_id: number;
  site_name: string;
  client_name: string;
  branch_name: string;
  profile_photo: string | null;
  weekly_off: string;
}

interface AttendanceContextType {
  todayRecord: AttendanceRecord | null;
  attendanceLogs: AttendanceRecord[];
  monthlyStats: AttendanceStats | null;
  profileData: ProfileData | null;
  isLoading: boolean;
  refreshStatus: () => Promise<void>;
  markAttendance: (latitude: number, longitude: number, siteOid?: number, timestamp?: string) => Promise<{ success: boolean; message: string }>;
  validateSelfie: (uri: string) => Promise<{ success: boolean; message: string }>;
  unifiedPunch: (uri: string, latitude: number, longitude: number) => Promise<{ success: boolean; message: string }>;
}

const AttendanceContext = createContext<AttendanceContextType | undefined>(undefined);

export function AttendanceProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [todayRecord, setTodayRecord] = useState<AttendanceRecord | null>(null);
  const [attendanceLogs, setAttendanceLogs] = useState<AttendanceRecord[]>([]);
  const [monthlyStats, setMonthlyStats] = useState<AttendanceStats | null>(null);
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const getEmpOid = () => {
    if (!user) return null;
    return user.id || (user as any).oid || user.employee_id || (user as any).username;
  };

  const refreshStatus = async () => {
    const empOid = getEmpOid();
    if (!empOid) return;

    setIsLoading(true);

    const safeFetch = async (endpoint: string) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 7000);

      try {
        const response = await fetch(`${Config.BASE_URL}${endpoint}?empOid=${empOid}`, {
          headers: { 'ngrok-skip-browser-warning': 'true' },
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        const contentType = response.headers.get('content-type');
        if (!response.ok) {
          console.warn(`Fetch error for ${endpoint}: HTTP ${response.status}`);
          return null;
        }

        if (contentType && contentType.includes('application/json')) {
          return await response.json();
        } else {
          return null;
        }
      } catch (e) {
        clearTimeout(timeoutId);
        return null;
      }
    };

    try {
      const [todayData, logsData, statsData, profileRes] = await Promise.all([
        safeFetch('/_AIP_getTodayStatus'),
        safeFetch('/_AIP_getAttendanceLogs'),
        safeFetch('/_AIP_getMonthlyStats'),
        safeFetch('/_AIP_getProfile'),
      ]);

      if (todayData?.success) {
        setTodayRecord(todayData.record);
      }

      if (logsData?.success) {
        setAttendanceLogs(logsData.logs || []);
        // Also map to local SQLite format so local fallback is populated
        try {
          const empIdStr = String(empOid);
          const mappedForLocal = (logsData.logs || []).map((l: any, index: number) => {
            let titleDate = l.date || 'Today';
            if (l.date) {
              try {
                const dt = new Date(l.date);
                titleDate = `${dt.toLocaleDateString('en-US', { weekday: 'long' })}, ${dt.getDate()} ${dt.toLocaleDateString('en-US', { month: 'short' })}`;
              } catch (e) {
                titleDate = l.date;
              }
            }
            return {
              id: `remote_${index}_${l.date}`,
              employee_id: empIdStr,
              employeeId: user?.employee_id || empIdStr,
              timestamp: l.check_in ? new Date(l.check_in).getTime() : Date.now(),
              date: l.date,
              dayTitle: titleDate,
              punchInTime: l.check_in ? new Date(l.check_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--',
              punchOutTime: l.check_out ? new Date(l.check_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--',
              siteName: l.site_name || 'AMA Facility',
              clientName: 'Client',
              status: l.check_out ? 'COMPLETED' : l.check_in ? 'PUNCHED-IN' : 'MISSED',
              officerName: user?.name || 'Officer',
            };
          });
          await updatePunchRecordsList(mappedForLocal);
        } catch (e) {
          console.warn('Sync to local db error:', e);
        }
      }

      if (statsData?.success) {
        setMonthlyStats(statsData.stats);
      }

      if (profileRes?.success) {
        setProfileData(profileRes.profile);
      }
    } catch (error) {
      console.error('Refresh status unexpected error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshStatus();
  }, [user]);

  const markAttendance = async (latitude: number, longitude: number, siteOid?: number, timestamp?: string) => {
    const empOid = getEmpOid();
    if (!empOid) return { success: false, message: 'User not authenticated' };

    try {
      const response = await fetch(`${Config.BASE_URL}/_AIP_markAttendance`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true',
        },
        body: JSON.stringify({
          empOid,
          latitude,
          longitude,
          siteOid,
          timestamp: timestamp || new Date().toISOString(),
        }),
      });

      const contentType = response.headers.get('content-type');
      if (!response.ok) {
        let errorMsg = `Server Error (${response.status})`;
        if (contentType && contentType.includes('application/json')) {
          const errData = await response.json();
          errorMsg = errData.message || errorMsg;
        } else {
          const text = await response.text();
          errorMsg = text.slice(0, 100) || errorMsg;
        }
        return { success: false, message: errorMsg };
      }

      if (contentType && contentType.includes('application/json')) {
        const result = await response.json();
        if (result.success) {
          await refreshStatus();
        }
        return result;
      } else {
        return { success: false, message: 'Invalid response from server' };
      }
    } catch (error) {
      console.error('Mark attendance error:', error);
      return { success: false, message: error instanceof Error ? error.message : 'Connection Error' };
    }
  };

  const validateSelfie = async (uri: string) => {
    const empOid = getEmpOid();
    if (!empOid) return { success: false, message: 'User not authenticated' };

    try {
      const formData = new FormData();
      formData.append('empOid', empOid.toString());

      const filename = uri.split('/').pop() || 'selfie.jpg';
      const match = /\.(\w+)$/.exec(filename);
      const type = match ? `image/${match[1]}` : `image/jpeg`;

      formData.append('file', {
        uri: uri,
        name: filename,
        type: type,
      } as any);

      const response = await fetch(`${Config.BASE_URL}/selfieValidation`, {
        method: 'POST',
        headers: {
          'ngrok-skip-browser-warning': 'true',
        },
        body: formData,
      });

      const result = await response.json();
      return result;
    } catch (error) {
      console.error('Selfie validation error:', error);
      return { success: false, message: 'Validation Failed' };
    }
  };

  const unifiedPunch = async (uri: string, latitude: number, longitude: number) => {
    const empOid = getEmpOid();
    if (!empOid) return { success: false, message: 'User not authenticated' };

    try {
      const formData = new FormData();
      formData.append('empOid', empOid.toString());
      formData.append('latitude', latitude.toString());
      formData.append('longitude', longitude.toString());

      const filename = uri.split('/').pop() || 'selfie.jpg';
      const match = /\.(\w+)$/.exec(filename);
      const type = match ? `image/${match[1]}` : `image/jpeg`;

      formData.append('file', {
        uri: uri,
        name: filename,
        type: type,
      } as any);

      const response = await fetch(`${Config.BASE_URL}/_AIP_unifiedPunch`, {
        method: 'POST',
        headers: {
          'ngrok-skip-browser-warning': 'true',
        },
        body: formData,
      });

      const result = await response.json();
      if (result.success) {
        await refreshStatus();
      }
      return result;
    } catch (error) {
      console.error('Unified punch error:', error);
      return { success: false, message: error instanceof Error ? error.message : 'Connection Error' };
    }
  };

  return (
    <AttendanceContext.Provider
      value={{
        todayRecord,
        attendanceLogs,
        monthlyStats,
        profileData,
        isLoading,
        refreshStatus,
        markAttendance,
        validateSelfie,
        unifiedPunch,
      }}
    >
      {children}
    </AttendanceContext.Provider>
  );
}

export function useAttendance() {
  const context = useContext(AttendanceContext);
  if (context === undefined) {
    throw new Error('useAttendance must be used within an AttendanceProvider');
  }
  return context;
}
