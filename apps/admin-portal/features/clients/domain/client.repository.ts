import { OAuthClient, ClientFormInput } from './client';
import { PaginatedResponse } from '../../../lib/api';

export interface IClientRepository {
  getClients(params?: { offset?: number; limit?: number; search?: string }): Promise<PaginatedResponse<OAuthClient>>;
  getClientById(clientId: string): Promise<OAuthClient>;
  createClient(clientData: ClientFormInput): Promise<OAuthClient>;
  updateClient(clientId: string, clientData: Partial<ClientFormInput>): Promise<OAuthClient>;
  deleteClient(clientId: string): Promise<void>;
  rotateClientSecret(clientId: string): Promise<{ clientSecret: string }>;
}
