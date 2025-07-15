import { formatInTimeZone } from 'date-fns-tz';
import { zhCN } from 'date-fns/locale';

// 东八区时区标识
export const CST_TIMEZONE = 'Asia/Shanghai';

/**
 * 格式化日期为东八区时间
 * @param date 日期对象或日期字符串
 * @param formatStr 格式化字符串，默认为 'yyyy-MM-dd HH:mm:ss'
 * @returns 格式化后的东八区时间字符串
 */
export function formatToCST(
  date: Date | string,
  formatStr: string = 'yyyy-MM-dd HH:mm:ss'
): string {
  console.log(date);
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const cstStr = formatInTimeZone(dateObj, CST_TIMEZONE, formatStr, { locale: zhCN });
  console.log('str:' + cstStr);
  return cstStr;
}

/**
 * 获取当前东八区时间
 * @param formatStr 格式化字符串，默认为 'yyyy-MM-dd HH:mm:ss'
 * @returns 格式化后的当前东八区时间字符串
 */
export function getCurrentCST(formatStr: string = 'yyyy-MM-dd HH:mm:ss'): string {
  return formatToCST(new Date(), formatStr);
}

/**
 * 将UTC时间转换为东八区时间
 * @param utcDate UTC时间
 * @param formatStr 格式化字符串
 * @returns 东八区时间字符串
 */
export function utcToCST(
  utcDate: Date | string,
  formatStr: string = 'yyyy-MM-dd HH:mm:ss'
): string {
  return formatToCST(utcDate, formatStr);
}

/**
 * 获取东八区的Date对象
 * @param date 可选的日期，默认为当前时间
 * @returns 调整为东八区的Date对象
 */
export function getCSTDate(date?: Date | string): Date {
  const dateObj = date ? (typeof date === 'string' ? new Date(date) : date) : new Date();
  // 获取东八区时间的毫秒数
  const cstTime = dateObj.getTime() + dateObj.getTimezoneOffset() * 60000 + 8 * 3600000;
  return new Date(cstTime);
}

/**
 * 格式化日期为中文格式的东八区时间
 * @param date 日期对象或日期字符串
 * @returns 中文格式的时间字符串
 */
export function formatToCSTChinese(date: Date | string): string {
  return formatToCST(date, 'yyyy年MM月dd日 HH:mm:ss');
}

/**
 * 获取东八区的时间戳
 * @param date 可选的日期，默认为当前时间
 * @returns 东八区时间戳
 */
export function getCSTTimestamp(date?: Date | string): number {
  return getCSTDate(date).getTime();
}
