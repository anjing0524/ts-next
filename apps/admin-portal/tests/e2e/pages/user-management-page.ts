import { Page, expect } from '@playwright/test';
import { BasePage } from './base-page';

/**
 * 用户管理页面对象类
 */
export class UserManagementPage extends BasePage {
  // 页面元素选择器
  private readonly pageTitle = '[data-testid="users-title"], h1:has-text("用户管理"), .page-title';
  private readonly searchInput = '[data-testid="user-search"], input[placeholder*="搜索"], .search-input';
  private readonly searchButton = '[data-testid="search-button"], button:has-text("搜索"), .search-btn';
  private readonly addUserButton = '[data-testid="add-user-button"], button:has-text("添加用户"), .add-user-btn';
  private readonly userTable = '[data-testid="users-table"], table, .users-table';
  private readonly userRows = '[data-testid="user-row"], tbody tr, .user-row';
  private readonly loadingSpinner = '[data-testid="loading"], .loading, .spinner';
  private readonly emptyState = '[data-testid="empty-state"], .empty-state, .no-data';
  private readonly pagination = '[data-testid="pagination"], .pagination';
  
  // 过滤器
  private readonly statusFilter = '[data-testid="status-filter"], select[name="status"], .status-filter';
  private readonly roleFilter = '[data-testid="role-filter"], select[name="role"], .role-filter';
  private readonly resetFiltersButton = '[data-testid="reset-filters"], button:has-text("重置"), .reset-filters';
  
  // 用户表格列
  private readonly tableHeaders = {
    username: '[data-testid="header-username"], th:has-text("用户名")',
    email: '[data-testid="header-email"], th:has-text("邮箱")',
    roles: '[data-testid="header-roles"], th:has-text("角色")',
    status: '[data-testid="header-status"], th:has-text("状态")',
    createdAt: '[data-testid="header-created"], th:has-text("创建时间")',
    actions: '[data-testid="header-actions"], th:has-text("操作")'
  };
  
  // 用户操作按钮
  private readonly editButton = '[data-testid="edit-user"], button:has-text("编辑"), .edit-btn';
  private readonly deleteButton = '[data-testid="delete-user"], button:has-text("删除"), .delete-btn';
  private readonly viewButton = '[data-testid="view-user"], button:has-text("查看"), .view-btn';
  private readonly enableButton = '[data-testid="enable-user"], button:has-text("启用"), .enable-btn';
  private readonly disableButton = '[data-testid="disable-user"], button:has-text("禁用"), .disable-btn';
  
  // 模态框
  private readonly modal = '[data-testid="user-modal"], .modal, .dialog';
  private readonly modalTitle = '[data-testid="modal-title"], .modal-title, .dialog-title';
  private readonly modalCloseButton = '[data-testid="modal-close"], .modal-close, .dialog-close';
  private readonly confirmButton = '[data-testid="confirm-button"], button:has-text("确认"), .confirm-btn';
  private readonly cancelButton = '[data-testid="cancel-button"], button:has-text("取消"), .cancel-btn';
  
  // 表单字段
  private readonly usernameInput = '[data-testid="username-input"], input[name="username"], #username';
  private readonly emailInput = '[data-testid="email-input"], input[name="email"], #email';
  private readonly passwordInput = '[data-testid="password-input"], input[name="password"], #password';
  private readonly confirmPasswordInput = '[data-testid="confirm-password"], input[name="confirmPassword"], #confirmPassword';
  private readonly roleSelect = '[data-testid="role-select"], select[name="roles"], .role-select';
  private readonly statusSelect = '[data-testid="status-select"], select[name="status"], .status-select';
  private readonly saveButton = '[data-testid="save-user"], button:has-text("保存"), .save-btn';
  
  // 错误和成功消息
  private readonly errorMessage = '[data-testid="error-message"], .error-message, .alert-error';
  private readonly successMessage = '[data-testid="success-message"], .success-message, .alert-success';
  private readonly validationError = '[data-testid="validation-error"], .validation-error, .field-error';

  constructor(page: Page) {
    super(page);
  }

  /**
   * 导航到用户管理页面
   */
  async goto(): Promise<void> {
    await super.goto('/admin/users');
    await this.waitForLoad();
  }

  /**
   * 验证页面已加载
   */
  async verifyPageLoaded(): Promise<void> {
    await this.waitForElement(this.pageTitle);
    await this.waitForLoadingComplete();
    
    // 验证关键元素存在
    await expect(this.page.locator(this.userTable)).toBeVisible();
    await expect(this.page.locator(this.addUserButton)).toBeVisible();
  }

