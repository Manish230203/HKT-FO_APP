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
  visitType?: string;
  shift?: string;
  frequency?: string;
  visitFrequency?: number | string;
  completedVisits?: number;
  pendingVisits?: number;
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

