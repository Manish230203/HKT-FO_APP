import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system/legacy';
import api from './api';
import { getUserSession } from './db';
import { getDeviceBatteryLevel } from './battery';

const OFFLINE_GPS_KEY = 'fo_offline_gps_queue';
const ACTIVE_TRACKING_KEY = 'fo_active_tracking_session';
export const LOCATION_TASK_NAME = 'FO_BACKGROUND_LOCATION_TASK';

export interface GPSPoint {
  point_id?: string;
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  speed?: number | null;
  battery_level?: number | null;
  is_mock?: boolean;
  recorded_at: string;
}

export interface ExtendedLocationCoords extends Location.LocationObjectCoords {
  mocked?: boolean;
}

class MobileGPSTracker {
  private isTracking: boolean = false;
  private timerId: any = null;
  private employeeId: number | null = null;
  private shiftId: number | null = null;
  private lastLocation: Location.LocationObject | null = null;
  private currentIntervalMs: number = 30000; // Default 30s
  private lastSentPoint: GPSPoint | null = null;
  private lastSentTime: number = 0;
  private hasActiveVisit: boolean = false;
  private isSyncing: boolean = false;

  // Initialize and start native adaptive location tracking
  public async startTracking(empId?: number, shiftId?: number) {
    let targetEmpId = empId;
    
    if (!targetEmpId) {
      const session = await getUserSession();
      if (session && session.user && session.user.oid) {
        targetEmpId = Number(session.user.oid);
      }
    }

    if (!targetEmpId) {
      console.warn('GPS startTracking skipped: No authenticated employee_oid found');
      return;
    }

    this.employeeId = targetEmpId;
    if (shiftId) this.shiftId = shiftId;
    this.isTracking = true;

    // Check if there is an active site visit session to set initial state
    try {
      const activeSession = await api.get(`/site-visit/active?employee_id=${this.employeeId}`);
      this.hasActiveVisit = !!(activeSession.data && activeSession.data.active_session);
    } catch {
      this.hasActiveVisit = false;
    }

    console.log(`Starting Native Background GPS tracking for Officer #${this.employeeId}. Active Visit: ${this.hasActiveVisit}`);

    // Persist active tracking state for device reboot / app restart recovery
    await this.saveActiveSessionState(true, this.employeeId, this.shiftId);

    // 1. Request foreground and background location permissions & Enable High-Accuracy Provider
    try {
      if (Platform.OS === 'android') {
        try {
          await Location.enableNetworkProviderAsync();
        } catch (netErr) {
          console.warn('Network provider enable warning:', netErr);
        }
      }

      const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
      if (fgStatus === 'granted') {
        try {
          const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
          if (bgStatus !== 'granted') {
            console.warn('Background location permission not granted; tracking might pause when screen locked');
          }
        } catch (bgPermErr) {
          console.warn('Background location permission request error:', bgPermErr);
        }
      } else {
        console.warn('Foreground location permission denied');
      }
    } catch (e) {
      console.warn('Error requesting location permissions:', e);
    }

    // 2. Register Native Expo Background Location Task with BestForNavigation high accuracy & dynamic filters
    try {
      await this.updateTrackingConfiguration(this.hasActiveVisit);
    } catch (bgTaskErr) {
      console.warn('Native background location registration error (falling back to JS timer):', bgTaskErr);
    }

    // 3. Fallback / Foreground timer fix cycle
    if (!this.timerId) {
      this.scheduleNextFix();
    }
  }

