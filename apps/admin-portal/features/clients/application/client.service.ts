import { IClientRepository } from '../domain/client.repository';
import { OAuthClient, ClientFormInput } from '../domain/client';
import { PaginatedResponse } from '../../../lib/api';

export class ClientService {
  constructor(private clientRepository: IClientRepository) {}

  async getClients(params?: {
    page?: number;
    limit?: number;
    search?: string;
  }): Promise<PaginatedResponse<OAuthClient>> {
    // 转换 page 参数为 offset 参数
    const repositoryParams = params ? {
      offset: params.page ? (params.page - 1) * (params.limit || 10) : undefined,
      limit: params.limit,
      search: params.search
    } : undefined;
    
    return this.clientRepository.getClients(repositoryParams);
  }

  async getClientById(clientId: string): Promise<OAuthClient> {
    return this.clientRepository.getClientById(clientId);
  }

  async createClient(clientData: ClientFormInput): Promise<OAuthClient> {
    // Add business logic here if needed, e.g., validation, default values
    return this.clientRepository.createClient(clientData);
  }

  async updateClient(clientId: string, clientData: Partial<ClientFormInput>): Promise<OAuthClient> {
    // Add business logic here if needed
    return this.clientRepository.updateClient(clientId, clientData);
  }

  async deleteClient(clientId: string): Promise<void> {
    // Add business logic here if needed, e.g., check if client has active tokens
    return this.clientRepository.deleteClient(clientId);
  }

  async rotateClientSecret(clientId: string): Promise<{ clientSecret: string }> {
    // Add business logic here if needed, e.g., logging, security checks
    return this.clientRepository.rotateClientSecret(clientId);
  }
}
