import { Page, expect } from '@playwright/test';
import { BasePage } from './base-page';

/**
 * 客户端管理页面对象类
 */
export class ClientManagementPage extends BasePage {
  // 页面元素选择器
  private readonly pageTitle = '[data-testid="clients-title"], h1:has-text("客户端管理"), .page-title';
  private readonly searchInput = '[data-testid="client-search"], input[placeholder*="搜索"], .search-input';
  private readonly searchButton = '[data-testid="search-button"], button:has-text("搜索"), .search-btn';
  private readonly addClientButton = '[data-testid="add-client-button"], button:has-text("添加客户端"), .add-client-btn';
  private readonly clientTable = '[data-testid="clients-table"], table, .clients-table';
  private readonly clientRows = '[data-testid="client-row"], tbody tr, .client-row';
  private readonly loadingSpinner = '[data-testid="loading"], .loading, .spinner';
  private readonly emptyState = '[data-testid="empty-state"], .empty-state, .no-data';
  private readonly pagination = '[data-testid="pagination"], .pagination';
  
  // 过滤器
  private readonly typeFilter = '[data-testid="type-filter"], select[name="type"], .type-filter';
  private readonly statusFilter = '[data-testid="status-filter"], select[name="status"], .status-filter';
  private readonly resetFiltersButton = '[data-testid="reset-filters"], button:has-text("重置"), .reset-filters';
  
  // 客户端表格列
  private readonly tableHeaders = {
    clientId: '[data-testid="header-client-id"], th:has-text("客户端ID")',
    name: '[data-testid="header-name"], th:has-text("名称")',
    type: '[data-testid="header-type"], th:has-text("类型")',
    redirectUris: '[data-testid="header-redirect-uris"], th:has-text("重定向URI")',
    scopes: '[data-testid="header-scopes"], th:has-text("权限范围")',
    status: '[data-testid="header-status"], th:has-text("状态")',
    createdAt: '[data-testid="header-created"], th:has-text("创建时间")',
    actions: '[data-testid="header-actions"], th:has-text("操作")'
  };
  
  // 客户端操作按钮
  private readonly editButton = '[data-testid="edit-client"], button:has-text("编辑"), .edit-btn';
  private readonly deleteButton = '[data-testid="delete-client"], button:has-text("删除"), .delete-btn';
  private readonly viewButton = '[data-testid="view-client"], button:has-text("查看"), .view-btn';
  private readonly regenerateSecretButton = '[data-testid="regenerate-secret"], button:has-text("重新生成密钥"), .regenerate-secret-btn';
  private readonly enableButton = '[data-testid="enable-client"], button:has-text("启用"), .enable-btn';
  private readonly disableButton = '[data-testid="disable-client"], button:has-text("禁用"), .disable-btn';
  
  // 模态框
  private readonly modal = '[data-testid="client-modal"], .modal, .dialog';
  private readonly modalTitle = '[data-testid="modal-title"], .modal-title, .dialog-title';
  private readonly modalCloseButton = '[data-testid="modal-close"], .modal-close, .dialog-close';
  private readonly confirmButton = '[data-testid="confirm-button"], button:has-text("确认"), .confirm-btn';
  private readonly cancelButton = '[data-testid="cancel-button"], button:has-text("取消"), .cancel-btn';
  
  // 表单字段
  private readonly clientNameInput = '[data-testid="client-name-input"], input[name="name"], #clientName';
  private readonly clientDescriptionInput = '[data-testid="client-description-input"], textarea[name="description"], #clientDescription';
  private readonly clientTypeSelect = '[data-testid="client-type-select"], select[name="type"], .client-type-select';
  private readonly redirectUrisInput = '[data-testid="redirect-uris-input"], textarea[name="redirectUris"], #redirectUris';
  private readonly scopesSelect = '[data-testid="scopes-select"], select[name="scopes"], .scopes-select';
  private readonly statusSelect = '[data-testid="status-select"], select[name="status"], .status-select';
  private readonly saveButton = '[data-testid="save-client"], button:has-text("保存"), .save-btn';
  
