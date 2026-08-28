import api from './api';

export interface Client {
  id: number;
  name: string;
  code?: string;
}

export interface Site {
  id: number;
  name: string;
  client_id?: number;
  client_name?: string;
  branch_name?: string;
  latitude?: number;
  longitude?: number;
}

export interface PlannedVisit {
  id: number | string;
  planCode?: string;
  planningType?: string;
  plannedPeriod?: string;
  date?: string;
  clientName?: string;
  siteName?: string;
  siteId?: number;
  clientId?: number;
  latitude?: number;
  longitude?: number;
  visitType?: string;
  shift?: string;
  frequency?: string;
  visitFrequency?: number | string;
  completedVisits?: number;
  pendingVisits?: number;
  status?: string;
}

export interface ActiveSiteSession {
  id: number;
  employee_id: number;
  site_id: number;
  site_name: string;
  start_time: string;
  status: string;
  duration_minutes: number;
  entry_latitude?: number;
  entry_longitude?: number;
}

export interface SiteGuard {
  name: string;
  empCode: string;
  empOid?: number | string;
  dutyType: string;
  rating?: string;
  status?: string;
}

export const getClients = async (empOid?: number | string): Promise<Client[]> => {
  const url = empOid ? `/assessments/clients?empOid=${empOid}` : '/assessments/clients';
  const response = await api.get(url);
  return response.data || [];
};

export const getSites = async (empOid?: number | string): Promise<Site[]> => {
  const url = empOid ? `/assessments/sites?empOid=${empOid}` : '/assessments/sites';
  const response = await api.get(url);
  return response.data || [];
};

export const getSiteGuards = async (siteId?: number | string, shift?: string): Promise<SiteGuard[]> => {
  if (!siteId) return [];
  const response = await api.get(`/site-guards?site_id=${siteId}&shift=${shift || ''}`);
  return response.data || [];
};

export const getPlannedVisits = async (empOid?: number | string): Promise<PlannedVisit[]> => {
  const url = empOid ? `/planned-visits?empOid=${empOid}` : '/planned-visits';
  const response = await api.get(url);
  return response.data || [];
};

export const createPlannedVisit = async (payload: {
  planningType?: string;
  siteId: number;
  officerId: number | string;
  visitFrequency?: number;
  visitDate?: string;
  weekStartDate?: string;
  weekEndDate?: string;
}) => {
  const response = await api.post('/planned-visits', payload);
  return response.data;
};

export const getActiveSiteVisitSession = async (empOid: number | string): Promise<ActiveSiteSession | null> => {
  try {
    const response = await api.get(`/site-visit/active?employee_id=${empOid}`);
    return response.data?.active_session || null;
  } catch {
    return null;
  }
};

export const checkInSiteVisit = async (payload: {
  employee_id: number | string;
  site_id: number | string;
  site_name?: string;
  latitude?: number;
  longitude?: number;
}) => {
  const response = await api.post('/site-visit/check-in', payload);
  return response.data;
};

export const checkOutSiteVisit = async (payload: {
  employee_id: number | string;
  site_id?: number | string;
  latitude?: number;
  longitude?: number;
}) => {
  const response = await api.post('/site-visit/check-out', payload);
  return response.data;
};

