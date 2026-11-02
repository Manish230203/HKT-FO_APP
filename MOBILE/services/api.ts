import axios from 'axios';
import { getUserSession, clearUserSession } from './db';

let rawBaseUrl = process.env.EXPO_PUBLIC_API_URL || 'https://tarot-carrot-celery.ngrok-free.dev/api';
rawBaseUrl = rawBaseUrl.trim().replace(/\/+$/, '');

// Ensure /api suffix is present
const API_BASE_URL = rawBaseUrl.endsWith('/api') ? rawBaseUrl : `${rawBaseUrl}/api`;

console.log('Using API Base URL:', API_BASE_URL);

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': 'true',
  },
  timeout: 30000,
});

// Interceptor to attach Authorization header
api.interceptors.request.use(
  async (config) => {
    try {
      const session = await getUserSession();
      if (session && session.token) {
        config.headers.Authorization = `Bearer ${session.token}`;
      }
    } catch (err) {
      console.error('Error fetching token for API request', err);
    }
    return config;
  },
  (error) => Promise.reject(error)
);

let onSessionTerminatedCallback: (() => void) | null = null;

export const setOnSessionTerminatedCallback = (cb: () => void) => {
  onSessionTerminatedCallback = cb;
};

// Interceptor to handle 401 Unauthorized and auto-retry on transient network errors
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config;
    // Retry once on transient network drop or connection timeout (common on cellular/ngrok)
    const isNetworkError = !error.response && (error.message === 'Network Error' || error.code === 'ECONNABORTED' || error.code === 'ERR_NETWORK');
    if (isNetworkError && config && !config._isRetry) {
      config._isRetry = true;
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return api(config);
    }

    if (error.response) {
      const status = error.response.status;
      const detail = String(error.response.data?.detail || '').toLowerCase();
      const isSessionTerminated = 
        status === 401 || 
        (status === 403 && (detail.includes('deactivated') || detail.includes('deregistered') || detail.includes('session')));

      if (isSessionTerminated) {
        console.warn('Session terminated or account deactivated - clearing credentials:', detail);
        await clearUserSession();
        if (onSessionTerminatedCallback) {
          onSessionTerminatedCallback();
        }
      }
    }
    return Promise.reject(error);
  }
);

export default api;
