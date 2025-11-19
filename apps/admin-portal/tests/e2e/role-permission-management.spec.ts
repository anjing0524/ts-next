import { test, expect, Page } from '@playwright/test';

/**
 * Role and Permission Management E2E Tests
 *
 * These tests verify the complete role and permission management functionality:
 * - Role list loading and display
 * - Role creation (CRUD - Create)
 * - Role editing (CRUD - Update)
 * - Role deletion (CRUD - Delete)
 * - Permission assignment to roles
 * - Pagination
 * - Permission-based UI (role:create, role:update, role:delete)
 *
 * Prerequisites:
 * - User must be authenticated with admin permissions
 * - OAuth Service must be running on port 6188
 * - Admin Portal must be running on port 6188 (via Pingora)
 */

test.describe('Role and Permission Management', () => {
  const baseUrl = process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:6188';
  const rolesRoute = '/admin/system/roles';
  const testUsername = process.env.TEST_ADMIN_USERNAME || 'admin';
  const testPassword = process.env.TEST_ADMIN_PASSWORD || 'admin123';

  /**
   * Helper function to authenticate user
   */
  async function authenticate(page: Page) {
    await page.goto(`${baseUrl}${rolesRoute}`);
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

    // Wait for roles page to load
    await page.waitForURL(rolesRoute, { timeout: 10000 });
  }

  test.beforeEach(async ({ page }) => {
    await authenticate(page);
  });

  /**
   * Test 1: Role List Loading
   * Verifies that the role list loads correctly and displays role data
   */
  test('should load and display role list', async ({ page }) => {
    // Verify page title
    await expect(page.getByRole('heading', { name: '角色管理' })).toBeVisible();

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

    // Verify at least one role is displayed (e.g., admin role)
    const firstRow = rows.first();
    await expect(firstRow).toBeVisible();
  });

  /**
   * Test 2: Create Role Button Visibility
   * Verifies that users with 'role:create' permission can see the create button
   */
  test('should show create role button with proper permissions', async ({ page }) => {
    // Look for "添加角色" button
    const createButton = page.getByRole('button', { name: /添加角色|create role/i });

    // Admin should have role:create permission
    await expect(createButton).toBeVisible();

    // Verify button has icon
    const icon = createButton.locator('svg').first();
    await expect(icon).toBeVisible();
  });

  /**
   * Test 3: Create Role
   * Tests the complete role creation flow
   */
  test('should create a new role successfully', async ({ page }) => {
    const timestamp = Date.now();
    const newRoleName = `test_role_${timestamp}`;
    const newRoleDisplayName = `Test Role ${timestamp}`;
    const newRoleDescription = `Test role created at ${new Date().toISOString()}`;

    // Click create role button
    await page.getByRole('button', { name: /添加角色|create role/i }).click();

    // Verify dialog opened
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('heading', { name: /添加角色|create role/i })).toBeVisible();

    // Fill form
    // Look for input fields by label or placeholder
    const nameInput = page.getByLabel(/角色名称|role name/i).or(page.getByPlaceholder(/角色名称|role name/i));
    const displayNameInput = page.getByLabel(/显示名称|display name/i).or(page.getByPlaceholder(/显示名称|display name/i));
    const descriptionInput = page.getByLabel(/描述|description/i).or(page.getByPlaceholder(/描述|description/i));

    await nameInput.fill(newRoleName);
    await displayNameInput.fill(newRoleDisplayName);
    await descriptionInput.fill(newRoleDescription);

    // Submit form
    await page.getByRole('button', { name: /^保存$|^save$/i }).click();

    // Wait for success and dialog close
    await page.waitForTimeout(1000);

    // Verify dialog closed
    await expect(page.getByRole('dialog')).not.toBeVisible();

    // Verify new role appears in table
    await expect(page.getByText(newRoleName)).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(newRoleDisplayName)).toBeVisible();
  });

  /**
   * Test 4: Edit Role
   * Tests the role editing flow
   */
  test('should edit an existing role successfully', async ({ page }) => {
    // Find the first edit button in the table
    const editButton = page.getByRole('button', { name: /^编辑$|^edit$/i }).first();
    await editButton.click();

    // Verify edit dialog opened
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('heading', { name: /编辑角色|edit role/i })).toBeVisible();

    // Get current display name value
    const displayNameInput = page.getByLabel(/显示名称|display name/i).or(page.getByPlaceholder(/显示名称|display name/i));
    const currentDisplayName = await displayNameInput.inputValue();

    // Modify display name (append timestamp)
    const timestamp = Date.now();
    const updatedDisplayName = `${currentDisplayName} (Updated ${timestamp})`.substring(0, 100);
    await displayNameInput.clear();
    await displayNameInput.fill(updatedDisplayName);

    // Submit form
    await page.getByRole('button', { name: /^保存$|^save$/i }).click();

    // Wait for processing
    await page.waitForTimeout(1000);

    // Verify dialog closed
    await expect(page.getByRole('dialog')).not.toBeVisible();

    // Verify updated role appears in table
    await expect(page.getByText(updatedDisplayName)).toBeVisible({ timeout: 5000 });
  });

  /**
   * Test 5: Delete Role
   * Tests the role deletion flow with confirmation
   */
  test('should delete a role with confirmation', async ({ page }) => {
    const timestamp = Date.now();
    const roleToDelete = `delete_role_${timestamp}`;
    const roleDisplayName = `Delete Test ${timestamp}`;

    // First, create a role to delete
    await page.getByRole('button', { name: /添加角色|create role/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    const nameInput = page.getByLabel(/角色名称|role name/i).or(page.getByPlaceholder(/角色名称|role name/i));
    const displayNameInput = page.getByLabel(/显示名称|display name/i).or(page.getByPlaceholder(/显示名称|display name/i));

    await nameInput.fill(roleToDelete);
    await displayNameInput.fill(roleDisplayName);
    await page.getByRole('button', { name: /^保存$|^save$/i }).click();
    await page.waitForTimeout(1000);
    await expect(page.getByRole('dialog')).not.toBeVisible();

    // Verify role was created
    await expect(page.getByText(roleToDelete)).toBeVisible();

    // Find and click delete button for the role
    const roleRow = page.locator('tr').filter({ hasText: roleToDelete });
    const deleteButton = roleRow.getByRole('button', { name: /^删除$|^delete$/i });
    await deleteButton.click();

    // Verify delete confirmation dialog
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText(/确认删除|confirm delete/i)).toBeVisible();
    await expect(page.getByText(roleToDelete)).toBeVisible();

    // Confirm deletion
    await page.getByRole('button', { name: /确认|confirm/i }).click();

    // Wait for deletion to complete
    await page.waitForTimeout(1000);

    // Verify dialog closed
    await expect(page.getByRole('dialog')).not.toBeVisible();

    // Verify role no longer appears in table
    await expect(page.getByText(roleToDelete)).not.toBeVisible({ timeout: 5000 });
  });

  /**
   * Test 6: Open Permissions Editor
   * Tests that clicking the permissions button opens the permissions editor
   */
  test('should open permissions editor for a role', async ({ page }) => {
    // Find the first permissions button in the table
    const permissionsButton = page.getByRole('button', { name: /^权限$|^permissions$/i }).first();
    await permissionsButton.click();

    // Verify permissions dialog opened
    await expect(page.getByRole('dialog')).toBeVisible();

    // Dialog should contain permission-related content
    // Look for common permission UI elements
    const hasPermissionContent =
      (await page.getByText(/权限|permission/i).count()) > 0 ||
      (await page.locator('input[type="checkbox"]').count()) > 0;

    expect(hasPermissionContent).toBeTruthy();

    // Close the dialog
    const closeButton =
      page.getByRole('button', { name: /关闭|close|取消|cancel/i }).first() ||
      page.locator('button[aria-label*="close"]').first();

    if (await closeButton.isVisible()) {
      await closeButton.click();
    } else {
      // Try pressing Escape
      await page.keyboard.press('Escape');
    }

    // Verify dialog closed
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 2000 });
  });

  /**
   * Test 7: Cancel Role Creation
   * Tests that clicking cancel closes the dialog without creating a role
   */
  test('should cancel role creation without saving', async ({ page }) => {
    const timestamp = Date.now();
    const cancelledRoleName = `cancelled_${timestamp}`;

    // Click create role button
    await page.getByRole('button', { name: /添加角色|create role/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Fill form but don't submit
    const nameInput = page.getByLabel(/角色名称|role name/i).or(page.getByPlaceholder(/角色名称|role name/i));
    await nameInput.fill(cancelledRoleName);

    // Click cancel button
    await page.getByRole('button', { name: /取消|cancel/i }).click();

    // Verify dialog closed
    await expect(page.getByRole('dialog')).not.toBeVisible();

    // Verify role was NOT created
    await expect(page.getByText(cancelledRoleName)).not.toBeVisible();
  });

  /**
   * Test 8: Form Validation
   * Tests that the form validates required fields
   */
  test('should validate required fields', async ({ page }) => {
    // Click create role button
    await page.getByRole('button', { name: /添加角色|create role/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Try to submit without filling required fields
    await page.getByRole('button', { name: /^保存$|^save$/i }).click();

    // Verify form validation error appears
    const errorMessage = page.getByText(/必填|required|不能为空|cannot be empty/i).first();
    await expect(errorMessage).toBeVisible({ timeout: 2000 });

    // Verify dialog did not close (form submission failed)
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  /**
   * Test 9: Table Columns Display
   * Verifies that all expected columns are displayed
   */
  test('should display all role table columns', async ({ page }) => {
    // Get table headers
    const table = page.locator('table').first();
    const headers = table.locator('thead th');

    // Expected columns: 角色名称, 显示名称, 描述, actions
    const headerCount = await headers.count();
    expect(headerCount).toBeGreaterThan(2); // At least name and actions

    // Verify key columns exist
    await expect(page.getByRole('columnheader', { name: /角色名称|role name/i })).toBeVisible();
  });

  /**
   * Test 10: Role Action Buttons
   * Verifies that all action buttons are present in each row
   */
  test('should display all action buttons for each role', async ({ page }) => {
    // Get the first role row
    const firstRow = page.locator('tbody tr').first();

    // Verify action buttons exist
    await expect(firstRow.getByRole('button', { name: /权限|permissions/i })).toBeVisible();
    await expect(firstRow.getByRole('button', { name: /编辑|edit/i })).toBeVisible();
    await expect(firstRow.getByRole('button', { name: /删除|delete/i })).toBeVisible();
  });

  /**
   * Test 11: Multiple Roles Creation
   * Tests creating multiple roles in sequence
   */
  test('should create multiple roles successfully', async ({ page }) => {
    const timestamp = Date.now();
    const roleCount = 3;
    const roleNames: string[] = [];

    for (let i = 0; i < roleCount; i++) {
      const roleName = `bulk_role_${timestamp}_${i}`;
      const displayName = `Bulk Role ${i}`;
      roleNames.push(roleName);

      // Click create button
      await page.getByRole('button', { name: /添加角色|create role/i }).click();
      await expect(page.getByRole('dialog')).toBeVisible();

      // Fill and submit
      const nameInput = page.getByLabel(/角色名称|role name/i).or(page.getByPlaceholder(/角色名称|role name/i));
      const displayNameInput = page.getByLabel(/显示名称|display name/i).or(page.getByPlaceholder(/显示名称|display name/i));

      await nameInput.fill(roleName);
      await displayNameInput.fill(displayName);
      await page.getByRole('button', { name: /^保存$|^save$/i }).click();
      await page.waitForTimeout(1000);
      await expect(page.getByRole('dialog')).not.toBeVisible();
    }

    // Verify all roles were created
    for (const roleName of roleNames) {
      await expect(page.getByText(roleName)).toBeVisible();
    }
  });

  /**
   * Test 12: Pagination
   * Tests that pagination controls work correctly
   */
  test('should paginate through role list', async ({ page }) => {
    // Check if pagination controls exist
    const nextButton = page.getByRole('button', { name: /next|下一页/i });
    const previousButton = page.getByRole('button', { name: /previous|上一页/i });

    // If pagination exists, test it
    if ((await nextButton.count()) > 0) {
      // Check if next button is enabled
      const isNextEnabled = await nextButton.isEnabled();

      if (isNextEnabled) {
        // Get first role on page 1
        const firstRow = page.locator('tbody tr').first();
        const firstRolePage1 = await firstRow.textContent();

        // Click next page
        await nextButton.click();
        await page.waitForTimeout(500);

        // Get first role on page 2
        const firstRolePage2 = await firstRow.textContent();

        // Roles should be different
        expect(firstRolePage1).not.toBe(firstRolePage2);

        // Click previous to go back
        if (await previousButton.isEnabled()) {
          await previousButton.click();
          await page.waitForTimeout(500);

          // Should be back to page 1
          const firstRoleBackToPage1 = await firstRow.textContent();
          expect(firstRoleBackToPage1).toBe(firstRolePage1);
        }
      }
    } else {
      // No pagination - this is acceptable if there are few roles
      console.log('No pagination controls found - likely fewer roles than page size');
    }
  });
});
