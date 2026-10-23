import api from './api';
import gpsTracker from './gpsService';

export interface Client {
  id: number | string;
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
  client_name?: string;
  siteName?: string;
  site_name?: string;
  siteId?: number | string | null;
  site_id?: number | string | null;
  clientId?: number | string | null;
  client_id?: number | string | null;
  address?: string | null;
  customVisitId?: number | string | null;
  custom_visit_id?: number | string | null;
  latitude?: number;
  longitude?: number;
  visitType?: string;
  shift?: string;
  frequency?: string;
  visitFrequency?: number | string;
  completedVisits?: number;
  pendingVisits?: number;
  status?: string;
  weekStartDate?: string;
  weekEndDate?: string;
  visitDate?: string;
  planningMonth?: number | string;
  planningYear?: number | string;
  isExpired?: boolean;
  radius?: number;
  customClientName?: string;
  customSiteName?: string;
  isCustomVisit?: boolean;
  is_custom?: boolean;
}

/**
 * Checks whether the date or date range of an assigned planned visit has expired (i.e. is in the past).
 * If the visit's date range is gone, returns true so the visit can be removed from pending visits.
 */
export const isVisitDateRangeExpired = (pv: PlannedVisit): boolean => {
  if (pv.isExpired !== undefined) return Boolean(pv.isExpired);

  const now = Date.now();

  // 1. Direct weekEndDate check (e.g. '2026-10-18')
  if (pv.weekEndDate) {
    const endDt = new Date(pv.weekEndDate);
    if (!isNaN(endDt.getTime())) {
      endDt.setHours(23, 59, 59, 999);
      return endDt.getTime() < now;
    }
  }

  // 2. Direct visitDate check (e.g. '2026-10-19')
  if (pv.visitDate) {
    const visitDt = new Date(pv.visitDate);
    if (!isNaN(visitDt.getTime())) {
      visitDt.setHours(23, 59, 59, 999);
      return visitDt.getTime() < now;
    }
  }

  // 3. Planning month & year check
  if (pv.planningMonth && pv.planningYear) {
    const m = parseInt(String(pv.planningMonth), 10);
    const y = parseInt(String(pv.planningYear), 10);
    if (!isNaN(m) && !isNaN(y)) {
      // Day 0 of next month is the last day of month m
      const lastDayDt = new Date(y, m, 0, 23, 59, 59, 999);
      return lastDayDt.getTime() < now;
    }
  }

  // 4. plannedPeriod or date parsing (e.g. '24 Sep 2026 - 30 Sep 2026' or '19 Oct 2026' or '2026-10-19')
  const periodStr = pv.plannedPeriod || pv.date || '';
  if (periodStr) {
    let endStr = '';
    if (periodStr.includes(' - ')) {
      const rangeParts = periodStr.split(' - ');
      endStr = rangeParts[rangeParts.length - 1].trim();
    } else if (periodStr.includes(' to ')) {
      const rangeParts = periodStr.split(' to ');
      endStr = rangeParts[rangeParts.length - 1].trim();
    } else {
      endStr = periodStr.trim();
    }

    const dt = new Date(endStr);
    if (!isNaN(dt.getTime())) {
      dt.setHours(23, 59, 59, 999);
      return dt.getTime() < now;
    }
  }

  return false;
};

export interface ActiveSiteSession {
  id: number;
  employee_id: number;
  site_id?: number | null;
  custom_visit_id?: number | null;
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
  siteId?: number | string;
  officerId: number | string;
  visitFrequency?: number;
  visitDate?: string;
  weekStartDate?: string;
  weekEndDate?: string;
  customClientName?: string;
  customSiteName?: string;
  clientName?: string;
  siteName?: string;
  isCustomVisit?: boolean;
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
  site_id?: number | string | null;
  custom_visit_id?: number | string | null;
  site_name?: string;
  latitude?: number;
  longitude?: number;
}) => {
  const response = await api.post('/site-visit/check-in', payload);
  if (response.data && response.data.success) {
    try {
      await gpsTracker.updateTrackingConfiguration(true);
    } catch (e) {
      console.warn('Failed to update gps config on check-in:', e);
    }
  }
  return response.data;
};

export const checkOutSiteVisit = async (payload: {
  employee_id: number | string;
  site_id?: number | string | null;
  custom_visit_id?: number | string | null;
  latitude?: number;
  longitude?: number;
}) => {
  const response = await api.post('/site-visit/check-out', payload);
  if (response.data && response.data.success) {
    try {
      await gpsTracker.updateTrackingConfiguration(false);
    } catch (e) {
      console.warn('Failed to update gps config on check-out:', e);
    }
  }
  return response.data;
};

