import { Request, Response, NextFunction } from 'express';

/**
 * Empty request logger middleware - no logging
 */
export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  // Do nothing - logging disabled
  next();
}; 