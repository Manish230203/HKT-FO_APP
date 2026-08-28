import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserProfile, loginOfficer, getAuthenticatedUser } from '../services/authService';
import { getUserSession, saveUserSession, clearUserSession, getProfileImage, saveProfileImage } from '../services/db';
import { Config } from '../constants/Config';

export interface LoginResult {
  success: boolean;
  errorType?: 'NO_ACCOUNT' | 'RESTRICTED_ROLE' | 'NETWORK_ERROR';
}

interface AuthContextType {
  user: UserProfile | null;
  token: string | null;
  profileImage: string | null;
  isLoading: boolean;
  login: (identifier: string, password?: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
  updateProfileImage: (uri: string) => Promise<{ success: boolean; message: string }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadUserSession();
  }, []);

  const loadUserSession = async () => {
    try {
      const session = await getUserSession();
      if (session && session.user && session.token) {
        setUser(session.user);
        setToken(session.token);
        const empId = session.user.employee_id || session.user.id || session.user.username;
        const savedImage = await getProfileImage(empId);
        setProfileImage(savedImage);

        // Re-sync latest DB profile metadata (company, site) from server
        try {
          const freshUser = await getAuthenticatedUser();
          if (freshUser) {
            const updatedUser = { ...session.user, ...freshUser };
            setUser(updatedUser);
            await saveUserSession(updatedUser, session.token);
          }
        } catch (syncErr) {
          // Fallback to cached session if offline
        }
      } else {
        setProfileImage(null);
      }
    } catch (e) {
      console.error('Failed to load user session', e);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (identifier: string, password?: string): Promise<LoginResult> => {
    try {
      setIsLoading(true);
      const res = await loginOfficer({ identifier, password });
      if (res && res.access_token && res.user) {
        // Validate Field Officer role permission (restrict Security Guards and non-FO staff)
        const role = (res.user.role || '').toUpperCase().trim();
        const restrictedRoles = [
          'S/G',
          'GUARD',
          'SUPER GUARD',
          'LS/G',
          'L/SG',
          'ESM S/G',
          'ESCO/G',
          'H/G',
          'BOUNCER',
          'GUN MAN',
          'HK BOY',
          'HK LADY',
          'HK/SUP',
          'MALI',
          'PLUMBER',
          'ELECTRICIAN',
          'CARPENTER',
          'HELPER',
          'LOADER',
          'RECEP',
          'RECEPTIONIST',
          'FITTER/WELDER',
          'DRIVER',
          'LMV DRIVER',
          'HMV DRIVER',
          'PEON',
          'HOUSEKEEPING',
          'ACCOUNTANT',
          'OFFI BOY',
          'OFFI LADY',
        ];

        if (restrictedRoles.includes(role)) {
          return { success: false, errorType: 'RESTRICTED_ROLE' };
        }

        setUser(res.user);
        setToken(res.access_token);
        await saveUserSession(res.user, res.access_token);

        const empId = res.user.employee_id || res.user.id || (res.user as any).username;
        const savedImage = await getProfileImage(empId);
        setProfileImage(savedImage);
        return { success: true };
      }
      return { success: false, errorType: 'NO_ACCOUNT' };
    } catch (e: any) {
      if (e.response?.status === 401 || e.response?.status === 404) {
        return { success: false, errorType: 'NO_ACCOUNT' };
      }
      if (e.response?.status === 403) {
        return { success: false, errorType: 'RESTRICTED_ROLE' };
      }
      return { success: false, errorType: 'NETWORK_ERROR' };
    } finally {
      setIsLoading(false);
    }
  };

  const updateProfileImage = async (uri: string) => {
    setProfileImage(uri);
    const empId = user?.employee_id || (user?.id ? String(user.id) : '') || user?.username;
    await saveProfileImage(uri, empId ? String(empId) : undefined);

    // Upload to backend to calculate and store face embedding in MySQL DB
    try {
      const empOidVal = user?.id || (user as any)?.oid || user?.employee_id || user?.username;
      if (empOidVal) {
        const formData = new FormData();
        formData.append('empOid', empOidVal.toString());

        const filename = uri.split('/').pop() || 'photo.jpg';
        const match = /\.(\w+)$/.exec(filename);
        const type = match ? `image/${match[1]}` : `image/jpeg`;

        formData.append('file', {
          uri: uri,
          name: filename,
          type: type,
        } as any);

        const response = await fetch(`${Config.BASE_URL}/_AIP_uploadProfilePhoto`, {
          method: 'POST',
          headers: {
            'ngrok-skip-browser-warning': 'true',
          },
          body: formData,
        });

        const resData = await response.json();
        return resData;
      }
    } catch (err) {
      console.warn('Backend profile photo upload warning:', err);
    }
    return { success: true, message: 'Profile photo saved locally' };
  };

  const logout = async () => {
    try {
      await clearUserSession();
      setUser(null);
      setToken(null);
      setProfileImage(null);
    } catch (e) {
      console.error('Logout failed', e);
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, profileImage, isLoading, login, logout, updateProfileImage }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
