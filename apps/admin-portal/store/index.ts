/**
 * Zustand store for global state management
 * 
 * Provides centralized state for authentication, user data, UI state, and more
 */

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { UserContext } from '@/lib/permission/permission-service';

// Auth state interface
interface AuthState {
  isAuthenticated: boolean;
  user: UserContext | null;
  loading: boolean;
  error: string | null;
  lastActivity: number;
}

// UI state interface
interface UIState {
  theme: 'light' | 'dark' | 'system';
  sidebarOpen: boolean;
  notifications: Array<{
    id: string;
    type: 'success' | 'error' | 'warning' | 'info';
    message: string;
    timestamp: number;
  }>;
  modals: Record<string, boolean>;
  loadingStates: Record<string, boolean>;
}

// API state interface
interface APIState {
  lastFetchTime: Record<string, number>;
  cache: Record<string, any>;
  errors: Record<string, string>;
  retryCount: Record<string, number>;
}

// Main store interface
interface AppState extends AuthState, UIState, APIState {
  // Auth actions
  setAuth: (isAuthenticated: boolean, user?: UserContext) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearAuth: () => void;
  updateLastActivity: () => void;
  
  // UI actions
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  addNotification: (notification: Omit<UIState['notifications'][0], 'id' | 'timestamp'>) => void;
  removeNotification: (id: string) => void;
  clearNotifications: () => void;
  openModal: (modalId: string) => void;
  closeModal: (modalId: string) => void;
  setLoadingState: (key: string, loading: boolean) => void;
  clearLoadingState: (key: string) => void;
  
  // API actions
  setCache: (key: string, data: any, ttl?: number) => void;
  getCache: (key: string) => any | null;
  clearCache: (key?: string) => void;
  setAPIError: (key: string, error: string) => void;
  clearAPIError: (key: string) => void;
  incrementRetryCount: (key: string) => void;
  resetRetryCount: (key: string) => void;
  
  // Utility actions
  reset: () => void;
  clearAllData: () => void;
}

const initialState: Omit<AppState, 'actions'> = {
  // Auth state
  isAuthenticated: false,
  user: null,
  loading: false,
  error: null,
  lastActivity: Date.now(),
  
  // UI state
  theme: 'system',
  sidebarOpen: true,
  notifications: [],
  modals: {},
  loadingStates: {},
  
  // API state
  lastFetchTime: {},
  cache: {},
  errors: {},
  retryCount: {},
};

