import { ISystemConfigRepository } from '../domain/system-config.repository';
import { SystemConfig } from '../domain/system-config';

export class SystemConfigService {
  constructor(private systemConfigRepository: ISystemConfigRepository) {}

  async getSystemConfig(): Promise<SystemConfig[]> {
    return this.systemConfigRepository.getSystemConfig();
  }

  async updateSystemConfig(configData: Partial<SystemConfig>[]): Promise<SystemConfig[]> {
    // Add business logic here if needed, e.g., validation
    return this.systemConfigRepository.updateSystemConfig(configData);
  }
}
