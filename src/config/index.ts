import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Load environment variables
dotenv.config();

// Server configuration
export const SERVER_CONFIG = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigin: process.env.CORS_ORIGIN || '*',
};

// Solana configuration
export const SOLANA_CONFIG = {
  rpcUrl: process.env.RPC_URL || 'https://api.devnet.solana.com',
  privateKey: process.env.SOLANA_PRIVATE_KEY || '',
  encryptionKey: process.env.WALLET_ENCRYPTION_KEY || '',
};

// MCP server configuration
export const MCP_CONFIG = {
  path: process.env.MCP_PATH || '/mcp',
};

// API authentication configuration
export const AUTH_CONFIG = {
  apiKeys: (process.env.API_KEYS || '').split(',').map(key => key.trim()).filter(key => key.length > 0),
  headerName: process.env.API_KEY_HEADER || 'x-api-key',
  enabled: process.env.API_AUTH_ENABLED?.toLowerCase() === 'false' ? false : true,
};

// Rate limiting configuration
export const RATE_LIMIT_CONFIG = {
  // General rate limits
  standard: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10), // Default: 1 minute
    max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10), // Default: 100 requests per windowMs
  },
  // API key based limits
  apiKey: {
    enabled: process.env.API_RATE_LIMIT_ENABLED?.toLowerCase() !== 'false',
    windowMs: parseInt(process.env.API_RATE_LIMIT_WINDOW_MS || '60000', 10),
    max: parseInt(process.env.API_RATE_LIMIT_MAX || '300', 10),
  },
  // Trusted clients (can bypass rate limits)
  trustedClients: (process.env.TRUSTED_CLIENTS || '').split(',').map(client => client.trim()).filter(client => client.length > 0),
};

// Logging configuration
export const LOGGING_CONFIG = {
  level: process.env.LOG_LEVEL || 'info',
};

// Server metadata
export const SERVER_METADATA = {
  name: 'Solana MCP HTTP API',
  version: '1.0.0',
  description: 'HTTP API for Solana MCP server',
};

// Database configuration
export const DATABASE_CONFIG = {
  sqlitePath: process.env.SQLITE_PATH || './database/wallet-data.db',
};

// Validate required environment variables
export const validateConfig = (): void => {
  const requiredVars = ['RPC_URL', 'SOLANA_PRIVATE_KEY', 'API_KEYS'];
  const missing = requiredVars.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}; 