# MCP Tools API Documentation

This document describes how to use the MCP Tools API endpoints.

## Overview

The Solana MCP HTTP API provides endpoints for executing MCP (Model Context Protocol) tools. These endpoints allow clients to:

1. List available MCP tools
2. Execute specific MCP tools with parameters
3. Handle tool execution results

All tool endpoints require API key authentication. See [Authentication](./authentication.md) for details.

## Endpoints

### List Available Tools

**GET /api/mcp/tools**

Returns a list of all available MCP tools with their names and descriptions.

**Response**

```json
{
  "status": "success",
  "data": {
    "tools": [
      {
        "name": "getBalance",
        "description": "Get SOL balance for a Solana wallet address"
      },
      {
        "name": "getTransaction",
        "description": "Get details for a Solana transaction by signature"
      },
      {
        "name": "networkStatus",
        "description": "Get Solana network status information"
      }
    ]
  }
}
```

### Execute MCP Tool

**POST /api/mcp/tools/{toolName}**

Executes the specified MCP tool with the provided parameters.

**Path Parameters**
- `toolName` (required): Name of the MCP tool to execute

**Request Body**

The request body must contain the required parameters for the specific tool. Each tool has its own parameter requirements:

**Example: getBalance**
```json
{
  "walletAddress": "3Yv9pCWhSQpTBQv8Huhe8NuT2oKAUkEGSamBXfWPyM4q"
}
```

**Example: getTransaction**
```json
{
  "signature": "4RPVGt6Y5fqtJue2EPnajRNwvjxvK1JeRZpfkV3a5xnPQZpg6TwzF17AvQMRFmKEZ3UfNVgUNBqnvjxcL3tpSvh8"
}
```

**Responses**

**Success (200 OK)**

```json
{
  "status": "success",
  "data": {
    "result": {
      "content": [
        {
          "type": "text",
          "text": "Balance for 3Yv9pCWhSQpTBQv8Huhe8NuT2oKAUkEGSamBXfWPyM4q: 2.5 SOL (2500000000 lamports)"
        }
      ]
    }
  }
}
```

**Tool Error (500 Internal Server Error)**

```json
{
  "status": "error",
  "message": "Error executing tool getBalance: Invalid wallet address format"
}
```

**Validation Error (400 Bad Request)**

```json
{
  "status": "error",
  "statusCode": 400,
  "message": "Invalid tool parameters",
  "data": {
    "errors": [
      {
        "path": "walletAddress",
        "message": "Wallet address must be at least 32 characters"
      }
    ]
  }
}
```

**Tool Not Found (404 Not Found)**

```json
{
  "status": "error",
  "statusCode": 404,
  "message": "Unknown tool: nonExistentTool"
}
```

**Timeout (408 Request Timeout)**

```json
{
  "status": "error",
  "statusCode": 408,
  "message": "Tool execution timed out after 30000ms"
}
```

## Available Tools

### getBalance

Get the SOL balance for a Solana wallet address.

**Parameters**
- `walletAddress` (string, required): Solana wallet address (base58 encoded)

**Example Request**
```bash
curl -X POST "https://your-api-host.com/api/mcp/tools/getBalance" \
  -H "x-api-key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"walletAddress": "3Yv9pCWhSQpTBQv8Huhe8NuT2oKAUkEGSamBXfWPyM4q"}'
```

### getTransaction

Get details for a Solana transaction by signature.

**Parameters**
- `signature` (string, required): Transaction signature (base58 encoded)

**Example Request**
```bash
curl -X POST "https://your-api-host.com/api/mcp/tools/getTransaction" \
  -H "x-api-key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"signature": "4RPVGt6Y5fqtJue2EPnajRNwvjxvK1JeRZpfkV3a5xnPQZpg6TwzF17AvQMRFmKEZ3UfNVgUNBqnvjxcL3tpSvh8"}'
```

### networkStatus

Get Solana network status information (no parameters required).

**Example Request**
```bash
curl -X POST "https://your-api-host.com/api/mcp/tools/networkStatus" \
  -H "x-api-key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{}'
```

## Handling Long-Running Operations

Tool execution requests have a timeout of 30 seconds. If a tool takes longer than this to execute, the request will time out with a 408 status code. For tools that may take longer, consider implementing a different mechanism such as:

1. Returning a job ID and providing a separate endpoint to check job status
2. Using webhooks to notify clients when a long-running operation completes
3. Implementing server-sent events or WebSockets for real-time updates

## Error Handling

The API returns appropriate HTTP status codes and error messages:

- **400 Bad Request**: Invalid parameters or validation errors
- **401 Unauthorized**: Missing API key
- **403 Forbidden**: Invalid API key
- **404 Not Found**: Unknown tool
- **408 Request Timeout**: Tool execution exceeded timeout limit
- **500 Internal Server Error**: Tool execution failed
- **503 Service Unavailable**: Tool service not initialized

Error responses include a clear message and, where applicable, additional error details to help clients understand what went wrong. 