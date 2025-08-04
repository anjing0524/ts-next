import { useState } from 'react';

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface LoginFormState {
  credentials: LoginCredentials;
  isLoading: boolean;
  error: string | null;
}

export const useLoginForm = () => {
  const [state, setState] = useState<LoginFormState>({
    credentials: { username: '', password: '' },
    isLoading: false,
    error: null,
  });

  const updateCredentials = (field: keyof LoginCredentials, value: string) => {
    setState(prev => ({
      ...prev,
      credentials: { ...prev.credentials, [field]: value },
      error: null,
    }));
  };

  const setLoading = (loading: boolean) => {
    setState(prev => ({ ...prev, isLoading: loading }));
  };

  const setError = (error: string | null) => {
    setState(prev => ({ ...prev, error }));
  };

  const reset = () => {
    setState({
      credentials: { username: '', password: '' },
      isLoading: false,
      error: null,
    });
  };

  return {
    ...state,
    updateCredentials,
    setLoading,
    setError,
    reset,
  };
};