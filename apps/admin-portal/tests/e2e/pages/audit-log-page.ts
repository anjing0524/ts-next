import { Page, Locator } from '@playwright/test';

/**
 * 审计日志页面页面对象模式
 * 封装所有与审计日志相关的操作和断言
 */
export class AuditLogPage {
  readonly page: Page;
  readonly auditLogList: Locator;
  readonly auditSearchInput: Locator;
  readonly dateFilterButton: Locator;
  readonly userFilter: Locator;
  readonly actionFilter: Locator;
  readonly statusFilter: Locator;
  readonly exportButton: Locator;
  readonly successMessage: Locator;
  readonly errorMessage: Locator;

  constructor(page: Page) {
    this.page = page;
    this.auditLogList = page.locator('[data-testid="audit-log-list"]');
    this.auditSearchInput = page.locator('[data-testid="audit-search-input"]');
    this.dateFilterButton = page.locator('[data-testid="date-filter-button"]');
    this.userFilter = page.locator('[data-testid="user-filter"]');
    this.actionFilter = page.locator('[data-testid="action-filter"]');
    this.statusFilter = page.locator('[data-testid="status-filter"]');
    this.exportButton = page.locator('[data-testid="export-logs-button"]');
    this.successMessage = page.locator('[data-testid="success-message"]');
    this.errorMessage = page.locator('[data-testid="error-message"]');
  }

  async goto() {
    await this.page.goto('/admin/audit');
    await this.page.waitForLoadState('networkidle');
  }

  async waitForLoad() {
    await this.auditLogList.waitFor({ state: 'visible', timeout: 10000 });
  }

  async searchAuditLogs(query: string) {
    await this.auditSearchInput.fill(query);
    await this.page.keyboard.press('Enter');
    await this.page.waitForLoadState('networkidle');
  }

  async getLogCount(): Promise<number> {
    const logEntries = this.page.locator('[data-testid="audit-log-entry"]');
    return await logEntries.count();
  }

  async getLogEntry(index: number): Promise<Locator> {
    return this.page.locator('[data-testid="audit-log-entry"]').nth(index);
  }

  async filterByDateRange(startDate: string, endDate: string) {
    await this.dateFilterButton.click();
    await this.page.fill('[data-testid="start-date-input"]', startDate);
    await this.page.fill('[data-testid="end-date-input"]', endDate);
    await this.page.click('[data-testid="apply-date-filter"]');
    await this.page.waitForLoadState('networkidle');
  }

  async filterByUser(username: string) {
    await this.userFilter.click();
    await this.page.click(`[data-testid="user-filter-option-${username}"]`);
    await this.page.waitForLoadState('networkidle');
  }

  async filterByAction(action: string) {
    await this.actionFilter.click();
    await this.page.click(`[data-testid="action-filter-option-${action}"]`);
    await this.page.waitForLoadState('networkidle');
  }

  async filterByStatus(status: string) {
    await this.statusFilter.click();
    await this.page.click(`[data-testid="status-filter-option-${status}"]`);
    await this.page.waitForLoadState('networkidle');
  }

  async viewLogDetails(index: number) {
    const logEntry = await this.getLogEntry(index);
    await logEntry.locator('[data-testid="view-log-button"]').click();
    await this.page.locator('[data-testid="audit-log-detail-modal"]').waitFor({ state: 'visible', timeout: 5000 });
  }

  async getLogDetails(): Promise<{
    timestamp: string;
    user: string;
    action: string;
    resource: string;
    ipAddress: string;
    userAgent: string;
    status: string;
    requestData: string;
  }> {
    return {
      timestamp: await this.page.locator('[data-testid="detail-timestamp"]').textContent() || '',
      user: await this.page.locator('[data-testid="detail-user-info"]').textContent() || '',
      action: await this.page.locator('[data-testid="detail-action"]').textContent() || '',
      resource: await this.page.locator('[data-testid="detail-resource"]').textContent() || '',
      ipAddress: await this.page.locator('[data-testid="detail-ip-address"]').textContent() || '',
      userAgent: await this.page.locator('[data-testid="detail-user-agent"]').textContent() || '',
      status: await this.page.locator('[data-testid="detail-status"]').textContent() || '',
      requestData: await this.page.locator('[data-testid="detail-request-data"]').textContent() || '',
    };
  }

