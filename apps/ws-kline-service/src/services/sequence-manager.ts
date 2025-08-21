/**
 * 序列号记录信息
 */
interface SequenceRecord {
  sequence: number;
  timestamp: number;
  dataSize: number;
  checksum?: string;
}

/**
 * 序列号管理器
 * 负责管理数据版本控制和客户端同步状态
 */
export class SequenceManager {
  private currentSequence = 0;
  private clientSequences: Map<string, number> = new Map(); // 客户端ID -> 最后同步的序列号
  private sequenceHistory: Map<number, SequenceRecord> = new Map(); // 序列号 -> 记录信息
  private readonly maxHistorySize = 10000; // 最大历史记录数

  /**
   * 获取下一个序列号
   * @returns 新的序列号
   */
  getNextSequence(): number {
    return ++this.currentSequence;
  }

  /**
   * 获取当前序列号
   * @returns 当前序列号
   */
  getCurrentSequence(): number {
    return this.currentSequence;
  }

  /**
   * 记录序列号信息
   * @param sequence 序列号
   * @param dataSize 数据大小
   * @param checksum 数据校验和（可选）
   */
  recordSequence(sequence: number, dataSize: number, checksum?: string): void {
    const record: SequenceRecord = {
      sequence,
      timestamp: Date.now(),
      dataSize,
      checksum
    };

    this.sequenceHistory.set(sequence, record);

    // 清理过期历史记录
    this.cleanupHistory();
  }

  /**
   * 更新客户端同步状态
   * @param clientId 客户端ID
   * @param sequence 已同步的序列号
   */
  updateClientSequence(clientId: string, sequence: number): void {
    this.clientSequences.set(clientId, sequence);
  }

  /**
   * 获取客户端最后同步的序列号
   * @param clientId 客户端ID
   * @returns 最后同步的序列号，如果客户端不存在则返回0
   */
  getClientSequence(clientId: string): number {
    return this.clientSequences.get(clientId) || 0;
  }

  /**
   * 获取客户端缺失的序列号范围
   * @param clientId 客户端ID
   * @returns 缺失的序列号数组
   */
  getMissingSequences(clientId: string): number[] {
    const clientSequence = this.getClientSequence(clientId);
    const missing: number[] = [];

    // 查找从客户端最后序列号到当前序列号之间的缺失
    for (let seq = clientSequence + 1; seq <= this.currentSequence; seq++) {
      // 如果序列号不在历史记录中，说明是缺失的
      if (!this.sequenceHistory.has(seq)) {
        missing.push(seq);
      }
    }

    return missing;
  }

  /**
   * 检查序列号是否存在
   * @param sequence 序列号
   * @returns 是否存在
   */
  hasSequence(sequence: number): boolean {
    return this.sequenceHistory.has(sequence);
  }

  /**
   * 获取序列号记录信息
   * @param sequence 序列号
   * @returns 序列号记录或null
   */
  getSequenceRecord(sequence: number): SequenceRecord | null {
    return this.sequenceHistory.get(sequence) || null;
  }

  /**
   * 获取指定范围内的序列号
   * @param fromSequence 起始序列号
   * @param toSequence 结束序列号
   * @returns 序列号数组
   */
  getSequenceRange(fromSequence: number, toSequence: number): number[] {
    const sequences: number[] = [];
    
    for (let seq = fromSequence; seq <= toSequence; seq++) {
      if (this.sequenceHistory.has(seq)) {
        sequences.push(seq);
      }
    }

    return sequences;
  }

  /**
   * 移除客户端记录
   * @param clientId 客户端ID
   */
  removeClient(clientId: string): void {
    this.clientSequences.delete(clientId);
  }

  /**
   * 获取所有客户端状态
   * @returns 客户端状态映射
   */
  getAllClientStates(): Map<string, number> {
    return new Map(this.clientSequences);
  }

  /**
   * 获取统计信息
   * @returns 统计信息
   */
  getStats(): {
    currentSequence: number;
    totalClients: number;
    historySize: number;
    oldestSequence: number;
    newestSequence: number;
  } {
    const sequences = Array.from(this.sequenceHistory.keys());
    
    return {
      currentSequence: this.currentSequence,
      totalClients: this.clientSequences.size,
      historySize: this.sequenceHistory.size,
      oldestSequence: sequences.length > 0 ? Math.min(...sequences) : 0,
      newestSequence: sequences.length > 0 ? Math.max(...sequences) : 0
    };
  }

  /**
   * 清理过期的历史记录
   */
  private cleanupHistory(): void {
    if (this.sequenceHistory.size <= this.maxHistorySize) {
      return;
    }

    // 获取所有序列号并排序
    const sequences = Array.from(this.sequenceHistory.keys()).sort((a, b) => a - b);
    
    // 删除最旧的记录，保留最新的maxHistorySize条
    const toDelete = sequences.slice(0, sequences.length - this.maxHistorySize);
    
    for (const seq of toDelete) {
      this.sequenceHistory.delete(seq);
    }
  }

  /**
   * 计算数据校验和（简单实现）
   * @param data 数据
   * @returns 校验和
   */
  static calculateChecksum(data: Uint8Array): string {
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data[i]!;
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 转换为32位整数
    }
    return hash.toString(16);
  }

  /**
   * 验证数据完整性
   * @param sequence 序列号
   * @param data 数据
   * @returns 是否验证通过
   */
  verifyData(sequence: number, data: Uint8Array): boolean {
    const record = this.getSequenceRecord(sequence);
    if (!record) {
      return false;
    }

    // 检查数据大小
    if (record.dataSize !== data.length) {
      return false;
    }

    // 检查校验和（如果有）
    if (record.checksum) {
      const checksum = SequenceManager.calculateChecksum(data);
      return checksum === record.checksum;
    }

    return true;
  }

  /**
   * 重置序列号管理器
   */
  reset(): void {
    this.currentSequence = 0;
    this.clientSequences.clear();
    this.sequenceHistory.clear();
  }

  /**
   * 获取客户端延迟信息
   * @param clientId 客户端ID
   * @returns 延迟信息
   */
  getClientLag(clientId: string): {
    sequenceLag: number;
    timeLag: number;
    isHealthy: boolean;
  } {
    const clientSequence = this.getClientSequence(clientId);
    const sequenceLag = this.currentSequence - clientSequence;
    
    let timeLag = 0;
    const clientRecord = this.getSequenceRecord(clientSequence);
    if (clientRecord) {
      timeLag = Date.now() - clientRecord.timestamp;
    }

    // 判断客户端是否健康（延迟小于10个序列号或5秒）
    const isHealthy = sequenceLag <= 10 && timeLag <= 5000;

    return {
      sequenceLag,
      timeLag,
      isHealthy
    };
  }
}