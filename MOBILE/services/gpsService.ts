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

// Hard Accuracy Cutoff: Discard readings with accuracy > 40.0m (Cell tower/Wi-Fi guesses & inaccurate indoor spikes)
const ACCURACY_CUTOFF_METERS = 40.0;

// Batch Upload Settings: 4 points every 60 seconds (15s x 4 = 60s)
const BATCH_SIZE_THRESHOLD = 4;
const BATCH_TIME_THRESHOLD_MS = 60000;

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
  private batchFlushTimerId: any = null;
  private employeeId: number | null = null;
  private shiftId: number | null = null;
  private lastLocation: Location.LocationObject | null = null;
  private currentIntervalMs: number = 15000; // 15 seconds desired interval
  private lastSentPoint: GPSPoint | null = null;
  private lastSentTime: number = 0;
  private lastBatchFlushTime: number = 0;
  private hasActiveVisit: boolean = false;
  private isSyncing: boolean = false;

  // Immediate One-Shot High-Accuracy Fix for Punch In, Punch Out, Site Check-In, Site Check-Out
  public async triggerOneShotFix(eventTag: string = 'IMMEDIATE_FIX') {
    if (!this.employeeId) {
      const session = await getUserSession();
      if (session && session.user && session.user.oid) {
        this.employeeId = Number(session.user.oid);
      }
    }
    if (!this.employeeId) return;

    try {
      console.log(`[gpsTracker] Capturing immediate one-shot high-accuracy GPS fix (${eventTag}) for officer #${this.employeeId}...`);
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.BestForNavigation,
      });

      if (!location || !location.coords) return;
      const { latitude, longitude, accuracy, speed } = location.coords;
      const mocked = (location.coords as ExtendedLocationCoords).mocked;

      if (accuracy !== null && accuracy !== undefined && accuracy > ACCURACY_CUTOFF_METERS) {
        console.log(`[gpsTracker] One-shot fix (${eventTag}) discarded due to low accuracy (${accuracy.toFixed(1)}m > ${ACCURACY_CUTOFF_METERS}m)`);
        return;
      }

      const recAt = this.formatLocalISO(location.timestamp || Date.now());
      const batteryLevel = await this.getBatteryLevel();
      const pointId = `${this.employeeId}_${location.timestamp || Date.now()}_${latitude.toFixed(5)}_${longitude.toFixed(5)}_${eventTag}`;
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

      this.lastSentPoint = pt;
      this.lastSentTime = Date.now();
      await this.bufferAndSyncPoints([pt]);
      await this.flushBatchQueue();
      console.log(`[gpsTracker] Immediate one-shot GPS fix (${eventTag}) sent to server successfully.`);
    } catch (err) {
      console.warn(`[gpsTracker] One-shot GPS fix warning (${eventTag}):`, err);
    }
  }

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

    console.log(`[gpsTracker] Starting Native Background GPS tracking for Officer #${this.employeeId}. Active Visit: ${this.hasActiveVisit}`);

    // Persist active tracking state for device reboot / app restart recovery
    await this.saveActiveSessionState(true, this.employeeId, this.shiftId);

    // 1. Request foreground and background location permissions & Enable High-Accuracy Provider
    try {
      if (Platform.OS === 'android') {
        try {
          await Location.enableNetworkProviderAsync();
        } catch (netErr) {
          console.warn('[gpsTracker] Network provider enable warning:', netErr);
        }
      }

      const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
      if (fgStatus === 'granted') {
        try {
          const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
          if (bgStatus !== 'granted') {
            console.warn('[gpsTracker] Background location permission not granted; tracking might pause when screen locked');
          }
        } catch (bgPermErr) {
          console.warn('[gpsTracker] Background location permission request error:', bgPermErr);
        }
      } else {
        console.warn('[gpsTracker] Foreground location permission denied');
      }
    } catch (e) {
      console.warn('[gpsTracker] Error requesting location permissions:', e);
    }

    // 2. Trigger immediate one-shot high-accuracy fix for Punch In event
    this.triggerOneShotFix('PUNCH_IN').catch(err => console.warn('[gpsTracker] Punch In one-shot fix error:', err));

    // 3. Register Native Expo Background Location Task with BestForNavigation high accuracy & 25m displacement rule
    try {
      await this.updateTrackingConfiguration(this.hasActiveVisit);
    } catch (bgTaskErr) {
      console.warn('[gpsTracker] Native background location registration error (falling back to JS timer):', bgTaskErr);
    }

    // 4. Fallback / Foreground timer cycle
    if (!this.timerId) {
      this.scheduleNextFix();
    }

    // 5. Start batch flush timer (every 60 seconds)
    this.startBatchFlushTimer();
  }

  public async updateTrackingConfiguration(hasActiveVisit: boolean) {
    this.hasActiveVisit = hasActiveVisit;
    if (!this.employeeId || !this.isTracking) return;

    try {
      // 1. Movement-Based GPS (Displacement Rule)
      // Desired Interval: 15s (15000ms)
      // Smallest Displacement: 25 meters (10 meters during active site visit)
      const distanceThreshold = this.hasActiveVisit ? 10 : 25;
      
      const config = {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 15000, // 15s desired interval
        distanceInterval: distanceThreshold, // 25m smallest displacement rule
        showsBackgroundLocationIndicator: true,
        pausesUpdatesAutomatically: false,
        activityType: Location.ActivityType.AutomotiveNavigation,
        foregroundService: {
          notificationTitle: 'VIGILO-O Duty Active',
          notificationBody: 'Location tracking is active for officer verification.',
          notificationColor: '#00599B',
          killServiceOnDestroy: false,
        },
      };

      await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, config);
      console.log(`[gpsTracker] Native background location task configured. Displacement: ${distanceThreshold}m, Interval: 15s, Accuracy: BestForNavigation`);
    } catch (e) {
      console.warn('[gpsTracker] Error updating native background location config:', e);
    }
  }

  // Displacement & Heartbeat Filter Check
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

    // Heartbeat check: When stationary / dwelling, send lightweight heartbeat ping every 75 seconds (60-90s threshold)
    if (timeDiffMs >= 75000) {
      console.log('[gpsTracker] Stationary Heartbeat trigger (75s): Officer active & online, recording heartbeat ping.');
      return true;
    }

    // Displacement threshold rule: 25 meters when travelling, 10 meters when in site visit
    const threshold = this.hasActiveVisit ? 10 : 25;
    if (dist >= threshold) {
      return true;
    }

    return false;
  }

  public async stopTracking() {
    // Trigger immediate one-shot high-accuracy fix for Punch Out event before stopping hardware
    try {
      await this.triggerOneShotFix('PUNCH_OUT');
    } catch (e) {
      console.warn('[gpsTracker] Punch Out one-shot fix error:', e);
    }

    this.isTracking = false;
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }

    if (this.batchFlushTimerId) {
      clearInterval(this.batchFlushTimerId);
      this.batchFlushTimerId = null;
    }

    // Stop Native Background Location Task & Release GPS Hardware
    try {
      const hasStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
      if (hasStarted) {
        await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
        console.log('[gpsTracker] Native background location task and GPS hardware stopped completely.');
      }
    } catch (e) {
      console.warn('[gpsTracker] Error stopping native background location updates:', e);
    }

    await this.saveActiveSessionState(false, null, null);
    console.log('[gpsTracker] Stopped GPS tracking on Punch Out / Duty End');
  }

  // Check and resume tracking on app boot / reboot ONLY IF punched in
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
              console.log(`[gpsTracker] Officer #${state.employeeId} is not punched in for duty; skipping tracking resume.`);
              await this.stopTracking();
              return;
            }
          } catch (attErr) {
            console.warn('[gpsTracker] Warning checking attendance status before resuming GPS tracking:', attErr);
          }
          console.log(`[gpsTracker] Resuming GPS tracking for Officer #${state.employeeId} following app restart / reboot`);
          await this.startTracking(state.employeeId, state.shiftId);
        }
      }
    } catch (e) {
      console.error('[gpsTracker] Error checking active tracking session:', e);
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

    const pointsToBuffer: GPSPoint[] = [];
    const batteryLevel = await this.getBatteryLevel();

    for (const location of locations) {
      if (!location || !location.coords) continue;
      const { latitude, longitude, accuracy, speed } = location.coords;
      const mocked = (location.coords as ExtendedLocationCoords).mocked;

      // 2. Hard Accuracy Cutoff (Drop Cell Tower Guesses)
      // Discard any reading with accuracy > 35.0m
      if (accuracy !== null && accuracy !== undefined && accuracy > ACCURACY_CUTOFF_METERS) {
        console.log(`[gpsTracker] Discarding cell tower guess reading: accuracy ${accuracy.toFixed(1)}m > ${ACCURACY_CUTOFF_METERS}m cutoff`);
        continue;
      }

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
        pointsToBuffer.push(pt);
        this.lastSentPoint = pt;
        this.lastSentTime = Date.now();
      }
    }

    if (pointsToBuffer.length > 0) {
      await this.bufferAndSyncPoints(pointsToBuffer);
    }
  }

  private lastViolationReportTime = 0;

  public async reportLocationViolation(details?: string, eventType = 'DUTY_LOCATION_OFF_VIOLATION') {
    if (!this.employeeId) {
      const session = await getUserSession();
      if (session && session.user && session.user.oid) {
        this.employeeId = Number(session.user.oid);
      }
    }
    if (!this.employeeId) return;

    if (eventType === 'DUTY_LOCATION_OFF_VIOLATION' && Date.now() - this.lastViolationReportTime < 45000) return;
    if (eventType === 'DUTY_LOCATION_OFF_VIOLATION') {
      this.lastViolationReportTime = Date.now();
    }

    try {
      const nowIso = new Date().toISOString().replace('T', ' ').substring(0, 19);
      console.log(`[gpsTracker] Reporting duty location violation (${eventType}) for officer #${this.employeeId}...`);
      await api.post('/attendance/location-violation', {
        employee_id: this.employeeId,
        event_type: eventType,
        details: details || 'Field officer turned off Location (GPS) during active duty shift',
        timestamp: nowIso,
        location_off_at: eventType === 'DUTY_LOCATION_OFF_VIOLATION' ? nowIso : undefined,
        location_restored_at: eventType === 'DUTY_LOCATION_RESTORED' ? nowIso : undefined,
      });
      console.log('[gpsTracker] Duty location violation reported to backend successfully');
    } catch (err) {
      console.warn('[gpsTracker] Error reporting location violation:', err);
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
      // 1. Check if location services (GPS) are enabled on device
      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!servicesEnabled) {
        console.warn('[gpsTracker] GPS location services disabled during active shift!');
        await this.reportLocationViolation('Field officer turned off Location (GPS) during active duty shift');
        return;
      }

      let location: Location.LocationObject | null = null;
      try {
        location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.BestForNavigation,
        });
      } catch (err) {
        console.warn('[gpsTracker] getCurrentPositionAsync BestForNavigation fix warning:', err);
        const checkServices = await Location.hasServicesEnabledAsync();
        if (!checkServices) {
          console.warn('[gpsTracker] GPS turned off during position fix attempt');
          await this.reportLocationViolation('Field officer turned off Location (GPS) during active duty shift');
          return;
        }
        location = await Location.getLastKnownPositionAsync();
      }

      if (!location || !location.coords) return;

      const { latitude, longitude, accuracy, speed } = location.coords;
      const mocked = (location.coords as ExtendedLocationCoords).mocked;

      // 2. Hard Accuracy Cutoff (Drop Cell Tower Guesses)
      // Discard any reading with accuracy > 35.0m
      if (accuracy !== null && accuracy !== undefined && accuracy > ACCURACY_CUTOFF_METERS) {
        console.log(`[gpsTracker] Discarding inaccurate location reading (${accuracy.toFixed(1)}m > ${ACCURACY_CUTOFF_METERS}m cutoff)`);
        return;
      }

      const recAt = this.formatLocalISO(location.timestamp || Date.now());
      const batteryLevel = await this.getBatteryLevel();
      const pointId = `${this.employeeId}_${location.timestamp || Date.now()}_${latitude.toFixed(5)}_${longitude.toFixed(5)}`;

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
        await this.bufferAndSyncPoints([pt]);
      }
    } catch (err) {
      console.warn('[gpsTracker] GPS location fix error (non-blocking):', err);
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

  // 3. Batch Uploading Logic
  // Append 15-second GPS points to local queue, and upload a batch of 4 points every 60 seconds
  private async bufferAndSyncPoints(newPoints: GPSPoint[]) {
    const currentQueue = await this.getOfflineQueue();

    // Deduplicate points by point_id or lat_lng_timestamp
    const uniqueMap = new Map<string, GPSPoint>();
    [...currentQueue, ...newPoints].forEach(pt => {
      const key = pt.point_id || `${pt.latitude}_${pt.longitude}_${pt.recorded_at}`;
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, pt);
      }
    });

    const updatedQueue = Array.from(uniqueMap.values());
    await this.saveOfflineQueue(updatedQueue);

    const timeSinceLastFlush = Date.now() - this.lastBatchFlushTime;

    // Flush batch if buffer size >= 4 points OR 60 seconds elapsed
    if (updatedQueue.length >= BATCH_SIZE_THRESHOLD || timeSinceLastFlush >= BATCH_TIME_THRESHOLD_MS) {
      await this.flushBatchQueue();
    }
  }

  private startBatchFlushTimer() {
    if (this.batchFlushTimerId) clearInterval(this.batchFlushTimerId);
    this.batchFlushTimerId = setInterval(async () => {
      if (!this.isTracking) return;
      const queue = await this.getOfflineQueue();
      if (queue.length > 0) {
        console.log(`[gpsTracker] 60s batch timer triggered. Flushing ${queue.length} points to backend...`);
        await this.flushBatchQueue();
      }
    }, BATCH_TIME_THRESHOLD_MS);
  }

  public async flushBatchQueue() {
    if (!this.employeeId || this.isSyncing) return;

    const MAX_OFFLINE_CHUNK_SIZE = 40;
    this.isSyncing = true;
    try {
      let queue = await this.getOfflineQueue();
      if (queue.length === 0) {
        this.isSyncing = false;
        return;
      }

      // Chunk offline queue into max 40 points per HTTP POST to prevent payload timeouts
      while (queue.length > 0 && this.isTracking) {
        const chunk = queue.slice(0, MAX_OFFLINE_CHUNK_SIZE);
        console.log(`[gpsTracker] Batch Uploading ${chunk.length} GPS points (total queue: ${queue.length})...`);

        const response = await api.post('/gps/ingest', {
          employee_id: this.employeeId,
          shift_id: this.shiftId,
          points: chunk,
        });

        if (response.data && response.data.success) {
          console.log(`[gpsTracker] Batch upload chunk successful (${chunk.length} points).`);
          queue = queue.slice(chunk.length);
          await this.saveOfflineQueue(queue);
          this.lastBatchFlushTime = Date.now();

          if (response.data.punched_in === false) {
            console.log('[gpsTracker] Officer is not currently punched in for duty; stopping mobile location tracking.');
            await this.stopTracking();
            break;
          }
        } else {
          console.warn('[gpsTracker] Batch upload response error, retaining queue.');
          break;
        }
      }
    } catch (err) {
      console.warn('[gpsTracker] Batch upload network/server error, retaining points in offline queue:', err);
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
      console.error('[gpsTracker] Error saving active session state:', e);
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
      console.error('[gpsTracker] Error saving offline GPS queue:', e);
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
      console.error('[gpsTracker] Error clearing offline GPS queue:', e);
    }
  }
}

export const gpsTracker = new MobileGPSTracker();

// Define TaskManager task for Native Background Location Execution
TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }: { data: any; error: any }) => {
  if (error) {
    console.warn('[gpsTracker] FO background location task error:', error);
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
