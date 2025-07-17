import { IClientRepository } from '../domain/client.repository';
import { OAuthClient, ClientFormInput } from '../domain/client';
import { PaginatedResponse } from '../../../lib/api';

export class ClientService {
  constructor(private clientRepository: IClientRepository) {}

  async getClients(params?: {
    offset?: number;
    limit?: number;
    search?: string;
  }): Promise<PaginatedResponse<OAuthClient>> {
    return this.clientRepository.getClients(params);
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
