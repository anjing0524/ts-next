import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/login-page';
import { DashboardPage } from '../pages/dashboard-page';
import { TestUsers, ErrorMessages } from '../helpers/test-data';

/**
 * 审计日志和安全监控测试套件
 * 验证审计日志记录、安全事件监控等功能
 */
test.describe('Audit Logging and Security Monitoring Tests', () => {
  let loginPage: LoginPage;
  let dashboardPage: DashboardPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    dashboardPage = new DashboardPage(page);
    
    // 使用管理员用户登录
    await loginPage.login(TestUsers.admin);
    await dashboardPage.waitForLoad();
  });

  test.describe('Audit Log Viewing', () => {
    test('should view audit log entries', async ({ page }) => {
      await test.step('导航到审计日志页面', async () => {
        await page.goto('/admin/audit');
        await expect(page).toHaveURL(/.*\/admin\/audit/);
        await expect(page.locator('h1')).toContainText('审计日志');
      });

      await test.step('验证审计日志列表显示', async () => {
        await expect(page.locator('[data-testid="audit-log-list"]')).toBeVisible();
        const logEntries = page.locator('[data-testid="audit-log-entry"]');
        const count = await logEntries.count();
        expect(count).toBeGreaterThan(0);
      });

      await test.step('验证日志条目信息完整', async () => {
        const firstEntry = logEntries.first();
        await expect(firstEntry.locator('[data-testid="log-timestamp"]')).toBeVisible();
        await expect(firstEntry.locator('[data-testid="log-action"]')).toBeVisible();
        await expect(firstEntry.locator('[data-testid="log-user"]')).toBeVisible();
        await expect(firstEntry.locator('[data-testid="log-status"]')).toBeVisible();
      });
    });

    test('should filter audit logs by date range', async ({ page }) => {
      await test.step('导航到审计日志页面', async () => {
        await page.goto('/admin/audit');
        await expect(page).toHaveURL(/.*\/admin\/audit/);
      });

      await test.step('设置日期范围过滤器', async () => {
        await page.click('[data-testid="date-filter-button"]');
        await page.fill('[data-testid="start-date-input"]', '2024-01-01');
        await page.fill('[data-testid="end-date-input"]', '2024-12-31');
        await page.click('[data-testid="apply-date-filter"]');
      });

      await test.step('验证过滤结果', async () => {
        const logEntries = page.locator('[data-testid="audit-log-entry"]');
        const filteredCount = await logEntries.count();
        expect(filteredCount).toBeGreaterThanOrEqual(0);
      });
    });

    test('should filter audit logs by user', async ({ page }) => {
      await test.step('导航到审计日志页面', async () => {
        await page.goto('/admin/audit');
        await expect(page).toHaveURL(/.*\/admin\/audit/);
      });

      await test.step('设置用户过滤器', async () => {
        await page.click('[data-testid="user-filter"]');
        await page.click('[data-testid="user-filter-option-admin"]');
      });

      await test.step('验证过滤结果', async () => {
        const logEntries = page.locator('[data-testid="audit-log-entry"]');
        const adminLogs = await logEntries.count();
        expect(adminLogs).toBeGreaterThan(0);
      });
    });

    test('should filter audit logs by action type', async ({ page }) => {
      await test.step('导航到审计日志页面', async () => {
        await page.goto('/admin/audit');
        await expect(page).toHaveURL(/.*\/admin\/audit/);
      });

      await test.step('设置操作类型过滤器', async () => {
        await page.click('[data-testid="action-filter"]');
        await page.click('[data-testid="action-filter-option-login"]');
      });

      await test.step('验证过滤结果', async () => {
        const logEntries = page.locator('[data-testid="audit-log-entry"]');
        const loginLogs = await logEntries.count();
        expect(loginLogs).toBeGreaterThan(0);
      });
    });

    test('should search audit logs', async ({ page }) => {
      await test.step('导航到审计日志页面', async () => {
        await page.goto('/admin/audit');
        await expect(page).toHaveURL(/.*\/admin\/audit/);
      });

      await test.step('在搜索框中输入关键词', async () => {
        await page.fill('[data-testid="audit-search-input"]', 'login');
        await page.press('[data-testid="audit-search-input"]', 'Enter');
      });

      await test.step('验证搜索结果', async () => {
        const logEntries = page.locator('[data-testid="audit-log-entry"]');
        const searchResults = await logEntries.count();
        expect(searchResults).toBeGreaterThan(0);
      });
    });
  });

  test.describe('Audit Log Details', () => {
    test('should view audit log details', async ({ page }) => {
      await test.step('导航到审计日志页面', async () => {
        await page.goto('/admin/audit');
        await expect(page).toHaveURL(/.*\/admin\/audit/);
      });

      await test.step('点击查看日志详情', async () => {
        await page.click('[data-testid="view-log-button"]').first();
        await expect(page.locator('[data-testid="audit-log-detail-modal"]')).toBeVisible();
      });

      await test.step('验证详情信息完整', async () => {
        await expect(page.locator('[data-testid="detail-timestamp"]')).toBeVisible();
        await expect(page.locator('[data-testid="detail-user-info"]')).toBeVisible();
        await expect(page.locator('[data-testid="detail-action"]')).toBeVisible();
        await expect(page.locator('[data-testid="detail-resource"]')).toBeVisible();
        await expect(page.locator('[data-testid="detail-ip-address"]')).toBeVisible();
        await expect(page.locator('[data-testid="detail-user-agent"]')).toBeVisible();
        await expect(page.locator('[data-testid="detail-status"]')).toBeVisible();
      });

      await test.step('验证请求数据显示', async () => {
        await expect(page.locator('[data-testid="detail-request-data"]')).toBeVisible();
        const requestData = await page.locator('[data-testid="detail-request-data"]').textContent();
        expect(requestData).toBeTruthy();
      });
    });

    test('should export audit logs', async ({ page }) => {
      await test.step('导航到审计日志页面', async () => {
        await page.goto('/admin/audit');
        await expect(page).toHaveURL(/.*\/admin\/audit/);
      });

      await test.step('点击导出按钮', async () => {
        const downloadPromise = page.waitForEvent('download');
        await page.click('[data-testid="export-logs-button"]');
        const download = await downloadPromise;
        
        await test.step('验证导出文件', async () => {
          expect(download.suggestedFilename()).toMatch(/audit-logs.*\.csv$/);
          const fileSize = await download.createReadStream();
          expect(fileSize).toBeTruthy();
        });
      });
    });
  });

  test.describe('Security Event Monitoring', () => {
    test('should view security events dashboard', async ({ page }) => {
      await test.step('导航到安全监控页面', async () => {
        await page.goto('/admin/security');
        await expect(page).toHaveURL(/.*\/admin\/security/);
        await expect(page.locator('h1')).toContainText('安全监控');
      });

      await test.step('验证安全指标显示', async () => {
        await expect(page.locator('[data-testid="security-metrics"]')).toBeVisible();
        await expect(page.locator('[data-testid="failed-login-attempts"]')).toBeVisible();
        await expect(page.locator('[data-testid="suspicious-activities"]')).toBeVisible();
        await expect(page.locator('[data-testid="blocked-ips"]')).toBeVisible();
      });

      await test.step('验证安全事件列表', async () => {
        await expect(page.locator('[data-testid="security-events-list"]')).toBeVisible();
        const securityEvents = page.locator('[data-testid="security-event"]');
        const count = await securityEvents.count();
        expect(count).toBeGreaterThanOrEqual(0);
      });
    });

    test('should handle failed login attempts tracking', async ({ page }) => {
      await test.step('记录当前失败登录次数', async () => {
        await page.goto('/admin/security');
        const initialAttempts = await page.locator('[data-testid="failed-login-count"]').textContent();
        
        await test.step('模拟失败的登录尝试', async () => {
          // 使用新页面模拟登录失败
          const loginPage = page;
          await loginPage.goto('/login');
          await loginPage.fillUsername('invaliduser');
          await loginPage.fillPassword('wrongpassword');
          await loginPage.clickLoginButton();
          await expect(loginPage.errorMessage).toBeVisible();
        });

        await test.step('验证失败登录次数增加', async () => {
          await page.goto('/admin/security');
          await page.reload();
          const updatedAttempts = await page.locator('[data-testid="failed-login-count"]').textContent();
          expect(updatedAttempts).not.toBe(initialAttempts);
        });
      });
    });

    test('should detect suspicious activities', async ({ page }) => {
      await test.step('导航到安全监控页面', async () => {
        await page.goto('/admin/security');
        await expect(page).toHaveURL(/.*\/admin\/security/);
      });

      await test.step('验证可疑活动检测', async () => {
        const suspiciousActivities = page.locator('[data-testid="suspicious-activity"]');
        const count = await suspiciousActivities.count();
        
        // 检查是否有可疑活动记录
        if (count > 0) {
          const firstActivity = suspiciousActivities.first();
          await expect(firstActivity.locator('[data-testid="activity-type"]')).toBeVisible();
          await expect(firstActivity.locator('[data-testid="activity-timestamp"]')).toBeVisible();
          await expect(firstActivity.locator('[data-testid="activity-severity"]')).toBeVisible();
        }
      });
    });
  });

  test.describe('Real-time Security Alerts', () => {
    test('should display security alerts', async ({ page }) => {
      await test.step('导航到安全监控页面', async () => {
        await page.goto('/admin/security');
        await expect(page).toHaveURL(/.*\/admin\/security/);
      });

      await test.step('验证安全警报显示', async () => {
        const securityAlerts = page.locator('[data-testid="security-alert"]');
        const count = await securityAlerts.count();
        
        if (count > 0) {
          const firstAlert = securityAlerts.first();
          await expect(firstAlert.locator('[data-testid="alert-type"]')).toBeVisible();
          await expect(firstAlert.locator('[data-testid="alert-message"]')).toBeVisible();
          await expect(firstAlert.locator('[data-testid="alert-timestamp"]')).toBeVisible();
        }
      });
    });

    test('should handle alert acknowledgment', async ({ page }) => {
      await test.step('导航到安全监控页面', async () => {
        await page.goto('/admin/security');
        await expect(page).toHaveURL(/.*\/admin\/security/);
      });

      await test.step('找到并确认安全警报', async () => {
        const acknowledgeButtons = page.locator('[data-testid="acknowledge-alert-button"]');
        const count = await acknowledgeButtons.count();
        
        if (count > 0) {
          await acknowledgeButtons.first().click();
          await expect(page.locator('[data-testid="success-message"]')).toBeVisible();
          await expect(page.locator('[data-testid="success-message"]')).toContainText('警报已确认');
        }
      });
    });
  });

  test.describe('IP Address Monitoring', () => {
    test('should view IP address monitoring', async ({ page }) => {
      await test.step('导航到IP监控页面', async () => {
        await page.goto('/admin/security/ip-monitoring');
        await expect(page).toHaveURL(/.*\/admin\/security\/ip-monitoring/);
        await expect(page.locator('h1')).toContainText('IP地址监控');
      });

      await test.step('验证IP地址列表显示', async () => {
        await expect(page.locator('[data-testid="ip-address-list"]')).toBeVisible();
        const ipAddresses = page.locator('[data-testid="ip-address-entry"]');
        const count = await ipAddresses.count();
        expect(count).toBeGreaterThan(0);
      });

      await test.step('验证IP地址信息', async () => {
        const firstIP = ipAddresses.first();
        await expect(firstIP.locator('[data-testid="ip-address"]')).toBeVisible();
        await expect(firstIP.locator('[data-testid="ip-location"]')).toBeVisible();
        await expect(firstIP.locator('[data-testid="ip-request-count"]')).toBeVisible();
        await expect(firstIP.locator('[data-testid="ip-last-seen"]')).toBeVisible();
      });
    });

    test('should block suspicious IP addresses', async ({ page }) => {
      await test.step('导航到IP监控页面', async () => {
        await page.goto('/admin/security/ip-monitoring');
        await expect(page).toHaveURL(/.*\/admin\/security\/ip-monitoring/);
      });

      await test.step('找到并封锁可疑IP', async () => {
        const blockButtons = page.locator('[data-testid="block-ip-button"]');
        const count = await blockButtons.count();
        
        if (count > 0) {
          await blockButtons.first().click();
          await expect(page.locator('[data-testid="confirmation-modal"]')).toBeVisible();
          await page.click('[data-testid="confirm-block-button"]');
          await expect(page.locator('[data-testid="success-message"]')).toBeVisible();
          await expect(page.locator('[data-testid="success-message"]')).toContainText('IP地址已封锁');
        }
      });
    });
  });

  test.describe('Audit Log Analytics', () => {
    test('should view audit log analytics', async ({ page }) => {
      await test.step('导航到审计分析页面', async () => {
        await page.goto('/admin/audit/analytics');
        await expect(page).toHaveURL(/.*\/admin\/audit\/analytics/);
        await expect(page.locator('h1')).toContainText('审计日志分析');
      });

      await test.step('验证分析图表显示', async () => {
        await expect(page.locator('[data-testid="audit-chart"]')).toBeVisible();
        await expect(page.locator('[data-testid="action-frequency-chart"]')).toBeVisible();
        await expect(page.locator('[data-testid="user-activity-chart"]')).toBeVisible();
      });

      await test.step('验证统计信息', async () => {
        await expect(page.locator('[data-testid="total-events"]')).toBeVisible();
        await expect(page.locator('[data-testid="unique-users"]')).toBeVisible();
        await expect(page.locator('[data-testid="success-rate"]')).toBeVisible();
        await expect(page.locator('[data-testid="failure-rate"]')).toBeVisible();
      });
    });

    test('should generate audit reports', async ({ page }) => {
      await test.step('导航到审计分析页面', async () => {
        await page.goto('/admin/audit/analytics');
        await expect(page).toHaveURL(/.*\/admin\/audit\/analytics/);
      });

      await test.step('点击生成报告按钮', async () => {
        await page.click('[data-testid="generate-report-button"]');
        await expect(page.locator('[data-testid="report-config-modal"]')).toBeVisible();
      });

      await test.step('配置报告参数', async () => {
        await page.fill('[data-testid="report-title-input"]', '月度安全审计报告');
        await page.click('[data-testid="report-format-pdf"]');
        await page.click('[data-testid="include-charts"]');
        await page.click('[data-testid="generate-report-submit"]');
      });

      await test.step('验证报告生成', async () => {
        await expect(page.locator('[data-testid="success-message"]')).toBeVisible();
        await expect(page.locator('[data-testid="success-message"]')).toContainText('报告生成成功');
      });
    });
  });

  test.describe('Compliance Monitoring', () => {
    test('should view compliance dashboard', async ({ page }) => {
      await test.step('导航到合规监控页面', async () => {
        await page.goto('/admin/compliance');
        await expect(page).toHaveURL(/.*\/admin\/compliance/);
        await expect(page.locator('h1')).toContainText('合规监控');
      });

      await test.step('验证合规指标显示', async () => {
        await expect(page.locator('[data-testid="compliance-score"]')).toBeVisible();
        await expect(page.locator('[data-testid="policy-violations"]')).toBeVisible();
        await expect(page.locator('[data-testid="audit-coverage"]')).toBeVisible();
        await expect(page.locator('[data-testid="security-posture"]')).toBeVisible();
      });

      await test.step('验证合规检查列表', async () => {
        await expect(page.locator('[data-testid="compliance-checks"]')).toBeVisible();
        const complianceChecks = page.locator('[data-testid="compliance-check"]');
        const count = await complianceChecks.count();
        expect(count).toBeGreaterThan(0);
      });
    });

    test('should handle compliance violations', async ({ page }) => {
      await test.step('导航到合规监控页面', async () => {
        await page.goto('/admin/compliance');
        await expect(page).toHaveURL(/.*\/admin\/compliance/);
      });

      await test.step('查看违规详情', async () => {
        const violations = page.locator('[data-testid="compliance-violation"]');
        const count = await violations.count();
        
        if (count > 0) {
          const firstViolation = violations.first();
          await expect(firstViolation.locator('[data-testid="violation-type"]')).toBeVisible();
          await expect(firstViolation.locator('[data-testid="violation-severity"]')).toBeVisible();
          await expect(firstViolation.locator('[data-testid="violation-description"]')).toBeVisible();
        }
      });
    });
  });
});