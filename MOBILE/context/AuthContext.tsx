import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserProfile, loginOfficer } from '../services/authService';
import { getUserSession, saveUserSession, clearUserSession, getProfileImage, saveProfileImage } from '../services/db';

interface AuthContextType {
  user: UserProfile | null;
  token: string | null;
  profileImage: string | null;
  isLoading: boolean;
  login: (identifier: string, password?: string) => Promise<boolean>;
  logout: () => Promise<void>;
  updateProfileImage: (uri: string) => Promise<void>;
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
      } else {
        setProfileImage(null);
      }
    } catch (e) {
      console.error('Failed to load user session', e);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (identifier: string, password?: string): Promise<boolean> => {
    try {
      setIsLoading(true);
      const res = await loginOfficer({ identifier, password });
      if (res && res.access_token && res.user) {
        setUser(res.user);
        setToken(res.access_token);
        await saveUserSession(res.user, res.access_token);

        const empId = res.user.employee_id || res.user.id || res.user.username;
        const savedImage = await getProfileImage(empId);
        setProfileImage(savedImage);
        return true;
      }
      return false;
    } catch (e) {
      console.error('Login failed', e);
      throw e;
    } finally {
      setIsLoading(false);
    }
  };

  const updateProfileImage = async (uri: string) => {
    setProfileImage(uri);
    const empId = user?.employee_id || user?.id || user?.username;
    await saveProfileImage(uri, empId);
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
