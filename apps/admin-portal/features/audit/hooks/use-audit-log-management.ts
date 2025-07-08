import { useState, useMemo } from 'react';
import { useAuditLogsQuery } from '../queries';
import type { AuditLog, AuditLogFilters } from '../domain/audit';

export const useAuditLogManagement = () => {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(15);
  const [filters, setFilters] = useState<AuditLogFilters>({
    search: '',
    action: '',
    status: undefined,
    startDate: undefined,
    endDate: undefined,
  });
  const [appliedFilters, setAppliedFilters] = useState(filters);

  const queryParams = useMemo(() => ({ page, limit, ...appliedFilters }), [page, limit, appliedFilters]);
  const { data, isLoading, error, isFetching } = useAuditLogsQuery(queryParams);

  const handleApplyFilters = () => {
    setPage(1);
    setAppliedFilters(filters);
  };

  return {
    logs: data?.data ?? [],
    meta: data?.meta,
    isLoading,
    isFetching,
    error,
    filters,
    setFilters,
    handleApplyFilters,
    page,
    setPage,
    limit,
    setLimit,
  };
};
