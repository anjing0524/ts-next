import { v4 as uuidv4 } from 'uuid';

export function generateTraceId(): string {
  return uuidv4().replace(/-/g, ''); // 生成一个不带连字符的UUID作为traceId
}

export function getTraceHeaders(traceId?: string): Record<string, string> {
  const currentTraceId = traceId || generateTraceId();
  return {
    'x-b3-traceid': currentTraceId,
    'x-b3-spanid': uuidv4().replace(/-/g, '').substring(0, 16), // 生成一个16位的spanId
    'x-b3-sampled': '1', // 表示采样
  };
}

export function extractTraceId(headers: Headers): string | undefined {
  return headers.get('x-b3-traceid') || undefined;
}
