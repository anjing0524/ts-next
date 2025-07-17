import { NextRequest } from 'next/server';
import { GET } from '../../app/api/v2/audit-logs/route';
import { createTestUser, createTestClient, cleanupTestData } from '../setup/test-data';
import { getPrismaClient } from '../setup/test-helpers';

describe('GET /api/v2/audit-logs', () => {
  let prisma;

  beforeAll(async () => {
    prisma = getPrismaClient();
  });

  afterAll(async () => {
    await cleanupTestData();
  });

  it('should return 404 because it is not implemented yet', async () => {
    const req = new NextRequest('http://localhost/api/v2/audit-logs');
    const res = await GET(req);
    expect(res.status).toBe(404);
  });
});
