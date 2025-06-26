/**
 * 时间轮工具
 * 复用 @repo/lib 包的时间轮实现
 */
import TimeWheelClass, { getTimeWheelInstance } from '@repo/lib/utils/time-wheel';

export const TimeWheel = TimeWheelClass;
export { getTimeWheelInstance };
export default TimeWheelClass;
