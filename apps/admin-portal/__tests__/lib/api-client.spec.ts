import { createApiClient, ApiClient } from '../../lib/api-client';

// Mock the global fetch
global.fetch = jest.fn();

describe('apiClient', () => {
  let apiClient: ApiClient;
  let mockGetTokens: jest.Mock;
  let mockSetTokens: jest.Mock;
  let mockOnAuthFailure: jest.Mock;

  beforeEach(() => {
    // Reset mocks before each test
    (global.fetch as jest.Mock).mockClear();
    mockGetTokens = jest.fn();
    mockSetTokens = jest.fn();
    mockOnAuthFailure = jest.fn();

    apiClient = createApiClient({
      getTokens: mockGetTokens,
      setTokens: mockSetTokens,
      onAuthFailure: mockOnAuthFailure,
    });
  });

  it('should make a GET request with Authorization header if token exists', async () => {
    mockGetTokens.mockReturnValue({ accessToken: 'test-token', refreshToken: 'refresh' });
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: 'success' }),
    });

    const result = await apiClient.get('/test');

    expect(global.fetch).toHaveBeenCalledWith('/test', {
      method: 'GET',
      headers: expect.any(Headers),
    });
    const fetchOptions = (global.fetch as jest.Mock).mock.calls[0][1];
    expect(fetchOptions.headers.get('Authorization')).toBe('Bearer test-token');
    expect(result).toEqual({ data: 'success' });
  });

  it('should handle successful token refresh on 401', async () => {
    // First call fails with 401
    mockGetTokens.mockReturnValueOnce({ accessToken: 'old-token', refreshToken: 'refresh' });
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 401,
    });

    // Refresh token call is successful
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ accessToken: 'new-token', refreshToken: 'new-refresh' }),
    });
    
    // Second call (retry) is successful
    mockGetTokens.mockReturnValueOnce({ accessToken: 'new-token', refreshToken: 'new-refresh' });
    (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: 'retry success' }),
    });


    const result = await apiClient.get('/protected');
    
    // Check that setTokens was called with the new tokens
    expect(mockSetTokens).toHaveBeenCalledWith({ accessToken: 'new-token', refreshToken: 'new-refresh' });
    
    // Check that the original request was retried with the new token
    expect(global.fetch).toHaveBeenCalledTimes(3); // Original, Refresh, Retry
    const retryCallArgs = (global.fetch as jest.Mock).mock.calls[2];
    expect(retryCallArgs[0]).toBe('/protected');
    expect(retryCallArgs[1].headers.get('Authorization')).toBe('Bearer new-token');

    expect(result).toEqual({ data: 'retry success' });
  });

  it('should call onAuthFailure if token refresh fails', async () => {
    // First call fails with 401
    mockGetTokens.mockReturnValue({ accessToken: 'old-token', refreshToken: 'refresh' });
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 401,
    });

    // Refresh token call also fails
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 401,
    });

    await expect(apiClient.get('/protected')).rejects.toThrow('Authentication failed');

    expect(mockOnAuthFailure).toHaveBeenCalledTimes(1);
  });

  it('should handle concurrent requests with a single token refresh', async () => {
    mockGetTokens.mockReturnValue({ accessToken: 'old-token', refreshToken: 'refresh' });

    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      switch (url) {
        // Initial failing calls
        case '/req1':
        case '/req2':
          return Promise.resolve({ ok: false, status: 401 });
        // Refresh call
        case '/api/v2/oauth/token':
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ accessToken: 'new-token', refreshToken: 'new-refresh' }),
          });
        // Retried calls - This part needs to be more robust for a real-world scenario,
        // but for this test, we can assume the order or just return a generic success.
        // A better mock would inspect headers. For now, we'll just mock the final two calls.
        default:
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: `success for ${url}` }) });
      }
    });
    
    // This is a more advanced mock for the retries to ensure correct data is returned.
    const mockFetch = global.fetch as jest.Mock;
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 401 }) // req1 initial
      .mockResolvedValueOnce({ ok: false, status: 401 }) // req2 initial
      .mockResolvedValueOnce({ // refresh token
        ok: true,
        json: () => Promise.resolve({ accessToken: 'new-token', refreshToken: 'new-refresh' }),
      })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ data: 'req1 success' })}) // req1 retry
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ data: 'req2 success' })}) // req2 retry


    // Fire two requests concurrently
    const promise1 = apiClient.get('/req1');
    const promise2 = apiClient.get('/req2');

    const [result1, result2] = await Promise.all([promise1, promise2]);

    // The refresh logic should only have been called once
    const refreshCall = (global.fetch as jest.Mock).mock.calls.filter(call => call[0] === '/api/v2/oauth/token');
    expect(refreshCall.length).toBe(1);

    expect(result1).toEqual({ data: 'req1 success' });
    expect(result2).toEqual({ data: 'req2 success' });
    expect(mockSetTokens).toHaveBeenCalledWith({ accessToken: 'new-token', refreshToken: 'new-refresh' });
  });
});
