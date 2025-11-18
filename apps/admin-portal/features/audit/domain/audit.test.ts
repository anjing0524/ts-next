/**
 * Domain layer tests for Audit schemas
 */

import { describe, it, expect } from '@jest/globals';
import { AuditLogSchema, AuditLogFilterSchema } from './audit';

describe('Audit Domain Layer', () => {
  describe('AuditLogSchema', () => {
    describe('Valid inputs', () => {
      it('should accept valid audit log with all fields', () => {
        const validLog = {
          id: '550e8400-e29b-41d4-a716-446655440000',
          timestamp: new Date('2024-01-01T00:00:00Z'),
          userId: 'cjld2cjxh0000qzrmn831i7rn',
          actorType: 'USER',
          actorId: 'cjld2cjxh0000qzrmn831i7rn',
          action: 'CREATE',
          resourceType: 'USER',
          resourceId: 'cjld2cyuq0000t3rmniod1foy',
          details: { field: 'value' },
          status: 'SUCCESS',
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
        };

        const result = AuditLogSchema.safeParse(validLog);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toMatchObject(validLog);
        }
      });

      it('should accept audit log with null optional fields', () => {
        const log = {
          id: '550e8400-e29b-41d4-a716-446655440000',
          timestamp: new Date(),
          userId: null,
          actorType: 'SYSTEM',
          actorId: 'system',
          action: 'UPDATE',
          resourceType: null,
          resourceId: null,
          details: null,
          status: 'SUCCESS',
          ipAddress: null,
          userAgent: null,
        };

        const result = AuditLogSchema.safeParse(log);
        expect(result.success).toBe(true);
      });

      it('should accept various detail types (JSON)', () => {
        const logWithStringDetails = {
          id: '550e8400-e29b-41d4-a716-446655440000',
          timestamp: new Date(),
          userId: null,
          actorType: 'USER',
          actorId: 'user123',
          action: 'LOGIN',
          resourceType: null,
          resourceId: null,
          details: 'simple string',
          status: 'SUCCESS',
          ipAddress: null,
          userAgent: null,
        };

        expect(AuditLogSchema.safeParse(logWithStringDetails).success).toBe(true);

        const logWithObjectDetails = {
          ...logWithStringDetails,
          details: { nested: { object: 'value' } },
        };

        expect(AuditLogSchema.safeParse(logWithObjectDetails).success).toBe(true);

        const logWithArrayDetails = {
          ...logWithStringDetails,
          details: [1, 2, 3, 'array'],
        };

        expect(AuditLogSchema.safeParse(logWithArrayDetails).success).toBe(true);
      });

      it('should accept valid UUID v4 format', () => {
        const log = {
          id: '123e4567-e89b-12d3-a456-426614174000',
          timestamp: new Date(),
          userId: null,
          actorType: 'SYSTEM',
          actorId: 'system',
          action: 'DELETE',
          resourceType: null,
          resourceId: null,
          details: null,
          status: 'FAILURE',
          ipAddress: null,
          userAgent: null,
        };

        const result = AuditLogSchema.safeParse(log);
        expect(result.success).toBe(true);
      });

      it('should accept IPv4 address', () => {
        const log = {
          id: '550e8400-e29b-41d4-a716-446655440000',
          timestamp: new Date(),
          userId: null,
          actorType: 'USER',
          actorId: 'user1',
          action: 'VIEW',
          resourceType: null,
          resourceId: null,
          details: null,
          status: 'SUCCESS',
          ipAddress: '10.0.0.1',
          userAgent: null,
        };

        const result = AuditLogSchema.safeParse(log);
        expect(result.success).toBe(true);
      });

      it('should accept IPv6 address', () => {
        const log = {
          id: '550e8400-e29b-41d4-a716-446655440000',
          timestamp: new Date(),
          userId: null,
          actorType: 'USER',
          actorId: 'user1',
          action: 'VIEW',
          resourceType: null,
          resourceId: null,
          details: null,
          status: 'SUCCESS',
          ipAddress: '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
          userAgent: null,
        };

        const result = AuditLogSchema.safeParse(log);
        expect(result.success).toBe(true);
      });
    });

    describe('Invalid inputs', () => {
      it('should reject invalid UUID format', () => {
        const log = {
          id: 'not-a-uuid',
          timestamp: new Date(),
          userId: null,
          actorType: 'USER',
          actorId: 'user1',
          action: 'CREATE',
          resourceType: null,
          resourceId: null,
          details: null,
          status: 'SUCCESS',
          ipAddress: null,
          userAgent: null,
        };

        const result = AuditLogSchema.safeParse(log);
        expect(result.success).toBe(false);
      });

      it('should reject non-Date timestamp', () => {
        const log = {
          id: '550e8400-e29b-41d4-a716-446655440000',
          timestamp: '2024-01-01' as any,
          userId: null,
          actorType: 'USER',
          actorId: 'user1',
          action: 'CREATE',
          resourceType: null,
          resourceId: null,
          details: null,
          status: 'SUCCESS',
          ipAddress: null,
          userAgent: null,
        };

        const result = AuditLogSchema.safeParse(log);
        expect(result.success).toBe(false);
      });

      it('should reject missing required fields', () => {
        const incompleteLog = {
          id: '550e8400-e29b-41d4-a716-446655440000',
          timestamp: new Date(),
        };

        const result = AuditLogSchema.safeParse(incompleteLog);
        expect(result.success).toBe(false);
      });
    });
  });

  describe('AuditLogFilterSchema', () => {
    describe('Valid inputs', () => {
      it('should accept all filter fields', () => {
        const filter = {
          search: 'test query',
          page: 1,
          limit: 20,
          userId: 'cjld2cjxh0000qzrmn831i7rn',
          action: 'CREATE',
          status: 'SUCCESS' as const,
          startDate: new Date('2024-01-01'),
          endDate: new Date('2024-12-31'),
        };

        const result = AuditLogFilterSchema.safeParse(filter);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toMatchObject(filter);
        }
      });

      it('should accept empty filter object', () => {
        const filter = {};

        const result = AuditLogFilterSchema.safeParse(filter);
        expect(result.success).toBe(true);
      });

      it('should accept only search field', () => {
        const filter = {
          search: 'user login',
        };

        const result = AuditLogFilterSchema.safeParse(filter);
        expect(result.success).toBe(true);
      });

      it('should accept only pagination fields', () => {
        const filter = {
          page: 2,
          limit: 50,
        };

        const result = AuditLogFilterSchema.safeParse(filter);
        expect(result.success).toBe(true);
      });

      it('should accept all valid status enum values', () => {
        const statuses = ['SUCCESS', 'FAILURE', 'PENDING', 'ACCESS_DENIED'] as const;

        statuses.forEach(status => {
          const filter = { status };
          const result = AuditLogFilterSchema.safeParse(filter);
          expect(result.success).toBe(true);
        });
      });

      it('should accept valid CUID for userId', () => {
        const filter = {
          userId: 'cjld2cjxh0000qzrmn831i7rn',
        };

        const result = AuditLogFilterSchema.safeParse(filter);
        expect(result.success).toBe(true);
      });

      it('should accept date range filters', () => {
        const filter = {
          startDate: new Date('2024-01-01'),
          endDate: new Date('2024-01-31'),
        };

        const result = AuditLogFilterSchema.safeParse(filter);
        expect(result.success).toBe(true);
      });

      it('should accept empty string for search', () => {
        const filter = {
          search: '',
        };

        const result = AuditLogFilterSchema.safeParse(filter);
        expect(result.success).toBe(true);
      });
    });

    describe('Invalid inputs', () => {
      it('should reject negative page number', () => {
        const filter = {
          page: -1,
        };

        const result = AuditLogFilterSchema.safeParse(filter);
        expect(result.success).toBe(false);
      });

      it('should reject zero page number', () => {
        const filter = {
          page: 0,
        };

        const result = AuditLogFilterSchema.safeParse(filter);
        expect(result.success).toBe(false);
      });

      it('should reject negative limit', () => {
        const filter = {
          limit: -10,
        };

        const result = AuditLogFilterSchema.safeParse(filter);
        expect(result.success).toBe(false);
      });

      it('should reject zero limit', () => {
        const filter = {
          limit: 0,
        };

        const result = AuditLogFilterSchema.safeParse(filter);
        expect(result.success).toBe(false);
      });

      it('should reject decimal page number', () => {
        const filter = {
          page: 1.5,
        };

        const result = AuditLogFilterSchema.safeParse(filter);
        expect(result.success).toBe(false);
      });

      it('should reject decimal limit', () => {
        const filter = {
          limit: 10.5,
        };

        const result = AuditLogFilterSchema.safeParse(filter);
        expect(result.success).toBe(false);
      });

      it('should reject invalid status enum value', () => {
        const filter = {
          status: 'INVALID_STATUS' as any,
        };

        const result = AuditLogFilterSchema.safeParse(filter);
        expect(result.success).toBe(false);
      });

      it('should reject invalid CUID for userId', () => {
        const filter = {
          userId: 'invalid-cuid-format',
        };

        const result = AuditLogFilterSchema.safeParse(filter);
        expect(result.success).toBe(false);
      });

      it('should reject non-Date startDate', () => {
        const filter = {
          startDate: '2024-01-01' as any,
        };

        const result = AuditLogFilterSchema.safeParse(filter);
        expect(result.success).toBe(false);
      });

      it('should reject non-Date endDate', () => {
        const filter = {
          endDate: '2024-01-31' as any,
        };

        const result = AuditLogFilterSchema.safeParse(filter);
        expect(result.success).toBe(false);
      });

      it('should reject non-string search', () => {
        const filter = {
          search: 123 as any,
        };

        const result = AuditLogFilterSchema.safeParse(filter);
        expect(result.success).toBe(false);
      });

      it('should reject non-string action', () => {
        const filter = {
          action: ['CREATE'] as any,
        };

        const result = AuditLogFilterSchema.safeParse(filter);
        expect(result.success).toBe(false);
      });
    });
  });
});
