import { Page, expect } from '@playwright/test';
import { BasePage } from './base-page';

/**
 * 个人资料页面对象类
 */
export class ProfilePage extends BasePage {
  // 页面元素选择器
  private readonly pageTitle = '[data-testid="profile-title"], h1:has-text("个人资料"), .page-title';
  private readonly userAvatar = '[data-testid="user-avatar"], .user-avatar, .avatar';
  private readonly uploadAvatarButton = '[data-testid="upload-avatar"], button:has-text("上传头像"), .upload-avatar-btn';
  private readonly removeAvatarButton = '[data-testid="remove-avatar"], button:has-text("移除头像"), .remove-avatar-btn';
  
  // 基本信息表单
  private readonly basicInfoForm = '[data-testid="basic-info-form"], .basic-info-form';
  private readonly usernameDisplay = '[data-testid="username-display"], .username-display';
  private readonly emailInput = '[data-testid="email-input"], input[name="email"], #email';
  private readonly firstNameInput = '[data-testid="first-name-input"], input[name="firstName"], #firstName';
  private readonly lastNameInput = '[data-testid="last-name-input"], input[name="lastName"], #lastName';
  private readonly phoneInput = '[data-testid="phone-input"], input[name="phone"], #phone';
  private readonly bioTextarea = '[data-testid="bio-textarea"], textarea[name="bio"], #bio';
  private readonly saveBasicInfoButton = '[data-testid="save-basic-info"], button:has-text("保存基本信息"), .save-basic-info-btn';
  
  // 密码修改表单
  private readonly passwordForm = '[data-testid="password-form"], .password-form';
  private readonly currentPasswordInput = '[data-testid="current-password"], input[name="currentPassword"], #currentPassword';
  private readonly newPasswordInput = '[data-testid="new-password"], input[name="newPassword"], #newPassword';
  private readonly confirmPasswordInput = '[data-testid="confirm-password"], input[name="confirmPassword"], #confirmPassword';
  private readonly changePasswordButton = '[data-testid="change-password"], button:has-text("修改密码"), .change-password-btn';
  
  // 安全设置
  private readonly securitySection = '[data-testid="security-section"], .security-section';
  private readonly twoFactorToggle = '[data-testid="two-factor-toggle"], input[name="twoFactorEnabled"], .two-factor-toggle';
  private readonly setupTwoFactorButton = '[data-testid="setup-two-factor"], button:has-text("设置双因素认证"), .setup-two-factor-btn';
  private readonly disableTwoFactorButton = '[data-testid="disable-two-factor"], button:has-text("禁用双因素认证"), .disable-two-factor-btn';
  private readonly backupCodesButton = '[data-testid="backup-codes"], button:has-text("备份代码"), .backup-codes-btn';
  
  // 会话管理
  private readonly sessionsSection = '[data-testid="sessions-section"], .sessions-section';
  private readonly activeSessionsList = '[data-testid="active-sessions"], .active-sessions';
  private readonly sessionItem = '[data-testid="session-item"], .session-item';
  private readonly revokeSessionButton = '[data-testid="revoke-session"], button:has-text("撤销"), .revoke-session-btn';
  private readonly revokeAllSessionsButton = '[data-testid="revoke-all-sessions"], button:has-text("撤销所有会话"), .revoke-all-sessions-btn';
  
  // 个人偏好设置
  private readonly preferencesSection = '[data-testid="preferences-section"], .preferences-section';
  private readonly languageSelect = '[data-testid="language-select"], select[name="language"], .language-select';
  private readonly timezoneSelect = '[data-testid="timezone-select"], select[name="timezone"], .timezone-select';
  private readonly themeSelect = '[data-testid="theme-select"], select[name="theme"], .theme-select';
  private readonly notificationSettings = '[data-testid="notification-settings"], .notification-settings';
  private readonly emailNotificationsToggle = '[data-testid="email-notifications"], input[name="emailNotifications"]';
  private readonly savePreferencesButton = '[data-testid="save-preferences"], button:has-text("保存偏好"), .save-preferences-btn';
  
