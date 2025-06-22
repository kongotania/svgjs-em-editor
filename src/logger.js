// logger.js
import log from 'loglevel';
import prefix from 'loglevel-plugin-prefix'

// Apply the prefix plugin
prefix.reg(log);
prefix.apply(log, {
  format(level, name, timestamp) {
    return `[${timestamp}] [${name}] ${level.toUpperCase()}:`;
  }
});

// Global log level
let globalLogLevel = log.levels.INFO;

// Module-specific log levels
const moduleLogLevels = {};

// Function to create a logger for a specific module
export function createLogger(moduleName) {
  const logger = log.getLogger(moduleName);

  // Set the effective log level for this module
  const effectiveLogLevel = moduleLogLevels[moduleName] ?? globalLogLevel;
  logger.setLevel(effectiveLogLevel);

  return logger;
}

// Function to set the global log level
export function setGlobalLogLevel(level) {
  globalLogLevel = level;
  log.setLevel(globalLogLevel);
}

// Function to set the log level for a specific module
export function setModuleLogLevel(moduleName, level) {
  moduleLogLevels[moduleName] = level;
  const logger = log.getLogger(moduleName);
  logger.setLevel(level);
}