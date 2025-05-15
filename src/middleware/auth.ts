import { Request, Response, NextFunction } from 'express';
import { ApiError } from './errorHandler.js';
import { AUTH_CONFIG } from '../config/index.js';

// Define authentication configuration interface
interface AuthConfig {
  apiKeys: string[];
  headerName: string;
  enabled: boolean;
}

/**
 * Get authentication configuration 
 */
export const getAuthConfig = (): AuthConfig => {
  return AUTH_CONFIG;
};

// Add this interface definition for authenticated requests
export interface AuthenticatedRequest extends Request {
  apiKey?: string;
  isAuthenticated?: boolean;
}

/**
 * Create API key validation middleware
 * 
 * @returns Express middleware function for API key validation
 */
export const apiKeyAuth = () => {
  const config = getAuthConfig();
  
  // If authentication is disabled, skip validation
  if (!config.enabled) {
    return (req: Request, res: Response, next: NextFunction) => next();
  }
  
  if (config.apiKeys.length === 0) {
  }
  
  // Return middleware function that validates API key
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Extract API key from header
      const apiKey = req.get(config.headerName);
      
      // If no API key provided
      if (!apiKey) {
        throw new ApiError(401, 'API key is required');
      }
      
      // Validate the API key against allowed keys
      if (!config.apiKeys.includes(apiKey)) {
        throw new ApiError(403, 'Invalid API key');
      }
      
      // Store the API key on the request object
      (req as AuthenticatedRequest).apiKey = apiKey;
      
      // API key is valid, proceed to next middleware
      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Optional API key authentication middleware - only validates if key is provided
 * This is useful for routes that can be accessed with or without authentication
 * (e.g., public routes with rate limiting for unauthenticated requests)
 */
export const optionalApiKeyAuth = () => {
  const config = getAuthConfig();
  
  // If authentication is disabled, skip validation
  if (!config.enabled) {
    return (req: Request, res: Response, next: NextFunction) => next();
  }
  
  // Return middleware function that validates API key if provided
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Extract API key from header
      const apiKey = req.get(config.headerName);
      
      // If no API key provided, proceed as unauthenticated
      if (!apiKey) {
        // Add flag to request to indicate unauthenticated
        req.isAuthenticated = false;
        return next();
      }
      
      // Validate the API key against allowed keys
      if (!config.apiKeys.includes(apiKey)) {
        // Add flag to request to indicate unauthenticated (invalid key)
        req.isAuthenticated = false;
        return next();
      }
      
      // Store the API key on the request object
      (req as AuthenticatedRequest).apiKey = apiKey;
      
      // API key is valid, mark as authenticated
      req.isAuthenticated = true;
      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Middleware to require a valid API key
 * Use this directly in routes that require authentication
 */
export const requireApiKey = (req: Request, res: Response, next: NextFunction) => {
  try {
    const config = getAuthConfig();
    
    // Skip validation if auth is disabled
    if (!config.enabled) {
      return next();
    }
    
    // Extract API key from header
    const apiKey = req.get(config.headerName);
    
    // If no API key provided
    if (!apiKey) {
      throw new ApiError(401, 'API key is required');
    }
    
    // Validate the API key against allowed keys
    if (!config.apiKeys.includes(apiKey)) {
      throw new ApiError(403, 'Invalid API key');
    }
    
    // Store the API key on the request object
    (req as AuthenticatedRequest).apiKey = apiKey;
    (req as AuthenticatedRequest).isAuthenticated = true;
    
    // API key is valid, proceed to next middleware
    next();
  } catch (error) {
    next(error);
  }
};

// Extend Express Request interface to include authentication property
declare global {
  namespace Express {
    interface Request {
      isAuthenticated?: boolean;
    }
  }
} 