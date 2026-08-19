import api from './api';

export interface LoginParams {
  identifier: string;
  password?: string;
  device_id?: string;
}

export interface UserProfile {
  id: number;
  name: string;
  role: string;
  employee_id: string;
  site_id?: number | null;
  company_id?: number | null;
  company_name?: string | null;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user: UserProfile;
}

export const loginOfficer = async (params: LoginParams): Promise<LoginResponse> => {
  const response = await api.post('/auth/login', {
    identifier: params.identifier,
    password: params.password || 'password123',
    device_id: params.device_id || 'mobile-app',
  });
  return response.data;
};

export const getAuthenticatedUser = async (): Promise<UserProfile> => {
  const response = await api.get('/auth/me');
  return response.data;
};
