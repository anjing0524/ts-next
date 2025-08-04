/**
 * API client tests
 */

import { EnhancedAPIClientWithStore } from '@/lib/api/enhanced-api-client-with-store';
import { useAppStore } from '@/store';

// Mock fetch
global.fetch = jest.fn();

// Mock store
jest.mock('@/store', () => ({
  useAppStore: jest.fn(),
}));

describe('EnhancedAPIClientWithStore', () => {
  const mockStore = {
    setCache: jest.fn(),
    getCache: jest.fn(),
    clearCache: jest.fn(),
    setAPIError: jest.fn(),
    clearAPIError: jest.fn(),
    setLoadingState: jest.fn(),
    addNotification: jest.fn(),
    getState: jest.fn(() => ({
      setCache: jest.fn(),
      getCache: jest.fn(),
      clearCache: jest.fn(),
      setAPIError: jest.fn(),
      clearAPIError: jest.fn(),
      setLoadingState: jest.fn(),
      addNotification: jest.fn(),
    })),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useAppStore as jest.Mock).mockReturnValue(mockStore);
    (fetch as jest.Mock).mockClear();
  });

  describe('request', () => {
    it('should make successful request and cache result', async () => {
      const mockResponse = { data: 'test data' };
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      mockStore.getCache.mockReturnValue(null);

      const result = await EnhancedAPIClientWithStore.request('/test-endpoint', {
        cacheKey: 'test-cache-key',
        showLoading: true,
        loadingKey: 'test-loading',
        errorKey: 'test-error',
      });

      expect(result).toEqual(mockResponse);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/test-endpoint'),
        expect.objectContaining({
          method: 'GET',
        })
      );
      expect(mockStore.setCache).toHaveBeenCalledWith(
        'test-cache-key',
        mockResponse,
        300000
      );
      expect(mockStore.setLoadingState).toHaveBeenCalledWith('test-loading', true);
      expect(mockStore.setLoadingState).toHaveBeenCalledWith('test-loading', false);
      expect(mockStore.clearAPIError).toHaveBeenCalledWith('test-error');
    });

    it('should use cached data when available', async () => {
      const cachedData = { data: 'cached data' };
      mockStore.getCache.mockReturnValue(cachedData);

      const result = await EnhancedAPIClientWithStore.request('/test-endpoint', {
        cacheKey: 'test-cache-key',
      });

      expect(result).toEqual(cachedData);
      expect(fetch).not.toHaveBeenCalled();
    });

    it('should handle request errors', async () => {
      const mockError = new Error('Network error');
      (fetch as jest.Mock).mockRejectedValue(mockError);

      await expect(
        EnhancedAPIClientWithStore.request('/test-endpoint', {
          cacheKey: 'test-cache-key',
          showLoading: true,
          loadingKey: 'test-loading',
          errorKey: 'test-error',
        })
      ).rejects.toThrow('Network error');

      expect(mockStore.setAPIError).toHaveBeenCalledWith(
        'test-error',
        'Network error'
      );
      expect(mockStore.addNotification).toHaveBeenCalledWith({
        type: 'error',
        message: 'Network error',
      });
      expect(mockStore.setLoadingState).toHaveBeenCalledWith('test-loading', false);
    });

    it('should skip cache when requested', async () => {
      const mockResponse = { data: 'fresh data' };
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      mockStore.getCache.mockReturnValue({ data: 'cached data' });

      const result = await EnhancedAPIClientWithStore.request('/test-endpoint', {
        cacheKey: 'test-cache-key',
        skipCache: true,
      });

      expect(result).toEqual(mockResponse);
      expect(fetch).toHaveBeenCalled();
    });

    it('should handle POST requests', async () => {
      const mockResponse = { success: true };
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await EnhancedAPIClientWithStore.post('/test-endpoint', {
        data: { test: 'data' },
      });

      expect(result).toEqual(mockResponse);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/test-endpoint'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ test: 'data' }),
        })
      );
    });

    it('should handle PUT requests', async () => {
      const mockResponse = { success: true };
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await EnhancedAPIClientWithStore.put('/test-endpoint', {
        data: { test: 'data' },
      });

      expect(result).toEqual(mockResponse);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/test-endpoint'),
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ test: 'data' }),
        })
      );
    });

    it('should handle DELETE requests', async () => {
      const mockResponse = { success: true };
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await EnhancedAPIClientWithStore.delete('/test-endpoint');

      expect(result).toEqual(mockResponse);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/test-endpoint'),
        expect.objectContaining({
          method: 'DELETE',
        })
      );
    });

    it('should handle PATCH requests', async () => {
      const mockResponse = { success: true };
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await EnhancedAPIClientWithStore.patch('/test-endpoint', {
        data: { test: 'data' },
      });

      expect(result).toEqual(mockResponse);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/test-endpoint'),
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ test: 'data' }),
        })
      );
    });
  });

  describe('clearCache', () => {
    it('should clear specific cache key', () => {
      EnhancedAPIClientWithStore.clearCache('test-key');
      expect(mockStore.clearCache).toHaveBeenCalledWith('test-key');
    });

    it('should clear all cache', () => {
      EnhancedAPIClientWithStore.clearCache();
      expect(mockStore.clearCache).toHaveBeenCalledWith();
    });
  });

  describe('getCacheStats', () => {
    it('should return cache statistics', () => {
      mockStore.getState.mockReturnValue({
        cache: {
          'key1': {
            data: { test: 'data1' },
            timestamp: Date.now() - 1000,
            ttl: 5000,
          },
          'key2': {
            data: { test: 'data2' },
            timestamp: Date.now() - 10000,
            ttl: 2000,
          },
        },
      });

      const stats = EnhancedAPIClientWithStore.getCacheStats();

      expect(stats).toHaveProperty('totalEntries', 2);
      expect(stats).toHaveProperty('expiredEntries', 1);
      expect(stats).toHaveProperty('size');
      expect(stats).toHaveProperty('entries');
      expect(stats.entries).toHaveLength(2);
    });
  });

  describe('cleanupCache', () => {
    it('should cleanup expired cache entries', () => {
      mockStore.getState.mockReturnValue({
        cache: {
          'expired-key': {
            data: { test: 'data' },
            timestamp: Date.now() - 10000,
            ttl: 5000,
          },
          'valid-key': {
            data: { test: 'data' },
            timestamp: Date.now() - 1000,
            ttl: 5000,
          },
        },
        clearCache: jest.fn(),
      });

      const cleanedCount = EnhancedAPIClientWithStore.cleanupCache();

      expect(cleanedCount).toBe(1);
      expect(mockStore.clearCache).toHaveBeenCalledWith('expired-key');
    });
  });
});