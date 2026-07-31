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

export default api;