  /**
   * 验证页面权限
   */
  async verifyPagePermissions(): Promise<void> {
    // 验证用户有访问用户管理的权限
    await this.verifyTokenExists();
    
    const permissions = await this.page.evaluate(() => {
      const token = localStorage.getItem('access_token');
      if (!token) return [];
      
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        return payload.permissions || [];
      } catch {
        return [];
      }
    });
    
    expect(permissions).toContain('user:read');
  }

  /**
   * 搜索用户
   * @param searchTerm 搜索关键词
   */
  async searchUsers(searchTerm: string): Promise<void> {
    await this.fill(this.searchInput, searchTerm);
    await this.click(this.searchButton);
    await this.waitForLoadingComplete();
  }

  /**
   * 清空搜索
   */
  async clearSearch(): Promise<void> {
    await this.fill(this.searchInput, '');
    await this.click(this.searchButton);
    await this.waitForLoadingComplete();
  }

  /**
   * 设置状态过滤器
   * @param status 状态值
   */
  async filterByStatus(status: string): Promise<void> {
    await this.selectOption(this.statusFilter, status);
    await this.waitForLoadingComplete();
  }

  /**
   * 设置角色过滤器
   * @param role 角色值
   */
  async filterByRole(role: string): Promise<void> {
    await this.selectOption(this.roleFilter, role);
    await this.waitForLoadingComplete();
  }

  /**
   * 重置所有过滤器
   */
  async resetFilters(): Promise<void> {
    await this.click(this.resetFiltersButton);
    await this.waitForLoadingComplete();
  }

  /**
   * 获取用户列表
   */
  async getUserList(): Promise<Array<{username: string, email: string, roles: string, status: string}>> {
    await this.waitForElement(this.userTable);
    
    const rows = this.page.locator(this.userRows);
    const count = await rows.count();
    const users = [];
    
    for (let i = 0; i < count; i++) {
      const row = rows.nth(i);
      const cells = row.locator('td');
      
      const username = await cells.nth(0).textContent() || '';
      const email = await cells.nth(1).textContent() || '';
      const roles = await cells.nth(2).textContent() || '';
      const status = await cells.nth(3).textContent() || '';
      
      users.push({ username: username.trim(), email: email.trim(), roles: roles.trim(), status: status.trim() });
    }
    
    return users;
  }

  /**
   * 验证用户在列表中存在
   * @param username 用户名
   */
  async verifyUserExists(username: string): Promise<void> {
    const users = await this.getUserList();
    const userExists = users.some(user => user.username === username);
    expect(userExists).toBeTruthy();
  }

  /**
   * 验证用户不在列表中
   * @param username 用户名
   */
  async verifyUserNotExists(username: string): Promise<void> {
    const users = await this.getUserList();
    const userExists = users.some(user => user.username === username);
    expect(userExists).toBeFalsy();
  }

  /**
   * 点击添加用户按钮
   */
  async clickAddUser(): Promise<void> {
    await this.click(this.addUserButton);
    await this.waitForElement(this.modal);
  }

  /**
   * 填写用户表单
   * @param userData 用户数据
   */
  async fillUserForm(userData: {
    username: string;
    email: string;
    password?: string;
    confirmPassword?: string;
    roles?: string[];
    status?: string;
  }): Promise<void> {
    await this.fill(this.usernameInput, userData.username);
    await this.fill(this.emailInput, userData.email);
    
    if (userData.password) {
      await this.fill(this.passwordInput, userData.password);
    }
    
    if (userData.confirmPassword) {
      await this.fill(this.confirmPasswordInput, userData.confirmPassword);
    }
    
    if (userData.roles && userData.roles.length > 0) {
      for (const role of userData.roles) {
        await this.selectOption(this.roleSelect, role);
      }
    }
    
    if (userData.status) {
      await this.selectOption(this.statusSelect, userData.status);
    }
  }

  /**
   * 保存用户
   */
  async saveUser(): Promise<void> {
    await this.click(this.saveButton);
    await this.waitForLoadingComplete();
  }

  /**
   * 创建新用户
   * @param userData 用户数据
   */
  async createUser(userData: {
    username: string;
    email: string;
    password: string;
    confirmPassword: string;
    roles?: string[];
    status?: string;
  }): Promise<void> {
    await this.clickAddUser();
    await this.fillUserForm(userData);
    await this.saveUser();
    
    // 验证成功消息或模态框关闭
    await this.verifyOperationSuccess();
  }

  /**
   * 编辑用户
   * @param username 要编辑的用户名
   * @param userData 更新的用户数据
   */
  async editUser(username: string, userData: Partial<{
    email: string;
    roles: string[];
    status: string;
  }>): Promise<void> {
    await this.clickUserAction(username, 'edit');
    await this.waitForElement(this.modal);
    
    await this.fillUserForm(userData as any);
    await this.saveUser();
    
    await this.verifyOperationSuccess();
  }

  /**
   * 删除用户
   * @param username 要删除的用户名
   */
  async deleteUser(username: string): Promise<void> {
    await this.clickUserAction(username, 'delete');
    await this.waitForElement(this.modal);
    
    // 确认删除
    await this.click(this.confirmButton);
    await this.waitForLoadingComplete();
    
    await this.verifyOperationSuccess();
  }

  /**
   * 启用/禁用用户
   * @param username 用户名
   * @param enable 是否启用
   */
  async toggleUserStatus(username: string, enable: boolean): Promise<void> {
    const action = enable ? 'enable' : 'disable';
    await this.clickUserAction(username, action);
    
    // 如果有确认对话框，点击确认
    const confirmModal = this.page.locator(this.modal);
    if (await confirmModal.isVisible()) {
      await this.click(this.confirmButton);
    }
    
    await this.waitForLoadingComplete();
    await this.verifyOperationSuccess();
  }

  /**
   * 点击用户操作按钮
   * @param username 用户名
   * @param action 操作类型
   */
  async clickUserAction(username: string, action: 'edit' | 'delete' | 'view' | 'enable' | 'disable'): Promise<void> {
    const userRow = this.page.locator(this.userRows).filter({ hasText: username });
    await expect(userRow).toBeVisible();
    
    const actionSelectors = {
      edit: this.editButton,
      delete: this.deleteButton,
      view: this.viewButton,
      enable: this.enableButton,
      disable: this.disableButton
    };
    
    const actionButton = userRow.locator(actionSelectors[action]);
    await this.click(actionButton);
  }

  /**
   * 验证操作成功
   */
  async verifyOperationSuccess(): Promise<void> {
    // 检查成功消息或模态框关闭
    const successMsg = this.page.locator(this.successMessage);
    const modal = this.page.locator(this.modal);
    
    // 等待成功消息显示或模态框关闭
    await Promise.race([
      successMsg.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {}),
      modal.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
    ]);
  }

  /**
   * 验证操作失败
   * @param expectedError 期望的错误消息
   */
  async verifyOperationError(expectedError?: string): Promise<void> {
    const errorMsg = this.page.locator(this.errorMessage);
    await expect(errorMsg).toBeVisible();
    
    if (expectedError) {
      const errorText = await this.getText(this.errorMessage);
      expect(errorText).toContain(expectedError);
    }
  }

  /**
   * 验证表单验证错误
   * @param field 字段名
   * @param expectedError 期望的错误消息
   */
  async verifyValidationError(field: string, expectedError: string): Promise<void> {
    const fieldError = this.page.locator(`[data-testid="${field}-error"], .${field}-error`).first();
    await expect(fieldError).toBeVisible();
    
    const errorText = await this.getText(fieldError);
    expect(errorText).toContain(expectedError);
  }

  /**
   * 关闭模态框
   */
  async closeModal(): Promise<void> {
    await this.click(this.modalCloseButton);
    await this.page.locator(this.modal).waitFor({ state: 'hidden' });
  }

  /**
   * 取消操作
   */
  async cancelOperation(): Promise<void> {
    await this.click(this.cancelButton);
    await this.page.locator(this.modal).waitFor({ state: 'hidden' });
  }

  /**
   * 验证分页功能
   */
  async verifyPagination(): Promise<void> {
    const paginationElement = this.page.locator(this.pagination);
    
    if (await paginationElement.isVisible()) {
      // 验证分页按钮可点击
      const nextButton = paginationElement.locator('button:has-text("下一页"), .next-page');
      const prevButton = paginationElement.locator('button:has-text("上一页"), .prev-page');
      
      if (await nextButton.isVisible()) {
        await expect(nextButton).toBeEnabled();
      }
      
      if (await prevButton.isVisible()) {
        // 第一页时上一页按钮应该被禁用
        // 这里的具体逻辑取决于实际实现
      }
    }
  }

  /**
   * 切换到下一页
   */
  async goToNextPage(): Promise<void> {
    const nextButton = this.page.locator(this.pagination).locator('button:has-text("下一页"), .next-page');
    await this.click(nextButton);
    await this.waitForLoadingComplete();
  }

  /**
   * 切换到上一页
   */
  async goToPreviousPage(): Promise<void> {
    const prevButton = this.page.locator(this.pagination).locator('button:has-text("上一页"), .prev-page');
    await this.click(prevButton);
    await this.waitForLoadingComplete();
  }

  /**
   * 验证表格排序
   * @param column 列名
   */
  async verifySorting(column: keyof typeof this.tableHeaders): Promise<void> {
    const header = this.page.locator(this.tableHeaders[column]);
    await this.click(header);
    await this.waitForLoadingComplete();
    
    // 验证排序图标或状态
    const sortIcon = header.locator('.sort-icon, [data-sort]');
    if (await sortIcon.isVisible()) {
      await expect(sortIcon).toBeVisible();
    }
  }

  /**
   * 验证批量操作
   */
  async verifyBatchOperations(): Promise<void> {
    // 选择多个用户
    const checkboxes = this.page.locator('input[type="checkbox"]');
    const count = await checkboxes.count();
    
    if (count > 1) {
      // 选择前两个用户
      await checkboxes.nth(0).check();
      await checkboxes.nth(1).check();
      
      // 验证批量操作按钮出现
      const batchActions = this.page.locator('[data-testid="batch-actions"], .batch-actions');
      if (await batchActions.isVisible()) {
        await expect(batchActions).toBeVisible();
      }
    }
  }

  /**
   * 验证空状态
   */
  async verifyEmptyState(): Promise<void> {
    const emptyStateElement = this.page.locator(this.emptyState);
    await expect(emptyStateElement).toBeVisible();
    
    const emptyText = await this.getText(this.emptyState);
    expect(emptyText).toMatch(/暂无数据|没有找到用户|No users found/);
  /**
   * 查看用户详情
   * @param username 用户名
   */
  async viewUserDetails(username: string): Promise<void> {
    await this.clickUserAction(username, 'view');
    await this.waitForElement(this.modal);
  }

  /**
   * 导航到用户管理页面（别名方法）
   */
  async navigate(): Promise<void> {
    await this.goto();
  }

  /**
   * 验证用户管理页面已加载（别名方法）
   */
  async verifyUserManagementLoaded(): Promise<void> {
    await this.verifyPageLoaded();
  }

  /**
   * 获取用户总数
   */
  async getUserCount(): Promise<number> {
    const rows = this.page.locator(this.userRows);
    return await rows.count();
  }

  /**
   * 验证用户表格数据
   */
  async verifyUserTableData(expectedUsers: Array<{username: string, email: string, status: string}>): Promise<void> {
    const actualUsers = await this.getUserList();
    
    for (const expectedUser of expectedUsers) {
      const foundUser = actualUsers.find(user => user.username === expectedUser.username);
      expect(foundUser).toBeDefined();
      expect(foundUser?.email).toBe(expectedUser.email);
      expect(foundUser?.status).toBe(expectedUser.status);
    }
  }

  /**
   * 搜索并验证结果
   */
  async searchAndVerify(searchTerm: string, expectedCount: number): Promise<void> {
    await this.searchUsers(searchTerm);
    await this.waitForLoadingComplete();
    
    const userCount = await this.getUserCount();
    expect(userCount).toBe(expectedCount);
  }

  /**
   * 批量选择用户
   */
  async selectUsers(usernames: string[]): Promise<void> {
    for (const username of usernames) {
      const checkbox = this.page.locator(`[data-testid="select-user-${username}"], input[type="checkbox"]`).first();
      await checkbox.check();
    }
  }

  /**
   * 批量删除用户
   */
  async bulkDeleteUsers(usernames: string[]): Promise<void> {
    await this.selectUsers(usernames);
    const bulkDeleteButton = this.page.locator('[data-testid="bulk-delete"], button:has-text("批量删除")');
    await bulkDeleteButton.click();
    await this.confirmOperation();
  }

  /**
   * 确认操作
   */
  async confirmOperation(): Promise<void> {
    await this.click(this.confirmButton);
  }

  /**
   * 验证用户状态
   */
  async verifyUserStatus(username: string, expectedStatus: string): Promise<void> {
    const userRow = this.page.locator(`[data-testid="user-row-${username}"], tr:has-text("${username}")`).first();
    const statusCell = userRow.locator('[data-testid="user-status"], .status-cell');
    await expect(statusCell).toContainText(expectedStatus);
  }

  /**
   * 验证用户角色
   */
  async verifyUserRoles(username: string, expectedRoles: string[]): Promise<void> {
    const userRow = this.page.locator(`[data-testid="user-row-${username}"], tr:has-text("${username}")`).first();
    const rolesCell = userRow.locator('[data-testid="user-roles"], .roles-cell');
    
    for (const role of expectedRoles) {
      await expect(rolesCell).toContainText(role);
    }
  }

  /**
   * 导出用户数据
   */
  async exportUsers(): Promise<void> {
    const exportButton = this.page.locator('[data-testid="export-users"], button:has-text("导出")');
    await exportButton.click();
  }

  /**
   * 导入用户数据
   */
  async importUsers(filePath: string): Promise<void> {
    const importButton = this.page.locator('[data-testid="import-users"], button:has-text("导入")');
    await importButton.click();
    
    const fileInput = this.page.locator('input[type="file"]');
    await fileInput.setInputFiles(filePath);
    
    const uploadButton = this.page.locator('[data-testid="upload-file"], button:has-text("上传")');
    await uploadButton.click();
  }
}
  }
}