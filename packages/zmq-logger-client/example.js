const { Logger } = require('./index.js');

async function main() {
  // Create logger instance
  const logger = new Logger('tcp://localhost:5555');
  
  console.log('Logger created, connected:', logger.is_connected());
  
  // Basic logging
  logger.info('This is an info message');
  logger.error('This is an error message');
  logger.warn('This is a warning message');
  logger.debug('This is a debug message');
  logger.trace('This is a trace message');
  
  // Logging with fields (as JSON string)
  const fields = JSON.stringify({
    userId: '12345',
    action: 'login',
    success: true
  });
  
  logger.log_with_fields(
    'info',
    'User login',
    fields,
    ['auth', 'user']
  );
  
  // Logging with trace ID
  logger.log_with_trace(
    'info',
    'Processing request',
    'trace-123-456',
    JSON.stringify({
      requestId: 'req-789',
      method: 'GET'
    })
  );
  
  // Get stats
  const stats = logger.get_stats();
  console.log('Logger stats:', stats);
  
  console.log('Logging examples completed!');
}

main().catch(console.error);