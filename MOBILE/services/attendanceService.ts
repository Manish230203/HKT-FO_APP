import api from './api';
import { getPunchRecords, savePunchRecord as dbSavePunchRecord } from './db';

export interface AttendanceParams {
  date: string;
  client_id?: number;
  site_id?: number;
  branch_id?: number;
  designation?: string;
  shift?: string;
  duty_type?: string;
}

export const getAttendanceRecords = async (params: AttendanceParams) => {
  try {
    const response = await api.get('/attendance/records', { params });
    const remoteData = response.data || [];
    const localLogs = await getPunchRecords();
    return [...localLogs, ...remoteData];
  } catch (e) {
    return await getPunchRecords();
  }
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
  try {
    await api.post('/attendance/check-in', record).catch(() => {});
  } catch (e) {}
  await dbSavePunchRecord(record);
};