  async exportLogs(format: 'csv' | 'json' | 'pdf' = 'csv') {
    await this.page.click(`[data-testid="export-format-${format}"]`);
    const downloadPromise = this.page.waitForEvent('download');
    await this.exportButton.click();
    const download = await downloadPromise;
    return download;
  }

  async clearFilters() {
    await this.page.click('[data-testid="clear-filters"]');
    await this.page.waitForLoadState('networkidle');
  }

  async getSuccessMessage(): Promise<string> {
    return await this.successMessage.textContent() || '';
  }

  async getErrorMessage(): Promise<string> {
    return await this.errorMessage.textContent() || '';
  }

  async getLogEntryData(index: number): Promise<{
    timestamp: string;
    action: string;
    user: string;
    status: string;
    ipAddress: string;
  }> {
    const logEntry = await this.getLogEntry(index);
    return {
      timestamp: await logEntry.locator('[data-testid="log-timestamp"]').textContent() || '',
      action: await logEntry.locator('[data-testid="log-action"]').textContent() || '',
      user: await logEntry.locator('[data-testid="log-user"]').textContent() || '',
      status: await logEntry.locator('[data-testid="log-status"]').textContent() || '',
      ipAddress: await logEntry.locator('[data-testid="log-ip-address"]').textContent() || '',
    };
  }

  async hasLogsWithAction(action: string): Promise<boolean> {
    const actionElements = this.page.locator(`[data-testid="log-action"]:text-is("${action}")`);
    return await actionElements.count() > 0;
  }

  async hasLogsWithUser(username: string): Promise<boolean> {
    const userElements = this.page.locator(`[data-testid="log-user"]:text-is("${username}")`);
    return await userElements.count() > 0;
  }

  async hasLogsWithStatus(status: string): Promise<boolean> {
    const statusElements = this.page.locator(`[data-testid="log-status"]:text-is("${status}")`);
    return await statusElements.count() > 0;
  }

  async getLatestLogEntry(): Promise<Locator> {
    return this.page.locator('[data-testid="audit-log-entry"]').first();
  }

  async getOldestLogEntry(): Promise<Locator> {
    return this.page.locator('[data-testid="audit-log-entry"]').last();
  }

  async sortBy(column: 'timestamp' | 'action' | 'user' | 'status') {
    await this.page.click(`[data-testid="sort-${column}"]`);
    await this.page.waitForLoadState('networkidle');
  }

  async getSortingOrder(column: 'timestamp' | 'action' | 'user' | 'status'): Promise<'asc' | 'desc'> {
    const sortButton = this.page.locator(`[data-testid="sort-${column}"]`);
    const sortIcon = sortButton.locator('[data-testid="sort-icon"]');
    const isAscending = await sortIcon.getAttribute('data-sort-order') === 'asc';
    return isAscending ? 'asc' : 'desc';
  }

  async loadMoreEntries() {
    const loadMoreButton = this.page.locator('[data-testid="load-more-button"]');
    if (await loadMoreButton.isVisible()) {
      await loadMoreButton.click();
      await this.page.waitForLoadState('networkidle');
    }
  }

  async getLogEntryByIndex(index: number): Promise<Locator> {
    return this.page.locator('[data-testid="audit-log-entry"]').nth(index);
  }

  async closeLogDetails() {
    await this.page.click('[data-testid="close-detail-modal"]');
    await this.page.locator('[data-testid="audit-log-detail-modal"]').waitFor({ state: 'hidden', timeout: 5000 });
  }
}