import api from './api';

export const getDayVisitReports = async () => {
  const response = await api.get('/officer-visits/reports');
  return response.data || [];
};

export const submitDayVisitReport = async (payload: any) => {
  const response = await api.post('/officer-visits/reports', payload);
  return response.data;
};

export const getNightVisitReports = async () => {
  const response = await api.get('/officer-rounds/reports');
  return response.data || [];
};

export const submitNightVisitReport = async (payload: any) => {
  const response = await api.post('/officer-rounds/reports', payload);
  return response.data;
};

export const getGeneralVisits = async () => {
  const response = await api.get('/general-visits');
  return response.data || [];
};

export const submitGeneralVisit = async (payload: any) => {
  const response = await api.post('/general-visits', payload);
  return response.data;
};
