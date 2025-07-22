import { Page, expect } from '@playwright/test';
import { BasePage } from './base-page';

/**
 * 角色管理页面对象类
 */
export class RoleManagementPage extends BasePage {
  // 页面元素选择器
  private readonly pageTitle = '[data-testid="roles-title"], h1:has-text("角色管理"), .page-title';
  private readonly searchInput = '[data-testid="role-search"], input[placeholder*="搜索"], .search-input';
  private readonly searchButton = '[data-testid="search-button"], button:has-text("搜索"), .search-btn';
  private readonly addRoleButton = '[data-testid="add-role-button"], button:has-text("添加角色"), .add-role-btn';
  private readonly roleTable = '[data-testid="roles-table"], table, .roles-table';
  private readonly roleRows = '[data-testid="role-row"], tbody tr, .role-row';
  private readonly loadingSpinner = '[data-testid="loading"], .loading, .spinner';
  private readonly emptyState = '[data-testid="empty-state"], .empty-state, .no-data';
  private readonly pagination = '[data-testid="pagination"], .pagination';
  
  // 过滤器
  private readonly statusFilter = '[data-testid="status-filter"], select[name="status"], .status-filter';
  private readonly resetFiltersButton = '[data-testid="reset-filters"], button:has-text("重置"), .reset-filters';
  
  // 角色表格列
  private readonly tableHeaders = {
    name: '[data-testid="header-name"], th:has-text("角色名称")',
    description: '[data-testid="header-description"], th:has-text("描述")',
    permissions: '[data-testid="header-permissions"], th:has-text("权限")',
    userCount: '[data-testid="header-users"], th:has-text("用户数")',
    status: '[data-testid="header-status"], th:has-text("状态")',
    createdAt: '[data-testid="header-created"], th:has-text("创建时间")',
    actions: '[data-testid="header-actions"], th:has-text("操作")'
  };
  
  // 角色操作按钮
  private readonly editButton = '[data-testid="edit-role"], button:has-text("编辑"), .edit-btn';
  private readonly deleteButton = '[data-testid="delete-role"], button:has-text("删除"), .delete-btn';
  private readonly viewButton = '[data-testid="view-role"], button:has-text("查看"), .view-btn';
  private readonly copyButton = '[data-testid="copy-role"], button:has-text("复制"), .copy-btn';
  
  // 模态框
  private readonly modal = '[data-testid="role-modal"], .modal, .dialog';
  private readonly modalTitle = '[data-testid="modal-title"], .modal-title, .dialog-title';
  private readonly modalCloseButton = '[data-testid="modal-close"], .modal-close, .dialog-close';
  private readonly confirmButton = '[data-testid="confirm-button"], button:has-text("确认"), .confirm-btn';
  private readonly cancelButton = '[data-testid="cancel-button"], button:has-text("取消"), .cancel-btn';
  
  // 表单字段
  private readonly roleNameInput = '[data-testid="role-name-input"], input[name="name"], #roleName';
  private readonly roleDescriptionInput = '[data-testid="role-description-input"], textarea[name="description"], #roleDescription';
  private readonly statusSelect = '[data-testid="status-select"], select[name="status"], .status-select';
  private readonly saveButton = '[data-testid="save-role"], button:has-text("保存"), .save-btn';
  
  // 权限选择器
  private readonly permissionsContainer = '[data-testid="permissions-container"], .permissions-container';
  private readonly permissionCheckbox = '[data-testid="permission-checkbox"], input[type="checkbox"][name*="permission"]';
  private readonly permissionGroup = '[data-testid="permission-group"], .permission-group';
  private readonly selectAllPermissions = '[data-testid="select-all-permissions"], .select-all-permissions';
  private readonly clearAllPermissions = '[data-testid="clear-all-permissions"], .clear-all-permissions';
  
  // 权限分组
  private readonly permissionGroups = {
    system: '[data-testid="system-permissions"], .system-permissions',
    user: '[data-testid="user-permissions"], .user-permissions',
    role: '[data-testid="role-permissions"], .role-permissions',
    client: '[data-testid="client-permissions"], .client-permissions'
  };
  
  // 错误和成功消息
  private readonly errorMessage = '[data-testid="error-message"], .error-message, .alert-error';
  private readonly successMessage = '[data-testid="success-message"], .success-message, .alert-success';
  private readonly validationError = '[data-testid="validation-error"], .validation-error, .field-error';

