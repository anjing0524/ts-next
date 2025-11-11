# K-Line WebSocket Service (`ws-kline-service`)

This service provides real-time and historical K-line (candlestick) data via a high-performance WebSocket server.

## Architecture

The service is built with Node.js and `uWebSockets.js` for maximum performance and low memory overhead. The architecture is designed to be simple, robust, and scalable.

- **`index.ts`**: The main server entry point. It initializes the `uWebSockets.js` app and manages the lifecycle of all services.
- **`services/client-connection-manager.ts`**: Manages all connected clients, their subscriptions, and their heartbeat status (liveness).
- **`services/websocket-message-handler.ts`**: The core logic unit. It processes incoming client messages (`subscribe`, `unsubscribe`, `ping`) and orchestrates the appropriate response.
- **`services/kline-data-provider.ts`**: A service responsible for generating K-line data and serializing it into the highly efficient FlatBuffers format.
- **`services/realtime-data-generator.ts`**: Manages data generation for active topics. It creates dedicated generation jobs for each subscribed channel (e.g., `kline_BTC/USDT_1m`) and automatically stops them when no clients are subscribed, saving server resources.
- **`services/sequence-manager.ts`**: Assigns sequence numbers to data packets to allow clients to track data integrity.

## Features

- **High-Performance:** Built on `uWebSockets.js`, one of the fastest WebSocket libraries available.
- **Efficient Data Format:** Uses FlatBuffers for data serialization, minimizing CPU usage and network bandwidth.
- **Dynamic Subscriptions:** Clients can subscribe and unsubscribe to specific data channels on the fly.
- **Real-time Push:** Pushes data updates to clients as soon as they are available.
- **Resource-Efficient:** Automatically starts and stops data generation based on client demand.
- **Connection Liveness:** Implements a Ping/Pong heartbeat mechanism to detect and clean up stale connections.

## WebSocket API

The server exposes a simple, JSON-based API for communication.

**Connect:** `ws://<host>:<port>` (e.g., `ws://localhost:3004`)

### Actions

1.  **Subscribe**

    Subscribes the client to a specific K-line data channel. Upon successful subscription, the client will receive an initial snapshot of historical data, followed by real-time updates.

    **Request:**
    ```json
    {
      "action": "subscribe",
      "channel": "kline",
      "params": {
        "symbol": "BTC/USDT",
        "interval": "1m"
      }
    }
    ```

    **Response (Success):**
    ```json
    {
      "event": "subscribed",
      "channel": "kline_BTC/USDT_1m",
      "status": "订阅成功"
    }
    ```
    *(Followed by a binary data snapshot)*

2.  **Unsubscribe**

    Unsubscribes the client from a channel.

    **Request:**
    ```json
    {
      "action": "unsubscribe",
      "channel": "kline",
      "params": {
        "symbol": "BTC/USDT",
        "interval": "1m"
      }
    }
    ```

    **Response:**
    ```json
    {
      "event": "unsubscribed",
      "channel": "kline_BTC/USDT_1m",
      "status": "取消订阅成功"
    }
    ```

3.  **Ping (Heartbeat)**

    Used to keep the connection alive. The server will respond with a `pong`.

    **Request:**
    ```json
    {
      "action": "ping"
    }
    ```

    **Response:**
    ```json
    {
      "event": "pong",
      "ts": 1678886400000
    }
    ```

### Data Format

- **Control Messages:** Sent as JSON strings (as shown above).
- **K-Line Data:** Sent as binary `ArrayBuffer` payloads encoded with FlatBuffers for maximum efficiency.

## How to Run

From the root of the monorepo, run:

```bash
# To run the service directly with ts-node
pnpm --filter ws-kline-service dev

# To build the service
pnpm --filter ws-kline-service build
```
