import { Router } from 'express';
import { apiKeyAuth, optionalApiKeyAuth } from '../middleware/auth.js';
import { toolService } from '../services/tool-service.js';
import { ApiError } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';
import { mcpToolLogger } from '../middleware/mcpLogger.js';

/**
 * Router for all API endpoints
 */
export const apiRoutes: Router = Router();

// Public health check endpoint - no authentication required
apiRoutes.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'Solana MCP API',
    timestamp: new Date().toISOString()
  });
});

// Status endpoint - optional authentication (returns more details if authenticated)
apiRoutes.get('/status', optionalApiKeyAuth(), (req, res) => {
  // Basic response for unauthenticated requests
  const baseResponse = {
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  };
  
  // Add additional information for authenticated requests
  if (req.isAuthenticated) {
    res.status(200).json({
      ...baseResponse,
      environment: process.env.NODE_ENV,
      version: '1.0.0',
      serverTime: new Date().toISOString(),
      memoryUsage: process.memoryUsage(),
      authenticated: true
    });
  } else {
    res.status(200).json(baseResponse);
  }
});

// List available MCP tools
apiRoutes.get('/mcp/tools', apiKeyAuth(), mcpToolLogger, async (req, res, next) => {
  try {
    // Check if tool service is initialized
    if (!toolService.isInitialized()) {
      throw new ApiError(503, 'Tool service is not initialized');
    }
    
    // Get list of available tools
    const tools = await toolService.listTools();
    
    res.status(200).json({
      status: 'success',
      data: {
        tools
      }
    });
  } catch (error) {
    next(error);
  }
});

// MCP tool execution endpoint - requires API key authentication and parameter validation
apiRoutes.post('/mcp/tools/:toolName', 
  apiKeyAuth(),
  mcpToolLogger,
  async (req, res, next) => {
    try {
      // Check if tool service is initialized
      if (!toolService.isInitialized()) {
        throw new ApiError(503, 'Tool service is not initialized');
      }
      
      const { toolName } = req.params;
      const params = req.body;
      
      // Log the request with sensitive data filtered
      const sanitizedParams = { ...params };
      // Remove potential sensitive data from logs
      if (sanitizedParams.privateKey) sanitizedParams.privateKey = '[FILTERED]';
      if (sanitizedParams.signature) sanitizedParams.signature = '[FILTERED]';
      
      logger.info(`Tool execution request: ${toolName}`, { params: sanitizedParams });
      
      // Set timeout for long-running operations (30 seconds)
      const TIMEOUT_MS = 30000;
      let timeoutId: NodeJS.Timeout;
      
      // Create a promise that resolves with the tool result or rejects on timeout
      const executionPromise = Promise.race([
        toolService.executeTool(toolName, params),
        new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => {
            reject(new ApiError(408, `Tool execution timed out after ${TIMEOUT_MS}ms`));
          }, TIMEOUT_MS);
        })
      ]);
      
      // Execute the tool
      const result = await executionPromise;
      
      // Clear the timeout
      clearTimeout(timeoutId!);
      
      // Check if the result indicates an error
      if (result.isError) {
        const errorMessage = result.content[0]?.text || 'Tool execution failed';
        logger.error(`Tool execution error: ${toolName}`, { error: errorMessage });
        
        res.status(500).json({
          status: 'error',
          message: errorMessage,
          tool: toolName
        });
        return;
      }
      
      // Return the successful result
      res.status(200).json({
        status: 'success',
        data: {
          result,
          tool: toolName
        }
      });
    } catch (error) {
      next(error);
    }
  }
); 