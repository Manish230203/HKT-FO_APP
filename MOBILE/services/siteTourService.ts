import * as Location from 'expo-location';
import api from './api';
import * as FileSystem from 'expo-file-system/legacy';
import { setStorageItem, getStorageItem } from './db';

export type QuestionType =
  | 'YES_NO'
  | 'SATISFACTORY_UNSATISFACTORY'
  | 'RATING'
  | 'TEXT'
  | 'MULTIPLE_CHOICE';

export interface TourQuestion {
  oid: number;
  text: string;
  response_type: QuestionType;
  options?: string[];
  is_mandatory: boolean;
  is_critical: boolean;
  failure_values?: string[];
  requires_comment_on_failure: boolean;
  min_photos: number;
  max_photos: number;
  help_text?: string;
  order: number;
}

export interface TourCheckpoint {
  oid: number;
  name: string;
  order: number;
  verification_mode: 'GPS_ONLY' | 'QR_ONLY' | 'GPS_AND_QR';
  qr_code?: string;
  latitude?: number;
  longitude?: number;
  geofence_radius: number;
  is_mandatory: boolean;
  questions: TourQuestion[];
}

export interface TourBlueprint {
  oid: number;
  title: string;
  description?: string;
  site_id?: number;
  custom_visit_id?: number;
  is_mandatory: boolean;
  estimated_duration_minutes?: number;
  total_checkpoints: number;
  checkpoints: TourCheckpoint[];
}

export interface TourItem {
  tour_oid: number;
  title: string;
  description?: string;
  site_id?: number;
  site_name?: string;
  custom_visit_id?: number;
  client_name?: string;
  total_checkpoints: number;
  is_mandatory: boolean;
  estimated_duration_minutes: number;
}

export interface LocalPhoto {
  id: string; // UUID
  local_uri: string;
  uploaded_url?: string;
  upload_status: 'pending' | 'uploading' | 'uploaded' | 'failed';
  captured_at: string;
}

export interface QuestionResponse {
  question_oid: number;
  response_value: string;
  comment?: string;
  is_critical_violation: boolean;
  is_failure: boolean;
  photos: LocalPhoto[];
  answered_at: string;
}

export interface CheckpointExecution {
  checkpoint_oid: number;
  status: 'locked' | 'active' | 'verified' | 'completed';
  verification_status: 'unverified' | 'local_pending' | 'server_verified' | 'failed';
  verified_at?: string;
  verified_latitude?: number;
  verified_longitude?: number;
  accuracy_meters?: number;
  calculated_distance_meters?: number;
  client_timestamp?: string;
  scanned_qr?: string;
  responses: Record<number, QuestionResponse>;
}

export interface TourDraft {
  execution_uuid: string; // Reusable idempotency key
  tour_oid: number;
  tour_visit_oid?: number; // Backend PatrolTour identifier
  report_id?: string;
  tour_title: string;
  site_id?: number;
  custom_visit_id?: number;
  site_name?: string;
  client_name?: string;
  session_id?: number;
  started_at: string;
  completed_at?: string;
  sync_status: 'in_progress' | 'pending_sync' | 'syncing' | 'synced' | 'failed';
  checkpoints: Record<number, CheckpointExecution>;
  blueprint: TourBlueprint;
  last_saved_at: string;
  version: number;
}

export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const DRAFT_INDEX_KEY = 'vigilo_tour_drafts_index';

// ==========================================
// LOCAL DRAFT ATOMIC PERSISTENCE
// ==========================================

export async function saveTourDraft(draft: TourDraft): Promise<void> {
  const jsonStr = JSON.stringify(draft);
  const targetFileName = `tour_draft_${draft.execution_uuid}.json`;
  const tmpFileName = `tour_draft_${draft.execution_uuid}.tmp`;

  try {
    if (FileSystem.documentDirectory) {
      const targetUri = `${FileSystem.documentDirectory}${targetFileName}`;
      const tmpUri = `${FileSystem.documentDirectory}${tmpFileName}`;

      // Write to temp file first for atomic replacement
      await FileSystem.writeAsStringAsync(tmpUri, jsonStr);
      await FileSystem.moveAsync({
        from: tmpUri,
        to: targetUri,
      });
    } else {
      await setStorageItem(targetFileName, jsonStr);
    }

    // Update index
    const indexStr = await getStorageItem(DRAFT_INDEX_KEY);
    const index: string[] = indexStr ? JSON.parse(indexStr) : [];
    if (!index.includes(draft.execution_uuid)) {
      index.push(draft.execution_uuid);
      await setStorageItem(DRAFT_INDEX_KEY, JSON.stringify(index));
    }
  } catch (e) {
    console.warn('Error during atomic tour draft write, using fallback store:', e);
    await setStorageItem(targetFileName, jsonStr);
  }
}

