import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/login-page';
import { DashboardPage } from '../pages/dashboard-page';
import { TestUsers, ErrorMessages } from '../helpers/test-data';

/**
 * OAuth客户端管理测试套件
 * 验证OAuth客户端创建、配置、密钥管理等功能
 */
test.describe('OAuth Client Management Tests', () => {
  let loginPage: LoginPage;
  let dashboardPage: DashboardPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    dashboardPage = new DashboardPage(page);
    
    // 使用管理员用户登录
    await loginPage.login(TestUsers.admin);
    await dashboardPage.waitForLoad();
  });

  test.describe('Client CRUD Operations', () => {
    test('should create new OAuth client successfully', async ({ page }) => {
      await test.step('导航到客户端管理页面', async () => {
        await page.goto('/admin/clients');
        await expect(page).toHaveURL(/.*\/admin\/clients/);
        await expect(page.locator('h1')).toContainText('OAuth客户端管理');
      });

      await test.step('点击创建客户端按钮', async () => {
        await page.click('[data-testid="create-client-button"]');
        await expect(page.locator('[data-testid="client-form-modal"]')).toBeVisible();
      });

      await test.step('填写客户端基本信息', async () => {
        await page.fill('[data-testid="client-name-input"]', '测试客户端');
        await page.fill('[data-testid="client-description-input"]', '用于E2E测试的OAuth客户端');
        await page.selectOption('[data-testid="client-type-select"]', 'CONFIDENTIAL');
      });

      await test.step('配置重定向URI', async () => {
        await page.fill('[data-testid="redirect-uris-input"]', 'http://localhost:3000/callback\nhttp://localhost:3001/callback');
      });

      await test.step('配置权限范围', async () => {
        await page.click('[data-testid="scope-checkbox-openid"]');
        await page.click('[data-testid="scope-checkbox-profile"]');
        await page.click('[data-testid="scope-checkbox-user-read"]');
        await page.click('[data-testid="scope-checkbox-user-write"]');
      });

      await test.step('配置安全设置', async () => {
        await page.check('[data-testid="require-pkce"]');
        await page.check('[data-testid="require-consent"]');
        await page.fill('[data-testid="access-token-ttl-input"]', '3600');
        await page.fill('[data-testid="refresh-token-ttl-input"]', '2592000');
      });

      await test.step('提交创建客户端表单', async () => {
        await page.click('[data-testid="submit-client-button"]');
        await expect(page.locator('[data-testid="client-created-modal"]')).toBeVisible();
      });

      await test.step('记录客户端凭据', async () => {
        const clientId = await page.locator('[data-testid="generated-client-id"]').textContent();
        const clientSecret = await page.locator('[data-testid="generated-client-secret"]').textContent();
        
        expect(clientId).toBeTruthy();
        expect(clientSecret).toBeTruthy();
        expect(clientId?.length).toBeGreaterThan(10);
        expect(clientSecret?.length).toBeGreaterThan(20);
      });

      await test.step('完成创建流程', async () => {
        await page.click('[data-testid="confirm-client-creation"]');
        await expect(page.locator('[data-testid="success-message"]')).toBeVisible();
        await expect(page.locator('[data-testid="success-message"]')).toContainText('客户端创建成功');
      });

      await test.step('验证客户端列表包含新客户端', async () => {
        await expect(page.locator('text=测试客户端')).toBeVisible();
      });
    });

    test('should edit existing OAuth client', async ({ page }) => {
      await test.step('导航到客户端管理页面', async () => {
        await page.goto('/admin/clients');
        await expect(page).toHaveURL(/.*\/admin\/clients/);
      });

      await test.step('找到并点击编辑按钮', async () => {
        const editButton = page.locator('[data-testid="edit-client-button"]').first();
        await editButton.click();
        await expect(page.locator('[data-testid="client-form-modal"]')).toBeVisible();
      });

      await test.step('修改客户端信息', async () => {
        await page.fill('[data-testid="client-description-input"]', '更新后的客户端描述');
        await page.fill('[data-testid="redirect-uris-input"]', 'http://localhost:3000/callback\nhttp://localhost:3001/callback\nhttp://localhost:3002/callback');
        await page.click('[data-testid="scope-checkbox-email"]'); // 添加新权限
      });

      await test.step('提交编辑表单', async () => {
        await page.click('[data-testid="submit-client-button"]');
        await expect(page.locator('[data-testid="success-message"]')).toBeVisible();
        await expect(page.locator('[data-testid="success-message"]')).toContainText('客户端更新成功');
      });

      await test.step('验证客户端信息已更新', async () => {
        await expect(page.locator('text=更新后的客户端描述')).toBeVisible();
      });
    });

    test('should delete OAuth client with confirmation', async ({ page }) => {
      await test.step('导航到客户端管理页面', async () => {
        await page.goto('/admin/clients');
        await expect(page).toHaveURL(/.*\/admin\/clients/);
      });

      await test.step('找到并点击删除按钮', async () => {
        const deleteButton = page.locator('[data-testid="delete-client-button"]').first();
        await deleteButton.click();
        await expect(page.locator('[data-testid="delete-confirmation-modal"]')).toBeVisible();
      });

      await test.step('确认删除操作', async () => {
        await page.click('[data-testid="confirm-delete-button"]');
        await expect(page.locator('[data-testid="success-message"]')).toBeVisible();
        await expect(page.locator('[data-testid="success-message"]')).toContainText('客户端删除成功');
      });

      await test.step('验证客户端已从列表中移除', async () => {
        await expect(page.locator('text=删除的客户端名')).not.toBeVisible();
      });
    });

    test('should handle client status toggle', async ({ page }) => {
      await test.step('导航到客户端管理页面', async () => {
        await page.goto('/admin/clients');
        await expect(page).toHaveURL(/.*\/admin\/clients/);
      });

      await test.step('找到客户端状态切换开关', async () => {
        const statusToggle = page.locator('[data-testid="client-status-toggle"]').first();
        const initialStatus = await statusToggle.getAttribute('aria-checked');
        
        await test.step('切换客户端状态', async () => {
          await statusToggle.click();
          await expect(page.locator('[data-testid="success-message"]')).toBeVisible();
        });

        await test.step('验证状态已更改', async () => {
          const newStatus = await statusToggle.getAttribute('aria-checked');
          expect(newStatus).not.toBe(initialStatus);
        });
      });
    });
  });

  test.describe('Client Secret Management', () => {
    test('should regenerate client secret', async ({ page }) => {
      await test.step('导航到客户端管理页面', async () => {
        await page.goto('/admin/clients');
        await expect(page).toHaveURL(/.*\/admin\/clients/);
      });

      await test.step('找到并点击重新生成密钥按钮', async () => {
        const regenerateButton = page.locator('[data-testid="regenerate-secret-button"]').first();
        await regenerateButton.click();
        await expect(page.locator('[data-testid="regenerate-confirmation-modal"]')).toBeVisible();
      });

      await test.step('确认重新生成密钥', async () => {
        await page.click('[data-testid="confirm-regenerate-button"]');
        await expect(page.locator('[data-testid="new-secret-modal"]')).toBeVisible();
      });

      await test.step('记录新密钥', async () => {
        const newSecret = await page.locator('[data-testid="new-client-secret"]').textContent();
        expect(newSecret).toBeTruthy();
        expect(newSecret?.length).toBeGreaterThan(20);
      });

      await test.step('完成密钥更新', async () => {
        await page.click('[data-testid="confirm-secret-update"]');
        await expect(page.locator('[data-testid="success-message"]')).toBeVisible();
        await expect(page.locator('[data-testid="success-message"]')).toContainText('客户端密钥已更新');
      });
    });

    test('should view client secret securely', async ({ page }) => {
      await test.step('导航到客户端管理页面', async () => {
        await page.goto('/admin/clients');
        await expect(page).toHaveURL(/.*\/admin\/clients/);
      });

      await test.step('找到并点击查看密钥按钮', async () => {
        const viewSecretButton = page.locator('[data-testid="view-secret-button"]').first();
        await viewSecretButton.click();
        await expect(page.locator('[data-testid="view-secret-modal"]')).toBeVisible();
      });

      await test.step('验证密钥被部分遮蔽', async () => {
        const maskedSecret = await page.locator('[data-testid="masked-secret"]').textContent();
        expect(maskedSecret).toContain('••••••••');
        expect(maskedSecret?.length).toBeGreaterThan(10);
      });

      await test.step('显示完整密钥', async () => {
        await page.click('[data-testid="show-secret-button"]');
        const fullSecret = await page.locator('[data-testid="full-secret"]').textContent();
        expect(fullSecret).toBeTruthy();
        expect(fullSecret?.length).toBeGreaterThan(20);
      });
    });
  });

  test.describe('Client Configuration Validation', () => {
    test('should validate required client fields', async ({ page }) => {
      await test.step('导航到客户端管理页面', async () => {
        await page.goto('/admin/clients');
        await expect(page).toHaveURL(/.*\/admin\/clients/);
      });

      await test.step('点击创建客户端按钮', async () => {
        await page.click('[data-testid="create-client-button"]');
        await expect(page.locator('[data-testid="client-form-modal"]')).toBeVisible();
      });

      await test.step('尝试提交空表单', async () => {
        await page.click('[data-testid="submit-client-button"]');
      });

      await test.step('验证验证错误消息', async () => {
        await expect(page.locator('text=请输入客户端名称')).toBeVisible();
        await expect(page.locator('text=请输入重定向URI')).toBeVisible();
      });
    });

    test('should validate redirect URI format', async ({ page }) => {
      await test.step('导航到客户端管理页面', async () => {
        await page.goto('/admin/clients');
        await expect(page).toHaveURL(/.*\/admin\/clients/);
      });

      await test.step('点击创建客户端按钮', async () => {
        await page.click('[data-testid="create-client-button"]');
        await expect(page.locator('[data-testid="client-form-modal"]')).toBeVisible();
      });

      await test.step('输入无效的重定向URI', async () => {
        await page.fill('[data-testid="client-name-input"]', '测试客户端');
        await page.fill('[data-testid="redirect-uris-input"]', 'invalid-uri');
        await page.click('[data-testid="submit-client-button"]');
      });

      await test.step('验证URI格式错误', async () => {
        await expect(page.locator('text=请输入有效的重定向URI')).toBeVisible();
      });
    });

    test('should validate TTL values', async ({ page }) => {
      await test.step('导航到客户端管理页面', async () => {
        await page.goto('/admin/clients');
        await expect(page).toHaveURL(/.*\/admin\/clients/);
      });

      await test.step('点击创建客户端按钮', async () => {
        await page.click('[data-testid="create-client-button"]');
        await expect(page.locator('[data-testid="client-form-modal"]')).toBeVisible();
      });

      await test.step('输入无效的TTL值', async () => {
        await page.fill('[data-testid="client-name-input"]', '测试客户端');
        await page.fill('[data-testid="redirect-uris-input"]', 'http://localhost:3000/callback');
        await page.fill('[data-testid="access-token-ttl-input"]', '-1');
        await page.click('[data-testid="submit-client-button"]');
      });

      await test.step('验证TTL错误', async () => {
        await expect(page.locator('text=访问令牌有效期必须大于0')).toBeVisible();
      });
    });

    test('should prevent duplicate client names', async ({ page }) => {
      await test.step('导航到客户端管理页面', async () => {
        await page.goto('/admin/clients');
        await expect(page).toHaveURL(/.*\/admin\/clients/);
      });

      await test.step('获取现有客户端名称', async () => {
        const existingClient = page.locator('[data-testid="client-name"]').first();
        const clientName = await existingClient.textContent();
        
        if (clientName) {
          await test.step('尝试创建同名客户端', async () => {
            await page.click('[data-testid="create-client-button"]');
            await page.fill('[data-testid="client-name-input"]', clientName);
            await page.fill('[data-testid="redirect-uris-input"]', 'http://localhost:3000/callback');
            await page.click('[data-testid="submit-client-button"]');
          });

          await test.step('验证重复名称错误', async () => {
            await expect(page.locator('text=客户端名称已存在')).toBeVisible();
          });
        }
      });
    });
  });

  test.describe('Client Security Configuration', () => {
    test('should configure PKCE requirements', async ({ page }) => {
      await test.step('导航到客户端管理页面', async () => {
        await page.goto('/admin/clients');
        await expect(page).toHaveURL(/.*\/admin\/clients/);
      });

      await test.step('点击创建客户端按钮', async () => {
        await page.click('[data-testid="create-client-button"]');
        await expect(page.locator('[data-testid="client-form-modal"]')).toBeVisible();
      });

      await test.step('配置PKCE要求', async () => {
        await page.fill('[data-testid="client-name-input"]', 'PKCE测试客户端');
        await page.fill('[data-testid="redirect-uris-input"]', 'http://localhost:3000/callback');
        await page.check('[data-testid="require-pkce"]');
        await page.selectOption('[data-testid="client-type-select"]', 'PUBLIC');
      });

      await test.step('提交表单', async () => {
        await page.click('[data-testid="submit-client-button"]');
        await expect(page.locator('[data-testid="client-created-modal"]')).toBeVisible();
      });

      await test.step('完成创建', async () => {
        await page.click('[data-testid="confirm-client-creation"]');
        await expect(page.locator('[data-testid="success-message"]')).toBeVisible();
      });
    });

    test('should configure IP whitelist', async ({ page }) => {
      await test.step('导航到客户端管理页面', async () => {
        await page.goto('/admin/clients');
        await expect(page).toHaveURL(/.*\/admin\/clients/);
      });

      await test.step('点击编辑客户端按钮', async () => {
        const editButton = page.locator('[data-testid="edit-client-button"]').first();
        await editButton.click();
        await expect(page.locator('[data-testid="client-form-modal"]')).toBeVisible();
      });

      await test.step('配置IP白名单', async () => {
        await page.fill('[data-testid="ip-whitelist-input"]', '192.168.1.0/24\n10.0.0.1\n172.16.0.0/16');
        await page.click('[data-testid="submit-client-button"]');
        await expect(page.locator('[data-testid="success-message"]')).toBeVisible();
      });
    });

    test('should configure token endpoint authentication', async ({ page }) => {
      await test.step('导航到客户端管理页面', async () => {
        await page.goto('/admin/clients');
        await expect(page).toHaveURL(/.*\/admin\/clients/);
      });

      await test.step('点击编辑客户端按钮', async () => {
        const editButton = page.locator('[data-testid="edit-client-button"]').first();
        await editButton.click();
        await expect(page.locator('[data-testid="client-form-modal"]')).toBeVisible();
      });

      await test.step('配置令牌端点认证方法', async () => {
        await page.selectOption('[data-testid="token-auth-method-select"]', 'client_secret_post');
        await page.click('[data-testid="submit-client-button"]');
        await expect(page.locator('[data-testid="success-message"]')).toBeVisible();
      });
    });
  });

  test.describe('Client Testing and Validation', () => {
    test('should test client configuration', async ({ page }) => {
      await test.step('导航到客户端管理页面', async () => {
        await page.goto('/admin/clients');
        await expect(page).toHaveURL(/.*\/admin\/clients/);
      });

      await test.step('找到并点击测试按钮', async () => {
        const testButton = page.locator('[data-testid="test-client-button"]').first();
        await testButton.click();
        await expect(page.locator('[data-testid="client-test-modal"]')).toBeVisible();
      });

      await test.step('执行配置测试', async () => {
        await page.click('[data-testid="run-test-button"]');
        await expect(page.locator('[data-testid="test-results"]')).toBeVisible();
      });

      await test.step('验证测试结果', async () => {
        await expect(page.locator('[data-testid="test-status"]')).toBeVisible();
        const testStatus = await page.locator('[data-testid="test-status"]').textContent();
        expect(testStatus).toMatch(/通过|失败/);
      });
    });

    test('should validate client connectivity', async ({ page }) => {
      await test.step('导航到客户端管理页面', async () => {
        await page.goto('/admin/clients');
        await expect(page).toHaveURL(/.*\/admin\/clients/);
      });

      await test.step('找到并点击连接测试按钮', async () => {
        const connectivityButton = page.locator('[data-testid="test-connectivity-button"]').first();
        await connectivityButton.click();
        await expect(page.locator('[data-testid="connectivity-test-modal"]')).toBeVisible();
      });

      await test.step('执行连接测试', async () => {
        await page.click('[data-testid="run-connectivity-test"]');
        await expect(page.locator('[data-testid="connectivity-results"]')).toBeVisible();
      });

      await test.step('验证连接测试结果', async () => {
        await expect(page.locator('[data-testid="connectivity-status"]')).toBeVisible();
        const connectivityStatus = await page.locator('[data-testid="connectivity-status"]').textContent();
        expect(connectivityStatus).toMatch(/成功|失败/);
      });
    });
  });

  test.describe('Client Documentation and Export', () => {
    test('should generate client documentation', async ({ page }) => {
      await test.step('导航到客户端管理页面', async () => {
        await page.goto('/admin/clients');
        await expect(page).toHaveURL(/.*\/admin\/clients/);
      });

      await test.step('找到并点击文档生成按钮', async () => {
        const docButton = page.locator('[data-testid="generate-docs-button"]').first();
        await docButton.click();
        await expect(page.locator('[data-testid="client-docs-modal"]')).toBeVisible();
      });

      await test.step('验证文档内容', async () => {
        await expect(page.locator('[data-testid="docs-client-id"]')).toBeVisible();
        await expect(page.locator('[data-testid="docs-redirect-uris"]')).toBeVisible();
        await expect(page.locator('[data-testid="docs-scopes"]')).toBeVisible();
        await expect(page.locator('[data-testid="docs-auth-flows"]')).toBeVisible();
      });

      await test.step('下载文档', async () => {
        const downloadPromise = page.waitForEvent('download');
        await page.click('[data-testid="download-docs-button"]');
        const download = await downloadPromise;
        
        expect(download.suggestedFilename()).toMatch(/client-documentation.*\.pdf$/);
      });
    });

    test('should export client configuration', async ({ page }) => {
      await test.step('导航到客户端管理页面', async () => {
        await page.goto('/admin/clients');
        await expect(page).toHaveURL(/.*\/admin\/clients/);
      });

      await test.step('找到并点击导出配置按钮', async () => {
        const exportButton = page.locator('[data-testid="export-config-button"]').first();
        await exportButton.click();
        await expect(page.locator('[data-testid="export-config-modal"]')).toBeVisible();
      });

      await test.step('选择导出格式', async () => {
        await page.click('[data-testid="export-format-json"]');
        await page.click('[data-testid="include-secret"]');
        await page.click('[data-testid="confirm-export"]');
      });

      await test.step('验证导出文件', async () => {
        const downloadPromise = page.waitForEvent('download');
        const download = await downloadPromise;
        
        expect(download.suggestedFilename()).toMatch(/client-config.*\.json$/);
        const fileContent = await download.text();
        const config = JSON.parse(fileContent);
        
        expect(config.clientId).toBeTruthy();
        expect(config.clientSecret).toBeTruthy();
        expect(config.redirectUris).toBeTruthy();
        expect(config.scopes).toBeTruthy();
      });
    });
  });
});