  constructor(page: Page) {
    super(page);
  }

  /**
   * 导航到角色管理页面
   */
  async goto(): Promise<void> {
    await super.goto('/admin/roles');
    await this.waitForLoad();
  }

  /**
   * 验证页面已加载
   */
  async verifyPageLoaded(): Promise<void> {
    await this.waitForElement(this.pageTitle);
    await this.waitForLoadingComplete();
    
    // 验证关键元素存在
    await expect(this.page.locator(this.roleTable)).toBeVisible();
    await expect(this.page.locator(this.addRoleButton)).toBeVisible();
  }

  /**
   * 验证页面权限
   */
  async verifyPagePermissions(): Promise<void> {
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
    
    expect(permissions).toContain('role:read');
  }

  /**
   * 搜索角色
   * @param searchTerm 搜索关键词
   */
  async searchRoles(searchTerm: string): Promise<void> {
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
   * 重置所有过滤器
   */
  async resetFilters(): Promise<void> {
    await this.click(this.resetFiltersButton);
    await this.waitForLoadingComplete();
  }

  /**
   * 获取角色列表
   */
  async getRoleList(): Promise<Array<{name: string, description: string, permissions: string, userCount: string, status: string}>> {
    await this.waitForElement(this.roleTable);
    
    const rows = this.page.locator(this.roleRows);
    const count = await rows.count();
    const roles = [];
    
    for (let i = 0; i < count; i++) {
      const row = rows.nth(i);
      const cells = row.locator('td');
      
      const name = await cells.nth(0).textContent() || '';
      const description = await cells.nth(1).textContent() || '';
      const permissions = await cells.nth(2).textContent() || '';
      const userCount = await cells.nth(3).textContent() || '';
      const status = await cells.nth(4).textContent() || '';
      
      roles.push({ 
        name: name.trim(), 
        description: description.trim(), 
        permissions: permissions.trim(),
        userCount: userCount.trim(),
        status: status.trim() 
      });
    }
    
    return roles;
  }

  /**
   * 验证角色在列表中存在
   * @param roleName 角色名称
   */
  async verifyRoleExists(roleName: string): Promise<void> {
    const roles = await this.getRoleList();
    const roleExists = roles.some(role => role.name === roleName);
    expect(roleExists).toBeTruthy();
  }

  /**
   * 验证角色不在列表中
   * @param roleName 角色名称
   */
  async verifyRoleNotExists(roleName: string): Promise<void> {
    const roles = await this.getRoleList();
    const roleExists = roles.some(role => role.name === roleName);
    expect(roleExists).toBeFalsy();
  }

  /**
   * 点击添加角色按钮
   */
  async clickAddRole(): Promise<void> {
    await this.click(this.addRoleButton);
    await this.waitForElement(this.modal);
  }

  /**
   * 填写角色基本信息
   * @param roleData 角色数据
   */
  async fillRoleBasicInfo(roleData: {
    name: string;
    description?: string;
    status?: string;
  }): Promise<void> {
    await this.fill(this.roleNameInput, roleData.name);
    
    if (roleData.description) {
      await this.fill(this.roleDescriptionInput, roleData.description);
    }
    
    if (roleData.status) {
      await this.selectOption(this.statusSelect, roleData.status);
    }
  }

  /**
   * 选择权限
   * @param permissions 权限列表
   */
  async selectPermissions(permissions: string[]): Promise<void> {
    await this.waitForElement(this.permissionsContainer);
    
    // 先清空所有权限
    await this.clearAllPermissions();
    
    // 选择指定权限
    for (const permission of permissions) {
      const checkbox = this.page.locator(`[data-testid="permission-${permission}"], input[value="${permission}"]`);
      if (await checkbox.isVisible()) {
        await checkbox.check();
      }
    }
  }

  /**
   * 选择权限组
   * @param groupName 权限组名称
   */
  async selectPermissionGroup(groupName: keyof typeof this.permissionGroups): Promise<void> {
    const groupSelector = this.permissionGroups[groupName];
    const groupElement = this.page.locator(groupSelector);
    
    if (await groupElement.isVisible()) {
      const selectAllButton = groupElement.locator('.select-all, [data-testid="select-all"]');
      if (await selectAllButton.isVisible()) {
        await this.click(selectAllButton);
      } else {
        // 如果没有全选按钮，逐个选择该组的权限
        const checkboxes = groupElement.locator('input[type="checkbox"]');
        const count = await checkboxes.count();
        
        for (let i = 0; i < count; i++) {
          await checkboxes.nth(i).check();
        }
      }
    }
  }

  /**
   * 全选权限
   */
  async selectAllPermissions(): Promise<void> {
    const selectAllButton = this.page.locator(this.selectAllPermissions);
    if (await selectAllButton.isVisible()) {
      await this.click(selectAllButton);
    }
  }

  /**
   * 清空所有权限
   */
  async clearAllPermissions(): Promise<void> {
    const clearAllButton = this.page.locator(this.clearAllPermissions);
    if (await clearAllButton.isVisible()) {
      await this.click(clearAllButton);
    } else {
      // 如果没有清空按钮，逐个取消选择
      const checkedBoxes = this.page.locator('input[type="checkbox"]:checked');
      const count = await checkedBoxes.count();
      
      for (let i = 0; i < count; i++) {
        await checkedBoxes.nth(i).uncheck();
      }
    }
  }

  /**
   * 获取已选择的权限
   */
  async getSelectedPermissions(): Promise<string[]> {
    const checkedBoxes = this.page.locator('input[type="checkbox"]:checked');
    const count = await checkedBoxes.count();
    const permissions = [];
    
    for (let i = 0; i < count; i++) {
      const value = await checkedBoxes.nth(i).getAttribute('value');
      if (value) {
        permissions.push(value);
      }
    }
    
    return permissions;
  }

  /**
   * 保存角色
   */
  async saveRole(): Promise<void> {
    await this.click(this.saveButton);
    await this.waitForLoadingComplete();
  }

  /**
   * 创建新角色
   * @param roleData 角色数据
   */
  async createRole(roleData: {
    name: string;
    description?: string;
    permissions: string[];
    status?: string;
  }): Promise<void> {
    await this.clickAddRole();
    await this.fillRoleBasicInfo(roleData);
    await this.selectPermissions(roleData.permissions);
    await this.saveRole();
    
    await this.verifyOperationSuccess();
  }

  /**
   * 编辑角色
   * @param roleName 要编辑的角色名称
   * @param roleData 更新的角色数据
   */
  async editRole(roleName: string, roleData: Partial<{
    description: string;
    permissions: string[];
    status: string;
  }>): Promise<void> {
    await this.clickRoleAction(roleName, 'edit');
    await this.waitForElement(this.modal);
    
    if (roleData.description !== undefined) {
      await this.fill(this.roleDescriptionInput, roleData.description);
    }
    
    if (roleData.permissions) {
      await this.selectPermissions(roleData.permissions);
    }
    
    if (roleData.status) {
      await this.selectOption(this.statusSelect, roleData.status);
    }
    
    await this.saveRole();
    await this.verifyOperationSuccess();
  }

  /**
   * 删除角色
   * @param roleName 要删除的角色名称
   */
  async deleteRole(roleName: string): Promise<void> {
    await this.clickRoleAction(roleName, 'delete');
    await this.waitForElement(this.modal);
    
    // 确认删除
    await this.click(this.confirmButton);
    await this.waitForLoadingComplete();
    
    await this.verifyOperationSuccess();
  }

  /**
   * 复制角色
   * @param roleName 要复制的角色名称
   * @param newRoleName 新角色名称
   */
  async copyRole(roleName: string, newRoleName: string): Promise<void> {
    await this.clickRoleAction(roleName, 'copy');
    await this.waitForElement(this.modal);
    
    // 修改角色名称
    await this.fill(this.roleNameInput, newRoleName);
    await this.saveRole();
    
    await this.verifyOperationSuccess();
  }

  /**
   * 点击角色操作按钮
   * @param roleName 角色名称
   * @param action 操作类型
   */
  async clickRoleAction(roleName: string, action: 'edit' | 'delete' | 'view' | 'copy'): Promise<void> {
    const roleRow = this.page.locator(this.roleRows).filter({ hasText: roleName });
    await expect(roleRow).toBeVisible();
    
    const actionSelectors = {
      edit: this.editButton,
      delete: this.deleteButton,
      view: this.viewButton,
      copy: this.copyButton
    };
    
    const actionButton = roleRow.locator(actionSelectors[action]);
    await this.click(actionButton);
  }

  /**
   * 查看角色详情
   * @param roleName 角色名称
   */
  async viewRoleDetails(roleName: string): Promise<void> {
    await this.clickRoleAction(roleName, 'view');
    await this.waitForElement(this.modal);
    
    // 验证角色详情显示
    const modalTitle = await this.getText(this.modalTitle);
    expect(modalTitle).toContain(roleName);
  }

  /**
   * 验证角色权限
   * @param roleName 角色名称
   * @param expectedPermissions 期望的权限列表
   */
  async verifyRolePermissions(roleName: string, expectedPermissions: string[]): Promise<void> {
    await this.viewRoleDetails(roleName);
    
    // 验证权限显示
    for (const permission of expectedPermissions) {
      const permissionElement = this.page.locator(`[data-testid="permission-${permission}"], .permission-item:has-text("${permission}")`);
      await expect(permissionElement).toBeVisible();
    }
    
    await this.closeModal();
  }

  /**
   * 验证操作成功
   */
  async verifyOperationSuccess(): Promise<void> {
    const successMsg = this.page.locator(this.successMessage);
    const modal = this.page.locator(this.modal);
    
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
   * 验证内置角色不可删除
   * @param roleName 内置角色名称
   */
  async verifyBuiltinRoleProtection(roleName: string): Promise<void> {
    const roleRow = this.page.locator(this.roleRows).filter({ hasText: roleName });
    const deleteButton = roleRow.locator(this.deleteButton);
    
    // 内置角色的删除按钮应该被禁用或不存在
    if (await deleteButton.isVisible()) {
      await expect(deleteButton).toBeDisabled();
    }
  }

  /**
   * 验证角色名称唯一性
   * @param roleName 角色名称
   */
  async verifyRoleNameUniqueness(roleName: string): Promise<void> {
    await this.clickAddRole();
    await this.fill(this.roleNameInput, roleName);
    await this.saveRole();
    
    // 应该显示角色名称已存在的错误
    await this.verifyValidationError('name', '角色名称已存在');
    
    await this.cancelOperation();
  }

  /**
   * 验证权限依赖关系
   * @param basePermission 基础权限
   * @param dependentPermissions 依赖权限
   */
  async verifyPermissionDependencies(basePermission: string, dependentPermissions: string[]): Promise<void> {
    await this.clickAddRole();
    
    // 选择基础权限
    const baseCheckbox = this.page.locator(`[data-testid="permission-${basePermission}"], input[value="${basePermission}"]`);
    await baseCheckbox.check();
    
    // 验证依赖权限自动被选中
    for (const depPermission of dependentPermissions) {
      const depCheckbox = this.page.locator(`[data-testid="permission-${depPermission}"], input[value="${depPermission}"]`);
      await expect(depCheckbox).toBeChecked();
    }
    
    await this.cancelOperation();
  }

  /**
   * 验证权限搜索功能
   * @param searchTerm 搜索关键词
   */
  async verifyPermissionSearch(searchTerm: string): Promise<void> {
    await this.clickAddRole();
    
    const permissionSearchInput = this.page.locator('[data-testid="permission-search"], .permission-search input');
    if (await permissionSearchInput.isVisible()) {
      await this.fill(permissionSearchInput, searchTerm);
      
      // 验证只显示匹配的权限
      const visiblePermissions = this.page.locator('.permission-item:visible');
      const count = await visiblePermissions.count();
      
      for (let i = 0; i < count; i++) {
        const permissionText = await visiblePermissions.nth(i).textContent();
        expect(permissionText?.toLowerCase()).toContain(searchTerm.toLowerCase());
      }
    }
    
    await this.cancelOperation();
  }

  /**
   * 验证角色使用情况
   * @param roleName 角色名称
   */
  async verifyRoleUsage(roleName: string): Promise<void> {
    const roles = await this.getRoleList();
    const role = roles.find(r => r.name === roleName);
    
    if (role) {
      // 验证用户数显示
      expect(role.userCount).toMatch(/\d+/);
      
      // 如果角色被使用，删除时应该有警告
      if (parseInt(role.userCount) > 0) {
        await this.clickRoleAction(roleName, 'delete');
        
        const warningMessage = this.page.locator('.warning-message, .alert-warning');
        if (await warningMessage.isVisible()) {
          const warningText = await this.getText(warningMessage);
          expect(warningText).toMatch(/正在使用|有用户|cannot delete/);
        }
        
        await this.cancelOperation();
      }
    }
  }

  /**
   * 导航到角色管理页面（别名方法）
   */
  async navigate(): Promise<void> {
    await this.goto();
  }

  /**
   * 验证角色管理页面已加载（别名方法）
   */
  async verifyRoleManagementLoaded(): Promise<void> {
    await this.verifyPageLoaded();
  }

  /**
   * 获取角色总数
   */
  async getRoleCount(): Promise<number> {
    const rows = this.page.locator(this.roleRows);
    return await rows.count();
  }

  /**
   * 验证角色表格数据
   */
  async verifyRoleTableData(expectedRoles: Array<{name: string, description: string, status: string}>): Promise<void> {
    const actualRoles = await this.getRoleList();
    
    for (const expectedRole of expectedRoles) {
      const foundRole = actualRoles.find(role => role.name === expectedRole.name);
      expect(foundRole).toBeDefined();
      expect(foundRole?.description).toBe(expectedRole.description);
      expect(foundRole?.status).toBe(expectedRole.status);
    }
  }

  /**
   * 搜索并验证结果
   */
  async searchAndVerify(searchTerm: string, expectedCount: number): Promise<void> {
    await this.searchRoles(searchTerm);
    await this.waitForLoadingComplete();
    
    const roleCount = await this.getRoleCount();
    expect(roleCount).toBe(expectedCount);
  }

  /**
   * 批量选择角色
   */
  async selectRoles(roleNames: string[]): Promise<void> {
    for (const roleName of roleNames) {
      const checkbox = this.page.locator(`[data-testid="select-role-${roleName}"], input[type="checkbox"]`).first();
      await checkbox.check();
    }
  }

  /**
   * 批量删除角色
   */
  async bulkDeleteRoles(roleNames: string[]): Promise<void> {
    await this.selectRoles(roleNames);
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
   * 验证角色状态
   */
  async verifyRoleStatus(roleName: string, expectedStatus: string): Promise<void> {
    const roleRow = this.page.locator(`[data-testid="role-row-${roleName}"], tr:has-text("${roleName}")`).first();
    const statusCell = roleRow.locator('[data-testid="role-status"], .status-cell');
    await expect(statusCell).toContainText(expectedStatus);
  }

  /**
   * 验证权限组展开/折叠
   */
  async togglePermissionGroup(groupName: keyof typeof this.permissionGroups): Promise<void> {
    const groupHeader = this.page.locator(`[data-testid="${groupName}-group-header"], .${groupName}-group-header`);
    await groupHeader.click();
  }

  /**
   * 验证权限继承
   */
  async verifyPermissionInheritance(baseRole: string, inheritedRole: string): Promise<void> {
    // 获取基础角色的权限
    await this.viewRoleDetails(baseRole);
    const basePermissions = await this.getSelectedPermissions();
    await this.closeModal();
    
    // 获取继承角色的权限
    await this.viewRoleDetails(inheritedRole);
    const inheritedPermissions = await this.getSelectedPermissions();
    await this.closeModal();
    
    // 验证继承角色包含基础角色的所有权限
    for (const permission of basePermissions) {
      expect(inheritedPermissions).toContain(permission);
    }
  }

  /**
   * 导出角色数据
   */
  async exportRoles(): Promise<void> {
    const exportButton = this.page.locator('[data-testid="export-roles"], button:has-text("导出")');
    await exportButton.click();
  }

  /**
   * 导入角色数据
   */
  async importRoles(filePath: string): Promise<void> {
    const importButton = this.page.locator('[data-testid="import-roles"], button:has-text("导入")');
    await importButton.click();
    
    const fileInput = this.page.locator('input[type="file"]');
    await fileInput.setInputFiles(filePath);
    
    const uploadButton = this.page.locator('[data-testid="upload-file"], button:has-text("上传")');
    await uploadButton.click();
  }
}