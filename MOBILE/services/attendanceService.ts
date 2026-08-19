import api from './api';
import { getPunchRecords, savePunchRecord as dbSavePunchRecord } from './db';

export interface AttendanceParams {
  empOid?: number | string;
  date?: string;
  client_id?: number;
  site_id?: number;
  branch_id?: number;
  designation?: string;
  shift?: string;
  duty_type?: string;
}

export const getAttendanceRecords = async (params: AttendanceParams) => {
  try {
    const empOid = params.empOid;
    if (empOid) {
      const response = await api.get('/_AIP_getAttendanceLogs', { params: { empOid } });
      if (response.data && response.data.success) {
        return response.data.logs;
      }
    }
    return await getPunchRecords(empOid ? String(empOid) : undefined);
  } catch (e) {
    return await getPunchRecords(params.empOid ? String(params.empOid) : undefined);
  }
};

export const getTodayStatus = async (empOid: number | string) => {
  try {
    const response = await api.get('/_AIP_getTodayStatus', { params: { empOid } });
    return response.data;
  } catch (e) {
    return { success: false, message: 'Failed to fetch today status' };
  }
};

export const getMonthlyStats = async (empOid: number | string) => {
  try {
    const response = await api.get('/_AIP_getMonthlyStats', { params: { empOid } });
    return response.data;
  } catch (e) {
    return { success: false, message: 'Failed to fetch monthly stats' };
  }
};

export const markAttendanceApi = async (payload: { empOid: number | string; latitude: number; longitude: number; siteOid?: number; timestamp?: string }) => {
  const response = await api.post('/_AIP_markAttendance', payload);
  return response.data;
};

export const getAttendanceShifts = async (client_id?: string, site_id?: string) => {
  const response = await api.get('/attendance/shifts', { params: { client_id, site_id } });
  return response.data;
};

export const getAttendanceDutyTypes = async () => {
  const response = await api.get('/attendance/duty-types');
  return response.data;
};

export const submitAttendanceRegularize = async (payload: any) => {
  const response = await api.post('/attendance/regularize', payload);
  return response.data;
};

export const getRegularizations = async (status?: string) => {
  const response = await api.get('/attendance/regularizations', { params: { status } });
  return response.data;
};

export const savePunchRecord = async (record: any) => {
  await dbSavePunchRecord(record);
};
