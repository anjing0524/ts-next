import { KlineWebSocketServer } from './index';
import { ClientConnectionManager } from './services/client-connection-manager';
import { KlineDataProvider } from './services/kline-data-provider';
import { RealtimeDataGenerator } from './services/realtime-data-generator';
import { WebSocketMessageHandler } from './services/websocket-message-handler';
import { SequenceManager } from './services/sequence-manager';

/**
 * =================================================================
 * Composition Root
 * =================================================================
 * This is the single place in the application where modules are
 * composed together. It creates all the long-lived service
 * instances and injects them into the classes that need them.
 */

// 1. Create all long-lived, stateless services.
const sequenceManager = new SequenceManager();
const klineDataProvider = new KlineDataProvider();
const realtimeDataGenerator = new RealtimeDataGenerator(klineDataProvider);

// 2. Create services that depend on other services.
const clientConnectionManager = new ClientConnectionManager(sequenceManager);
const messageHandler = new WebSocketMessageHandler(
  klineDataProvider,
  realtimeDataGenerator,
  clientConnectionManager,
  sequenceManager
);

// 3. Create the main application server and inject its dependencies.
const server = new KlineWebSocketServer({
  messageHandler,
  clientConnectionManager,
  realtimeDataGenerator,
});

// 4. Start the server.
server.start();

// 5. Setup graceful shutdown.
process.on('SIGINT', () => server.stop());
process.on('SIGTERM', () => server.stop());
