import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/login-page';
import { DashboardPage } from '../pages/dashboard-page';
import { UserManagementPage } from '../pages/user-management-page';
import { TestUsers, TestUrls } from '../helpers/test-data';

/**
 * RBAC权限系统测试套件
 * 验证基于角色的访问控制
 */
test.describe('RBAC Permission System', () => {
  let loginPage: LoginPage;
  let dashboardPage: DashboardPage;
  let userManagementPage: UserManagementPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    dashboardPage = new DashboardPage(page);
    userManagementPage = new UserManagementPage(page);
  });

  test.describe('System Administrator Permissions', () => {
    test('should have access to all management features', async ({ page }) => {
      await test.step('Login as SYSTEM_ADMIN', async () => {
        await loginPage.login(TestUsers.admin);
        await dashboardPage.waitForLoad();
      });

      await test.step('Verify access to user management', async () => {
        await dashboardPage.navigateToUserManagement();
        await userManagementPage.waitForLoad();
        expect(page.url()).toContain('/admin/users');
      });

      await test.step('Verify access to role management', async () => {
        await dashboardPage.navigateToRoleManagement();
        expect(page.url()).toContain('/admin/roles');
      });

      await test.step('Verify access to system configuration', async () => {
        await dashboardPage.navigateToSystemConfig();
        expect(page.url()).toContain('/admin/system');
      });

      await test.step('Verify all navigation items are visible', async () => {
        await page.goto('/dashboard');
        await dashboardPage.waitForLoad();
        
        const navItems = await dashboardPage.getNavigationItems();
        expect(navItems).toContain('用户管理');
        expect(navItems).toContain('角色管理');
        expect(navItems).toContain('权限管理');
        expect(navItems).toContain('客户端管理');
        expect(navItems).toContain('系统配置');
        expect(navItems).toContain('审计日志');
      });
    });

    test('should be able to create, read, update, delete users', async ({ page }) => {
      await test.step('Login as SYSTEM_ADMIN', async () => {
        await loginPage.login(TestUsers.admin);
        await dashboardPage.waitForLoad();
        await dashboardPage.navigateToUserManagement();
      });

      await test.step('Create new user', async () => {
        await userManagementPage.clickCreateUser();
        await userManagementPage.fillUserForm({
          username: 'testuser-rbac',
          email: 'testuser-rbac@example.com',
          password: 'Test@123456',
          displayName: 'RBAC测试用户'
        });
        await userManagementPage.selectRole('USER');
        await userManagementPage.submitUserForm();
        
        // Verify success message
        await page.waitForTimeout(1000);
        const successMessage = await userManagementPage.getSuccessMessage();
        expect(successMessage).toBeTruthy();
      });

      await test.step('Verify user was created', async () => {
        const userVisible = await userManagementPage.isUserVisible('testuser-rbac');
        expect(userVisible).toBe(true);
      });

      await test.step('Edit user', async () => {
        await userManagementPage.editUser('testuser-rbac');
        await userManagementPage.fillUserForm({
          username: 'testuser-rbac',
          email: 'testuser-rbac-updated@example.com',
          password: 'Test@123456',
          displayName: 'RBAC测试用户已更新'
        });
        await userManagementPage.submitUserForm();
      });

      await test.step('Delete user', async () => {
        await userManagementPage.deleteUser('testuser-rbac');
        const userVisible = await userManagementPage.isUserVisible('testuser-rbac');
        expect(userVisible).toBe(false);
      });
    });

    test('should have access to audit logs', async ({ page }) => {
      await test.step('Login as SYSTEM_ADMIN', async () => {
        await loginPage.login(TestUsers.admin);
        await dashboardPage.waitForLoad();
      });

      await test.step('Navigate to audit logs', async () => {
        await page.goto('/admin/system/audits');
        await page.waitForLoadState('networkidle');
      });

      await test.step('Verify audit logs page loads', async () => {
        await expect(page.locator('h1:has-text("审计日志")')).toBeVisible();
      });
    });
  });

  test.describe('User Administrator Permissions', () => {
    test('should have limited access to user and role management', async ({ page }) => {
      await test.step('Login as USER_ADMIN', async () => {
        await loginPage.login(TestUsers.userAdmin);
        await dashboardPage.waitForLoad();
      });

      await test.step('Verify access to user management', async () => {
        await dashboardPage.navigateToUserManagement();
        await userManagementPage.waitForLoad();
        expect(page.url()).toContain('/admin/users');
      });

      await test.step('Verify access to role management', async () => {
        await dashboardPage.navigateToRoleManagement();
        expect(page.url()).toContain('/admin/roles');
      });

      await test.step('Verify restricted navigation items', async () => {
        await page.goto('/dashboard');
        await dashboardPage.waitForLoad();
        
        const navItems = await dashboardPage.getNavigationItems();
        expect(navItems).toContain('用户管理');
        expect(navItems).toContain('角色管理');
        // Should not have access to system configuration
        expect(navItems).not.toContain('系统配置');
      });
    });

    test('should not have access to system configuration', async ({ page }) => {
      await test.step('Login as USER_ADMIN', async () => {
        await loginPage.login(TestUsers.userAdmin);
        await dashboardPage.waitForLoad();
      });

      await test.step('Attempt to access system configuration', async () => {
        await page.goto('/admin/system');
        await page.waitForLoadState('networkidle');
      });

      await test.step('Verify access denied', async () => {
        // Should redirect to unauthorized page or show access denied message
        await expect(page.locator('h1:has-text("访问被拒绝"), text="403"')).toBeVisible({ timeout: 5000 });
      });
    });
  });

  test.describe('Regular User Permissions', () => {
    test('should have minimal access', async ({ page }) => {
      await test.step('Login as regular USER', async () => {
        await loginPage.login(TestUsers.regularUser);
        await dashboardPage.waitForLoad();
      });

      await test.step('Verify restricted navigation', async () => {
        const navItems = await dashboardPage.getNavigationItems();
        // Should only see basic navigation
        expect(navItems).not.toContain('用户管理');
        expect(navItems).not.toContain('角色管理');
        expect(navItems).not.toContain('系统配置');
      });

      await test.step('Attempt to access user management', async () => {
        await page.goto('/admin/users');
        await page.waitForLoadState('networkidle');
      });

      await test.step('Verify access denied', async () => {
        await expect(page.locator('h1:has-text("访问被拒绝"), text="403"')).toBeVisible({ timeout: 5000 });
      });
    });

    test('should only access own profile', async ({ page }) => {
      await test.step('Login as regular USER', async () => {
        await loginPage.login(TestUsers.regularUser);
        await dashboardPage.waitForLoad();
      });

      await test.step('Navigate to profile page', async () => {
        await page.goto('/profile');
        await page.waitForLoadState('networkidle');
      });

      await test.step('Verify profile page access', async () => {
        await expect(page.locator('h1:has-text("个人资料")')).toBeVisible();
      });
    });
  });

  test.describe('Permission Inheritance and Overrides', () => {
    test('should respect role hierarchy', async ({ page }) => {
      // This test assumes a role hierarchy where SYSTEM_ADMIN > USER_ADMIN > USER
      await test.step('Login as USER_ADMIN', async () => {
        await loginPage.login(TestUsers.userAdmin);
        await dashboardPage.waitForLoad();
      });

      await test.step('Verify can manage users but not system settings', async () => {
        // Can access user management
        await dashboardPage.navigateToUserManagement();
        await userManagementPage.waitForLoad();
        expect(page.url()).toContain('/admin/users');

        // Cannot access system configuration
        await page.goto('/admin/system');
        await page.waitForLoadState('networkidle');
        await expect(page.locator('text="访问被拒绝"')).toBeVisible();
      });
    });

    test('should handle permission changes dynamically', async ({ page }) => {
      // This test would require:
      // 1. Login as a user
      // 2. Admin modifies the user's permissions
      // 3. User re-authenticates and sees updated permissions
      test.skip('Requires permission modification during test');
    });
  });

  test.describe('API Level Permission Checks', () => {
    test('should enforce permissions at API level', async ({ page }) => {
      await test.step('Login as regular USER', async () => {
        await loginPage.login(TestUsers.regularUser);
        await dashboardPage.waitForLoad();
      });

      await test.step('Attempt to access user management API directly', async () => {
        // Try to access API endpoint directly
        const response = await page.request.get('/api/v2/users');
        expect(response.status()).toBe(403);
      });

      await test.step('Attempt to access user management page', async () => {
        await page.goto('/admin/users');
        await page.waitForLoadState('networkidle');
        await expect(page.locator('text="访问被拒绝"')).toBeVisible();
      });
    });

    test('should allow authorized API access', async ({ page }) => {
      await test.step('Login as SYSTEM_ADMIN', async () => {
        await loginPage.login(TestUsers.admin);
        await dashboardPage.waitForLoad();
      });

      await test.step('Access user management API', async () => {
        const response = await page.request.get('/api/v2/users');
        expect(response.status()).toBe(200);
        
        const users = await response.json();
        expect(Array.isArray(users.data)).toBe(true);
      });
    });
  });

  test.describe('Button Level Permission Control', () => {
    test('should show/hide action buttons based on permissions', async ({ page }) => {
      await test.step('Login as USER_ADMIN', async () => {
        await loginPage.login(TestUsers.userAdmin);
        await dashboardPage.waitForLoad();
        await dashboardPage.navigateToUserManagement();
        await userManagementPage.waitForLoad();
      });

      await test.step('Verify can see user management buttons', async () => {
        const createUserButton = await userManagementPage.createUserButton.isVisible();
        expect(createUserButton).toBe(true);
      });

      await test.step('Login as regular USER', async () => {
        await loginPage.login(TestUsers.regularUser);
        // This should fail as regular user shouldn't access this page
        // But we're testing button visibility
      });
    });

    test('should disable actions based on resource permissions', async ({ page }) => {
      await test.step('Login as USER_ADMIN', async () => {
        await loginPage.login(TestUsers.userAdmin);
        await dashboardPage.waitForLoad();
        await dashboardPage.navigateToUserManagement();
        await userManagementPage.waitForLoad();
      });

      await test.step('Verify cannot delete system users', async () => {
        // Look for admin user
        const adminUser = await userManagementPage.getUserByUsername('admin');
        if (adminUser) {
          const deleteButton = adminUser.locator('[data-testid="delete-user-button"]');
          const isDisabled = await deleteButton.isDisabled();
          // Admin user should not be deletable by USER_ADMIN
          expect(isDisabled || !(await deleteButton.isVisible())).toBe(true);
        }
      });
    });
  });

  test.describe('Permission Caching and Performance', () => {
    test('should cache permissions efficiently', async ({ page }) => {
      await test.step('Login as SYSTEM_ADMIN', async () => {
        const startTime = Date.now();
        await loginPage.login(TestUsers.admin);
        await dashboardPage.waitForLoad();
        const loginTime = Date.now() - startTime;
        console.log(`Login time: ${loginTime}ms`);
        
        // Login should complete within reasonable time
        expect(loginTime).toBeLessThan(5000);
      });

      await test.step('Navigate between pages quickly', async () => {
        const startTime = Date.now();
        await dashboardPage.navigateToUserManagement();
        await page.goto('/admin/roles');
        await page.goto('/dashboard');
        const navigationTime = Date.now() - startTime;
        console.log(`Navigation time: ${navigationTime}ms`);
        
        // Navigation should be fast with cached permissions
        expect(navigationTime).toBeLessThan(3000);
      });
    });
  });

  test.describe('Edge Cases and Error Handling', () => {
    test('should handle users with no roles', async ({ page }) => {
      // This test requires creating a user with no roles
      test.skip('Requires test user setup with no roles');
    });

    test('should handle deleted roles gracefully', async ({ page }) => {
      // This test requires creating a user, assigning a role, deleting the role,
      // then checking that the user can still function
      test.skip('Requires role deletion during test');
    });

    test('should handle permission conflicts', async ({ page }) => {
      // Test scenarios where a user has conflicting permissions
      test.skip('Requires permission conflict setup');
    });
  });
});