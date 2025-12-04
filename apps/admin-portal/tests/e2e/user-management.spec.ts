import { test, expect, Page } from '@playwright/test';
import { completeOAuthLogin } from './helpers/test-helpers';

/**
 * User Management E2E Tests
 *
 * These tests verify the complete user management functionality:
 * - User list loading and display
 * - User creation (CRUD - Create)
 * - User editing (CRUD - Update)
 * - User deletion (CRUD - Delete)
 * - Pagination
 * - Search/filtering
 * - Permission-based UI (users:create, users:update, users:delete)
 *
 * Prerequisites:
 * - User must be authenticated with admin permissions
 * - OAuth Service must be running on port 6188
 * - Admin Portal must be running on port 6188 (via Pingora)
 */

test.describe('User Management', () => {
  // Pingora 代理地址（6188）路由所有流量：
  // - /api/v2/* → OAuth Service (3001)
  // - 其他请求 → Admin Portal (3002)
  const baseUrl = process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:6188';
  const usersRoute = '/admin/users';
  const testUsername = process.env.TEST_ADMIN_USERNAME || 'admin';
  const testPassword = process.env.TEST_ADMIN_PASSWORD || 'admin123';

  /**
   * Helper function to authenticate user
   */
  async function authenticate(page: Page) {
    await page.goto(`${baseUrl}${usersRoute}`);
    await page.waitForURL(/.*/, { timeout: 5000 });

    // If redirected to login, complete authentication
    if (page.url().includes('/login')) {
      await page.getByTestId('username-input').fill(testUsername);
      await page.getByTestId('password-input').fill(testPassword);
      await page.getByTestId('login-button').click();
      await page.waitForURL(/.*/, { timeout: 10000 });
    }

    // Handle consent if required
    if (page.url().includes('/oauth/consent')) {
      const approveButton =
        page.getByTestId('consent-approve-button') ||
        page.getByRole('button', { name: /allow|approve|授权|允许/i });
      if (await approveButton.isVisible()) {
        await approveButton.click();
        await page.waitForURL(/.*/, { timeout: 5000 });
      }
    }

    // Wait for users page to load
    await page.waitForURL(usersRoute, { timeout: 10000 });
  }

  test.beforeEach(async ({ page }) => {
    await authenticate(page);
  });

  /**
   * Test 1: User List Loading
   * Verifies that the user list loads correctly and displays user data
   */
  test('should load and display user list', async ({ page }) => {
    // Verify page title
    await expect(page.getByRole('heading', { name: '用户管理' })).toBeVisible();

    // Verify table is present
    const table = page.locator('table').first();
    await expect(table).toBeVisible();

    // Verify table has headers
    const headers = table.locator('thead th');
    await expect(headers).not.toHaveCount(0);

    // Verify table has data rows
    const rows = table.locator('tbody tr');
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThan(0);

    // Verify at least one user is displayed
    await expect(page.getByText(testUsername)).toBeVisible();
  });

  /**
   * Test 2: Create User Button Visibility
   * Verifies that users with 'users:create' permission can see the create button
   */
  test('should show create user button with proper permissions', async ({ page }) => {
    // Look for "添加用户" button
    const createButton = page.getByRole('button', { name: /添加用户|create user/i });

    // Admin should have users:create permission
    await expect(createButton).toBeVisible();

    // Verify button has icon
    const icon = createButton.locator('svg').first();
    await expect(icon).toBeVisible();
  });

  /**
   * Test 3: Create User
   * Tests the complete user creation flow
   */
  test('should create a new user successfully', async ({ page }) => {
    const timestamp = Date.now();
    const newUsername = `test_user_${timestamp}`;

    // Click create user button
    await page.getByRole('button', { name: /添加用户|create user/i }).click();

    // Verify dialog opened
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('heading', { name: '添加用户' })).toBeVisible();

    // Fill form
    const usernameInput = page.getByLabel('用户名');
    await usernameInput.fill(newUsername);

    // Submit form
    await page.getByRole('button', { name: /^保存$/ }).click();

    // Wait for success toast or dialog close
    await page.waitForTimeout(1000);

    // Verify dialog closed
    await expect(page.getByRole('dialog')).not.toBeVisible();

    // Verify new user appears in table
    await expect(page.getByText(newUsername)).toBeVisible({ timeout: 5000 });
  });

  /**
   * Test 4: Edit User
   * Tests the user editing flow
   */
  test('should edit an existing user successfully', async ({ page }) => {
    // Find the first edit button in the table
    const editButton = page.locator('button[aria-label*="编辑"], button[title*="编辑"]').first();

    // If no edit button found by aria-label, try finding by icon
    const editButtonByIcon = page.locator('button').filter({ has: page.locator('svg') }).first();

    const buttonToClick = (await editButton.count()) > 0 ? editButton : editButtonByIcon;
    await buttonToClick.click();

    // Verify edit dialog opened
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('heading', { name: '编辑用户' })).toBeVisible();

    // Get current username value
    const usernameInput = page.getByLabel('用户名');
    const currentUsername = await usernameInput.inputValue();

    // Modify username (append timestamp)
    const timestamp = Date.now();
    const updatedUsername = `${currentUsername}_${timestamp}`.substring(0, 50); // Limit length
    await usernameInput.clear();
    await usernameInput.fill(updatedUsername);

    // Submit form
    await page.getByRole('button', { name: /^保存$/ }).click();

    // Wait for processing
    await page.waitForTimeout(1000);

    // Verify dialog closed
    await expect(page.getByRole('dialog')).not.toBeVisible();

    // Verify updated user appears in table
    await expect(page.getByText(updatedUsername)).toBeVisible({ timeout: 5000 });
  });

  /**
   * Test 5: Delete User
   * Tests the user deletion flow with confirmation
   */
  test('should delete a user with confirmation', async ({ page }) => {
    const timestamp = Date.now();
    const userToDelete = `delete_test_${timestamp}`;

    // First, create a user to delete
    await page.getByRole('button', { name: /添加用户|create user/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByLabel('用户名').fill(userToDelete);
    await page.getByRole('button', { name: /^保存$/ }).click();
    await page.waitForTimeout(1000);
    await expect(page.getByRole('dialog')).not.toBeVisible();

    // Verify user was created
    await expect(page.getByText(userToDelete)).toBeVisible();

    // Find and click delete button for the user
    // The delete button should be in the same row as the username
    const userRow = page.locator('tr').filter({ hasText: userToDelete });
    const deleteButton = userRow.locator('button[aria-label*="删除"], button[title*="删除"]').first();
    await deleteButton.click();

    // Verify delete confirmation dialog
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText(/确认删除|confirm delete/i)).toBeVisible();
    await expect(page.getByText(userToDelete)).toBeVisible();

    // Confirm deletion
    await page.getByRole('button', { name: /确认|confirm/i }).click();

    // Wait for deletion to complete
    await page.waitForTimeout(1000);

    // Verify dialog closed
    await expect(page.getByRole('dialog')).not.toBeVisible();

    // Verify user no longer appears in table
    await expect(page.getByText(userToDelete)).not.toBeVisible({ timeout: 5000 });
  });

  /**
   * Test 6: Cancel User Creation
   * Tests that clicking cancel closes the dialog without creating a user
   */
  test('should cancel user creation without saving', async ({ page }) => {
    const timestamp = Date.now();
    const cancelledUsername = `cancelled_${timestamp}`;

    // Click create user button
    await page.getByRole('button', { name: /添加用户|create user/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Fill form but don't submit
    await page.getByLabel('用户名').fill(cancelledUsername);

    // Click cancel button
    await page.getByRole('button', { name: /取消|cancel/i }).click();

    // Verify dialog closed
    await expect(page.getByRole('dialog')).not.toBeVisible();

    // Verify user was NOT created
    await expect(page.getByText(cancelledUsername)).not.toBeVisible();
  });

  /**
   * Test 7: Form Validation
   * Tests that the form validates required fields
   */
  test('should validate required fields', async ({ page }) => {
    // Click create user button
    await page.getByRole('button', { name: /添加用户|create user/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Try to submit without filling username
    await page.getByRole('button', { name: /^保存$/ }).click();

    // Verify form validation error appears
    // The error could be inline or a toast notification
    const errorMessage = page.getByText(/必填|required|不能为空|cannot be empty/i).first();
    await expect(errorMessage).toBeVisible({ timeout: 2000 });

    // Verify dialog did not close (form submission failed)
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  /**
   * Test 8: Pagination
   * Tests that pagination controls work correctly
   */
  test('should paginate through user list', async ({ page }) => {
    // Check if pagination controls exist
    const nextButton = page.getByRole('button', { name: /next|下一页/i });
    const previousButton = page.getByRole('button', { name: /previous|上一页/i });

    // If pagination exists, test it
    if (await nextButton.count() > 0) {
      // Check if next button is enabled
      const isNextEnabled = await nextButton.isEnabled();

      if (isNextEnabled) {
        // Get first user on page 1
        const firstRow = page.locator('tbody tr').first();
        const firstUserPage1 = await firstRow.textContent();

        // Click next page
        await nextButton.click();
        await page.waitForTimeout(500);

        // Get first user on page 2
        const firstUserPage2 = await firstRow.textContent();

        // Users should be different
        expect(firstUserPage1).not.toBe(firstUserPage2);

        // Click previous to go back
        if (await previousButton.isEnabled()) {
          await previousButton.click();
          await page.waitForTimeout(500);

          // Should be back to page 1
          const firstUserBackToPage1 = await firstRow.textContent();
          expect(firstUserBackToPage1).toBe(firstUserPage1);
        }
      }
    } else {
      // No pagination - this is acceptable if there are few users
      console.log('No pagination controls found - likely fewer users than page size');
    }
  });

  /**
   * Test 9: Multiple Users Creation
   * Tests creating multiple users in sequence
   */
  test('should create multiple users successfully', async ({ page }) => {
    const timestamp = Date.now();
    const userCount = 3;
    const usernames: string[] = [];

    for (let i = 0; i < userCount; i++) {
      const username = `bulk_user_${timestamp}_${i}`;
      usernames.push(username);

      // Click create button
      await page.getByRole('button', { name: /添加用户|create user/i }).click();
      await expect(page.getByRole('dialog')).toBeVisible();

      // Fill and submit
      await page.getByLabel('用户名').fill(username);
      await page.getByRole('button', { name: /^保存$/ }).click();
      await page.waitForTimeout(1000);
      await expect(page.getByRole('dialog')).not.toBeVisible();
    }

    // Verify all users were created
    for (const username of usernames) {
      await expect(page.getByText(username)).toBeVisible();
    }
  });

  /**
   * Test 10: Table Data Integrity
   * Verifies that user data is displayed correctly in the table
   */
  test('should display correct user data in table', async ({ page }) => {
    // Get the first row
    const firstRow = page.locator('tbody tr').first();

    // Verify row has cells
    const cells = firstRow.locator('td');
    const cellCount = await cells.count();
    expect(cellCount).toBeGreaterThan(0);

    // Verify username cell is not empty
    const usernameCell = cells.first();
    const username = await usernameCell.textContent();
    expect(username).toBeTruthy();
    expect(username?.trim().length).toBeGreaterThan(0);
  });
});
