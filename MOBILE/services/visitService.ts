import api from './api';

export const getDayVisitReports = async (empOid?: number | string) => {
  const url = empOid ? `/officer-visits/reports?empOid=${empOid}` : '/officer-visits/reports';
  const response = await api.get(url);
  return response.data || [];
};

export const submitDayVisitReport = async (payload: any) => {
  const response = await api.post('/officer-visits/reports', payload);
  return response.data;
};

export const getNightVisitReports = async (empOid?: number | string) => {
  const url = empOid ? `/officer-rounds/reports?empOid=${empOid}` : '/officer-rounds/reports';
  const response = await api.get(url);
  return response.data || [];
};

export const submitNightVisitReport = async (payload: any) => {
  const response = await api.post('/officer-rounds/reports', payload);
  return response.data;
};

export const getGeneralVisits = async (empOid?: number | string) => {
  const url = empOid ? `/general-visits?empOid=${empOid}` : '/general-visits';
  const response = await api.get(url);
  return response.data || [];
};

export const submitGeneralVisit = async (payload: any) => {
  const response = await api.post('/general-visits', payload);
  return response.data;
};

export const getDayVisitTemplates = async () => {
  const response = await api.get('/officer-visits/templates');
  return response.data || [];
};

export const getNightVisitTemplates = async () => {
  const response = await api.get('/officer-rounds/templates');
  return response.data || [];
};

export const sendReportEmail = async (payload: {
  email: string;
  subject?: string;
  message?: string;
  branchId?: number | string;
  siteId?: number | string;
}) => {
  const response = await api.post('/officer-visits/send-email', payload);
  return response.data;
};
