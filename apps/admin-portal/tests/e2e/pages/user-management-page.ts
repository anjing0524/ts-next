import { Page, Locator } from '@playwright/test';

/**
 * 用户管理页面页面对象模式
 * 封装所有与用户管理相关的操作和断言
 */
export class UserManagementPage {
  readonly page: Page;
  readonly createUserButton: Locator;
  readonly userSearchInput: Locator;
  readonly userTable: Locator;
  readonly userFormModal: Locator;
  readonly successMessage: Locator;
  readonly errorMessage: Locator;

  constructor(page: Page) {
    this.page = page;
    this.createUserButton = page.locator('[data-testid="create-user-button"]');
    this.userSearchInput = page.locator('[data-testid="user-search-input"]');
    this.userTable = page.locator('[data-testid="user-table"]');
    this.userFormModal = page.locator('[data-testid="user-form-modal"]');
    this.successMessage = page.locator('[data-testid="success-message"]');
    this.errorMessage = page.locator('[data-testid="error-message"]');
  }

  async goto() {
    await this.page.goto('/admin/users');
    await this.page.waitForLoadState('networkidle');
  }

  async waitForLoad() {
    await this.userTable.waitFor({ state: 'visible', timeout: 10000 });
  }

  async clickCreateUser() {
    await this.createUserButton.click();
    await this.userFormModal.waitFor({ state: 'visible', timeout: 5000 });
  }

  async searchUsers(query: string) {
    await this.userSearchInput.fill(query);
    await this.page.keyboard.press('Enter');
    await this.page.waitForLoadState('networkidle');
  }

  async getUserCount(): Promise<number> {
    const userRows = this.page.locator('[data-testid="user-row"]');
    return await userRows.count();
  }

  async getUserByUsername(username: string): Promise<Locator | null> {
    const userRow = this.page.locator(`[data-testid="user-row"][data-username="${username}"]`);
    if (await userRow.isVisible()) {
      return userRow;
    }
    return null;
  }

  async editUser(username: string) {
    const userRow = await this.getUserByUsername(username);
    if (userRow) {
      await userRow.locator('[data-testid="edit-user-button"]').click();
      await this.userFormModal.waitFor({ state: 'visible', timeout: 5000 });
    }
  }

  async deleteUser(username: string) {
    const userRow = await this.getUserByUsername(username);
    if (userRow) {
      await userRow.locator('[data-testid="delete-user-button"]').click();
      await this.page.locator('[data-testid="delete-confirmation-modal"]').waitFor({ state: 'visible', timeout: 5000 });
      await this.page.click('[data-testid="confirm-delete-button"]');
    }
  }

  async toggleUserStatus(username: string) {
    const userRow = await this.getUserByUsername(username);
    if (userRow) {
      await userRow.locator('[data-testid="user-status-toggle"]').click();
    }
  }

  async isUserVisible(username: string): Promise<boolean> {
    const userRow = await this.getUserByUsername(username);
    return userRow ? await userRow.isVisible() : false;
  }

  async getSuccessMessage(): Promise<string> {
    return await this.successMessage.textContent() || '';
  }

  async getErrorMessage(): Promise<string> {
    return await this.errorMessage.textContent() || '';
  }

  async fillUserForm(userData: {
    username: string;
    email: string;
    password: string;
    displayName?: string;
    firstName?: string;
    lastName?: string;
  }) {
    await this.page.fill('[data-testid="username-input"]', userData.username);
    await this.page.fill('[data-testid="email-input"]', userData.email);
    await this.page.fill('[data-testid="password-input"]', userData.password);
    
    if (userData.displayName) {
      await this.page.fill('[data-testid="display-name-input"]', userData.displayName);
    }
    
    if (userData.firstName) {
      await this.page.fill('[data-testid="first-name-input"]', userData.firstName);
    }
    
    if (userData.lastName) {
      await this.fill('[data-testid="last-name-input"]', userData.lastName);
    }
  }

  async submitUserForm() {
    await this.page.click('[data-testid="submit-user-button"]');
  }

  async selectRole(roleName: string) {
    await this.page.click('[data-testid="role-select"]');
    await this.page.click(`[data-testid="role-option-${roleName}"]`);
  }

  async filterByRole(roleName: string) {
    await this.page.click('[data-testid="role-filter"]');
    await this.page.click(`[data-testid="role-filter-option-${roleName}"]`);
    await this.page.waitForLoadState('networkidle');
  }

  async filterByStatus(status: 'active' | 'inactive') {
    await this.page.click('[data-testid="status-filter"]');
    await this.page.click(`[data-testid="status-filter-option-${status}"]`);
    await this.page.waitForLoadState('networkidle');
  }
}