import { test, expect } from '@playwright/test';
import { TestHelpers } from './test-helpers';
import { UserManagementPage } from './pages/user-management-page';

// 中文注释: 测试用户管理功能的端到端测试套件
test.describe('User Management E2E Tests', () => {
  let helpers: TestHelpers;
  let page: UserManagementPage;

  // 中文注释: 每个测试前的设置
  test.beforeEach(async ({ page: pwPage }) => {
    helpers = new TestHelpers(pwPage);
    page = new UserManagementPage(pwPage);
    await helpers.setupAdminAuth();
    await page.navigate();
    await page.verifyUserManagementLoaded();
  });

  // 中文注释: 测试用户列表加载
  test('should load user list', async () => {
    const userCount = await page.getUserCount();
    expect(userCount).toBeGreaterThan(0);
    await page.verifyUserTableData();
  });

  // 中文注释: 测试搜索用户
  test('should search users', async () => {
    await page.searchAndVerify('testuser');
  });

  // 中文注释: 测试添加新用户
  test('should add new user', async () => {
    const newUser = TestHelpers.generateTestUser();
    await page.clickAddUser();
    await page.fillUserForm(newUser);
    await page.submitUserForm();
    await page.verifySuccess('User added successfully');
    await page.verifyUserExists(newUser.username);
  });

  // 中文注释: 测试编辑用户
  test('should edit user', async () => {
    const userToEdit = TestHelpers.generateTestUser();
    // 假设用户已存在，或先添加
    await page.selectUser(userToEdit.username);
    await page.clickEditUser();
    await page.fillUserForm({ ...userToEdit, email: 'newemail@example.com' });
    await page.submitUserForm();
    await page.verifySuccess('User updated successfully');
    await page.verifyUserUpdated(userToEdit.username, 'newemail@example.com');
  });

  // 中文注释: 测试删除用户
  test('should delete user', async () => {
    const userToDelete = TestHelpers.generateTestUser();
    // 假设用户已存在，或先添加
    await page.selectUser(userToDelete.username);
    await page.clickDeleteUser();
    await page.confirmOperation();
    await page.verifySuccess('User deleted successfully');
    await page.verifyUserNotExists(userToDelete.username);
  });

  // 中文注释: 测试批量删除用户
  test('should bulk delete users', async () => {
    const usersToDelete = [TestHelpers.generateTestUser(), TestHelpers.generateTestUser()];
    // 假设用户已存在，或先添加
    await page.selectUsers(usersToDelete.map(u => u.username));
    await page.bulkDeleteUsers();
    await page.confirmOperation();
    await page.verifySuccess('Users deleted successfully');
    for (const user of usersToDelete) {
      await page.verifyUserNotExists(user.username);
    }
  });

  // 中文注释: 测试验证用户状态
  test('should verify user status', async () => {
    const testUser = TestHelpers.generateTestUser();
    // 假设用户已存在
    await page.verifyUserStatus(testUser.username, 'active');
    await page.toggleUserStatus(testUser.username);
    await page.verifyUserStatus(testUser.username, 'inactive');
  });

  // 中文注释: 测试验证用户角色
  test('should verify user roles', async () => {
    const testUser = TestHelpers.generateTestUser();
    const roles = ['admin', 'user'];
    // 假设用户已存在
    await page.assignRolesToUser(testUser.username, roles);
    await page.verifyUserRoles(testUser.username, roles);
  });

  // 中文注释: 测试导出用户
  test('should export users', async () => {
    await page.exportUsers();
    // 验证导出文件或下载
    await helpers.verifyDownload('users.csv');
  });

  // 中文注释: 测试导入用户
  test('should import users', async () => {
    const importFile = 'users.csv';
    await page.importUsers(importFile);
    await page.verifySuccess('Users imported successfully');
    // 验证导入的用户
  });

  // 中文注释: 测试权限验证
  test('should verify permissions', async () => {
    await helpers.setupNonAdminAuth();
    await page.navigate();
    await page.verifyAccessDenied();
    await helpers.setupAdminAuth();
    await page.navigate();
    await page.verifyUserManagementLoaded();
  });

  // 中文注释: 测试添加无效用户（错误处理）
  test('should handle invalid user addition', async () => {
    const invalidUser = { username: '', email: 'invalid' };
    await page.clickAddUser();
    await page.fillUserForm(invalidUser);
    await page.submitUserForm();
    await page.verifyError('Invalid user data');
  });

  // 添加更多测试...
});