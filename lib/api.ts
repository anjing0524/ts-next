import { toast } from '@/components/ui/use-toast';

// Helper function to get a cookie value
function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(';').shift() || null;
  return null;
}

// Get the base path from Next.js config
// In development, basePath is empty, in production it's '/datamgr_flow'
const getBasePath = () => {
  if (typeof window !== 'undefined') {
    // Check if we're running with basePath in the URL
    const pathname = window.location.pathname;
    if (pathname.startsWith('/datamgr_flow')) {
      return '/datamgr_flow';
    }
  }
  // For development or when basePath is not in URL
  return '';
};

const basePath = getBasePath();

/**
 * Custom fetch wrapper that automatically adds basePath for API calls
 * and handles common error scenarios
 */
export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  // Add basePath to URL if it's a relative API path
  const fullUrl = url.startsWith('/') ? `${basePath}${url}` : url;

  // Set default headers
  const defaultHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // Get access token if available for authenticated requests
  let token: string | null = null;
  if (typeof window !== 'undefined') {
    token = getCookie('auth_token'); // Prioritize cookie
    if (!token) {
      token = sessionStorage.getItem('access_token'); // Fallback to sessionStorage
    }
  }

  if (token && !options.headers) {
    defaultHeaders['Authorization'] = `Bearer ${token}`;
  } else if (
    token &&
    options.headers &&
    !(options.headers as Record<string, string>)['Authorization']
  ) {
    defaultHeaders['Authorization'] = `Bearer ${token}`;
  }

  const mergedOptions: RequestInit = {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
  };

  try {
    const response = await fetch(fullUrl, mergedOptions);

    // Handle 401 unauthorized - redirect to login
    if (response.status === 401 && typeof window !== 'undefined') {
      sessionStorage.removeItem('access_token');
      sessionStorage.removeItem('refresh_token');
      window.location.href = `${basePath}/login`;
      throw new Error('Unauthorized - redirecting to login');
    }

    return response;
  } catch (error) {
    console.error('API request failed:', error);
    throw error;
  }
}

/**
 * Convenience wrapper for JSON API calls
 */
export async function apiRequest<T = any>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await apiFetch(url, options);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(
      errorData.error_description || errorData.message || errorData.error || 'Request failed'
    );
  }

  return response.json();
}

/**
 * OAuth-specific API calls
 */
export const authApi = {
  login: async (credentials: { username: string; password: string }) => {
    return apiRequest('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
  },

  register: async (userData: {
    username: string;
    email: string;
    password: string;
    firstName: string;
    lastName: string;
  }) => {
    return apiRequest('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  },

  logout: async () => {
    return apiFetch('/api/auth/logout', {
      method: 'POST',
    });
  },

  exchangeToken: async (params: {
    grant_type: string;
    code: string;
    redirect_uri: string;
    client_id: string;
    client_secret: string;
    code_verifier: string;
  }) => {
    return apiFetch('/api/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(params),
    });
  },

  getUserInfo: async () => {
    return apiRequest('/api/oauth/userinfo');
  },
};

/**
 * Admin API calls
 */
export const adminApi = {
  getUsers: async (limit = 10) => {
    return apiRequest(`/api/users?limit=${limit}`);
  },

  getClients: async (limit = 10) => {
    // Ensure this returns comprehensive details
    return apiRequest(`/api/clients?limit=${limit}`);
  },

  // registerClient: async (clientData: ...) => { ... } // This seems to be replaced by createClient for admin panel

  // --- User Management ---
  createUser: async (userData: object): Promise<any> => {
    return apiRequest('/api/users', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  },
  updateUser: async (userId: string, userData: object): Promise<any> => {
    return apiRequest(`/api/users/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(userData),
    });
  },
  deleteUser: async (userId: string): Promise<void> => {
    // Assuming apiRequest handles 204 No Content or backend returns JSON for DELETE
    return apiRequest(`/api/users/${userId}`, {
      method: 'DELETE',
    });
  },

  // --- Role Management ---
  getRoles: async (limit = 10): Promise<any> => {
    return apiRequest(`/api/roles?limit=${limit}`);
  },
  createRole: async (roleData: object): Promise<any> => {
    return apiRequest('/api/roles', {
      method: 'POST',
      body: JSON.stringify(roleData),
    });
  },
  updateRole: async (roleId: string, roleData: object): Promise<any> => {
    return apiRequest(`/api/roles/${roleId}`, {
      method: 'PUT',
      body: JSON.stringify(roleData),
    });
  },
  deleteRole: async (roleId: string): Promise<void> => {
    return apiRequest(`/api/roles/${roleId}`, {
      method: 'DELETE',
    });
  },

  // --- Permission Management (RBAC) ---
  getPermissions: async (limit = 10): Promise<any> => {
    return apiRequest(`/api/permissions?limit=${limit}`);
  },
  createPermission: async (permissionData: object): Promise<any> => {
    return apiRequest('/api/permissions', {
      method: 'POST',
      body: JSON.stringify(permissionData),
    });
  },
  updatePermission: async (permissionId: string, permissionData: object): Promise<any> => {
    return apiRequest(`/api/permissions/${permissionId}`, {
      method: 'PUT',
      body: JSON.stringify(permissionData),
    });
  },
  deletePermission: async (permissionId: string): Promise<void> => {
    return apiRequest(`/api/permissions/${permissionId}`, {
      method: 'DELETE',
    });
  },

  // --- OAuth Client Management ---
  // Note: getClients is above, ensure it's comprehensive.
  // The existing registerClient is likely for the public client registration page.
  // This createClient is for the admin panel.
  createClient: async (clientData: object): Promise<any> => {
    return apiRequest('/api/clients', {
      method: 'POST',
      body: JSON.stringify(clientData),
    });
  },
  updateClient: async (clientId: string, clientUpdateData: object): Promise<any> => {
    return apiRequest(`/api/clients/${clientId}`, {
      method: 'PUT',
      body: JSON.stringify(clientUpdateData),
    });
  },
  deleteClient: async (clientId: string): Promise<void> => {
    return apiRequest(`/api/clients/${clientId}`, {
      method: 'DELETE',
    });
  },
  regenerateClientSecret: async (clientId: string): Promise<any> => {
    return apiRequest(`/api/clients/${clientId}/regenerate-secret`, {
      method: 'POST', // Or PUT, depending on API design
    });
  },

  // --- OAuth Scope Management ---
  getOAuthScopes: async (limit = 10): Promise<any> => {
    return apiRequest(`/api/scopes?limit=${limit}`);
  },
  createOAuthScope: async (scopeData: object): Promise<any> => {
    return apiRequest('/api/scopes', {
      method: 'POST',
      body: JSON.stringify(scopeData),
    });
  },
  updateOAuthScope: async (scopeId: string, scopeData: object): Promise<any> => {
    return apiRequest(`/api/scopes/${scopeId}`, {
      method: 'PUT',
      body: JSON.stringify(scopeData),
    });
  },
  deleteOAuthScope: async (scopeId: string): Promise<void> => {
    return apiRequest(`/api/scopes/${scopeId}`, {
      method: 'DELETE',
    });
  },
};

/**
 * Utility function to get full URL with basePath
 */
export function getFullUrl(path: string): string {
  if (typeof window === 'undefined') return path;
  return path.startsWith('/') ? `${window.location.origin}${basePath}${path}` : path;
}

/**
 * Get redirect URI for OAuth flow
 */
export function getOAuthRedirectUri(): string {
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}${basePath}/auth/callback`;
}
