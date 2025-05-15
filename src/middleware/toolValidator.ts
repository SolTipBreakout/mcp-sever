import { Request, Response, NextFunction } from 'express';
import { ApiError } from './errorHandler.js';
import { Schema } from 'joi';

// Registry of tool validation schemas
const toolSchemas: Map<string, Schema> = new Map();

/**
 * Middleware to validate tool request parameters against a schema
 */
export const toolParamValidator = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Extract the toolName from the request body
    const { toolName, params } = req.body;
    
    if (!toolName) {
      throw new ApiError(400, 'Tool name is required');
    }

    // Check if we have a validation schema for this tool
    const schema = toolSchemas.get(toolName);
    
    // If no schema exists, skip validation but continue
    if (!schema) {
      throw new ApiError(400, `Unknown tool: ${toolName}`);
    }
    
    // Validate the parameters against the schema
    const { error } = schema.validate(params, { 
      abortEarly: false, 
      allowUnknown: true 
    });
    
    // If validation fails, throw an error
    if (error) {
      const errors = error.details.map(detail => detail.message);
      throw new ApiError(400, 'Invalid tool parameters', { errors });
    }
    
    // Validation succeeded, continue to the next middleware
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Register a validation schema for a tool
 */
export const registerToolSchema = (toolName: string, schema: Schema): void => {
  toolSchemas.set(toolName, schema);
};

// Extend ApiError to include additional error data
declare module './errorHandler.js' {
  interface ApiError {
    data?: unknown;
  }
} 