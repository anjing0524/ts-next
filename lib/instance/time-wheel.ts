import logger from '@/utils/logger';
import TimeWheel from '@/utils/time-wheel';

// 定义单例时间轮实例
let singletonTimeWheel: TimeWheel | null = null;

// 获取单例时间轮实例的函数
export const getTimeWheelInstance = () => {
  if (!singletonTimeWheel) {
    logger.info('创建时间轮单例实例');
    singletonTimeWheel = new TimeWheel(100, 250);
    singletonTimeWheel.start();
  }
  return singletonTimeWheel;
};
