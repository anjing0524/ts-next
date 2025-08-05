import { NextRequest, NextResponse } from 'next/server';

import { getTimeWheelInstance } from '@repo/lib/node';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    console.log(searchParams);
    const timeWheel = getTimeWheelInstance();
    // 添加5个异步任务，每个任务间隔100ms
    for (let i = 0; i < 5; i++) {
      timeWheel.addTask({
        delay: 1000 + i * 1000,
        repeat: true,
        callback: () => {
          console.log(`Task ${i + 1} executed at ${new Date().toLocaleTimeString()}`);
        },
      });
    }

    return NextResponse.json({
      success: true,
      message: `Time wheel started with interval: 250ms,`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
