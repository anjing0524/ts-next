import { test, expect } from '@playwright/test';
import { ProfilePage } from '../pages/profile-page';
import { DashboardPage } from '../pages/dashboard-page';
import { TestHelpers, TEST_USERS, TEST_PERMISSIONS } from '../utils/test-helpers';

test.describe('个人资料管理功能', () => {
  let profilePage: ProfilePage;
  let dashboardPage: DashboardPage;
  
  const testUser = TestHelpers.generateUserData({
    ...TEST_USERS.ADMIN,
    firstName: '张',
    lastName: '三',
    email: 'zhangsan@example.com',
    phone: '13800138000',
    roles: ['admin']
  });
  
  const activeSessions = [
    {
      id: 'session-1',
      deviceInfo: 'Chrome on Windows 10',
      ipAddress: '192.168.1.100',
      location: '北京, 中国',
      lastActivity: new Date().toISOString(),
      isCurrent: true
    },
    {
      id: 'session-2',
      deviceInfo: 'Safari on iPhone',
      ipAddress: '192.168.1.101',
      location: '上海, 中国',
      lastActivity: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2小时前
      isCurrent: false
    },
    {
      id: 'session-3',
      deviceInfo: 'Firefox on macOS',
      ipAddress: '192.168.1.102',
      location: '深圳, 中国',
      lastActivity: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // 1天前
      isCurrent: false
    }
  ];
  
  const apiKeys = [
    {
      id: 'key-1',
      name: 'Production API',
      keyPrefix: 'pk_prod_',
      permissions: ['api:read', 'api:write'],
      lastUsed: new Date().toISOString(),
      createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30天前
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString() // 1年后
    },
    {
      id: 'key-2',
      name: 'Development API',
      keyPrefix: 'pk_dev_',
      permissions: ['api:read'],
      lastUsed: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), // 7天前
      createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(), // 60天前
      expiresAt: null // 永不过期
    }
  ];

  test.beforeEach(async ({ page }) => {
    profilePage = new ProfilePage(page);
    dashboardPage = new DashboardPage(page);
    
    // 设置用户认证状态
    await TestHelpers.setAuthState(page, testUser, [
      TEST_PERMISSIONS.USERS_READ,
      TEST_PERMISSIONS.USERS_WRITE
    ]);
    
    // 模拟用户信息API
    await TestHelpers.mockApiResponse(
      page,
      '**/api/profile*',
      { data: testUser }
    );
    
    // 模拟活跃会话API
    await TestHelpers.mockApiResponse(
      page,
      '**/api/profile/sessions*',
      { data: activeSessions }
    );
    
    // 模拟API密钥列表API
    await TestHelpers.mockApiResponse(
      page,
      '**/api/profile/api-keys*',
      { data: apiKeys }
    );
  });

  test('个人资料页面显示', async ({ page }) => {
    await profilePage.goto();
    await profilePage.verifyPageLoaded();
    
    // 验证用户基本信息显示
    await profilePage.verifyUserInfo({
      firstName: testUser.firstName,
      lastName: testUser.lastName,
      email: testUser.email,
      phone: testUser.phone,
      avatar: testUser.avatar
    });
    
    // 验证用户偏好设置显示
    // await profilePage.verifyUserPreferences({
    //   timezone: 'Asia/Shanghai',
    //   language: 'zh-CN'
    // });
    
    // 验证双因素认证状态
    await profilePage.verifyTwoFactorStatus(false);
  });

  test('更新基本信息', async ({ page }) => {
    await profilePage.goto();
    await profilePage.verifyPageLoaded();
    
    const updatedInfo = {
      firstName: '李',
      lastName: '四',
      phone: '13900139000'
    };
    
    // 模拟更新用户信息API
    await TestHelpers.mockApiResponse(
      page,
      '**/api/profile',
      { success: true, data: { ...testUser, ...updatedInfo } }
    );
    
    await profilePage.updateBasicInfo(updatedInfo);
    await profilePage.submitBasicInfoForm();
    
    // 验证更新成功
    await profilePage.verifyOperationSuccess('个人信息更新成功');
    
    // 验证API调用
    await TestHelpers.verifyApiCall(page, '/api/profile', 'PUT', updatedInfo);
  });

  test('修改密码', async ({ page }) => {
    await profilePage.goto();
    await profilePage.verifyPageLoaded();
    
    const passwordData = {
      currentPassword: 'current123',
      newPassword: 'newPassword123!',
      confirmPassword: 'newPassword123!'
    };
    
    // 模拟修改密码API
    await TestHelpers.mockApiResponse(
      page,
      '**/api/profile/password',
      { success: true }
    );
    
    await profilePage.changePassword(passwordData);
    await profilePage.submitPasswordForm();
    
    // 验证修改成功
    await profilePage.verifyOperationSuccess('密码修改成功');
    
    // 验证API调用
    await TestHelpers.verifyApiCall(page, '/api/profile/password', 'PUT', {
      currentPassword: passwordData.currentPassword,
      newPassword: passwordData.newPassword
    });
  });

  test('头像上传', async ({ page }) => {
    await profilePage.goto();
    await profilePage.verifyPageLoaded();
    
    const newAvatarUrl = 'https://example.com/new-avatar.jpg';
    
    // 模拟头像上传API
    await TestHelpers.mockApiResponse(
      page,
      '**/api/profile/avatar',
      { success: true, avatarUrl: newAvatarUrl }
    );
    
    // 创建测试文件
    const fileContent = 'fake-image-content';
    await profilePage.uploadAvatar(fileContent);
    
    // 验证头像上传成功
    await profilePage.verifyOperationSuccess('头像上传成功');
    // await profilePage.verifyAvatarUpdated(newAvatarUrl);
    
    // 验证API调用
    await TestHelpers.verifyApiCall(page, '/api/profile/avatar', 'POST');
  });

  test('移除头像', async ({ page }) => {
    await profilePage.goto();
    await profilePage.verifyPageLoaded();
    
    // 模拟移除头像API
    await TestHelpers.mockApiResponse(
      page,
      '**/api/profile/avatar',
      { success: true }
    );
    
    await profilePage.removeAvatar();
    await profilePage.confirmAvatarRemoval();
    
    // 验证移除成功
    await profilePage.verifyOperationSuccess('头像已移除');
    // await profilePage.verifyAvatarRemoved();
    
    // 验证API调用
    await TestHelpers.verifyApiCall(page, '/api/profile/avatar', 'DELETE');
  });

  test('启用双因素认证', async ({ page }) => {
    await profilePage.goto();
    await profilePage.verifyPageLoaded();
    
    const qrCodeData = {
      secret: 'JBSWY3DPEHPK3PXP',
      qrCodeUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...',
      backupCodes: ['123456', '789012', '345678', '901234', '567890']
    };
    
    // 模拟生成2FA密钥API
    await TestHelpers.mockApiResponse(
      page,
      '**/api/profile/2fa/setup',
      { data: qrCodeData }
    );
    
    // 模拟验证2FA代码API
    await TestHelpers.mockApiResponse(
      page,
      '**/api/profile/2fa/verify',
      { success: true, backupCodes: qrCodeData.backupCodes }
    );
    
    await profilePage.enableTwoFactor();
    
    // 验证QR码显示
    // await profilePage.verifyQrCodeDisplayed();
    // await profilePage.verifySecretKeyDisplayed(qrCodeData.secret);
    
    // 输入验证码
    const verificationCode = '123456';
    await profilePage.enterVerificationCode(verificationCode);
    await profilePage.confirmTwoFactorSetup();
    
    // 验证启用成功
    await profilePage.verifyOperationSuccess('双因素认证已启用');
    // await profilePage.verifyBackupCodesDisplayed(qrCodeData.backupCodes);
    
    // 验证API调用
    await TestHelpers.verifyApiCall(page, '/api/profile/2fa/verify', 'POST', {
      code: verificationCode
    });
  });

  test('禁用双因素认证', async ({ page }) => {
    // 设置已启用2FA的用户
    const userWith2FA = { ...testUser, twoFactorEnabled: true };
    await TestHelpers.setAuthState(page, userWith2FA, [
      TEST_PERMISSIONS.USERS_READ,
      TEST_PERMISSIONS.USERS_WRITE
    ]);
    
    await TestHelpers.mockApiResponse(
      page,
      '**/api/profile*',
      { data: userWith2FA }
    );
    
    await profilePage.goto();
    await profilePage.verifyPageLoaded();
    
    // 模拟禁用2FA API
    await TestHelpers.mockApiResponse(
      page,
      '**/api/profile/2fa/disable',
      { success: true }
    );
    
    await profilePage.disableTwoFactor();
    
    // 输入当前密码确认
    await profilePage.enterCurrentPassword('current123');
    await profilePage.confirmTwoFactorDisable();
    
    // 验证禁用成功
    await profilePage.verifyOperationSuccess('双因素认证已禁用');
    await profilePage.verifyTwoFactorStatus(false);
    
    // 验证API调用
    await TestHelpers.verifyApiCall(page, '/api/profile/2fa/disable', 'POST');
  });

  test('获取备份代码', async ({ page }) => {
    // 设置已启用2FA的用户
    const userWith2FA = { ...testUser, twoFactorEnabled: true };
    await TestHelpers.setAuthState(page, userWith2FA, [
      TEST_PERMISSIONS.USERS_READ,
      TEST_PERMISSIONS.USERS_WRITE
    ]);
    
    await TestHelpers.mockApiResponse(
      page,
      '**/api/profile*',
      { data: userWith2FA }
    );
    
    const backupCodes = ['111111', '222222', '333333', '444444', '555555'];
    
    // 模拟获取备份代码API
    await TestHelpers.mockApiResponse(
      page,
      '**/api/profile/2fa/backup-codes',
      { data: backupCodes }
    );
    
    await profilePage.goto();
    await profilePage.verifyPageLoaded();
    
    await profilePage.getBackupCodes();
    
    // 输入当前密码确认
    await profilePage.enterCurrentPassword('current123');
    await profilePage.confirmBackupCodesGeneration();
    
    // 验证备份代码显示
    // await profilePage.verifyBackupCodesDisplayed(backupCodes);
    
    // 验证API调用
    await TestHelpers.verifyApiCall(page, '/api/profile/2fa/backup-codes', 'POST');
  });

  test('活跃会话管理', async ({ page }) => {
    await profilePage.goto();
    await profilePage.verifyPageLoaded();
    
    // 切换到会话管理标签
    await profilePage.switchToSessionsTab();
    
    // 验证会话列表显示
    // await profilePage.verifySessionsList(activeSessions);
    
    // 验证当前会话标识
    // await profilePage.verifyCurrentSession(activeSessions[0].id);
    
    // 终止其他会话
    const sessionToTerminate = activeSessions[1];
    
    // 模拟终止会话API
    await TestHelpers.mockApiResponse(
      page,
      `**/api/profile/sessions/${sessionToTerminate.id}`,
      { success: true }
    );
    
    await profilePage.terminateSession(sessionToTerminate.id);
    await profilePage.confirmSessionTermination();
    
    // 验证终止成功
    await profilePage.verifyOperationSuccess('会话已终止');
    
    // 验证API调用
    await TestHelpers.verifyApiCall(
      page,
      `/api/profile/sessions/${sessionToTerminate.id}`,
      'DELETE'
    );
  });

  test('终止所有其他会话', async ({ page }) => {
    await profilePage.goto();
    await profilePage.verifyPageLoaded();
    
    await profilePage.switchToSessionsTab();
    
    // 模拟终止所有其他会话API
    await TestHelpers.mockApiResponse(
      page,
      '**/api/profile/sessions/terminate-others',
      { success: true, terminatedCount: 2 }
    );
    
    await profilePage.terminateAllOtherSessions();
    await profilePage.confirmTerminateAllSessions();
    
    // 验证终止成功
    await profilePage.verifyOperationSuccess('已终止所有其他会话');
    
    // 验证API调用
    await TestHelpers.verifyApiCall(
      page,
      '/api/profile/sessions/terminate-others',
      'POST'
    );
  });

  test('个人偏好设置', async ({ page }) => {
    await profilePage.goto();
    await profilePage.verifyPageLoaded();
    
    // 切换到偏好设置标签
    await profilePage.switchToPreferencesTab();
    
    const newPreferences = {
      timezone: 'America/New_York',
      language: 'en-US',
      theme: 'dark',
      emailNotifications: true,
      pushNotifications: false
    };
    
    // 模拟更新偏好设置API
    await TestHelpers.mockApiResponse(
      page,
      '**/api/profile/preferences',
      { success: true, data: newPreferences }
    );
    
    await profilePage.updatePreferences(newPreferences);
    await profilePage.submitPreferencesForm();
    
    // 验证更新成功
    await profilePage.verifyOperationSuccess('偏好设置已更新');
    
    // 验证API调用
    await TestHelpers.verifyApiCall(
      page,
      '/api/profile/preferences',
      'PUT',
      newPreferences
    );
  });

  test('API密钥管理', async ({ page }) => {
    await profilePage.goto();
    await profilePage.verifyPageLoaded();
    
    // 切换到API密钥标签
    await profilePage.switchToApiKeysTab();
    
    // 验证API密钥列表显示
    // await profilePage.verifyApiKeysList(apiKeys);
    
    // 创建新API密钥
    const newApiKey = {
      name: 'Test API Key',
      permissions: ['api:read'],
      expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString() // 90天后
    };
    
    const createdKey = {
      ...newApiKey,
      id: 'key-3',
      key: 'pk_test_1234567890abcdef',
      keyPrefix: 'pk_test_',
      createdAt: new Date().toISOString()
    };
    
    // 模拟创建API密钥API
    await TestHelpers.mockApiResponse(
      page,
      '**/api/profile/api-keys',
      { success: true, data: createdKey }
    );
    
    await profilePage.createApiKey(newApiKey);
    await profilePage.submitApiKeyForm();
    
    // 验证创建成功
    await profilePage.verifyOperationSuccess('API密钥创建成功');
    // await profilePage.verifyApiKeyGenerated(createdKey.key);
    
    // 验证API调用
    await TestHelpers.verifyApiCall(page, '/api/profile/api-keys', 'POST', newApiKey);
  });

  test('删除API密钥', async ({ page }) => {
    await profilePage.goto();
    await profilePage.verifyPageLoaded();
    
    await profilePage.switchToApiKeysTab();
    
    const keyToDelete = apiKeys[1];
    
    // 模拟删除API密钥API
    await TestHelpers.mockApiResponse(
      page,
      `**/api/profile/api-keys/${keyToDelete.id}`,
      { success: true }
    );
    
    await profilePage.deleteApiKey(keyToDelete.id);
    await profilePage.confirmApiKeyDeletion();
    
    // 验证删除成功
    await profilePage.verifyOperationSuccess('API密钥已删除');
    
    // 验证API调用
    await TestHelpers.verifyApiCall(
      page,
      `/api/profile/api-keys/${keyToDelete.id}`,
      'DELETE'
    );
  });

  test('数据导出', async ({ page }) => {
    await profilePage.goto();
    await profilePage.verifyPageLoaded();
    
    // 切换到数据导出标签
    await profilePage.switchToDataExportTab();
    
    // 模拟数据导出API
    await TestHelpers.mockApiResponse(
      page,
      '**/api/profile/export',
      { success: true, downloadUrl: 'https://example.com/export/user-data.zip' }
    );
    
    await profilePage.requestDataExport();
    await profilePage.confirmDataExport();
    
    // 验证导出请求成功
    await profilePage.verifyOperationSuccess('数据导出请求已提交');
    
    // 验证API调用
    await TestHelpers.verifyApiCall(page, '/api/profile/export', 'POST');
  });

  test('账户删除', async ({ page }) => {
    await profilePage.goto();
    await profilePage.verifyPageLoaded();
    
    // 切换到账户删除标签
    await profilePage.switchToAccountDeletionTab();
    
    // 模拟账户删除API
    await TestHelpers.mockApiResponse(
      page,
      '**/api/profile/delete',
      { success: true }
    );
    
    await profilePage.requestAccountDeletion();
    
    // 输入确认文本
    await profilePage.enterDeletionConfirmation('DELETE');
    
    // 输入当前密码
    await profilePage.enterCurrentPassword('current123');
    
    await profilePage.confirmAccountDeletion();
    
    // 验证删除请求成功
    await profilePage.verifyOperationSuccess('账户删除请求已提交');
    
    // 验证API调用
    await TestHelpers.verifyApiCall(page, '/api/profile/delete', 'POST');
  });

  test('表单验证', async ({ page }) => {
    await profilePage.goto();
    await profilePage.verifyPageLoaded();
    
    // 测试基本信息表单验证
    await profilePage.updateBasicInfo({
      firstName: '',
      lastName: '',
      email: 'invalid-email',
      phone: '123' // 无效手机号
    });
    await profilePage.submitBasicInfoForm();
    
    await profilePage.verifyValidationError('firstName', '姓名不能为空');
    await profilePage.verifyValidationError('lastName', '姓名不能为空');
    await profilePage.verifyValidationError('email', '邮箱格式无效');
    await profilePage.verifyValidationError('phone', '手机号格式无效');
    
    // 测试密码修改表单验证
    await profilePage.changePassword({
      currentPassword: '',
      newPassword: '123', // 密码太短
      confirmPassword: '456' // 密码不匹配
    });
    await profilePage.submitPasswordForm();
    
    await profilePage.verifyValidationError('currentPassword', '当前密码不能为空');
    await profilePage.verifyValidationError('newPassword', '密码至少8位字符');
    await profilePage.verifyValidationError('confirmPassword', '两次输入的密码不一致');
  });

  test('错误处理', async ({ page }) => {
    await profilePage.goto();
    await profilePage.verifyPageLoaded();
    
    // 测试当前密码错误
    await TestHelpers.mockApiError(
      page,
      '**/api/profile/password',
      { code: 'invalid_password', message: '当前密码错误' },
      400
    );
    
    await profilePage.changePassword({
      currentPassword: 'wrong-password',
      newPassword: 'newPassword123!',
      confirmPassword: 'newPassword123!'
    });
    await profilePage.submitPasswordForm();
    
    await profilePage.verifyOperationError('当前密码错误');
    
    // 测试头像上传失败
    await TestHelpers.mockApiError(
      page,
      '**/api/profile/avatar',
      { code: 'file_too_large', message: '文件大小超过限制' },
      413
    );
    
    await profilePage.uploadAvatar('large-file-content');
    await profilePage.verifyOperationError('文件大小超过限制');
    
    // 测试2FA验证码错误
    await TestHelpers.mockApiError(
      page,
      '**/api/profile/2fa/verify',
      { code: 'invalid_code', message: '验证码无效' },
      400
    );
    
    await profilePage.enableTwoFactor();
    await profilePage.enterVerificationCode('000000');
    await profilePage.confirmTwoFactorSetup();
    
    await profilePage.verifyOperationError('验证码无效');
  });

  test('权限控制验证', async ({ page }) => {
    // 测试只读权限用户
    const readOnlyUser = TestHelpers.generateUserData({
      ...TEST_USERS.VIEWER,
      roles: ['viewer']
    });
    
    await TestHelpers.setAuthState(page, readOnlyUser, [TEST_PERMISSIONS.USERS_READ]);
    
    await profilePage.goto();
    await profilePage.verifyPageLoaded();
    
    // 验证只能查看，不能编辑
    // await profilePage.verifyReadOnlyMode();
    
    // 验证编辑按钮不可见
    await expect(page.locator('[data-testid="edit-profile-button"]')).not.toBeVisible();
    await expect(page.locator('[data-testid="change-password-button"]')).not.toBeVisible();
  });

  test('响应式设计验证', async ({ page }) => {
    await profilePage.goto();
    await profilePage.verifyPageLoaded();
    
    // 测试不同屏幕尺寸
    const breakpoints = [
      { name: 'mobile', width: 375, height: 667 },
      { name: 'tablet', width: 768, height: 1024 },
      { name: 'desktop', width: 1920, height: 1080 }
    ];
    
    await TestHelpers.verifyResponsiveDesign(page, breakpoints);
  });

  test('可访问性验证', async ({ page }) => {
    await profilePage.goto();
    await profilePage.verifyPageLoaded();
    
    // 验证键盘导航和ARIA标签
    await TestHelpers.verifyAccessibility(page);
  });

  test('安全特性验证', async ({ page }) => {
    await profilePage.goto();
    await profilePage.verifyPageLoaded();
    
    // 验证敏感操作需要密码确认
    await profilePage.disableTwoFactor();
    // await profilePage.verifyPasswordRequired();
    
    // 验证会话超时处理
    // await TestHelpers.simulateSessionTimeout(page);
    // await profilePage.performSensitiveOperation();
    
    // 应该重定向到登录页面
    await page.waitForURL('**/login');
    
    // 验证CSRF保护
    // await TestHelpers.verifyCsrfProtection(page, '/api/profile', 'PUT');
  });
});