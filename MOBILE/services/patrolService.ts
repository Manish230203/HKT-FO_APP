import api from './api';

export interface PatrolTourItem {
  tour_name: string;
  description: string;
  total_checkpoints: number;
  completed_checkpoints: number;
  status: 'available' | 'ongoing' | 'forwarded' | 'busy' | 'completed';
  is_active_for_me: boolean;
  active_runner_name?: string | null;
  tour_id?: number | null;
  site_id: number;
  site_name: string;
}

export interface CheckpointItem {
  checkpoint_id: number;
  name: string;
  order: number;
  latitude?: number | null;
  longitude?: number | null;
  radius?: number | null;
  qr_code?: string;
  status: 'completed' | 'active' | 'locked';
  is_completed: boolean;
  is_active: boolean;
  is_locked: boolean;
  scanned_at?: string | null;
  completion_time?: string | null;
  gps_verified: boolean;
  gps_status_text?: string | null;
  lock_reason?: string | null;
  checklist_id?: number | null;
  checklist_title?: string;
  supports_handover?: boolean;
}

export interface TourDetailResponse {
  success: boolean;
  tour_name: string;
  total_checkpoints: number;
  completed_checkpoints: number;
  all_completed: boolean;
  active_tour_id?: number | null;
  checkpoints: CheckpointItem[];
}

export interface ChecklistQuestion {
  link_id?: number;
  question_id: number;
  text: string;
  response_type: string;
  requires_photo: boolean;
  is_critical: boolean;
  default_answer: string;
}

export interface SiteGuard {
  id: number;
  name: string;
  emp_code: string;
  role: string;
}

export async function getPatrolTours(empOid: number, siteId?: number): Promise<{
  success: boolean;
  site_id: number;
  site_name: string;
  active_tour: any;
  tours: PatrolTourItem[];
}> {
  const params: any = { empOid };
  if (siteId) params.site_id = siteId;
  const res = await api.get('/mobile/patrol/tours', { params });
  return res.data;
}

export async function startPatrolTour(empOid: number, tourName: string): Promise<{
  success: boolean;
  message: string;
  tour_id: number;
}> {
  const res = await api.post(`/mobile/patrol/tour/start?tour_name=${encodeURIComponent(tourName)}&empOid=${empOid}`);
  return res.data;
}

export async function getTourCheckpoints(tourName: string, empOid: number, siteId?: number): Promise<TourDetailResponse> {
  const params: any = { tour_name: tourName, empOid };
  if (siteId) params.site_id = siteId;
  const res = await api.get('/mobile/patrol/tour/checkpoints', { params });
  return res.data;
}

export async function verifyCheckpointQr(data: {
  qrCode: string;
  checkpointId: number;
  tourName: string;
  latitude: number;
  longitude: number;
  siteId?: number;
  empOid: number;
}): Promise<{
  success: boolean;
  verified: boolean;
  message: string;
  checkpoint_id: number;
  checkpoint_name: string;
  distance_meters: number;
  gps_verified: boolean;
  checklist_id?: number | null;
}> {
  const res = await api.post(`/mobile/patrol/checkpoint/verify?empOid=${data.empOid}`, {
    qr_code: data.qrCode,
    checkpoint_id: data.checkpointId,
    tour_name: data.tourName,
    latitude: data.latitude,
    longitude: data.longitude,
    site_id: data.siteId,
  });
  return res.data;
}

export async function getCheckpointChecklist(checkpointId: number, empOid: number): Promise<{
  success: boolean;
  checkpoint_id: number;
  checkpoint_name: string;
  checklist_id?: number | null;
  title: string;
  questions: ChecklistQuestion[];
}> {
  const res = await api.get(`/mobile/patrol/checkpoint/${checkpointId}/checklist?empOid=${empOid}`);
  return res.data;
}

export async function submitCheckpointChecklist(checkpointId: number, data: {
  empOid: number;
  tourName: string;
  latitude: number;
  longitude: number;
  siteId?: number;
  answers: Array<{
    link_id?: number;
    question_id: number;
    answer_value: string;
    comment?: string;
    photo_base64?: string | null;
    photo_url?: string | null;
  }>;
}): Promise<{
  success: boolean;
  message: string;
  checkpoint_id: number;
  tour_completed: boolean;
  scanned_count: number;
  total_checkpoints: number;
}> {
  const res = await api.post(`/mobile/patrol/checkpoint/${checkpointId}/submit-checklist?empOid=${data.empOid}`, {
    tour_name: data.tourName,
    latitude: data.latitude,
    longitude: data.longitude,
    site_id: data.siteId,
    answers: data.answers,
  });
  return res.data;
}

export async function getSiteGuards(siteId: number, empOid: number): Promise<SiteGuard[]> {
  const res = await api.get(`/mobile/patrol/guards?site_id=${siteId}&empOid=${empOid}`);
  return res.data;
}

export async function passPatrolBaton(checkpointId: number, data: {
  empOid: number;
  tourName: string;
  forwardedTo: number;
  reason: string;
  latitude: number;
  longitude: number;
  siteId?: number;
}): Promise<{
  success: boolean;
  message: string;
}> {
  const res = await api.post(`/mobile/patrol/checkpoint/${checkpointId}/pass-baton?empOid=${data.empOid}`, {
    tour_name: data.tourName,
    forwarded_to: data.forwardedTo,
    reason: data.reason,
    latitude: data.latitude,
    longitude: data.longitude,
    site_id: data.siteId,
  });
  return res.data;
}

export async function cancelPatrolTour(empOid: number): Promise<{ success: boolean; message: string }> {
  const res = await api.post(`/mobile/patrol/tour/cancel?empOid=${empOid}`);
  return res.data;
}