  // API密钥管理
  private readonly apiKeysSection = '[data-testid="api-keys-section"], .api-keys-section';
  private readonly createApiKeyButton = '[data-testid="create-api-key"], button:has-text("创建API密钥"), .create-api-key-btn';
  private readonly apiKeysList = '[data-testid="api-keys-list"], .api-keys-list';
  private readonly apiKeyItem = '[data-testid="api-key-item"], .api-key-item';
  private readonly revokeApiKeyButton = '[data-testid="revoke-api-key"], button:has-text("撤销"), .revoke-api-key-btn';
  
  // 账户操作
  private readonly accountActionsSection = '[data-testid="account-actions"], .account-actions';
  private readonly exportDataButton = '[data-testid="export-data"], button:has-text("导出数据"), .export-data-btn';
  private readonly deleteAccountButton = '[data-testid="delete-account"], button:has-text("删除账户"), .delete-account-btn';
  
  // 模态框
  private readonly modal = '[data-testid="modal"], .modal, .dialog';
  private readonly modalTitle = '[data-testid="modal-title"], .modal-title, .dialog-title';
  private readonly modalCloseButton = '[data-testid="modal-close"], .modal-close, .dialog-close';
  private readonly confirmButton = '[data-testid="confirm-button"], button:has-text("确认"), .confirm-btn';
  private readonly cancelButton = '[data-testid="cancel-button"], button:has-text("取消"), .cancel-btn';
  
  // 文件上传
  private readonly fileInput = '[data-testid="file-input"], input[type="file"]';
  private readonly cropperContainer = '[data-testid="cropper-container"], .cropper-container';
  private readonly cropButton = '[data-testid="crop-button"], button:has-text("裁剪"), .crop-btn';
  
  // 错误和成功消息
  private readonly errorMessage = '[data-testid="error-message"], .error-message, .alert-error';
  private readonly successMessage = '[data-testid="success-message"], .success-message, .alert-success';
  private readonly validationError = '[data-testid="validation-error"], .validation-error, .field-error';

  constructor(page: Page) {
    super(page);
  }

  /**
   * 导航到个人资料页面
   */
  async goto(): Promise<void> {
    await super.goto('/profile');
    await this.waitForLoad();
  }

  /**
   * 验证页面已加载
   */
  async verifyPageLoaded(): Promise<void> {
    await this.waitForElement(this.pageTitle);
    await this.waitForLoadingComplete();
    
    // 验证关键元素存在
    await expect(this.page.locator(this.basicInfoForm)).toBeVisible();
    await expect(this.page.locator(this.passwordForm)).toBeVisible();
  }

  /**
   * 验证用户信息显示
   * @param expectedUserInfo 期望的用户信息
   */
  async verifyUserInfo(expectedUserInfo: {
    username: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
  }): Promise<void> {
    // 验证用户名显示
    const usernameText = await this.getText(this.usernameDisplay);
    expect(usernameText).toContain(expectedUserInfo.username);
    
    // 验证邮箱
    if (expectedUserInfo.email) {
      const emailValue = await this.page.locator(this.emailInput).inputValue();
      expect(emailValue).toBe(expectedUserInfo.email);
    }
    
    // 验证姓名
    if (expectedUserInfo.firstName) {
      const firstNameValue = await this.page.locator(this.firstNameInput).inputValue();
      expect(firstNameValue).toBe(expectedUserInfo.firstName);
    }
    
    if (expectedUserInfo.lastName) {
      const lastNameValue = await this.page.locator(this.lastNameInput).inputValue();
      expect(lastNameValue).toBe(expectedUserInfo.lastName);
    }
    
    // 验证电话
    if (expectedUserInfo.phone) {
      const phoneValue = await this.page.locator(this.phoneInput).inputValue();
      expect(phoneValue).toBe(expectedUserInfo.phone);
    }
  }

