// jest.setup.js
import '@testing-library/jest-dom'

// Mock environment variables for testing
process.env.JWT_ISSUER = 'http://localhost:3000'
process.env.JWT_AUDIENCE = 'test-audience'
process.env.JWT_ALGORITHM = 'HS256'
process.env.JWT_SECRET = 'test-secret-key-for-jwt-generation-in-tests'
process.env.JWT_KEY_ID = 'test-key-id'
process.env.AUTH_CENTER_UI_AUDIENCE = 'urn:auth-center:ui'

// Mock NextResponse for testing
const mockNextResponse = {
  json: (data, init) => {
    const response = new Response(JSON.stringify(data), {
      status: init?.status || 200,
      headers: {
        'Content-Type': 'application/json',
        ...init?.headers,
      },
    });
    return response;
  },
  redirect: (url, status = 302) => {
    const response = new Response(null, {
      status,
      headers: {
        'Location': url,
      },
    });
    return response;
  },
};

// Global test setup
global.NextResponse = mockNextResponse;

// Increase timeout for async operations
jest.setTimeout(30000); 