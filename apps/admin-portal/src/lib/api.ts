import { TokenStorage } from './auth/tokenStorage';

const getAuthHeaders = () => ({
  'Authorization': `Bearer ${TokenStorage.getAccessToken()}`,
  'Content-Type': 'application/json',
});

const handleResponse = async (response: Response) => {
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: 'An unknown error occurred' }));
    throw new Error(errorData.message || `Request failed with status ${response.status}`);
  }
  return response.json();
};

export const adminApi = {
  async getUsers(limit: number = 10, page: number = 1) {
    const response = await fetch(`/api/v2/users?limit=${limit}&page=${page}`, {
      headers: getAuthHeaders(),
    });
    return handleResponse(response);
  },

  async getAuditLogs(limit: number = 20, page: number = 1) {
    const response = await fetch(`/api/v2/audit-logs?limit=${limit}&page=${page}`, {
      headers: getAuthHeaders(),
    });
    return handleResponse(response);
  },

  // Add other admin-related API calls here
};

export const authApi = {
  // Add auth-related API calls here
};