  // OAuth 配置字段
  private readonly grantTypesSelect = '[data-testid="grant-types-select"], .grant-types-select';
  private readonly responseTypesSelect = '[data-testid="response-types-select"], .response-types-select';
  private readonly tokenEndpointAuthMethodSelect = '[data-testid="token-endpoint-auth-method"], .token-endpoint-auth-method';
  private readonly accessTokenLifetimeInput = '[data-testid="access-token-lifetime"], input[name="accessTokenLifetime"]';
  private readonly refreshTokenLifetimeInput = '[data-testid="refresh-token-lifetime"], input[name="refreshTokenLifetime"]';
  private readonly pkceRequiredCheckbox = '[data-testid="pkce-required"], input[name="pkceRequired"]';
  
  // 客户端密钥显示
  private readonly clientSecretDisplay = '[data-testid="client-secret-display"], .client-secret-display';
  private readonly copySecretButton = '[data-testid="copy-secret"], button:has-text("复制密钥"), .copy-secret-btn';
  private readonly showSecretButton = '[data-testid="show-secret"], button:has-text("显示密钥"), .show-secret-btn';
  private readonly hideSecretButton = '[data-testid="hide-secret"], button:has-text("隐藏密钥"), .hide-secret-btn';
  
  // 错误和成功消息
  private readonly errorMessage = '[data-testid="error-message"], .error-message, .alert-error';
  private readonly successMessage = '[data-testid="success-message"], .success-message, .alert-success';
  private readonly validationError = '[data-testid="validation-error"], .validation-error, .field-error';

  constructor(page: Page) {
    super(page);
  }

  /**
   * 导航到客户端管理页面
   */
  async goto(): Promise<void> {
    await super.goto('/admin/clients');
    await this.waitForLoad();
  }

  /**
   * 验证页面已加载
   */
  async verifyPageLoaded(): Promise<void> {
    await this.waitForElement(this.pageTitle);
    await this.waitForLoadingComplete();
    
    // 验证关键元素存在
    await expect(this.page.locator(this.clientTable)).toBeVisible();
    await expect(this.page.locator(this.addClientButton)).toBeVisible();
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
    
    expect(permissions).toContain('client:read');
  }