  public async updateTrackingConfiguration(hasActiveVisit: boolean) {
    this.hasActiveVisit = hasActiveVisit;
    if (!this.employeeId || !this.isTracking) return;

    try {
      const config = this.hasActiveVisit ? {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 30000, // 30 seconds active visit
        distanceInterval: 0, // 0 meters to ensure background callbacks fire when stationary
        deferredUpdatesInterval: 30000,
        deferredUpdatesDistance: 0,
        showsBackgroundLocationIndicator: true,
        pausesUpdatesAutomatically: false,
        activityType: Location.ActivityType.AutomotiveNavigation,
        foregroundService: {
          notificationTitle: 'PatrolSync FO Duty Active',
          notificationBody: 'Location tracking is active for field officer verification.',
          notificationColor: '#00599B',
          killServiceOnDestroy: false,
        },
      } : {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 90000, // 90 seconds travelling
        distanceInterval: 0, // 0 meters to ensure background callbacks fire when stationary
        deferredUpdatesInterval: 90000,
        deferredUpdatesDistance: 0,
        showsBackgroundLocationIndicator: true,
        pausesUpdatesAutomatically: false,
        activityType: Location.ActivityType.AutomotiveNavigation,
        foregroundService: {
          notificationTitle: 'PatrolSync FO Duty Active',
          notificationBody: 'Location tracking is active for field officer verification.',
          notificationColor: '#00599B',
          killServiceOnDestroy: false,
        },
      };

      await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, config);
      console.log(`Updated native background location task configuration. Checked-in: ${this.hasActiveVisit}`);
    } catch (e) {
      console.warn('Error updating native background location config:', e);
    }
  }

  private shouldSendPoint(pt: GPSPoint): boolean {
    if (!this.lastSentPoint) {
      return true;
    }

    const dist = this.calculateDistance(
      this.lastSentPoint.latitude,
      this.lastSentPoint.longitude,
      pt.latitude,
      pt.longitude
    );

    const timeDiffMs = Date.now() - this.lastSentTime;

    // Heartbeat check: If stationary for > 3 minutes (180,000ms), send 1 heartbeat ping
    if (timeDiffMs >= 180000) {
      console.log('Heartbeat trigger: Stationary for > 3 minutes, sending location.');
      return true;
    }

    // Displacement threshold:
    const threshold = this.hasActiveVisit ? 10 : 25;
    if (dist >= threshold) {
      return true;
    }

    return false;
  }

  public async stopTracking() {
    this.isTracking = false;
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }

    // Stop Native Background Location Task
    try {
      const hasStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
      if (hasStarted) {
        await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
        console.log('Native background location task stopped');
      }
    } catch (e) {
      console.warn('Error stopping native background location updates:', e);
    }

    await this.saveActiveSessionState(false, null, null);
    console.log('Stopped GPS tracking');
  }

  // Check and resume tracking on app boot / reboot if an active attendance session exists
  public async checkAndResumeTracking() {
    try {
      let raw: string | null = null;
      if (Platform.OS === 'web') {
        raw = localStorage.getItem(ACTIVE_TRACKING_KEY);
      } else {
        raw = await SecureStore.getItemAsync(ACTIVE_TRACKING_KEY);
      }

      if (raw) {
        const state = JSON.parse(raw);
        if (state && state.active && state.employeeId) {
          try {
            const attRes = await api.get('/_AIP_getTodayStatus', { params: { empOid: state.employeeId } });
            const record = attRes.data?.record;
            const isPunchedIn = !!(record && record.check_in && !record.check_out);
            if (!isPunchedIn) {
              console.log(`Officer #${state.employeeId} is not punched in for duty; skipping tracking resume.`);
              await this.stopTracking();
              return;
            }
          } catch (attErr) {
            console.warn('Warning checking attendance status before resuming GPS tracking:', attErr);
          }
          console.log(`Resuming GPS tracking for Officer #${state.employeeId} following app restart / reboot`);
          await this.startTracking(state.employeeId, state.shiftId);
        }
      }
    } catch (e) {
      console.error('Error checking active tracking session:', e);
    }
  }

  private formatLocalISO(timestamp?: number): string {
    const d = timestamp ? new Date(timestamp) : new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const year = d.getFullYear();
    const month = pad(d.getMonth() + 1);
    const day = pad(d.getDate());
    const hours = pad(d.getHours());
    const mins = pad(d.getMinutes());
    const secs = pad(d.getSeconds());
    return `${year}-${month}-${day} ${hours}:${mins}:${secs}`;
  }

  private async getBatteryLevel(): Promise<number> {
    return await getDeviceBatteryLevel();
  }

  // Handle native background location batch updates from TaskManager
  public async handleNativeBackgroundLocations(locations: Location.LocationObject[]) {
    if (!this.employeeId) {
      const session = await getUserSession();
      if (session && session.user && session.user.oid) {
        this.employeeId = Number(session.user.oid);
      }
    }

    if (!this.employeeId || !locations || locations.length === 0) return;

    const pointsToSync: GPSPoint[] = [];
    const batteryLevel = await this.getBatteryLevel();

    for (const location of locations) {
      if (!location || !location.coords) continue;
      const { latitude, longitude, accuracy, speed } = location.coords;
      const mocked = (location.coords as ExtendedLocationCoords).mocked;

      // Filter out inaccurate points (> 150m cutoff)
      if (accuracy && accuracy > 150) continue;

      const recAt = this.formatLocalISO(location.timestamp || Date.now());
      const pointId = `${this.employeeId}_${location.timestamp || Date.now()}_${latitude.toFixed(5)}_${longitude.toFixed(5)}`;

      // Sanitize speed: convert negative raw Android speed (e.g. -1.0) to 0.0
      const sanitizedSpeed = (speed !== null && speed !== undefined && speed > 0) ? speed : 0.0;

      const pt: GPSPoint = {
        point_id: pointId,
        latitude,
        longitude,
        accuracy: accuracy ?? null,
        speed: sanitizedSpeed,
        battery_level: batteryLevel,
        is_mock: !!mocked,
        recorded_at: recAt,
      };

      if (this.shouldSendPoint(pt)) {
        pointsToSync.push(pt);
        this.lastSentPoint = pt;
        this.lastSentTime = Date.now();
      }
    }

    if (pointsToSync.length > 0) {
      await this.syncGPSPoints(pointsToSync);
    }
  }

  private scheduleNextFix() {
    if (!this.isTracking) return;

    this.timerId = setTimeout(async () => {
      await this.captureAndSendLocation();
      if (this.isTracking) {
        this.scheduleNextFix();
      }
    }, this.currentIntervalMs);
  }

  private async captureAndSendLocation() {
    if (!this.employeeId) return;

    try {
      let location: Location.LocationObject | null = null;
      try {
        location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.BestForNavigation,
        });
      } catch (err) {
        console.warn('getCurrentPositionAsync BestForNavigation fix warning, checking last known position:', err);
        location = await Location.getLastKnownPositionAsync();
      }

      if (!location || !location.coords) return;

      const { latitude, longitude, accuracy, speed } = location.coords;
      const mocked = (location.coords as ExtendedLocationCoords).mocked;

      // Filter out inaccurate points (> 150m cutoff)
      if (accuracy && accuracy > 150) {
        return;
      }

      // Compute adaptive sampling interval based on speed, accuracy, and spatial movement
      this.adaptInterval(speed, accuracy, latitude, longitude);

      const recAt = this.formatLocalISO(location.timestamp || Date.now());
      const batteryLevel = await this.getBatteryLevel();
      const pointId = `${this.employeeId}_${location.timestamp || Date.now()}_${latitude.toFixed(5)}_${longitude.toFixed(5)}`;

      // Sanitize speed: convert negative raw Android speed (e.g. -1.0) to 0.0
      const sanitizedSpeed = (speed !== null && speed !== undefined && speed > 0) ? speed : 0.0;

      const pt: GPSPoint = {
        point_id: pointId,
        latitude,
        longitude,
        accuracy: accuracy ?? null,
        speed: sanitizedSpeed,
        battery_level: batteryLevel,
        is_mock: !!mocked,
        recorded_at: recAt,
      };

      this.lastLocation = location;

      if (this.shouldSendPoint(pt)) {
        this.lastSentPoint = pt;
        this.lastSentTime = Date.now();
        await this.syncGPSPoints([pt]);
      }
    } catch (err) {
      console.warn('GPS location fix error (non-blocking):', err);
    }
  }

  private adaptInterval(speed: number | null, accuracy: number | null, lat: number, lon: number) {
    const spd = speed ?? 0;
    
    let distanceMoved = 0;
    if (this.lastLocation && this.lastLocation.coords) {
      distanceMoved = this.calculateDistance(
        this.lastLocation.coords.latitude,
        this.lastLocation.coords.longitude,
        lat,
        lon
      );
    }

    if (spd > 0.5 || distanceMoved > 5.0) {
      this.currentIntervalMs = this.hasActiveVisit ? 30000 : 90000;
    } else {
      this.currentIntervalMs = 180000; // 3 minutes when stationary
    }
  }

  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000;
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  // Sync points with backend, with offline fallback queue and duplicate prevention
  public async syncGPSPoints(newPoints: GPSPoint[]) {
    if (!this.employeeId) return;

    if (this.isSyncing) {
      // Queue these new points for the next sync cycle
      await this.saveOfflineQueue([...await this.getOfflineQueue(), ...newPoints]);
      return;
    }

    this.isSyncing = true;
    try {
      // Load existing offline queue
      const queuedPoints = await this.getOfflineQueue();

      // Deduplicate by point_id or (latitude, longitude, recorded_at)
      const combined = [...queuedPoints, ...newPoints];
      const uniquePointsMap = new Map<string, GPSPoint>();

      combined.forEach((pt) => {
        const key = pt.point_id || `${pt.latitude}_${pt.longitude}_${pt.recorded_at}`;
        if (!uniquePointsMap.has(key)) {
          uniquePointsMap.set(key, pt);
        }
      });

      const allPoints = Array.from(uniquePointsMap.values());
      if (allPoints.length === 0) {
        this.isSyncing = false;
        return;
      }

      const response = await api.post('/gps/ingest', {
        employee_id: this.employeeId,
        shift_id: this.shiftId,
        points: allPoints,
      });

      if (response.data && response.data.success) {
        await this.clearOfflineQueue();
        if (response.data.punched_in === false) {
          console.log('Officer is not currently punched in for duty; stopping mobile location tracking.');
          await this.stopTracking();
        }
      } else {
        await this.saveOfflineQueue(allPoints);
      }
    } catch (err) {
      await this.saveOfflineQueue([...await this.getOfflineQueue(), ...newPoints]);
    } finally {
      this.isSyncing = false;
    }
  }

  private async saveActiveSessionState(active: boolean, employeeId: number | null, shiftId: number | null) {
    try {
      const payload = JSON.stringify({ active, employeeId, shiftId, updatedAt: new Date().toISOString() });
      if (Platform.OS === 'web') {
        localStorage.setItem(ACTIVE_TRACKING_KEY, payload);
      } else {
        await SecureStore.setItemAsync(ACTIVE_TRACKING_KEY, payload);
      }
    } catch (e) {
      console.error('Error saving active session state:', e);
    }
  }

  private async getOfflineQueue(): Promise<GPSPoint[]> {
    try {
      let raw: string | null = null;
      if (Platform.OS === 'web') {
        raw = localStorage.getItem(OFFLINE_GPS_KEY);
      } else {
        const fileUri = `${FileSystem.documentDirectory}${OFFLINE_GPS_KEY}.json`;
        const fileInfo = await FileSystem.getInfoAsync(fileUri);
        if (fileInfo.exists) {
          raw = await FileSystem.readAsStringAsync(fileUri);
        } else {
          raw = await SecureStore.getItemAsync(OFFLINE_GPS_KEY);
        }
      }
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  private async saveOfflineQueue(points: GPSPoint[]) {
    try {
      const trimmed = points.slice(-500);
      const payload = JSON.stringify(trimmed);
      if (Platform.OS === 'web') {
        localStorage.setItem(OFFLINE_GPS_KEY, payload);
      } else {
        if (payload.length > 1800) {
          const fileUri = `${FileSystem.documentDirectory}${OFFLINE_GPS_KEY}.json`;
          await FileSystem.writeAsStringAsync(fileUri, payload);
        } else {
          await SecureStore.setItemAsync(OFFLINE_GPS_KEY, payload);
        }
      }
    } catch (e) {
      console.error('Error saving offline GPS queue:', e);
    }
  }

  private async clearOfflineQueue() {
    try {
      if (Platform.OS === 'web') {
        localStorage.removeItem(OFFLINE_GPS_KEY);
      } else {
        const fileUri = `${FileSystem.documentDirectory}${OFFLINE_GPS_KEY}.json`;
        const fileInfo = await FileSystem.getInfoAsync(fileUri);
        if (fileInfo.exists) {
          await FileSystem.deleteAsync(fileUri, { idempotent: true });
        }
        await SecureStore.deleteItemAsync(OFFLINE_GPS_KEY);
      }
    } catch (e) {
      console.error('Error clearing offline GPS queue:', e);
    }
  }
}

export const gpsTracker = new MobileGPSTracker();

// Define TaskManager task for Native Background Location Execution
TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }: { data: any; error: any }) => {
  if (error) {
    console.warn('FO background location task error:', error);
    return;
  }
  if (data) {
    const { locations } = data;
    if (locations && locations.length > 0) {
      await gpsTracker.handleNativeBackgroundLocations(locations);
    }
  }
});

export default gpsTracker;
