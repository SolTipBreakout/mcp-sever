import { Request, Response, NextFunction } from 'express';

/**
 * Custom error class with HTTP status code
 */
export class ApiError extends Error {
  statusCode: number;
  data?: unknown;
  
  constructor(statusCode: number, message: string, data?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.data = data;
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Global error handling middleware
 */
export const errorHandler = (
  err: Error | ApiError,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
) => {
  // Set default status code and message
  let statusCode = 500;
  let message = 'Internal Server Error';
  let errorData: unknown = undefined;
  
  // If this is our custom ApiError, use its status code and message
  if (err instanceof ApiError) {
    statusCode = err.statusCode;
    message = err.message;
    errorData = err.data;
  } else if (err.name === 'ValidationError') {
    // Handle validation errors
    statusCode = 400;
    message = err.message;
  }
  
  // Prepare response object
  const responseObj: Record<string, unknown> = {
    status: 'error',
    statusCode,
    message
  };
  
  // Add error data if available
  if (errorData !== undefined) {
    responseObj.data = errorData;
  }
  
  // Add stack trace in development
  if (process.env.NODE_ENV === 'development' && err.stack) {
    responseObj.stack = err.stack;
  }
  
  // Send response
  res.status(statusCode).json(responseObj);
}; 