import axios from 'axios';
import { getUserSession, clearUserSession } from './db';

let rawBaseUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8002/api';
rawBaseUrl = rawBaseUrl.trim().replace(/\/+$/, '');

// Ensure /api suffix is present
const API_BASE_URL = rawBaseUrl.endsWith('/api') ? rawBaseUrl : `${rawBaseUrl}/api`;

console.log('Using API Base URL:', API_BASE_URL);

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 15000,
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

// Interceptor to handle 401 Unauthorized
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response && error.response.status === 401) {
      console.warn('Unauthorized request - session expired or invalid');
      await clearUserSession();
    }
    return Promise.reject(error);
  }
);

export default api;
