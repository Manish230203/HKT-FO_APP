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

export default api;