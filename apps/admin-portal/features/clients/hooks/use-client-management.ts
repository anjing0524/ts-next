import { useState, useMemo } from 'react';
import {
  useClientsQuery,
  useCreateClientMutation,
  useUpdateClientMutation,
  useDeleteClientMutation,
  useRotateClientSecretMutation,
} from '../queries';
import { toast } from '@repo/ui';
import type { OAuthClient as Client, ClientFormInput } from '../domain/client';

export const useClientManagement = () => {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [searchTerm, setSearchTerm] = useState('');
  const [appliedSearchTerm, setAppliedSearchTerm] = useState('');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isSecretModalOpen, setIsSecretModalOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [newSecret, setNewSecret] = useState<string | null>(null);

  const queryParams = useMemo(
    () => ({ page, limit, search: appliedSearchTerm }),
    [page, limit, appliedSearchTerm]
  );
  const { data, isLoading, error, isFetching } = useClientsQuery(queryParams);

  const handleApiError = (err: any, context: string) => {
    toast({ variant: 'destructive', title: `Error ${context}`, description: err.message });
  };

  const createClientMutation = useCreateClientMutation();
  const updateClientMutation = useUpdateClientMutation();
  const deleteClientMutation = useDeleteClientMutation();
  const rotateSecretMutation = useRotateClientSecretMutation();

  const openCreateModal = () => {
    setSelectedClient(null);
    setIsModalOpen(true);
  };

  const openEditModal = (client: Client) => {
    setSelectedClient(client);
    setIsModalOpen(true);
  };

  const openDeleteConfirm = (client: Client) => {
    setSelectedClient(client);
    setIsDeleteConfirmOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setIsDeleteConfirmOpen(false);
    setIsSecretModalOpen(false);
    setSelectedClient(null);
    setNewSecret(null);
  };

  const saveClient = (clientData: ClientFormInput) => {
    if (selectedClient) {
      // Update existing client
      updateClientMutation.mutate(
        { clientId: selectedClient.id, clientData },
        {
          onSuccess: () => {
            toast({ variant: 'success', title: 'Success', description: 'Client updated.' });
            closeModal();
          },
          onError: (err) => handleApiError(err, 'updating client'),
        }
      );
    } else {
      // Create new client
      createClientMutation.mutate(clientData, {
        onSuccess: (res: any) => {
          toast({ variant: 'success', title: 'Success', description: 'Client created.' });
          if (res.clientSecret) {
            setNewSecret(res.clientSecret);
            setIsSecretModalOpen(true);
          }
          closeModal();
        },
        onError: (err) => handleApiError(err, 'creating client'),
      });
    }
  };

  const deleteClient = () => {
    if (!selectedClient) return;
    deleteClientMutation
      .mutateAsync(selectedClient.id)
      .then(() => {
        toast({ variant: 'success', title: 'Success', description: 'Client deleted.' });
        closeModal();
      })
      .catch((err) => handleApiError(err, 'deleting client'));
  };

  const rotateSecret = (clientId: string) => {
    rotateSecretMutation
      .mutateAsync(clientId)
      .then((res: any) => {
        if (res.clientSecret) {
          setNewSecret(res.clientSecret);
          setIsSecretModalOpen(true);
        }
        toast({ variant: 'success', title: 'Success', description: 'Client secret rotated.' });
      })
      .catch((err) => handleApiError(err, 'rotating secret'));
  };

  return {
    clients: data?.data ?? [],
    meta: data?.meta,
    isLoading,
    isFetching,
    error,
    isModalOpen,
    isDeleteConfirmOpen,
    isSecretModalOpen,
    selectedClient,
    newSecret,
    openCreateModal,
    openEditModal,
    openDeleteConfirm,
    closeModal,
    saveClient,
    deleteClient,
    rotateSecret,
    page,
    setPage,
    limit,
    setLimit,
    searchTerm,
    setSearchTerm,
    handleSearch: () => {
      setPage(1);
      setAppliedSearchTerm(searchTerm);
    },
  };
};
