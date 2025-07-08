import { SystemConfig } from './system-config';

export interface ISystemConfigRepository {
  getSystemConfig(): Promise<SystemConfig>;
  updateSystemConfig(configData: Partial<SystemConfig>): Promise<SystemConfig>;
}
