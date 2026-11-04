import api from './api';
import { getUserSession } from './db';

export interface AssignedSiteItem {
  site_id: number;
  site_name: string;
  site_code: string;
  client_id?: number | null;
  client_name: string;
  branch_name?: string;
  required: number;
  deployed?: number;
  live_present?: number;
  present: number;
  shortage: number;
  deployment_percentage: number;
  status: string;
}

export interface AssignedSitesSummary {
  total_sites: number;
  total_required: number;
  total_deployed?: number;
  total_live_present?: number;
  total_present: number;
  total_shortage: number;
  overall_percentage: number;
}

export interface AssignedSitesResponse {
  summary: AssignedSitesSummary;
  sites: AssignedSiteItem[];
}

export interface SiteShift {
  id: string;
  name: string;
  start_time?: string;
  end_time?: string;
  time_range: string;
}

export interface SiteDesignationBreakdown {
  index: number;
  key: string;
  title: string;
  required: number;
  deployed?: number;
  live_present?: number;
  present: number;
  shortage: number;
  percentage: number;
  is_optimal: boolean;
}

export interface SiteManpowerKPI {
  required: number;
  deployed?: number;
  live_present?: number;
  present: number;
  shortage: number;
  deployment_percentage: number;
}

export interface SiteManpowerResponse {
  site: {
    site_id: number;
    site_name: string;
    site_code: string;
    client_id?: number | null;
    client_name: string;
    branch_name?: string;
  };
  shifts: SiteShift[];
  selected_shift: string;
  kpi: SiteManpowerKPI;
  designations: SiteDesignationBreakdown[];
}

/**
 * Fetches sites assigned to the current field officer with required vs present deployment counts
 */
export const getAssignedSitesAttendance = async (empOid?: number | string): Promise<AssignedSitesResponse> => {
  let resolvedEmpOid = empOid;
  if (!resolvedEmpOid) {
    try {
      const session = await getUserSession();
      if (session?.user) {
        resolvedEmpOid = session.user.id || (session.user as any).empOid || session.user.employee_id;
      }
    } catch {}
  }

  const url = resolvedEmpOid 
    ? `/guard-attendance/assigned-sites?empOid=${encodeURIComponent(String(resolvedEmpOid))}`
    : `/guard-attendance/assigned-sites`;

  const res = await api.get(url);
  return res.data || {
    summary: { total_sites: 0, total_present: 0, total_required: 0, total_shortage: 0, overall_percentage: 0 },
    sites: []
  };
};

/**
 * Fetches site-specific manpower breakdown with shift filtering
 */
export const getSiteManpowerDetails = async (
  siteId: number | string,
  shiftId: string = 'all'
): Promise<SiteManpowerResponse> => {
  const query = shiftId && shiftId !== 'all' ? `?shift_id=${encodeURIComponent(shiftId)}` : '';
  const res = await api.get(`/guard-attendance/site-manpower/${siteId}${query}`);
  return res.data;
};

