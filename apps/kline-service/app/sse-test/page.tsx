'use client';

import { useState, useEffect } from 'react';

export default function SSETestPage() {
  const [messages, setMessages] = useState<any[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let eventSource: EventSource;

    const connectSSE = () => {
      try {
        eventSource = new EventSource('/api/sse?numLevels=10&tickSize=5');
        
        eventSource.onopen = () => {
          setIsConnected(true);
          setError(null);
          console.log('SSE连接已建立');
        };

        eventSource.onmessage = (event) => {
          try {
            const base64Data = event.data;
            const binaryString = atob(base64Data);
            const bytes = new Uint8Array(binaryString.length);
            
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            
            const newMessage = {
              id: messages.length + 1,
              timestamp: new Date().toISOString(),
              dataSize: bytes.length,
              rawData: base64Data.substring(0, 50) + '...'
            };
            
            setMessages(prev => [...prev.slice(-9), newMessage]);
          } catch (err) {
            console.error('解析数据时出错:', err);
            setError('数据解析错误');
          }
        };

        eventSource.onerror = (event) => {
          console.error('SSE错误:', event);
          setError('连接错误');
          setIsConnected(false);
          
          if (eventSource) {
            eventSource.close();
          }
        };
      } catch (err) {
        console.error('创建SSE连接时出错:', err);
        setError('无法创建连接');
      }
    };

    connectSSE();

    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [messages.length]);

  const clearMessages = () => {
    setMessages([]);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">SSE API 测试页面</h1>
      
      <div className="mb-4">
        <div className="flex items-center gap-4 mb-2">
          <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
          <span>状态: {isConnected ? '已连接' : '未连接'}</span>
          {error && <span className="text-red-500">错误: {error}</span>}
        </div>
        
        <button 
          onClick={clearMessages}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          清空消息
        </button>
      </div>

      <div className="mb-4">
        <h2 className="text-lg font-semibold mb-2">连接信息</h2>
        <div className="bg-gray-100 p-3 rounded">
          <p><strong>端点:</strong> /api/sse?numLevels=10&tickSize=5</p>
          <p><strong>数据格式:</strong> FlatBuffers (Base64编码)</p>
          <p><strong>推送频率:</strong> 每秒4次</p>
          <p><strong>接收消息数:</strong> {messages.length}</p>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-2">接收到的消息</h2>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {messages.map((msg) => (
            <div key={msg.id} className="bg-white border rounded p-3">
              <div className="flex justify-between text-sm text-gray-600 mb-1">
                <span>#{msg.id}</span>
                <span>{msg.timestamp}</span>
              </div>
              <div className="text-sm">
                <p><strong>数据大小:</strong> {msg.dataSize} bytes</p>
                <p><strong>原始数据:</strong> {msg.rawData}</p>
              </div>
            </div>
          ))}
          
          {messages.length === 0 && (
            <div className="text-gray-500 text-center py-8">
              等待接收消息...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}