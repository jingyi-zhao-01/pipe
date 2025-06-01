type LogLevel = 'info' | 'warn' | 'error';

interface LogMessage {
  level: LogLevel;
  message: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export const logger = {
  info: (message: string, metadata?: Record<string, unknown>) => {
    logMessage('info', message, metadata);
  },
  warn: (message: string, metadata?: Record<string, unknown>) => {
    logMessage('warn', message, metadata);
  },
  error: (message: string, metadata?: Record<string, unknown>) => {
    logMessage('error', message, metadata);
  },
};

function logMessage(level: LogLevel, message: string, metadata?: Record<string, unknown>) {
  const logEntry: LogMessage = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...(metadata && { metadata }),
  };
  console.log(JSON.stringify(logEntry));
}
