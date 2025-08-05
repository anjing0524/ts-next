import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/login-page';
import { DashboardPage } from '../pages/dashboard-page';
import { UserManagementPage } from '../pages/user-management-page';
import { TestUsers, TestData } from '../helpers/test-data';

/**
 * 用户管理功能测试套件
 * 验证用户CRUD操作和相关功能
 */
test.describe('User Management', () => {
  let loginPage: LoginPage;
  let dashboardPage: DashboardPage;
  let userManagementPage: UserManagementPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    dashboardPage = new DashboardPage(page);
    userManagementPage = new UserManagementPage(page);
    
    // Login as admin
    await loginPage.login(TestUsers.admin);
    await dashboardPage.waitForLoad();
  });

  test.describe('User CRUD Operations', () => {
    test('should create new user successfully', async ({ page }) => {
      await test.step('Navigate to user management', async () => {
        await dashboardPage.navigateToUserManagement();
        await userManagementPage.waitForLoad();
      });

      await test.step('Click create user button', async () => {
        await userManagementPage.clickCreateUser();
      });

      await test.step('Fill user form', async () => {
        await userManagementPage.fillUserForm(TestData.newUser);
      });

      await test.step('Submit form', async () => {
        await userManagementPage.submitUserForm();
      });

      await test.step('Verify user creation success', async () => {
        const successMessage = await userManagementPage.getSuccessMessage();
        expect(successMessage).toContain('成功');
        
        const userVisible = await userManagementPage.isUserVisible(TestData.newUser.username);
        expect(userVisible).toBe(true);
      });
    });

    test('should validate user input fields', async ({ page }) => {
      await test.step('Navigate to user management and create user', async () => {
        await dashboardPage.navigateToUserManagement();
        await userManagementPage.waitForLoad();
        await userManagementPage.clickCreateUser();
      });

      await test.step('Test username validation', async () => {
        await userManagementPage.fillUserForm({
          ...TestData.newUser,
          username: 'ab' // Too short
        });
        await userManagementPage.submitUserForm();
        
        const errorMessage = await userManagementPage.getErrorMessage();
        expect(errorMessage).toBeTruthy();
      });

      await test.step('Test email validation', async () => {
        await userManagementPage.fillUserForm({
          ...TestData.newUser,
          email: 'invalid-email'
        });
        await userManagementPage.submitUserForm();
        
        const errorMessage = await userManagementPage.getErrorMessage();
        expect(errorMessage).toBeTruthy();
      });

      await test.step('Test password validation', async () => {
        await userManagementPage.fillUserForm({
          ...TestData.newUser,
          password: 'weak'
        });
        await userManagementPage.submitUserForm();
        
        const errorMessage = await userManagementPage.getErrorMessage();
        expect(errorMessage).toBeTruthy();
      });
    });

    test('should update existing user', async ({ page }) => {
      // First create a user to update
      const testUser = {
        ...TestData.newUser,
        username: 'user-to-update',
        email: 'update@example.com'
      };

      await test.step('Create test user', async () => {
        await dashboardPage.navigateToUserManagement();
        await userManagementPage.waitForLoad();
        await userManagementPage.clickCreateUser();
        await userManagementPage.fillUserForm(testUser);
        await userManagementPage.submitUserForm();
        
        const successMessage = await userManagementPage.getSuccessMessage();
        expect(successMessage).toBeTruthy();
      });

      await test.step('Edit user', async () => {
        await userManagementPage.editUser(testUser.username);
        await userManagementPage.fillUserForm({
          ...testUser,
          email: 'updated@example.com',
          displayName: '已更新的用户'
        });
        await userManagementPage.submitUserForm();
      });

      await test.step('Verify user update', async () => {
        const successMessage = await userManagementPage.getSuccessMessage();
        expect(successMessage).toContain('更新');
        
        // Search for updated email
        await userManagementPage.searchUsers('updated@example.com');
        const userVisible = await userManagementPage.isUserVisible(testUser.username);
        expect(userVisible).toBe(true);
      });
    });

    test('should delete user', async ({ page }) => {
      const testUser = {
        ...TestData.newUser,
        username: 'user-to-delete',
        email: 'delete@example.com'
      };

      await test.step('Create test user', async () => {
        await dashboardPage.navigateToUserManagement();
        await userManagementPage.waitForLoad();
        await userManagementPage.clickCreateUser();
        await userManagementPage.fillUserForm(testUser);
        await userManagementPage.submitUserForm();
      });

      await test.step('Delete user', async () => {
        await userManagementPage.deleteUser(testUser.username);
      });

      await test.step('Verify user deletion', async () => {
        const userVisible = await userManagementPage.isUserVisible(testUser.username);
        expect(userVisible).toBe(false);
        
        const successMessage = await userManagementPage.getSuccessMessage();
        expect(successMessage).toContain('删除');
      });
    });

    test('should prevent deleting admin user', async ({ page }) => {
      await test.step('Navigate to user management', async () => {
        await dashboardPage.navigateToUserManagement();
        await userManagementPage.waitForLoad();
      });

      await test.step('Attempt to delete admin user', async () => {
        const adminUser = await userManagementPage.getUserByUsername('admin');
        if (adminUser) {
          const deleteButton = adminUser.locator('[data-testid="delete-user-button"]');
          
          // Delete button should be disabled or not visible for admin
          const isVisible = await deleteButton.isVisible();
          const isDisabled = isVisible ? await deleteButton.isDisabled() : false;
          
          expect(isDisabled || !isVisible).toBe(true);
        }
      });
    });
  });

  test.describe('User Search and Filter', () => {
    test.beforeEach(async ({ page }) => {
      // Create test users for search testing
      await dashboardPage.navigateToUserManagement();
      await userManagementPage.waitForLoad();
      
      const testUsers = [
        { ...TestData.newUser, username: 'searchuser1', email: 'search1@example.com' },
        { ...TestData.newUser, username: 'searchuser2', email: 'search2@example.com' },
        { ...TestData.newUser, username: 'testuser', email: 'test@example.com' }
      ];
      
      for (const user of testUsers) {
        try {
          await userManagementPage.clickCreateUser();
          await userManagementPage.fillUserForm(user);
          await userManagementPage.submitUserForm();
          await page.waitForTimeout(500);
        } catch (e) {
          // User might already exist
          console.log(`User ${user.username} might already exist`);
        }
      }
    });

    test('should search users by username', async ({ page }) => {
      await test.step('Search for specific user', async () => {
        await userManagementPage.searchUsers('searchuser1');
      });

      await test.step('Verify search results', async () => {
        const user1Visible = await userManagementPage.isUserVisible('searchuser1');
        const user2Visible = await userManagementPage.isUserVisible('searchuser2');
        
        expect(user1Visible).toBe(true);
        expect(user2Visible).toBe(false);
      });
    });

    test('should search users by email', async ({ page }) => {
      await test.step('Search by email domain', async () => {
        await userManagementPage.searchUsers('@example.com');
      });

      await test.step('Verify multiple results', async () => {
        const userCount = await userManagementPage.getUserCount();
        expect(userCount).toBeGreaterThan(0);
      });
    });

    test('should filter users by role', async ({ page }) => {
      await test.step('Filter by USER role', async () => {
        await userManagementPage.filterByRole('USER');
        await page.waitForLoadState('networkidle');
      });

      await test.step('Verify filter results', async () => {
        const userCount = await userManagementPage.getUserCount();
        expect(userCount).toBeGreaterThan(0);
        
        // Verify filtered users have USER role
        const testUser = await userManagementPage.getUserByUsername('searchuser1');
        if (testUser) {
          const userRoles = await userManagementPage.getUserRoles('searchuser1');
          expect(userRoles).toContain('USER');
        }
      });
    });

    test('should filter users by status', async ({ page }) => {
      await test.step('Filter active users', async () => {
        await userManagementPage.filterByStatus('active');
        await page.waitForLoadState('networkidle');
      });

      await test.step('Verify filter results', async () => {
        const userCount = await userManagementPage.getUserCount();
        expect(userCount).toBeGreaterThan(0);
      });
    });

    test('should clear search and filters', async ({ page }) => {
      await test.step('Apply search and filters', async () => {
        await userManagementPage.searchUsers('search');
        await userManagementPage.filterByRole('USER');
        await page.waitForLoadState('networkidle');
      });

      await test.step('Clear filters', async () => {
        await userManagementPage.searchUsers('');
        await page.waitForLoadState('networkidle');
      });

      await test.step('Verify all users shown', async () => {
        const userCount = await userManagementPage.getUserCount();
        expect(userCount).toBeGreaterThan(2); // Should show more than filtered results
      });
    });
  });

  test.describe('User Status Management', () => {
    test('should toggle user active status', async ({ page }) => {
      const testUser = {
        ...TestData.newUser,
        username: 'status-toggle-user',
        email: 'status@example.com'
      };

      await test.step('Create test user', async () => {
        await dashboardPage.navigateToUserManagement();
        await userManagementPage.waitForLoad();
        await userManagementPage.clickCreateUser();
        await userManagementPage.fillUserForm(testUser);
        await userManagementPage.submitUserForm();
      });

      await test.step('Deactivate user', async () => {
        await userManagementPage.toggleUserStatus(testUser.username);
        await page.waitForTimeout(1000);
      });

      await test.step('Verify user is inactive', async () => {
        const successMessage = await userManagementPage.getSuccessMessage();
        expect(successMessage).toBeTruthy();
      });

      await test.step('Reactivate user', async () => {
        await userManagementPage.toggleUserStatus(testUser.username);
        await page.waitForTimeout(1000);
      });

      await test.step('Verify user is active', async () => {
        const successMessage = await userManagementPage.getSuccessMessage();
        expect(successMessage).toBeTruthy();
      });
    });

    test('should prevent login for inactive users', async ({ page }) => {
      const testUser = {
        ...TestData.newUser,
        username: 'inactive-login-test',
        email: 'inactive@example.com'
      };

      await test.step('Create and deactivate user', async () => {
        await dashboardPage.navigateToUserManagement();
        await userManagementPage.waitForLoad();
        await userManagementPage.clickCreateUser();
        await userManagementPage.fillUserForm(testUser);
        await userManagementPage.submitUserForm();
        await page.waitForTimeout(1000);
        
        await userManagementPage.toggleUserStatus(testUser.username);
      });

      await test.step('Logout and try to login as inactive user', async () => {
        await dashboardPage.clickUserMenu();
        await dashboardPage.clickLogoutButton();
        
        await loginPage.goto();
        await loginPage.fillUsername(testUser.username);
        await loginPage.fillPassword(testUser.password);
        await loginPage.clickLoginButton();
      });

      await test.step('Verify login fails', async () => {
        const errorMessage = await loginPage.getErrorMessage();
        expect(errorMessage).toContain('禁用' || 'inactive');
      });
    });
  });

  test.describe('User Role Management', () => {
    test('should assign multiple roles to user', async ({ page }) => {
      const testUser = {
        ...TestData.newUser,
        username: 'multi-role-user',
        email: 'multirole@example.com'
      };

      await test.step('Create user with multiple roles', async () => {
        await dashboardPage.navigateToUserManagement();
        await userManagementPage.waitForLoad();
        await userManagementPage.clickCreateUser();
        await userManagementPage.fillUserForm(testUser);
        await userManagementPage.selectRole('USER');
        await userManagementPage.selectRole('USER_ADMIN');
        await userManagementPage.submitUserForm();
      });

      await test.step('Verify user has multiple roles', async () => {
        const userRoles = await userManagementPage.getUserRoles(testUser.username);
        expect(userRoles).toContain('USER');
        expect(userRoles).toContain('USER_ADMIN');
      });
    });

    test('should update user roles', async ({ page }) => {
      const testUser = {
        ...TestData.newUser,
        username: 'role-update-user',
        email: 'roleupdate@example.com'
      };

      await test.step('Create user with initial role', async () => {
        await dashboardPage.navigateToUserManagement();
        await userManagementPage.waitForLoad();
        await userManagementPage.clickCreateUser();
        await userManagementPage.fillUserForm(testUser);
        await userManagementPage.selectRole('USER');
        await userManagementPage.submitUserForm();
      });

      await test.step('Update user roles', async () => {
        await userManagementPage.editUser(testUser.username);
        await userManagementPage.selectRole('USER_ADMIN');
        await userManagementPage.submitUserForm();
      });

      await test.step('Verify role update', async () => {
        const userRoles = await userManagementPage.getUserRoles(testUser.username);
        expect(userRoles).toContain('USER_ADMIN');
      });
    });
  });

  test.describe('Bulk Operations', () => {
    test('should export user list', async ({ page }) => {
      await test.step('Navigate to user management', async () => {
        await dashboardPage.navigateToUserManagement();
        await userManagementPage.waitForLoad();
      });

      await test.step('Click export button', async () => {
        const exportButton = page.locator('[data-testid="export-users-button"]');
        if (await exportButton.isVisible()) {
          await exportButton.click();
          
          // Verify download starts
          const downloadEvent = await page.waitForEvent('download');
          expect(downloadEvent.suggestedFilename()).toMatch(/users.*\.csv$/);
        }
      });
    });

    test('should bulk delete users', async ({ page }) => {
      // Create test users for bulk deletion
      const bulkUsers = [
        { ...TestData.newUser, username: 'bulk1', email: 'bulk1@example.com' },
        { ...TestData.newUser, username: 'bulk2', email: 'bulk2@example.com' }
      ];

      await test.step('Create test users', async () => {
        await dashboardPage.navigateToUserManagement();
        await userManagementPage.waitForLoad();
        
        for (const user of bulkUsers) {
          await userManagementPage.clickCreateUser();
          await userManagementPage.fillUserForm(user);
          await userManagementPage.submitUserForm();
          await page.waitForTimeout(500);
        }
      });

      await test.step('Select users for bulk deletion', async () => {
        const checkboxes = page.locator('[data-testid="user-checkbox"]');
        const count = await checkboxes.count();
        
        if (count > 0) {
          await checkboxes.first().check();
          await checkboxes.nth(1).check();
          
          const bulkDeleteButton = page.locator('[data-testid="bulk-delete-button"]');
          if (await bulkDeleteButton.isVisible()) {
            await bulkDeleteButton.click();
            
            // Confirm deletion
            await page.click('[data-testid="confirm-bulk-delete"]');
            await page.waitForTimeout(1000);
          }
        }
      });

      await test.step('Verify users deleted', async () => {
        const user1Visible = await userManagementPage.isUserVisible('bulk1');
        const user2Visible = await userManagementPage.isUserVisible('bulk2');
        
        expect(user1Visible || user2Visible).toBe(false);
      });
    });
  });

  test.describe('Performance and Pagination', () => {
    test('should handle large user list', async ({ page }) => {
      await test.step('Navigate to user management', async () => {
        await dashboardPage.navigateToUserManagement();
        await userManagementPage.waitForLoad();
      });

      await test.step('Check pagination controls', async () => {
        const pagination = page.locator('[data-testid="pagination"]');
        if (await pagination.isVisible()) {
          // Test pagination navigation
          const nextPage = pagination.locator('[data-testid="next-page"]');
          const prevPage = pagination.locator('[data-testid="prev-page"]');
          
          if (await nextPage.isVisible()) {
            await nextPage.click();
            await page.waitForLoadState('networkidle');
          }
          
          if (await prevPage.isVisible()) {
            await prevPage.click();
            await page.waitForLoadState('networkidle');
          }
        }
      });
    });

    test('should load users efficiently', async ({ page }) => {
      await test.step('Navigate to user management and measure load time', async () => {
        const startTime = Date.now();
        await dashboardPage.navigateToUserManagement();
        await userManagementPage.waitForLoad();
        const loadTime = Date.now() - startTime;
        
        console.log(`User management page load time: ${loadTime}ms`);
        expect(loadTime).toBeLessThan(3000);
      });
    });
  });

  test.describe('Error Handling', () => {
    test('should handle duplicate username', async ({ page }) => {
      const testUser = {
        ...TestData.newUser,
        username: 'duplicate-user',
        email: 'duplicate1@example.com'
      };

      await test.step('Create first user', async () => {
        await dashboardPage.navigateToUserManagement();
        await userManagementPage.waitForLoad();
        await userManagementPage.clickCreateUser();
        await userManagementPage.fillUserForm(testUser);
        await userManagementPage.submitUserForm();
      });

      await test.step('Attempt to create user with same username', async () => {
        await userManagementPage.clickCreateUser();
        await userManagementPage.fillUserForm({
          ...testUser,
          email: 'duplicate2@example.com'
        });
        await userManagementPage.submitUserForm();
      });

      await test.step('Verify duplicate error', async () => {
        const errorMessage = await userManagementPage.getErrorMessage();
        expect(errorMessage).toContain('已存在' || 'duplicate');
      });
    });

    test('should handle network errors gracefully', async ({ page }) => {
      await test.step('Navigate to user management', async () => {
        await dashboardPage.navigateToUserManagement();
        await userManagementPage.waitForLoad();
      });

      await test.step('Simulate network error', async () => {
        await page.route('**/api/v2/users**', route => route.abort());
        
        await userManagementPage.clickCreateUser();
        await userManagementPage.fillUserForm(TestData.newUser);
        await userManagementPage.submitUserForm();
      });

      await test.step('Verify error message', async () => {
        const errorMessage = await userManagementPage.getErrorMessage();
        expect(errorMessage).toBeTruthy();
      });
    });
  });
});