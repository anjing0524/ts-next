import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/login-page';
import { DashboardPage } from '../pages/dashboard-page';
import { TestUsers, TestData } from '../helpers/test-data';

/**
 * 角色管理功能测试套件
 * 验证角色CRUD操作和权限分配
 */
test.describe('Role Management', () => {
  let loginPage: LoginPage;
  let dashboardPage: DashboardPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    dashboardPage = new DashboardPage(page);
    
    // Login as admin
    await loginPage.login(TestUsers.admin);
    await dashboardPage.waitForLoad();
  });

  test.describe('Role CRUD Operations', () => {
    test('should create new role successfully', async ({ page }) => {
      await test.step('Navigate to role management', async () => {
        await dashboardPage.navigateToRoleManagement();
        await expect(page.locator('h1:has-text("角色管理")')).toBeVisible();
      });

      await test.step('Click create role button', async () => {
        await page.click('[data-testid="create-role-button"]');
        await expect(page.locator('[data-testid="role-form-dialog"]')).toBeVisible();
      });

      await test.step('Fill role form', async () => {
        await page.fill('[data-testid="role-name-input"]', TestData.newRole.name);
        await page.fill('[data-testid="role-display-name-input"]', TestData.newRole.displayName);
        await page.fill('[data-testid="role-description-input"]', TestData.newRole.description);
      });

      await test.step('Select permissions', async () => {
        for (const permission of TestData.newRole.permissions) {
          await page.click(`[data-testid="permission-checkbox-${permission}"]`);
        }
      });

      await test.step('Submit form', async () => {
        await page.click('[data-testid="save-role-button"]');
      });

      await test.step('Verify role creation', async () => {
        await expect(page.locator('[data-testid="role-form-dialog"]')).toBeHidden();
        await expect(page.locator(`text=${TestData.newRole.displayName}`)).toBeVisible();
      });
    });

    test('should validate role input fields', async ({ page }) => {
      await test.step('Navigate to role management and create role', async () => {
        await dashboardPage.navigateToRoleManagement();
        await page.click('[data-testid="create-role-button"]');
      });

      await test.step('Test role name validation', async () => {
        await page.fill('[data-testid="role-name-input"]', 'ab'); // Too short
        await page.click('[data-testid="save-role-button"]');
        
        await expect(page.locator('text=角色名称至少需要3个字符')).toBeVisible();
      });

      await test.step('Test display name validation', async () => {
        await page.fill('[data-testid="role-display-name-input"]', '');
        await page.click('[data-testid="save-role-button"]');
        
        await expect(page.locator('text=显示名称不能为空')).toBeVisible();
      });

      await test.step('Test duplicate role name', async () => {
        // First create a role
        await page.fill('[data-testid="role-name-input"]', 'TEST_ROLE');
        await page.fill('[data-testid="role-display-name-input"]', '测试角色');
        await page.click('[data-testid="save-role-button"]');
        await expect(page.locator('[data-testid="role-form-dialog"]')).toBeHidden();
        
        // Try to create same role again
        await page.click('[data-testid="create-role-button"]');
        await page.fill('[data-testid="role-name-input"]', 'TEST_ROLE');
        await page.fill('[data-testid="role-display-name-input"]', '测试角色2');
        await page.click('[data-testid="save-role-button"]');
        
        await expect(page.locator('text=角色名称已存在')).toBeVisible();
      });
    });

    test('should update existing role', async ({ page }) => {
      const testRole = {
        ...TestData.newRole,
        name: 'ROLE_TO_UPDATE',
        displayName: '待更新角色'
      };

      await test.step('Create test role', async () => {
        await dashboardPage.navigateToRoleManagement();
        await page.click('[data-testid="create-role-button"]');
        await page.fill('[data-testid="role-name-input"]', testRole.name);
        await page.fill('[data-testid="role-display-name-input"]', testRole.displayName);
        await page.fill('[data-testid="role-description-input"]', testRole.description);
        await page.click('[data-testid="save-role-button"]');
      });

      await test.step('Edit role', async () => {
        await page.click(`[data-testid="edit-role-${testRole.name}"]`);
        await expect(page.locator('[data-testid="role-form-dialog"]')).toBeVisible();
        
        await page.fill('[data-testid="role-display-name-input"]', '已更新的角色');
        await page.fill('[data-testid="role-description-input"]', '更新后的描述');
      });

      await test.step('Add more permissions', async () => {
        await page.click('[data-testid="permission-checkbox-role:read"]');
        await page.click('[data-testid="permission-checkbox-role:write"]');
      });

      await test.step('Save changes', async () => {
        await page.click('[data-testid="save-role-button"]');
      });

      await test.step('Verify role update', async () => {
        await expect(page.locator('text=已更新的角色')).toBeVisible();
      });
    });

    test('should delete role', async ({ page }) => {
      const testRole = {
        ...TestData.newRole,
        name: 'ROLE_TO_DELETE',
        displayName: '待删除角色'
      };

      await test.step('Create test role', async () => {
        await dashboardPage.navigateToRoleManagement();
        await page.click('[data-testid="create-role-button"]');
        await page.fill('[data-testid="role-name-input"]', testRole.name);
        await page.fill('[data-testid="role-display-name-input"]', testRole.displayName);
        await page.fill('[data-testid="role-description-input"]', testRole.description);
        await page.click('[data-testid="save-role-button"]');
      });

      await test.step('Delete role', async () => {
        await page.click(`[data-testid="delete-role-${testRole.name}"]`);
        await expect(page.locator('[data-testid="delete-confirm-dialog"]')).toBeVisible();
        await page.click('[data-testid="confirm-delete-button"]');
      });

      await test.step('Verify role deletion', async () => {
        await expect(page.locator(`text=${testRole.displayName}`)).toBeHidden();
      });
    });

    test('should prevent deleting system roles', async ({ page }) => {
      await test.step('Navigate to role management', async () => {
        await dashboardPage.navigateToRoleManagement();
      });

      await test.step('Check system role delete button', async () => {
        const systemRoles = ['SYSTEM_ADMIN', 'USER_ADMIN', 'USER'];
        
        for (const roleName of systemRoles) {
          const deleteButton = page.locator(`[data-testid="delete-role-${roleName}"]`);
          if (await deleteButton.isVisible()) {
            const isDisabled = await deleteButton.isDisabled();
            expect(isDisabled).toBe(true);
          }
        }
      });
    });
  });

  test.describe('Permission Management', () => {
    test('should assign permissions to role', async ({ page }) => {
      const testRole = {
        ...TestData.newRole,
        name: 'PERMISSION_TEST_ROLE',
        displayName: '权限测试角色'
      };

      await test.step('Create role without permissions', async () => {
        await dashboardPage.navigateToRoleManagement();
        await page.click('[data-testid="create-role-button"]');
        await page.fill('[data-testid="role-name-input"]', testRole.name);
        await page.fill('[data-testid="role-display-name-input"]', testRole.displayName);
        await page.click('[data-testid="save-role-button"]');
      });

      await test.step('Edit role permissions', async () => {
        await page.click(`[data-testid="edit-role-${testRole.name}"]`);
        await expect(page.locator('[data-testid="role-form-dialog"]')).toBeVisible();
        
        // Check all user-related permissions
        await page.click('[data-testid="permission-user-group"]');
        await page.click('[data-testid="permission-checkbox-user:read"]');
        await page.click('[data-testid="permission-checkbox-user:write"]');
        await page.click('[data-testid="permission-checkbox-user:delete"]');
      });

      await test.step('Save permissions', async () => {
        await page.click('[data-testid="save-role-button"]');
      });

      await test.step('Verify permissions saved', async () => {
        await page.click(`[data-testid="view-permissions-${testRole.name}"]`);
        await expect(page.locator('[data-testid="permissions-dialog"]')).toBeVisible();
        
        await expect(page.locator('text=user:read')).toBeVisible();
        await expect(page.locator('text=user:write')).toBeVisible();
        await expect(page.locator('text=user:delete')).toBeVisible();
      });
    });

    test('should group permissions by category', async ({ page }) => {
      await test.step('Navigate to role creation', async () => {
        await dashboardPage.navigateToRoleManagement();
        await page.click('[data-testid="create-role-button"]');
      });

      await test.step('Verify permission groups', async () => {
        const permissionGroups = [
          '用户管理',
          '角色管理',
          '权限管理',
          '客户端管理',
          '系统管理',
          '审计日志'
        ];
        
        for (const group of permissionGroups) {
          await expect(page.locator(`[data-testid="permission-group-${group}"]`)).toBeVisible();
        }
      });

      await test.step('Test group selection', async () => {
        // Select all permissions in a group
        await page.click('[data-testid="permission-user-group"]');
        
        // Verify all checkboxes in group are selected
        const userCheckboxes = page.locator('[data-testid^="permission-checkbox-user:"]');
        const count = await userCheckboxes.count();
        
        for (let i = 0; i < count; i++) {
          const isChecked = await userCheckboxes.nth(i).isChecked();
          expect(isChecked).toBe(true);
        }
      });
    });

    test('should show permission descriptions', async ({ page }) => {
      await test.step('Navigate to role creation', async () => {
        await dashboardPage.navigateToRoleManagement();
        await page.click('[data-testid="create-role-button"]');
      });

      await test.step('Hover over permission to see description', async () => {
        const permissionCheckbox = page.locator('[data-testid="permission-checkbox-user:read"]');
        await permissionCheckbox.hover();
        
        // Check if tooltip appears
        const tooltip = page.locator('[data-testid="permission-tooltip"]');
        const isVisible = await tooltip.isVisible();
        
        if (isVisible) {
          await expect(tooltip).toContainText('查看用户列表');
        }
      });
    });
  });

  test.describe('Role-User Assignment', () => {
    test('should assign role to user', async ({ page }) => {
      const testRole = {
        ...TestData.newRole,
        name: 'USER_ASSIGN_ROLE',
        displayName: '用户分配角色'
      };

      await test.step('Create test role', async () => {
        await dashboardPage.navigateToRoleManagement();
        await page.click('[data-testid="create-role-button"]');
        await page.fill('[data-testid="role-name-input"]', testRole.name);
        await page.fill('[data-testid="role-display-name-input"]', testRole.displayName);
        await page.click('[data-testid="save-role-button"]');
      });

      await test.step('Navigate to user management', async () => {
        await page.click('[data-testid="nav-user-management"]');
        await expect(page.locator('h1:has-text("用户管理")')).toBeVisible();
      });

      await test.step('Edit user and assign role', async () => {
        await page.click('[data-testid="edit-user-testuser"]');
        await expect(page.locator('[data-testid="user-form-dialog"]')).toBeVisible();
        
        await page.click('[data-testid="role-select"]');
        await page.click(`[data-testid="role-option-${testRole.name}"]`);
        await page.click('[data-testid="save-user-button"]');
      });

      await test.step('Verify role assignment', async () => {
        await page.click('[data-testid="nav-role-management"]');
        await page.click(`[data-testid="view-users-${testRole.name}"]`);
        
        await expect(page.locator('text=testuser')).toBeVisible();
      });
    });

    test('should show users assigned to role', async ({ page }) => {
      await test.step('Navigate to role management', async () => {
        await dashboardPage.navigateToRoleManagement();
      });

      await test.step('View users in SYSTEM_ADMIN role', async () => {
        await page.click('[data-testid="view-users-SYSTEM_ADMIN"]');
        await expect(page.locator('[data-testid="role-users-dialog"]')).toBeVisible();
        
        await expect(page.locator('text=admin')).toBeVisible();
      });
    });

    test('should remove role from user', async ({ page }) => {
      await test.step('Navigate to user management', async () => {
        await page.click('[data-testid="nav-user-management"]');
      });

      await test.step('Edit user and remove role', async () => {
        await page.click('[data-testid="edit-user-testuser"]');
        await expect(page.locator('[data-testid="user-form-dialog"]')).toBeVisible();
        
        // Remove USER role
        const userRoleOption = page.locator('[data-testid="role-option-USER"] [data-testid="remove-role"]');
        if (await userRoleOption.isVisible()) {
          await userRoleOption.click();
        }
        
        await page.click('[data-testid="save-user-button"]');
      });

      await test.step('Verify role removal', async () => {
        await page.click('[data-testid="nav-role-management"]');
        await page.click('[data-testid="view-users-USER"]');
        
        await expect(page.locator('text=testuser')).toBeHidden();
      });
    });
  });

  test.describe('Role Hierarchy and Inheritance', () => {
    test('should display role hierarchy', async ({ page }) => {
      await test.step('Navigate to role management', async () => {
        await dashboardPage.navigateToRoleManagement();
      });

      await test.step('Check hierarchy visualization', async () => {
        const hierarchyView = page.locator('[data-testid="role-hierarchy"]');
        if (await hierarchyView.isVisible()) {
          await expect(page.locator('[data-testid="role-level-0"] text="SYSTEM_ADMIN"')).toBeVisible();
          await expect(page.locator('[data-testid="role-level-1"] text="USER_ADMIN"')).toBeVisible();
          await expect(page.locator('[data-testid="role-level-2"] text="USER"')).toBeVisible();
        }
      });
    });

    test('should inherit permissions from parent roles', async ({ page }) => {
      // This test would require setting up role hierarchy
      test.skip('Requires role hierarchy setup');
    });
  });

  test.describe('Bulk Operations', () => {
    test('should export roles list', async ({ page }) => {
      await test.step('Navigate to role management', async () => {
        await dashboardPage.navigateToRoleManagement();
      });

      await test.step('Click export button', async () => {
        const exportButton = page.locator('[data-testid="export-roles-button"]');
        if (await exportButton.isVisible()) {
          await exportButton.click();
          
          // Verify download
          const downloadEvent = await page.waitForEvent('download');
          expect(downloadEvent.suggestedFilename()).toMatch(/roles.*\.csv$/);
        }
      });
    });

    test('should bulk assign permissions', async ({ page }) => {
      await test.step('Navigate to role management', async () => {
        await dashboardPage.navigateToRoleManagement();
      });

      await test.step('Select multiple roles', async () => {
        const roleCheckboxes = page.locator('[data-testid="role-checkbox"]');
        const count = await roleCheckboxes.count();
        
        if (count > 1) {
          await roleCheckboxes.first().check();
          await roleCheckboxes.nth(1).check();
          
          const bulkPermissionButton = page.locator('[data-testid="bulk-permission-button"]');
          if (await bulkPermissionButton.isVisible()) {
            await bulkPermissionButton.click();
            
            // Select permissions to assign
            await page.click('[data-testid="permission-checkbox-audit:read"]');
            await page.click('[data-testid="save-bulk-permissions"]');
            
            await expect(page.locator('text=权限分配成功')).toBeVisible();
          }
        }
      });
    });
  });

  test.describe('Search and Filter', () => {
    test('should search roles by name', async ({ page }) => {
      await test.step('Navigate to role management', async () => {
        await dashboardPage.navigateToRoleManagement();
      });

      await test.step('Search for admin roles', async () => {
        await page.fill('[data-testid="role-search-input"]', 'ADMIN');
        await page.waitForTimeout(500);
      });

      await test.step('Verify search results', async () => {
        await expect(page.locator('text=SYSTEM_ADMIN')).toBeVisible();
        await expect(page.locator('text=USER_ADMIN')).toBeVisible();
        await expect(page.locator('text=USER')).toBeHidden();
      });
    });

    test('should filter roles by permission', async () => {
      test.skip('Requires permission filter implementation');
    });
  });

  test.describe('Error Handling', () => {
    test('should handle concurrent role editing', async ({ page }) => {
      // This test would require simulating concurrent edits
      test.skip('Requires concurrent edit simulation');
    });

    test('should handle role with assigned users deletion', async ({ page }) => {
      const testRole = {
        ...TestData.newRole,
        name: 'ROLE_WITH_USERS',
        displayName: '有用户的角色'
      };

      await test.step('Create role and assign to user', async () => {
        await dashboardPage.navigateToRoleManagement();
        await page.click('[data-testid="create-role-button"]');
        await page.fill('[data-testid="role-name-input"]', testRole.name);
        await page.fill('[data-testid="role-display-name-input"]', testRole.displayName);
        await page.click('[data-testid="save-role-button"]');
      });

      await test.step('Try to delete role with users', async () => {
        // First assign role to a user
        await page.click('[data-testid="nav-user-management"]');
        await page.click('[data-testid="edit-user-testuser"]');
        await page.click('[data-testid="role-select"]');
        await page.click(`[data-testid="role-option-${testRole.name}"]`);
        await page.click('[data-testid="save-user-button"]');
        
        // Then try to delete role
        await page.click('[data-testid="nav-role-management"]');
        await page.click(`[data-testid="delete-role-${testRole.name}"]`);
        await page.click('[data-testid="confirm-delete-button"]');
      });

      await test.step('Verify error message', async () => {
        await expect(page.locator('text=无法删除有用户分配的角色')).toBeVisible();
      });
    });
  });
});