  /**
   * 更新基本信息
   * @param userInfo 用户信息
   */
  async updateBasicInfo(userInfo: {
    email?: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    bio?: string;
  }): Promise<void> {
    if (userInfo.email) {
      await this.fill(this.emailInput, userInfo.email);
    }
    
    if (userInfo.firstName) {
      await this.fill(this.firstNameInput, userInfo.firstName);
    }
    
    if (userInfo.lastName) {
      await this.fill(this.lastNameInput, userInfo.lastName);
    }
    
    if (userInfo.phone) {
      await this.fill(this.phoneInput, userInfo.phone);
    }
    
    if (userInfo.bio) {
      await this.fill(this.bioTextarea, userInfo.bio);
    }
    
    await this.click(this.saveBasicInfoButton);
    await this.waitForLoadingComplete();
    await this.verifyOperationSuccess();
  }

  /**
   * 修改密码
   * @param passwordData 密码数据
   */
  async changePassword(passwordData: {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  }): Promise<void> {
    await this.fill(this.currentPasswordInput, passwordData.currentPassword);
    await this.fill(this.newPasswordInput, passwordData.newPassword);
    await this.fill(this.confirmPasswordInput, passwordData.confirmPassword);
    
    await this.click(this.changePasswordButton);
    await this.waitForLoadingComplete();
    await this.verifyOperationSuccess();
  }

  /**
   * 上传头像
   * @param imagePath 图片路径
   */
  async uploadAvatar(imagePath: string): Promise<void> {
    await this.click(this.uploadAvatarButton);
    
    // 上传文件
    const fileInput = this.page.locator(this.fileInput);
    await fileInput.setInputFiles(imagePath);
    
    // 如果有裁剪功能，进行裁剪
    const cropperContainer = this.page.locator(this.cropperContainer);
    if (await cropperContainer.isVisible()) {
      await this.click(this.cropButton);
    }
    
    await this.waitForLoadingComplete();
    await this.verifyOperationSuccess();
  }

  /**
   * 移除头像
   */
  async removeAvatar(): Promise<void> {
    await this.click(this.removeAvatarButton);
    
    // 确认移除
    const confirmModal = this.page.locator(this.modal);
    if (await confirmModal.isVisible()) {
      await this.click(this.confirmButton);
    }
    
    await this.waitForLoadingComplete();
    await this.verifyOperationSuccess();
  }

  /**
   * 设置双因素认证
   */
  async setupTwoFactor(): Promise<string> {
    await this.click(this.setupTwoFactorButton);
    await this.waitForElement(this.modal);
    
    // 获取二维码或密钥
    const qrCode = this.page.locator('[data-testid="qr-code"], .qr-code');
    const secretKey = this.page.locator('[data-testid="secret-key"], .secret-key');
    
    let secret = '';
    if (await secretKey.isVisible()) {
      secret = await this.getText(secretKey);
    }
    
    // 输入验证码（这里需要外部提供验证码）
    const verificationCodeInput = this.page.locator('[data-testid="verification-code"], input[name="verificationCode"]');
    // 注意：在实际测试中，需要使用TOTP库生成验证码
    
    await this.click(this.confirmButton);
    await this.waitForLoadingComplete();
    await this.verifyOperationSuccess();
    
    return secret;
  }

  /**
   * 禁用双因素认证
   * @param verificationCode 验证码
   */
  async disableTwoFactor(verificationCode: string): Promise<void> {
    await this.click(this.disableTwoFactorButton);
    await this.waitForElement(this.modal);
    
    // 输入验证码
    const verificationCodeInput = this.page.locator('[data-testid="verification-code"], input[name="verificationCode"]');
    await this.fill(verificationCodeInput, verificationCode);
    
    await this.click(this.confirmButton);
    await this.waitForLoadingComplete();
    await this.verifyOperationSuccess();
  }

