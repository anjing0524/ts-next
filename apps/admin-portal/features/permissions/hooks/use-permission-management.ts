import { useState, useMemo } from 'react';
import { usePermissionsQuery } from '../queries';
import type { Permission } from '../domain/permission';

export const usePermissionManagement = () => {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(15);
  const [searchTerm, setSearchTerm] = useState('');
  const [appliedSearchTerm, setAppliedSearchTerm] = useState('');

  const queryParams = useMemo(
    () => ({ page, limit, search: appliedSearchTerm }),
    [page, limit, appliedSearchTerm]
  );
  const { data, isLoading, error, isFetching } = usePermissionsQuery(queryParams);

  const handleSearchSubmit = () => {
    setPage(1);
    setAppliedSearchTerm(searchTerm);
  };

  return {
    permissions: data?.data ?? [],
    meta: data?.meta,
    isLoading,
    isFetching,
    error,
    page,
    setPage,
    limit,
    setLimit,
    searchTerm,
    setSearchTerm,
    handleSearchSubmit,
  };
};