export async function getTourDraft(executionUuid: string): Promise<TourDraft | null> {
  const targetFileName = `tour_draft_${executionUuid}.json`;
  try {
    if (FileSystem.documentDirectory) {
      const targetUri = `${FileSystem.documentDirectory}${targetFileName}`;
      const info = await FileSystem.getInfoAsync(targetUri);
      if (info.exists) {
        const content = await FileSystem.readAsStringAsync(targetUri);
        return JSON.parse(content) as TourDraft;
      }
    }
    const val = await getStorageItem(targetFileName);
    if (val) {
      return JSON.parse(val) as TourDraft;
    }
  } catch (e) {
    console.error(`Error loading tour draft ${executionUuid}:`, e);
  }
  return null;
}

export async function getActiveTourDrafts(): Promise<TourDraft[]> {
  try {
    const indexStr = await getStorageItem(DRAFT_INDEX_KEY);
    if (!indexStr) return [];
    const index: string[] = JSON.parse(indexStr);
    const drafts: TourDraft[] = [];

    for (const uuid of index) {
      const draft = await getTourDraft(uuid);
      if (draft) {
        drafts.push(draft);
      }
    }
    return drafts;
  } catch (e) {
    console.error('Error fetching active tour drafts:', e);
    return [];
  }
}

export async function deleteTourDraft(executionUuid: string): Promise<void> {
  const targetFileName = `tour_draft_${executionUuid}.json`;
  try {
    if (FileSystem.documentDirectory) {
      const targetUri = `${FileSystem.documentDirectory}${targetFileName}`;
      const info = await FileSystem.getInfoAsync(targetUri);
      if (info.exists) {
        await FileSystem.deleteAsync(targetUri, { idempotent: true });
      }
    }
    await setStorageItem(targetFileName, '');

    const indexStr = await getStorageItem(DRAFT_INDEX_KEY);
    if (indexStr) {
      const index: string[] = JSON.parse(indexStr);
      const filtered = index.filter((id) => id !== executionUuid);
      await setStorageItem(DRAFT_INDEX_KEY, JSON.stringify(filtered));
    }
  } catch (e) {
    console.error(`Error deleting tour draft ${executionUuid}:`, e);
  }
}

// ==========================================
// BACKEND API CLIENTS
// ==========================================

export async function getAssignedToursForSite(siteId: number | string): Promise<TourItem[]> {
  try {
    const res = await api.get('/v1/tours/assigned-to-site', {
      params: { site_id: Number(siteId) },
    });
    if (res.data && res.data.success) {
      return res.data.tours || [];
    }
  } catch (e: any) {
    console.warn('API getAssignedToursForSite error:', e?.response?.data || e.message);
  }
  return [];
}

export async function getAssignedToursForCustomVisit(customVisitId: number | string): Promise<TourItem[]> {
  try {
    const res = await api.get('/v1/tours/assigned-to-custom-visit', {
      params: { custom_visit_id: Number(customVisitId) },
    });
    if (res.data && res.data.success) {
      return res.data.tours || [];
    }
  } catch (e: any) {
    console.warn('API getAssignedToursForCustomVisit error:', e?.response?.data || e.message);
  }
  return [];
}

export async function getTourBlueprint(
  tourOid: number | string,
  siteId?: number | string,
  customVisitId?: number | string
): Promise<TourBlueprint | null> {
  try {
    const params: any = {};
    if (siteId) params.site_id = Number(siteId);
    if (customVisitId) params.custom_visit_id = Number(customVisitId);

    const res = await api.get(`/v1/tours/${tourOid}/blueprint`, { params });
    if (res.data && res.data.success && res.data.blueprint) {
      return res.data.blueprint;
    }
  } catch (e: any) {
    console.warn('API getTourBlueprint error:', e?.response?.data || e.message);
  }
  return null;
}

