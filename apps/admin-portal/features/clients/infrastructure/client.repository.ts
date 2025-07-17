import { adminApi, PaginatedResponse } from '../../../lib/api';
import { IClientRepository } from '../domain/client.repository';
import { OAuthClient, ClientFormInput } from '../domain/client';

export class ClientRepository implements IClientRepository {
  async getClients(params?: {
    offset?: number;
    limit?: number;
    search?: string;
  }): Promise<PaginatedResponse<OAuthClient>> {
    return adminApi.getClients(params);
  }

  async getClientById(clientId: string): Promise<OAuthClient> {
    return adminApi.getClientById(clientId);
  }

  async createClient(clientData: ClientFormInput): Promise<OAuthClient> {
    return adminApi.createClient(clientData);
  }

  async updateClient(clientId: string, clientData: Partial<ClientFormInput>): Promise<OAuthClient> {
    return adminApi.updateClient(clientId, clientData);
  }

  async deleteClient(clientId: string): Promise<void> {
    return adminApi.deleteClient(clientId);
  }

  async rotateClientSecret(clientId: string): Promise<{ clientSecret: string }> {
    return adminApi.rotateClientSecret(clientId);
  }
}
