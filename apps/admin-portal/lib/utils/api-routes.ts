export const API_PREFIX_V2 = '/api/v2';

export const API_ROUTES = {
  AUDIT_LOGS: `${API_PREFIX_V2}/audit-logs`,
  USERS: {
    BASE: `${API_PREFIX_V2}/users`,
    ME: `${API_PREFIX_V2}/users/me`,
    ME_PROFILE: `${API_PREFIX_V2}/users/me/profile`,
    ME_PASSWORD: `${API_PREFIX_V2}/users/me/password`,
  },
  CLIENTS: {
    BASE: `${API_PREFIX_V2}/clients`,
    BY_ID: (id: string) => `${API_PREFIX_V2}/clients/${id}`,
    SECRET: (id: string) => `${API_PREFIX_V2}/clients/${id}/secret`,
  },
  OAUTH: {
    AUTHORIZE: `${API_PREFIX_V2}/oauth/authorize`,
    TOKEN: `${API_PREFIX_V2}/oauth/token`,
    USERINFO: `${API_PREFIX_V2}/oauth/userinfo`,
    REVOKE: `${API_PREFIX_V2}/oauth/revoke`,
  },
  ROLES: {
    BASE: `${API_PREFIX_V2}/roles`,
    BY_ID: (id: string) => `${API_PREFIX_V2}/roles/${id}`,
    PERMISSIONS_BY_ROLE_ID: (roleId: string) => `${API_PREFIX_V2}/roles/${roleId}/permissions`,
  },
  PERMISSIONS: {
    BASE: `${API_PREFIX_V2}/permissions`,
    BY_ID: (id: string) => `${API_PREFIX_V2}/permissions/${id}`,
  },
  STATS: {
    SUMMARY: `${API_PREFIX_V2}/stats/summary`,
  },
  SYSTEM: {
    CONFIG: `${API_PREFIX_V2}/system/config`,
  },
};
