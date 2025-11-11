/**
 * @fileoverview Simple console logger for the cache package
 * @author Your Name
 */

const logger = {
  info: (...args: any[]) => {
    console.log('[CACHE-INFO]', ...args);
  },
  error: (...args: any[]) => {
    console.error('[CACHE-ERROR]', ...args);
  },
  warn: (...args: any[]) => {
    console.warn('[CACHE-WARN]', ...args);
  },
};

export default logger;
