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

export const getClients = async (): Promise<Client[]> => {
  const response = await api.get('/assessments/clients');
  return response.data || [];
};

export const getSites = async (): Promise<Site[]> => {
  const response = await api.get('/assessments/sites');
  return response.data || [];
};

export const getPlannedVisits = async (): Promise<PlannedVisit[]> => {
  const response = await api.get('/planned-visits');
  return response.data || [];
};
