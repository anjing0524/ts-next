import { adminApi } from '../../../lib/api';
import { ISystemConfigRepository } from '../domain/system-config.repository';
import { SystemConfig } from '../domain/system-config';

export class SystemConfigRepository implements ISystemConfigRepository {
  async getSystemConfig(): Promise<SystemConfig> {
    return adminApi.getSystemConfig();
  }

  async updateSystemConfig(configData: Partial<SystemConfig>): Promise<SystemConfig> {
    return adminApi.updateSystemConfig(configData);
  }
}
