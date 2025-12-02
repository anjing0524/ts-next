import { api } from '../../../lib/api';
import { ISystemConfigRepository } from '../domain/system-config.repository';
import { SystemConfig } from '../domain/system-config';

export class SystemConfigRepository implements ISystemConfigRepository {
  async getSystemConfig(): Promise<SystemConfig[]> {
    return api.getSystemConfig();
  }

  async updateSystemConfig(configData: Partial<SystemConfig>[]): Promise<SystemConfig[]> {
    // 更新配置（返回 void）
    await api.updateSystemConfig(configData);
    // 重新获取更新后的配置
    return api.getSystemConfig();
  }
}