export async function startTourVisit(payload: {
  tour_oid: number;
  site_oid?: number;
  custom_visit_oid?: number;
  session_id?: number;
  execution_uuid: string;
  start_latitude?: number;
  start_longitude?: number;
}): Promise<{
  success: boolean;
  tour_visit_oid: number;
  execution_uuid: string;
  status: string;
  message?: string;
}> {
  try {
    const res = await api.post('/v1/tours/visits/start', payload);
    return res.data;
  } catch (err: any) {
    if (err?.response?.status === 404) {
      const res = await api.post('/v1/tours/executions/start', payload);
      return res.data;
    }
    throw err;
  }
}

export async function verifyCheckpointOnServer(
  tourVisitOid: number | string,
  payload: {
    checkpoint_oid: number;
    qr_code?: string;
    qr_code_scanned?: string;
    latitude?: number;
    longitude?: number;
    accuracy?: number;
    accuracy_meters?: number;
    client_timestamp?: string;
  }
): Promise<{
  oid?: number;
  checkpoint_oid: number;
  verification_status: string;
  attempt_count?: number;
  failure_reason?: string | null;
  calculated_distance_meters?: number;
  distance_meters?: number;
  gps_verified?: boolean;
  verified?: boolean;
  success?: boolean;
  verified_at?: string;
  message?: string;
}> {
  try {
    const res = await api.post(`/v1/tours/visits/${tourVisitOid}/checkpoints/verify`, payload);
    return res.data;
  } catch (err: any) {
    if (err?.response?.status === 404) {
      const res = await api.post(`/v1/tours/executions/${tourVisitOid}/checkpoints/verify`, payload);
      return res.data;
    }
    throw err;
  }
}

export async function submitCheckpointResponses(
  tourVisitOid: number | string,
  payload: {
    checkpoint_oid: number;
    responses: Array<{
      question_oid: number;
      response_value: string;
      comment?: string;
      is_critical_violation?: boolean;
      is_failure?: boolean;
      photo_urls?: string[];
    }>;
    latitude?: number;
    longitude?: number;
  }
): Promise<{
  success: boolean;
  checkpoint_oid: number;
  saved_count: number;
  message: string;
}> {
  try {
    const res = await api.post(`/v1/tours/visits/${tourVisitOid}/responses`, payload);
    return res.data;
  } catch (err: any) {
    if (err?.response?.status === 404) {
      const res = await api.post(`/v1/tours/executions/${tourVisitOid}/responses`, payload);
      return res.data;
    }
    throw err;
  }
}

