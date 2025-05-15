import { Express } from 'express';
import { ApiError } from '../middleware/errorHandler.js';
import { apiRoutes } from './api.js';
import { userRoutes } from './user.js';
import transactionRoutes from './transaction.js';

/**
 * Configure all application routes
 * @param app Express application instance
 */
export const setupRoutes = (app: Express): void => {
  // API routes
  app.use('/api', apiRoutes);
  // User routes
  app.use('/api/user', userRoutes);
  // Transaction routes
  app.use('/api/transaction', transactionRoutes);
  // 404 handler for undefined routes
  // app.use('*', (req, res, next) => {
  //   next(new ApiError(404, `Cannot ${req.method} ${req.originalUrl}`));
  // });
};