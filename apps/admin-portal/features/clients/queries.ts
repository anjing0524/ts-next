import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ClientService } from './application/client.service';
import { ClientRepository } from './infrastructure/client.repository';
import type { OAuthClient, ClientFormInput } from './domain/client';
import { PaginatedResponse } from '../../lib/api';

// 实例化 ClientRepository 和 ClientService
const clientRepository = new ClientRepository();
const clientService = new ClientService(clientRepository);

export const useClientsQuery = (params: { page: number; limit: number; search?: string }) => {
  return useQuery<PaginatedResponse<OAuthClient>, Error>({
    queryKey: ['clients', params],
    queryFn: () => clientService.getClients(params),
    placeholderData: (prev) => prev,
  });
};

export const useClientQuery = (clientId: string | null) => {
  return useQuery<OAuthClient, Error>({
    queryKey: ['client', clientId],
    queryFn: () => clientService.getClientById(clientId!),
    enabled: !!clientId,
  });
};

export const useCreateClientMutation = () => {
  const queryClient = useQueryClient();
  return useMutation<OAuthClient, Error, ClientFormInput>({
    mutationFn: (clientData: ClientFormInput) => clientService.createClient(clientData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
    },
  });
};

export const useUpdateClientMutation = () => {
  const queryClient = useQueryClient();
  return useMutation<OAuthClient, Error, { clientId: string; clientData: Partial<ClientFormInput> }>({
    mutationFn: ({ clientId, clientData }: { clientId: string; clientData: Partial<ClientFormInput> }) =>
      clientService.updateClient(clientId, clientData),
    onSuccess: (_, { clientId }) => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['client', clientId] });
    },
  });
};

export const useDeleteClientMutation = () => {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (clientId: string) => clientService.deleteClient(clientId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
    },
  });
};

export const useRotateClientSecretMutation = () => {
  const queryClient = useQueryClient();
  return useMutation<{ clientSecret: string }, Error, string>({
    mutationFn: (clientId: string) => clientService.rotateClientSecret(clientId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
    },
  });
};