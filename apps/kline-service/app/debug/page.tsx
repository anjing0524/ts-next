'use client';

import { useEffect } from 'react';

export default function DebugPage() {
  useEffect(() => {
    console.log('Debug page loaded');
    
    // 测试 Worker 创建
    try {
      console.log('Creating worker...');
      const worker = new Worker(new URL('../(dashboard)/kline/kline.worker.ts', import.meta.url));
      console.log('Worker created successfully:', worker);
      
      worker.onerror = (error) => {
        console.error('Worker error:', error);
      };
      
      worker.onmessage = (event) => {
        console.log('Worker message:', event.data);
      };
      
      // 测试简单消息
      worker.postMessage({ type: 'test' });
      
    } catch (error) {
      console.error('Failed to create worker:', error);
    }
  }, []);

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Debug Page</h1>
      <p>Check the browser console for debug information.</p>
    </div>
  );
}