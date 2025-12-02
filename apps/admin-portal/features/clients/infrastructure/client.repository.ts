import { api, PaginatedResponse } from '../../../lib/api';
import { IClientRepository } from '../domain/client.repository';
import { OAuthClient, ClientFormInput } from '../domain/client';

export class ClientRepository implements IClientRepository {
  async getClients(params?: {
    offset?: number;
    limit?: number;
    search?: string;
  }): Promise<PaginatedResponse<OAuthClient>> {
    return api.getClients(params);
  }

  async getClientById(clientId: string): Promise<OAuthClient> {
    return api.getClientById(clientId);
  }

  async createClient(clientData: ClientFormInput): Promise<OAuthClient> {
    return api.createClient(clientData);
  }

  async updateClient(clientId: string, clientData: Partial<ClientFormInput>): Promise<OAuthClient> {
    return api.updateClient(clientId, clientData);
  }

  async deleteClient(clientId: string): Promise<void> {
    return api.deleteClient(clientId);
  }

  async rotateClientSecret(clientId: string): Promise<{ clientSecret: string }> {
    return api.rotateClientSecret(clientId);
  }
}
