// app/api/v2/system/health/database/route.test.ts
import { describe, it, expect, vi } from 'vitest';
import { GET } from './route'; // Adjust path based on your actual file structure
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma'; // Import prisma to potentially mock its methods

describe('GET /api/v2/system/health/database', () => {
  it('should return 200 and status "ok" if database connection is successful', async () => {
    // This test relies on the actual database connection configured for the test environment.
    // If prisma.$queryRaw`SELECT 1` succeeds, this test passes.
    const request = new NextRequest('http://localhost/api/v2/system/health/database');
    const response = await GET(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('ok');
    expect(body.message).toBe('Database connection successful.');
    expect(body.timestamp).toBeTypeOf('string');
  });

  it('should return 503 and status "error" if database connection fails', async () => {
    // To test this, we need to mock prisma.$queryRaw to throw an error.
    const mockQueryRaw = vi.spyOn(prisma, '$queryRaw').mockRejectedValueOnce(new Error("Simulated DB connection error"));

    const request = new NextRequest('http://localhost/api/v2/system/health/database');
    const response = await GET(request);

    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.status).toBe('error');
    expect(body.message).toBe('Failed to connect to the database.');
    expect(body.details).toBe('Simulated DB connection error');
    expect(body.timestamp).toBeTypeOf('string');

    mockQueryRaw.mockRestore(); // Restore original implementation
  });
});