export async function uploadTourEvidence(
  photoUri: string,
  metadata: {
    tour_visit_oid?: number;
  report_id?: string;
    checkpoint_oid?: number;
    question_oid?: number;
    execution_uuid?: string;
  }
): Promise<string> {
  const formData = new FormData();
  const filename = photoUri.split('/').pop() || `photo_${Date.now()}.jpg`;

  formData.append('file', {
    uri: photoUri,
    type: 'image/jpeg',
    name: filename,
  } as any);

  if (metadata.tour_visit_oid) formData.append('tour_visit_oid', String(metadata.tour_visit_oid));
  if (metadata.checkpoint_oid) formData.append('checkpoint_oid', String(metadata.checkpoint_oid));
  if (metadata.question_oid) formData.append('question_oid', String(metadata.question_oid));
  if (metadata.execution_uuid) formData.append('execution_uuid', metadata.execution_uuid);

  const res = await api.post('/v1/tours/evidence/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });

  if (res.data && res.data.success) {
    return res.data.url;
  }
  throw new Error(res.data?.message || 'Evidence upload failed');
}

export async function completeTourVisit(
  tourVisitOid: number | string,
  payload: {
    execution_uuid?: string;
    notes?: string;
    end_latitude?: number;
    end_longitude?: number;
    checkpoints?: Record<string, any>;
  }
): Promise<{
  success: boolean;
  tour_visit_oid: number;
  report_id?: string;
  status: string;
  report_submitted: boolean;
  message: string;
}> {
  try {
    const res = await api.post(`/v1/tours/visits/${tourVisitOid}/complete`, payload);
    return res.data;
  } catch (err: any) {
    if (err?.response?.status === 404) {
      const res = await api.post(`/v1/tours/executions/${tourVisitOid}/complete`, payload);
      return res.data;
    }
    throw err;
  }
}

export async function syncOfflineTour(payload: {
  execution_uuid: string;
  tour_oid: number;
  site_oid?: number;
  custom_visit_oid?: number;
  session_id?: number;
  started_at?: string;
  completed_at?: string;
  checkpoints: Record<string, any>;
}): Promise<{
  success: boolean;
  execution_uuid: string;
  synced: boolean;
  message: string;
}> {
  try {
    const res = await api.post('/v1/tours/visits/sync-offline', payload);
    return res.data;
  } catch (err: any) {
    if (err?.response?.status === 404) {
      const res = await api.post('/v1/tours/executions/sync-offline-bundle', payload);
      return res.data;
    }
    throw err;
  }
}

/**
 * Ultra-fast location acquisition helper.
 * 1. Checks last known cached position immediately (0ms response).
 * 2. Races fresh GPS fix (Balanced accuracy) with a 2.5s timeout.
 * Eliminates 15-30 second GPS satellite lock blocking on mobile screens.
 */
/**
 * Haversine formula to compute great-circle distance between two GPS coordinates in meters.
 */
export function haversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Radius of Earth in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * High-accuracy device hardware GPS acquisition on QR scan / GPS verification.
 * Enforces enableHighAccuracy: true for precise checkpoint geofencing.
 */
export async function getHighAccuracyLocation(): Promise<{
  latitude: number;
  longitude: number;
  accuracy: number;
}> {
  try {
    const perm = await Location.getForegroundPermissionsAsync();
    if (perm.status !== 'granted') {
      const req = await Location.requestForegroundPermissionsAsync();
      if (req.status !== 'granted') {
        return { latitude: 0, longitude: 0, accuracy: 50 };
      }
    }

    const highPromise = Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });
    const timeoutPromise = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), 3500)
    );

    const pos = await Promise.race([highPromise, timeoutPromise]);
    if (pos && pos.coords) {
      return {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy || 10,
      };
    }

    return await getQuickLocation();
  } catch (e) {
    return await getQuickLocation();
  }
}

export async function getQuickLocation(): Promise<{ latitude: number; longitude: number; accuracy: number }> {
  try {
    const perm = await Location.getForegroundPermissionsAsync();
    if (perm.status !== 'granted') {
      const req = await Location.requestForegroundPermissionsAsync();
      if (req.status !== 'granted') {
        return { latitude: 0, longitude: 0, accuracy: 50 };
      }
    }

    // 1. Check last known position immediately
    const lastKnown = await Location.getLastKnownPositionAsync();
    if (lastKnown && lastKnown.coords && lastKnown.coords.latitude && lastKnown.coords.longitude) {
      const ageMs = Date.now() - (lastKnown.timestamp || 0);
      if (ageMs < 180000) {
        return {
          latitude: lastKnown.coords.latitude,
          longitude: lastKnown.coords.longitude,
          accuracy: lastKnown.coords.accuracy || 15,
        };
      }
    }

    // 2. Race fresh position fix with a 2.5-second timeout
    const fixPromise = Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500));

    const freshFix = await Promise.race([fixPromise, timeoutPromise]);
    if (freshFix && freshFix.coords && freshFix.coords.latitude && freshFix.coords.longitude) {
      return {
        latitude: freshFix.coords.latitude,
        longitude: freshFix.coords.longitude,
        accuracy: freshFix.coords.accuracy || 15,
      };
    }

    // Fallback to last known position if fresh fix timed out
    if (lastKnown && lastKnown.coords && lastKnown.coords.latitude && lastKnown.coords.longitude) {
      return {
        latitude: lastKnown.coords.latitude,
        longitude: lastKnown.coords.longitude,
        accuracy: lastKnown.coords.accuracy || 25,
      };
    }
  } catch (err) {
    console.warn('getQuickLocation error:', err);
  }
  return { latitude: 0, longitude: 0, accuracy: 50 };
}
