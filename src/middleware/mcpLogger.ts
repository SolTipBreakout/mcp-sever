import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';

/**
 * Middleware to log MCP tool execution attempts
 */
export const mcpToolLogger = (req: Request, res: Response, next: NextFunction) => {
  // Only process POST requests to MCP tool endpoint
  if (req.method === 'POST' && req.path.endsWith('/tools')) {
    logger.info('MCP tool execution request received', {
      method: req.method,
      path: req.path,
      body: JSON.stringify(req.body),
      headers: {
        'content-type': req.headers['content-type'],
        'user-agent': req.headers['user-agent']
      }
    });
  }
  
  // Capture original send method
  const originalSend = res.send;
  
  // Override send method to log response
  res.send = function(body: any) {
    // Log the response for MCP tool executions
    if (req.method === 'POST' && req.path.endsWith('/tools')) {
      let responseBody;
      try {
        // Try to parse the response body
        responseBody = typeof body === 'string' ? JSON.parse(body) : body;
      } catch (error) {
        responseBody = body;
      }
      
      logger.info('MCP tool execution response', {
        status: res.statusCode,
        responseBody
      });
    }
    
    // Call the original send method
    return originalSend.call(this, body);
  };
  
  next();
}; 