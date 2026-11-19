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

export const getPatrolTourReports = async (empOid?: number | string) => {
  const url = empOid ? `/officer-tours/reports?empOid=${empOid}` : '/officer-tours/reports';
  const response = await api.get(url);
  return response.data || [];
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

export interface PreviousQuestionsResponse {
  success: boolean;
  has_previous: boolean;
  site_id?: number | string;
  report_id?: string;
  questions: Array<{
    id: string;
    section?: string;
    question: string;
    answerType?: string;
    isCustom?: boolean;
    required?: boolean;
  }>;
  template_questions: Array<{
    id: string;
    section?: string;
    question: string;
    answerType?: string;
    isCustom?: boolean;
    required?: boolean;
  }>;
  custom_questions: Array<{
    id: string;
    section?: string;
    question: string;
    answerType?: string;
    isCustom?: boolean;
    required?: boolean;
  }>;
}

export const getSitePreviousQuestions = async (
  siteId: number | string,
  visitType: 'DAY_VISIT' | 'NIGHT_VISIT' = 'DAY_VISIT'
): Promise<PreviousQuestionsResponse> => {
  try {
    const response = await api.get('/visits/site-previous-questions', {
      params: { site_id: siteId, visit_type: visitType },
    });
    return response.data;
  } catch (e) {
    console.warn('Failed to fetch previous site questions:', e);
    return {
      success: false,
      has_previous: false,
      questions: [],
      template_questions: [],
      custom_questions: [],
    };
  }
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

export const getSiteChecklist = async (siteId: number | string) => {
  const response = await api.get(`/sites/${siteId}/checklist`);
  return response.data;
};

export const validateSiteQr = async (siteId: number | string, qrCode: string) => {
  const response = await api.post(`/sites/${siteId}/validate-qr`, { qr_code: qrCode });
  return response.data;
};

export const submitSiteChecklist = async (payload: any) => {
  const response = await api.post('/sites/checklist-submit', payload);
  return response.data;
};