export const useAppStore = create<AppState>()(
  devtools(
    persist(
      (set, get) => ({
        ...initialState,
        
        // Auth actions
        setAuth: (isAuthenticated, user) => {
          set((state) => ({
            ...state,
            isAuthenticated,
            user: user || null,
            error: null,
            lastActivity: Date.now(),
          }));
        },
        
        setLoading: (loading) => {
          set((state) => ({ ...state, loading }));
        },
        
        setError: (error) => {
          set((state) => ({ ...state, error }));
        },
        
        clearAuth: () => {
          set((state) => ({
            ...state,
            isAuthenticated: false,
            user: null,
            error: null,
            lastActivity: 0,
          }));
        },
        
        updateLastActivity: () => {
          set((state) => ({ ...state, lastActivity: Date.now() }));
        },
        
        // UI actions
        setTheme: (theme) => {
          set((state) => ({ ...state, theme }));
          
          // Apply theme to document
          if (typeof window !== 'undefined') {
            const root = document.documentElement;
            if (theme === 'dark') {
              root.classList.add('dark');
            } else if (theme === 'light') {
              root.classList.remove('dark');
            } else {
              // System theme
              const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
              if (isDark) {
                root.classList.add('dark');
              } else {
                root.classList.remove('dark');
              }
            }
          }
        },
        
        toggleSidebar: () => {
          set((state) => ({ ...state, sidebarOpen: !state.sidebarOpen }));
        },
        
        setSidebarOpen: (sidebarOpen) => {
          set((state) => ({ ...state, sidebarOpen }));
        },
        
        addNotification: (notification) => {
          const id = `notification-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          const newNotification = {
            ...notification,
            id,
            timestamp: Date.now(),
          };
          
          set((state) => ({
            ...state,
            notifications: [...state.notifications, newNotification],
          }));
          
          // Auto-remove notification after 5 seconds
          setTimeout(() => {
            get().removeNotification(id);
          }, 5000);
        },
        
        removeNotification: (id) => {
          set((state) => ({
            ...state,
            notifications: state.notifications.filter((n) => n.id !== id),
          }));
        },
        
        clearNotifications: () => {
          set((state) => ({ ...state, notifications: [] }));
        },
        
        openModal: (modalId) => {
          set((state) => ({
            ...state,
            modals: { ...state.modals, [modalId]: true },
          }));
        },
        
        closeModal: (modalId) => {
          set((state) => ({
            ...state,
            modals: { ...state.modals, [modalId]: false },
          }));
        },
        
        setLoadingState: (key, loading) => {
          set((state) => ({
            ...state,
            loadingStates: { ...state.loadingStates, [key]: loading },
          }));
        },
        
        clearLoadingState: (key) => {
          set((state) => {
            const { [key]: removed, ...rest } = state.loadingStates;
            return { ...state, loadingStates: rest };
          });
        },
        
        // API actions
        setCache: (key, data, ttl = 300000) => { // 5 minutes default TTL
          set((state) => ({
            ...state,
            cache: {
              ...state.cache,
              [key]: {
                data,
                timestamp: Date.now(),
                ttl,
              },
            },
            lastFetchTime: {
              ...state.lastFetchTime,
              [key]: Date.now(),
            },
          }));
        },
        
        getCache: (key) => {
          const state = get();
          const cached = state.cache[key];
          
          if (!cached) return null;
          
          const now = Date.now();
          if (now - cached.timestamp > cached.ttl) {
            // Cache expired
            get().clearCache(key);
            return null;
          }
          
          return cached.data;
        },
        
        clearCache: (key) => {
          if (key) {
            set((state) => {
              const { [key]: removedCache, ...restCache } = state.cache;
              const { [key]: removedTime, ...restTime } = state.lastFetchTime;
              return {
                ...state,
                cache: restCache,
                lastFetchTime: restTime,
              };
            });
          } else {
            set((state) => ({ ...state, cache: {}, lastFetchTime: {} }));
          }
        },
        
        setAPIError: (key, error) => {
          set((state) => ({
            ...state,
            errors: { ...state.errors, [key]: error },
          }));
        },
        
        clearAPIError: (key) => {
          set((state) => {
            const { [key]: removed, ...rest } = state.errors;
            return { ...state, errors: rest };
          });
        },
        
        incrementRetryCount: (key) => {
          set((state) => ({
            ...state,
            retryCount: {
              ...state.retryCount,
              [key]: (state.retryCount[key] || 0) + 1,
            },
          }));
        },
        
        resetRetryCount: (key) => {
          set((state) => {
            const { [key]: removed, ...rest } = state.retryCount;
            return { ...state, retryCount: rest };
          });
        },
        
        // Utility actions
        reset: () => {
          set(initialState);
        },
        
        clearAllData: () => {
          set({
            ...initialState,
            // Preserve theme preference
            theme: get().theme,
          });
        },
      }),
      {
        name: 'admin-portal-store',
        partialize: (state) => ({
          theme: state.theme,
          sidebarOpen: state.sidebarOpen,
          isAuthenticated: state.isAuthenticated,
          user: state.user,
          lastActivity: state.lastActivity,
        }),
      }
    ),
    { name: 'admin-portal' }
  )
);

// Selectors for better performance
export const selectAuth = (state: AppState) => ({
  isAuthenticated: state.isAuthenticated,
  user: state.user,
  loading: state.loading,
  error: state.error,
  lastActivity: state.lastActivity,
});

export const selectUI = (state: AppState) => ({
  theme: state.theme,
  sidebarOpen: state.sidebarOpen,
  notifications: state.notifications,
  modals: state.modals,
  loadingStates: state.loadingStates,
});

export const selectAPI = (state: AppState) => ({
  cache: state.cache,
  errors: state.errors,
  retryCount: state.retryCount,
  lastFetchTime: state.lastFetchTime,
});

// Hooks for specific state slices
export const useAuth = () => {
  const auth = useAppStore(selectAuth);
  const actions = useAppStore((state) => ({
    setAuth: state.setAuth,
    setLoading: state.setLoading,
    setError: state.setError,
    clearAuth: state.clearAuth,
    updateLastActivity: state.updateLastActivity,
  }));
  
  return { ...auth, ...actions };
};

export const useUI = () => {
  const ui = useAppStore(selectUI);
  const actions = useAppStore((state) => ({
    setTheme: state.setTheme,
    toggleSidebar: state.toggleSidebar,
    setSidebarOpen: state.setSidebarOpen,
    addNotification: state.addNotification,
    removeNotification: state.removeNotification,
    clearNotifications: state.clearNotifications,
    openModal: state.openModal,
    closeModal: state.closeModal,
    setLoadingState: state.setLoadingState,
    clearLoadingState: state.clearLoadingState,
  }));
  
  return { ...ui, ...actions };
};

export const useAPI = () => {
  const api = useAppStore(selectAPI);
  const actions = useAppStore((state) => ({
    setCache: state.setCache,
    getCache: state.getCache,
    clearCache: state.clearCache,
    setAPIError: state.setAPIError,
    clearAPIError: state.clearAPIError,
    incrementRetryCount: state.incrementRetryCount,
    resetRetryCount: state.resetRetryCount,
  }));
  
  return { ...api, ...actions };
};

// Auto-initialize theme
if (typeof window !== 'undefined') {
  const store = useAppStore.getState();
  store.setTheme(store.theme);
  
  // Listen for system theme changes
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  mediaQuery.addEventListener('change', () => {
    const currentTheme = useAppStore.getState().theme;
    if (currentTheme === 'system') {
      useAppStore.getState().setTheme('system');
    }
  });
}