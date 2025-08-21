'use client';
// @/apps/kline-service/app/(dashboard)/kline/socket.worker.ts
// This worker is responsible for WebSocket communication.
// It acts as a simple proxy, forwarding binary data to the rendering worker.

// --- 状态管理 ---
let ws: WebSocket | null = null;
let renderingPort: MessagePort | null = null; // Port for communication with rendering.worker

// --- 连接配置 ---
let wsUrl = '';
let currentSubscription: { symbol: string; interval: string } | null = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_DELAY = 3000; // ms

/**
 * Main message handler, processing commands from main.tsx
 */
self.onmessage = (event: MessageEvent) => {
  const { type, payload } = event.data;
  switch (type) {
    case 'init':
      // Receive MessageChannel port from main.tsx for communication with rendering.worker
      renderingPort = payload.port;
      console.log('[SocketWorker] Initialized successfully, received rendering worker port');
      break;
    case 'connect':
      // Start connection
      wsUrl = payload.url;
      currentSubscription = payload.subscription;
      connect();
      break;
    case 'disconnect':
      // Disconnect
      disconnect();
      break;
  }
};

/**
 * Establishes a WebSocket connection
 */
function connect() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    console.log('[SocketWorker] WebSocket already connected, no action needed');
    return;
  }

  console.log(`[SocketWorker] Connecting to ${wsUrl}...`);
  postStatusToMain('connecting');

  ws = new WebSocket(wsUrl);
  ws.binaryType = 'arraybuffer';

  ws.onopen = () => {
    console.log('[SocketWorker] WebSocket connection successful');
    reconnectAttempts = 0;
    postStatusToMain('connected');
    // Send subscription request
    if (currentSubscription) {
        const subscribeRequest = {
            action: 'subscribe',
            channel: 'kline',
            params: currentSubscription,
        };
        ws?.send(JSON.stringify(subscribeRequest));
        console.log('[SocketWorker] Subscription request sent:', subscribeRequest);
    }
  };

  ws.onmessage = handleWebSocketMessage;

  ws.onclose = () => {
    console.log('[SocketWorker] WebSocket connection closed');
    ws = null;
    postStatusToMain('disconnected');
    // Automatic reconnection
    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      reconnectAttempts++;
      console.log(`[SocketWorker] Attempting to reconnect... (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
      setTimeout(connect, RECONNECT_DELAY * reconnectAttempts);
    }
  };

  ws.onerror = (error) => {
    console.error('[SocketWorker] WebSocket error:', error);
    postStatusToMain('error');
    ws?.close();
  };
}

/**
 * Disconnects the WebSocket connection
 */
function disconnect() {
    if (ws) {
        reconnectAttempts = MAX_RECONNECT_ATTEMPTS; // Prevent automatic reconnection
        ws.close(1000, 'User disconnected');
        ws = null;
    }
}

/**
 * Handles incoming WebSocket messages
 */
async function handleWebSocketMessage(event: MessageEvent) {
  if (typeof event.data === 'string') {
    try {
      const message = JSON.parse(event.data);
      console.log('[SocketWorker] Received JSON message:', message);
      // Handle control messages if necessary
    } catch (error) {
      console.error('[SocketWorker] Error parsing JSON message:', error);
    }
    return;
  }

  if (event.data instanceof ArrayBuffer) {
    const dataBuffer = event.data;
    console.log(`[SocketWorker] Received data buffer of size: ${dataBuffer.byteLength}. Forwarding to rendering worker.`);
    renderingPort?.postMessage({ type: 'process_data', payload: dataBuffer }, [dataBuffer]);
  }
}

/**
 * Sends status updates to the main thread
 */
function postStatusToMain(status: string) {
    self.postMessage({ type: 'status', payload: status });
}

// Export to satisfy ES module requirements
export default {};