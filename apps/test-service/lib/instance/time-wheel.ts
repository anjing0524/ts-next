/**
 * 复用 @repo/lib 包的时间轮实现
 */
import TimeWheel, { getTimeWheelInstance } from '@repo/lib/utils/time-wheel';

export { TimeWheel as TimeWheelClass, getTimeWheelInstance };
export default getTimeWheelInstance();
