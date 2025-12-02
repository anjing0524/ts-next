import { adminApi } from '../../../lib/api';
import { ISystemConfigRepository } from '../domain/system-config.repository';
import { SystemConfig } from '../domain/system-config';

export class SystemConfigRepository implements ISystemConfigRepository {
  async getSystemConfig(): Promise<SystemConfig[]> {
    return adminApi.getSystemConfig();
  }

  async updateSystemConfig(configData: Partial<SystemConfig>[]): Promise<SystemConfig[]> {
    // 更新配置（返回 void）
    await adminApi.updateSystemConfig(configData);
    // 重新获取更新后的配置
    return adminApi.getSystemConfig();
  }
}