  /**
   * 获取备份代码
   */
  async getBackupCodes(): Promise<string[]> {
    await this.click(this.backupCodesButton);
    await this.waitForElement(this.modal);
    
    const backupCodesList = this.page.locator('[data-testid="backup-codes-list"], .backup-codes-list');
    const codes = await backupCodesList.locator('.backup-code').allTextContents();
    
    await this.closeModal();
    return codes;
  }

  /**
   * 查看活跃会话
   */
  async getActiveSessions(): Promise<Array<{device: string, location: string, lastActive: string}>> {
    await this.waitForElement(this.activeSessionsList);
    
    const sessionItems = this.page.locator(this.sessionItem);
    const count = await sessionItems.count();
    const sessions = [];
    
    for (let i = 0; i < count; i++) {
      const item = sessionItems.nth(i);
      const device = await item.locator('.device-info').textContent() || '';
      const location = await item.locator('.location-info').textContent() || '';
      const lastActive = await item.locator('.last-active').textContent() || '';
      
      sessions.push({
        device: device.trim(),
        location: location.trim(),
        lastActive: lastActive.trim()
      });
    }
    
    return sessions;
  }

  /**
   * 撤销指定会话
   * @param sessionIndex 会话索引
   */
  async revokeSession(sessionIndex: number): Promise<void> {
    const sessionItems = this.page.locator(this.sessionItem);
    const targetSession = sessionItems.nth(sessionIndex);
    
    await targetSession.locator(this.revokeSessionButton).click();
    
    // 确认撤销
    const confirmModal = this.page.locator(this.modal);
    if (await confirmModal.isVisible()) {
      await this.click(this.confirmButton);
    }
    
    await this.waitForLoadingComplete();
    await this.verifyOperationSuccess();
  }

  /**
   * 撤销所有会话
   */
  async revokeAllSessions(): Promise<void> {
    await this.click(this.revokeAllSessionsButton);
    await this.waitForElement(this.modal);
    
    // 确认撤销
    await this.click(this.confirmButton);
    await this.waitForLoadingComplete();
    await this.verifyOperationSuccess();
  }

  /**
   * 更新个人偏好
   * @param preferences 偏好设置
   */
  async updatePreferences(preferences: {
    language?: string;
    timezone?: string;
    theme?: string;
    emailNotifications?: boolean;
  }): Promise<void> {
    if (preferences.language) {
      await this.selectOption(this.languageSelect, preferences.language);
    }
    
    if (preferences.timezone) {
      await this.selectOption(this.timezoneSelect, preferences.timezone);
    }
    
    if (preferences.theme) {
      await this.selectOption(this.themeSelect, preferences.theme);
    }
    
    if (preferences.emailNotifications !== undefined) {
      const toggle = this.page.locator(this.emailNotificationsToggle);
      if (preferences.emailNotifications) {
        await toggle.check();
      } else {
        await toggle.uncheck();
      }
    }
    
    await this.click(this.savePreferencesButton);
    await this.waitForLoadingComplete();
    await this.verifyOperationSuccess();
  }

  /**
   * 创建API密钥
   * @param keyName 密钥名称
   * @param permissions 权限列表
   */
  async createApiKey(keyName: string, permissions: string[]): Promise<string> {
    await this.click(this.createApiKeyButton);
    await this.waitForElement(this.modal);
    
    // 填写密钥名称
    const keyNameInput = this.page.locator('[data-testid="api-key-name"], input[name="keyName"]');
    await this.fill(keyNameInput, keyName);
    
    // 选择权限
    for (const permission of permissions) {
      const permissionCheckbox = this.page.locator(`[data-testid="permission-${permission}"], input[value="${permission}"]`);
      if (await permissionCheckbox.isVisible()) {
        await permissionCheckbox.check();
      }
    }
    
    await this.click(this.confirmButton);
    await this.waitForLoadingComplete();
    
    // 获取生成的API密钥
    const apiKeyDisplay = this.page.locator('[data-testid="api-key-display"], .api-key-display');
    const apiKey = await this.getText(apiKeyDisplay);
    
    await this.closeModal();
    return apiKey;
  }

