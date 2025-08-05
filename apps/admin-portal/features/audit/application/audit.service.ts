import { IAuditLogRepository } from '../domain/audit.repository';
import { AuditLog, AuditLogFilters } from '../domain/audit';
import { PaginatedResponse } from '../../../lib/api';

export class AuditService {
  constructor(private auditLogRepository: IAuditLogRepository) {}

  async getAuditLogs(params?: AuditLogFilters): Promise<PaginatedResponse<AuditLog>> {
    return this.auditLogRepository.getAuditLogs(params);
  }
}