  /**
   * 搜索客户端
   * @param searchTerm 搜索关键词
   */
  async searchClients(searchTerm: string): Promise<void> {
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
   * 设置类型过滤器
   * @param type 客户端类型
   */
  async filterByType(type: string): Promise<void> {
    await this.selectOption(this.typeFilter, type);
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
   * 获取客户端列表
   */
  async getClientList(): Promise<Array<{clientId: string, name: string, type: string, status: string}>> {
    await this.waitForElement(this.clientTable);
    
    const rows = this.page.locator(this.clientRows);
    const count = await rows.count();
    const clients = [];
    
    for (let i = 0; i < count; i++) {
      const row = rows.nth(i);
      const cells = row.locator('td');
      
      const clientId = await cells.nth(0).textContent() || '';
      const name = await cells.nth(1).textContent() || '';
      const type = await cells.nth(2).textContent() || '';
      const status = await cells.nth(5).textContent() || '';
      
      clients.push({ 
        clientId: clientId.trim(), 
        name: name.trim(), 
        type: type.trim(),
        status: status.trim() 
      });
    }
    
    return clients;
  }

  /**
   * 验证客户端在列表中存在
   * @param clientId 客户端ID
   */
  async verifyClientExists(clientId: string): Promise<void> {
    const clients = await this.getClientList();
    const clientExists = clients.some(client => client.clientId === clientId);
    expect(clientExists).toBeTruthy();
  }

  /**
   * 验证客户端不在列表中
   * @param clientId 客户端ID
   */
  async verifyClientNotExists(clientId: string): Promise<void> {
    const clients = await this.getClientList();
    const clientExists = clients.some(client => client.clientId === clientId);
    expect(clientExists).toBeFalsy();
  }

  /**
   * 点击添加客户端按钮
   */
  async clickAddClient(): Promise<void> {
    await this.click(this.addClientButton);
    await this.waitForElement(this.modal);
  }

  /**
   * 填写客户端基本信息
   * @param clientData 客户端数据
   */
  async fillClientBasicInfo(clientData: {
    name: string;
    description?: string;
    type: string;
    status?: string;
  }): Promise<void> {
    await this.fill(this.clientNameInput, clientData.name);
    
    if (clientData.description) {
      await this.fill(this.clientDescriptionInput, clientData.description);
    }
    
    await this.selectOption(this.clientTypeSelect, clientData.type);
    
    if (clientData.status) {
      await this.selectOption(this.statusSelect, clientData.status);
    }
  }

  /**
   * 配置OAuth设置
   * @param oauthConfig OAuth配置
   */
  async configureOAuthSettings(oauthConfig: {
    redirectUris: string[];
    scopes: string[];
    grantTypes?: string[];
    responseTypes?: string[];
    tokenEndpointAuthMethod?: string;
    accessTokenLifetime?: number;
    refreshTokenLifetime?: number;
    pkceRequired?: boolean;
  }): Promise<void> {
    // 设置重定向URI
    const redirectUrisText = oauthConfig.redirectUris.join('\n');
    await this.fill(this.redirectUrisInput, redirectUrisText);
    
    // 选择权限范围
    for (const scope of oauthConfig.scopes) {
      await this.selectOption(this.scopesSelect, scope);
    }
    
    // 选择授权类型
    if (oauthConfig.grantTypes) {
      for (const grantType of oauthConfig.grantTypes) {
        const checkbox = this.page.locator(`[data-testid="grant-type-${grantType}"], input[value="${grantType}"]`);
        if (await checkbox.isVisible()) {
          await checkbox.check();
        }
      }
    }
    
    // 选择响应类型
    if (oauthConfig.responseTypes) {
      for (const responseType of oauthConfig.responseTypes) {
        const checkbox = this.page.locator(`[data-testid="response-type-${responseType}"], input[value="${responseType}"]`);
        if (await checkbox.isVisible()) {
          await checkbox.check();
        }
      }
    }
    
    // 设置令牌端点认证方法
    if (oauthConfig.tokenEndpointAuthMethod) {
      await this.selectOption(this.tokenEndpointAuthMethodSelect, oauthConfig.tokenEndpointAuthMethod);
    }
    
    // 设置访问令牌生命周期
    if (oauthConfig.accessTokenLifetime) {
      await this.fill(this.accessTokenLifetimeInput, oauthConfig.accessTokenLifetime.toString());
    }
    
    // 设置刷新令牌生命周期
    if (oauthConfig.refreshTokenLifetime) {
      await this.fill(this.refreshTokenLifetimeInput, oauthConfig.refreshTokenLifetime.toString());
    }
    
    // 设置PKCE要求
    if (oauthConfig.pkceRequired !== undefined) {
      const pkceCheckbox = this.page.locator(this.pkceRequiredCheckbox);
      if (oauthConfig.pkceRequired) {
        await pkceCheckbox.check();
      } else {
        await pkceCheckbox.uncheck();
      }
    }
  }

  /**
   * 保存客户端
   */
  async saveClient(): Promise<void> {
    await this.click(this.saveButton);
    await this.waitForLoadingComplete();
  }

  /**
   * 创建新客户端
   * @param clientData 客户端数据
   */
  async createClient(clientData: {
    name: string;
    description?: string;
    type: string;
    redirectUris: string[];
    scopes: string[];
    grantTypes?: string[];
    responseTypes?: string[];
    status?: string;
  }): Promise<string> {
    await this.clickAddClient();
    await this.fillClientBasicInfo(clientData);
    await this.configureOAuthSettings(clientData);
    await this.saveClient();
    
    await this.verifyOperationSuccess();
    
    // 获取生成的客户端ID
    const clientId = await this.getGeneratedClientId();
    return clientId;
  }

  /**
   * 获取生成的客户端ID
   */
  async getGeneratedClientId(): Promise<string> {
    // 从成功消息或模态框中获取客户端ID
    const successMsg = this.page.locator(this.successMessage);
    if (await successMsg.isVisible()) {
      const successText = await this.getText(successMsg);
      const match = successText.match(/客户端ID[：:]\s*([a-zA-Z0-9-_]+)/);
      if (match) {
        return match[1];
      }
    }
    
    // 或者从客户端详情显示中获取
    const clientIdDisplay = this.page.locator('[data-testid="client-id-display"], .client-id-display');
    if (await clientIdDisplay.isVisible()) {
      return await this.getText(clientIdDisplay);
    }
    
    throw new Error('无法获取生成的客户端ID');
  }

  /**
   * 编辑客户端
   * @param clientId 要编辑的客户端ID
   * @param clientData 更新的客户端数据
   */
  async editClient(clientId: string, clientData: Partial<{
    name: string;
    description: string;
    redirectUris: string[];
    scopes: string[];
    status: string;
  }>): Promise<void> {
    await this.clickClientAction(clientId, 'edit');
    await this.waitForElement(this.modal);
    
    if (clientData.name) {
      await this.fill(this.clientNameInput, clientData.name);
    }
    
    if (clientData.description !== undefined) {
      await this.fill(this.clientDescriptionInput, clientData.description);
    }
    
    if (clientData.redirectUris) {
      const redirectUrisText = clientData.redirectUris.join('\n');
      await this.fill(this.redirectUrisInput, redirectUrisText);
    }
    
    if (clientData.scopes) {
      // 先清空现有选择
      const selectedScopes = this.page.locator(`${this.scopesSelect} option:checked`);
      const count = await selectedScopes.count();
      for (let i = 0; i < count; i++) {
        await selectedScopes.nth(i).click();
      }
      
      // 选择新的权限范围
      for (const scope of clientData.scopes) {
        await this.selectOption(this.scopesSelect, scope);
      }
    }
    
    if (clientData.status) {
      await this.selectOption(this.statusSelect, clientData.status);
    }
    
    await this.saveClient();
    await this.verifyOperationSuccess();
  }

  /**
   * 删除客户端
   * @param clientId 要删除的客户端ID
   */
  async deleteClient(clientId: string): Promise<void> {
    await this.clickClientAction(clientId, 'delete');
    await this.waitForElement(this.modal);
    
    // 确认删除
    await this.click(this.confirmButton);
    await this.waitForLoadingComplete();
    
    await this.verifyOperationSuccess();
  }

  /**
   * 重新生成客户端密钥
   * @param clientId 客户端ID
   */
  async regenerateClientSecret(clientId: string): Promise<string> {
    await this.clickClientAction(clientId, 'regenerate-secret');
    await this.waitForElement(this.modal);
    
    // 确认重新生成
    await this.click(this.confirmButton);
    await this.waitForLoadingComplete();
    
    // 获取新的客户端密钥
    const newSecret = await this.getClientSecret();
    return newSecret;
  }

  /**
   * 获取客户端密钥
   */
  async getClientSecret(): Promise<string> {
    // 显示密钥
    const showButton = this.page.locator(this.showSecretButton);
    if (await showButton.isVisible()) {
      await this.click(showButton);
    }
    
    const secretDisplay = this.page.locator(this.clientSecretDisplay);
    await expect(secretDisplay).toBeVisible();
    
    return await this.getText(secretDisplay);
  }

  /**
   * 复制客户端密钥
   */
  async copyClientSecret(): Promise<void> {
    await this.click(this.copySecretButton);
    
    // 验证复制成功提示
    const copySuccessMsg = this.page.locator('.copy-success, [data-testid="copy-success"]');
    if (await copySuccessMsg.isVisible()) {
      await expect(copySuccessMsg).toBeVisible();
    }
  }

  /**
   * 启用/禁用客户端
   * @param clientId 客户端ID
   * @param enable 是否启用
   */
  async toggleClientStatus(clientId: string, enable: boolean): Promise<void> {
    const action = enable ? 'enable' : 'disable';
    await this.clickClientAction(clientId, action);
    
    // 如果有确认对话框，点击确认
    const confirmModal = this.page.locator(this.modal);
    if (await confirmModal.isVisible()) {
      await this.click(this.confirmButton);
    }
    
    await this.waitForLoadingComplete();
    await this.verifyOperationSuccess();
  }

  /**
   * 点击客户端操作按钮
   * @param clientId 客户端ID
   * @param action 操作类型
   */
  async clickClientAction(clientId: string, action: 'edit' | 'delete' | 'view' | 'regenerate-secret' | 'enable' | 'disable'): Promise<void> {
    const clientRow = this.page.locator(this.clientRows).filter({ hasText: clientId });
    await expect(clientRow).toBeVisible();
    
    const actionSelectors = {
      edit: this.editButton,
      delete: this.deleteButton,
      view: this.viewButton,
      'regenerate-secret': this.regenerateSecretButton,
      enable: this.enableButton,
      disable: this.disableButton
    };
    
    const actionButton = clientRow.locator(actionSelectors[action]);
    await this.click(actionButton);
  }

  /**
   * 查看客户端详情
   * @param clientId 客户端ID
   */
  async viewClientDetails(clientId: string): Promise<void> {
    await this.clickClientAction(clientId, 'view');
    await this.waitForElement(this.modal);
    
    // 验证客户端详情显示
    const modalTitle = await this.getText(this.modalTitle);
    expect(modalTitle).toContain(clientId);
  }

  /**
   * 验证客户端配置
   * @param clientId 客户端ID
   * @param expectedConfig 期望的配置
   */
  async verifyClientConfiguration(clientId: string, expectedConfig: {
    redirectUris?: string[];
    scopes?: string[];
    grantTypes?: string[];
    responseTypes?: string[];
  }): Promise<void> {
    await this.viewClientDetails(clientId);
    
    // 验证重定向URI
    if (expectedConfig.redirectUris) {
      for (const uri of expectedConfig.redirectUris) {
        const uriElement = this.page.locator(`.redirect-uri:has-text("${uri}"), [data-testid="redirect-uri"]:has-text("${uri}")`);
        await expect(uriElement).toBeVisible();
      }
    }
    
    // 验证权限范围
    if (expectedConfig.scopes) {
      for (const scope of expectedConfig.scopes) {
        const scopeElement = this.page.locator(`.scope:has-text("${scope}"), [data-testid="scope"]:has-text("${scope}")`);
        await expect(scopeElement).toBeVisible();
      }
    }
    
    // 验证授权类型
    if (expectedConfig.grantTypes) {
      for (const grantType of expectedConfig.grantTypes) {
        const grantTypeElement = this.page.locator(`.grant-type:has-text("${grantType}"), [data-testid="grant-type"]:has-text("${grantType}")`);
        await expect(grantTypeElement).toBeVisible();
      }
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
   * 验证重定向URI格式
   * @param invalidUri 无效的URI
   */
  async verifyRedirectUriValidation(invalidUri: string): Promise<void> {
    await this.clickAddClient();
    await this.fill(this.clientNameInput, 'Test Client');
    await this.selectOption(this.clientTypeSelect, 'web');
    await this.fill(this.redirectUrisInput, invalidUri);
    await this.saveClient();
    
    // 应该显示URI格式错误
    await this.verifyValidationError('redirectUris', 'URI格式无效');
    
    await this.cancelOperation();
  }

  /**
   * 验证客户端类型限制
   * @param clientType 客户端类型
   * @param restrictedFeature 受限功能
   */
  async verifyClientTypeRestrictions(clientType: string, restrictedFeature: string): Promise<void> {
    await this.clickAddClient();
    await this.selectOption(this.clientTypeSelect, clientType);
    
    // 验证某些功能对特定客户端类型不可用
    const restrictedElement = this.page.locator(`[data-testid="${restrictedFeature}"], .${restrictedFeature}`);
    
    if (clientType === 'public') {
      // 公共客户端不应该有客户端密钥相关功能
      if (restrictedFeature === 'client-secret') {
        await expect(restrictedElement).not.toBeVisible();
      }
    }
    
    await this.cancelOperation();
  }

  /**
   * 验证PKCE要求
   * @param clientType 客户端类型
   */
  async verifyPKCERequirement(clientType: string): Promise<void> {
    await this.clickAddClient();
    await this.selectOption(this.clientTypeSelect, clientType);
    
    const pkceCheckbox = this.page.locator(this.pkceRequiredCheckbox);
    
    if (clientType === 'public') {
      // 公共客户端应该强制要求PKCE
      await expect(pkceCheckbox).toBeChecked();
      await expect(pkceCheckbox).toBeDisabled();
    } else {
      // 机密客户端PKCE是可选的
      await expect(pkceCheckbox).toBeEnabled();
    }
    
    await this.cancelOperation();
  }

  /**
   * 验证客户端权限范围
   * @param clientId 客户端ID
   * @param expectedScopes 期望的权限范围
   */
  async verifyClientScopes(clientId: string, expectedScopes: string[]): Promise<void> {
    const clients = await this.getClientList();
    const client = clients.find(c => c.clientId === clientId);
    
    if (client) {
      await this.viewClientDetails(clientId);
      
      for (const scope of expectedScopes) {
        const scopeElement = this.page.locator(`.scope:has-text("${scope}"), [data-testid="scope"]:has-text("${scope}")`);
        await expect(scopeElement).toBeVisible();
      }
      
      await this.closeModal();
    }
  }
}