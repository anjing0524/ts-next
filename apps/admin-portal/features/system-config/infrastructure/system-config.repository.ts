import { api, SystemConfigUpdateRequest } from '../../../lib/api';
import { ISystemConfigRepository } from '../domain/system-config.repository';
import { SystemConfig } from '../domain/system-config';

export class SystemConfigRepository implements ISystemConfigRepository {
  async getSystemConfig(): Promise<SystemConfig[]> {
    return api.getSystemConfig();
  }

  async updateSystemConfig(configData: Partial<SystemConfig>[]): Promise<SystemConfig[]> {
    // 将数组转换为键值对对象
    const updateData: SystemConfigUpdateRequest = {};
    configData.forEach((config) => {
      if (config.key && config.value !== undefined) {
        updateData[config.key] = config.value;
      }
    });

    // 更新配置（返回 void）
    await api.updateSystemConfig(updateData);
    // 重新获取更新后的配置
    return api.getSystemConfig();
  }
}
