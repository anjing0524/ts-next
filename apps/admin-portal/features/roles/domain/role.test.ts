/**
 * Domain layer tests for Role schemas
 */

import { describe, it, expect } from '@jest/globals';
import { CreateRoleSchema, UpdateRoleSchema } from './role';

describe('Role Domain Layer', () => {
  describe('CreateRoleSchema', () => {
    describe('Valid inputs', () => {
      it('should accept valid role data with all fields', () => {
        const validRole = {
          name: 'test_role',
          displayName: 'Test Role',
          description: 'A test role for testing',
          permissionIds: ['cjld2cjxh0000qzrmn831i7rn'],
        };

        const result = CreateRoleSchema.safeParse(validRole);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toMatchObject(validRole);
        }
      });

      it('should accept minimal required fields only', () => {
        const minimalRole = {
          name: 'admin',
          displayName: 'Administrator',
        };

        const result = CreateRoleSchema.safeParse(minimalRole);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.name).toBe('admin');
          expect(result.data.displayName).toBe('Administrator');
          expect(result.data.permissionIds).toEqual([]); // default value
        }
      });

      it('should accept role name with exactly 3 characters', () => {
        const role = {
          name: 'abc',
          displayName: 'Test',
        };

        const result = CreateRoleSchema.safeParse(role);
        expect(result.success).toBe(true);
      });

      it('should accept role name with underscores', () => {
        const role = {
          name: 'super_admin_role',
          displayName: 'Super Admin',
        };

        const result = CreateRoleSchema.safeParse(role);
        expect(result.success).toBe(true);
      });

      it('should accept role name with all lowercase letters', () => {
        const role = {
          name: 'abcdefghijklmnopqrstuvwxyz',
          displayName: 'Alphabet',
        };

        const result = CreateRoleSchema.safeParse(role);
        expect(result.success).toBe(true);
      });

      it('should accept empty description', () => {
        const role = {
          name: 'test',
          displayName: 'Test',
          description: undefined,
        };

        const result = CreateRoleSchema.safeParse(role);
        expect(result.success).toBe(true);
      });

      it('should accept valid CUID permission IDs', () => {
        const role = {
          name: 'test_role',
          displayName: 'Test',
          permissionIds: [
            'cjld2cjxh0000qzrmn831i7rn',
            'cjld2cyuq0000t3rmniod1foy',
            'cjld2cz2d0000t3rmn7j2i9rk',
          ],
        };

        const result = CreateRoleSchema.safeParse(role);
        expect(result.success).toBe(true);
      });

      it('should accept empty permissionIds array (default)', () => {
        const role = {
          name: 'test',
          displayName: 'Test',
        };

        const result = CreateRoleSchema.safeParse(role);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.permissionIds).toEqual([]);
        }
      });
    });

    describe('Invalid inputs', () => {
      it('should reject role name shorter than 3 characters', () => {
        const role = {
          name: 'ab',
          displayName: 'Test',
        };

        const result = CreateRoleSchema.safeParse(role);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('角色名称至少需要3个字符');
        }
      });

      it('should reject role name with uppercase letters', () => {
        const role = {
          name: 'TestRole',
          displayName: 'Test',
        };

        const result = CreateRoleSchema.safeParse(role);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('角色名称只能包含小写字母和下划线');
        }
      });

      it('should reject role name with numbers', () => {
        const role = {
          name: 'test_role_123',
          displayName: 'Test',
        };

        const result = CreateRoleSchema.safeParse(role);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('角色名称只能包含小写字母和下划线');
        }
      });

      it('should reject role name with spaces', () => {
        const role = {
          name: 'test role',
          displayName: 'Test',
        };

        const result = CreateRoleSchema.safeParse(role);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('角色名称只能包含小写字母和下划线');
        }
      });

      it('should reject role name with hyphens', () => {
        const role = {
          name: 'test-role',
          displayName: 'Test',
        };

        const result = CreateRoleSchema.safeParse(role);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('角色名称只能包含小写字母和下划线');
        }
      });

      it('should reject role name with special characters', () => {
        const role = {
          name: 'test@role',
          displayName: 'Test',
        };

        const result = CreateRoleSchema.safeParse(role);
        expect(result.success).toBe(false);
      });

      it('should reject empty displayName', () => {
        const role = {
          name: 'test',
          displayName: '',
        };

        const result = CreateRoleSchema.safeParse(role);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('角色显示名称不能为空');
        }
      });

      it('should reject missing name', () => {
        const role = {
          displayName: 'Test Role',
        };

        const result = CreateRoleSchema.safeParse(role);
        expect(result.success).toBe(false);
      });

      it('should reject missing displayName', () => {
        const role = {
          name: 'test_role',
        };

        const result = CreateRoleSchema.safeParse(role);
        expect(result.success).toBe(false);
      });

      it('should reject invalid CUID format in permissionIds', () => {
        const role = {
          name: 'test',
          displayName: 'Test',
          permissionIds: ['invalid-cuid', 'not-a-cuid'],
        };

        const result = CreateRoleSchema.safeParse(role);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('无效的权限ID');
        }
      });

      it('should reject non-array permissionIds', () => {
        const role = {
          name: 'test',
          displayName: 'Test',
          permissionIds: 'single-permission' as any,
        };

        const result = CreateRoleSchema.safeParse(role);
        expect(result.success).toBe(false);
      });
    });
  });

  describe('UpdateRoleSchema', () => {
    describe('Valid inputs', () => {
      it('should accept all optional fields', () => {
        const update = {
          displayName: 'Updated Role',
          description: 'Updated description',
          permissionIds: ['cjld2cjxh0000qzrmn831i7rn'],
        };

        const result = UpdateRoleSchema.safeParse(update);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toMatchObject(update);
        }
      });

      it('should accept empty object (all fields optional)', () => {
        const update = {};

        const result = UpdateRoleSchema.safeParse(update);
        expect(result.success).toBe(true);
      });

      it('should accept partial updates', () => {
        const update = {
          displayName: 'New Name',
        };

        const result = UpdateRoleSchema.safeParse(update);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.displayName).toBe('New Name');
        }
      });

      it('should accept description update only', () => {
        const update = {
          description: 'New description',
        };

        const result = UpdateRoleSchema.safeParse(update);
        expect(result.success).toBe(true);
      });

      it('should accept permissionIds update only', () => {
        const update = {
          permissionIds: [
            'cjld2cjxh0000qzrmn831i7rn',
            'cjld2cyuq0000t3rmniod1foy',
          ],
        };

        const result = UpdateRoleSchema.safeParse(update);
        expect(result.success).toBe(true);
      });

      it('should accept empty permissionIds array', () => {
        const update = {
          permissionIds: [],
        };

        const result = UpdateRoleSchema.safeParse(update);
        expect(result.success).toBe(true);
      });

      it('should accept empty description string', () => {
        const update = {
          description: '',
        };

        const result = UpdateRoleSchema.safeParse(update);
        expect(result.success).toBe(true);
      });
    });

    describe('Invalid inputs', () => {
      it('should reject empty displayName', () => {
        const update = {
          displayName: '',
        };

        const result = UpdateRoleSchema.safeParse(update);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('角色显示名称不能为空');
        }
      });

      it('should reject invalid CUID in permissionIds', () => {
        const update = {
          permissionIds: ['invalid-cuid-format'],
        };

        const result = UpdateRoleSchema.safeParse(update);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('无效的权限ID');
        }
      });

      it('should reject non-array permissionIds', () => {
        const update = {
          permissionIds: 'single-permission' as any,
        };

        const result = UpdateRoleSchema.safeParse(update);
        expect(result.success).toBe(false);
      });

      it('should reject non-string displayName', () => {
        const update = {
          displayName: 123 as any,
        };

        const result = UpdateRoleSchema.safeParse(update);
        expect(result.success).toBe(false);
      });

      it('should reject non-string description', () => {
        const update = {
          description: ['array'] as any,
        };

        const result = UpdateRoleSchema.safeParse(update);
        expect(result.success).toBe(false);
      });
    });
  });
});
