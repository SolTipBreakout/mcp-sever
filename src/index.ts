import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { errorHandler } from './middleware/errorHandler.js';
import { requestLogger } from './middleware/requestLogger.js';
import { combinedRateLimit } from './middleware/rateLimit.js';
import { setupRoutes } from './routes/index.js';
import { SERVER_CONFIG, validateConfig, MCP_CONFIG, DATABASE_CONFIG } from './config/index.js';
import { logger } from './utils/logger.js';
import { initMcpServer } from './services/mcp-service.js';
import { walletService } from './services/wallet-service.js';
import fs from 'fs';
import path from 'path';

// Define app at the module level for export
const app: Express = express();

try {
  // Validate required environment variables
  validateConfig();

  // Initialize Express app
  const PORT = SERVER_CONFIG.port;
  console.log('Initializing Express app...');
  // Middleware
  app.use(helmet()); // Security headers
  console.log('Helmet middleware applied');
  app.use(cors({
    origin: SERVER_CONFIG.corsOrigin,
    credentials: true,
  })); // CORS handling
  console.log('CORS middleware applied');
  app.use(express.json()); // JSON body parser
  console.log('JSON body parser applied');
  app.use(express.urlencoded({ extended: true })); // URL-encoded body parser
  console.log('URL-encoded body parser applied');
  app.use(requestLogger); // Request logging
  console.log('Request logging middleware applied');
  app.use(combinedRateLimit); // Rate limiting

  // Root health check endpoint
  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Setup API routes
  setupRoutes(app);
  console.log('Routes set up');
  // Initialize wallet service on startup
  async function initServices() {
    try {
      console.log('Initializing services...');
      
      console.log('Initializing wallet service...');
      console.log('The wallet service is REQUIRED for:');
      console.log('- Creating and managing user wallets');
      console.log('- Storing encrypted private keys');
      console.log('- Signing transactions with user wallets');
      console.log('Without it, users will not be able to send tokens.');
      
      const initialized = await walletService.initialize();
      if (initialized) {
        console.log('Wallet service initialized successfully');
        console.log('User wallets can now be created and managed');
        
        // Logging service wallet (optional)
        const servicePublicKey = walletService.getServicePublicKey();
        if (servicePublicKey) {
          console.log(`Service wallet public key: ${servicePublicKey}`);
        }
      } else {
        console.error('CRITICAL: Failed to initialize wallet service');
        console.error('Users will NOT be able to create wallets or send tokens');
        console.error('Check database path and permissions in .env file');
        console.error('Ensure WALLET_ENCRYPTION_KEY is properly set');
      }
    } catch (error) {
      console.error('Error initializing services', { error });
    }
  }

  // Initialize MCP server first, then start Express server
  initMcpServer(app)
    .then((success) => {
      if (success) {
        logger.info('MCP server initialized successfully');
        
        // Start the server only after MCP is initialized
        const server = app.listen(PORT, () => {
          logger.info(`Server is running on port ${PORT}`);
          logger.info(`MCP endpoint available at http://localhost:${PORT}${MCP_CONFIG.path}`);
          logger.info(`Health check endpoint: http://localhost:${PORT}/health`);
          logger.info(`API status endpoint: http://localhost:${PORT}/api/status`);
          logger.info(`User endpoint: http://localhost:${PORT}/user`);
          logger.info(`Wallet endpoint: http://localhost:${PORT}/wallet`);
          logger.info(`Tool endpoint: http://localhost:${PORT}/tool`);
          
          initServices().catch(error => {
            logger.error('Failed to initialize services', { error });
          });
        });
        
        // Graceful shutdown
        process.on('SIGTERM', () => {
          logger.info('SIGTERM received. Shutting down gracefully...');
          server.close(() => {
            logger.info('Server closed');
            process.exit(0);
          });
        });
        
      } else {
        logger.error('MCP server initialization returned failure');
      }
    })
    .catch((error) => {
      logger.error('Failed to initialize MCP server', error);
    });

  // Error handler middleware (must be after routes)
  app.use(errorHandler);

} catch (error) {
  if (error instanceof Error) {
    logger.error(`Server initialization error: ${error.message}`);
  } else {
    logger.error('Unknown server initialization error');
  }
  process.exit(1);
}

// Export the app instance
export default app; 