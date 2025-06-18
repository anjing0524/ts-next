import { NextResponse } from 'next/server';
import { getCurrentCST } from '@/lib/utils/timezone';

// SSE 响应所需的 HTTP 头
const sseHeaders = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  Connection: 'keep-alive',
  'Access-Control-Allow-Origin': '*',
};

// 定义 SSE 消息流
async function* sseStream() {
  try {
    while (true) {
      const data = `data: ${getCurrentCST('HH:mm:ss')}\n\n`;
      yield data;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  } catch (error) {
    console.error('SSE stream error:', error);
  }
}

// 处理 GET 请求
export async function GET() {
  const stream = new ReadableStream({
    async start(controller) {
      for await (const chunk of sseStream()) {
        const bytes = new TextEncoder().encode(chunk);
        controller.enqueue(bytes);
      }
    },
  });

  return new NextResponse(stream, {
    headers: sseHeaders,
  });
}
