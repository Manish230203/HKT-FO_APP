import axios from "axios";

// Create an Axios instance pointing to the standalone FastAPI backend running on port 8002
const api = axios.create({
  baseURL:
    import.meta.env.VITE_API_BASE_URL ||
    `http://${window.location.hostname}:8002/api`,
  headers: {
    "Content-Type": "application/json",
  },
});

// Add a request interceptor to attach the JWT token
api.interceptors.request.use(
  (config) => {
    // Grab the token from session storage
    const token = sessionStorage.getItem("access_token");
    
    // If the token exists, attach it to the Authorization header
    if (token) {
      config.headers["Authorization"] = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add helper function to fetch duty location violations
export const getDutyLocationViolations = async (params = {}) => {
  try {
    const res = await api.get('/v1/violations', { params });
    if (res.data && (res.data.success || Array.isArray(res.data.violations))) {
      return res.data.violations || res.data.data || [];
    }
    if (Array.isArray(res.data)) {
      return res.data;
    }
    return [];
  } catch (err) {
    try {
      const fallbackRes = await api.get('/attendance/location-violations', { params });
      return fallbackRes.data?.violations || fallbackRes.data?.data || (Array.isArray(fallbackRes.data) ? fallbackRes.data : []);
    } catch (fallbackErr) {
      console.warn('Error fetching duty location violations:', err);
      return [];
    }
  }
};

export default api;