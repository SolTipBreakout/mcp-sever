import { Request, Response, NextFunction } from 'express';
import { rateLimit, RateLimitRequestHandler } from 'express-rate-limit';
import { SERVER_CONFIG } from '../config/index.js';
import { AuthenticatedRequest } from './auth.js';

// Create a store for API key rate limiters
const apiKeyLimiters = new Map<string, RateLimitRequestHandler>();

/**
 * Standard rate limiter for all requests
 */
export const standardRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // Max 100 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 'error', message: 'Too many requests, please try again later' },
  skip: (req: Request) => {
    // Skip rate limiting for trusted API keys
    return false;
  }
});

/**
 * API key-based rate limiter factory
 * Creates a new rate limiter for each API key
 */
export const apiKeyRateLimit = (req: Request, res: Response, next: NextFunction) => {
  // Get API key from request
  const apiKey = (req as AuthenticatedRequest).apiKey;
  
  // No API key, use standard rate limit
  if (!apiKey) {
    standardRateLimit(req, res, next);
    return;
  }
  
  // Create a rate limiter for this API key if it doesn't exist
  if (!apiKeyLimiters.has(apiKey)) {
    apiKeyLimiters.set(
      apiKey,
      rateLimit({
        windowMs: 60 * 1000, // 1 minute
        max: 300, // 300 requests per minute for authenticated users
        standardHeaders: true,
        legacyHeaders: false,
        message: { status: 'error', message: 'API rate limit exceeded' },
        keyGenerator: () => apiKey, // Use API key as the rate limit key
      })
    );
  }
  
  // Use the API key's rate limiter
  const limiter = apiKeyLimiters.get(apiKey);
  if (limiter) {
    limiter(req, res, next);
  } else {
    // Fallback to standard rate limit if something went wrong
    standardRateLimit(req, res, next);
  }
};

/**
 * Combined rate limiter
 * Uses API key limiter for authenticated requests and standard limiter for others
 */
export const combinedRateLimit = (req: Request, res: Response, next: NextFunction) => {
  // If the request has an API key, use API key rate limiting
  if ((req as AuthenticatedRequest).apiKey) {
    apiKeyRateLimit(req, res, next);
  } else {
    // Otherwise use standard rate limiting
    standardRateLimit(req, res, next);
  }
}; 