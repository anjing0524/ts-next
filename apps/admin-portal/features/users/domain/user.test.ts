/**
 * Domain layer tests for User schemas
 */

import { describe, it, expect } from '@jest/globals';
import { CreateUserSchema, UpdateUserSchema, UserStatus } from './user';

describe('User Domain Layer', () => {
  describe('UserStatus Enum', () => {
    it('should have all required status values', () => {
      expect(UserStatus.ACTIVE).toBe('ACTIVE');
      expect(UserStatus.INACTIVE).toBe('INACTIVE');
      expect(UserStatus.SUSPENDED).toBe('SUSPENDED');
      expect(UserStatus.PENDING).toBe('PENDING');
    });
  });

  describe('CreateUserSchema', () => {
    describe('Valid inputs', () => {
      it('should accept valid user data with all fields', () => {
        const validUser = {
          username: 'testuser',
          password: 'password123',
          displayName: 'Test User',
          firstName: 'Test',
          lastName: 'User',
          organization: 'Test Org',
          department: 'Engineering',
          isActive: true,
          mustChangePassword: true,
          roleIds: ['cjld2cjxh0000qzrmn831i7rn'],
        };

        const result = CreateUserSchema.safeParse(validUser);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toMatchObject(validUser);
        }
      });

      it('should accept minimal required fields only', () => {
        const minimalUser = {
          username: 'testuser',
          displayName: 'Test User',
        };

        const result = CreateUserSchema.safeParse(minimalUser);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.username).toBe('testuser');
          expect(result.data.displayName).toBe('Test User');
          expect(result.data.isActive).toBe(true); // default value
          expect(result.data.mustChangePassword).toBe(true); // default value
          expect(result.data.roleIds).toEqual([]); // default value
        }
      });

      it('should accept username with exactly 3 characters', () => {
        const user = {
          username: 'abc',
          displayName: 'Test',
        };

        const result = CreateUserSchema.safeParse(user);
        expect(result.success).toBe(true);
      });

      it('should accept password with exactly 8 characters', () => {
        const user = {
          username: 'testuser',
          password: '12345678',
          displayName: 'Test',
        };

        const result = CreateUserSchema.safeParse(user);
        expect(result.success).toBe(true);
      });

      it('should accept empty optional fields', () => {
        const user = {
          username: 'testuser',
          displayName: 'Test',
          firstName: undefined,
          lastName: undefined,
          organization: undefined,
          department: undefined,
        };

        const result = CreateUserSchema.safeParse(user);
        expect(result.success).toBe(true);
      });

      it('should accept valid CUID role IDs', () => {
        const user = {
          username: 'testuser',
          displayName: 'Test',
          roleIds: [
            'cjld2cjxh0000qzrmn831i7rn',
            'cjld2cyuq0000t3rmniod1foy',
            'cjld2cz2d0000t3rmn7j2i9rk',
          ],
        };

        const result = CreateUserSchema.safeParse(user);
        expect(result.success).toBe(true);
      });
    });

    describe('Invalid inputs', () => {
      it('should reject username shorter than 3 characters', () => {
        const user = {
          username: 'ab',
          displayName: 'Test',
        };

        const result = CreateUserSchema.safeParse(user);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('用户名至少需要3个字符');
        }
      });

      it('should reject password shorter than 8 characters', () => {
        const user = {
          username: 'testuser',
          password: '1234567',
          displayName: 'Test',
        };

        const result = CreateUserSchema.safeParse(user);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('密码至少需要8个字符');
        }
      });

      it('should reject empty displayName', () => {
        const user = {
          username: 'testuser',
          displayName: '',
        };

        const result = CreateUserSchema.safeParse(user);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('显示名称不能为空');
        }
      });

      it('should reject missing username', () => {
        const user = {
          displayName: 'Test User',
        };

        const result = CreateUserSchema.safeParse(user);
        expect(result.success).toBe(false);
      });

      it('should reject missing displayName', () => {
        const user = {
          username: 'testuser',
        };

        const result = CreateUserSchema.safeParse(user);
        expect(result.success).toBe(false);
      });

      it('should reject invalid CUID format in roleIds', () => {
        const user = {
          username: 'testuser',
          displayName: 'Test',
          roleIds: ['invalid-cuid', 'not-a-cuid'],
        };

        const result = CreateUserSchema.safeParse(user);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('无效的角色ID');
        }
      });

      it('should reject non-boolean isActive', () => {
        const user = {
          username: 'testuser',
          displayName: 'Test',
          isActive: 'true' as any,
        };

        const result = CreateUserSchema.safeParse(user);
        expect(result.success).toBe(false);
      });

      it('should reject non-boolean mustChangePassword', () => {
        const user = {
          username: 'testuser',
          displayName: 'Test',
          mustChangePassword: 1 as any,
        };

        const result = CreateUserSchema.safeParse(user);
        expect(result.success).toBe(false);
      });

      it('should reject non-array roleIds', () => {
        const user = {
          username: 'testuser',
          displayName: 'Test',
          roleIds: 'cjld2cjxh0000qzrmn831i7rn' as any,
        };

        const result = CreateUserSchema.safeParse(user);
        expect(result.success).toBe(false);
      });
    });
  });

  describe('UpdateUserSchema', () => {
    describe('Valid inputs', () => {
      it('should accept all optional fields', () => {
        const update = {
          displayName: 'Updated Name',
          firstName: 'Updated',
          lastName: 'Name',
          organization: 'New Org',
          department: 'Sales',
          isActive: false,
          mustChangePassword: false,
          roleIds: ['cjld2cjxh0000qzrmn831i7rn'],
        };

        const result = UpdateUserSchema.safeParse(update);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toMatchObject(update);
        }
      });

      it('should accept empty object (all fields optional)', () => {
        const update = {};

        const result = UpdateUserSchema.safeParse(update);
        expect(result.success).toBe(true);
      });

      it('should accept partial updates', () => {
        const update = {
          displayName: 'New Name',
        };

        const result = UpdateUserSchema.safeParse(update);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.displayName).toBe('New Name');
        }
      });

      it('should accept multiple roleIds', () => {
        const update = {
          roleIds: [
            'cjld2cjxh0000qzrmn831i7rn',
            'cjld2cyuq0000t3rmniod1foy',
          ],
        };

        const result = UpdateUserSchema.safeParse(update);
        expect(result.success).toBe(true);
      });

      it('should accept empty roleIds array', () => {
        const update = {
          roleIds: [],
        };

        const result = UpdateUserSchema.safeParse(update);
        expect(result.success).toBe(true);
      });
    });

    describe('Invalid inputs', () => {
      it('should reject empty displayName', () => {
        const update = {
          displayName: '',
        };

        const result = UpdateUserSchema.safeParse(update);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('显示名称不能为空');
        }
      });

      it('should reject invalid CUID in roleIds', () => {
        const update = {
          roleIds: ['invalid-cuid-format'],
        };

        const result = UpdateUserSchema.safeParse(update);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('无效的角色ID');
        }
      });

      it('should reject non-boolean isActive', () => {
        const update = {
          isActive: 'yes' as any,
        };

        const result = UpdateUserSchema.safeParse(update);
        expect(result.success).toBe(false);
      });

      it('should reject non-boolean mustChangePassword', () => {
        const update = {
          mustChangePassword: 0 as any,
        };

        const result = UpdateUserSchema.safeParse(update);
        expect(result.success).toBe(false);
      });

      it('should reject non-array roleIds', () => {
        const update = {
          roleIds: 'single-role' as any,
        };

        const result = UpdateUserSchema.safeParse(update);
        expect(result.success).toBe(false);
      });
    });
  });
});
