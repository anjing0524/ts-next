import { useQuery } from '@tanstack/react-query';
import { AuditService } from './application/audit.service';
import { AuditLogRepository } from './infrastructure/audit.repository';
import { AuditLog, AuditLogFilters } from './domain/audit';
import { PaginatedResponse } from '../../lib/api';

// 实例化 AuditLogRepository 和 AuditService
const auditLogRepository = new AuditLogRepository();
const auditService = new AuditService(auditLogRepository);

export const useAuditLogsQuery = (params: AuditLogFilters) => {
  return useQuery<PaginatedResponse<AuditLog>, Error>({
    queryKey: ['auditLogs', params],
    queryFn: () => auditService.getAuditLogs(params),
    placeholderData: (prev) => prev,
  });
};