import { Page, Locator } from '@playwright/test';

/**
 * 角色管理页面页面对象模式
 * 封装所有与角色管理相关的操作和断言
 */
export class RoleManagementPage {
  readonly page: Page;
  readonly createRoleButton: Locator;
  readonly roleSearchInput: Locator;
  readonly roleTable: Locator;
  readonly roleFormModal: Locator;
  readonly permissionMatrix: Locator;
  readonly successMessage: Locator;
  readonly errorMessage: Locator;

  constructor(page: Page) {
    this.page = page;
    this.createRoleButton = page.locator('[data-testid="create-role-button"]');
    this.roleSearchInput = page.locator('[data-testid="role-search-input"]');
    this.roleTable = page.locator('[data-testid="role-table"]');
    this.roleFormModal = page.locator('[data-testid="role-form-modal"]');
    this.permissionMatrix = page.locator('[data-testid="role-permission-matrix"]');
    this.successMessage = page.locator('[data-testid="success-message"]');
    this.errorMessage = page.locator('[data-testid="error-message"]');
  }

  async goto() {
    await this.page.goto('/admin/roles');
    await this.page.waitForLoadState('networkidle');
  }

  async waitForLoad() {
    await this.roleTable.waitFor({ state: 'visible', timeout: 10000 });
  }

  async clickCreateRole() {
    await this.createRoleButton.click();
    await this.roleFormModal.waitFor({ state: 'visible', timeout: 5000 });
  }

  async searchRoles(query: string) {
    await this.roleSearchInput.fill(query);
    await this.page.keyboard.press('Enter');
    await this.page.waitForLoadState('networkidle');
  }

  async getRoleCount(): Promise<number> {
    const roleRows = this.page.locator('[data-testid="role-row"]');
    return await roleRows.count();
  }

  async getRoleByName(roleName: string): Promise<Locator | null> {
    const roleRow = this.page.locator(`[data-testid="role-row"][data-role="${roleName}"]`);
    if (await roleRow.isVisible()) {
      return roleRow;
    }
    return null;
  }

  async editRole(roleName: string) {
    const roleRow = await this.getRoleByName(roleName);
    if (roleRow) {
      await roleRow.locator('[data-testid="edit-role-button"]').click();
      await this.roleFormModal.waitFor({ state: 'visible', timeout: 5000 });
    }
  }

  async deleteRole(roleName: string) {
    const roleRow = await this.getRoleByName(roleName);
    if (roleRow) {
      await roleRow.locator('[data-testid="delete-role-button"]').click();
      await this.page.locator('[data-testid="delete-confirmation-modal"]').waitFor({ state: 'visible', timeout: 5000 });
      await this.page.click('[data-testid="confirm-delete-button"]');
    }
  }

  async toggleRoleStatus(roleName: string) {
    const roleRow = await this.getRoleByName(roleName);
    if (roleRow) {
      await roleRow.locator('[data-testid="role-status-toggle"]').click();
    }
  }

  async isRoleVisible(roleName: string): Promise<boolean> {
    const roleRow = await this.getRoleByName(roleName);
    return roleRow ? await roleRow.isVisible() : false;
  }

  async getSuccessMessage(): Promise<string> {
    return await this.successMessage.textContent() || '';
  }

  async getErrorMessage(): Promise<string> {
    return await this.errorMessage.textContent() || '';
  }

  async fillRoleForm(roleData: {
    name: string;
    displayName: string;
    description?: string;
  }) {
    await this.page.fill('[data-testid="role-name-input"]', roleData.name);
    await this.page.fill('[data-testid="role-display-name-input"]', roleData.displayName);
    
    if (roleData.description) {
      await this.page.fill('[data-testid="role-description-input"]', roleData.description);
    }
  }

  async submitRoleForm() {
    await this.page.click('[data-testid="submit-role-button"]');
  }

  async togglePermission(permissionName: string) {
    const permissionCheckbox = this.page.locator(`[data-testid="permission-checkbox-${permissionName}"]`);
    await permissionCheckbox.click();
  }

  async isPermissionSelected(permissionName: string): Promise<boolean> {
    const permissionCheckbox = this.page.locator(`[data-testid="permission-checkbox-${permissionName}"]`);
    return await permissionCheckbox.isChecked();
  }

  async selectParentRole(parentRoleName: string) {
    await this.page.click('[data-testid="parent-role-select"]');
    await this.page.click(`[data-testid="parent-role-option-${parentRoleName}"]`);
  }

  async viewPermissionMatrix() {
    await this.page.goto('/admin/role-permission-matrix');
    await this.permissionMatrix.waitFor({ state: 'visible', timeout: 10000 });
  }

  async getPermissionMatrixData(): Promise<Array<{role: string, permission: string, granted: boolean}>> {
    const matrixData = [];
    const roleHeaders = await this.page.locator('[data-testid="role-header"]').allTextContents();
    const permissionRows = await this.page.locator('[data-testid="permission-row"]').all();
    
    for (const row of permissionRows) {
      const permissionName = await row.locator('[data-testid="permission-name"]').textContent();
      
      for (const role of roleHeaders) {
        const cell = row.locator(`[data-testid="permission-cell"][data-role="${role}"]`);
        const granted = await cell.locator('[data-testid="permission-granted"]').isVisible();
        
        matrixData.push({
          role,
          permission: permissionName || '',
          granted
        });
      }
    }
    
    return matrixData;
  }

  async filterByType(type: 'active' | 'inactive') {
    await this.page.click('[data-testid="role-type-filter"]');
    await this.page.click(`[data-testid="role-type-filter-${type}"]`);
    await this.page.waitForLoadState('networkidle');
  }

  async bulkDeleteRoles(roleNames: string[]) {
    for (const roleName of roleNames) {
      const roleRow = await this.getRoleByName(roleName);
      if (roleRow) {
        await roleRow.locator('[data-testid="role-checkbox"]').click();
      }
    }
    
    await this.page.click('[data-testid="bulk-delete-button"]');
    await this.page.locator('[data-testid="delete-confirmation-modal"]').waitFor({ state: 'visible', timeout: 5000 });
    await this.page.click('[data-testid="confirm-bulk-delete-button"]');
  }

  async exportRoles() {
    const downloadPromise = this.page.waitForEvent('download');
    await this.page.click('[data-testid="export-roles-button"]');
    const download = await downloadPromise;
    return download;
  }

  async importRoles(filePath: string) {
    await this.page.click('[data-testid="import-roles-button"]');
    await this.page.setInputFiles('[data-testid="import-file-input"]', filePath);
    await this.page.click('[data-testid="confirm-import"]');
  }
}