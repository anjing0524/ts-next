/**
 * useAuth Hook 单元测试
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useAuth } from '@repo/ui/hooks';
import { TokenStorage } from '../../lib/auth/token-storage';
import * as verifier from '@repo/lib/auth/jwt-client-verifier';

// Mock dependencies
jest.mock('../../lib/auth/token-storage');
jest.mock('@repo/lib/auth/jwt-client-verifier');

const mockedTokenStorage = TokenStorage as jest.Mocked<typeof TokenStorage>;
const mockedVerifier = verifier as jest.Mocked<typeof verifier>;

describe('useAuth Hook', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  it('should initialize with loading state and then become unauthenticated if no token is found', async () => {
    mockedTokenStorage.getAccessToken.mockReturnValue(null);
    
    const { result } = renderHook(() => useAuth());
    
    expect(result.current.isLoading).toBe(true);
    
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('should authenticate successfully if a valid token exists', async () => {
    const mockUser = { id: 'user-123', username: 'admin', permissions: ['admin:view'] };
    mockedTokenStorage.getAccessToken.mockReturnValue('valid-token');
    (mockedVerifier.verify as jest.Mock).mockResolvedValue({ success: true, payload: { sub: mockUser.id, permissions: mockUser.permissions } });

    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user?.id).toBe(mockUser.id);
    expect(result.current.user?.permissions).toEqual(mockUser.permissions);
  });

  it('should handle failed token verification', async () => {
    mockedTokenStorage.getAccessToken.mockReturnValue('invalid-token');
    (mockedVerifier.verify as jest.Mock).mockResolvedValue({ success: false, error: new Error('Invalid token') });

    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
    expect(mockedTokenStorage.clearTokens).toHaveBeenCalledTimes(1);
  });
});
