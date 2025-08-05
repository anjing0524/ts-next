import { AuditLog, AuditLogFilters } from './audit';
import { PaginatedResponse } from '../../../lib/api';

export interface IAuditLogRepository {
  getAuditLogs(params?: AuditLogFilters): Promise<PaginatedResponse<AuditLog>>;
}