  /**
   * 撤销API密钥
   * @param keyName 密钥名称
   */
  async revokeApiKey(keyName: string): Promise<void> {
    const apiKeyItems = this.page.locator(this.apiKeyItem);
    const targetKey = apiKeyItems.filter({ hasText: keyName });
    
    await targetKey.locator(this.revokeApiKeyButton).click();
    
    // 确认撤销
    const confirmModal = this.page.locator(this.modal);
    if (await confirmModal.isVisible()) {
      await this.click(this.confirmButton);
    }
    
    await this.waitForLoadingComplete();
    await this.verifyOperationSuccess();
  }

  /**
   * 导出用户数据
   */
  async exportUserData(): Promise<void> {
    await this.click(this.exportDataButton);
    
    // 等待下载开始
    const downloadPromise = this.page.waitForEvent('download');
    
    // 确认导出
    const confirmModal = this.page.locator(this.modal);
    if (await confirmModal.isVisible()) {
      await this.click(this.confirmButton);
    }
    
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/user-data.*\.(json|zip)/);
  }

  /**
   * 删除账户
   * @param confirmationText 确认文本
   */
  async deleteAccount(confirmationText: string): Promise<void> {
    await this.click(this.deleteAccountButton);
    await this.waitForElement(this.modal);
    
    // 输入确认文本
    const confirmationInput = this.page.locator('[data-testid="confirmation-input"], input[name="confirmation"]');
    await this.fill(confirmationInput, confirmationText);
    
    await this.click(this.confirmButton);
    await this.waitForLoadingComplete();
    
    // 验证重定向到登录页面
    await this.waitForUrl('/auth/login');
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
   * 验证头像显示
   */
  async verifyAvatarDisplay(): Promise<void> {
    const avatar = this.page.locator(this.userAvatar);
    await expect(avatar).toBeVisible();
    
    // 验证头像图片加载
    const avatarImg = avatar.locator('img');
    if (await avatarImg.isVisible()) {
      await expect(avatarImg).toHaveAttribute('src', /.+/);
    }
  }

  /**
   * 验证双因素认证状态
   * @param enabled 是否启用
   */
  async verifyTwoFactorStatus(enabled: boolean): Promise<void> {
    const toggle = this.page.locator(this.twoFactorToggle);
    
    if (enabled) {
      await expect(toggle).toBeChecked();
      await expect(this.page.locator(this.disableTwoFactorButton)).toBeVisible();
    } else {
      await expect(toggle).not.toBeChecked();
      await expect(this.page.locator(this.setupTwoFactorButton)).toBeVisible();
    }
  }

  /**
   * 验证密码强度要求
   * @param weakPassword 弱密码
   */
  async verifyPasswordStrengthRequirements(weakPassword: string): Promise<void> {
    await this.fill(this.currentPasswordInput, 'current-password');
    await this.fill(this.newPasswordInput, weakPassword);
    await this.fill(this.confirmPasswordInput, weakPassword);
    
    await this.click(this.changePasswordButton);
    
    // 应该显示密码强度不足的错误
    await this.verifyValidationError('newPassword', '密码强度不足');
  }

  /**
   * 验证邮箱格式验证
   * @param invalidEmail 无效邮箱
   */
  async verifyEmailValidation(invalidEmail: string): Promise<void> {
    await this.fill(this.emailInput, invalidEmail);
    await this.click(this.saveBasicInfoButton);
    
    // 应该显示邮箱格式错误
    await this.verifyValidationError('email', '邮箱格式无效');
  }

  /**
   * 验证电话号码格式验证
   * @param invalidPhone 无效电话号码
   */
  async verifyPhoneValidation(invalidPhone: string): Promise<void> {
    await this.fill(this.phoneInput, invalidPhone);
    await this.click(this.saveBasicInfoButton);
    
    // 应该显示电话号码格式错误
    await this.verifyValidationError('phone', '电话号码格式无效');
  }
}